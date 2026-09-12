// generar_vip.js
// Genera páginas HTML estáticas por cada negocio VIP:
// - Buscador de productos en tiempo real (como en la app)
// - Catálogo colapsable por categorías
// - Carrito + pedido por WhatsApp
// - Botón "Abrir en Tranqui": app instalada -> abre la app; si no -> web app
// - JSON-LD, Open Graph, galería con lightbox, banner de VIP expirado
// Uso:  node generar_vip.js   (requiere Node 18+)
const fs = require('fs');
const path = require('path');

const API_URL = 'https://tranqui-server.onrender.com/api/negocios';
const BASE_URL = 'https://fatestudiosgame.github.io/tranqui-web';
const P_DIR = path.join(process.cwd(), 'p');

// ================= HELPERS =================

function esc(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function limpiarNumero(tel) {
  return String(tel || '').replace(/[^\d]/g, '');
}

function colorVip(tipoVip) {
  const t = (tipoVip || '').toLowerCase();
  if (t.includes('oro')) return { bg: '#FFD700', fg: '#1a1a1a', label: 'VIP ORO' };
  if (t.includes('plata')) return { bg: '#C0C0C0', fg: '#1a1a1a', label: 'VIP PLATA' };
  if (t.includes('bronce')) return { bg: '#CD7F32', fg: '#fff', label: 'VIP BRONCE' };
  if (t.includes('prueba')) return { bg: '#9C27B0', fg: '#fff', label: 'VIP PRUEBA' };
  return { bg: '#FF9800', fg: '#fff', label: 'VIP' };
}

function optimizarCloudinary(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  if (url.includes('?')) return url;
  return url + '?w=800&q=75&f=auto';
}

function formatearPrecio(precio, moneda) {
  const p = Number(precio) || 0;
  if (p === 0) return 'Consultar';
  const m = moneda || 'CUP';
  const s = String(Math.round(p));
  let out = '';
  let n = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out;
    n++;
    if (n % 3 === 0 && i > 0) out = ' ' + out;
  }
  return out + ' ' + m;
}

async function obtenerCatalogo(id) {
  try {
    const res = await fetch(API_URL + '/' + id + '/catalogo/agrupado');
    const json = await res.json();
    if (json.success && json.data) return json.data;
  } catch (e) {
    console.log('  ⚠️  Sin catálogo para ' + id);
  }
  return {};
}

// Mapa de productos embebido en la página (carrito + buscador)
function productMap(catalogo) {
  const map = {};
  for (const cat of Object.keys(catalogo)) {
    for (const p of catalogo[cat] || []) {
      map[String(p.id)] = {
        n: p.nombre || '',
        p: Number(p.precio) || 0,
        m: p.moneda || 'CUP',
        d: p.descripcion || '',
        i: p.imagenUrl ? optimizarCloudinary(p.imagenUrl) : '',
        a: p.agotado === true,
        c: cat,
      };
    }
  }
  return map;
}

// ================= JSON-LD =================

function jsonLdNegocio(n, url, img, catalogo) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url + '#negocio',
    name: n.nombre || '',
    description: String(n.descripcionVip || n.descripcion || '').slice(0, 500),
    url: url,
    image: img,
    currenciesAccepted: 'CUP',
    paymentAccepted: 'Transferencia bancaria, Transfermóvil',
  };
  const tel = limpiarNumero(n.telefono || n.whatsapp);
  if (tel) obj.telephone = '+53 ' + tel;
  if (n.municipio || n.provincia) {
    obj.address = {
      '@type': 'PostalAddress',
      addressLocality: n.municipio || '',
      addressRegion: n.provincia || '',
      addressCountry: 'CU',
    };
  }
  if (typeof n.latitud === 'number' && typeof n.longitud === 'number') {
    obj.geo = { '@type': 'GeoCoordinates', latitude: n.latitud, longitude: n.longitud };
  }
  const offers = [];
  for (const cat of Object.keys(catalogo)) {
    for (const p of catalogo[cat] || []) {
      if (p.agotado === true) continue;
      const price = Number(p.precio) || 0;
      if (price > 0 && p.nombre) {
        offers.push({
          '@type': 'Offer',
          name: p.nombre,
          price: String(price),
          priceCurrency: p.moneda || 'CUP',
          availability: 'https://schema.org/InStock',
        });
      }
    }
  }
  if (offers.length) obj.makesOffer = offers.slice(0, 20);
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// ================= CATÁLOGO COLAPSABLE =================

