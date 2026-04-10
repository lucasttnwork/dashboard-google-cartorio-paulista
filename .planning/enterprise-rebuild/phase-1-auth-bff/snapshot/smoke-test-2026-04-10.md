# Smoke Test — 2026-04-10

End-to-end validation against Supabase prod (`bugpetfkyoraidyxmzxu`).

## Test Results

| # | Test | Result |
|---|---|---|
| 1 | Login with valid admin credentials | 200 — access_token + refresh_token returned |
| 2 | JWT decode with HS256 secret | OK — sub, email, aud=authenticated, iss correct, exp_in=3600 |
| 3 | user_profiles role lookup (service_role) | role=admin, disabled_at=null |
| 4 | Login with wrong password | HTTP 400 (invalid_grant) |
| 5 | Logout (revoke session) | HTTP 204 |
| 6 | GET /user with revoked token | HTTP 403 |

## Environment

- Supabase project: `bugpetfkyoraidyxmzxu` (South America, Sao Paulo)
- Auth endpoint: `https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1/*`
- JWT signing: HS256 (legacy, JWKS returns `{"keys":[]}`)
- Fallback: `supabase_jwt_hs_secret` configured in backend/.env.local
- Admin user_id: `8b7e91a7-3aba-4f28-aa2f-99eb192b47a9`

## JWT Claims Validated

```json
{
  "sub": "8b7e91a7-...",
  "email": "admin@cartoriopaulista.com.br",
  "aud": "authenticated",
  "iss": "https://bugpetfkyoraidyxmzxu.supabase.co/auth/v1",
  "role": "authenticated",
  "exp_in": 3600
}
```

## Notes

- JWKS endpoint still returns empty keys (HS256 legacy). Backend uses
  `supabase_jwt_hs_secret` fallback for token validation.
- Supabase gotrue returns HTTP 400 (not 401) for invalid credentials —
  backend maps this to 401 in the BFF relay.
- Session revocation works: POST /logout returns 204, subsequent
  GET /user with the same token returns 403.
- Rate limiting tested at the BFF layer (not directly against gotrue)
  — covered by 80 backend pytest cases.
