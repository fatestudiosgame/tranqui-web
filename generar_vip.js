// generar_vip.js
// Genera páginas HTML estáticas por cada negocio que ALGUNA VEZ fue VIP.
// - VIP vigente: página completa + carrito funcional
// - VIP expirado: página permanece con banner "VIP expirado" (sin carrito activo)
// - Negocio liberado/borrado: página se elimina
// - /p/index.html: directorio estático rastreable (hub de enlaces internos)
// - sitemap.xml en la raíz del repo
// - JSON-LD (schema.org LocalBusiness) en cada página
// - Carrito client-side con localStorage + envío por WhatsApp/SMS
const fs = require('fs');
const path = require('path');

const API_URL = 'https://tranqui-server.onrender.com/api/negocios';
const BASE_URL = 'https://fatestudiosgame.github.io/tranqui-web';
const P_DIR = path.join(process.cwd(), 'p');

// =========================================================
// HELPERS
// =========================================================

function esc(t) {
  return String(t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function limpiarNumero(tel) { return String(tel || '').replace(/[^\d]/g, ''); }

function telefonoE164(tel) {
  const d = limpiarNumero(tel);
  if (!d) return null;
  if (d.length === 8) return '+53 ' + d;
  if (d.length === 10 && d.startsWith('53')) return '+' + d;
  return '+53 ' + d;
}

function msDeTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts._seconds) return ts._seconds * 1000;
  if (ts.seconds) return ts.seconds * 1000;
  return null;
}

function colorVip(tipoVip) {
  const t = (tipoVip || '').toLowerCase();
  if (t.includes('oro'))    return { bg: '#FFD700', fg: '#1a1a1a', border: '#b8860b', label: 'VIP ORO' };
  if (t.includes('plata'))  return { bg: '#C0C0C0', fg: '#1a1a1a', border: '#707070', label: 'VIP PLATA' };
  if (t.includes('bronce')) return { bg: '#CD7F32', fg: '#fff',    border: '#8b4513', label: 'VIP BRONCE' };
  if (t.includes('prueba')) return { bg: '#9C27B0', fg: '#fff',    border: '#6A1B9A', label: 'VIP PRUEBA' };
  return { bg: '#FF9800', fg: '#fff', border: '#E65100', label: 'VIP' };
}

function optimizarCloudinary(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  if (url.includes('?')) return url;
  return url + '?w=800&q=75&f=auto';
}

function formatearPrecio(precio, moneda) {
  const p = Number(precio) || 0;
  if (p === 0) return 'Consultar';
  return p.toLocaleString('es-CU') + ' ' + (moneda || 'CUP');
}

async function obtenerCatalogo(id) {
  try {
    const res = await fetch(API_URL + '/' + id + '/catalogo/agrupado');
    const json = await res.json();
    if (json.success && json.data) return json.data;
  } catch (e) { console.log('  ⚠️  Sin catálogo para ' + id); }
  return {};
}

// =========================================================
// JSON-LD (schema.org LocalBusiness)
// =========================================================

function jsonLdNegocio(n, url, img, catalogo) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url + '#negocio',
    'name': n.nombre || '',
    'description': String(n.descripcionVip || n.descripcion || '').slice(0, 500),
    'url': url,
    'image': img,
    'currenciesAccepted': 'CUP',
    'paymentAccepted': 'Transferencia bancaria, Transfermóvil',
  };

  const tel = telefonoE164(n.telefono || n.whatsapp);
  if (tel) obj.telephone = tel;

  if (n.municipio || n.provincia) {
    obj.address = {
      '@type': 'PostalAddress',
      'addressLocality': n.municipio || '',
      'addressRegion': n.provincia || '',
      'addressCountry': 'CU',
    };
  }

  if (typeof n.latitud === 'number' && typeof n.longitud === 'number') {
    obj.geo = {
      '@type': 'GeoCoordinates',
      'latitude': n.latitud,
      'longitude': n.longitud,
    };
  }

  const offers = [];
  Object.values(catalogo || {}).forEach(arr => {
    (arr || []).forEach(p => {
      if (p.agotado === true) return;
      const price = Number(p.precio) || 0;
      if (price > 0 && p.nombre) {
        offers.push({
          '@type': 'Offer',
          'name': p.nombre,
          'price': String(price),
          'priceCurrency': p.moneda || 'CUP',
          'availability': 'https://schema.org/InStock',
        });
      }
    });
  });
  if (offers.length) obj.makesOffer = offers.slice(0, 20);

  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function jsonLdDirectorio(registros) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Negocios VIP en Tranqui',
    'description': 'Directorio de negocios en Cuba que aceptan transferencia.',
    'itemListElement': registros.map((r, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'url': BASE_URL + '/p/' + r.n.id + '/',
      'name': r.n.nombre || '',
    })),
  };
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// =========================================================
// BLOQUES DE CONTENIDO
// =========================================================

