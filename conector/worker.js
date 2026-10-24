// Conector de Sublima Fácil para Cloudflare Workers.
//
// Hace tres cosas que una página web sola no puede hacer de forma segura:
//   1. Envíos: pasa las peticiones de "Mi negocio" a Skydropx (que bloquea las llamadas del navegador).
//   2. Pagos de la tienda: arma el cobro con Clip usando los precios reales del catálogo.
//   3. Guías automáticas: cada 5 minutos confirma los pagos con Clip y compra la guía de cada
//      pedido pagado, para que en "Mi negocio" solo imprimas la etiqueta.
//
// Secretos (Settings → Variables and Secrets, tipo Secret):
//   SKYDROPX_ID, SKYDROPX_SECRET   claves de la API de Skydropx
//   CLIP_KEY, CLIP_SECRET          claves de la API de Clip
//   CLAVE                          una clave que tú inventas; "Mi negocio" la manda en cada petición
// Almacén (Settings → Bindings → KV namespace): nombre de la variable PEDIDOS
// Activador (Settings → Triggers → Cron): */5 * * * *
// Variables opcionales (tipo Text):
//   ORIGENES      páginas que pueden usar el conector, separadas por coma (por defecto https://josesegura12.github.io)
//   CATALOGO_URL  catálogo de la tienda (por defecto el de josesegura12.github.io/software-tazas)

const UA = 'SublimaFacil-Conector/2.0';
const PERMITIDO = [
  ['POST', /^quotations$/], ['GET', /^quotations\/[\w-]+$/],
  ['POST', /^shipments$/], ['GET', /^shipments\/[\w-]+$/], ['GET', /^shipments$/],
];
const skyBase = env => env.SKYDROPX_BASE || 'https://pro.skydropx.com/api/v1';
const clipBase = env => env.CLIP_BASE || 'https://api.payclip.com/v2/checkout';
const catalogoUrl = env => env.CATALOGO_URL || 'https://josesegura12.github.io/software-tazas/tienda/catalogo.json';
const espera = ms => new Promise(r => setTimeout(r, ms));
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/* ---------- Utilidades HTTP ---------- */
function origenOk(origen, env) {
  const permitidos = (env.ORIGENES || 'https://josesegura12.github.io').split(',').map(s => s.trim());
  return permitidos.includes(origen) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen);
}
function cors(req, env) {
  const origen = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': origenOk(origen, env) ? origen : (env.ORIGENES || 'https://josesegura12.github.io').split(',')[0].trim(),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Clave',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
class Falla extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- Skydropx ---------- */
let token = null, vence = 0;   // el token dura 2 horas; se reutiliza mientras sirva
async function tokenSkydropx(env) {
  if (token && Date.now() < vence) return token;
  const r = await fetch(`${skyBase(env)}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.SKYDROPX_ID, client_secret: env.SKYDROPX_SECRET }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Falla('Skydropx rechazó las claves del conector (revisa SKYDROPX_ID y SKYDROPX_SECRET).', 502);
  token = d.access_token;
  vence = Date.now() + ((d.expires_in || 7200) - 300) * 1000;
  return token;
}
async function sky(env, method, ruta, body) {
  const r = await fetch(`${skyBase(env)}/${ruta}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${await tokenSkydropx(env)}`, 'User-Agent': UA },
  });
  if (r.status === 401) token = null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Falla('Skydropx: ' + (d.message || JSON.stringify(d.errors || d).slice(0, 300)), 502);
  return d;
}
const zona = a => ({ country_code: 'mx', postal_code: String(a.cp || '').trim(), area_level1: a.estado, area_level2: a.municipio, area_level3: a.colonia });
const direccion = a => ({
  ...zona(a), street1: a.calle, name: a.nombre, company: a.empresa || a.nombre, phone: String(a.telefono || '').replace(/\D/g, '').slice(-10),
  email: a.correo || 'sin-correo@ejemplo.com', reference: a.referencia || 'Sin referencia',
});
// Caja del pedido: la medida configurada y el peso según cuántas piezas lleva
function paquete(cfg, items) {
  const p = cfg.paquete || {}, piezas = items.reduce((a, it) => a + it.cant, 0);
  return { length: num(p.largo) || 20, width: num(p.ancho) || 15, height: num(p.alto) || 15,
           weight: r2(Math.max(num(p.peso) || 1, piezas * (num(cfg.pesoPieza) || 0.5))) };
}
async function cotizar(env, cfg, destino, items) {
  const q = await sky(env, 'POST', 'quotations', { quotation: { address_from: zona(cfg.origen), address_to: zona(destino), parcel: paquete(cfg, items) } });
  let d = q;
  for (let i = 0; i < 8 && !d.is_completed; i++) { await espera(2500); d = await sky(env, 'GET', `quotations/${q.id}`); }
  return { id: q.id, rates: (d.rates || []).filter(r => r.success && r.total) };
}
const tarifa = r => ({ id: r.id, paqueteria: r.provider_display_name || r.provider_name, proveedor: r.provider_name, servicio: r.provider_service_name, dias: r.days, total: num(r.total) });

/* ---------- Clip ---------- */
async function clip(env, method, ruta, body) {
  const r = await fetch(clipBase(env) + ruta, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${env.CLIP_KEY}:${env.CLIP_SECRET}`), 'User-Agent': UA },
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Falla('Clip rechazó las claves del conector (revisa CLIP_KEY y CLIP_SECRET).', 502);
  if (!r.ok) throw new Falla('Clip: ' + (d.detail || d.message || r.status), 502);
  return d;
}