function renderCatalogo(catalogo) {
  const cats = Object.keys(catalogo);
  if (!cats.length) return '';
  let html = '<section class="catalogo" id="catalogWrap"><h2>📋 Catálogo</h2>';
  for (const cat of cats) {
    const productos = catalogo[cat] || [];
    if (!productos.length) continue;
    html += '<div class="cat">';
    html +=
      '<button type="button" class="cat-header" aria-expanded="true">' +
      '<span class="cat-name">' + esc(cat) + '</span>' +
      '<span class="cat-count">' + productos.length + '</span>' +
      '<span class="cat-arrow">▼</span>' +
      '</button>';
    html += '<div class="cat-body">';
    for (const p of productos) {
      const agotado = p.agotado === true;
      const precio = Number(p.precio) || 0;
      const moneda = p.moneda || 'CUP';
      const id = String(p.id);
      const img = p.imagenUrl
        ? '<img src="' + esc(optimizarCloudinary(p.imagenUrl)) + '" alt="' + esc(p.nombre) + '" loading="lazy">'
        : '<div class="no-img">📦</div>';
      const puede = !agotado && precio > 0;
      html += '<div class="producto' + (agotado ? ' agotado' : '') + '">';
      html += '<div class="prod-img">' + img + '</div>';
      html += '<div class="prod-info">';
      html += '<div class="prod-nombre">' + esc(p.nombre) + '</div>';
      if (p.descripcion) html += '<div class="prod-desc">' + esc(p.descripcion) + '</div>';
      html += '<div class="prod-bottom"><span class="prod-precio">' + formatearPrecio(precio, moneda) + '</span>';
      if (agotado) html += '<span class="badge-agotado">Agotado</span>';
      html += '</div></div>';
      if (puede) {
        html += '<div class="prod-ctrl">';
        html += '<button type="button" class="btn-add" data-add="' + id + '">+ Agregar</button>';
        html +=
          '<div class="stepper" data-stepper="' + id + '" style="display:none">' +
          '<button type="button" class="sbtn" data-dec="' + id + '">−</button>' +
          '<span class="sqty" data-q="' + id + '">0</span>' +
          '<button type="button" class="sbtn" data-add="' + id + '">+</button>' +
          '</div>';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</section>';
  return html;
}

// ================= GALERÍA =================

function renderGaleria(fotos) {
  if (!fotos || !fotos.length) return '';
  const imgs = fotos
    .slice(0, 10)
    .map(
      (f, i) =>
        '<img src="' + esc(optimizarCloudinary(f)) + '" alt="Foto ' + (i + 1) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '">'
    )
    .join('');
  return '<section class="galeria"><h2>📸 Fotos</h2><div class="galeria-scroll">' + imgs + '</div></section>';
}

// ================= PLANTILLA DE PÁGINA =================

function plantilla(n, catalogo, expirado) {
  const nombre = esc(n.nombre);
  const descRaw = n.descripcionVip || n.descripcion || 'Negocio en Tranqui que acepta transferencia en Cuba.';
  const desc = esc(descRaw);
  const descOG = descRaw.replace(/\n/g, ' ').slice(0, 200);
  const url = BASE_URL + '/p/' + n.id + '/';
  const img = n.fotos && n.fotos.length ? optimizarCloudinary(n.fotos[0]) : BASE_URL + '/og-image.png';
  const vip = colorVip(n.tipoVip);
  const categoria = n.categoriaPrincipal ? esc(String(n.categoriaPrincipal).replace(/_/g, ' ')) : '';
  const horario = n.horario ? esc(n.horario) : '';
  const waLimpio = limpiarNumero(n.whatsapp || n.telefono);
  const ldJson = jsonLdNegocio(n, url, img, catalogo);
  const pmap = productMap(catalogo);
  const hayCatalogo = Object.keys(catalogo).length > 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${nombre} | Tranqui</title>
<meta name="description" content="${esc(descOG)}">
<meta name="theme-color" content="#FF5722">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tranqui">
<meta property="og:title" content="${nombre}">
<meta property="og:description" content="${esc(descOG)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${nombre}">
<meta name="twitter:description" content="${esc(descOG)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">${ldJson}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(180deg,#fff4ec 0,#fafafa 320px);color:#1a1a1a;line-height:1.5;-webkit-font-smoothing:antialiased;padding-bottom:96px}
.header{background:linear-gradient(135deg,#FF9800,#FF5722);padding:36px 20px 44px;color:#fff;text-align:center;border-radius:0 0 28px 28px;position:relative;overflow:hidden}
.header:before{content:'';position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.12);top:-110px;right:-60px}
.header:after{content:'';position:absolute;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.10);bottom:-80px;left:-40px}
.header-inner{max-width:640px;margin:0 auto;position:relative;z-index:1}
.avatar{width:88px;height:88px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:42px;margin:0 auto 12px;border:4px solid rgba(255,255,255,.6);box-shadow:0 6px 18px rgba(0,0,0,.18);overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.badge-vip{display:inline-block;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.6px;background:${vip.bg};color:${vip.fg};border:1px solid rgba(0,0,0,.15);margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.nombre{font-size:26px;font-weight:800;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,.15)}
.cat-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600}
.container{max-width:640px;margin:-28px auto 0;padding:0 14px;position:relative;z-index:2}
.card{background:#fff;border-radius:16px;padding:16px;box-shadow:0 4px 16px rgba(0,0,0,.06);border:1px solid #f0f0f0;margin-bottom:14px}
.descripcion{white-space:pre-line;font-size:15px;line-height:1.65}
.horario{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600}
.expirado-banner{background:#FFF3E0;border:1px solid #FFB74D;border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.expirado-banner strong{display:block;font-size:14px;color:#E65100;margin-bottom:2px}
.expirado-sub{font-size:12px;color:#795548;line-height:1.4}
.acciones{display:flex;gap:10px;margin-bottom:16px}
.btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:14px;text-decoration:none;font-weight:700;font-size:14px;border:none;cursor:pointer}
.btn-app{background:#fff;color:#FF5722;border:2px solid #FF5722;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.btn-share{background:#fff;color:#1a1a1a;border:1px solid #e0e0e0;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.galeria h2,.catalogo h2{font-size:17px;margin:6px 0 10px;color:#FF5722;font-weight:800}
.galeria{margin-bottom:16px}
.galeria-scroll{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.galeria-scroll::-webkit-scrollbar{display:none}
.galeria-scroll img{flex:0 0 240px;height:240px;object-fit:cover;border-radius:16px;scroll-snap-align:start;background:#eee;box-shadow:0 4px 16px rgba(0,0,0,.08);cursor:pointer}
/* ---- buscador ---- */
.searchbar{position:sticky;top:8px;z-index:40;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #eee;border-radius:999px;padding:11px 16px;box-shadow:0 4px 16px rgba(0,0,0,.10);margin-bottom:12px}
.searchbar input{flex:1;border:none;outline:none;font-size:14px;font-family:inherit;background:transparent;color:#1a1a1a}
.searchbar input::placeholder{color:#aaa}
.sicon{font-size:16px}
.sclear{background:#eee;border:none;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:#666;flex-shrink:0}
.searchcount{font-size:12px;color:#666;font-weight:600;margin:0 4px 10px}
.noresults{text-align:center;color:#888;padding:36px 16px;background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);font-size:15px;font-weight:600}
.noresults span{display:block;font-size:12px;color:#aaa;font-weight:400;margin-top:6px}
.rcat{display:inline-block;font-size:10px;background:#FFF3E0;color:#E65100;border-radius:999px;padding:2px 8px;font-weight:700;margin-bottom:4px}
/* ---- categorías colapsables ---- */
.cat{background:#fff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.06);margin-bottom:14px;overflow:hidden;border:1px solid #f0f0f0}
.cat-header{width:100%;display:flex;align-items:center;gap:8px;padding:14px 16px;background:linear-gradient(135deg,#FF9800,#FF5722);border:none;cursor:pointer;text-align:left}
.cat-name{flex:1;color:#fff;font-weight:800;font-size:15px;letter-spacing:.5px;text-transform:uppercase}
.cat-count{background:rgba(255,255,255,.22);color:#fff;font-size:12px;font-weight:700;padding:2px 10px;border-radius:12px}
.cat-arrow{color:#fff;transition:transform .2s ease;font-size:13px}
.cat.closed .cat-arrow{transform:rotate(-90deg)}
.cat-body{padding:12px}
.cat.closed .cat-body{display:none}
/* ---- productos ---- */
.producto{display:flex;gap:12px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:10px;background:#fafafa}
.producto:last-child{margin-bottom:0}
.producto.agotado{opacity:.55}
.prod-img{flex:0 0 76px;width:76px;height:76px;border-radius:10px;overflow:hidden;background:#eee;display:flex;align-items:center;justify-content:center}
.prod-img img{width:100%;height:100%;object-fit:cover}
.no-img{font-size:28px;color:#ccc}
.prod-info{flex:1;min-width:0}
.prod-nombre{font-weight:700;font-size:14px}
.prod-desc{font-size:12px;color:#666;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.prod-bottom{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap}
.prod-precio{font-weight:800;color:#E65100;background:#FFF3E0;font-size:13px;padding:2px 10px;border-radius:999px}
.badge-agotado{background:#E74C3C;color:#fff;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px}
.prod-ctrl{display:flex;align-items:center}
.btn-add{background:#FF5722;color:#fff;border:none;font-weight:700;font-size:12px;padding:8px 12px;border-radius:999px;cursor:pointer}
.stepper{display:flex;align-items:center;gap:6px;background:rgba(255,87,34,.12);border-radius:999px;padding:2px 6px}
.sbtn{background:none;border:none;color:#FF5722;font-size:18px;font-weight:800;cursor:pointer;padding:4px 6px}
.sqty{font-weight:800;color:#FF5722;min-width:16px;text-align:center}
/* ---- FABs ---- */
.fab{position:fixed;right:16px;width:58px;height:58px;border-radius:50%;border:none;color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:60}
.fab-wa{bottom:16px;background:#25D366}
.fab-cart{bottom:84px;background:#FF5722;display:none}
.fab-cart .fbadge{position:absolute;top:-4px;right:-4px;background:#fff;color:#FF5722;font-size:11px;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid #FF5722}
/* ---- drawer carrito ---- */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .25s;z-index:70}
.overlay.open{opacity:1;pointer-events:auto}
.drawer{position:fixed;right:0;left:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;max-height:78vh;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .25s ease;z-index:80}
.drawer.open{transform:translateY(0)}
.dhead{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #eee}
.dhead h3{flex:1;font-size:17px;font-weight:800}
.dclose{background:none;border:none;font-size:22px;cursor:pointer;color:#666}
.ditems{flex:1;overflow-y:auto;padding:12px 16px}
.citem{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #eee;border-radius:10px;margin-bottom:10px;background:#fafafa}
.cinfo{flex:1;min-width:0}
.cname{font-weight:700;font-size:13px}
.cprice{font-size:11px;color:#666;margin-top:2px}
.csub{font-weight:800;color:#E65100;font-size:13px;min-width:70px;text-align:right}
.cempty{text-align:center;color:#888;padding:32px 0}
.dfoot{padding:12px 16px 18px;border-top:1px solid #eee;background:#fff}
.dfoot textarea{width:100%;border:1px solid #e0e0e0;border-radius:12px;padding:10px 12px;font-family:inherit;font-size:13px;resize:none;margin-bottom:10px;background:#f7f7f7}
.dtotal{display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-bottom:10px}
.dtotal span:last-child{color:#E65100;font-weight:800;font-size:18px}
.dsend{width:100%;background:#25D366;color:#fff;border:none;font-weight:800;font-size:15px;padding:14px;border-radius:12px;cursor:pointer}
.dsend:disabled{opacity:.5}
/* ---- lightbox ---- */
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:90;padding:16px}
.lightbox.open{display:flex}
.lightbox img{max-width:100%;max-height:90vh;object-fit:contain;border-radius:8px}
.footer{text-align:center;padding:28px 16px;color:#888;font-size:12px}
.footer a{color:#FF5722;text-decoration:none;font-weight:700}
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    ${n.fotos && n.fotos.length
      ? '<div class="avatar"><img src="' + esc(optimizarCloudinary(n.fotos[0])) + '" alt="' + nombre + '"></div>'
      : '<div class="avatar">🏪</div>'}
    <div><span class="badge-vip">${vip.label}</span></div>
    <h1 class="nombre">${nombre}</h1>
    ${categoria ? '<span class="cat-chip">🏷️ ' + categoria + '</span>' : ''}
  </div>
</header>

<main class="container">
  ${expirado
    ? '<div class="expirado-banner"><span style="font-size:22px">⚠️</span><div><strong>Este negocio ya no es VIP activo</strong><div class="expirado-sub">Su información permanece disponible como referencia.</div></div></div>'
    : ''}

  <div class="card"><div class="descripcion">${desc}</div></div>

  ${horario ? '<div class="card"><div class="horario"><span style="font-size:20px">🕐</span><span>' + horario + '</span></div></div>' : ''}

  <div class="acciones">
    <button type="button" class="btn btn-app" id="btnApp">📱 Abrir en Tranqui</button>
    <button type="button" class="btn btn-share" id="btnShare">🔗 Compartir</button>
  </div>

  ${renderGaleria(n.fotos)}

  ${hayCatalogo
    ? '<div class="searchbar">' +
      '<span class="sicon">🔍</span>' +
      '<input id="searchInput" type="search" placeholder="Buscar producto... (ej: leche, café)" autocomplete="off" aria-label="Buscar producto">' +
      '<button type="button" class="sclear" id="searchClear" style="display:none" aria-label="Limpiar búsqueda">✕</button>' +
      '</div>' +
      '<div class="searchcount" id="searchCount" style="display:none"></div>' +
      '<div id="searchResults" style="display:none"></div>' +
      renderCatalogo(catalogo)
    : ''}
</main>

<footer class="footer">
  <p>Este negocio ${expirado ? 'estuvo' : 'está'} en <a href="${BASE_URL}/">Tranqui</a></p>
  <p>La app donde aceptan transferencia sin ponerte cara rara 😉</p>
</footer>

${waLimpio ? '<button type="button" class="fab fab-wa" id="fabWa" aria-label="WhatsApp">💬</button>' : ''}
<button type="button" class="fab fab-cart" id="fabCart" aria-label="Carrito">🛒<span class="fbadge" id="cartCount">0</span></button>

<div class="overlay" id="cartOverlay"></div>
<div class="drawer" id="cartDrawer">
  <div class="dhead"><span style="font-size:20px">🛒</span><h3>Tu pedido</h3><button type="button" class="dclose" id="cartClose">✕</button></div>
  <div class="ditems" id="cartItems"></div>
  <div class="dfoot">
    <textarea id="cartNotes" rows="2" placeholder="Notas del pedido (opcional)"></textarea>
    <div class="dtotal"><span>Total:</span><span id="cartTotalBig">0 CUP</span></div>
    <button type="button" class="dsend" id="btnSend" disabled>Enviar pedido por WhatsApp</button>
  </div>
</div>

<div class="lightbox" id="lightbox"><img id="lightboxImg" src="" alt="Foto ampliada"></div>

<script>
(function(){
  var ID = '${n.id}';
  var BASE = '${BASE_URL}';
  var WA = '${waLimpio}';
  var PRODUCTOS = ${JSON.stringify(pmap)};
  var carrito = {};

  function escJs(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function qty(id){ return carrito[id] || 0; }
  function count(){ var c = 0; for (var k in carrito) c += carrito[k]; return c; }
  function total(){ var t = 0; for (var k in carrito){ var p = PRODUCTOS[k]; if (p) t += p.p * carrito[k]; } return t; }
  function fmtNum(v){
    var s = String(Math.round(v)); var out = ''; var n = 0;
    for (var i = s.length - 1; i >= 0; i--){ out = s[i] + out; n++; if (n % 3 === 0 && i > 0) out = ' ' + out; }
    return out;
  }
  function fmt(v){ return fmtNum(v) + ' CUP'; }
  function priceLabel(p, m){ return p > 0 ? fmtNum(p) + ' ' + (m || 'CUP') : 'Consultar'; }

  /* ========== ABRIR EN TRANQUI ========== */
  var WEB_APP = BASE + '/#/p/' + ID;
  var APP_LINK = 'tranqui://negocio/' + ID;
  var INTENT = 'intent://negocio/' + ID +
    '#Intent;scheme=tranqui;package=com.fatestudiosgame.tranqui;' +
    'S.browser_fallback_url=' + encodeURIComponent(WEB_APP) + ';end';
  var btnApp = document.getElementById('btnApp');
  if (btnApp) btnApp.addEventListener('click', function(){
    var ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      location.href = INTENT;
      setTimeout(function(){ if (!document.hidden) location.href = WEB_APP; }, 2000);
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      var t = setTimeout(function(){ if (!document.hidden) location.href = WEB_APP; }, 1500);
      location.href = APP_LINK;
      document.addEventListener('visibilitychange', function(){
        if (document.hidden) clearTimeout(t);
      });
    } else {
      location.href = WEB_APP;
    }
  });

  /* ========== COMPARTIR ========== */
  var btnShare = document.getElementById('btnShare');
  if (btnShare) btnShare.addEventListener('click', function(){
    var data = { title: document.title, text: 'Mira este negocio en Tranqui', url: location.href };
    if (navigator.share) { navigator.share(data).catch(function(){}); }
    else if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href);
      alert('📋 Link copiado');
    }
  });

  /* ========== WHATSAPP DIRECTO ========== */
  var fabWa = document.getElementById('fabWa');
  if (fabWa) fabWa.addEventListener('click', function(){
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola, vi tu negocio en Tranqui y quiero más información'), '_blank');
  });

  /* ========== CATEGORÍAS COLAPSABLES ========== */
  document.querySelectorAll('.cat-header').forEach(function(h){
    h.addEventListener('click', function(){
      var cat = h.closest('.cat');
      cat.classList.toggle('closed');
      h.setAttribute('aria-expanded', cat.classList.contains('closed') ? 'false' : 'true');
    });
  });

  /* ========== LIGHTBOX DE FOTOS ========== */
  document.querySelectorAll('.galeria-scroll img').forEach(function(im){
    im.addEventListener('click', function(){
      document.getElementById('lightboxImg').src = im.src;
      document.getElementById('lightbox').classList.add('open');
    });
  });
  document.getElementById('lightbox').addEventListener('click', function(){
    this.classList.remove('open');
  });

  /* ========== FILA DE PRODUCTO (para resultados de búsqueda) ========== */
  function productRow(id, p){
    var html = '<div class="producto' + (p.a ? ' agotado' : '') + '">';
    html += '<div class="prod-img">' + (p.i ? '<img src="' + p.i + '" alt="' + escJs(p.n) + '" loading="lazy">' : '<div class="no-img">📦</div>') + '</div>';
    html += '<div class="prod-info">';
    if (p.c) html += '<span class="rcat">' + escJs(p.c) + '</span>';
    html += '<div class="prod-nombre">' + escJs(p.n) + '</div>';
    if (p.d) html += '<div class="prod-desc">' + escJs(p.d) + '</div>';
    html += '<div class="prod-bottom"><span class="prod-precio">' + priceLabel(p.p, p.m) + '</span>';
    if (p.a) html += '<span class="badge-agotado">Agotado</span>';
    html += '</div></div>';
    if (!p.a && p.p > 0) {
      html += '<div class="prod-ctrl">' +
        '<button type="button" class="btn-add" data-add="' + id + '">+ Agregar</button>' +
        '<div class="stepper" data-stepper="' + id + '" style="display:none">' +
        '<button type="button" class="sbtn" data-dec="' + id + '">−</button>' +
        '<span class="sqty" data-q="' + id + '">0</span>' +
        '<button type="button" class="sbtn" data-add="' + id + '">+</button>' +
        '</div></div>';
    }
    html += '</div>';
    return html;
  }

  /* ========== BUSCADOR ========== */
  var searchInput = document.getElementById('searchInput');
  var searchClear = document.getElementById('searchClear');
  var searchCount = document.getElementById('searchCount');
  var searchResults = document.getElementById('searchResults');
  var catalogWrap = document.getElementById('catalogWrap');

  function hacerBusqueda(){
    if (!searchInput) return;
    var q = searchInput.value.toLowerCase().trim();
    searchClear.style.display = q ? 'flex' : 'none';
    if (!q) {
      searchResults.style.display = 'none';
      searchCount.style.display = 'none';
      if (catalogWrap) catalogWrap.style.display = 'block';
      render();
      return;
    }
    var matches = [];
    for (var id in PRODUCTOS) {
      var p = PRODUCTOS[id];
      if ((p.n && p.n.toLowerCase().indexOf(q) !== -1) ||
          (p.d && p.d.toLowerCase().indexOf(q) !== -1) ||
          (p.c && p.c.toLowerCase().indexOf(q) !== -1)) {
        matches.push(id);
      }
    }
    if (catalogWrap) catalogWrap.style.display = 'none';
    searchResults.style.display = 'block';
    searchCount.style.display = 'block';
    searchCount.textContent = matches.length + (matches.length === 1 ? ' resultado' : ' resultados') + ' para "' + searchInput.value.trim() + '"';
    if (!matches.length) {
      searchResults.innerHTML = '<div class="noresults">😕 No encontramos "' + escJs(searchInput.value.trim()) + '"<span>Prueba con otra palabra o revisa la ortografía</span></div>';
    } else {
      var html = '';
      matches.forEach(function(id){ html += productRow(id, PRODUCTOS[id]); });
      searchResults.innerHTML = html;
    }
    render();
  }
  if (searchInput) searchInput.addEventListener('input', hacerBusqueda);
  if (searchClear) searchClear.addEventListener('click', function(){
    searchInput.value = '';
    hacerBusqueda();
    searchInput.focus();
  });

  /* ========== CARRITO ========== */
  function render(){
    // sincroniza botones + steppers del catálogo Y de los resultados
    document.querySelectorAll('.btn-add').forEach(function(b){
      var id = b.getAttribute('data-add');
      var ctrl = b.parentElement;
      var st = ctrl ? ctrl.querySelector('[data-stepper="' + id + '"]') : null;
      if (st){
        if (qty(id) > 0){ st.style.display = 'flex'; b.style.display = 'none'; }
        else { st.style.display = 'none'; b.style.display = 'inline-block'; }
      }
    });
    document.querySelectorAll('.sqty[data-q]').forEach(function(s){
      s.textContent = qty(s.getAttribute('data-q'));
    });
    var c = count();
    var fabCart = document.getElementById('fabCart');
    if (fabCart) fabCart.style.display = c > 0 ? 'flex' : 'none';
    document.getElementById('cartCount').textContent = c;
    document.getElementById('cartTotalBig').textContent = fmt(total());
    var html = '';
    for (var k in carrito){
      var p = PRODUCTOS[k]; if (!p) continue;
      html += '<div class="citem"><div class="cinfo"><div class="cname">' + escJs(p.n) + '</div>' +
        '<div class="cprice">' + priceLabel(p.p, p.m) + ' c/u</div></div>' +
        '<div class="stepper" style="display:flex"><button type="button" class="sbtn" data-dec="' + k + '">−</button>' +
        '<span class="sqty">' + qty(k) + '</span>' +
        '<button type="button" class="sbtn" data-add="' + k + '">+</button></div>' +
        '<div class="csub">' + fmt(p.p * qty(k)) + '</div></div>';
    }
    document.getElementById('cartItems').innerHTML = html || '<div class="cempty">Tu carrito está vacío</div>';
    document.getElementById('btnSend').disabled = (c === 0);
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-add]');
    if (a){ var id = a.getAttribute('data-add'); carrito[id] = qty(id) + 1; render(); return; }
    var d = e.target.closest('[data-dec]');
    if (d){
      var id2 = d.getAttribute('data-dec');
      var q = qty(id2) - 1;
      if (q <= 0) delete carrito[id2]; else carrito[id2] = q;
      render();
    }
  });
  var drawer = document.getElementById('cartDrawer');
  var overlay = document.getElementById('cartOverlay');
  function openCart(){ drawer.classList.add('open'); overlay.classList.add('open'); }
  function closeCart(){ drawer.classList.remove('open'); overlay.classList.remove('open'); }
  document.getElementById('fabCart').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  overlay.addEventListener('click', closeCart);
  document.getElementById('btnSend').addEventListener('click', function(){
    if (count() === 0) return;
    if (!WA){ alert('Este negocio no tiene WhatsApp configurado'); return; }
    var lines = ['Hola, quiero hacer un pedido:',''];
    for (var k in carrito){
      var p = PRODUCTOS[k]; if (!p) continue;
      lines.push('• ' + qty(k) + 'x ' + p.n + ' — ' + fmt(p.p * qty(k)));
    }
    lines.push(''); lines.push('💰 Total: ' + fmt(total()));
    var notes = document.getElementById('cartNotes').value.trim();
    if (notes){ lines.push(''); lines.push('📝 Notas: ' + notes); }
    lines.push(''); lines.push('_Pedido enviado desde Tranqui_');
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(lines.join('\\n')), '_blank');
    carrito = {}; render(); closeCart();
  });
  render();
})();
</script>
</body>
</html>`;
}

// ================= DIRECTORIO /p/ =================

function paginaDirectorio(registros) {
  const vigentes = registros.filter(r => !r.expirado);
  const expirados = registros.filter(r => r.expirado);
  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Negocios VIP en Tranqui',
    description: 'Directorio de negocios en Cuba que aceptan transferencia.',
    itemListElement: registros.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: BASE_URL + '/p/' + r.n.id + '/',
      name: r.n.nombre || '',
    })),
  }).replace(/</g, '\\u003c');

  const card = (r) => {
    const n = r.n;
    const avatar = n.fotos && n.fotos.length
      ? '<img src="' + esc(optimizarCloudinary(n.fotos[0])) + '" alt="' + esc(n.nombre) + '" loading="lazy">'
      : '🏪';
    const ubic = [n.municipio, n.provincia].filter(Boolean).join(', ');
    const cat = n.categoriaPrincipal ? String(n.categoriaPrincipal).replace(/_/g, ' ') : '';
    return (
      '<a class="dir-card" href="' + BASE_URL + '/p/' + n.id + '/">' +
      '<div class="dir-avatar">' + avatar + '</div>' +
      '<div class="dir-info"><div class="dir-nombre">' + esc(n.nombre) +
      (r.expirado ? ' <span class="dir-exp">EXPIRADO</span>' : '') + '</div>' +
      (ubic ? '<div class="dir-ubic">📍 ' + esc(ubic) + '</div>' : '') +
      (cat ? '<span class="dir-cat">🏷️ ' + esc(cat) + '</span>' : '') +
      '</div><span class="dir-arrow">›</span></a>'
    );
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Negocios VIP en Tranqui | Aceptan transferencia en Cuba</title>
<meta name="description" content="Directorio de negocios VIP en Cuba que aceptan transferencia. Paladares, dulcerías, talleres, tiendas y más.">
<meta name="theme-color" content="#FF5722">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tranqui">
<meta property="og:title" content="Negocios VIP en Tranqui">
<meta property="og:description" content="Directorio de negocios en Cuba que aceptan transferencia.">
<meta property="og:url" content="${BASE_URL}/p/">
<meta property="og:image" content="${BASE_URL}/og-image.png">
<link rel="canonical" href="${BASE_URL}/p/">
<script type="application/ld+json">${ldJson}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(180deg,#fff4ec 0,#fafafa 320px);color:#1a1a1a;line-height:1.5;padding-bottom:40px}
.header{background:linear-gradient(135deg,#FF9800,#FF5722);padding:36px 20px 44px;color:#fff;text-align:center;border-radius:0 0 28px 28px}
.header h1{font-size:26px;font-weight:800;margin-bottom:6px}
.header p{font-size:14px;opacity:.95}
.container{max-width:640px;margin:-24px auto 0;padding:0 14px}
h2{font-size:16px;margin:18px 4px 10px;color:#FF5722;font-weight:800}
.dir-card{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #f0f0f0;border-radius:16px;padding:12px;margin-bottom:10px;text-decoration:none;color:inherit;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.dir-avatar{flex:0 0 56px;width:56px;height:56px;border-radius:14px;background:#f2f2f2;display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden}
.dir-avatar img{width:100%;height:100%;object-fit:cover}
.dir-info{flex:1;min-width:0}
.dir-nombre{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dir-exp{font-size:9px;background:#888;color:#fff;border-radius:999px;padding:2px 8px;vertical-align:middle;font-weight:800}
.dir-ubic{font-size:12px;color:#666;margin:2px 0}
.dir-cat{display:inline-block;font-size:11px;background:#FFF3E0;color:#E65100;border-radius:999px;padding:2px 10px;font-weight:600}
.dir-arrow{color:#ccc;font-size:22px;font-weight:700}
.footer{text-align:center;padding:28px 16px;color:#888;font-size:12px}
.footer a{color:#FF5722;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<header class="header">
  <h1>🏪 Negocios VIP en Tranqui</h1>
  <p>Negocios en Cuba que aceptan transferencia sin complicaciones</p>
</header>
<main class="container">
  <h2>⭐ VIP activos (${vigentes.length})</h2>
  ${vigentes.map(card).join('') || '<p style="color:#888;font-size:14px;margin:0 4px">Por ahora no hay negocios VIP activos.</p>'}
  ${expirados.length ? '<h2>🕰️ Anteriormente en Tranqui (' + expirados.length + ')</h2>' + expirados.map(card).join('') : ''}
</main>
<footer class="footer">
  <p>Hecho con <a href="${BASE_URL}/">Tranqui</a> — la app donde aceptan transferencia sin ponerte cara rara 😉</p>
</footer>
</body>
</html>`;
}

// ================= MAIN =================

async function main() {
  console.log('📡 Obteniendo negocios...');
  const res = await fetch(API_URL);
  const json = await res.json();
  const conPagina = (json.data || []).filter(n => n && n.propietarioUsername);
  const ahora = Date.now();
  console.log('⭐ Negocios con página: ' + conPagina.length);

  if (fs.existsSync(P_DIR)) {
    for (const e of fs.readdirSync(P_DIR, { withFileTypes: true })) {
      if (e.isDirectory()) fs.rmSync(path.join(P_DIR, e.name), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(P_DIR, { recursive: true });
  }

  const registros = [];
  for (const n of conPagina) {
    const catalogo = await obtenerCatalogo(n.id);
    const dir = path.join(P_DIR, n.id);
    fs.mkdirSync(dir, { recursive: true });
    const vipMs = n.vipHasta && n.vipHasta._seconds
      ? n.vipHasta._seconds * 1000
      : (n.vipHasta ? new Date(n.vipHasta).getTime() : null);
    const expirado = vipMs === null ? true : vipMs < ahora;
    registros.push({ n, expirado });
    fs.writeFileSync(path.join(dir, 'index.html'), plantilla(n, catalogo, expirado), 'utf8');
    const prodCount = Object.values(catalogo).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
    console.log('✅ /p/' + n.id + '/  →  ' + n.nombre + ' (' + (expirado ? 'EXPIRADO' : 'vigente') + ', ' + prodCount + ' productos)');
  }

  fs.writeFileSync(path.join(P_DIR, 'index.html'), paginaDirectorio(registros), 'utf8');
  console.log('✅ /p/index.html  →  Directorio estático (' + registros.length + ' negocios)');

  const urls =
    '  <url><loc>' + BASE_URL + '/</loc><changefreq>daily</changefreq></url>\n' +
    '  <url><loc>' + BASE_URL + '/p/</loc><changefreq>daily</changefreq></url>\n' +
    registros.map(r => '  <url><loc>' + BASE_URL + '/p/' + r.n.id + '/</loc><changefreq>weekly</changefreq></url>').join('\n');
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls + '\n</urlset>';
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap, 'utf8');
  console.log('✅ sitemap.xml generado con ' + (registros.length + 2) + ' URLs');

  const vig = registros.filter(r => !r.expirado).length;
  console.log('📊 Vigentes: ' + vig + ' | Expirados: ' + (registros.length - vig));
  console.log('🎉 Generación completada');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });