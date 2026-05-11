from __future__ import annotations

import atexit
import json
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

    if request.path == "/webhooks/rest/webhook":
        try:

            await request.receive_body()
            payload = {}
            if request.body:
                try:
                    parsed = json.loads(request.body.decode("utf-8"))
                    if isinstance(parsed, dict):
                        payload = parsed
                except Exception:
                    payload = {}
            sender = str(payload.get("sender", "usuario"))
            message = str(payload.get("message", ""))
            clean_payload = {"sender": sender, "message": message}

            upstream = urllib.request.Request(
                f"{base}/webhooks/rest/webhook",
                data=json.dumps(clean_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(upstream, timeout=60) as resp:
                    status = int(getattr(resp, "status", 200))
                    raw = resp.read()
                    headers = {"Content-Type": resp.headers.get("Content-Type", "application/json")}
                    return response.raw(raw, status=status, headers=headers)
            except urllib.error.HTTPError as e:
                body = b""
                try:
                    body = e.read()
                except Exception:
                    body = b""

                if int(e.code) >= 500:
                    return response.json(
                        [
                            {
                                "recipient_id": "bot",
                                "text": "Estoy presentando una intermitencia temporal. intenta nuevamente en unos segundos.",
                            }
                        ],
                        status=200,
                    )
                headers = {"Content-Type": "application/json"}
                return response.raw(body, status=int(e.code), headers=headers)
        except Exception as e:
            return response.json(
                {"error": "Rasa no disponible (upstream)", "detail": str(e)},
                status=502,
            )

    hdrs = {}
    for k, v in request.headers.items():
        if k.lower() in _SKIP_REQ_HEADERS:
            continue
        hdrs[k] = v

    parsed = urlparse(base)
    if parsed.netloc:
        hdrs["Host"] = parsed.netloc.split("@")[-1]

    await request.receive_body()
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

        app.run(host=host, port=port)
    finally:

        _kill_rasa_child()