/* ---------- Catálogo y pedidos ---------- */
let catalogo = null, catalogoHasta = 0;
async function leerCatalogo(env) {
  if (catalogo && Date.now() < catalogoHasta) return catalogo;
  const r = await fetch(catalogoUrl(env) + '?v=' + Date.now(), { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Falla('No se pudo leer el catálogo de la tienda.', 502);
  catalogo = await r.json(); catalogoHasta = Date.now() + 5 * 60 * 1000;
  return catalogo;
}
// Los precios se toman del catálogo, nunca de lo que manda el navegador
async function partidas(env, items) {
  const cat = await leerCatalogo(env);
  if (!Array.isArray(items) || !items.length) throw new Falla('El carrito está vacío.');
  return items.slice(0, 50).map(it => {
    const p = (cat.productos || []).find(x => x.id === it.id);
    if (!p) throw new Falla('Un producto del carrito ya no está disponible. Recarga la tienda.');
    const cant = Math.min(99, Math.max(1, Math.round(num(it.cant))));
    return { id: p.id, nombre: p.nombre, cant, precio: r2(p.precio), notas: String(it.notas || '').slice(0, 300) };
  });
}
const kvListo = env => !!env.PEDIDOS;
const leer = async (env, id) => { const v = await env.PEDIDOS.get('pedido:' + id); return v ? JSON.parse(v) : null; };
const guardar = (env, p) => env.PEDIDOS.put('pedido:' + p.id, JSON.stringify(p));
const nuevoId = () => 'W' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 7).toUpperCase();
const config = async env => JSON.parse((await env.PEDIDOS.get('config')) || '{}');
function validarDireccion(a) {
  for (const k of ['nombre', 'telefono', 'cp', 'calle', 'colonia', 'municipio', 'estado']) if (!String((a || {})[k] || '').trim()) throw new Falla('Completa todos los datos de la dirección.');
  if (!/^\d{5}$/.test(String(a.cp).trim())) throw new Falla('El código postal debe tener 5 dígitos.');
}
// Lo que la tienda puede ver de su pedido
const publico = p => ({ id: p.id, estado: p.estado, total: p.total, entrega: p.entrega,
  guia: p.guia && p.guia.rastreo ? { paqueteria: p.guia.paqueteria, rastreo: p.guia.rastreo, urlRastreo: p.guia.urlRastreo } : null });

// Consulta Clip y marca el pedido como pagado (se puede llamar varias veces sin problema)
async function revisarPago(env, p) {
  if (p.estado !== 'esperando_pago' || !p.clip) return p;
  const d = await clip(env, 'GET', '/' + encodeURIComponent(p.clip.id));
  p.clip.estado = d.status;
  if (d.status === 'CHECKOUT_COMPLETED') { p.estado = 'pagado'; p.pagado_en = new Date().toISOString(); }
  else if (['CHECKOUT_CANCELLED', 'CHECKOUT_EXPIRED'].includes(d.status)) p.estado = 'cancelado';
  await guardar(env, p);
  return p;
}

// Compra la guía de un pedido pagado. Solo la llama el proceso automático (cron), que corre de uno en uno,
// para que nunca se compren dos guías del mismo pedido.
async function comprarGuia(env, cfg, p) {
  const { rates, id: cot } = await cotizar(env, cfg, p.direccion, p.items);
  if (!rates.length) throw new Falla('Ninguna paquetería tiene cobertura para esa dirección.');
  const elegida = rates.find(r => r.provider_name === p.envio.proveedor && r.provider_service_name === p.envio.servicio)
    || rates.slice().sort((a, b) => num(a.total) - num(b.total))[0];
  p.guia = { estado: 'creando', cotizacion: cot };
  await guardar(env, p);   // si algo falla a la mitad, el pedido ya no se vuelve a intentar solo
  const s = await sky(env, 'POST', 'shipments', { shipment: {
    rate_id: elegida.id, printing_format: 'standard',
    address_from: direccion(cfg.origen), address_to: direccion(p.direccion),
    packages: [{ package_number: '1', package_protected: false, declared_value: r2(p.subtotal), consignment_note: cfg.contenido, package_type: cfg.embalaje || '4G' }],
  } });
  let g = leerGuia(s);
  for (let i = 0; i < 6 && (!g.etiqueta || !['success', 'failed', 'cancelled'].includes(g.estado)); i++) {
    await espera(3000); g = leerGuia(await sky(env, 'GET', `shipments/${g.id}`));
  }
  p.guia = g;
  p.estado = g.estado === 'failed' ? 'guia_error' : 'guia_lista';
  await guardar(env, p);
}
function leerGuia(d) {
  const a = (d.data || {}).attributes || {}, pk = ((d.included || []).find(i => i.type === 'package') || {}).attributes || {};
  return { id: (d.data || {}).id, paqueteria: a.carrier_name, servicio: a.service_name, total: num(a.total), estado: a.workflow_status,
           rastreo: pk.tracking_number || a.master_tracking_number || '', etiqueta: pk.label_url || '', urlRastreo: pk.tracking_url_provider || '', error: a.error_detail || '' };
}

// Proceso automático (cada 5 minutos): confirma pagos y compra guías
async function procesar(env) {
  if (!kvListo(env)) return;
  const cfg = await config(env);
  const lista = await env.PEDIDOS.list({ prefix: 'pedido:', limit: 200 });
  let guias = 0;
  for (const k of lista.keys) {
    let p = JSON.parse((await env.PEDIDOS.get(k.name)) || 'null');
    if (!p) continue;
    try {
      // Pagos pendientes de hasta 4 días
      if (p.estado === 'esperando_pago' && Date.now() - Date.parse(p.creado) < 4 * 864e5) p = await revisarPago(env, p);
      // Máximo 2 guías por vuelta (límite de peticiones del plan gratis)
      if (p.estado === 'pagado' && p.entrega === 'envio' && !p.guia && guias < 2) {
        if (!cfg.origen || !cfg.contenido) continue;   // falta la configuración de envíos en Mi negocio
        guias++;
        await comprarGuia(env, cfg, p);
      } else if (p.estado === 'pagado' && p.entrega === 'recoger') {
        p.estado = 'listo_para_recoger'; await guardar(env, p);
      }
    } catch (e) {
      p.guia = Object.assign(p.guia || {}, { estado: 'failed', error: e.message });
      if (p.estado === 'pagado') p.estado = 'guia_error';
      await guardar(env, p).catch(() => {});
    }
  }
}

/* ---------- Rutas ---------- */
async function tienda(req, env, ruta, h) {
  if (!kvListo(env)) throw new Falla('La tienda aún no tiene pagos en línea activados.', 503);
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

  if (ruta === 'estado' && req.method === 'GET') {
    const cfg = await config(env);
    return json({ pagos: !!(env.CLIP_KEY && env.CLIP_SECRET), envios: !!(env.SKYDROPX_ID && cfg.origen && cfg.contenido), recoger: cfg.recoger !== false }, 200, h);
  }
  if (ruta === 'cotizar' && req.method === 'POST') {
    const cfg = await config(env);
    if (!cfg.origen) throw new Falla('Los envíos no están configurados todavía.', 503);
    const d = body.direccion || {};
    if (!/^\d{5}$/.test(String(d.cp || '').trim()) || !d.estado || !d.municipio || !d.colonia) throw new Falla('Escribe código postal, colonia, municipio y estado.');
    const items = await partidas(env, body.items);
    const c = await cotizar(env, cfg, d, items);
    // Las 6 más baratas, sin repetir la misma paquetería y servicio
    const vistas = new Set();
    const tarifas = c.rates.map(tarifa).sort((a, b) => a.total - b.total).filter(t => { const k = t.paqueteria + t.servicio; if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 6);
    return json({ cotizacion: c.id, tarifas }, 200, h);
  }
  if (ruta === 'pagar' && req.method === 'POST') {
    if (!env.CLIP_KEY || !env.CLIP_SECRET) throw new Falla('El pago en línea no está activado.', 503);
    const cli = body.cliente || {};
    if (!String(cli.nombre || '').trim() || String(cli.telefono || '').replace(/\D/g, '').length < 10) throw new Falla('Escribe tu nombre y tu WhatsApp (10 dígitos).');
    const items = await partidas(env, body.items);
    const subtotal = r2(items.reduce((a, it) => a + it.precio * it.cant, 0));
    const p = { id: nuevoId(), creado: new Date().toISOString(), estado: 'esperando_pago', cliente: { nombre: String(cli.nombre).trim().slice(0, 80), telefono: String(cli.telefono).replace(/\D/g, '').slice(-10), correo: String(cli.correo || '').trim().slice(0, 120) },
                entrega: body.entrega === 'envio' ? 'envio' : 'recoger', items, subtotal, envio: null, total: subtotal, nota: String(body.nota || '').slice(0, 500) };
    if (p.entrega === 'envio') {
      validarDireccion(body.direccion);
      p.direccion = Object.fromEntries(['nombre', 'telefono', 'correo', 'cp', 'calle', 'colonia', 'municipio', 'estado', 'referencia'].map(k => [k, String(body.direccion[k] || '').trim().slice(0, 120)]));
      // El costo del envío se toma de la cotización guardada en Skydropx, no del navegador
      const e = body.envio || {};
      const q = await sky(env, 'GET', `quotations/${encodeURIComponent(e.cotizacion || '')}`);
      const r = (q.rates || []).find(x => x.id === e.tarifa && x.success && x.total);
      if (!r) throw new Falla('La cotización del envío venció. Vuelve a cotizar.');
      p.envio = tarifa(r);
      p.total = r2(subtotal + p.envio.total);
    }
    const volver = new URL(String(body.volver || ''));
    if (!origenOk(volver.origin, env)) throw new Falla('Origen no permitido.', 403);
    const base = volver.origin + volver.pathname;
    const neg = ((await leerCatalogo(env)).negocio || {}).nombre || 'Tienda';
    const c = await clip(env, 'POST', '', {
      amount: p.total, currency: 'MXN', purchase_description: `${neg} · Pedido ${p.id}`.slice(0, 250),
      redirection_url: { success: `${base}?pago=ok&pedido=${p.id}`, error: `${base}?pago=error&pedido=${p.id}`, default: base },
      metadata: { external_reference: p.id, customer_info: { name: p.cliente.nombre, phone: +p.cliente.telefono, ...(p.cliente.correo ? { email: p.cliente.correo } : {}) } },
    });
    p.clip = { id: c.payment_request_id, url: c.payment_request_url, estado: c.status };
    await guardar(env, p);
    return json({ pedido: p.id, total: p.total, url: c.payment_request_url }, 200, h);
  }
  const m = /^pedido\/([\w-]+)$/.exec(ruta);
  if (m && req.method === 'GET') {
    let p = await leer(env, m[1]);
    if (!p) throw new Falla('Pedido no encontrado.', 404);
    p = await revisarPago(env, p).catch(() => p);
    return json(publico(p), 200, h);
  }
  throw new Falla('Ruta no encontrada.', 404);
}

async function erp(req, env, ruta, h) {
  if (!kvListo(env)) throw new Falla('Falta conectar el almacén PEDIDOS (KV) al conector.', 503);
  if (ruta === 'pedidos' && req.method === 'GET') {
    const lista = await env.PEDIDOS.list({ prefix: 'pedido:', limit: 200 });
    const pedidos = [];
    for (const k of lista.keys) { const v = await env.PEDIDOS.get(k.name); if (v) pedidos.push(JSON.parse(v)); }
    return json({ pedidos }, 200, h);
  }
  if (ruta === 'config' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const limpio = { origen: b.origen, paquete: b.paquete, contenido: String(b.contenido || ''), embalaje: String(b.embalaje || '4G'), pesoPieza: num(b.pesoPieza) || 0.5, recoger: b.recoger !== false };
    await env.PEDIDOS.put('config', JSON.stringify(limpio));
    return json({ ok: true }, 200, h);
  }
  if (ruta === 'config' && req.method === 'GET') return json(await config(env), 200, h);
  const m = /^pedidos\/([\w-]+)\/reintentar$/.exec(ruta);
  if (m && req.method === 'POST') {
    // El proceso automático lo vuelve a intentar en su siguiente vuelta
    const p = await leer(env, m[1]);
    if (!p) throw new Falla('Pedido no encontrado.', 404);
    if (p.guia && p.guia.estado === 'success') throw new Falla('Ese pedido ya tiene guía.');
    p.guia = null; if (p.estado === 'guia_error') p.estado = 'pagado';
    await guardar(env, p);
    return json({ ok: true }, 200, h);
  }
  throw new Falla('Ruta no encontrada.', 404);
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    try {
      if (url.pathname === '/' || url.pathname === '/estado') {
        return json({ ok: true, servicio: 'Conector Sublima Fácil', skydropx: !!(env.SKYDROPX_ID && env.SKYDROPX_SECRET), clip: !!(env.CLIP_KEY && env.CLIP_SECRET), pedidos: kvListo(env) }, 200, h);
      }
      const t = /^\/tienda\/(.+)$/.exec(url.pathname);
      if (t) return await tienda(req, env, t[1], h);

      // Lo demás es solo para Mi negocio
      if (!env.CLAVE || req.headers.get('X-Clave') !== env.CLAVE) return json({ error: 'Clave del conector incorrecta.' }, 401, h);
      const e = /^\/erp\/(.+)$/.exec(url.pathname);
      if (e) return await erp(req, env, e[1], h);
      const m = /^\/skydropx\/(.+)$/.exec(url.pathname);
      if (!m) return json({ error: 'Ruta no encontrada.' }, 404, h);
      if (!PERMITIDO.some(([met, re]) => met === req.method && re.test(m[1]))) return json({ error: 'Operación no permitida.' }, 403, h);
      const r = await fetch(`${skyBase(env)}/${m[1]}${url.search}`, {
        method: req.method, body: req.method === 'POST' ? await req.text() : undefined,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${await tokenSkydropx(env)}`, 'User-Agent': UA },
      });
      if (r.status === 401) token = null;
      return new Response(await r.text(), { status: r.status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (e) {
      return json({ error: e.message || 'Error en el conector.' }, e.status || 500, h);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(procesar(env));
  },
};
