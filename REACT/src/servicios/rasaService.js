// url de rasa: env, localhost/lan, o dominio publico (railway detras de cloudflare).
export const obtenerRasaUrl = () => {
  if (process.env.REACT_APP_RASA_URL) {
    return process.env.REACT_APP_RASA_URL; //prioridad absoluta si viene en build.
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5005'; //entorno sin navegador (tests o ssr).
  }

  const h = window.location.hostname; //host actual del front.
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://localhost:5005'; //desarrollo local tipico.
  }
  if (
    h.startsWith('192.168.') ||
    h.startsWith('10.') ||
    h.startsWith('172.')
  ) {
    return `http://${h}:5005`; //misma maquina en red lan accediendo por ip.
  }

  return 'https://rasa.bitbot.xyz'; //produccion publica por defecto.
};

const RASA_URL = obtenerRasaUrl(); //url final resuelta segun entorno.
export { RASA_URL }; //exporta url para uso/diagnostico.

// envia un mensaje al webhook de rasa con tiempo maximo de espera.
export const enviarMensajeRasa = async (mensaje, senderId = 'usuario') => {
  const controller = new AbortController(); //permite abortar la peticion.
  const timeoutId = setTimeout(() => controller.abort(), 30000); //timeout maximo de 30s.

  try {
    if (!RASA_URL) {
      throw new Error('La URL de Rasa no está configurada');
    }

    const headers = { //cabeceras base.
      'Content-Type': 'application/json', //json.
    };
    
    if (process.env.REACT_APP_RASA_API_KEY) {
      headers['X-Rasa-Auth'] = process.env.REACT_APP_RASA_API_KEY; //api key opcional.
    }

    const response = await fetch(`${RASA_URL}/webhooks/rest/webhook`, { //webhook REST de Rasa.
      method: 'POST', //rasa espera post con json.
      headers,
      body: JSON.stringify({
        message: mensaje, //texto del usuario.
        sender: senderId, //id de conversacion estable por usuario.
      }),
      signal: controller.signal, //enlaza abort por timeout.
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json(); //respuesta del bot.
    
    if (Array.isArray(data) && data.length > 0) { //si llega arreglo de mensajes.
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
  const controller = new AbortController(); //permite abortar la peticion.
  const timeoutId = setTimeout(() => controller.abort(), 5000); //timeout corto (5s).

  try {
    if (!RASA_URL) {
      return false;
    }
    
    const response = await fetch(`${RASA_URL}/`, { //ping simple a raiz.
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
  //prueba end to end enviando un mensaje de prueba (puede crear ruido en logs del bot).
  try {
    const testResponse = await enviarMensajeRasa('test', 'status-check'); //sender distinto para no mezclar historial.
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
