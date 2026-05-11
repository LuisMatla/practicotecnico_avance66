
export const obtenerRasaUrl = () => {
  if (process.env.REACT_APP_RASA_URL) {
    return process.env.REACT_APP_RASA_URL;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5005';
  }

  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://localhost:5005';
  }
  if (h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.')) {
    return `http://${h}:5005`;
  }

  return '/api/rasa-proxy';
};

const RASA_URL = obtenerRasaUrl();
export { RASA_URL };

export const enviarMensajeRasa = async (mensaje, senderId = 'usuario') => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    if (!RASA_URL) {
      throw new Error('La URL de Rasa no está configurada');
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    if (process.env.REACT_APP_RASA_API_KEY) {
      headers['X-Rasa-Auth'] = process.env.REACT_APP_RASA_API_KEY;
    }

    const response = await fetch(`${RASA_URL}/webhooks/rest/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: mensaje,
        sender: senderId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      return data.map(msg => msg.text || msg.message || '').filter(Boolean).join('\n');
    }

    return 'Lo siento, no pude procesar tu mensaje. ¿Podrías reformularlo?';

  } catch (error) {
    clearTimeout(timeoutId);

    console.error('Error al comunicarse con Rasa:', error);

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('El servidor de Rasa tardó demasiado en responder. Por favor, intenta nuevamente.');
    }

    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('fetch')) {
      throw new Error('No se pudo conectar con el servidor de Rasa. Verifica que el servidor esté ejecutándose en http://localhost:5005');
    }

    throw new Error(`Error de Rasa: ${error.message || 'Error desconocido al comunicarse con Rasa'}`);
  }
};

export const verificarConexionRasa = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    if (!RASA_URL) {
      return false;
    }

    const response = await fetch(`${RASA_URL}/`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error al verificar conexión con Rasa:', error);
    return false;
  }
};

export const obtenerEstadoRasa = async () => {

  try {
    const testResponse = await enviarMensajeRasa('test', 'status-check');
    return {
      status: 'ok',
      message: 'Rasa está funcionando correctamente',
      testResponse: testResponse
    };
  } catch (error) {
    console.error('Error al obtener estado de Rasa:', error);
    return null;
  }
};
