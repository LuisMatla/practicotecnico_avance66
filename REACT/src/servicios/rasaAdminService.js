
import { obtenerRasaUrl } from './rasaService';

const authHeaders = (withJsonBody = false) => {
  const headers = {};
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (process.env.REACT_APP_RASA_API_KEY) {
    headers['X-Rasa-Auth'] = process.env.REACT_APP_RASA_API_KEY;
  }
  return headers;
};

export function resumirMensajeErrorAdmin(msg) {
  if (msg == null || msg === '') return 'Error desconocido';
  let s = String(msg).replace(/\s+/g, ' ').trim();
  if (s.length > 220) {
    s = `${s.slice(0, 217)}…`;
  }
  return s;
}

const adminBaseUrl = () => {
  if (process.env.REACT_APP_RASA_ADMIN_URL) {
    return process.env.REACT_APP_RASA_ADMIN_URL.replace(/\/$/, '');
  }
  if (process.env.REACT_APP_DISABLE_RASA_PROXY === '1') {
    return obtenerRasaUrl().replace(/\/$/, '');
  }
  return obtenerRasaUrl().replace(/\/$/, '');
};

export async function fetchCatalogoRasa() {

  const res = await fetch(`${adminBaseUrl()}/admin/api/catalog`, {
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

  const res = await fetch(
    `${adminBaseUrl()}/admin/api/intent/${encodeURIComponent(intent)}`,
    {
      method: 'GET',
      headers: authHeaders(false),
    }
  );
  if (res.status === 404) {
    return null;
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

  const res = await fetch(`${adminBaseUrl()}/admin/api/intent`, {
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

export async function entrenarRasaAhora() {

  const res = await fetch(`${adminBaseUrl()}/admin/api/train`, {
    method: 'POST',
    headers: authHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error al entrenar (${res.status})`);
  }
  if (!data.ok) {
    throw new Error(data.error || 'No se pudo iniciar el entrenamiento');
  }
  return data;
}

export async function fetchEstadoEntrenamientoRasa() {

  const res = await fetch(`${adminBaseUrl()}/admin/api/train/status`, {
    method: 'GET',
    headers: authHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error al consultar entrenamiento (${res.status})`);
  }
  if (!data.ok) {
    throw new Error(data.error || 'No se pudo consultar el estado del entrenamiento');
  }
  return data;
}
