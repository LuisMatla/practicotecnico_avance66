from typing import Any, Text, Dict, List
import os
import re
import unicodedata
import math
import requests
from rapidfuzz import fuzz
from openai import OpenAI

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
FAQ_TABLE = os.getenv("FAQ_TABLE", "faq")
FAQ_MAX_RESULTS = int(os.getenv("FAQ_MAX_RESULTS", "200"))
FAQ_MIN_SCORE = float(os.getenv("FAQ_MIN_SCORE", "0.62"))

FAQ_USE_EMBEDDINGS = os.getenv("FAQ_USE_EMBEDDINGS", "true").lower() in (
    "1",
    "true",
    "yes",
)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_EMBEDDING_MODEL = os.getenv(
    "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
)
EMBEDDING_WEIGHT = float(os.getenv("FAQ_EMBEDDING_WEIGHT", "0.6"))

openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


def normalizar_texto(texto: str) -> str:
    if not texto:
        return ""
    texto = texto.strip().lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(char for char in texto if unicodedata.category(char) != "Mn")
    texto = re.sub(r"[^a-z0-9ñ\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto)
    return texto


def obtener_faqs():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []

    url = f"{SUPABASE_URL}/rest/v1/{FAQ_TABLE}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    params = {
        "select": "id,pregunta,respuesta,palabras_clave,activo,embedding",
        "limit": str(FAQ_MAX_RESULTS),
    }

    response = requests.get(url, headers=headers, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    return [faq for faq in data if faq.get("activo", True)]


def actualizar_embedding_faq(faq_id: str, embedding: List[float]) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    url = f"{SUPABASE_URL}/rest/v1/{FAQ_TABLE}?id=eq.{faq_id}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {"embedding": embedding, "updated_at": "now()"}
    requests.patch(url, headers=headers, json=payload, timeout=10)


def obtener_embedding(texto: str) -> List[float]:
    if not openai_client or not FAQ_USE_EMBEDDINGS:
        return []
    if not texto or not texto.strip():
        return []
    response = openai_client.embeddings.create(
        model=OPENAI_EMBEDDING_MODEL, input=texto
    )
    return response.data[0].embedding


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def calcular_score_fuzzy(pregunta: str, palabras_clave: str, mensaje: str) -> float:
    mensaje_norm = normalizar_texto(mensaje)
    if not mensaje_norm:
        return 0.0

    pregunta_norm = normalizar_texto(pregunta)
    keywords = []
    if palabras_clave:
        raw_keywords = palabras_clave.replace(";", ",")
        keywords = [k.strip() for k in raw_keywords.split(",") if k.strip()]

    score = 0.0

    if pregunta_norm and pregunta_norm in mensaje_norm:
        score = max(score, 0.7)

    if pregunta_norm:
        ratio = fuzz.ratio(mensaje_norm, pregunta_norm) / 100.0
        token_ratio = fuzz.token_set_ratio(mensaje_norm, pregunta_norm) / 100.0
        score = max(score, ratio, token_ratio)

    if keywords:
        for keyword in keywords:
            keyword_norm = normalizar_texto(keyword)
            if not keyword_norm:
                continue
            if keyword_norm in mensaje_norm:
                score = max(score, 0.7)
            score = max(score, fuzz.partial_ratio(mensaje_norm, keyword_norm) / 100.0)

    if pregunta_norm:
        mensaje_tokens = set(mensaje_norm.split())
        pregunta_tokens = set(pregunta_norm.split())
        if mensaje_tokens and pregunta_tokens:
            overlap = len(mensaje_tokens & pregunta_tokens) / max(1, len(pregunta_tokens))
            score = max(score, overlap)

    return min(score, 1.0)


def construir_texto_faq(faq: Dict[str, Any]) -> str:
    pregunta = faq.get("pregunta", "") or ""
    palabras_clave = faq.get("palabras_clave", "") or ""
    return f"{pregunta}\n{palabras_clave}".strip()


class ActionBuscarFaq(Action):
    def name(self) -> Text:
        return "action_buscar_faq"

    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        mensaje = tracker.latest_message.get("text", "")
        if not mensaje:
            dispatcher.utter_message(
                text="No pude leer tu mensaje. ¿Puedes intentarlo de nuevo?"
            )
            return []

        try:
            faqs = obtener_faqs()
        except Exception:
            dispatcher.utter_message(
                text="No pude consultar la base de conocimientos en este momento."
            )
            return []

        if not faqs:
            dispatcher.utter_message(
                text="No tengo respuestas registradas todavía."
            )
            return []

        embedding_mensaje = []
        if FAQ_USE_EMBEDDINGS and openai_client:
            try:
                embedding_mensaje = obtener_embedding(mensaje)
            except Exception:
                embedding_mensaje = []

        mejor_faq = None
        mejor_score = 0.0

        for faq in faqs:
            fuzzy_score = calcular_score_fuzzy(
                faq.get("pregunta", ""),
                faq.get("palabras_clave", "") or "",
                mensaje,
            )

            embedding_score = 0.0
            if embedding_mensaje:
                embedding_faq = faq.get("embedding") or []
                if not embedding_faq:
                    try:
                        embedding_faq = obtener_embedding(construir_texto_faq(faq))
                        if embedding_faq:
                            actualizar_embedding_faq(faq.get("id"), embedding_faq)
                    except Exception:
                        embedding_faq = []

                if embedding_faq:
                    embedding_score = cosine_similarity(
                        embedding_mensaje, embedding_faq
                    )

            if embedding_mensaje and embedding_score > 0:
                score = (EMBEDDING_WEIGHT * embedding_score) + (
                    (1 - EMBEDDING_WEIGHT) * fuzzy_score
                )
            else:
                score = fuzzy_score

            if score > mejor_score:
                mejor_score = score
                mejor_faq = faq

        if mejor_faq and mejor_score >= FAQ_MIN_SCORE:
            dispatcher.utter_message(text=mejor_faq.get("respuesta", ""))
        else:
            dispatcher.utter_message(
                text="No encontré una respuesta exacta. ¿Puedes darme más detalles?"
            )

        return []
