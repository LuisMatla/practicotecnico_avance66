// handler serverless en vercel: reescribe /api/rasa-proxy/* hacia este archivo con ?p=ruta.
// archivo plano sin [...path] para evitar fallos de registro en CRA + build de vercel.

const DEFAULT_UPSTREAM = 'https://rasa.bitbot.xyz'; //url base del Rasa remoto si no hay env.

function pathDesdeQuery(p) {
  //convierte query p en string de ruta relativa segura.
  if (p == null || p === '') return ''; //sin parametro devuelve vacio.
  const s = Array.isArray(p) ? p.join('/') : String(p); //normaliza arreglos del querystring.
  try {
    return decodeURIComponent(s.replace(/\+/g, ' ')); //decodifica espacios y caracteres.
  } catch {
    return s; //si falla decode devuelve el string crudo.
  }
}

function queryUpstream(req) {
  //reconstruye querystring para el upstream sin repetir el parametro p.
  const q = { ...req.query }; //copia query de la peticion entrante.
  delete q.p; //elimina p porque ya va en el path del upstream.
  const usp = new URLSearchParams(); //constructor de parametros url.
  for (const [k, v] of Object.entries(q)) {
    //itera claves restantes para reenviarlas al Rasa.
    if (v === undefined) continue; //omite indefinidos.
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, String(x))); //soporta valores multiples.
    else usp.append(k, String(v)); //valor simple como string.
  }
  const t = usp.toString(); //serializa a texto.
  return t ? `?${t}` : ''; //prefijo ? solo si hay parametros.
}

module.exports = async (req, res) => {
  //proxy http: reenvia metodo, cabeceras y cuerpo al upstream Rasa.
  let pathStr = pathDesdeQuery(req.query.p).replace(/^\/+/, ''); //ruta destino sin slashes iniciales.
  if (pathStr.includes('..')) {
    //bloquea traversal para no salir del host configurado.
    res.status(400); //respuesta de cliente invalido.
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); //tipo json de error.
    res.send(JSON.stringify({ error: 'invalid_path' })); //cuerpo corto de error.
    return; //corta el handler.
  }

  const base = (process.env.RASA_UPSTREAM_URL || DEFAULT_UPSTREAM).replace(/\/$/, ''); //base sin slash final.
  const search = queryUpstream(req); //query adicional hacia Rasa.
  const target = pathStr
    ? `${base}/${pathStr}${search}` //url completa con subruta.
    : `${base}/${search || ''}`; //solo base mas query si no hay subruta.

  const headers = new Headers(); //cabeceras hacia fetch upstream.
  const ct = req.headers['content-type']; //content-type entrante si existe.
  if (ct) headers.set('Content-Type', Array.isArray(ct) ? ct[0] : ct); //propaga tipo de contenido.
  const xa = req.headers['x-rasa-auth']; //cabecera opcional de auth manual.
  if (xa) headers.set('X-Rasa-Auth', Array.isArray(xa) ? xa[0] : xa); //reenvia token de cliente.
  const envKey = process.env.RASA_API_KEY; //clave desde variables de entorno vercel.
  if (envKey && !headers.has('X-Rasa-Auth')) {
    //si hay api key en servidor y el cliente no mando auth, la inyecta.
    headers.set('X-Rasa-Auth', envKey); //cabecera esperada por el middleware Rasa.
  }

  const init = {
    //opciones minimas del fetch al upstream.
    method: req.method, //get, post, etc.
    headers, //cabeceras construidas arriba.
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    //solo metodos con cuerpo requieren body en fetch.
    if (req.body !== undefined) {
      //si vercel ya parseo el cuerpo lo reenvia como texto o json string.
      init.body =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body); //serializa objetos.
    }
  }

  try {
    const r = await fetch(target, init); //llamada al servidor Rasa.
    const buf = Buffer.from(await r.arrayBuffer()); //lee cuerpo binario o texto.
    const outCt = r.headers.get('content-type') || 'application/octet-stream'; //tipo de respuesta upstream.
    res.status(r.status); //propaga codigo http tal cual.
    res.setHeader('Content-Type', outCt); //content-type hacia el navegador.
    res.send(buf); //devuelve bytes al cliente.
  } catch (err) {
    const msg = err && err.message ? err.message : String(err); //mensaje legible de fallo de red.
    res.status(502); //bad gateway: upstream no respondio.
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); //json de error.
    res.send(
      JSON.stringify({
        //payload de error para depuracion en front.
        ok: false, //bandera de fallo.
        error: 'proxy_upstream_failed', //codigo estable para el cliente.
        message: msg, //detalle humano del error.
      })
    );
  }
};

module.exports.config = {
  //configuracion de vercel para esta ruta api.
  api: {
    bodyParser: true, //permite leer req.body en post json.
    responseLimit: false, //sin limite artificial de tamano de respuesta.
  },
};
