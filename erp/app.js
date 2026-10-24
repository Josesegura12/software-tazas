/* ERP Sublima Fácil — sistema administrativo para negocio de sublimación e impresión 3D.
   Todo se guarda en este navegador (IndexedDB). Sin servidor. */
'use strict';

/* ================= Constantes y utilidades ================= */
const ESTADOS = ['Cotización', 'Anticipo', 'En diseño', 'En producción', 'Listo', 'Entregado', 'Cancelado'];
const PENDIENTES = ['Cotización', 'Anticipo', 'En diseño', 'En producción', 'Listo'];
const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta'];
const CAT_GASTO = ['Compra de insumos', 'Renta', 'Luz', 'Internet y teléfono', 'Publicidad', 'Envíos', 'Mantenimiento de equipo', 'Sueldos', 'Otros'];
const CAT_PROD = ['Tazas', 'Termos', 'Playeras', 'Cojines', 'Llaveros', 'Plumas', 'Impresión 3D', 'Otros'];
const STORES = ['clientes', 'productos', 'insumos', 'movimientos', 'pedidos', 'gastos', 'ajustes'];
const DB_NAME = 'erpSublimaFacil';
const DB_VER = 1;
const EDITOR_URL = '../index.html';
const NEG_DEF = {
  nombre: 'Mi Negocio de Sublimación', lema: 'Regalos personalizados que enamoran', logo: '',
  whatsapp: '', correo: '', direccion: '', mapsUrl: '', facebook: '', instagram: '', tiktok: '',
  bienvenida: '¡Hola! Bienvenido(a). Personalizamos tazas, termos, playeras, cojines y figuras 3D con tu diseño.',
  horarios: 'Lunes a viernes 10:00–19:00 · Sábado 10:00–14:00',
  notaPie: 'Precios en pesos mexicanos (MXN). El diseño se aprueba antes de producir. Se requiere 50% de anticipo para iniciar.'
};
const CALC_DEF = {
  modo: 'sub', s_insumos: 40, s_extra: 3, s_min: 4, s_watts: 1100, s_kwh: 3.5, s_mo_min: 10, s_mo_hora: 60, s_desgaste: 5, s_margen: 100,
  d_gramos: 60, d_kg: 400, d_horas: 3, d_hora: 6, d_mo_min: 15, d_mo_hora: 60, d_extra: 0, d_fallos: 10, d_margen: 150
};

const fmtMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const money = n => fmtMXN.format(Number(n) || 0);
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const r3 = n => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const today = () => ymd(new Date());
function parseYmd(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function fdate(s) {
  if (!s) return '—';
  const d = parseYmd(s);
  if (isNaN(d)) return esc(s);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fqty(n) { return String(r3(n)); }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function inicioSemana(s) { const d = parseYmd(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return ymd(d); }
function inicioMes(s) { return String(s).slice(0, 8) + '01'; }
function finMes(s) { const d = parseYmd(inicioMes(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return ymd(d); }
function telWa(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10) d = '52' + d;
  return d;
}
function waLink(tel, texto) {
  const t = telWa(tel);
  return 'https://wa.me/' + (t || '') + '?text=' + encodeURIComponent(texto);
}

/* ================= Avisos ================= */
function toast(msg, kind = 'ok', ms = 3800) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function ask(msg) { return window.confirm(msg); }
function fail(e, msg) {
  console.warn(e);
  toast(msg || 'Ups, algo salió mal. Intenta de nuevo; si sigue pasando, recarga la página.', 'bad', 6000);
}

/* ================= Base de datos (IndexedDB) ================= */
let db = null;
const S = { clientes: [], productos: [], insumos: [], movimientos: [], pedidos: [], gastos: [], ajustes: {} };

function openDB() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('sin indexedDB'));
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => {
      const d = r.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'ajustes' ? 'key' : 'id' }); });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('bloqueada'));
  });
}
function getAll(store) {
  return new Promise((res, rej) => {
    try {
      const r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function loadAll() {
  for (const s of STORES) {
    const rows = await getAll(s);
    if (s === 'ajustes') S.ajustes = Object.fromEntries(rows.map(r => [r.key, r.value]));
    else S[s] = rows;
  }
}
/* ops: [store, objeto] para guardar, o [store, id, true] para borrar. Todo en una sola transacción. */
function commit(ops) {
  return new Promise((res, rej) => {
    if (!ops.length) return res();
    const stores = [...new Set(ops.map(o => o[0]))];
    let t;
    try {
      t = db.transaction(stores, 'readwrite');
      for (const [s, v, del] of ops) {
        const os = t.objectStore(s);
        if (del) os.delete(v); else os.put(v);
      }
    } catch (e) { return rej(e); }
    t.oncomplete = () => {
      for (const [s, v, del] of ops) {
        if (s === 'ajustes') { if (del) delete S.ajustes[v]; else S.ajustes[v.key] = v.value; continue; }
        const arr = S[s];
        const id = del ? v : v.id;
        const i = arr.findIndex(x => x.id === id);
        if (del) { if (i >= 0) arr.splice(i, 1); } else if (i >= 0) arr[i] = v; else arr.push(v);
      }
      res();
    };
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('abortada'));
  });
}
const aj = (key, value) => ['ajustes', { key, value }];
const neg = () => Object.assign({}, NEG_DEF, S.ajustes.negocio || {});

/* ================= Datos de ejemplo ================= */
function seedOps() {
  const ins = [
    ['ej-taza11', 'Taza blanca 11 oz (sublimable)', 'pz', 28, 24, 6],
    ['ej-termo20', 'Termo acero 20 oz (sublimable)', 'pz', 95, 6, 2],
    ['ej-papel', 'Papel de sublimación (hoja carta)', 'hoja', 2.5, 100, 20],
    ['ej-tinta', 'Tinta de sublimación', 'ml', 0.9, 400, 80],
    ['ej-pl-ch', 'Playera poliéster blanca talla CH', 'pz', 62, 5, 2],
    ['ej-pl-m', 'Playera poliéster blanca talla M', 'pz', 62, 8, 3],
    ['ej-pl-g', 'Playera poliéster blanca talla G', 'pz', 65, 6, 3],
    ['ej-pl-xg', 'Playera poliéster blanca talla XG', 'pz', 68, 3, 2],
    ['ej-cojin', 'Funda de cojín 40×40 con relleno', 'pz', 75, 4, 2],
    ['ej-llavero', 'Llavero MDF sublimable', 'pz', 8, 40, 10],
    ['ej-pluma', 'Pluma sublimable', 'pz', 12, 20, 5],
    ['ej-pla', 'Filamento PLA', 'g', 0.4, 2000, 500],
    ['ej-caja', 'Caja / empaque de regalo', 'pz', 6, 30, 10],
    ['ej-cinta', 'Cinta térmica', 'cm', 0.05, 3300, 500]
  ].map(([id, nombre, unidad, costo, stock, minimo]) => ({ id, nombre, unidad, costo, stock, minimo, ejemplo: true }));
  const P = (id, nombre, categoria, precio, emoji, receta, costoExtra, tiempo, descripcion) =>
    ({ id, nombre, categoria, precio, emoji, receta: receta.map(([insumoId, cant]) => ({ insumoId, cant })), costoExtra, tiempo, descripcion, visible: true, foto: '', ejemplo: true });
  const prods = [
    P('ej-p-taza', 'Taza 11 oz personalizada', 'Tazas', 150, '☕', [['ej-taza11', 1], ['ej-papel', 1], ['ej-tinta', 2], ['ej-caja', 1], ['ej-cinta', 15]], 12, '1 día', 'Taza blanca de cerámica de 11 oz con tu foto, logo o frase. Apta para microondas.'),
    P('ej-p-termo', 'Termo 20 oz personalizado', 'Termos', 380, '🥤', [['ej-termo20', 1], ['ej-papel', 1], ['ej-tinta', 3], ['ej-cinta', 30]], 18, '2 días', 'Termo de acero inoxidable de doble pared, mantiene frío y caliente. Incluye tapa.'),
    P('ej-p-playera', 'Playera personalizada (talla M)', 'Playeras', 250, '👕', [['ej-pl-m', 1], ['ej-papel', 2], ['ej-tinta', 4]], 15, '1–2 días', 'Playera blanca de poliéster con diseño a todo color. Tallas CH a XG.'),
    P('ej-p-cojin', 'Cojín 40×40 personalizado', 'Cojines', 280, '🛋️', [['ej-cojin', 1], ['ej-papel', 2], ['ej-tinta', 5]], 15, '2 días', 'Cojín suave con relleno incluido y tu foto favorita. Ideal para regalo.'),
    P('ej-p-llavero', 'Llavero MDF personalizado', 'Llaveros', 45, '🔑', [['ej-llavero', 1], ['ej-papel', 0.25], ['ej-tinta', 0.5]], 5, '1 día', 'Llavero de MDF a doble cara con argolla metálica.'),
    P('ej-p-pluma', 'Pluma personalizada', 'Plumas', 40, '🖊️', [['ej-pluma', 1], ['ej-papel', 0.25], ['ej-tinta', 0.5]], 5, '1 día', 'Pluma con tu nombre o logo. Perfecta para eventos y empresas.'),
    P('ej-p-fig3d', 'Figura 3D (hasta 10 cm)', 'Impresión 3D', 220, '🧸', [['ej-pla', 60]], 35, '2–3 días', 'Figura impresa en 3D en PLA del color que elijas. Llaveros, toppers, macetas y más.')
  ];
  const cli = { id: 'ej-cli1', nombre: 'Cliente de ejemplo', whatsapp: '5512345678', correo: '', notas: 'Puedes borrar este cliente cuando quieras.', alta: today(), ejemplo: true };
  return [...ins.map(o => ['insumos', o]), ...prods.map(o => ['productos', o]), ['clientes', cli], aj('seeded', true), aj('folio', 0)];
}
function hayEjemplos() { return ['insumos', 'productos', 'clientes'].some(s => S[s].some(x => x.ejemplo)); }

/* ================= Cálculos de negocio ================= */
const insumo = id => S.insumos.find(i => i.id === id);
const producto = id => S.productos.find(p => p.id === id);
const cliente = id => S.clientes.find(c => c.id === id);
const pedido = id => S.pedidos.find(p => p.id === id);
function costoReceta(p) { return r2((p.receta || []).reduce((a, r) => { const i = insumo(r.insumoId); return a + (i ? num(i.costo) * num(r.cant) : 0); }, 0)); }
function costoProducto(p) { return r2(costoReceta(p) + num(p.costoExtra)); }
function tot(p) {
  const subtotal = r2((p.items || []).reduce((a, it) => a + num(it.cant) * num(it.precio), 0));
  const descuento = Math.min(num(p.descuento), subtotal);
  const total = r2(subtotal - descuento);
  const pagado = r2((p.pagos || []).reduce((a, x) => a + num(x.monto), 0));
  const costo = r2((p.items || []).reduce((a, it) => a + num(it.cant) * num(it.costo), 0));
  return { subtotal, descuento, total, pagado, saldo: r2(Math.max(0, total - pagado)), costo };
}
const esVenta = p => p.estado !== 'Cotización' && p.estado !== 'Cancelado';
const fVenta = p => String(p.fechaVenta || p.fecha || '').slice(0, 10);
const nomCliente = p => { const c = cliente(p.clienteId); return c ? c.nombre : (p.clienteNombre || 'Público en general'); };
const telCliente = p => { const c = cliente(p.clienteId); return c ? c.whatsapp : (p.clienteTel || ''); };
const stCls = e => 'st st-' + Math.max(0, ESTADOS.indexOf(e));
const stBadge = e => `<span class="${stCls(e)}">${esc(e)}</span>`;
const stockBajo = i => num(i.stock) <= num(i.minimo);
function ventasRango(d, h) { return S.pedidos.filter(p => esVenta(p) && fVenta(p) >= d && fVenta(p) <= h); }
function gastosRango(d, h) { return S.gastos.filter(g => g.fecha >= d && g.fecha <= h); }
function resumen(d, h) {
  const vs = ventasRango(d, h);
  const ventas = r2(vs.reduce((a, p) => a + tot(p).total, 0));
  const costo = r2(vs.reduce((a, p) => a + tot(p).costo, 0));
  const gs = gastosRango(d, h);
  const gastosOp = r2(gs.filter(g => g.categoria !== 'Compra de insumos').reduce((a, g) => a + num(g.monto), 0));
  const compras = r2(gs.filter(g => g.categoria === 'Compra de insumos').reduce((a, g) => a + num(g.monto), 0));
  const cobrado = r2(S.pedidos.reduce((a, p) => a + (p.pagos || []).filter(x => x.fecha >= d && x.fecha <= h).reduce((b, x) => b + num(x.monto), 0), 0));
  return { vs, ventas, costo, gastosOp, compras, cobrado, utilidad: r2(ventas - costo - gastosOp), n: vs.length };
}
/* Operaciones para descontar (signo -1) o regresar (+1) insumos según la receta de cada partida */
function opsInventario(p, signo) {
  const need = {};
  for (const it of p.items || []) {
    const prod = producto(it.productoId);
    if (!prod) continue;
    for (const r of prod.receta || []) need[r.insumoId] = (need[r.insumoId] || 0) + num(r.cant) * num(it.cant);
  }
  const ops = [];
  for (const id of Object.keys(need)) {
    const base = insumo(id);
    if (!base || !need[id]) continue;
    const ins = clone(base);
    ins.stock = r3(num(ins.stock) + signo * need[id]);
    ops.push(['insumos', ins]);
    ops.push(['movimientos', {
      id: uid(), insumoId: id, tipo: signo < 0 ? 'salida' : 'entrada', cant: r3(signo * need[id]), fecha: today(),
      nota: (signo < 0 ? 'Salida por pedido #' : 'Devolución de pedido #') + p.folio, pedidoId: p.id
    }]);
  }
  return ops;
}
function avisarStockBajo(ops) {
  const bajos = ops.filter(o => o[0] === 'insumos' && stockBajo(o[1])).map(o => o[1].nombre);
  if (bajos.length) toast('⚠️ Stock bajo: ' + bajos.join(', '), 'warn', 6000);
}

/* ================= Imágenes y archivos ================= */
function fileToDataURL(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
}
function reduceImage(src, max, type = 'image/jpeg', q = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * s));
        c.height = Math.max(1, Math.round(img.naturalHeight * s));
        const ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL(type, q));
      } catch (e) { rej(e); }
    };
    img.onerror = () => rej(new Error('imagen inválida'));
    img.src = src;
  });
}
function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function csv(rows) {
  return '﻿' + rows.map(r => r.map(v => {
    v = String(v ?? '');
    return /[",\n;\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');
}

/* ================= Modal ================= */
const modal = () => $('#modal');
function openModal(title, body, foot = '', wide = false) {
  const m = modal();
  m.style.width = wide ? 'min(980px, calc(100vw - 20px))' : '';
  m.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="xbtn" type="button" aria-label="Cerrar" onclick="App.close()">×</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
  if (!m.open) { try { m.showModal(); } catch (e) { m.setAttribute('open', ''); } }
  m.scrollTop = 0;
  const first = m.querySelector('.modal-body input:not([type=hidden]):not([type=file]), .modal-body select, .modal-body textarea');
  if (first && window.matchMedia('(min-width: 821px)').matches) setTimeout(() => first.focus(), 30);
  return m;
}
function closeModal() { const m = modal(); if (m.open) { try { m.close(); } catch (e) { m.removeAttribute('open'); } } m.innerHTML = ''; }
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  return o;
}
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;

/* ================= Navegación ================= */
const App = {};
window.App = App;
let VIEW = 'panel';
const VIEWS = {};
function go(v) {
  if (!VIEWS[v]) v = 'panel';
  VIEW = v;
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#nav').classList.remove('open');
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  render();
  window.scrollTo(0, 0);
}
function render() {
  try { $('#main').innerHTML = VIEWS[VIEW](); if (VIEWS[VIEW].after) VIEWS[VIEW].after(); }
  catch (e) { fail(e, 'No se pudo mostrar esta sección.'); }
}
function refreshBrand() {
  const n = neg();
  $('#brandName').textContent = n.nombre;
  $('#brandLogo').innerHTML = n.logo ? `<img src="${esc(n.logo)}" alt="">` : esc((n.nombre || 'S').trim().charAt(0).toUpperCase() || 'S');
  document.title = n.nombre + ' · Administración';
}
App.go = go;
App.close = closeModal;

function pageHead(title, sub, actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="btns">${actions}</div></div>`;
}
function emptyMsg(icon, msg) { return `<div class="empty-msg"><span class="big">${icon}</span>${msg}</div>`; }

/* ================= Gráfica de barras (SVG) ================= */
function barChart(labels, values) {
  const W = 640, H = 220, pl = 54, pb = 26, pt = 12;
  const max = Math.max(1, ...values);
  const step = (W - pl - 8) / Math.max(1, values.length);
  const bw = Math.max(4, step * 0.68);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const y = pt + (H - pt - pb) * (1 - k / 4);
    g += `<line class="gl" x1="${pl}" x2="${W - 4}" y1="${y}" y2="${y}"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end">${esc(compact(max * k / 4))}</text>`;
  }
  values.forEach((v, i) => {
    const h = (H - pt - pb) * (v / max);
    const x = pl + i * step + (step - bw) / 2;
    g += `<rect class="bar" x="${x.toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="4"><title>${esc(labels[i])}: ${esc(money(v))}</title></rect>`;
    if (values.length <= 16 || i % 2 === 0) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gráfica de ventas">
    <defs><linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2187a"/><stop offset="1" stop-color="#7b2ff7"/></linearGradient></defs>${g}</svg></div>`;
}
function compact(n) { return n >= 1000 ? '$' + (Math.round(n / 100) / 10) + 'k' : '$' + Math.round(n); }

/* ================= 1. PANEL ================= */
let chartMode = 'dias';
VIEWS.panel = () => {
  const t = today();
  const vHoy = resumen(t, t), vSem = resumen(inicioSemana(t), t), vMes = resumen(inicioMes(t), t);
  const last = S.ajustes.ultimoRespaldo;
  const diasResp = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
  let alerts = '';
  if (diasResp === null || diasResp >= 7) {
    alerts += `<div class="alert warn"><span>💾</span><div class="grow"><b>Haz un respaldo.</b> ${diasResp === null ? 'Aún no has descargado ningún respaldo.' : `Tu último respaldo fue hace ${diasResp} días.`} Tus datos viven solo en este navegador: si se borra el historial o cambias de computadora, podrías perderlos.</div><button class="btn primary sm" onclick="App.exportar()">Descargar respaldo</button></div>`;
  }
  if (hayEjemplos()) {
    alerts += `<div class="alert info"><span>🧪</span><div class="grow">Hay <b>datos de ejemplo</b> (marcados como <span class="badge ej">Ejemplo</span>) para que pruebes el sistema. Cuando estés listo, bórralos o edítalos con tus datos reales.</div><button class="btn sm" onclick="App.borrarEjemplos()">Borrar ejemplos</button></div>`;
  }
  const pend = PENDIENTES.map(e => ({ e, n: S.pedidos.filter(p => p.estado === e).length }));
  const prox = S.pedidos.filter(p => PENDIENTES.includes(p.estado) && p.estado !== 'Cotización' && p.fechaEntrega && p.fechaEntrega <= addDays(t, 7))
    .sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
  const bajos = S.insumos.filter(stockBajo);
  let labels = [], vals = [];
  if (chartMode === 'dias') {
    for (let i = 13; i >= 0; i--) { const d = addDays(t, -i); labels.push(String(parseYmd(d).getDate())); vals.push(resumen(d, d).ventas); }
  } else {
    const base = parseYmd(inicioMes(t));
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const s = ymd(d);
      labels.push(MESES[d.getMonth()].slice(0, 3)); vals.push(resumen(s, finMes(s)).ventas);
    }
  }
  return pageHead(`¡Hola! 👋`, `Resumen de ${esc(neg().nombre)} · ${fdate(t)}`,
    `<button class="btn primary" onclick="App.go('pos')">💵 Venta rápida</button><button class="btn" onclick="App.formPedido(null,'cotizacion')">📝 Nueva cotización</button>`) +
    alerts +
    `<div class="grid g4">
      <div class="card stat"><div class="lbl">Ventas de hoy</div><div class="val">${money(vHoy.ventas)}</div><div class="sub">${vHoy.n} venta(s)</div></div>
      <div class="card stat"><div class="lbl">Esta semana</div><div class="val">${money(vSem.ventas)}</div><div class="sub">${vSem.n} venta(s)</div></div>
      <div class="card stat"><div class="lbl">Este mes</div><div class="val">${money(vMes.ventas)}</div><div class="sub">Cobrado: ${money(vMes.cobrado)}</div></div>
      <div class="card stat hl"><div class="lbl">Utilidad del mes</div><div class="val">${money(vMes.utilidad)}</div><div class="sub">Ventas − insumos − gastos</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="page-head" style="margin:0 0 6px"><h2 style="margin:0">Ventas</h2>
        <div class="seg"><button class="${chartMode === 'dias' ? 'on' : ''}" onclick="App.chart('dias')">14 días</button><button class="${chartMode === 'meses' ? 'on' : ''}" onclick="App.chart('meses')">6 meses</button></div></div>
        ${barChart(labels, vals)}</div>
      <div class="card"><h2>Pedidos pendientes</h2>
        <ul class="list">${pend.map(x => `<li><span>${stBadge(x.e)}</span><a href="#pedidos" onclick="App.filtroEstado('${esc(x.e)}');return false;"><b>${x.n}</b> ${x.n === 1 ? 'pedido' : 'pedidos'}</a></li>`).join('')}</ul>
      </div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><h2>📅 Entregas próximas (7 días)</h2>
        ${prox.length ? `<ul class="list">${prox.map(p => `<li><span><a href="#" onclick="App.verPedido('${p.id}');return false;">#${p.folio} ${esc(nomCliente(p))}</a><br><span class="small muted">${esc(resumenItems(p))}</span></span>
          <span class="right"><span class="badge ${p.fechaEntrega < t ? 'bad' : p.fechaEntrega === t ? 'warn' : ''}">${p.fechaEntrega < t ? 'Atrasado · ' : p.fechaEntrega === t ? 'Hoy · ' : ''}${fdate(p.fechaEntrega)}</span><br>${stBadge(p.estado)}</span></li>`).join('')}</ul>` : emptyMsg('🎉', 'No hay entregas en los próximos 7 días.')}
      </div>
      <div class="card"><h2>📦 Insumos con stock bajo</h2>
        ${bajos.length ? `<ul class="list">${bajos.map(i => `<li><span>${esc(i.nombre)}</span><span class="badge bad">${fqty(i.stock)} ${esc(i.unidad)} (mín. ${fqty(i.minimo)})</span></li>`).join('')}</ul>
          <button class="btn sm mt" onclick="App.go('inventario')">Ir a inventario</button>` : emptyMsg('✅', 'Todo tu inventario está bien surtido.')}
      </div>
    </div>`;
};
App.chart = m => { chartMode = m; render(); };
function resumenItems(p) { return (p.items || []).map(it => `${fqty(it.cant)}× ${it.nombre}`).join(', '); }

/* ================= 2. CLIENTES ================= */
let qCli = '';
function statsCliente(id) {
  const ps = S.pedidos.filter(p => p.clienteId === id);
  const vs = ps.filter(esVenta);
  return { ps, n: vs.length, total: r2(vs.reduce((a, p) => a + tot(p).total, 0)), ultimo: vs.map(fVenta).sort().pop() || '' };
}
VIEWS.clientes = () => {
  const q = qCli.toLowerCase();
  const rows = S.clientes.filter(c => !q || [c.nombre, c.whatsapp, c.correo, c.notas].join(' ').toLowerCase().includes(q))
    .map(c => ({ c, s: statsCliente(c.id) })).sort((a, b) => a.c.nombre.localeCompare(b.c.nombre, 'es'));
  return pageHead('Clientes', `${S.clientes.length} cliente(s) registrados`, `<button class="btn primary" onclick="App.formCliente()">+ Nuevo cliente</button>`) +
    `<div class="toolbar"><input type="search" id="qCli" placeholder="🔍 Buscar por nombre, WhatsApp o correo…" value="${esc(qCli)}"></div>` +
    (rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>WhatsApp</th><th class="num">Pedidos</th><th class="num">Total comprado</th><th>Última compra</th></tr></thead><tbody>
      ${rows.map(({ c, s }) => `<tr class="click" onclick="App.verCliente('${c.id}')"><td><b>${esc(c.nombre)}</b> ${c.ejemplo ? '<span class="badge ej">Ejemplo</span>' : ''}</td><td>${esc(c.whatsapp || '—')}</td><td class="num">${s.n}</td><td class="num">${money(s.total)}</td><td>${fdate(s.ultimo)}</td></tr>`).join('')}
      </tbody></table></div>` : emptyMsg('👥', q ? 'No encontré clientes con esa búsqueda.' : 'Aún no tienes clientes. ¡Agrega el primero!'));
};
VIEWS.clientes.after = () => {
  const i = $('#qCli');
  if (i) i.oninput = () => { qCli = i.value; const pos = i.selectionStart; render(); const n = $('#qCli'); n.focus(); n.setSelectionRange(pos, pos); };
};
function clienteFormHtml(c) {
  return `<form id="mf" class="fgrid">
    <div class="full"><label class="f">Nombre *</label><input name="nombre" required value="${esc(c.nombre)}" placeholder="Ej. María López"></div>
    <div><label class="f">WhatsApp (10 dígitos)</label><input name="whatsapp" inputmode="tel" value="${esc(c.whatsapp)}" placeholder="Ej. 5512345678"></div>
    <div><label class="f">Correo</label><input name="correo" type="email" value="${esc(c.correo)}" placeholder="opcional"></div>
    <div class="full"><label class="f">Notas</label><textarea name="notas" placeholder="Gustos, dirección de entrega, fechas importantes…">${esc(c.notas)}</textarea></div>
  </form>`;
}
App.formCliente = (id) => {
  const c = id ? clone(cliente(id)) : { id: uid(), nombre: '', whatsapp: '', correo: '', notas: '', alta: today() };
  openModal(id ? 'Editar cliente' : 'Nuevo cliente', clienteFormHtml(c),
    `<button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`);
  $('#mf').onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    if (!d.nombre) return toast('Escribe el nombre del cliente', 'warn');
    Object.assign(c, d);
    try { await commit([['clientes', c]]); toast('Cliente guardado'); closeModal(); render(); }
    catch (e) { fail(e, 'No se pudo guardar el cliente.'); }
  };
};
App.verCliente = (id) => {
  const c = cliente(id);
  if (!c) return;
  const s = statsCliente(id);
  const hist = s.ps.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  openModal(esc(c.nombre), `
    <div class="grid g3 mb">
      <div class="card stat"><div class="lbl">Total comprado</div><div class="val">${money(s.total)}</div></div>
      <div class="card stat"><div class="lbl">Pedidos</div><div class="val">${s.n}</div></div>
      <div class="card stat"><div class="lbl">Última compra</div><div class="val" style="font-size:16px">${fdate(s.ultimo)}</div></div>
    </div>
    <p class="mb">📱 ${esc(c.whatsapp || 'Sin WhatsApp')} ${c.correo ? ' · ✉️ ' + esc(c.correo) : ''}</p>
    ${c.notas ? `<p class="muted mb">📝 ${esc(c.notas)}</p>` : ''}
    <h3>Historial de pedidos</h3>
    ${hist.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Folio</th><th>Fecha</th><th>Estado</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead><tbody>
      ${hist.map(p => { const t = tot(p); return `<tr class="click" onclick="App.verPedido('${p.id}')"><td>#${p.folio}</td><td>${fdate(p.fecha)}</td><td>${stBadge(p.estado)}</td><td class="num">${money(t.total)}</td><td class="num">${money(t.saldo)}</td></tr>`; }).join('')}
    </tbody></table></div>` : emptyMsg('🛍️', 'Este cliente aún no tiene pedidos.')}`,
    `<button class="btn danger" type="button" onclick="App.borrarCliente('${id}')">Borrar</button><span class="spacer"></span>
     ${c.whatsapp ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(c.whatsapp, '¡Hola ' + c.nombre + '! '))}">WhatsApp</a>` : ''}
     <button class="btn" type="button" onclick="App.formCliente('${id}')">Editar</button>
     <button class="btn primary" type="button" onclick="App.formPedido(null,'cotizacion','${id}')">+ Cotización</button>`);
};
App.borrarCliente = async (id) => {
  const c = cliente(id);
  const n = S.pedidos.filter(p => p.clienteId === id).length;
  if (!ask(`¿Borrar a "${c.nombre}"?${n ? `\nSus ${n} pedido(s) se conservan con su nombre.` : ''}`)) return;
  try {
    const ops = S.pedidos.filter(p => p.clienteId === id).map(p => { const q = clone(p); q.clienteNombre = c.nombre; q.clienteTel = c.whatsapp; q.clienteId = ''; return ['pedidos', q]; });
    await commit([...ops, ['clientes', id, true]]);
    toast('Cliente borrado'); closeModal(); render();
  } catch (e) { fail(e, 'No se pudo borrar el cliente.'); }
};

/* ================= 3. PRODUCTOS ================= */
let qProd = '', catProd = '';
const categorias = () => [...new Set([...CAT_PROD, ...S.productos.map(p => p.categoria).filter(Boolean)])];
function prodImg(p) { return p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : esc(p.emoji || '🎁'); }
VIEWS.productos = () => {
  const q = qProd.toLowerCase();
  const list = S.productos.filter(p => (!catProd || p.categoria === catProd) && (!q || (p.nombre + ' ' + p.descripcion + ' ' + p.categoria).toLowerCase().includes(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return pageHead('Productos', 'Tu catálogo: precios, costos, recetas de insumos y qué se ve en la tienda.', `<button class="btn primary" onclick="App.formProducto()">+ Nuevo producto</button>`) +
    `<div class="toolbar"><input type="search" id="qProd" placeholder="🔍 Buscar producto…" value="${esc(qProd)}">
      <select id="catProd">${opt('', 'Todas las categorías', !catProd)}${categorias().map(c => opt(c, c, c === catProd)).join('')}</select></div>` +
    (list.length ? `<div class="pgrid">${list.map(p => {
      const c = costoProducto(p), m = num(p.precio) - c;
      return `<div class="pcard" onclick="App.formProducto('${p.id}')"><div class="pimg">${prodImg(p)}${p.ejemplo ? '<span class="badge ej">Ejemplo</span>' : ''}</div>
      <div class="pbody"><b>${esc(p.nombre)}</b><span class="small muted">${esc(p.categoria || '')} ${p.visible ? '· 🛍️ En tienda' : '· 🙈 Oculto'}</span>
      <span class="pprice">${money(p.precio)}</span><span class="small muted">Costo ${money(c)} · Ganas <b style="color:${m >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(m)}</b></span></div></div>`;
    }).join('')}</div>` : emptyMsg('☕', 'No hay productos aquí. Agrega tu primer producto.'));
};
VIEWS.productos.after = () => {
  const i = $('#qProd');
  i.oninput = () => { qProd = i.value; const pos = i.selectionStart; render(); const n = $('#qProd'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#catProd').onchange = e => { catProd = e.target.value; render(); };
};
function recetaRow(r = {}) {
  return `<div class="line-row rec"><select class="rc-ins">${opt('', '— Insumo —', !r.insumoId)}${S.insumos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(i => opt(i.id, `${i.nombre} (${i.unidad})`, i.id === r.insumoId)).join('')}</select>
    <input class="rc-cant" type="number" step="any" min="0" placeholder="Cant." value="${r.cant ?? 1}"><button type="button" class="x" title="Quitar">×</button></div>`;
}
App.formProducto = (id, preset) => {
  const p = id ? clone(producto(id)) : Object.assign({ id: uid(), nombre: '', categoria: catProd || 'Tazas', precio: '', emoji: '🎁', receta: [], costoExtra: 0, tiempo: '1 día', descripcion: '', visible: true, foto: '' }, preset || {});
  let foto = p.foto || '';
  openModal(id ? 'Editar producto' : 'Nuevo producto', `<form id="mf">
    <div class="fgrid">
      <div class="full" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div class="photo-prev" id="fPrev">${prodImg(p)}</div>
        <div><label class="btn sm">📷 ${foto ? 'Cambiar foto' : 'Subir foto'}<input type="file" id="fFoto" accept="image/*" hidden></label>
        <button type="button" class="btn sm" id="fQuitar" ${foto ? '' : 'hidden'}>Quitar foto</button>
        <div class="hint">Se guarda reducida para no ocupar espacio. Si no hay foto se usa el emoji.</div></div>
      </div>
      <div class="full"><label class="f">Nombre *</label><input name="nombre" required value="${esc(p.nombre)}" placeholder="Ej. Taza mágica 11 oz"></div>
      <div><label class="f">Categoría</label><input name="categoria" list="dlCat" value="${esc(p.categoria)}"><datalist id="dlCat">${categorias().map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label class="f">Emoji (si no hay foto)</label><input name="emoji" value="${esc(p.emoji)}" maxlength="4"></div>
      <div><label class="f">Precio de venta (MXN) *</label><input name="precio" type="number" step="0.01" min="0" required value="${esc(p.precio)}"></div>
      <div><label class="f">Tiempo de producción</label><input name="tiempo" value="${esc(p.tiempo)}" placeholder="Ej. 1 día"></div>
      <div class="full"><label class="f">Descripción (se ve en la tienda)</label><textarea name="descripcion">${esc(p.descripcion)}</textarea></div>
      <div class="full"><label class="check"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> Mostrar en la tienda en línea</label></div>
    </div>
    <h3 class="mt">🧾 Receta: insumos que consume 1 pieza</h3>
    <p class="hint" style="margin-top:-4px">Ej. 1 taza blanca + 1 hoja de papel + 2 ml de tinta. Se descuentan del inventario al pasar el pedido a "En producción".</p>
    <div class="lines" id="rcLines">${(p.receta.length ? p.receta : [{}]).map(recetaRow).join('')}</div>
    <button type="button" class="btn sm mt" id="rcAdd">+ Agregar insumo</button>
    <div class="fgrid mt"><div><label class="f">Otros costos por pieza (luz, mano de obra, desgaste)</label><input name="costoExtra" type="number" step="0.01" min="0" value="${esc(p.costoExtra)}"><div class="hint">Puedes calcularlo en la Calculadora de precios.</div></div>
    <div class="result-box" id="rcRes"></div></div>
  </form>`,
  `${id ? `<button class="btn danger" type="button" onclick="App.borrarProducto('${id}')">Borrar</button>` : ''}<span class="spacer"></span>
   <button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`);
  const f = $('#mf');
  const readReceta = () => $$('#rcLines .line-row').map(r => ({ insumoId: $('.rc-ins', r).value, cant: num($('.rc-cant', r).value) })).filter(r => r.insumoId && r.cant > 0);
  const recalc = () => {
    const tmp = { receta: readReceta(), costoExtra: num(f.costoExtra.value) };
    const c = costoProducto(tmp), pr = num(f.precio.value), g = pr - c;
    $('#rcRes').innerHTML = `Costo insumos: <b>${money(costoReceta(tmp))}</b><br>Costo total: <b>${money(c)}</b><br>Ganancia por pieza: <b style="color:${g >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(g)}</b>${pr > 0 ? ` (${Math.round(g / pr * 100)}% del precio)` : ''}`;
  };
  f.addEventListener('input', recalc);
  f.addEventListener('change', recalc);
  $('#rcAdd').onclick = () => { $('#rcLines').insertAdjacentHTML('beforeend', recetaRow({ cant: 1 })); recalc(); };
  $('#rcLines').onclick = e => { if (e.target.classList.contains('x')) { e.target.closest('.line-row').remove(); recalc(); } };
  $('#fFoto').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try { foto = await reduceImage(await fileToDataURL(file), 600, 'image/jpeg', 0.8); $('#fPrev').innerHTML = `<img src="${foto}" alt="">`; $('#fQuitar').hidden = false; }
    catch (err) { fail(err, 'No pude leer esa imagen. Prueba con una foto JPG o PNG.'); }
  };
  $('#fQuitar').onclick = () => { foto = ''; $('#fPrev').textContent = f.emoji.value || '🎁'; $('#fQuitar').hidden = true; };
  recalc();
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(f);
    if (!d.nombre) return toast('Escribe el nombre del producto', 'warn');
    Object.assign(p, { nombre: d.nombre, categoria: d.categoria || 'Otros', emoji: d.emoji || '🎁', precio: r2(num(d.precio)), tiempo: d.tiempo, descripcion: d.descripcion, visible: d.visible, costoExtra: r2(num(d.costoExtra)), receta: readReceta(), foto });
    try { await commit([['productos', p]]); toast('Producto guardado'); closeModal(); render(); }
    catch (e) { fail(e, 'No se pudo guardar el producto. Si subiste una foto muy grande, intenta con otra.'); }
  };
};
App.borrarProducto = async id => {
  const p = producto(id);
  if (!ask(`¿Borrar el producto "${p.nombre}"?\nLos pedidos anteriores no se afectan.`)) return;
  try { await commit([['productos', id, true]]); toast('Producto borrado'); closeModal(); render(); }
  catch (e) { fail(e, 'No se pudo borrar el producto.'); }
};

/* ================= 4. INVENTARIO ================= */
let invTab = 'insumos', qIns = '', movFiltro = '';
VIEWS.inventario = () => {
  const head = pageHead('Inventario de insumos', 'Material en bodega. Se descuenta solo cuando un pedido pasa a "En producción" o "Entregado".',
    `<button class="btn primary" onclick="App.formInsumo()">+ Nuevo insumo</button>`) +
    `<div class="toolbar"><div class="seg"><button class="${invTab === 'insumos' ? 'on' : ''}" onclick="App.invTab('insumos')">📦 Insumos</button><button class="${invTab === 'mov' ? 'on' : ''}" onclick="App.invTab('mov')">🔁 Movimientos</button></div>`;
  if (invTab === 'mov') {
    const movs = S.movimientos.filter(m => !movFiltro || m.insumoId === movFiltro).sort((a, b) => (b.fecha + b.id).localeCompare(a.fecha + a.id)).slice(0, 400);
    return head + `<select id="movFiltro">${opt('', 'Todos los insumos', !movFiltro)}${S.insumos.map(i => opt(i.id, i.nombre, i.id === movFiltro)).join('')}</select></div>` +
      (movs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th class="num">Cantidad</th><th>Nota</th></tr></thead><tbody>
      ${movs.map(m => { const i = insumo(m.insumoId); return `<tr><td class="nowrap">${fdate(m.fecha)}</td><td>${esc(i ? i.nombre : '(insumo borrado)')}</td><td>${m.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : m.tipo === 'salida' ? '<span class="badge bad">Salida</span>' : '<span class="badge warn">Ajuste</span>'}</td>
        <td class="num">${m.cant > 0 ? '+' : ''}${fqty(m.cant)} ${esc(i ? i.unidad : '')}</td><td>${esc(m.nota || '')}</td></tr>`; }).join('')}</tbody></table></div>` : emptyMsg('🔁', 'Todavía no hay movimientos.'));
  }
  const q = qIns.toLowerCase();
  const list = S.insumos.filter(i => !q || i.nombre.toLowerCase().includes(q)).sort((a, b) => (stockBajo(b) - stockBajo(a)) || a.nombre.localeCompare(b.nombre, 'es'));
  const valor = S.insumos.reduce((a, i) => a + Math.max(0, num(i.stock)) * num(i.costo), 0);
  return head + `<input type="search" id="qIns" placeholder="🔍 Buscar insumo…" value="${esc(qIns)}"></div>
    <p class="muted small">Valor del inventario: <b>${money(valor)}</b> · ${S.insumos.filter(stockBajo).length} con stock bajo</p>` +
    (list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Insumo</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Costo unit.</th><th></th></tr></thead><tbody>
    ${list.map(i => `<tr class="${stockBajo(i) ? 'low' : ''}"><td><b>${esc(i.nombre)}</b> ${i.ejemplo ? '<span class="badge ej">Ejemplo</span>' : ''} ${stockBajo(i) ? '<span class="badge bad">Stock bajo</span>' : ''}</td>
      <td class="num"><b>${fqty(i.stock)}</b> ${esc(i.unidad)}</td><td class="num">${fqty(i.minimo)}</td><td class="num">${money(i.costo)}</td>
      <td class="right"><div class="btns" style="justify-content:flex-end"><button class="btn sm ok" onclick="App.movimiento('${i.id}','entrada')">+ Entrada</button><button class="btn sm" onclick="App.movimiento('${i.id}','ajuste')">Ajustar</button><button class="btn sm" onclick="App.verMovs('${i.id}')">Historial</button><button class="btn sm" onclick="App.formInsumo('${i.id}')">✏️</button></div></td></tr>`).join('')}
    </tbody></table></div>` : emptyMsg('📦', 'No hay insumos. Agrega tazas, papel, tinta, filamento…'));
};
VIEWS.inventario.after = () => {
  const i = $('#qIns');
  if (i) i.oninput = () => { qIns = i.value; const pos = i.selectionStart; render(); const n = $('#qIns'); n.focus(); n.setSelectionRange(pos, pos); };
  const m = $('#movFiltro');
  if (m) m.onchange = () => { movFiltro = m.value; render(); };
};
App.invTab = t => { invTab = t; render(); };
App.verMovs = id => { movFiltro = id; invTab = 'mov'; render(); };
App.formInsumo = id => {
  const i = id ? clone(insumo(id)) : { id: uid(), nombre: '', unidad: 'pz', costo: '', stock: 0, minimo: 0 };
  openModal(id ? 'Editar insumo' : 'Nuevo insumo', `<form id="mf" class="fgrid">
    <div class="full"><label class="f">Nombre *</label><input name="nombre" required value="${esc(i.nombre)}" placeholder="Ej. Taza blanca 11 oz"></div>
    <div><label class="f">Unidad</label><input name="unidad" list="dlUni" value="${esc(i.unidad)}"><datalist id="dlUni"><option value="pz"><option value="hoja"><option value="ml"><option value="g"><option value="m"><option value="cm"></datalist></div>
    <div><label class="f">Costo por unidad (MXN)</label><input name="costo" type="number" step="0.001" min="0" value="${esc(i.costo)}"><div class="hint">Ej. paquete de 100 hojas en $250 → 2.50</div></div>
    ${id ? `<div><label class="f">Stock actual</label><input value="${fqty(i.stock)} ${esc(i.unidad)}" disabled><div class="hint">Para cambiarlo usa "+ Entrada" o "Ajustar" (queda en el historial).</div></div>`
      : `<div><label class="f">Stock inicial</label><input name="stock" type="number" step="any" min="0" value="0"></div>`}
    <div><label class="f">Stock mínimo (te avisa)</label><input name="minimo" type="number" step="any" min="0" value="${esc(i.minimo)}"></div>
  </form>`, `${id ? `<button class="btn danger" type="button" onclick="App.borrarInsumo('${id}')">Borrar</button>` : ''}<span class="spacer"></span>
  <button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`);
  $('#mf').onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    if (!d.nombre) return toast('Escribe el nombre del insumo', 'warn');
    Object.assign(i, { nombre: d.nombre, unidad: d.unidad || 'pz', costo: num(d.costo), minimo: num(d.minimo) });
    const ops = [];
    if (!id) {
      i.stock = num(d.stock);
      if (i.stock) ops.push(['movimientos', { id: uid(), insumoId: i.id, tipo: 'entrada', cant: i.stock, fecha: today(), nota: 'Inventario inicial' }]);
    }
    ops.unshift(['insumos', i]);
    try { await commit(ops); toast('Insumo guardado'); closeModal(); render(); }
    catch (e) { fail(e, 'No se pudo guardar el insumo.'); }
  };
};
App.borrarInsumo = async id => {
  const i = insumo(id);
  const usos = S.productos.filter(p => (p.receta || []).some(r => r.insumoId === id)).map(p => p.nombre);
  if (!ask(`¿Borrar "${i.nombre}"?${usos.length ? `\nSe quitará de la receta de: ${usos.join(', ')}.` : ''}`)) return;
  const ops = S.productos.filter(p => (p.receta || []).some(r => r.insumoId === id)).map(p => { const q = clone(p); q.receta = q.receta.filter(r => r.insumoId !== id); return ['productos', q]; });
  try { await commit([...ops, ['insumos', id, true]]); toast('Insumo borrado'); closeModal(); render(); }
  catch (e) { fail(e, 'No se pudo borrar el insumo.'); }
};
/* Compra de insumo: suma stock, registra movimiento y (opcional) gasto */
function opsCompra(insumoId, cant, monto, actualizarCosto, nota, fecha, conGasto) {
  const ins = clone(insumo(insumoId));
  ins.stock = r3(num(ins.stock) + cant);
  if (actualizarCosto && monto > 0 && cant > 0) ins.costo = r3(monto / cant);
  const movId = uid();
  const ops = [['insumos', ins], ['movimientos', { id: movId, insumoId, tipo: 'entrada', cant: r3(cant), fecha, nota: nota || 'Compra' }]];
  if (conGasto && monto > 0) ops.push(['gastos', { id: uid(), fecha, categoria: 'Compra de insumos', monto: r2(monto), nota: `${fqty(cant)} ${ins.unidad} de ${ins.nombre}${nota ? ' · ' + nota : ''}`, insumoId, cant: r3(cant), movId }]);
  return ops;
}
App.movimiento = (id, tipo) => {
  const i = insumo(id);
  openModal(`Movimiento: ${esc(i.nombre)}`, `<form id="mf" class="fgrid">
    <div class="full"><p class="muted" style="margin:0">Stock actual: <b>${fqty(i.stock)} ${esc(i.unidad)}</b></p></div>
    <div><label class="f">Tipo</label><select name="tipo">${opt('entrada', 'Entrada / compra (suma)', tipo === 'entrada')}${opt('salida', 'Salida / merma (resta)', tipo === 'salida')}${opt('ajuste', 'Ajuste por conteo (fija el stock)', tipo === 'ajuste')}</select></div>
    <div><label class="f" id="lblCant">Cantidad (${esc(i.unidad)})</label><input name="cant" type="number" step="any" min="0" required></div>
    <div class="full" id="boxCompra">
      <label class="check"><input type="checkbox" name="gasto" checked> Registrar como gasto (compra de insumos)</label>
      <div class="fgrid mt"><div><label class="f">¿Cuánto pagaste en total? (MXN)</label><input name="monto" type="number" step="0.01" min="0"></div>
      <div style="align-self:end"><label class="check"><input type="checkbox" name="actCosto" checked> Actualizar costo unitario</label></div></div>
    </div>
    <div class="full"><label class="f">Nota</label><input name="nota" placeholder="Ej. Compra a proveedor, piezas rotas…"></div>
  </form>`, `<button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`);
  const f = $('#mf');
  const upd = () => {
    $('#boxCompra').hidden = f.tipo.value !== 'entrada';
    $('#lblCant').textContent = f.tipo.value === 'ajuste' ? `Stock real contado (${i.unidad})` : `Cantidad (${i.unidad})`;
  };
  f.tipo.onchange = upd; upd();
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(f);
    const cant = num(d.cant);
    let ops;
    if (d.tipo === 'entrada') {
      if (cant <= 0) return toast('Escribe una cantidad mayor a cero', 'warn');
      ops = opsCompra(id, cant, num(d.monto), d.actCosto, d.nota, today(), d.gasto);
    } else {
      const ins = clone(i);
      const delta = d.tipo === 'salida' ? -cant : r3(cant - num(i.stock));
      if (d.tipo === 'salida' && cant <= 0) return toast('Escribe una cantidad mayor a cero', 'warn');
      ins.stock = r3(num(i.stock) + delta);
      ops = [['insumos', ins], ['movimientos', { id: uid(), insumoId: id, tipo: d.tipo, cant: delta, fecha: today(), nota: d.nota || (d.tipo === 'ajuste' ? 'Ajuste por conteo' : 'Salida manual') }]];
    }
    try { await commit(ops); toast('Inventario actualizado'); avisarStockBajo(ops); closeModal(); render(); }
    catch (e) { fail(e, 'No se pudo actualizar el inventario.'); }
  };
};

/* ================= 5. COTIZACIONES Y PEDIDOS ================= */
let pedModo = 'lista', pedEstado = 'activos', qPed = '';
App.filtroEstado = e => { pedEstado = e; pedModo = 'lista'; go('pedidos'); };
VIEWS.pedidos = () => {
  const q = qPed.toLowerCase();
  const match = p => !q || (`#${p.folio} ${nomCliente(p)} ${resumenItems(p)} ${p.notas || ''}`).toLowerCase().includes(q);
  const head = pageHead('Cotizaciones y pedidos', 'Desde la cotización hasta la entrega.',
    `<button class="btn" onclick="App.formPedido(null,'cotizacion')">📝 Nueva cotización</button><button class="btn primary" onclick="App.formPedido(null,'pedido')">+ Nuevo pedido</button>`) +
    `<div class="toolbar"><div class="seg"><button class="${pedModo === 'lista' ? 'on' : ''}" onclick="App.pedModo('lista')">☰ Lista</button><button class="${pedModo === 'tablero' ? 'on' : ''}" onclick="App.pedModo('tablero')">▦ Tablero</button></div>
      <input type="search" id="qPed" placeholder="🔍 Buscar folio, cliente o producto…" value="${esc(qPed)}">
      ${pedModo === 'lista' ? `<select id="pedEstado">${opt('activos', 'Pendientes (sin entregar)', pedEstado === 'activos')}${opt('todos', 'Todos', pedEstado === 'todos')}${ESTADOS.map(e => opt(e, e, e === pedEstado)).join('')}</select>` : ''}</div>`;
  if (pedModo === 'tablero') {
    const lim = addDays(today(), -15);
    const cols = ESTADOS.filter(e => e !== 'Cancelado');
    return head + `<p class="hint">Arrastra las tarjetas entre columnas (en computadora) o usa el botón ➜ para avanzar. "Entregado" muestra los últimos 15 días.</p><div class="kanban">${cols.map((e, ci) => {
      const ps = S.pedidos.filter(p => p.estado === e && match(p) && (e !== 'Entregado' || (p.fechaEntregado || fVenta(p)) >= lim))
        .sort((a, b) => (a.fechaEntrega || '9').localeCompare(b.fechaEntrega || '9'));
      return `<div class="kcol" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="App.drop(event,${ESTADOS.indexOf(e)})">
        <h3>${stBadge(e)} <span class="muted">${ps.length}</span></h3>
        ${ps.map(p => { const t = tot(p); return `<div class="kcard" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" onclick="App.verPedido('${p.id}')">
          <div class="k-top"><span>#${p.folio} ${esc(nomCliente(p))}</span></div>
          <div class="k-items">${esc(resumenItems(p))}</div>
          <div class="small">📅 ${fdate(p.fechaEntrega)} · ${t.saldo > 0 ? `Saldo <b style="color:var(--bad)">${money(t.saldo)}</b>` : `<b style="color:var(--ok)">Pagado</b>`}</div>
          ${ci < cols.length - 1 ? `<div class="btns"><button class="btn sm" onclick="event.stopPropagation();App.estado('${p.id}','${esc(cols[ci + 1])}')">➜ ${esc(cols[ci + 1])}</button></div>` : ''}
        </div>`; }).join('')}
      </div>`;
    }).join('')}</div>`;
  }
  const list = S.pedidos.filter(p => (pedEstado === 'todos' || (pedEstado === 'activos' ? PENDIENTES.includes(p.estado) : p.estado === pedEstado)) && match(p))
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));
  return head + (list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Estado</th><th>Entrega</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead><tbody>
    ${list.map(p => { const t = tot(p); const late = PENDIENTES.includes(p.estado) && p.estado !== 'Cotización' && p.fechaEntrega && p.fechaEntrega < today();
      return `<tr class="click" onclick="App.verPedido('${p.id}')"><td><b>#${p.folio}</b>${p.origen === 'pos' ? ' <span class="badge">Mostrador</span>' : ''}</td><td class="nowrap">${fdate(p.fecha)}</td><td>${esc(nomCliente(p))}</td>
      <td class="small">${esc(resumenItems(p))}</td><td>${stBadge(p.estado)}</td><td class="nowrap">${late ? '<span class="badge bad">Atrasado</span> ' : ''}${fdate(p.fechaEntrega)}</td>
      <td class="num">${money(t.total)}</td><td class="num" style="color:${t.saldo > 0 ? 'var(--bad)' : 'inherit'}">${money(t.saldo)}</td></tr>`; }).join('')}
    </tbody></table></div>` : emptyMsg('📋', 'No hay pedidos con este filtro. Crea una cotización para empezar.'));
};
VIEWS.pedidos.after = () => {
  const i = $('#qPed');
  if (i) i.oninput = () => { qPed = i.value; const pos = i.selectionStart; render(); const n = $('#qPed'); n.focus(); n.setSelectionRange(pos, pos); };
  const s = $('#pedEstado');
  if (s) s.onchange = () => { pedEstado = s.value; render(); };
};
App.pedModo = m => { pedModo = m; render(); };
App.drop = (ev, idx) => {
  ev.preventDefault();
  $$('.kcol.over').forEach(c => c.classList.remove('over'));
  const id = ev.dataTransfer.getData('text/plain');
  if (id && ESTADOS[idx]) App.estado(id, ESTADOS[idx]);
};

function itemRow(it = {}) {
  const prods = S.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return `<div class="line-row"><select class="ln-prod">${opt('', '✏️ Otro artículo (descríbelo en notas)', !it.productoId)}${prods.map(p => opt(p.id, `${p.nombre} — ${money(p.precio)}`, p.id === it.productoId)).join('')}</select>
    <input class="ln-cant" type="number" min="0" step="any" value="${it.cant ?? 1}" title="Cantidad" placeholder="Cant.">
    <input class="ln-precio" type="number" min="0" step="0.01" value="${it.precio ?? ''}" title="Precio unitario" placeholder="Precio">
    <input class="ln-notas" value="${esc(it.notas || '')}" placeholder="Personalización: nombre, foto, colores…">
    <button type="button" class="x" title="Quitar">×</button></div>`;
}
App.formPedido = (id, tipo, clienteId) => {
  const nuevo = !id;
  const p = id ? clone(pedido(id)) : {
    id: uid(), folio: null, estado: tipo === 'cotizacion' ? 'Cotización' : 'Anticipo', items: [], descuento: 0, pagos: [], fecha: today(),
    fechaEntrega: addDays(today(), 3), notas: '', historial: [], descontado: false, origen: 'pedido', clienteId: clienteId || ''
  };
  const clis = S.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const titulo = nuevo ? (tipo === 'cotizacion' ? 'Nueva cotización' : 'Nuevo pedido') : `Editar ${p.estado === 'Cotización' ? 'cotización' : 'pedido'} #${p.folio}`;
  openModal(titulo, `<form id="mf">
    <div class="fgrid">
      <div class="full"><label class="f">Cliente *</label><select name="clienteId">${opt('', '— Selecciona un cliente —', !p.clienteId)}${opt('__nuevo', '➕ Cliente nuevo…', false)}${clis.map(c => opt(c.id, c.nombre + (c.whatsapp ? ' · ' + c.whatsapp : ''), c.id === p.clienteId)).join('')}</select></div>
      <div class="full fgrid" id="boxNuevoCli" hidden style="padding:10px;border:1px dashed var(--line);border-radius:10px">
        <div><label class="f">Nombre del cliente nuevo</label><input name="nNombre"></div><div><label class="f">WhatsApp</label><input name="nTel" inputmode="tel" placeholder="10 dígitos"></div></div>
      ${nuevo ? `<div><label class="f">Estado</label><select name="estado">${ESTADOS.filter(e => e !== 'Cancelado' && e !== 'Entregado').map(e => opt(e, e, e === p.estado)).join('')}</select></div>` : ''}
      <div><label class="f">Fecha de entrega</label><input type="date" name="fechaEntrega" value="${esc(p.fechaEntrega)}"></div>
    </div>
    <h3 class="mt">Productos</h3>
    ${p.descontado ? '<p class="alert warn small">El inventario de este pedido ya se descontó. Si cambias cantidades, ajusta el inventario manualmente.</p>' : ''}
    <div class="lines" id="lnLines">${(p.items.length ? p.items : [{}]).map(itemRow).join('')}</div>
    <button type="button" class="btn sm mt" id="lnAdd">+ Agregar producto</button>
    <div class="fgrid mt">
      <div><label class="f">Descuento (MXN)</label><input name="descuento" type="number" step="0.01" min="0" value="${esc(p.descuento || 0)}"></div>
      ${nuevo ? `<div><label class="f">Anticipo recibido (MXN)</label><div style="display:flex;gap:6px"><input name="anticipo" type="number" step="0.01" min="0" value="0"><select name="metodo" style="max-width:150px">${METODOS.map(m => opt(m, m)).join('')}</select></div></div>` : ''}
      <div class="full"><label class="f">Notas internas / detalles del diseño</label><textarea name="notas" placeholder="Ej. Foto enviada por WhatsApp, letra en dorado…">${esc(p.notas)}</textarea></div>
    </div>
    <div class="totals mt" id="lnTot"></div>
  </form>`, `<button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`, true);
  const f = $('#mf');
  const readItems = () => $$('#lnLines .line-row').map(r => {
    const pid = $('.ln-prod', r).value, prod = producto(pid), notas = $('.ln-notas', r).value.trim();
    return { productoId: prod ? pid : '', nombre: prod ? prod.nombre : (notas || 'Artículo personalizado'), cant: num($('.ln-cant', r).value), precio: r2(num($('.ln-precio', r).value)), costo: prod ? costoProducto(prod) : 0, notas };
  }).filter(it => it.cant > 0 && (it.productoId || it.notas || it.precio > 0));
  const recalc = () => {
    const t = tot({ items: readItems(), descuento: f.descuento.value, pagos: nuevo ? [{ monto: num(f.anticipo.value) }] : p.pagos });
    $('#lnTot').innerHTML = `<ul class="list"><li><span>Subtotal</span><b>${money(t.subtotal)}</b></li><li><span>Descuento</span><span>− ${money(t.descuento)}</span></li>
      <li class="big"><span>Total</span><span>${money(t.total)}</span></li><li><span>Pagado</span><span>${money(t.pagado)}</span></li><li><span>Saldo</span><b style="color:var(--bad)">${money(t.saldo)}</b></li></ul>`;
  };
  f.addEventListener('input', recalc);
  f.addEventListener('change', e => {
    if (e.target.classList.contains('ln-prod')) {
      const prod = producto(e.target.value);
      if (prod) $('.ln-precio', e.target.closest('.line-row')).value = prod.precio;
    }
    if (e.target.name === 'clienteId') $('#boxNuevoCli').hidden = e.target.value !== '__nuevo';
    recalc();
  });
  $('#lnAdd').onclick = () => { $('#lnLines').insertAdjacentHTML('beforeend', itemRow({})); recalc(); };
  $('#lnLines').onclick = e => { if (e.target.classList.contains('x')) { e.target.closest('.line-row').remove(); recalc(); } };
  recalc();
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(f);
    const items = readItems();
    if (!items.length) return toast('Agrega al menos un producto con cantidad', 'warn');
    const ops = [];
    if (d.clienteId === '__nuevo') {
      if (!d.nNombre) return toast('Escribe el nombre del cliente nuevo', 'warn');
      const c = { id: uid(), nombre: d.nNombre, whatsapp: d.nTel, correo: '', notas: '', alta: today() };
      ops.push(['clientes', c]);
      p.clienteId = c.id;
    } else if (!d.clienteId) return toast('Elige un cliente (o crea uno nuevo)', 'warn');
    else p.clienteId = d.clienteId;
    p.items = items;
    p.descuento = r2(num(d.descuento));
    p.fechaEntrega = d.fechaEntrega;
    p.notas = d.notas;
    if (nuevo) {
      p.folio = (num(S.ajustes.folio) || 0) + 1;
      ops.push(aj('folio', p.folio));
      p.estado = d.estado || p.estado;
      p.historial = [{ fecha: new Date().toISOString(), estado: p.estado }];
      if (num(d.anticipo) > 0) {
        p.pagos.push({ id: uid(), fecha: today(), monto: r2(num(d.anticipo)), metodo: d.metodo });
        if (p.estado === 'Cotización') { p.estado = 'Anticipo'; p.historial.push({ fecha: new Date().toISOString(), estado: 'Anticipo' }); }
      }
      if (p.estado !== 'Cotización') p.fechaVenta = today();
      if (p.estado === 'En producción' && !p.descontado) { ops.push(...opsInventario(p, -1)); p.descontado = true; }
    }
    ops.push(['pedidos', p]);
    try {
      await commit(ops);
      avisarStockBajo(ops);
      toast(nuevo ? `${p.estado === 'Cotización' ? 'Cotización' : 'Pedido'} #${p.folio} guardado` : 'Cambios guardados');
      render();
      App.verPedido(p.id);
    } catch (e) { fail(e, 'No se pudo guardar. Revisa los datos e intenta de nuevo.'); }
  };
};
App.estado = async (id, nuevo) => {
  const base = pedido(id);
  if (!base || base.estado === nuevo) return;
  const p = clone(base);
  const ops = [];
  if (nuevo === 'Cancelado') {
    if (!ask(`¿Cancelar ${p.estado === 'Cotización' ? 'la cotización' : 'el pedido'} #${p.folio}?`)) return;
    if (p.descontado && ask('¿Regresar al inventario los insumos que ya se habían descontado?')) { ops.push(...opsInventario(p, +1)); p.descontado = false; }
  }
  if ((nuevo === 'En producción' || nuevo === 'Entregado') && !p.descontado) { ops.push(...opsInventario(p, -1)); p.descontado = true; }
  if (nuevo !== 'Cotización' && nuevo !== 'Cancelado' && !p.fechaVenta) p.fechaVenta = today();
  if (nuevo === 'Entregado') p.fechaEntregado = today();
  p.estado = nuevo;
  (p.historial = p.historial || []).push({ fecha: new Date().toISOString(), estado: nuevo });
  ops.push(['pedidos', p]);
  try {
    await commit(ops);
    toast(`#${p.folio} → ${nuevo}${ops.length > 1 && nuevo !== 'Cancelado' ? ' (insumos descontados)' : ''}`);
    avisarStockBajo(ops);
    if (nuevo === 'Entregado' && tot(p).saldo > 0) toast(`Ojo: este pedido tiene saldo pendiente de ${money(tot(p).saldo)}`, 'warn', 6000);
    render();
    if (modal().open && modal().dataset.pedido === id) App.verPedido(id);
  } catch (e) { fail(e, 'No se pudo cambiar el estado.'); }
};
App.convertir = async id => {
  await App.estado(id, 'Anticipo');
  App.formPago(id, true);
};
App.verPedido = id => {
  const p = pedido(id);
  if (!p) return;
  const t = tot(p);
  const sig = PENDIENTES.concat('Entregado');
  const next = sig[sig.indexOf(p.estado) + 1];
  const m = openModal(`${p.estado === 'Cotización' ? 'Cotización' : 'Pedido'} #${p.folio}`, `
    <div class="btns mb" style="justify-content:space-between">
      <div>${stBadge(p.estado)} <span class="muted small">Creado ${fdate(p.fecha)}${p.descontado ? ' · 📦 insumos descontados' : ''}</span></div>
      <div class="btns"><label class="f" style="margin:0">Cambiar estado:</label><select id="selEstado" style="width:auto">${ESTADOS.map(e => opt(e, e, e === p.estado)).join('')}</select></div>
    </div>
    <div class="grid g2 mb">
      <div class="card"><b>👤 ${esc(nomCliente(p))}</b><br><span class="muted">📱 ${esc(telCliente(p) || 'Sin WhatsApp')}</span></div>
      <div class="card"><b>📅 Entrega: ${fdate(p.fechaEntrega)}</b><br><span class="muted">${p.notas ? '📝 ' + esc(p.notas) : 'Sin notas'}</span></div>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>
      ${p.items.map(it => `<tr><td><b>${esc(it.nombre)}</b>${it.notas && it.productoId ? `<br><span class="small muted">${esc(it.notas)}</span>` : ''}</td><td class="num">${fqty(it.cant)}</td><td class="num">${money(it.precio)}</td><td class="num">${money(it.cant * it.precio)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="grid g2 mt">
      <div><h3>💰 Pagos</h3>${(p.pagos || []).length ? `<ul class="list">${p.pagos.map((x, i) => `<li><span>${fdate(x.fecha)} · ${esc(x.metodo)}</span><span><b>${money(x.monto)}</b> <button class="btn sm danger" onclick="App.borrarPago('${id}',${i})" title="Quitar pago">×</button></span></li>`).join('')}</ul>` : '<p class="muted">Sin pagos registrados.</p>'}
        ${p.estado !== 'Cancelado' ? `<button class="btn sm ok" onclick="App.formPago('${id}')">+ Registrar pago</button>` : ''}</div>
      <div class="totals"><ul class="list"><li><span>Subtotal</span><span>${money(t.subtotal)}</span></li>${t.descuento ? `<li><span>Descuento</span><span>− ${money(t.descuento)}</span></li>` : ''}
        <li class="big"><span>Total</span><span>${money(t.total)}</span></li><li><span>Pagado</span><span>${money(t.pagado)}</span></li>
        <li><span>Saldo</span><b style="color:${t.saldo > 0 ? 'var(--bad)' : 'var(--ok)'}">${money(t.saldo)}</b></li><li class="small muted"><span>Costo estimado / ganancia</span><span>${money(t.costo)} / ${money(t.total - t.costo)}</span></li></ul></div>
    </div>`,
    `<button class="btn danger" type="button" onclick="App.borrarPedido('${id}')">Borrar</button>
     <a class="btn" href="${EDITOR_URL}" target="_blank" rel="noopener">🎨 Abrir editor de diseño</a><span class="spacer"></span>
     <button class="btn" type="button" onclick="App.imprimir('${id}')">🖨️ Imprimir</button>
     <a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(telCliente(p), textoWa(p)))}">WhatsApp</a>
     <button class="btn" type="button" onclick="App.formPedido('${id}')">✏️ Editar</button>
     ${p.estado === 'Cotización' ? `<button class="btn primary" type="button" onclick="App.convertir('${id}')">✅ Convertir en pedido</button>`
      : next && p.estado !== 'Cancelado' ? `<button class="btn primary" type="button" onclick="App.estado('${id}','${esc(next)}')">➜ ${esc(next)}</button>` : ''}`, true);
  m.dataset.pedido = id;
  $('#selEstado').onchange = e => App.estado(id, e.target.value);
};
App.formPago = (id, desdeConversion) => {
  const p = pedido(id);
  const t = tot(p);
  openModal(`Registrar pago · #${p.folio}`, `<form id="mf" class="fgrid">
    ${desdeConversion ? '<div class="full alert info">¡Listo! Ya es pedido. Registra el anticipo (o cierra si aún no paga).</div>' : ''}
    <div class="full muted">Total ${money(t.total)} · Pagado ${money(t.pagado)} · <b>Saldo ${money(t.saldo)}</b></div>
    <div><label class="f">Monto (MXN)</label><input name="monto" type="number" step="0.01" min="0" required value="${desdeConversion ? r2(t.saldo / 2) : t.saldo}"></div>
    <div><label class="f">Forma de pago</label><select name="metodo">${METODOS.map(m => opt(m, m)).join('')}</select></div>
    <div><label class="f">Fecha</label><input name="fecha" type="date" value="${today()}" required></div>
  </form>`, `<button class="btn" type="button" onclick="App.verPedido('${id}')">${desdeConversion ? 'Sin anticipo' : 'Cancelar'}</button><button class="btn primary" form="mf">Guardar pago</button>`);
  $('#mf').onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    const monto = r2(num(d.monto));
    if (monto <= 0) return toast('Escribe un monto mayor a cero', 'warn');
    const q = clone(p);
    q.pagos = q.pagos || [];
    q.pagos.push({ id: uid(), fecha: d.fecha || today(), monto, metodo: d.metodo });
    if (q.estado === 'Cotización') { q.estado = 'Anticipo'; q.fechaVenta = q.fechaVenta || today(); q.historial.push({ fecha: new Date().toISOString(), estado: 'Anticipo' }); }
    try { await commit([['pedidos', q]]); toast(`Pago de ${money(monto)} registrado`); render(); App.verPedido(id); }
    catch (e) { fail(e, 'No se pudo registrar el pago.'); }
  };
};
App.borrarPago = async (id, i) => {
  const q = clone(pedido(id));
  if (!ask(`¿Quitar el pago de ${money(q.pagos[i].monto)}?`)) return;
  q.pagos.splice(i, 1);
  try { await commit([['pedidos', q]]); toast('Pago eliminado'); render(); App.verPedido(id); }
  catch (e) { fail(e); }
};
App.borrarPedido = async id => {
  const p = pedido(id);
  if (!ask(`¿Borrar definitivamente #${p.folio}? Esta acción no se puede deshacer.\n(Si solo no se hizo, mejor cámbialo a "Cancelado".)`)) return;
  const ops = [];
  if (p.descontado && ask('¿Regresar al inventario los insumos que se descontaron?')) ops.push(...opsInventario(p, +1));
  ops.push(['pedidos', id, true]);
  try { await commit(ops); toast('Eliminado'); closeModal(); render(); }
  catch (e) { fail(e); }
};
function textoWa(p) {
  const n = neg(), t = tot(p);
  const tipo = p.estado === 'Cotización' ? 'Cotización' : 'Pedido';
  let s = `¡Hola ${nomCliente(p)}! 👋\n${tipo} #${p.folio} de *${n.nombre}*\n\n`;
  s += p.items.map(it => `• ${fqty(it.cant)} × ${it.nombre} — ${money(it.cant * it.precio)}${it.notas && it.productoId ? `\n   (${it.notas})` : ''}`).join('\n');
  if (t.descuento) s += `\n\nDescuento: −${money(t.descuento)}`;
  s += `\n*Total: ${money(t.total)}*`;
  if (t.pagado) s += `\nPagado: ${money(t.pagado)}`;
  s += `\n*Saldo: ${money(t.saldo)}*`;
  if (p.fechaEntrega && p.estado !== 'Entregado') s += `\n📅 Entrega: ${fdate(p.fechaEntrega)}`;
  s += `\nEstado: ${p.estado}`;
  if (p.estado === 'Cotización' && n.notaPie) s += `\n\n${n.notaPie}`;
  s += '\n\n¡Gracias por tu preferencia! 💜';
  return s;
}
function docHtml(p) {
  const n = neg(), t = tot(p);
  const esCot = p.estado === 'Cotización';
  const redes = [n.facebook && 'Facebook: ' + n.facebook, n.instagram && 'Instagram: ' + n.instagram, n.tiktok && 'TikTok: ' + n.tiktok].filter(Boolean).join(' · ');
  return `<div class="doc">
    <div class="doc-head"><div class="biz">${n.logo ? `<img src="${esc(n.logo)}" alt="">` : ''}<div><h1>${esc(n.nombre)}</h1>
      <div>${esc(n.lema)}</div><div>${[n.whatsapp && 'WhatsApp: ' + n.whatsapp, n.correo].filter(Boolean).map(esc).join(' · ')}</div><div>${esc(n.direccion)}</div></div></div>
      <div class="doc-title"><h2>${esCot ? 'Cotización' : 'Nota de venta'}</h2><div><b>Folio #${p.folio}</b></div><div>Fecha: ${fdate(esCot ? p.fecha : (p.fechaVenta || p.fecha))}</div>${p.fechaEntrega ? `<div>Entrega: ${fdate(p.fechaEntrega)}</div>` : ''}</div></div>
    <p><b>Cliente:</b> ${esc(nomCliente(p))} ${telCliente(p) ? ' · Tel. ' + esc(telCliente(p)) : ''}</p>
    <table><thead><tr><th>Cant.</th><th>Descripción</th><th class="num">P. unitario</th><th class="num">Importe</th></tr></thead><tbody>
      ${p.items.map(it => `<tr><td>${fqty(it.cant)}</td><td>${esc(it.nombre)}${it.notas && it.productoId ? `<br><small>${esc(it.notas)}</small>` : ''}</td><td class="num">${money(it.precio)}</td><td class="num">${money(it.cant * it.precio)}</td></tr>`).join('')}
    </tbody></table>
    <table class="tot"><tr><td>Subtotal</td><td class="num">${money(t.subtotal)}</td></tr>${t.descuento ? `<tr><td>Descuento</td><td class="num">−${money(t.descuento)}</td></tr>` : ''}
      <tr class="g"><td>Total</td><td class="num">${money(t.total)}</td></tr>
      ${!esCot ? `<tr><td>Pagado</td><td class="num">${money(t.pagado)}</td></tr><tr><td><b>Saldo</b></td><td class="num"><b>${money(t.saldo)}</b></td></tr>` : ''}</table>
    ${!esCot && (p.pagos || []).length ? `<p><b>Pagos:</b> ${p.pagos.map(x => `${fdate(x.fecha)} ${esc(x.metodo)} ${money(x.monto)}`).join(' · ')}</p>` : ''}
    ${p.notas ? `<p><b>Notas:</b> ${esc(p.notas)}</p>` : ''}
    <div class="foot">${esc(n.notaPie)}<br>${esc(n.horarios)}${redes ? '<br>' + esc(redes) : ''}<br><b>¡Gracias por tu preferencia!</b></div>
  </div>`;
}
App.imprimir = id => {
  const p = pedido(id);
  $('#printArea').innerHTML = docHtml(p);
  const wasOpen = modal().open;
  if (wasOpen) modal().close();
  setTimeout(() => {
    try { window.print(); } catch (e) { fail(e, 'No se pudo abrir la impresión.'); }
    if (wasOpen) App.verPedido(id);
  }, 60);
};

