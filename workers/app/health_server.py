from __future__ import annotations

import asyncio

from aiohttp import web

_VERSION = "0.0.1"


async def _health(_request: web.Request) -> web.Response:
    return web.json_response(
        {"status": "ok", "service": "workers", "version": _VERSION}
    )


def build_app() -> web.Application:
    """Build the minimal aiohttp app exposing ``GET /health``."""

    app = web.Application()
    app.router.add_get("/health", _health)
    return app


async def run(port: int) -> None:
    """Start the health HTTP server and block forever.

    Uses ``aiohttp.web.AppRunner`` + ``TCPSite`` so the server can share
    the event loop with the arq worker instead of taking ownership of it
    (which ``web.run_app`` would do).
    """

    app = build_app()
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()

    # Block forever; the outer ``asyncio.gather`` in ``app.main`` keeps
    # this task alive until the process is terminated or the sibling
    # worker coroutine raises.
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
