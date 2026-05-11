const DEFAULT_UPSTREAM = 'https://rasa.bitbotfiee.xyz';

function pathDesdeQuery(p) {
  if (p == null || p === '') return '';
  const s = Array.isArray(p) ? p.join('/') : String(p);
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

function queryUpstream(req) {
  const q = { ...req.query };
  delete q.p;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, String(x)));
    else usp.append(k, String(v));
  }
  const t = usp.toString();
  return t ? `?${t}` : '';
}

module.exports = async (req, res) => {
  let pathStr = pathDesdeQuery(req.query.p).replace(/^\/+/, '');
  if (pathStr.includes('..')) {
    res.status(400);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify({ error: 'invalid_path' }));
    return;
  }

  const base = (process.env.RASA_UPSTREAM_URL || DEFAULT_UPSTREAM).replace(/\/$/, '');
  const search = queryUpstream(req);
  const target = pathStr
    ? `${base}/${pathStr}${search}`
    : `${base}/${search || ''}`;

  const headers = new Headers();
  const ct = req.headers['content-type'];
  if (ct) headers.set('Content-Type', Array.isArray(ct) ? ct[0] : ct);
  const xa = req.headers['x-rasa-auth'];
  if (xa) headers.set('X-Rasa-Auth', Array.isArray(xa) ? xa[0] : xa);
  const envKey = process.env.RASA_API_KEY;
  if (envKey && !headers.has('X-Rasa-Auth')) {
    headers.set('X-Rasa-Auth', envKey);
  }

  const init = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined) {
      init.body =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }

  try {
    const r = await fetch(target, init);
    const buf = Buffer.from(await r.arrayBuffer());
    const outCt = r.headers.get('content-type') || 'application/octet-stream';
    res.status(r.status);
    res.setHeader('Content-Type', outCt);
    res.send(buf);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    res.status(502);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(
      JSON.stringify({
        ok: false,
        error: 'proxy_upstream_failed',
        message: msg,
      })
    );
  }
};

module.exports.config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};
