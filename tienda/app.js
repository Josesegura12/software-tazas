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
        <p class="note">Después nos envías tu foto o diseño por WhatsApp. ¿Quieres verlo antes? <a href="../index.html" target="_blank" rel="noopener">Pruébalo en el editor</a>.</p>
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
          <button class="btn wa block" style="margin-top:14px" ${CAT.negocio.whatsapp ? '' : 'disabled'}>💬 Pedir por WhatsApp</button>
          <p class="note">Se abrirá WhatsApp con tu pedido listo para enviar. El precio final se confirma al revisar tu diseño. Envío no incluido.</p>
        </form>` : `<p class="muted" style="text-align:center;padding:24px 0">Tu carrito está vacío.<br>¡Agrega algo bonito! 💜</p><button class="btn primary block" data-close>Ver catálogo</button>`}
      </div>`;
    const f = $('#ckForm');
    if (f) f.onsubmit = e => { e.preventDefault(); pedir(); };
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
  }
  init();
})();