// ⭐ NUEVO: botón "+ Agregar" en cada producto (solo si NO está agotado)
function renderCatalogo(catalogo, carritoActivo) {
  const cats = Object.keys(catalogo);
  if (cats.length === 0) return '';
  let html = '<section><h2>📋 Catálogo</h2>';
  for (const cat of cats) {
    const productos = catalogo[cat];
    if (!productos || productos.length === 0) continue;
    html += `<h3>${esc(cat)}</h3><div class="productos">`;
    for (const p of productos) {
      const agotado = p.agotado === true;
      const precioNum = Number(p.precio) || 0;
      const moneda = p.moneda || 'CUP';
      const img = p.imagenUrl
        ? `<img src="${esc(optimizarCloudinary(p.imagenUrl))}" alt="${esc(p.nombre)}" loading="lazy">`
        : `<div class="no-img">📦</div>`;

      // Botón agregar solo si hay carrito activo (VIP vigente) y precio > 0
      const puedeAgregar = carritoActivo && !agotado && precioNum > 0;
      const btnAgregar = puedeAgregar
        ? `<button class="btn-add"
             data-pid="${esc(p.id)}"
             data-pnombre="${esc(p.nombre)}"
             data-pprecio="${precioNum}"
             data-pmoneda="${esc(moneda)}"
             aria-label="Agregar ${esc(p.nombre)} al carrito">+ Agregar</button>`
        : '';

      html += `
        <div class="producto ${agotado ? 'agotado' : ''}">
          <div class="prod-img">${img}</div>
          <div class="prod-info">
            <div class="prod-nombre">${esc(p.nombre)}</div>
            ${p.descripcion ? `<div class="prod-desc">${esc(p.descripcion)}</div>` : ''}
            <div class="prod-bottom">
              <span class="prod-precio">${esc(formatearPrecio(precioNum, moneda))}</span>
              ${btnAgregar}
            </div>
            ${agotado ? '<span class="badge-agotado">Agotado</span>' : ''}
          </div>
        </div>`;
    }
    html += '</div>';
  }
  html += '</section>';
  return html;
}

function renderGaleria(fotos) {
  if (!fotos || fotos.length === 0) return '';
  const imgs = fotos.slice(0, 10).map((f, i) =>
    `<img src="${esc(optimizarCloudinary(f))}" alt="Foto ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}">`
  ).join('');
  return `<section><h2>📸 Fotos</h2><div class="galeria-scroll">${imgs}</div></section>`;
}

function bannerExpirado() {
  return `
<div class="expirado-banner">
  <span class="expirado-icon">⚠️</span>
  <div>
    <strong>Este negocio ya no es VIP activo</strong>
    <div class="expirado-sub">Su información permanece disponible como referencia.</div>
  </div>
</div>`;
}

// =========================================================
// ⭐ PÁGINA DE NEGOCIO
// =========================================================

function plantilla(n, catalogo, expirado) {
  const nombre = esc(n.nombre);
  const nombreRaw = n.nombre || 'Negocio';
  const descRaw = n.descripcionVip || n.descripcion || 'Negocio en Tranqui que acepta transferencia en Cuba.';
  const desc = esc(descRaw);
  const descOG = descRaw.replace(/\n/g, ' ').slice(0, 200);
  const url = BASE_URL + '/p/' + n.id + '/';
  const img = n.fotos && n.fotos.length > 0
    ? optimizarCloudinary(n.fotos[0])
    : (BASE_URL + '/og-image.png');
  const vip = colorVip(n.tipoVip);
  const deepLink = 'tranqui://negocio/' + n.id;
  const webFallback = BASE_URL + '/#/p/' + n.id;

  const waLimpio = limpiarNumero(n.whatsapp || n.telefono);
  const telLimpio = limpiarNumero(n.telefono);
  const contactoNumero = waLimpio || telLimpio;
  const contactoEsWhatsapp = !!waLimpio;
  const waMsg = encodeURIComponent('Hola, vi tu negocio en Tranqui y quiero más información');

  const horario = n.horario ? esc(n.horario) : null;
  const categoria = n.categoriaPrincipal
    ? esc(String(n.categoriaPrincipal).replace(/_/g, ' '))
    : null;

  const badgeHtml = expirado
    ? `<span class="badge-vip" style="background:#888;color:#fff;border-color:#555">VIP EXPIRADO</span>`
    : `<span class="badge-vip">${vip.label}</span>`;

  const ldJson = jsonLdNegocio(n, url, img, catalogo);

  // ⭐ Carrito solo activo si VIP vigente Y hay productos Y hay número de contacto
  const hayProductos = Object.values(catalogo).some(arr => arr && arr.length > 0);
  const carritoActivo = !expirado && hayProductos && !!contactoNumero;

  // Posición del FAB: si hay WhatsApp, el carrito va arriba; si no, el carrito va abajo
  const fabCartBottom = contactoNumero ? '92px' : '20px';

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
:root{--primary:#FF5722;--wa:#25D366;--card:#fff;--text:#1a1a1a;--muted:#666;--border:#f0f0f0;--shadow:0 4px 16px rgba(0,0,0,.06)}
html{scroll-behavior:smooth}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(180deg,#fff4ec 0,#fafafa 320px);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;padding-bottom:88px}
.header{background:linear-gradient(135deg,#FF9800,#FF5722);padding:36px 20px 32px;color:#fff;text-align:center;border-radius:0 0 28px 28px;position:relative;overflow:hidden}
.header:before{content:'';position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.12);top:-110px;right:-60px}
.header:after{content:'';position:absolute;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.10);bottom:-80px;left:-40px}
.header-inner{max-width:600px;margin:0 auto;position:relative;z-index:1}
.avatar{width:84px;height:84px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:40px;margin:0 auto 12px;border:4px solid rgba(255,255,255,.6);box-shadow:0 6px 18px rgba(0,0,0,.18);overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.badge-vip{display:inline-block;padding:4px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.6px;background:${vip.bg};color:${vip.fg};border:1px solid ${vip.border};margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.nombre{font-size:26px;font-weight:800;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,.15)}
.cat-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600}
.container{max-width:600px;margin:24px auto 0;padding:0 16px;position:relative;z-index:2}
section{margin:0 0 16px}
h2{font-size:17px;margin-bottom:10px;color:var(--primary);font-weight:800}
h3{font-size:12px;margin:14px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;font-weight:700}
.card{background:var(--card);border-radius:16px;padding:16px;box-shadow:var(--shadow);border:1px solid var(--border)}
.descripcion{white-space:pre-line;font-size:15px;line-height:1.65}
.galeria-scroll{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.galeria-scroll::-webkit-scrollbar{display:none}
.galeria-scroll img{flex:0 0 240px;height:240px;object-fit:cover;border-radius:16px;scroll-snap-align:start;background:#eee;box-shadow:var(--shadow)}
.horario{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600}
.horario-icon{font-size:20px}
.acciones{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 16px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;text-decoration:none;font-weight:700;font-size:15px;border:none;cursor:pointer;transition:transform .1s,box-shadow .2s}
.btn:active{transform:scale(.97)}
.btn-app{background:var(--card);color:var(--primary);border:2px solid var(--primary)}
.btn-share{background:var(--card);color:var(--text);border:1px solid var(--border);box-shadow:var(--shadow)}
.productos{display:flex;flex-direction:column;gap:10px}
.producto{display:flex;gap:12px;background:var(--card);border-radius:14px;padding:10px;border:1px solid var(--border);box-shadow:var(--shadow);position:relative}
.producto.agotado{opacity:.55}
.prod-img{flex:0 0 84px;width:84px;height:84px;border-radius:12px;overflow:hidden;background:#f2f2f2;display:flex;align-items:center;justify-content:center}
.prod-img img{width:100%;height:100%;object-fit:cover}
.no-img{font-size:30px;color:#ccc}
.prod-info{flex:1;min-width:0}
.prod-nombre{font-weight:700;font-size:14px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prod-desc{font-size:12px;color:var(--muted);margin-bottom:6px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.prod-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px}
.prod-precio{font-weight:800;color:#E65100;background:#FFF3E0;font-size:13px;padding:2px 10px;border-radius:999px}
.btn-add{background:var(--primary);color:#fff;border:none;font-weight:700;font-size:12px;padding:6px 12px;border-radius:999px;cursor:pointer;transition:transform .1s}
.btn-add:active{transform:scale(.92)}
.btn-add.added{background:var(--wa);animation:pulseAdd .3s ease}
@keyframes pulseAdd{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
.badge-agotado{position:absolute;top:8px;right:8px;background:#e74c3c;color:#fff;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:800}

/* FAB WhatsApp */
.fab{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:var(--wa);color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 8px 24px rgba(37,211,102,.45);z-index:100;transition:transform .2s}
.fab:active{transform:scale(.92)}

/* FAB Carrito */
.fab-cart{position:fixed;bottom:${fabCartBottom};right:20px;width:60px;height:60px;border-radius:50%;background:var(--primary);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;text-decoration:none;border:none;box-shadow:0 8px 24px rgba(255,87,34,.45);z-index:100;transition:transform .2s;cursor:pointer}
.fab-cart:active{transform:scale(.92)}
.fab-cart.hidden{display:none}
.fab-cart .cart-badge{position:absolute;top:-4px;right:-4px;background:#fff;color:var(--primary);font-size:12px;font-weight:800;min-width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;padding:0 6px;border:2px solid var(--primary);box-shadow:0 2px 6px rgba(0,0,0,.2)}
.fab-cart .cart-badge.pop{animation:popBadge .3s ease}
@keyframes popBadge{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}

/* Cart drawer */
.cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .3s;z-index:150}
.cart-overlay.open{opacity:1;pointer-events:auto}
.cart-drawer{position:fixed;top:0;right:0;bottom:0;width:100%;max-width:400px;background:#fff;z-index:160;transform:translateX(100%);transition:transform .3s ease;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(0,0,0,.15)}
.cart-drawer.open{transform:translateX(0)}
.cart-header{padding:16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);background:linear-gradient(135deg,#FF9800,#FF5722);color:#fff}
.cart-header h3{font-size:18px;font-weight:800;color:#fff;text-transform:none;letter-spacing:0;margin:0}
.cart-close{background:rgba(255,255,255,.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.cart-body{flex:1;overflow-y:auto;padding:16px}
.cart-empty{text-align:center;padding:48px 20px;color:var(--muted)}
.cart-empty-icon{font-size:48px;margin-bottom:12px;opacity:.5}
.cart-item{display:flex;gap:12px;padding:12px;background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.cart-item-info{flex:1;min-width:0}
.cart-item-name{font-weight:700;font-size:14px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cart-item-price{font-size:12px;color:var(--muted);margin-bottom:8px}
.cart-item-controls{display:flex;align-items:center;gap:8px}
.cart-qty-btn{width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:#fff;color:var(--text);font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
.cart-qty-btn:active{background:var(--border)}
.cart-qty{font-weight:700;font-size:14px;min-width:24px;text-align:center}
.cart-item-remove{background:none;border:none;color:#e74c3c;font-size:18px;cursor:pointer;padding:4px;margin-left:auto}
.cart-item-subtotal{font-weight:800;color:#E65100;font-size:14px;margin-top:6px}
.cart-footer{padding:16px;border-top:1px solid var(--border);background:#fafafa}
.cart-notes{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-family:inherit;font-size:13px;resize:none;margin-bottom:12px}
.cart-notes:focus{outline:2px solid var(--primary);outline-offset:-1px}
.cart-total{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:16px}
.cart-total-label{font-weight:600;color:var(--muted)}
.cart-total-amount{font-weight:800;font-size:20px;color:#E65100}
.btn-send{width:100%;padding:14px;border:none;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:transform .1s}
.btn-send:active{transform:scale(.97)}
.btn-send:disabled{opacity:.5;cursor:not-allowed}
.btn-send-wa{background:var(--wa);color:#fff;box-shadow:0 6px 18px rgba(37,211,102,.35)}
.btn-send-sms{background:#2196F3;color:#fff;box-shadow:0 6px 18px rgba(33,150,243,.35)}

.footer{text-align:center;padding:32px 16px;color:var(--muted);font-size:12px}
.footer a{color:var(--primary);text-decoration:none;font-weight:700}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:#333;color:#fff;padding:12px 20px;border-radius:999px;font-size:14px;opacity:0;transition:all .3s;z-index:200;pointer-events:none;max-width:90%;text-align:center}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.expirado-banner{background:#FFF3E0;border:1px solid #FFB74D;border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;margin:0 0 16px;box-shadow:var(--shadow)}
.expirado-icon{font-size:22px;flex-shrink:0}
.expirado-banner strong{display:block;font-size:14px;color:#E65100;margin-bottom:2px}
.expirado-sub{font-size:12px;color:#795548;line-height:1.4}
@media(max-width:400px){.galeria-scroll img{flex:0 0 200px;height:200px}}
</style>
</head>
<body>
<header class="header">
  <div class="header-inner">
    ${n.fotos && n.fotos.length > 0
      ? `<div class="avatar"><img src="${esc(optimizarCloudinary(n.fotos[0]))}" alt="${nombre}"></div>`
      : `<div class="avatar">🏪</div>`}
    <div>${badgeHtml}</div>
    <h1 class="nombre">${nombre}</h1>
    ${categoria ? `<span class="cat-chip">🏷️ ${categoria}</span>` : ''}
  </div>
</header>

<main class="container">

  ${expirado ? bannerExpirado() : ''}

  <section class="card"><div class="descripcion">${desc}</div></section>

  ${horario ? `
  <section class="card">
    <div class="horario"><span class="horario-icon">🕐</span><span>${horario}</span></div>
  </section>` : ''}

  ${renderGaleria(n.fotos)}

  <div class="acciones">
    ${!expirado ? `<a class="btn btn-app" href="${deepLink}" id="btnApp">📱 Abrir en Tranqui</a>` : ''}
    <button class="btn btn-share" id="btnShare">🔗 Compartir</button>
  </div>

  ${renderCatalogo(catalogo, carritoActivo)}

</main>

<footer class="footer">
  <p>Este negocio ${expirado ? 'estuvo' : 'está'} en <a href="${BASE_URL}" target="_blank" rel="noopener">Tranqui</a></p>
  <p><a href="${BASE_URL}/p/">Ver todos los negocios VIP</a></p>
</footer>

${waLimpio ? `<a class="fab" href="https://wa.me/${waLimpio}?text=${waMsg}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}

${carritoActivo ? `
<button class="fab-cart hidden" id="fabCart" aria-label="Ver carrito">
  🛒<span class="cart-badge" id="cartBadge">0</span>
</button>

<div class="cart-overlay" id="cartOverlay"></div>
<aside class="cart-drawer" id="cartDrawer">
  <div class="cart-header">
    <h3>🛒 Tu pedido</h3>
    <button class="cart-close" id="cartClose" aria-label="Cerrar">✕</button>
  </div>
  <div class="cart-body" id="cartBody"></div>
  <div class="cart-footer">
    <textarea class="cart-notes" id="cartNotes" rows="2" placeholder="Notas del pedido (opcional)"></textarea>
    <div class="cart-total">
      <span class="cart-total-label">Total:</span>
      <span class="cart-total-amount" id="cartTotal">0 CUP</span>
    </div>
    <button class="btn-send ${contactoEsWhatsapp ? 'btn-send-wa' : 'btn-send-sms'}" id="btnSend" disabled>
      ${contactoEsWhatsapp ? '💬 Enviar pedido por WhatsApp' : '📱 Enviar pedido por SMS'}
    </button>
  </div>
</aside>
` : ''}

<div class="toast" id="toast">Link copiado</div>

<script>
(function(){
  // === Deep link nativo ===
  if(/Android/i.test(navigator.userAgent)){
    var start = Date.now();
    var f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = '${deepLink}';
    document.body.appendChild(f);
    setTimeout(function(){ if(Date.now() - start < 2000 && !document.hidden){ f.remove(); } }, 1500);
  }

  // === Toast ===
  var toast = document.getElementById('toast');
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function(){ toast.classList.remove('show'); }, 2000);
  }

  // === Compartir ===
  var btnShare = document.getElementById('btnShare');
  if(btnShare){ btnShare.addEventListener('click', function(){
    var data = { title: '${nombreRaw}', text: 'Mira ${nombreRaw} en Tranqui', url: location.href };
    if(navigator.share){ navigator.share(data).catch(function(){}); }
    else if(navigator.clipboard){ navigator.clipboard.writeText(location.href).then(function(){ showToast('📋 Link copiado'); }); }
    else { showToast(location.href); }
  }); }

  // === Abrir en app ===
  var btnApp = document.getElementById('btnApp');
  if(btnApp){ btnApp.addEventListener('click', function(e){ if(!/Android|iPhone|iPad/i.test(navigator.userAgent)){ e.preventDefault(); location.href = '${webFallback}'; } }); }

  ${carritoActivo ? `
  // === CARRO DE COMPRAS ===
  var NEGOCIO_ID = '${n.id}';
  var NEGOCIO_NOMBRE = '${nombreRaw.replace(/'/g, "\\\\'")}';
  var CONTACTO_NUMERO = '${contactoNumero}';
  var CONTACTO_ES_WA = ${contactoEsWhatsapp};
  var STORAGE_KEY = 'tranqui_carrito_' + NEGOCIO_ID;

  // Cargar carrito (cada negocio tiene el suyo propio)
  var carrito = [];
  try { carrito = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ carrito = []; }

  var fabCart = document.getElementById('fabCart');
  var cartBadge = document.getElementById('cartBadge');
  var cartDrawer = document.getElementById('cartDrawer');
  var cartOverlay = document.getElementById('cartOverlay');
  var cartClose = document.getElementById('cartClose');
  var cartBody = document.getElementById('cartBody');
  var cartTotal = document.getElementById('cartTotal');
  var cartNotes = document.getElementById('cartNotes');
  var btnSend = document.getElementById('btnSend');

  function fmtPrecio(n, m){ return n.toLocaleString('es-CU') + ' ' + (m || 'CUP'); }

  function save(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito)); } catch(e){} }

  function totalItems(){ return carrito.reduce(function(s,i){ return s + i.qty; }, 0); }
  function totalPrecio(){ return carrito.reduce(function(s,i){ return s + i.qty * i.precio; }, 0); }

  function actualizarFab(){
    var count = totalItems();
    if(count > 0){
      fabCart.classList.remove('hidden');
      cartBadge.textContent = count;
      cartBadge.classList.remove('pop');
      void cartBadge.offsetWidth;
      cartBadge.classList.add('pop');
    } else {
      fabCart.classList.add('hidden');
    }
    btnSend.disabled = count === 0;
  }

  function renderCart(){
    if(carrito.length === 0){
      cartBody.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">🛒</div><div>Tu carrito está vacío</div><div style="font-size:12px;margin-top:6px">Agrega productos del catálogo</div></div>';
      cartTotal.textContent = '0 CUP';
      actualizarFab();
      return;
    }
    var html = '';
    carrito.forEach(function(item){
      html += '<div class="cart-item" data-pid="' + item.id + '">' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + escapeHtml(item.nombre) + '</div>' +
          '<div class="cart-item-price">' + fmtPrecio(item.precio, item.moneda) + ' c/u</div>' +
          '<div class="cart-item-controls">' +
            '<button class="cart-qty-btn" data-act="dec">−</button>' +
            '<span class="cart-qty">' + item.qty + '</span>' +
            '<button class="cart-qty-btn" data-act="inc">+</button>' +
            '<button class="cart-item-remove" data-act="rm" aria-label="Quitar">🗑️</button>' +
          '</div>' +
          '<div class="cart-item-subtotal">Subtotal: ' + fmtPrecio(item.precio * item.qty, item.moneda) + '</div>' +
        '</div>' +
      '</div>';
    });
    cartBody.innerHTML = html;
    cartTotal.textContent = fmtPrecio(totalPrecio(), carrito[0].moneda);
    actualizarFab();
  }

  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function addToCart(pid, nombre, precio, moneda){
    var existente = carrito.find(function(i){ return i.id === pid; });
    if(existente){ existente.qty++; }
    else { carrito.push({ id:pid, nombre:nombre, precio:precio, moneda:moneda, qty:1 }); }
    save();
    renderCart();
    showToast('✅ ' + nombre + ' agregado');
  }

  function updateQty(pid, delta){
    var item = carrito.find(function(i){ return i.id === pid; });
    if(!item) return;
    item.qty += delta;
    if(item.qty <= 0){ carrito = carrito.filter(function(i){ return i.id !== pid; }); }
    save();
    renderCart();
  }

  function removeFromCart(pid){
    carrito = carrito.filter(function(i){ return i.id !== pid; });
    save();
    renderCart();
  }

  function generarMensaje(){
    if(carrito.length === 0) return '';
    var moneda = carrito[0].moneda;
    var lines = ['Hola, quiero hacer un pedido en ' + NEGOCIO_NOMBRE + ':', ''];
    carrito.forEach(function(item){
      lines.push('• ' + item.qty + 'x ' + item.nombre + ' (' + fmtPrecio(item.precio * item.qty, item.moneda) + ')');
    });
    lines.push('');
    lines.push('💰 *Total: ' + fmtPrecio(totalPrecio(), moneda) + '*');
    var notes = (cartNotes.value || '').trim();
    if(notes){
      lines.push('');
      lines.push('📝 Notas: ' + notes);
    }
    lines.push('');
    lines.push('_Pedido enviado desde Tranqui_');
    return lines.join('\\n');
  }

  function enviarPedido(){
    if(carrito.length === 0) return;
    var msg = generarMensaje();
    var url;
    if(CONTACTO_ES_WA){
      url = 'https://wa.me/' + CONTACTO_NUMERO + '?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
    } else {
      url = 'sms:' + CONTACTO_NUMERO + '?body=' + encodeURIComponent(msg);
      window.location.href = url;
    }
    // Limpiar carrito tras enviar
    carrito = [];
    save();
    renderCart();
    cerrarCart();
    showToast('✅ Pedido enviado. ¡Gracias!');
  }

  function abrirCart(){ cartDrawer.classList.add('open'); cartOverlay.classList.add('open'); document.body.style.overflow='hidden'; }
  function cerrarCart(){ cartDrawer.classList.remove('open'); cartOverlay.classList.remove('open'); document.body.style.overflow=''; }

  // === Event listeners ===
  fabCart.addEventListener('click', abrirCart);
  cartClose.addEventListener('click', cerrarCart);
  cartOverlay.addEventListener('click', cerrarCart);
  btnSend.addEventListener('click', enviarPedido);

  // Delegación en el body del carrito (botones +/- y eliminar)
  cartBody.addEventListener('click', function(e){
    var btn = e.target.closest('button[data-act]');
    if(!btn) return;
    var item = btn.closest('.cart-item');
    if(!item) return;
    var pid = item.getAttribute('data-pid');
    var act = btn.getAttribute('data-act');
    if(act === 'inc') updateQty(pid, 1);
    else if(act === 'dec') updateQty(pid, -1);
    else if(act === 'rm') removeFromCart(pid);
  });

  // Delegación en botones "+ Agregar" del catálogo
  document.addEventListener('click', function(e){
    var btn = e.target.closest('.btn-add');
    if(!btn) return;
    var pid = btn.getAttribute('data-pid');
    var nombre = btn.getAttribute('data-pnombre');
    var precio = Number(btn.getAttribute('data-pprecio')) || 0;
    var moneda = btn.getAttribute('data-pmoneda') || 'CUP';
    addToCart(pid, nombre, precio, moneda);
    btn.textContent = '✓ Agregado';
    btn.classList.add('added');
    setTimeout(function(){ btn.textContent = '+ Agregar'; btn.classList.remove('added'); }, 1200);
  });

  // Render inicial
  renderCart();
  ` : ''}
})();
</script>
</body>
</html>`;
}

// =========================================================
// ⭐ DIRECTORIO ESTÁTICO /p/index.html (hub de enlaces)
// =========================================================

function paginaDirectorio(registros) {
  const vigentes = registros.filter(r => !r.expirado);
  const expirados = registros.filter(r => r.expirado);
  const ldJson = jsonLdDirectorio(registros);

  const card = (r) => {
    const n = r.n;
    const avatar = n.fotos && n.fotos.length > 0
      ? `<img src="${esc(optimizarCloudinary(n.fotos[0]))}" alt="${esc(n.nombre)}" loading="lazy">`
      : '🏪';
    const ubic = [n.municipio, n.provincia].filter(Boolean).join(', ');
    const cat = n.categoriaPrincipal ? String(n.categoriaPrincipal).replace(/_/g, ' ') : '';
    return `
<a class="dir-card" href="${BASE_URL}/p/${n.id}/">
  <div class="dir-avatar">${avatar}</div>
  <div class="dir-info">
    <div class="dir-nombre">${esc(n.nombre)}${r.expirado ? ' <span class="dir-exp">EXPIRADO</span>' : ''}</div>
    ${ubic ? `<div class="dir-ubic">📍 ${esc(ubic)}</div>` : ''}
    ${cat ? `<span class="dir-cat">🏷️ ${esc(cat)}</span>` : ''}
  </div>
  <span class="dir-arrow">›</span>
</a>`;
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
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(180deg,#fff4ec 0,#fafafa 320px);color:#1a1a1a;line-height:1.5;-webkit-font-smoothing:antialiased;padding-bottom:48px}
.header{background:linear-gradient(135deg,#FF9800,#FF5722);padding:36px 20px 32px;color:#fff;text-align:center;border-radius:0 0 28px 28px;position:relative;overflow:hidden}
.header:before{content:'';position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.12);top:-110px;right:-60px}
.header h1{font-size:26px;font-weight:800;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,.15)}
.header p{font-size:14px;opacity:.95}
.container{max-width:600px;margin:24px auto 0;padding:0 16px;position:relative;z-index:2}
h2{font-size:16px;margin:20px 0 10px;color:#FF5722;font-weight:800}
.dir-card{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #f0f0f0;border-radius:16px;padding:12px;margin-bottom:10px;text-decoration:none;color:inherit;box-shadow:0 4px 16px rgba(0,0,0,.06);transition:transform .1s}
.dir-card:active{transform:scale(.98)}
.dir-avatar{flex:0 0 56px;width:56px;height:56px;border-radius:14px;background:#f2f2f2;display:flex;align-items:center;justify-content:center;font-size:26px;overflow:hidden}
.dir-avatar img{width:100%;height:100%;object-fit:cover}
.dir-info{flex:1;min-width:0}
.dir-nombre{font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dir-exp{font-size:9px;background:#888;color:#fff;border-radius:999px;padding:2px 8px;vertical-align:middle;font-weight:800}
.dir-ubic{font-size:12px;color:#666;margin:2px 0}
.dir-cat{display:inline-block;font-size:11px;background:#FFF3E0;color:#E65100;border-radius:999px;padding:2px 10px;font-weight:600}
.dir-arrow{color:#ccc;font-size:22px;font-weight:700}
.footer{text-align:center;padding:32px 16px;color:#666;font-size:12px}
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
  ${vigentes.map(card).join('') || '<p style="color:#666;font-size:14px">Por ahora no hay negocios VIP activos.</p>'}
  ${expirados.length ? `<h2>🕰️ Anteriormente en Tranqui (${expirados.length})</h2>` + expirados.map(card).join('') : ''}
</main>
<footer class="footer">
  <p>Hecho con <a href="${BASE_URL}" target="_blank" rel="noopener">Tranqui</a> — la app donde aceptan transferencia sin ponerte cara rara 😉</p>
</footer>
</body>
</html>`;
}

// =========================================================
// MAIN
// =========================================================

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

    const vipMs = msDeTimestamp(n.vipHasta);
    const expirado = vipMs === null ? true : vipMs < ahora;

    registros.push({ n, expirado });
    fs.writeFileSync(path.join(dir, 'index.html'), plantilla(n, catalogo, expirado), 'utf8');

    const prodCount = Object.values(catalogo).reduce((s, arr) => s + (arr?.length || 0), 0);
    console.log(`✅ /p/${n.id}/  →  ${n.nombre} (${expirado ? 'EXPIRADO' : 'vigente'}, ${prodCount} productos, JSON-LD ok)`);
  }

  fs.writeFileSync(path.join(P_DIR, 'index.html'), paginaDirectorio(registros), 'utf8');
  console.log('✅ /p/index.html  →  Directorio estático (' + registros.length + ' negocios)');

  const urls =
    '  <url><loc>' + BASE_URL + '/</loc><changefreq>daily</changefreq></url>\n' +
    '  <url><loc>' + BASE_URL + '/p/</loc><changefreq>daily</changefreq></url>\n' +
    registros.map(r =>
      '  <url><loc>' + BASE_URL + '/p/' + r.n.id + '/</loc><changefreq>weekly</changefreq></url>'
    ).join('\n');
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls + '\n</urlset>';
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap, 'utf8');
  console.log('✅ sitemap.xml generado con ' + (registros.length + 2) + ' URLs');

  const vig = registros.filter(r => !r.expirado).length;
  console.log(`📊 Vigentes: ${vig} | Expirados: ${registros.length - vig}`);
  console.log('🎉 Generación completada');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });