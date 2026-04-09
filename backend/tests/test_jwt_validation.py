"""Unit tests for app.core.security JWT validation.

Uses an ephemeral RSA key-pair (generated once per session) and a fake
PyJWKClient to avoid any real network calls.

pytest-asyncio is configured in auto mode (pyproject.toml).
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

import app.core.security as security_module
from app.core.config import settings
from app.core.security import (
    AccessTokenClaims,
    JWTExpiredError,
    JWTValidationError,
    verify_access_token,
)

# ---------------------------------------------------------------------------
# Constants shared across tests
# ---------------------------------------------------------------------------

ISSUER = "https://example.supabase.co/auth/v1"
AUDIENCE = "authenticated"
TEST_SUPABASE_URL = "https://example.supabase.co"


# ---------------------------------------------------------------------------
# Session-scoped RSA key pair fixture
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def rsa_private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )


@pytest.fixture(scope="session")
def rsa_public_key(rsa_private_key: rsa.RSAPrivateKey) -> rsa.RSAPublicKey:
    return rsa_private_key.public_key()


# ---------------------------------------------------------------------------
# Helper: build a JWT with the ephemeral private key
# ---------------------------------------------------------------------------


def _make_token(
    private_key: rsa.RSAPrivateKey,
    *,
    sub: str | None = None,
    aud: str = AUDIENCE,
    iss: str = ISSUER,
    exp_offset: int = 3600,
    algorithm: str = "RS256",
    extra: dict | None = None,
) -> str:
    now = int(time.time())
    payload: dict = {
        "iat": now,
        "exp": now + exp_offset,
        "aud": aud,
        "iss": iss,
        "email": "test@example.com",
        "app_metadata": {"role": "user"},
        "session_id": "sess-abc",
    }
    if sub is not None:
        payload["sub"] = sub
    if extra:
        payload.update(extra)

    # For HS256 tests, private_key is actually the bytes/str secret.
    return jwt.encode(payload, private_key, algorithm=algorithm)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Fake JWKS client factory
# ---------------------------------------------------------------------------


def _make_fake_jwks_client(public_key: rsa.RSAPublicKey) -> MagicMock:
    """Return a mock that mimics jwt.PyJWKClient."""
    signing_key = MagicMock()
    signing_key.key = public_key

    client = MagicMock(spec=jwt.PyJWKClient)
    client.get_signing_key_from_jwt.return_value = signing_key
    client.get_signing_keys.return_value = [signing_key]
    return client


# ---------------------------------------------------------------------------
# Per-test fixtures: patch settings + _get_jwks_client
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def patch_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure settings fields point to our test values for every test."""
    monkeypatch.setattr(settings, "supabase_url", TEST_SUPABASE_URL)
    # Clear the custom-override fields so the computed properties kick in.
    monkeypatch.setattr(settings, "supabase_jwks_url", "")
    monkeypatch.setattr(settings, "supabase_jwt_issuer", "")
    monkeypatch.setattr(settings, "supabase_jwt_audience", AUDIENCE)
    monkeypatch.setattr(settings, "supabase_jwt_algorithms", ["RS256", "ES256"])
    monkeypatch.setattr(settings, "supabase_jwt_hs_secret", "")
    monkeypatch.setattr(settings, "supabase_jwt_leeway_seconds", 0)
    # Reset module-level singletons so each test gets a fresh client slot.
    monkeypatch.setattr(security_module, "_jwks_client", None)
    monkeypatch.setattr(security_module, "_jwks_lock", None)


@pytest.fixture()
def patch_jwks_client(
    monkeypatch: pytest.MonkeyPatch,
    rsa_public_key: rsa.RSAPublicKey,
) -> None:
    """Replace _get_jwks_client() with one that returns our fake."""
    fake = _make_fake_jwks_client(rsa_public_key)
    monkeypatch.setattr(security_module, "_get_jwks_client", lambda: fake)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_valid_rs256_token_happy_path(
    patch_jwks_client: None,
    rsa_private_key: rsa.RSAPrivateKey,
) -> None:
    """Good RS256 token → AccessTokenClaims with correct fields."""
    sub = str(uuid4())
    token = _make_token(rsa_private_key, sub=sub)

    claims = await verify_access_token(token)

    assert isinstance(claims, AccessTokenClaims)
    assert str(claims.sub) == sub
    assert claims.aud == AUDIENCE
    assert claims.iss == ISSUER
    assert claims.email == "test@example.com"
    assert claims.app_metadata == {"role": "user"}
    assert claims.session_id == "sess-abc"
    assert claims.exp > int(time.time())


