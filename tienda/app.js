/* Tienda pública — lee catalogo.json y arma pedidos por WhatsApp. */
'use strict';
(() => {
  const CART_KEY = 'tienda_carrito_v1';
  const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = n => fmt.format(Number(n) || 0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => document.querySelector(s);
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const safeImg = u => /^(data:image\/|https?:\/\/)/i.test(String(u || '')) ? String(u) : '';

  let CAT = { negocio: {}, productos: [] };
  let cat = '', q = '';
  let cart = [];

  function telWa(t) { let d = String(t || '').replace(/\D/g, ''); if (d.length === 10) d = '52' + d; return d; }
  const waLink = txt => 'https://wa.me/' + telWa(CAT.negocio.whatsapp) + '?text=' + encodeURIComponent(txt);
  const prod = id => CAT.productos.find(p => p.id === id);
  const ph = p => 'ph-' + (Math.abs([...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0)) % 4);
  const img = p => safeImg(p.foto) ? `<img src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy">` : `<span role="img" aria-label="${esc(p.nombre)}">${esc(p.emoji || '🎁')}</span>`;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function loadCart() {
    try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); cart = Array.isArray(c) ? c : []; } catch (e) { cart = []; }
    cart = cart.filter(it => it && prod(it.id) && it.cant > 0);
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* almacenamiento no disponible: el carrito vive solo en esta visita */ }
    $('#cartCount').textContent = cart.reduce((a, it) => a + it.cant, 0);
  }
  const total = () => cart.reduce((a, it) => a + (prod(it.id) ? prod(it.id).precio * it.cant : 0), 0);

  /* ---------- Negocio ---------- */
  function renderNegocio() {
    const n = CAT.negocio || {};
    const nombre = n.nombre || 'Nuestra tienda';
    document.title = `${nombre} · Regalos personalizados: tazas, termos, playeras y figuras 3D`;
    const md = document.querySelector('meta[name="description"]');
    if (md && n.lema) md.setAttribute('content', `${n.lema}. Tazas, termos, playeras, cojines, llaveros y figuras 3D personalizadas. Pide por WhatsApp.`);
    $('#bizName').textContent = nombre;
    $('#heroName').textContent = nombre;
    $('#heroLema').textContent = n.lema || '';
    $('#heroWelcome').textContent = n.bienvenida || '';
    $('#footTxt').textContent = `© ${new Date().getFullYear()} ${nombre}`;
    $('#logo').innerHTML = safeImg(n.logo) ? `<img src="${esc(n.logo)}" alt="">` : esc(nombre.charAt(0).toUpperCase());
    const hola = waLink(`¡Hola ${nombre}! Me gustaría información sobre sus productos personalizados.`);
    $('#heroWa').href = hola; $('#waFloat').href = hola;
    const redes = [['Facebook', n.facebook], ['Instagram', n.instagram], ['TikTok', n.tiktok]].filter(r => safeUrl(r[1]));
    $('#contactBox').innerHTML = `
      <div class="box"><h3>💬 WhatsApp</h3><p>La forma más rápida de cotizar y hacer tu pedido.</p>
        ${n.whatsapp ? `<p><b>${esc(n.whatsapp)}</b></p><a class="btn wa" href="${esc(hola)}" target="_blank" rel="noopener">Enviar mensaje</a>` : '<p class="muted">Próximamente.</p>'}</div>
      <div class="box"><h3>📍 Dónde estamos</h3><p>${esc(n.direccion || 'Pregúntanos por WhatsApp')}</p><p class="muted">🕒 ${esc(n.horarios || '')}</p>
        ${safeUrl(n.mapsUrl) ? `<a class="btn" href="${esc(n.mapsUrl)}" target="_blank" rel="noopener">🗺️ Ver en Google Maps</a>` : ''}</div>
      <div class="box"><h3>⭐ Síguenos</h3>${n.correo ? `<p>✉️ <a href="mailto:${esc(n.correo)}">${esc(n.correo)}</a></p>` : ''}
        <div class="socials">${redes.length ? redes.map(([k, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${k}</a>`).join('') : '<span class="muted">Pronto en redes sociales.</span>'}</div></div>`;
  }

  /* ---------- Catálogo ---------- */
  function renderCats() {
    const cats = [...new Set(CAT.productos.map(p => p.categoria).filter(Boolean))];
    $('#cats').innerHTML = [['', 'Todo']].concat(cats.map(c => [c, c])).map(([v, l]) => `<button class="chip ${v === cat ? 'on' : ''}" data-cat="${esc(v)}">${esc(l)}</button>`).join('');
  }
  function renderGrid() {
    const qq = q.trim().toLowerCase();
    const list = CAT.productos.filter(p => (!cat || p.categoria === cat) && (!qq || `${p.nombre} ${p.categoria} ${p.descripcion}`.toLowerCase().includes(qq)));
    $('#grid').innerHTML = list.length ? list.map(p => `
      <article class="card">
        <button class="img ${ph(p)}" data-ver="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">${img(p)}</button>
        <div class="body"><span class="cat">${esc(p.categoria)}</span><h3>${esc(p.nombre)}</h3>
          <span class="price">${money(p.precio)}</span>
          <div class="row"><button class="btn" data-ver="${esc(p.id)}">Ver</button><button class="btn primary" data-add="${esc(p.id)}">Agregar</button></div></div>
      </article>`).join('') : '<p class="muted center">No encontramos productos con esa búsqueda. ¿Buscas algo especial? ¡Pregúntanos por WhatsApp!</p>';
  }

  function openDlg(d) { if (!d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } } }
  function closeDlg(d) { if (d.open) { try { d.close(); } catch (e) { d.removeAttribute('open'); } } }

  function verProducto(id) {
    const p = prod(id);
    if (!p) return;
    let cant = 1;
    const d = $('#dlgProd');
    d.innerHTML = `<div class="sh-head"><h2>${esc(p.nombre)}</h2><button class="x" data-close aria-label="Cerrar">×</button></div>
      <div class="sh-body"><div class="det-img ${ph(p)}">${img(p)}</div>
        <div class="det-price">${money(p.precio)}</div>
        <p>${esc(p.descripcion)}</p>
        ${p.tiempo ? `<p class="muted">⏱️ Tiempo de producción: ${esc(p.tiempo)}</p>` : ''}
        <label class="f" for="detNotas">¿Cómo lo quieres? (nombre, frase, colores, talla…)</label>
        <textarea id="detNotas" placeholder="Ej. Con la foto de mi perrito y el texto 'Te quiero, mamá'"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap">
          <div class="qty"><button data-q="-1" aria-label="Menos">−</button><b id="detCant">1</b><button data-q="1" aria-label="Más">+</button></div>
          <button class="btn primary" id="detAdd">Agregar al carrito</button></div>
        <p class="note">Después nos envías tu foto o diseño por WhatsApp. ¿Quieres verlo antes? <a href="../index.html#producto=${encodeURIComponent(p.nombre)}" target="_blank" rel="noopener">Pruébalo en el editor</a>.</p>
      </div>`;
    d.onclick = e => {
      if (e.target === d || e.target.closest('[data-close]')) return closeDlg(d);
      const b = e.target.closest('[data-q]');
      if (b) { cant = Math.max(1, cant + Number(b.dataset.q)); $('#detCant').textContent = cant; }
      if (e.target.id === 'detAdd') { addCart(id, cant, $('#detNotas').value.trim()); closeDlg(d); }
    };
    openDlg(d);
  }

  function addCart(id, cant = 1, notas = '') {
    const ex = cart.find(it => it.id === id && (it.notas || '') === notas);
    if (ex) ex.cant += cant; else cart.push({ id, cant, notas });
    saveCart();
    toast(`Agregado: ${prod(id).nombre} 🛒`);
  }

  /* ---------- Carrito ---------- */
  let cliente = { nombre: '', fecha: '', comentarios: '' };
  try { cliente = Object.assign(cliente, JSON.parse(localStorage.getItem(CART_KEY + '_cli') || '{}')); } catch (e) { /* sin almacenamiento */ }
  function renderCart() {
    const d = $('#dlgCart');
    d.innerHTML = `<div class="sh-head"><h2>🛒 Tu pedido</h2><button class="x" data-close aria-label="Cerrar">×</button></div>
      <div class="sh-body">${cart.length ? cart.map((it, i) => { const p = prod(it.id); return `
        <div class="cl"><div class="th ${ph(p)}">${img(p)}</div>
          <div><b>${esc(p.nombre)}</b><div class="note">${money(p.precio)} c/u${it.notas ? ' · ' + esc(it.notas) : ''}</div><button class="rm" data-rm="${i}">Quitar</button></div>
          <div style="text-align:right"><div class="qty"><button data-cq="${i}" data-d="-1" aria-label="Menos">−</button><b>${it.cant}</b><button data-cq="${i}" data-d="1" aria-label="Más">+</button></div><div><b>${money(p.precio * it.cant)}</b></div></div></div>`; }).join('') +
        `<div class="total"><span>Total estimado</span><span>${money(total())}</span></div>
        <form id="ckForm">
          <label class="f" for="ckNombre">Tu nombre *</label><input id="ckNombre" required autocomplete="name" value="${esc(cliente.nombre)}">
          <label class="f" for="ckFecha">¿Para cuándo lo necesitas?</label><input id="ckFecha" type="date" value="${esc(cliente.fecha)}">
          <label class="f" for="ckCom">Comentarios (entrega, envío, ideas)</label><textarea id="ckCom">${esc(cliente.comentarios)}</textarea>
          ${pagoInfo && pagoInfo.pagos ? `<button type="button" class="btn primary block" id="ckTarjeta" style="margin-top:14px">💳 Pagar con tarjeta${pagoInfo.envios ? ' (con envío a domicilio)' : ''}</button>` : ''}
          <button class="btn wa block" style="margin-top:${pagoInfo && pagoInfo.pagos ? 8 : 14}px" ${CAT.negocio.whatsapp ? '' : 'disabled'}>💬 Pedir por WhatsApp</button>
          <p class="note">${pagoInfo && pagoInfo.pagos ? 'Paga en línea con tarjeta, o manda tu pedido por WhatsApp para cotizar tu diseño.' : 'Se abrirá WhatsApp con tu pedido listo para enviar. El precio final se confirma al revisar tu diseño. Envío no incluido.'}</p>
        </form>` : `<p class="muted" style="text-align:center;padding:24px 0">Tu carrito está vacío.<br>¡Agrega algo bonito! 💜</p><button class="btn primary block" data-close>Ver catálogo</button>`}
      </div>`;
    const f = $('#ckForm');
    if (f) f.onsubmit = e => { e.preventDefault(); pedir(); };
    const tj = $('#ckTarjeta');
    if (tj) tj.onclick = () => renderPago();
  }
  function pedir() {
    cliente = { nombre: $('#ckNombre').value.trim(), fecha: $('#ckFecha').value, comentarios: $('#ckCom').value.trim() };
    if (!cliente.nombre) { toast('Escribe tu nombre, por favor'); return; }
    try { localStorage.setItem(CART_KEY + '_cli', JSON.stringify(cliente)); } catch (e) { /* sin almacenamiento */ }
    const n = CAT.negocio;
    let t = `¡Hola ${n.nombre || ''}! 👋 Quiero hacer este pedido:\n\n`;
    t += cart.map(it => { const p = prod(it.id); return `• ${it.cant} × ${p.nombre} — ${money(p.precio * it.cant)}${it.notas ? `\n   ✏️ ${it.notas}` : ''}`; }).join('\n');
    t += `\n\n*Total estimado: ${money(total())}*\n\n👤 Nombre: ${cliente.nombre}`;
    if (cliente.fecha) t += `\n📅 Lo necesito para: ${new Date(cliente.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    if (cliente.comentarios) t += `\n📝 ${cliente.comentarios}`;
    t += '\n\nEn seguida les envío mi foto/diseño. ¡Gracias!';
    window.open(waLink(t), '_blank', 'noopener');
  }

/* ---------- Pago con tarjeta (Clip) a través del conector ---------- */
  // El conector (Cloudflare) calcula el envío y arma el cobro con los precios reales del catálogo.
  const conector = () => String((CAT.negocio || {}).conector || '').replace(/\/+$/, '');
  let pagoInfo = null;   // { pagos, envios, recoger } que reporta el conector
  async function api(ruta, body) {
    let r;
    try {
      r = await fetch(conector() + '/tienda/' + ruta, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    } catch (e) { throw new Error('No hay conexión. Revisa tu internet e intenta de nuevo.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se pudo completar. Intenta de nuevo.');
    return d;
  }
  async function revisarPagos() {
    if (!conector()) return;
    try { pagoInfo = await api('estado'); } catch (e) { pagoInfo = null; }
  }
  const CP_EDOS = [[1, 16, 'Ciudad de México'], [20, 20, 'Aguascalientes'], [21, 22, 'Baja California'], [23, 23, 'Baja California Sur'], [24, 24, 'Campeche'],
    [25, 27, 'Coahuila'], [28, 28, 'Colima'], [29, 30, 'Chiapas'], [31, 33, 'Chihuahua'], [34, 35, 'Durango'], [36, 38, 'Guanajuato'], [39, 41, 'Guerrero'],
    [42, 43, 'Hidalgo'], [44, 49, 'Jalisco'], [50, 57, 'Estado de México'], [58, 61, 'Michoacán'], [62, 62, 'Morelos'], [63, 63, 'Nayarit'], [64, 67, 'Nuevo León'],
    [68, 71, 'Oaxaca'], [72, 75, 'Puebla'], [76, 76, 'Querétaro'], [77, 77, 'Quintana Roo'], [78, 79, 'San Luis Potosí'], [80, 82, 'Sinaloa'], [83, 85, 'Sonora'],
    [86, 86, 'Tabasco'], [87, 89, 'Tamaulipas'], [90, 90, 'Tlaxcala'], [91, 96, 'Veracruz'], [97, 97, 'Yucatán'], [98, 99, 'Zacatecas']];
  const edoCp = cp => { const n = parseInt(String(cp).slice(0, 2), 10); const e = CP_EDOS.find(([a, b]) => n >= a && n <= b); return e ? e[2] : ''; };

  let pago = { cliente: {}, entrega: 'envio', direccion: {}, cot: null, tarifa: '' };
  try { const g = JSON.parse(localStorage.getItem(CART_KEY + '_pago') || '{}'); pago.cliente = g.cliente || {}; pago.direccion = g.direccion || {}; } catch (e) { /* sin almacenamiento */ }
  function renderPago() {
    const d = $('#dlgCart'), info = pagoInfo || {}, sub = total();
    if (!info.envios) pago.entrega = 'recoger';
    if (!info.recoger && info.envios) pago.entrega = 'envio';
    const envio = pago.entrega === 'envio' && pago.cot ? (pago.cot.tarifas.find(t => t.id === pago.tarifa) || null) : null;
    const tot = sub + (envio ? envio.total : 0);
    const c = pago.cliente, a = pago.direccion;
    const I = (id, label, v, extra = '') => `<label class="f" for="${id}">${label}</label><input id="${id}" value="${esc(v || '')}" ${extra}>`;
    d.innerHTML = `<div class="sh-head"><h2>💳 Pagar con tarjeta</h2><button class="x" data-close aria-label="Cerrar">×</button></div>
      <div class="sh-body"><form id="pgForm">
        ${I('pgNom', 'Tu nombre *', c.nombre, 'required autocomplete="name"')}
        ${I('pgTel', 'Tu WhatsApp (10 dígitos) *', c.telefono, 'required inputmode="tel" autocomplete="tel"')}
        ${I('pgMail', 'Correo (para tu comprobante)', c.correo, 'type="email" autocomplete="email"')}
        <label class="f">Entrega</label>
        <div class="seg">${info.envios ? `<label><input type="radio" name="pgEnt" value="envio" ${pago.entrega === 'envio' ? 'checked' : ''}> 📦 Envío a domicilio</label>` : ''}
          ${info.recoger !== false ? `<label><input type="radio" name="pgEnt" value="recoger" ${pago.entrega === 'recoger' ? 'checked' : ''}> 🏪 Recoger en tienda</label>` : ''}</div>
        ${pago.entrega === 'envio' ? `
          ${I('pgCp', 'Código postal *', a.cp, 'inputmode="numeric" maxlength="5" autocomplete="postal-code"')}
          ${I('pgCalle', 'Calle y número *', a.calle, 'autocomplete="address-line1"')}
          ${I('pgCol', 'Colonia *', a.colonia)}${I('pgMun', 'Municipio o alcaldía *', a.municipio)}${I('pgEdo', 'Estado *', a.estado)}
          ${I('pgRef', 'Referencias', a.referencia, 'placeholder="Entre calles, color de casa…"')}
          <button type="button" class="btn block" id="pgCot" style="margin-top:12px">🚚 Calcular envío</button>
          <div id="pgTarifas">${pago.cot ? (pago.cot.tarifas.length ? pago.cot.tarifas.map(t => `<label class="tarifa"><input type="radio" name="pgTar" value="${esc(t.id)}" ${t.id === pago.tarifa ? 'checked' : ''}> <span><b>${esc(t.paqueteria)}</b> ${esc(t.servicio || '')}${t.dias ? ` · ${t.dias} día${t.dias > 1 ? 's' : ''}` : ''}</span><b>${money(t.total)}</b></label>`).join('') : '<p class="note">No encontramos paquetería para esa dirección. Revisa los datos o elige recoger en tienda.</p>') : ''}</div>` : `<p class="note">Te avisaremos por WhatsApp cuando esté listo para recoger.</p>`}
        <div class="total"><span>Productos</span><span>${money(sub)}</span></div>
        ${pago.entrega === 'envio' ? `<div class="total" style="border:0;padding-top:0"><span>Envío</span><span>${envio ? money(envio.total) : '—'}</span></div>` : ''}
        <div class="total"><span>Total a pagar</span><span>${money(tot)}</span></div>
        <button class="btn primary block" id="pgPagar" ${pago.entrega === 'envio' && !envio ? 'disabled' : ''}>Pagar ${money(tot)} con tarjeta</button>
        <p class="note">Pago seguro con <b>Clip</b>. Te llevaremos a su página para poner tu tarjeta y luego regresarás aquí.</p>
        <button type="button" class="btn block" id="pgVolver" style="margin-top:6px">← Volver al carrito</button>
      </form></div>`;
    const f = $('#pgForm');
    const leer = () => {
      pago.cliente = { nombre: $('#pgNom').value.trim(), telefono: $('#pgTel').value.trim(), correo: $('#pgMail').value.trim() };
      if ($('#pgCp')) pago.direccion = { cp: $('#pgCp').value.trim(), calle: $('#pgCalle').value.trim(), colonia: $('#pgCol').value.trim(), municipio: $('#pgMun').value.trim(), estado: $('#pgEdo').value.trim(), referencia: $('#pgRef').value.trim() };
      try { localStorage.setItem(CART_KEY + '_pago', JSON.stringify({ cliente: pago.cliente, direccion: pago.direccion })); } catch (e) { /* sin almacenamiento */ }
    };
    f.onchange = e => {
      if (e.target.name === 'pgEnt') { leer(); pago.entrega = e.target.value; renderPago(); }
      else if (e.target.name === 'pgTar') { pago.tarifa = e.target.value; leer(); renderPago(); }
    };
    f.oninput = e => {
      if (e.target.id === 'pgCp' && e.target.value.length === 5 && !$('#pgEdo').value) $('#pgEdo').value = edoCp(e.target.value);
      // Si cambia la dirección, el envío hay que volver a calcularlo
      if (['pgCp', 'pgCol', 'pgMun', 'pgEdo'].includes(e.target.id) && pago.cot) { pago.cot = null; pago.tarifa = ''; $('#pgTarifas').innerHTML = ''; $('#pgPagar').disabled = true; }
    };
    $('#pgVolver').onclick = () => { leer(); renderCart(); };
    const cot = $('#pgCot');
    if (cot) cot.onclick = async () => {
      leer();
      const a = pago.direccion;
      if (!/^\d{5}$/.test(a.cp) || !a.colonia || !a.municipio || !a.estado) { toast('Escribe código postal, colonia, municipio y estado'); return; }
      cot.disabled = true; cot.textContent = 'Calculando… (hasta 20 s)';
      try {
        const r = await api('cotizar', { direccion: a, items: cart.map(it => ({ id: it.id, cant: it.cant })) });
        pago.cot = { id: r.cotizacion, tarifas: r.tarifas }; pago.tarifa = r.tarifas.length ? r.tarifas[0].id : '';
        renderPago();
      } catch (e) { cot.disabled = false; cot.textContent = '🚚 Calcular envío'; toast(e.message); }
    };
    f.onsubmit = async e => {
      e.preventDefault(); leer();
      if (!pago.cliente.nombre || pago.cliente.telefono.replace(/\D/g, '').length < 10) { toast('Escribe tu nombre y tu WhatsApp (10 dígitos)'); return; }
      const b = $('#pgPagar'); b.disabled = true; b.textContent = 'Preparando pago…';
      try {
        const r = await api('pagar', {
          cliente: pago.cliente, entrega: pago.entrega, items: cart.map(it => ({ id: it.id, cant: it.cant, notas: it.notas || '' })),
          direccion: pago.entrega === 'envio' ? Object.assign({ nombre: pago.cliente.nombre, telefono: pago.cliente.telefono, correo: pago.cliente.correo }, pago.direccion) : null,
          envio: pago.entrega === 'envio' ? { cotizacion: pago.cot.id, tarifa: pago.tarifa } : null,
          volver: location.origin + location.pathname,
        });
        try { localStorage.setItem(CART_KEY + '_ultimo', r.pedido); } catch (err) { /* sin almacenamiento */ }
        location.href = r.url;
      } catch (err) { b.disabled = false; b.textContent = 'Pagar con tarjeta'; toast(err.message); }
    };
  }

  /* ---------- Eventos ---------- */
  function bind() {
    $('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; renderCats(); renderGrid(); } };
    $('#q').oninput = e => { q = e.target.value; renderGrid(); };
    $('#grid').onclick = e => {
      const v = e.target.closest('[data-ver]'), a = e.target.closest('[data-add]');
      if (a) addCart(a.dataset.add); else if (v) verProducto(v.dataset.ver);
    };
    $('#cartBtn').onclick = () => { renderCart(); openDlg($('#dlgCart')); };
    $('#dlgCart').onclick = e => {
      const d = $('#dlgCart');
      if (e.target === d || e.target.closest('[data-close]')) { closeDlg(d); if (!cart.length) location.hash = '#catalogo'; return; }
      const rm = e.target.closest('[data-rm]'), cq = e.target.closest('[data-cq]');
      if (!rm && !cq) return;
      const keep = { nombre: $('#ckNombre') ? $('#ckNombre').value : cliente.nombre, fecha: $('#ckFecha') ? $('#ckFecha').value : cliente.fecha, comentarios: $('#ckCom') ? $('#ckCom').value : cliente.comentarios };
      cliente = keep;
      if (rm) cart.splice(Number(rm.dataset.rm), 1);
      if (cq) { const it = cart[Number(cq.dataset.cq)]; it.cant += Number(cq.dataset.d); if (it.cant <= 0) cart.splice(Number(cq.dataset.cq), 1); }
      saveCart(); renderCart();
    };
  }

  async function init() {
    bind();
    try {
      const r = await fetch('catalogo.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      CAT = { negocio: data.negocio || {}, productos: (Array.isArray(data.productos) ? data.productos : []).filter(p => p && p.id && p.nombre).map(p => Object.assign({}, p, { precio: Number(p.precio) || 0 })) };
    } catch (e) {
      console.warn('No se pudo leer catalogo.json', e);
      $('#grid').innerHTML = '<p class="muted center">No pudimos cargar el catálogo en este momento. Intenta recargar la página o escríbenos por WhatsApp.</p>';
    }
    renderNegocio();
    renderCats();
    if (CAT.productos.length) renderGrid();
    loadCart();
    saveCart();
    await revisarPagos();
    avisoPago();
  }
  // Regreso desde Clip después de pagar con tarjeta
  async function avisoPago() {
    const qs = new URLSearchParams(location.search), r = qs.get('pago'), pid = qs.get('pedido');
    if (!r) return;
    history.replaceState(null, '', location.pathname + location.hash);
    let ok = r === 'ok', msg;
    if (pid && conector()) {
      // Se confirma con el conector (que pregunta a Clip), no solo con la dirección de regreso
      try {
        const p = await api('pedido/' + encodeURIComponent(pid));
        ok = !['esperando_pago', 'cancelado'].includes(p.estado);
        msg = ok ? `✅ ¡Gracias! Recibimos tu pago de ${money(p.total)}. Tu pedido es el ${p.id}. ${p.entrega === 'envio' ? 'Te mandaremos tu número de guía por WhatsApp.' : 'Te avisaremos por WhatsApp cuando esté listo para recoger.'}`
                 : p.estado === 'cancelado' ? '⚠️ El pago se canceló o venció. Puedes intentarlo de nuevo desde tu carrito.'
                 : '⏳ Estamos confirmando tu pago con Clip. Si ya pagaste, en unos minutos te escribimos por WhatsApp.';
        if (ok) { cart = []; saveCart(); }
      } catch (e) { msg = null; }
    }
    if (!msg) msg = ok ? '✅ ¡Gracias! Tu pago se recibió. Te escribiremos por WhatsApp para confirmar tu pedido.'
                       : '⚠️ El pago no se completó. Puedes intentarlo de nuevo o escribirnos por WhatsApp.';
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:1000;max-width:min(92vw,480px);padding:14px 18px;border-radius:14px;'
      + 'box-shadow:0 10px 30px rgb(0 0 0/.25);font:600 15px Montserrat,system-ui,sans-serif;color:#fff;background:' + (ok ? '#1a8a4a' : msg.startsWith('⏳') ? '#b36b00' : '#c62828');
    box.textContent = msg;
    box.onclick = () => box.remove();
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 15000);
  }
  init();
})();
