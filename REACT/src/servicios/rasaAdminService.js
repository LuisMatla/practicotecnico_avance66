// llamadas al api admin de rasa con cabeceras opcionales.
import { obtenerRasaUrl } from './rasaService'; //resuelve base URL de Rasa (segun entorno).

const authHeaders = (withJsonBody = false) => {
  const headers = {}; //objeto mutable de cabeceras.
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json'; //habilita body json.
  }
  if (process.env.REACT_APP_RASA_API_KEY) {
    headers['X-Rasa-Auth'] = process.env.REACT_APP_RASA_API_KEY; //api key opcional.
  }
  return headers;
};

// acorta y normaliza mensajes de error de fetch/api para mostrarlos en la ui.
export function resumirMensajeErrorAdmin(msg) {
  if (msg == null || msg === '') return 'Error desconocido';
  let s = String(msg).replace(/\s+/g, ' ').trim();
  if (s.length > 220) {
    s = `${s.slice(0, 217)}…`;
  }
  return s;
}

// en produccion (no localhost/lan) usa proxy vercel /api/rasa-proxy: mismo origen, sin cors.
const adminBaseUrl = () => {
  if (process.env.REACT_APP_DISABLE_RASA_PROXY === '1') {
    return obtenerRasaUrl().replace(/\/$/, ''); //usa URL directa (sin proxy).
  }
  if (typeof window === 'undefined') {
    return obtenerRasaUrl().replace(/\/$/, ''); //SSR: no hay window.
  }
  const h = window.location.hostname;
  const esLocal =
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('172.');
  if (esLocal) {
    return obtenerRasaUrl().replace(/\/$/, ''); //en LAN/local usa URL directa.
  }
  return `${window.location.origin}/api/rasa-proxy`.replace(/\/$/, ''); //en prod usa proxy same-origin.
};

export async function fetchCatalogoRasa() {
  //descarga el catalogo agregado (intents, responses, etc.) desde el api admin.
  const res = await fetch(`${adminBaseUrl()}/admin/api/catalog`, { //endpoint de catalogo.
    method: 'GET',
    headers: authHeaders(false),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Catálogo HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok || !data.catalog) {
    throw new Error(data.error || 'Respuesta de catálogo inválida');
  }
  return data.catalog;
}

export async function fetchIntentDetalle(intent) {
  //obtiene yaml o estructura detallada de un intent concreto.
  const res = await fetch(
    `${adminBaseUrl()}/admin/api/intent/${encodeURIComponent(intent)}`,
    {
      method: 'GET',
      headers: authHeaders(false),
    }
  );
  if (res.status === 404) {
    return null; //no existe el intent en el servidor admin.
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Intent HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok || !data.intent) {
    throw new Error(data.error || 'Respuesta inválida');
  }
  return data.intent;
}

export async function guardarIntentRasa(payload) {
  //envia cuerpo json con intent, ejemplos y respuestas para persistir en disco del servidor.
  const res = await fetch(`${adminBaseUrl()}/admin/api/intent`, { //crea/actualiza intent.
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error al guardar (${res.status})`);
  }
  if (!data.ok) {
    throw new Error(data.error || 'No se pudo guardar la intención');
  }
  return data;
}

export async function eliminarIntentRasa(intent) {
  //borra intent y archivos relacionados en el servidor admin de rasa.
  const res = await fetch(
    `${adminBaseUrl()}/admin/api/intent/${encodeURIComponent(intent)}`,
    {
      method: 'DELETE',
      headers: authHeaders(false),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error al eliminar (${res.status})`);
  }
  if (!data.ok) {
    throw new Error(data.error || 'No se pudo eliminar la intención');
  }
  return data;
}
