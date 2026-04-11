"""
Railway / un solo puerto público (PORT):
1) Opcional: arranca `rasa run` en un puerto interno (RASA_SPAWN_INTERNAL=1, por defecto).
2) Sanic sirve /admin/* (rasa_admin_server) y hace proxy del resto a Rasa.

Variables:
  PORT                  — puerto público (Railway)
  RASA_SPAWN_INTERNAL   — "1" (defecto) para lanzar Rasa en segundo plano; "0" si ya corre aparte
  RASA_INTERNAL_PORT    — defecto 5006
  RASA_INTERNAL_URL     — si RASA_SPAWN_INTERNAL=0, URL de Rasa (ej. http://127.0.0.1:5006)
  RASA_PROJECT_ROOT     — carpeta del proyecto Rasa
"""
from __future__ import annotations

import atexit
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
from sanic import response

from rasa_admin_server import app

_SKIP_REQ_HEADERS = frozenset(
    {"host", "connection", "content-length", "transfer-encoding", "te", "trailer"}
)
_SKIP_RESP_HEADERS = frozenset(
    {"transfer-encoding", "connection", "content-encoding", "keep-alive"}
)

_rasa_proc: subprocess.Popen | None = None


def _internal_url() -> str:
    return os.environ.get("RASA_INTERNAL_URL", "http://127.0.0.1:5006").rstrip("/")


def _spawn_rasa() -> None:
    global _rasa_proc
    port = os.environ.get("RASA_INTERNAL_PORT", "5006")
    root = os.environ.get("RASA_PROJECT_ROOT", str(Path(__file__).resolve().parent))
    os.environ["RASA_INTERNAL_URL"] = f"http://127.0.0.1:{port}"
    _rasa_proc = subprocess.Popen(
        ["rasa", "run", "--enable-api", "--cors", "*", "--port", port],
        cwd=root,
    )
    base = os.environ["RASA_INTERNAL_URL"]
    for _ in range(90):
        try:
            urllib.request.urlopen(f"{base}/version", timeout=3)
            return
        except (urllib.error.URLError, OSError):
            time.sleep(1)
    if _rasa_proc.poll() is not None:
        raise RuntimeError("Rasa terminó antes de estar listo; revisa los logs.")
    raise RuntimeError("Rasa no respondió en /version a tiempo.")


def _kill_rasa_child() -> None:
    global _rasa_proc
    if _rasa_proc is not None and _rasa_proc.poll() is None:
        _rasa_proc.terminate()
        try:
            _rasa_proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            _rasa_proc.kill()


@app.listener("before_server_start")
async def _open_http(app, loop):
    app.ctx.http = aiohttp.ClientSession()


@app.listener("after_server_stop")
async def _close_http(app, loop):
    await app.ctx.http.close()


@app.middleware("request")
async def _proxy_to_rasa(request):
    if request.path.startswith("/admin"):
        return

    base = _internal_url()
    url = f"{base}{request.path}"
    if request.query_string:
        url += "?" + request.query_string

    hdrs = {}
    for k, v in request.headers.items():
        if k.lower() in _SKIP_REQ_HEADERS:
            continue
        hdrs[k] = v
    parsed = urlparse(base)
    if parsed.netloc:
        hdrs["Host"] = parsed.netloc.split("@")[-1]

    body = request.body
    session = request.app.ctx.http
    try:
        async with session.request(
            request.method,
            url,
            data=body if body else None,
            headers=hdrs,
            timeout=aiohttp.ClientTimeout(total=300),
        ) as resp:
            raw = await resp.read()
            out_h = {}
            for k, v in resp.headers.items():
                if k.lower() in _SKIP_RESP_HEADERS:
                    continue
                out_h[k] = v
            return response.raw(raw, status=resp.status, headers=out_h)
    except aiohttp.ClientError as e:
        return response.json(
            {"error": "Rasa no disponible (upstream)", "detail": str(e)},
            status=502,
        )


if __name__ == "__main__":
    if os.environ.get("RASA_SPAWN_INTERNAL", "1") == "1":
        _spawn_rasa()
        atexit.register(_kill_rasa_child)

    port = int(os.environ["PORT"])
    host = os.environ.get("RASA_ADMIN_HOST", "0.0.0.0")
    try:
        # Sanic 21 (Rasa 3.6): no usar single_process= (no existe en esta versión).
        app.run(host=host, port=port)
    finally:
        _kill_rasa_child()
