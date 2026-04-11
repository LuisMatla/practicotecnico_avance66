"""
API HTTP para administrar training data de Rasa (nlu, domain, rules, stories).
Despliegue: proxy /admin/api/ hacia este servicio (mismo host que el webhook, p. ej. rasa.bitbot.xyz).

Variables de entorno:
  RASA_API_KEY          — obligatoria en producción; header X-Rasa-Auth o Authorization: Bearer
  RASA_PROJECT_ROOT     — carpeta del proyecto Rasa (contiene domain.yml y data/)
  RASA_ADMIN_HOST       — default 0.0.0.0
  RASA_ADMIN_PORT       — default 8765
  RASA_ADMIN_NO_DELETE  — intenciones que no se pueden borrar (coma), default: nlu_fallback
  RASA_ADMIN_AUTO_TRAIN  — si es "1", ejecuta `rasa train` en segundo plano tras cada cambio
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from sanic import Sanic, response
from sanic.request import Request

app = Sanic("rasa_admin")

ROOT = Path(os.environ.get("RASA_PROJECT_ROOT", Path(__file__).resolve().parent))
NLU_PATH = ROOT / "data" / "nlu.yml"
DOMAIN_PATH = ROOT / "domain.yml"
RULES_PATH = ROOT / "data" / "rules.yml"
STORIES_PATH = ROOT / "data" / "stories.yml"

INTENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, dict) else {}


def _save_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write('version: "3.1"\n\n')
        rest = {k: v for k, v in data.items() if k != "version"}
        yaml.safe_dump(
            rest,
            f,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
            width=120,
        )


def _parse_nlu_examples(examples_field: Any) -> list[str]:
    if examples_field is None:
        return []
    if isinstance(examples_field, list):
        return [str(x) for x in examples_field]
    text = str(examples_field).strip()
    out: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("- "):
            out.append(line[2:].strip())
    return out


def _examples_block(ejemplos: list[str]) -> str:
    return "\n".join(f"    - {e}" for e in ejemplos)


def parse_nlu_catalog(nlu_data: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for block in nlu_data.get("nlu") or []:
        if not isinstance(block, dict):
            continue
        intent = block.get("intent")
        if not intent:
            continue
        samples = _parse_nlu_examples(block.get("examples"))
        rows.append(
            {
                "intent": intent,
                "exampleCount": len(samples),
                "samples": samples[:12],
            }
        )
    return rows


def parse_responses_catalog(domain_data: dict[str, Any]) -> list[dict[str, Any]]:
    responses = domain_data.get("responses") or {}
    out: list[dict[str, Any]] = []
    for utter, variants in responses.items():
        if not str(utter).startswith("utter_"):
            continue
        texts: list[str] = []
        for v in variants or []:
            if isinstance(v, dict) and v.get("text") is not None:
                texts.append(str(v["text"]))
        preview = (texts[0] if texts else "")[:220]
        out.append({"utter": utter, "variantCount": len(texts), "preview": preview})
    out.sort(key=lambda x: x["utter"])
    return out


def parse_rules_catalog(rules_data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rule in rules_data.get("rules") or []:
        if not isinstance(rule, dict):
            continue
        title = rule.get("rule", "")
        intent = None
        action = None
        for step in rule.get("steps") or []:
            if isinstance(step, dict):
                if "intent" in step:
                    intent = step.get("intent")
                if "action" in step:
                    action = step.get("action")
        if intent:
            out.append({"title": title, "intent": intent, "action": action})
    return out


def parse_stories_catalog(stories_data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for story in stories_data.get("stories") or []:
        if not isinstance(story, dict):
            continue
        title = story.get("story", "")
        intent = None
        action = None
        for step in story.get("steps") or []:
            if isinstance(step, dict):
                if "intent" in step:
                    intent = step.get("intent")
                if "action" in step:
                    action = step.get("action")
        if intent:
            out.append({"title": title, "intent": intent, "action": action})
    return out


def build_catalog() -> dict[str, Any]:
    domain = _load_yaml(DOMAIN_PATH)
    nlu = _load_yaml(NLU_PATH)
    rules = _load_yaml(RULES_PATH)
    stories = _load_yaml(STORIES_PATH)
    intents = list(domain.get("intents") or [])
    custom_actions = list(domain.get("actions") or [])
    def _rel(p: Path) -> str:
        try:
            return str(p.relative_to(ROOT))
        except ValueError:
            return str(p)

    meta = {
        "generado": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "fuentes": [_rel(DOMAIN_PATH), _rel(NLU_PATH), _rel(RULES_PATH), _rel(STORIES_PATH)],
    }
    return {
        "meta": meta,
        "intents": intents,
        "customActions": custom_actions,
        "responses": parse_responses_catalog(domain),
        "nlu": parse_nlu_catalog(nlu),
        "rules": parse_rules_catalog(rules),
        "stories": parse_stories_catalog(stories),
    }


def _get_api_key() -> str | None:
    return os.environ.get("RASA_API_KEY") or os.environ.get("REACT_APP_RASA_API_KEY")


def _check_auth(request: Request) -> bool:
    key = _get_api_key()
    if not key:
        return True
    h = request.headers.get("X-Rasa-Auth") or ""
    auth = request.headers.get("Authorization") or ""
    if h == key:
        return True
    if auth.startswith("Bearer "):
        return auth[7:].strip() == key
    return False


@app.middleware("response")
async def cors(_, resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Rasa-Auth"
    resp.headers["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS"


@app.options("/admin/api/<path:_>")
async def preflight(_request, path):
    return response.text("", status=204)


def _forbidden():
    return response.json({"ok": False, "error": "No autorizado"}, status=401)


def _bad(msg: str, status=400):
    return response.json({"ok": False, "error": msg}, status=status)


def _protected_delete() -> set[str]:
    raw = os.environ.get("RASA_ADMIN_NO_DELETE", "nlu_fallback")
    return {x.strip() for x in raw.split(",") if x.strip()}


def remove_intent_everywhere(intent: str) -> None:
    nlu_data = _load_yaml(NLU_PATH)
    nlu_data["nlu"] = [
        b
        for b in (nlu_data.get("nlu") or [])
        if not (isinstance(b, dict) and b.get("intent") == intent)
    ]
    _save_yaml(NLU_PATH, nlu_data)

    domain = _load_yaml(DOMAIN_PATH)
    intents = [i for i in (domain.get("intents") or []) if i != intent]
    domain["intents"] = intents
    utter = f"utter_{intent}"
    responses = dict(domain.get("responses") or {})
    responses.pop(utter, None)
    domain["responses"] = responses

    acciones = list(domain.get("actions") or [])
    # quitar acción custom homónima si existiera
    cand = f"action_{intent}"
    if cand in acciones:
        acciones = [a for a in acciones if a != cand]
    domain["actions"] = acciones
    _save_yaml(DOMAIN_PATH, domain)

    rules_data = _load_yaml(RULES_PATH)

    def rule_keeps(r: dict) -> bool:
        for step in r.get("steps") or []:
            if isinstance(step, dict) and step.get("intent") == intent:
                return False
        return True

    rules_data["rules"] = [r for r in (rules_data.get("rules") or []) if isinstance(r, dict) and rule_keeps(r)]
    _save_yaml(RULES_PATH, rules_data)

    stories_data = _load_yaml(STORIES_PATH)

    def story_keeps(s: dict) -> bool:
        for step in s.get("steps") or []:
            if isinstance(step, dict) and step.get("intent") == intent:
                return False
        return True

    stories_data["stories"] = [
        s for s in (stories_data.get("stories") or []) if isinstance(s, dict) and story_keeps(s)
    ]
    _save_yaml(STORIES_PATH, stories_data)


def _normalize_ejemplos(body: dict[str, Any]) -> list[str]:
    ejemplos = body.get("ejemplos")
    if isinstance(ejemplos, str):
        return [x.strip() for x in ejemplos.split("\n") if x.strip()]
    if isinstance(ejemplos, list):
        return [str(x).strip() for x in ejemplos if str(x).strip()]
    return []


def update_intent_protected(intent: str, body: dict[str, Any]) -> tuple[bool, str]:
    """Actualiza NLU (y utter en domain si existe) sin borrar reglas/historias — intenciones protegidas."""
    ejemplos = _normalize_ejemplos(body)
    if not ejemplos:
        return False, "Se requiere al menos un ejemplo NLU."
    respuesta = (body.get("respuesta") or "").strip()

    nlu_data = _load_yaml(NLU_PATH)
    blocks = list(nlu_data.get("nlu") or [])
    idx = next(
        (i for i, b in enumerate(blocks) if isinstance(b, dict) and b.get("intent") == intent),
        None,
    )
    new_block = {"intent": intent, "examples": _examples_block(ejemplos)}
    if idx is not None:
        blocks[idx] = new_block
    else:
        blocks.append(new_block)
    nlu_data["nlu"] = blocks
    _save_yaml(NLU_PATH, nlu_data)

    utter = f"utter_{intent}"
    if respuesta:
        domain = _load_yaml(DOMAIN_PATH)
        responses = dict(domain.get("responses") or {})
        if utter in responses:
            textos = [t.strip() for t in respuesta.split("\n\n") if t.strip()] or [respuesta]
            responses[utter] = [{"text": t} for t in textos]
            domain["responses"] = responses
            _save_yaml(DOMAIN_PATH, domain)
    return True, ""


def add_intent_from_payload(body: dict[str, Any]) -> tuple[bool, str]:
    intent = (body.get("intent") or "").strip()
    ejemplos = _normalize_ejemplos(body)
    respuesta = (body.get("respuesta") or "").strip()
    regla_titulo = (body.get("reglaTitulo") or "").strip() or f"Regla {intent}"
    historia_titulo = (body.get("historiaTitulo") or "").strip() or f"Historia {intent}"
    accion_custom = (body.get("accionCustom") or "").strip()

    if not intent or not INTENT_RE.match(intent):
        return False, "Intent inválido (usa letras, números y guión bajo)."
    if not ejemplos:
        return False, "Se requiere al menos un ejemplo NLU."
    if not respuesta:
        return False, "La respuesta (domain) es obligatoria."

    utter = f"utter_{intent}"
    accion = accion_custom or utter

    nlu_data = _load_yaml(NLU_PATH)
    blocks = list(nlu_data.get("nlu") or [])
    if any(isinstance(b, dict) and b.get("intent") == intent for b in blocks):
        return False, "La intención ya existe. Usa modificar o elimina antes."
    blocks.append({"intent": intent, "examples": _examples_block(ejemplos)})
    nlu_data["nlu"] = blocks
    _save_yaml(NLU_PATH, nlu_data)

    domain = _load_yaml(DOMAIN_PATH)
    intents = list(domain.get("intents") or [])
    if intent not in intents:
        intents.append(intent)
    domain["intents"] = intents

    responses = dict(domain.get("responses") or {})
    textos = [t.strip() for t in respuesta.split("\n\n") if t.strip()]
    if not textos:
        textos = [respuesta]
    responses[utter] = [{"text": t} for t in textos]
    domain["responses"] = responses

    if accion_custom:
        acciones = list(domain.get("actions") or [])
        if accion_custom not in acciones:
            acciones.append(accion_custom)
        domain["actions"] = acciones

    _save_yaml(DOMAIN_PATH, domain)

    rules_data = _load_yaml(RULES_PATH)
    rules_list = list(rules_data.get("rules") or [])
    rules_list.append(
        {"rule": regla_titulo, "steps": [{"intent": intent}, {"action": accion}]}
    )
    rules_data["rules"] = rules_list
    _save_yaml(RULES_PATH, rules_data)

    stories_data = _load_yaml(STORIES_PATH)
    stories_list = list(stories_data.get("stories") or [])
    stories_list.append(
        {"story": historia_titulo, "steps": [{"intent": intent}, {"action": accion}]}
    )
    stories_data["stories"] = stories_list
    _save_yaml(STORIES_PATH, stories_data)

    return True, ""


def build_intent_detail(intent: str) -> dict[str, Any] | None:
    domain = _load_yaml(DOMAIN_PATH)
    if intent not in (domain.get("intents") or []):
        return None

    nlu_data = _load_yaml(NLU_PATH)
    ejemplos: list[str] = []
    for block in nlu_data.get("nlu") or []:
        if isinstance(block, dict) and block.get("intent") == intent:
            ejemplos = _parse_nlu_examples(block.get("examples"))
            break

    utter = f"utter_{intent}"
    responses = domain.get("responses") or {}
    texts: list[str] = []
    if utter in responses:
        for v in responses[utter] or []:
            if isinstance(v, dict) and v.get("text") is not None:
                texts.append(str(v["text"]))
    respuesta = "\n\n".join(texts)

    regla_titulo = ""
    historia_titulo = ""
    accion_custom = ""

    rules_data = _load_yaml(RULES_PATH)
    for rule in rules_data.get("rules") or []:
        if not isinstance(rule, dict):
            continue
        steps = rule.get("steps") or []
        if not any(
            isinstance(s, dict) and s.get("intent") == intent for s in steps
        ):
            continue
        regla_titulo = rule.get("rule", "") or ""
        for s in steps:
            if isinstance(s, dict) and s.get("action"):
                act = s["action"]
                if act != utter:
                    accion_custom = act
                break
        break

    stories_data = _load_yaml(STORIES_PATH)
    for story in stories_data.get("stories") or []:
        if not isinstance(story, dict):
            continue
        steps = story.get("steps") or []
        if not any(
            isinstance(s, dict) and s.get("intent") == intent for s in steps
        ):
            continue
        historia_titulo = story.get("story", "") or ""
        break

    return {
        "intent": intent,
        "ejemplos": ejemplos,
        "respuesta": respuesta,
        "reglaTitulo": regla_titulo,
        "historiaTitulo": historia_titulo,
        "accionCustom": accion_custom,
    }


def _parse_request_json(request: Request) -> dict[str, Any]:
    if not request.body:
        return {}
    try:
        raw = json.loads(request.body.decode("utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def maybe_train_async() -> None:
    if os.environ.get("RASA_ADMIN_AUTO_TRAIN", "").strip() != "1":
        return

    def job():
        try:
            subprocess.run(
                ["rasa", "train"],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
                timeout=3600,
            )
        except Exception:
            pass

    threading.Thread(target=job, daemon=True).start()


@app.get("/admin/api/intent/<intent>")
async def get_one_intent(request: Request, intent: str):
    if not _check_auth(request):
        return _forbidden()
    intent = intent.strip()
    if not intent or not INTENT_RE.match(intent):
        return _bad("Intent inválido")
    detail = build_intent_detail(intent)
    if not detail:
        return _bad("Intención no encontrada", 404)
    return response.json({"ok": True, "intent": detail})


@app.get("/admin/api/catalog")
async def get_catalog(request: Request):
    if not _check_auth(request):
        return _forbidden()
    try:
        cat = build_catalog()
    except Exception as e:
        return _bad(str(e), 500)
    return response.json({"ok": True, "catalog": cat})


@app.put("/admin/api/intent")
async def put_intent(request: Request):
    if not _check_auth(request):
        return _forbidden()
    body = _parse_request_json(request)
    if not body:
        return _bad("JSON inválido o vacío")

    previous = (body.get("previousIntent") or "").strip()
    intent = (body.get("intent") or "").strip()
    protected = _protected_delete()

    ok = False
    err = ""

    if previous and previous != intent:
        if previous in protected:
            return _bad("No se puede renombrar una intención protegida.", 403)
        if not INTENT_RE.match(intent):
            return _bad("Nuevo intent inválido")
        remove_intent_everywhere(previous)
        ok, err = add_intent_from_payload(body)
    elif previous and previous == intent:
        if intent in protected:
            ok, err = update_intent_protected(intent, body)
        else:
            remove_intent_everywhere(intent)
            ok, err = add_intent_from_payload(body)
    else:
        ok, err = add_intent_from_payload(body)

    if not ok:
        return _bad(err)
    maybe_train_async()
    try:
        cat = build_catalog()
    except Exception as e:
        return response.json({"ok": True, "warning": str(e), "catalog": None})
    return response.json({"ok": True, "catalog": cat})


@app.delete("/admin/api/intent/<intent>")
async def delete_intent(request: Request, intent: str):
    if not _check_auth(request):
        return _forbidden()
    intent = intent.strip()
    if not intent or not INTENT_RE.match(intent):
        return _bad("Intent inválido")
    if intent in _protected_delete():
        return _bad("Esta intención no se puede eliminar.", 403)
    remove_intent_everywhere(intent)
    maybe_train_async()
    try:
        cat = build_catalog()
    except Exception as e:
        return response.json({"ok": True, "warning": str(e), "catalog": None})
    return response.json({"ok": True, "catalog": cat})


@app.get("/admin/api/health")
async def health(_request: Request):
    return response.json({"ok": True, "root": str(ROOT)})


if __name__ == "__main__":
    host = os.environ.get("RASA_ADMIN_HOST", "0.0.0.0")
    port = int(os.environ.get("RASA_ADMIN_PORT", "8765"))
    app.run(host=host, port=port)
