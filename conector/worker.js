// Conector de Sublima Fácil para Cloudflare Workers.
//
// Skydropx no deja que una página web le hable directo (bloquea las llamadas del navegador),
// así que este pequeño servidor gratuito hace de puente: guarda tus claves de Skydropx como
// secretos, pide el token y pasa las peticiones de "Mi negocio".
//
// Secretos que hay que configurar en Cloudflare (Settings → Variables and Secrets):
//   SKYDROPX_ID      client_id de Skydropx
//   SKYDROPX_SECRET  client_secret de Skydropx
//   CLAVE            una clave que tú inventas; "Mi negocio" la manda en cada petición
// Variable opcional:
//   ORIGENES         páginas que pueden usar el conector, separadas por coma
//                    (por defecto: https://josesegura12.github.io)

const SKYDROPX = 'https://pro.skydropx.com/api/v1';
// Solo se permite lo que usa Mi negocio: cotizar, crear y consultar guías
const PERMITIDO = [
  ['POST', /^quotations$/],
  ['GET', /^quotations\/[\w-]+$/],
  ['POST', /^shipments$/],
  ['GET', /^shipments\/[\w-]+$/],
  ['GET', /^shipments$/],
];

let token = null, vence = 0;   // el token de Skydropx dura 2 horas; se reutiliza mientras sirva

async function tokenSkydropx(env) {
  if (token && Date.now() < vence) return token;
  const r = await fetch(`${SKYDROPX}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SublimaFacil-Conector/1.0' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.SKYDROPX_ID, client_secret: env.SKYDROPX_SECRET }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('Skydropx rechazó las claves del conector (revisa SKYDROPX_ID y SKYDROPX_SECRET).');
  token = d.access_token;
  vence = Date.now() + ((d.expires_in || 7200) - 300) * 1000;
  return token;
}

function cors(req, env) {
  const origen = req.headers.get('Origin') || '';
  const permitidos = (env.ORIGENES || 'https://josesegura12.github.io').split(',').map(s => s.trim());
  const ok = permitidos.includes(origen) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen);
  return {
    'Access-Control-Allow-Origin': ok ? origen : permitidos[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Clave',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/estado') {
      return json({ ok: true, servicio: 'Conector Sublima Fácil', skydropx: !!(env.SKYDROPX_ID && env.SKYDROPX_SECRET) }, 200, h);
    }
    if (!env.CLAVE || req.headers.get('X-Clave') !== env.CLAVE) return json({ error: 'Clave del conector incorrecta.' }, 401, h);

    const m = /^\/skydropx\/(.+)$/.exec(url.pathname);
    if (!m) return json({ error: 'Ruta no encontrada.' }, 404, h);
    const ruta = m[1];
    if (!PERMITIDO.some(([met, re]) => met === req.method && re.test(ruta))) return json({ error: 'Operación no permitida.' }, 403, h);

    try {
      const tok = await tokenSkydropx(env);
      const r = await fetch(`${SKYDROPX}/${ruta}${url.search}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${tok}`, 'User-Agent': 'SublimaFacil-Conector/1.0' },
        body: req.method === 'POST' ? await req.text() : undefined,
      });
      if (r.status === 401) token = null;   // por si el token venció antes de tiempo
      return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (e) {
      return json({ error: e.message || 'No se pudo hablar con Skydropx.' }, 502, h);
    }
  },
};