/* ================= 6. VENTA RÁPIDA (POS) ================= */
let cart = [], qPos = '';
VIEWS.pos = () => {
  const q = qPos.toLowerCase();
  const prods = S.productos.filter(p => !q || (p.nombre + ' ' + p.categoria).toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const t = tot({ items: cart, descuento: posDesc, pagos: [] });
  return pageHead('Venta rápida', 'Toca los productos para agregarlos y cobra. Se registra la venta y se descuenta el inventario.') +
    `<div class="pos"><div><div class="toolbar"><input type="search" id="qPos" placeholder="🔍 Buscar producto…" value="${esc(qPos)}"></div>
      ${prods.length ? `<div class="pgrid">${prods.map(p => `<div class="pcard" onclick="App.posAdd('${p.id}')"><div class="pimg">${prodImg(p)}</div><div class="pbody"><b style="font-size:13px">${esc(p.nombre)}</b><span class="pprice">${money(p.precio)}</span></div></div>`).join('')}</div>` : emptyMsg('☕', 'No hay productos. Agrégalos en Productos.')}</div>
    <div class="card cart"><h2>🛒 Venta</h2>
      ${cart.length ? cart.map((it, i) => `<div class="cart-line"><div><b>${esc(it.nombre)}</b><br><span class="small muted">${money(it.precio)} c/u</span></div>
        <div class="right"><div class="qty"><button onclick="App.posQty(${i},-1)" aria-label="Menos">−</button><b>${fqty(it.cant)}</b><button onclick="App.posQty(${i},1)" aria-label="Más">+</button></div><div><b>${money(it.cant * it.precio)}</b></div></div></div>`).join('')
      : '<p class="muted">Aún no agregas productos.</p>'}
      <div class="fgrid mt" style="grid-template-columns:1fr 1fr">
        <div class="full"><label class="f">Cliente (opcional)</label><select id="posCli">${opt('', 'Público en general', !posCli)}${S.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => opt(c.id, c.nombre, c.id === posCli)).join('')}</select></div>
        <div><label class="f">Descuento</label><input id="posDesc" type="number" min="0" step="0.01" value="${posDesc || ''}" placeholder="0"></div>
        <div><label class="f">Forma de pago</label><select id="posMet">${METODOS.map(m => opt(m, m, m === posMet)).join('')}</select></div>
        <div class="full" ${posMet !== 'Efectivo' ? 'hidden' : ''}><label class="f">Recibí (para calcular cambio)</label><input id="posRec" type="number" min="0" step="0.01" placeholder="Ej. 500"></div>
      </div>
      <div class="totals mt"><ul class="list"><li class="big"><span>Total</span><span>${money(t.total)}</span></li><li id="posCambio"></li></ul></div>
      <button class="btn primary block mt" style="min-height:48px;font-size:16px" onclick="App.cobrar()" ${cart.length ? '' : 'disabled'}>Cobrar ${money(t.total)}</button>
      ${cart.length ? '<button class="btn block mt" onclick="App.posVaciar()">Vaciar</button>' : ''}
    </div></div>`;
};
let posCli = '', posMet = 'Efectivo', posDesc = 0;
VIEWS.pos.after = () => {
  const i = $('#qPos');
  i.oninput = () => { qPos = i.value; const pos = i.selectionStart; render(); const n = $('#qPos'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#posCli').onchange = e => { posCli = e.target.value; };
  $('#posMet').onchange = e => { posMet = e.target.value; render(); };
  $('#posDesc').onchange = e => { posDesc = r2(num(e.target.value)); render(); };
  const rec = $('#posRec');
  if (rec) rec.oninput = () => {
    const total = tot({ items: cart, descuento: posDesc }).total, r = num(rec.value);
    $('#posCambio').innerHTML = r ? `<span>Cambio</span><b style="color:${r >= total ? 'var(--ok)' : 'var(--bad)'}">${r >= total ? money(r - total) : 'Falta ' + money(total - r)}</b>` : '';
  };
};
App.posAdd = id => {
  const p = producto(id);
  const ex = cart.find(c => c.productoId === id);
  if (ex) ex.cant++; else cart.push({ productoId: id, nombre: p.nombre, cant: 1, precio: num(p.precio), costo: costoProducto(p), notas: '' });
  render();
};
App.posQty = (i, d) => { cart[i].cant += d; if (cart[i].cant <= 0) cart.splice(i, 1); render(); };
App.posVaciar = () => { cart = []; posDesc = 0; render(); };
App.cobrar = async () => {
  if (!cart.length) return;
  const p = {
    id: uid(), folio: (num(S.ajustes.folio) || 0) + 1, estado: 'Entregado', items: clone(cart), descuento: posDesc, pagos: [], fecha: today(), fechaVenta: today(),
    fechaEntrega: today(), fechaEntregado: today(), notas: '', historial: [{ fecha: new Date().toISOString(), estado: 'Entregado' }], descontado: true, origen: 'pos', clienteId: posCli
  };
  const t = tot(p);
  p.pagos.push({ id: uid(), fecha: today(), monto: t.total, metodo: posMet });
  const ops = [...opsInventario(p, -1), ['pedidos', p], aj('folio', p.folio)];
  try {
    await commit(ops);
    avisarStockBajo(ops);
    cart = []; posDesc = 0; posCli = '';
    render();
    openModal('✅ Venta registrada', `<p style="font-size:16px">Venta <b>#${p.folio}</b> por <b>${money(t.total)}</b> (${esc(posMet)}).</p><p class="muted">El inventario ya se descontó.</p>`,
      `<button class="btn" type="button" onclick="App.imprimir('${p.id}')">🖨️ Imprimir nota</button>${telCliente(p) ? `<a class="btn wa" target="_blank" rel="noopener" href="${esc(waLink(telCliente(p), textoWa(p)))}">WhatsApp</a>` : ''}<button class="btn primary" type="button" onclick="App.close()">Nueva venta</button>`);
  } catch (e) { fail(e, 'No se pudo registrar la venta. Intenta de nuevo.'); }
};

/* ================= 7. GASTOS Y COMPRAS ================= */
let gDesde = '', gHasta = '', gCat = '';
VIEWS.gastos = () => {
  if (!gDesde) { gDesde = inicioMes(today()); gHasta = finMes(today()); }
  const list = gastosRango(gDesde, gHasta).filter(g => !gCat || g.categoria === gCat).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = list.reduce((a, g) => a + num(g.monto), 0);
  return pageHead('Gastos y compras', 'Registra lo que pagas. Las compras de insumos suman al inventario.', `<button class="btn primary" onclick="App.formGasto()">+ Nuevo gasto / compra</button>`) +
    `<div class="toolbar"><label class="small muted">Del</label><input type="date" id="gDesde" value="${gDesde}"><label class="small muted">al</label><input type="date" id="gHasta" value="${gHasta}">
      <select id="gCat">${opt('', 'Todas las categorías', !gCat)}${CAT_GASTO.map(c => opt(c, c, c === gCat)).join('')}</select></div>
    <p>Total del periodo: <b>${money(total)}</b> (${list.length} registro(s))</p>` +
    (list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th class="num">Monto</th><th></th></tr></thead><tbody>
      ${list.map(g => `<tr><td class="nowrap">${fdate(g.fecha)}</td><td>${esc(g.categoria)}</td><td>${esc(g.nota || '')}</td><td class="num"><b>${money(g.monto)}</b></td>
      <td class="right"><button class="btn sm danger" onclick="App.borrarGasto('${g.id}')">Borrar</button></td></tr>`).join('')}
    </tbody></table></div>` : emptyMsg('🧾', 'No hay gastos en este periodo.'));
};
VIEWS.gastos.after = () => {
  $('#gDesde').onchange = e => { gDesde = e.target.value || gDesde; render(); };
  $('#gHasta').onchange = e => { gHasta = e.target.value || gHasta; render(); };
  $('#gCat').onchange = e => { gCat = e.target.value; render(); };
};
App.formGasto = () => {
  openModal('Nuevo gasto / compra', `<form id="mf" class="fgrid">
    <div><label class="f">Fecha</label><input type="date" name="fecha" value="${today()}" required></div>
    <div><label class="f">Categoría</label><select name="categoria">${CAT_GASTO.map(c => opt(c, c, c === 'Compra de insumos')).join('')}</select></div>
    <div><label class="f">Monto total (MXN) *</label><input name="monto" type="number" step="0.01" min="0" required></div>
    <div class="full fgrid" id="boxIns" style="padding:10px;border:1px dashed var(--line);border-radius:10px">
      <div><label class="f">Insumo que compraste</label><select name="insumoId">${opt('', '— Ninguno (solo gasto) —', true)}${S.insumos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(i => opt(i.id, `${i.nombre} (${i.unidad})`)).join('')}</select></div>
      <div><label class="f">Cantidad comprada</label><input name="cant" type="number" step="any" min="0"></div>
      <div class="full"><label class="check"><input type="checkbox" name="actCosto" checked> Actualizar costo unitario (monto ÷ cantidad)</label></div>
    </div>
    <div class="full"><label class="f">Nota</label><input name="nota" placeholder="Ej. Proveedor, factura…"></div>
  </form>`, `<button class="btn" type="button" onclick="App.close()">Cancelar</button><button class="btn primary" form="mf">Guardar</button>`);
  const f = $('#mf');
  f.categoria.onchange = () => { $('#boxIns').hidden = f.categoria.value !== 'Compra de insumos'; };
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(f);
    const monto = r2(num(d.monto));
    if (monto <= 0) return toast('Escribe el monto', 'warn');
    let ops;
    if (d.categoria === 'Compra de insumos' && d.insumoId) {
      if (num(d.cant) <= 0) return toast('Escribe la cantidad comprada del insumo', 'warn');
      ops = opsCompra(d.insumoId, num(d.cant), monto, d.actCosto, d.nota, d.fecha, true);
    } else ops = [['gastos', { id: uid(), fecha: d.fecha, categoria: d.categoria, monto, nota: d.nota }]];
    try { await commit(ops); toast(ops.length > 1 ? 'Compra registrada y stock actualizado' : 'Gasto registrado'); closeModal(); render(); }
    catch (e) { fail(e, 'No se pudo guardar el gasto.'); }
  };
};
App.borrarGasto = async id => {
  const g = S.gastos.find(x => x.id === id);
  if (!ask(`¿Borrar el gasto de ${money(g.monto)}?`)) return;
  const ops = [['gastos', id, true]];
  const ins = g.insumoId && insumo(g.insumoId);
  if (ins && g.cant && ask(`¿También restar ${fqty(g.cant)} ${ins.unidad} de "${ins.nombre}" del inventario?`)) {
    const i2 = clone(ins); i2.stock = r3(num(i2.stock) - num(g.cant));
    ops.push(['insumos', i2], ['movimientos', { id: uid(), insumoId: ins.id, tipo: 'ajuste', cant: -num(g.cant), fecha: today(), nota: 'Se borró una compra' }]);
  }
  try { await commit(ops); toast('Gasto borrado'); render(); } catch (e) { fail(e); }
};

/* ================= 8. CALCULADORA ================= */
function calcVals() { return Object.assign({}, CALC_DEF, S.ajustes.calc || {}); }
function calcular(v) {
  if (v.modo === '3d') {
    const fil = num(v.d_gramos) * num(v.d_kg) / 1000;
    const maq = num(v.d_horas) * num(v.d_hora);
    const base = (fil + maq + num(v.d_extra)) * (1 + num(v.d_fallos) / 100);
    const mo = num(v.d_mo_min) / 60 * num(v.d_mo_hora);
    const costo = r2(base + mo);
    return { parts: [['Filamento', fil], ['Impresora (luz + desgaste)', maq], ['Extras', num(v.d_extra)], ['Margen por fallos', base - (fil + maq + num(v.d_extra))], ['Mano de obra', mo]], costo, precio: sugerido(costo, v.d_margen) };
  }
  const luz = num(v.s_min) / 60 * num(v.s_watts) / 1000 * num(v.s_kwh);
  const mo = num(v.s_mo_min) / 60 * num(v.s_mo_hora);
  const sub = num(v.s_insumos) + num(v.s_extra) + luz + mo;
  const desg = sub * num(v.s_desgaste) / 100;
  const costo = r2(sub + desg);
  return { parts: [['Insumos', num(v.s_insumos)], ['Tinta / papel extra', num(v.s_extra)], ['Electricidad', luz], ['Mano de obra', mo], ['Desgaste de equipo', desg]], costo, precio: sugerido(costo, v.s_margen) };
}
function sugerido(costo, margen) { const p = costo * (1 + num(margen) / 100); return p > 0 ? Math.ceil(p / 5) * 5 : 0; }
VIEWS.calc = () => {
  const v = calcVals();
  const F = (name, label, hint = '', step = 'any') => `<div><label class="f">${label}</label><input name="${name}" type="number" step="${step}" min="0" value="${esc(v[name])}">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  return pageHead('Calculadora de precios', 'Calcula cuánto te cuesta realmente y a cuánto vender.') +
    `<div class="toolbar"><div class="seg"><button class="${v.modo === 'sub' ? 'on' : ''}" onclick="App.calcModo('sub')">☕ Sublimación</button><button class="${v.modo === '3d' ? 'on' : ''}" onclick="App.calcModo('3d')">🧸 Impresión 3D</button></div></div>
    <div class="grid g2"><form id="calcF" class="card" onsubmit="return false">
    ${v.modo === 'sub' ? `<div class="fgrid">
      <div class="full"><label class="f">Tomar costo de insumos de un producto (opcional)</label><select id="calcBase">${opt('', '— Escribir a mano —', true)}${S.productos.map(p => opt(p.id, `${p.nombre} (${money(costoReceta(p))})`)).join('')}</select></div>
      ${F('s_insumos', 'Costo de insumos ($)', 'Taza/termo/playera en blanco, empaque…')}
      ${F('s_extra', 'Tinta y papel extra ($)', 'Si no están en la receta')}
      ${F('s_min', 'Minutos de plancha / horno')}
      ${F('s_watts', 'Potencia del equipo (watts)', 'Plancha de tazas ≈ 300–400 W; plana ≈ 1100–1800 W')}
      ${F('s_kwh', 'Precio de luz ($ por kWh)', 'Revisa tu recibo CFE')}
      ${F('s_mo_min', 'Minutos de tu trabajo (diseño + armado)')}
      ${F('s_mo_hora', '¿Cuánto vale tu hora? ($)')}
      ${F('s_desgaste', 'Desgaste de equipo (%)')}
      ${F('s_margen', 'Ganancia deseada (%)', '100% = vendes al doble del costo')}
    </div>` : `<div class="fgrid">
      ${F('d_gramos', 'Gramos de filamento', 'Lo dice el laminador (Creality Print)')}
      ${F('d_kg', 'Precio del filamento por kg ($)')}
      ${F('d_horas', 'Horas de impresión')}
      ${F('d_hora', 'Costo por hora de impresora ($)', 'Luz (Creality Hi ≈ 0.35 kWh) + desgaste de boquilla/cama')}
      ${F('d_mo_min', 'Minutos de tu trabajo (preparar, limpiar, pintar)')}
      ${F('d_mo_hora', '¿Cuánto vale tu hora? ($)')}
      ${F('d_extra', 'Extras ($)', 'Pintura, argollas, imanes, empaque')}
      ${F('d_fallos', 'Impresiones fallidas (%)', 'Margen por piezas que salen mal')}
      ${F('d_margen', 'Ganancia deseada (%)')}
    </div>`}</form>
    <div class="card"><h2>Resultado</h2><div id="calcRes"></div>
      <h3 class="mt">Guardar como costo de un producto</h3>
      <div class="fgrid"><div class="full"><select id="calcProd">${opt('', '— Elige el producto —', true)}${S.productos.map(p => opt(p.id, p.nombre)).join('')}</select></div>
      <div class="full"><label class="check"><input type="checkbox" id="calcPrecio"> También cambiar su precio de venta al sugerido</label></div>
      <div class="full"><button class="btn primary" type="button" onclick="App.calcGuardar()">Guardar en producto</button>
      <div class="hint">Se guarda la diferencia entre este costo total y su receta como "Otros costos por pieza".</div></div></div>
    </div></div>`;
};
VIEWS.calc.after = () => {
  const f = $('#calcF');
  const upd = () => {
    const v = calcVals();
    for (const el of f.elements) if (el.name) v[el.name] = num(el.value);
    const r = calcular(v);
    $('#calcRes').innerHTML = `<ul class="list">${r.parts.map(([k, x]) => `<li><span>${k}</span><span>${money(x)}</span></li>`).join('')}<li><b>Costo total por pieza</b><b>${money(r.costo)}</b></li></ul>
      <div class="result-box mt"><div class="muted small">Precio sugerido (redondeado a $5)</div><div class="big">${money(r.precio)}</div><div>Ganas ${money(r.precio - r.costo)} por pieza</div></div>`;
    App._calc = r;
    clearTimeout(App._calcT);
    App._calcT = setTimeout(() => commit([aj('calc', v)]).catch(e => console.warn(e)), 500);
  };
  f.addEventListener('input', upd);
  const b = $('#calcBase');
  if (b) b.onchange = () => { const p = producto(b.value); if (p) { f.s_insumos.value = costoReceta(p); $('#calcProd').value = p.id; upd(); } };
  upd();
};
App.calcModo = m => { const v = calcVals(); v.modo = m; commit([aj('calc', v)]).then(render).catch(e => fail(e)); };
App.calcGuardar = async () => {
  const id = $('#calcProd').value;
  if (!id) return toast('Elige el producto donde guardar el costo', 'warn');
  const p = clone(producto(id)), r = App._calc;
  p.costoExtra = r2(Math.max(0, r.costo - costoReceta(p)));
  if ($('#calcPrecio').checked) p.precio = r.precio;
  try { await commit([['productos', p]]); toast(`Costo de "${p.nombre}" actualizado a ${money(costoProducto(p))}`); }
  catch (e) { fail(e); }
};

/* ================= 9. CALENDARIO ================= */
let calMes = '';
VIEWS.calendario = () => {
  if (!calMes) calMes = inicioMes(today());
  const d0 = parseYmd(calMes);
  const start = addDays(calMes, -((d0.getDay() + 6) % 7));
  const ev = S.pedidos.filter(p => p.fechaEntrega && p.estado !== 'Cancelado' && p.estado !== 'Cotización');
  let cells = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => `<div class="dow">${x}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.slice(0, 7) !== calMes.slice(0, 7)) break;
    const es = ev.filter(p => p.fechaEntrega === d);
    cells += `<div class="day ${d.slice(0, 7) !== calMes.slice(0, 7) ? 'out' : ''} ${d === today() ? 'today' : ''}"><div class="n">${parseYmd(d).getDate()}</div>
      ${es.map(p => `<button class="ev ${stCls(p.estado)}" onclick="App.verPedido('${p.id}')" title="#${p.folio} ${esc(nomCliente(p))}">#${p.folio} ${esc(nomCliente(p))}</button>`).join('')}</div>`;
  }
  return pageHead('Calendario de entregas', 'Pedidos por fecha de entrega (los colores indican el estado).',
    `<button class="btn" onclick="App.calMes(-1)">‹</button><b style="min-width:150px;text-align:center;text-transform:capitalize">${MESES[d0.getMonth()]} ${d0.getFullYear()}</b><button class="btn" onclick="App.calMes(1)">›</button><button class="btn" onclick="App.calMes(0)">Hoy</button>`) +
    `<div class="cal">${cells}</div><p class="small muted mt">${PENDIENTES.slice(1).concat('Entregado').map(stBadge).join(' ')}</p>`;
};
App.calMes = n => {
  if (!n) calMes = inicioMes(today());
  else { const d = parseYmd(calMes); d.setMonth(d.getMonth() + n); calMes = ymd(d); }
  render();
};

/* ================= 10. REPORTES ================= */
let rDesde = '', rHasta = '';
function datosReporte() {
  const R = resumen(rDesde, rHasta);
  const prods = {}, clis = {}, cats = {};
  for (const p of R.vs) {
    const t = tot(p);
    const k = nomCliente(p);
    clis[k] = clis[k] || { nombre: k, n: 0, total: 0 };
    clis[k].n++; clis[k].total += t.total;
    for (const it of p.items) {
      prods[it.nombre] = prods[it.nombre] || { nombre: it.nombre, cant: 0, importe: 0, costo: 0 };
      prods[it.nombre].cant += num(it.cant); prods[it.nombre].importe += num(it.cant) * num(it.precio); prods[it.nombre].costo += num(it.cant) * num(it.costo);
    }
  }
  for (const g of gastosRango(rDesde, rHasta)) cats[g.categoria] = (cats[g.categoria] || 0) + num(g.monto);
  return {
    R, prods: Object.values(prods).sort((a, b) => b.importe - a.importe), clis: Object.values(clis).sort((a, b) => b.total - a.total),
    cats: Object.entries(cats).sort((a, b) => b[1] - a[1])
  };
}
VIEWS.reportes = () => {
  if (!rDesde) { rDesde = inicioMes(today()); rHasta = today(); }
  const { R, prods, clis, cats } = datosReporte();
  const tk = R.n ? R.ventas / R.n : 0;
  return pageHead('Reportes', 'Elige el periodo y revisa cómo va tu negocio.') +
    `<div class="toolbar"><label class="small muted">Del</label><input type="date" id="rDesde" value="${rDesde}"><label class="small muted">al</label><input type="date" id="rHasta" value="${rHasta}">
      <button class="btn sm" onclick="App.rango('mes')">Este mes</button><button class="btn sm" onclick="App.rango('pasado')">Mes pasado</button><button class="btn sm" onclick="App.rango('anio')">Este año</button></div>
    <div class="grid g4">
      <div class="card stat"><div class="lbl">Ventas</div><div class="val">${money(R.ventas)}</div><div class="sub">${R.n} venta(s) · ticket prom. ${money(tk)}</div></div>
      <div class="card stat"><div class="lbl">Costo de insumos</div><div class="val">${money(R.costo)}</div><div class="sub">De lo vendido</div></div>
      <div class="card stat"><div class="lbl">Gastos de operación</div><div class="val">${money(R.gastosOp)}</div><div class="sub">Compras de insumos: ${money(R.compras)}</div></div>
      <div class="card stat hl"><div class="lbl">Utilidad</div><div class="val">${money(R.utilidad)}</div><div class="sub">Cobrado en el periodo: ${money(R.cobrado)}</div></div>
    </div>
    <div class="btns mt"><button class="btn" onclick="App.csv('ventas')">⬇️ Ventas (CSV)</button><button class="btn" onclick="App.csv('productos')">⬇️ Productos (CSV)</button><button class="btn" onclick="App.csv('clientes')">⬇️ Clientes (CSV)</button><button class="btn" onclick="App.csv('gastos')">⬇️ Gastos (CSV)</button></div>
    <p class="hint">Los CSV se abren en Excel o Google Sheets.</p>
    <div class="grid g2 mt">
      <div class="card"><h2>🏆 Productos más vendidos</h2>${prods.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Importe</th></tr></thead><tbody>${prods.slice(0, 10).map(x => `<tr><td>${esc(x.nombre)}</td><td class="num">${fqty(x.cant)}</td><td class="num">${money(x.importe)}</td></tr>`).join('')}</tbody></table></div>` : emptyMsg('📈', 'Sin ventas en este periodo.')}</div>
      <div class="card"><h2>⭐ Clientes top</h2>${clis.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th class="num">Compras</th><th class="num">Total</th></tr></thead><tbody>${clis.slice(0, 10).map(x => `<tr><td>${esc(x.nombre)}</td><td class="num">${x.n}</td><td class="num">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : emptyMsg('👥', 'Sin ventas en este periodo.')}</div>
    </div>
    <div class="card mt"><h2>🧾 Gastos por categoría</h2>${cats.length ? `<ul class="list">${cats.map(([c, m]) => `<li><span>${esc(c)}</span><b>${money(m)}</b></li>`).join('')}</ul>` : emptyMsg('🧾', 'Sin gastos en este periodo.')}</div>`;
};
VIEWS.reportes.after = () => {
  $('#rDesde').onchange = e => { rDesde = e.target.value || rDesde; render(); };
  $('#rHasta').onchange = e => { rHasta = e.target.value || rHasta; render(); };
};
App.rango = k => {
  const t = today();
  if (k === 'mes') { rDesde = inicioMes(t); rHasta = t; }
  if (k === 'pasado') { const d = parseYmd(inicioMes(t)); d.setMonth(d.getMonth() - 1); rDesde = ymd(d); rHasta = finMes(rDesde); }
  if (k === 'anio') { rDesde = t.slice(0, 4) + '-01-01'; rHasta = t; }
  render();
};
App.csv = tipo => {
  const { R, prods, clis } = datosReporte();
  let rows;
  if (tipo === 'ventas') rows = [['Folio', 'Fecha', 'Cliente', 'Estado', 'Productos', 'Total', 'Pagado', 'Saldo', 'Costo', 'Ganancia']]
    .concat(R.vs.sort((a, b) => fVenta(a).localeCompare(fVenta(b))).map(p => { const t = tot(p); return [p.folio, fVenta(p), nomCliente(p), p.estado, resumenItems(p), t.total, t.pagado, t.saldo, t.costo, r2(t.total - t.costo)]; }));
  else if (tipo === 'productos') rows = [['Producto', 'Cantidad', 'Importe', 'Costo', 'Ganancia']].concat(prods.map(x => [x.nombre, r3(x.cant), r2(x.importe), r2(x.costo), r2(x.importe - x.costo)]));
  else if (tipo === 'clientes') rows = [['Cliente', 'Compras', 'Total']].concat(clis.map(x => [x.nombre, x.n, r2(x.total)]));
  else rows = [['Fecha', 'Categoría', 'Monto', 'Nota']].concat(gastosRango(rDesde, rHasta).sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => [g.fecha, g.categoria, g.monto, g.nota || '']));
  download(`${tipo}_${rDesde}_a_${rHasta}.csv`, csv(rows), 'text/csv;charset=utf-8');
  toast('Archivo descargado');
};

/* ================= 11. CONFIGURACIÓN ================= */
VIEWS.config = () => {
  const n = neg();
  const last = S.ajustes.ultimoRespaldo;
  const F = (k, label, ph = '', type = 'text') => `<div><label class="f">${label}</label><input name="${k}" type="${type}" value="${esc(n[k])}" placeholder="${esc(ph)}"></div>`;
  return pageHead('Configuración', 'Datos de tu negocio: aparecen en las notas, cotizaciones y en la tienda.') +
    `<form id="cfgF" class="card"><h2>🏪 Mi negocio</h2>
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><div class="photo-prev" id="logoPrev" style="width:80px;height:80px">${n.logo ? `<img src="${esc(n.logo)}" alt="">` : '🏪'}</div>
        <div><label class="btn sm">🖼️ Subir logo<input type="file" id="logoFile" accept="image/*" hidden></label> <button class="btn sm" type="button" id="logoQuitar">Quitar</button></div></div>
      <div class="fgrid">
        ${F('nombre', 'Nombre del negocio *')}${F('lema', 'Lema / frase', 'Regalos personalizados que enamoran')}
        ${F('whatsapp', 'WhatsApp del negocio (10 dígitos)', '5512345678', 'tel')}${F('correo', 'Correo', '', 'email')}
        <div class="full"><label class="f">Dirección</label><input name="direccion" value="${esc(n.direccion)}"></div>
        <div class="full"><label class="f">Enlace de Google Maps (opcional)</label><input name="mapsUrl" type="url" value="${esc(n.mapsUrl)}" placeholder="https://maps.app.goo.gl/…"><div class="hint">En Google Maps busca tu negocio → Compartir → Copiar vínculo.</div></div>
        ${F('facebook', 'Facebook (enlace)', 'https://facebook.com/…', 'url')}${F('instagram', 'Instagram (enlace)', 'https://instagram.com/…', 'url')}
        ${F('tiktok', 'TikTok (enlace)', 'https://tiktok.com/@…', 'url')}${F('horarios', 'Horarios')}
        <div class="full"><label class="f">Mensaje de bienvenida (tienda)</label><textarea name="bienvenida">${esc(n.bienvenida)}</textarea></div>
        <div class="full"><label class="f">Texto al pie de notas y cotizaciones</label><textarea name="notaPie">${esc(n.notaPie)}</textarea></div>
      </div>
      <button class="btn primary mt">Guardar datos</button></form>

    <div class="grid g2 mt">
      <div class="card"><h2>💾 Respaldo de información</h2>
        <p>Último respaldo: <b>${last ? fdate(ymd(new Date(last))) : 'nunca'}</b></p>
        <p class="small muted">Descarga un archivo con TODA tu información. Guárdalo en tu Google Drive, correo o USB. Si cambias de computadora, lo puedes cargar aquí.</p>
        <div class="btns"><button class="btn primary" onclick="App.exportar()">⬇️ Descargar respaldo</button><button class="btn" onclick="App.importar()">⬆️ Cargar respaldo</button></div>
      </div>
      <div class="card"><h2>🛍️ Tienda en línea</h2>
        <p class="small">Tu tienda lee el archivo <b>catalogo.json</b>. Cada vez que cambies productos o precios:</p>
        <ol class="steps small">
          <li>Presiona <b>Exportar catálogo</b> (se descarga <code>catalogo.json</code>).</li>
          <li>Entra a tu repositorio en <b>github.com</b> → carpeta <b>tienda</b>.</li>
          <li>Botón <b>Add file → Upload files</b>, arrastra el <code>catalogo.json</code> y presiona <b>Commit changes</b> (reemplaza al anterior).</li>
          <li>Espera 1–2 minutos y recarga tu tienda.</li>
        </ol>
        <p class="small muted">Solo se publican los productos marcados como "Mostrar en la tienda" (${S.productos.filter(p => p.visible).length} ahora).</p>
        <div class="btns"><button class="btn primary" onclick="App.exportarCatalogo()">⬇️ Exportar catálogo para la tienda</button><a class="btn" href="../tienda/" target="_blank" rel="noopener">Ver tienda</a></div>
      </div>
    </div>
    <div class="card mt"><h2>🧹 Limpieza</h2>
      <div class="btns">${hayEjemplos() ? '<button class="btn" onclick="App.borrarEjemplos()">Borrar datos de ejemplo</button>' : '<span class="muted small">No hay datos de ejemplo.</span>'}
      <button class="btn danger" onclick="App.borrarTodo()">Borrar TODA la información</button></div></div>`;
};
let logoTmp = null;
VIEWS.config.after = () => {
  logoTmp = null;
  $('#logoFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { logoTmp = await reduceImage(await fileToDataURL(f), 300, 'image/png'); $('#logoPrev').innerHTML = `<img src="${logoTmp}" alt="">`; toast('Logo listo: presiona "Guardar datos"', 'warn'); }
    catch (err) { fail(err, 'No pude leer esa imagen.'); }
  };
  $('#logoQuitar').onclick = () => { logoTmp = ''; $('#logoPrev').textContent = '🏪'; };
  $('#cfgF').onsubmit = async ev => {
    ev.preventDefault();
    const d = formData(ev.target);
    if (!d.nombre) return toast('El nombre del negocio es obligatorio', 'warn');
    const n = Object.assign(neg(), d);
    if (logoTmp !== null) n.logo = logoTmp;
    try { await commit([aj('negocio', n)]); refreshBrand(); toast('Datos guardados'); render(); }
    catch (e) { fail(e, 'No se pudieron guardar los datos. Si el logo es muy grande, prueba con otro.'); }
  };
};
App.exportar = async () => {
  try {
    const prev = S.ajustes.ultimoRespaldo;
    await commit([aj('ultimoRespaldo', new Date().toISOString())]);
    const data = {};
    for (const s of STORES) data[s] = await getAll(s);
    const payload = { app: 'erp-sublima-facil', version: 1, fecha: new Date().toISOString(), data };
    try { download(`respaldo-${(neg().nombre || 'negocio').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${today()}.json`, JSON.stringify(payload)); }
    catch (e) { await commit([aj('ultimoRespaldo', prev || null)]); throw e; }
    toast('Respaldo descargado. Guárdalo en un lugar seguro 👍');
    render();
  } catch (e) { fail(e, 'No se pudo generar el respaldo.'); }
};
App.importar = () => {
  const inp = $('#fileImport');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      await App.restaurar(obj);
    } catch (e) { fail(e, 'Ese archivo no es un respaldo válido de este sistema.'); }
  };
  inp.click();
};
App.restaurar = async (obj, sinPreguntar) => {
  if (!obj || obj.app !== 'erp-sublima-facil' || !obj.data || typeof obj.data !== 'object') throw new Error('formato');
  const d = obj.data;
  const cuenta = ['clientes', 'productos', 'insumos', 'pedidos', 'gastos'].map(s => `${(d[s] || []).length} ${s}`).join(', ');
  if (!sinPreguntar && !ask(`Respaldo del ${fdate(ymd(new Date(obj.fecha)))}:\n${cuenta}.\n\n⚠️ Esto REEMPLAZA toda la información actual por la del respaldo. ¿Continuar?`)) return false;
  await new Promise((res, rej) => {
    const t = db.transaction(STORES, 'readwrite');
    for (const s of STORES) {
      const os = t.objectStore(s);
      os.clear();
      for (const row of Array.isArray(d[s]) ? d[s] : []) if (row && (s === 'ajustes' ? row.key : row.id)) os.put(row);
    }
    t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
  await loadAll();
  if (!S.ajustes.seeded) await commit([aj('seeded', true)]);
  refreshBrand();
  toast('Respaldo cargado correctamente ✅');
  render();
  return true;
};
App.exportarCatalogo = async () => {
  try {
    const n = neg();
    const vis = S.productos.filter(p => p.visible);
    if (!vis.length) return toast('No hay productos marcados como visibles en la tienda', 'warn');
    const productos = [];
    for (const p of vis) {
      let foto = '';
      if (p.foto) { try { foto = await reduceImage(p.foto, 480, 'image/jpeg', 0.75); } catch (e) { foto = ''; } }
      productos.push({ id: p.id, nombre: p.nombre, categoria: p.categoria || 'Otros', precio: num(p.precio), descripcion: p.descripcion || '', tiempo: p.tiempo || '', emoji: p.emoji || '🎁', foto });
    }
    const negocio = {};
    ['nombre', 'lema', 'logo', 'whatsapp', 'correo', 'direccion', 'mapsUrl', 'facebook', 'instagram', 'tiktok', 'bienvenida', 'horarios'].forEach(k => { negocio[k] = n[k] || ''; });
    const cat = { generado: new Date().toISOString(), moneda: 'MXN', negocio, categorias: [...new Set(productos.map(p => p.categoria))], productos };
    download('catalogo.json', JSON.stringify(cat, null, 1));
    openModal('✅ Catálogo exportado', `<p>Se descargó <b>catalogo.json</b> con ${productos.length} producto(s).</p>
      <ol class="steps"><li>Abre tu repositorio en <b>github.com</b> y entra a la carpeta <b>tienda</b>.</li>
      <li>Presiona <b>Add file → Upload files</b>.</li><li>Arrastra el archivo <b>catalogo.json</b> (de tu carpeta Descargas).</li>
      <li>Presiona <b>Commit changes</b>. En 1–2 minutos tu tienda mostrará los cambios.</li></ol>
      <p class="hint">Importante: el archivo debe llamarse exactamente <b>catalogo.json</b>. Si tu navegador lo renombró (ej. "catalogo (1).json"), cámbiale el nombre antes de subirlo.</p>`,
      `<button class="btn primary" type="button" onclick="App.close()">Entendido</button>`);
  } catch (e) { fail(e, 'No se pudo exportar el catálogo.'); }
};
App.borrarEjemplos = async () => {
  if (!ask('¿Borrar los productos, insumos y cliente de ejemplo?\nTus datos reales no se tocan.')) return;
  const ops = [];
  for (const s of ['insumos', 'productos', 'clientes']) S[s].filter(x => x.ejemplo).forEach(x => ops.push([s, x.id, true]));
  const borrados = new Set(S.insumos.filter(x => x.ejemplo).map(x => x.id));
  S.movimientos.filter(m => borrados.has(m.insumoId)).forEach(m => ops.push(['movimientos', m.id, true]));
  S.productos.filter(p => !p.ejemplo && (p.receta || []).some(r => borrados.has(r.insumoId))).forEach(p => { const q = clone(p); q.receta = q.receta.filter(r => !borrados.has(r.insumoId)); ops.push(['productos', q]); });
  try { await commit(ops); toast('Datos de ejemplo borrados'); render(); } catch (e) { fail(e); }
};
App.borrarTodo = async () => {
  if (!ask('⚠️ ¿Borrar TODA la información (clientes, pedidos, inventario, gastos)?\nTe recomendamos descargar un respaldo antes.')) return;
  if (!ask('Última confirmación: esto no se puede deshacer. ¿Borrar todo?')) return;
  try {
    await new Promise((res, rej) => { const t = db.transaction(STORES, 'readwrite'); STORES.forEach(s => t.objectStore(s).clear()); t.oncomplete = res; t.onerror = () => rej(t.error); });
    await commit([aj('seeded', true), aj('folio', 0)]);
    await loadAll(); refreshBrand(); toast('Información borrada'); go('panel');
  } catch (e) { fail(e); }
};

/* ================= Inicio ================= */
async function init() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) go(b.dataset.view); });
  $('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
  $('#btnBackup').onclick = () => openModal('💾 Respaldo', `<p>Tus datos se guardan en <b>este navegador</b>. Descarga un respaldo cada semana y guárdalo en Drive, correo o USB.</p>
    <p class="muted">Último respaldo: <b>${S.ajustes.ultimoRespaldo ? fdate(ymd(new Date(S.ajustes.ultimoRespaldo))) : 'nunca'}</b></p>`,
    `<button class="btn" type="button" onclick="App.close();App.importar()">⬆️ Cargar respaldo</button><button class="btn primary" type="button" onclick="App.close();App.exportar()">⬇️ Descargar respaldo</button>`);
  modal().addEventListener('close', () => { modal().dataset.pedido = ''; });
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== VIEW && VIEWS[v]) go(v); });
  try {
    db = await openDB();
    await loadAll();
    if (!S.ajustes.seeded) { await commit(seedOps()); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    console.warn(e);
    $('#main').innerHTML = `<div class="alert bad"><span>⛔</span><div class="grow"><b>No se pudo abrir la base de datos.</b><br>Usa Chrome, Edge o Safari actualizados y no uses modo incógnito. Si tienes el sistema abierto en otra pestaña, ciérrala y recarga esta página.</div><button class="btn" onclick="location.reload()">Recargar</button></div>`;
    return;
  }
  refreshBrand();
  go(location.hash.slice(1) || 'panel');
}
document.addEventListener('DOMContentLoaded', init);