async def test_expired_token_raises_jwt_expired_error(
    patch_jwks_client: None,
    rsa_private_key: rsa.RSAPrivateKey,
) -> None:
    """Token with exp in the past → JWTExpiredError (specific subclass)."""
    sub = str(uuid4())
    # exp_offset=-10 → already expired 10 s ago; leeway=0 in patch_settings
    token = _make_token(rsa_private_key, sub=sub, exp_offset=-10)

    with pytest.raises(JWTExpiredError):
        await verify_access_token(token)


async def test_wrong_audience_raises_jwt_validation_error(
    monkeypatch: pytest.MonkeyPatch,
    patch_jwks_client: None,
    rsa_private_key: rsa.RSAPrivateKey,
) -> None:
    """Token with aud='anon' while settings expects 'authenticated' → JWTValidationError."""
    sub = str(uuid4())
    token = _make_token(rsa_private_key, sub=sub, aud="anon")

    with pytest.raises(JWTValidationError) as exc_info:
        await verify_access_token(token)

    # Must NOT be the expired subclass — it's a generic validation failure.
    assert not isinstance(exc_info.value, JWTExpiredError)


async def test_wrong_issuer_raises_jwt_validation_error(
    patch_jwks_client: None,
    rsa_private_key: rsa.RSAPrivateKey,
) -> None:
    """Token signed with a different issuer → JWTValidationError."""
    sub = str(uuid4())
    token = _make_token(
        rsa_private_key, sub=sub, iss="https://evil.supabase.co/auth/v1"
    )

    with pytest.raises(JWTValidationError) as exc_info:
        await verify_access_token(token)
    assert not isinstance(exc_info.value, JWTExpiredError)


async def test_unsupported_algorithm_raises_jwt_validation_error(
    monkeypatch: pytest.MonkeyPatch,
    rsa_private_key: rsa.RSAPrivateKey,
    rsa_public_key: rsa.RSAPublicKey,
) -> None:
    """Token signed with HS256 while only RS256 is allowed → JWTValidationError.

    We sign with an HS256 secret, but the fake client still returns the RSA
    public key — so the decode will fail because the algorithms list (RS256
    only) does not permit HS256.
    """
    # Only RS256 allowed, no HS256 secret configured.
    monkeypatch.setattr(settings, "supabase_jwt_algorithms", ["RS256"])
    monkeypatch.setattr(settings, "supabase_jwt_hs_secret", "")

    fake = _make_fake_jwks_client(rsa_public_key)
    # get_signing_key_from_jwt will raise when alg is HS256 (not an asymmetric key)
    fake.get_signing_key_from_jwt.side_effect = jwt.exceptions.PyJWKClientError(
        "Unable to find a signing key"
    )
    monkeypatch.setattr(security_module, "_get_jwks_client", lambda: fake)

    hs_secret = "some-random-hs256-secret"
    sub = str(uuid4())
    token = _make_token(hs_secret, sub=sub, algorithm="HS256")  # type: ignore[arg-type]

    with pytest.raises(JWTValidationError) as exc_info:
        await verify_access_token(token)
    assert not isinstance(exc_info.value, JWTExpiredError)


async def test_missing_sub_claim_raises_jwt_validation_error(
    monkeypatch: pytest.MonkeyPatch,
    rsa_private_key: rsa.RSAPrivateKey,
    rsa_public_key: rsa.RSAPublicKey,
) -> None:
    """Token without 'sub' claim → JWTValidationError."""
    # Build token with no sub; pyjwt won't complain unless options force it.
    token = _make_token(rsa_private_key, sub=None)

    fake = _make_fake_jwks_client(rsa_public_key)
    monkeypatch.setattr(security_module, "_get_jwks_client", lambda: fake)

    with pytest.raises(JWTValidationError) as exc_info:
        await verify_access_token(token)
    assert not isinstance(exc_info.value, JWTExpiredError)


async def test_invalid_sub_uuid_raises_jwt_validation_error(
    monkeypatch: pytest.MonkeyPatch,
    rsa_private_key: rsa.RSAPrivateKey,
    rsa_public_key: rsa.RSAPublicKey,
) -> None:
    """Token with sub='not-a-uuid' → JWTValidationError on UUID parsing."""
    token = _make_token(rsa_private_key, sub="not-a-uuid")

    fake = _make_fake_jwks_client(rsa_public_key)
    monkeypatch.setattr(security_module, "_get_jwks_client", lambda: fake)

    with pytest.raises(JWTValidationError) as exc_info:
        await verify_access_token(token)
    assert "invalid_sub_uuid" in str(exc_info.value)
