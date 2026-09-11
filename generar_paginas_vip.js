// generar_vip.js
// Genera páginas HTML estáticas completas por cada negocio VIP.
// Incluye: fotos, catálogo, WhatsApp, horario, deep link a la app.
// Uso:  node generar_vip.js   (requiere Node 18+)

const fs = require('fs');
const path = require('path');

const API_URL = 'https://tranqui-server.onrender.com/api/negocios';
const BASE_URL = 'https://fatestudiosgame.github.io/tranqui-web';
const P_DIR = path.join(process.cwd(), 'p');

function esc(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function limpiarNumero(tel) {
  return String(tel || '').replace(/[^\d]/g, '');
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
  const m = moneda || 'CUP';
  if (p === 0) return 'Consultar';
  return p.toLocaleString('es-CU') + ' ' + m;
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

function renderCatalogo(catalogo) {
  const categorias = Object.keys(catalogo);
  if (categorias.length === 0) return '';

  let html = '<section class="catalogo"><h2>📋 Catálogo</h2>';
  for (const cat of categorias) {
    const productos = catalogo[cat];
    if (!productos || productos.length === 0) continue;
    html += `<div class="cat-group"><h3>${esc(cat)}</h3><div class="productos">`;
    for (const p of productos) {
      const agotado = p.agotado === true;
      const img = p.imagenUrl
        ? `<img src="${esc(optimizarCloudinary(p.imagenUrl))}" alt="${esc(p.nombre)}" loading="lazy">`
        : `<div class="no-img">📦</div>`;
      const precioStr = formatearPrecio(p.precio, p.moneda);
      html += `
        <div class="producto ${agotado ? 'agotado' : ''}">
          <div class="prod-img">${img}</div>
          <div class="prod-info">
            <div class="prod-nombre">${esc(p.nombre)}</div>
            ${p.descripcion ? `<div class="prod-desc">${esc(p.descripcion)}</div>` : ''}
            <div class="prod-precio">${esc(precioStr)}</div>
            ${agotado ? '<div class="badge-agotado">Agotado</div>' : ''}
          </div>
        </div>`;
    }
    html += '</div></div>';
  }
  html += '</section>';
  return html;
}

function renderGaleria(fotos) {
  if (!fotos || fotos.length === 0) return '';
  const imgs = fotos.slice(0, 10).map((f, i) =>
    `<img src="${esc(optimizarCloudinary(f))}" alt="Foto ${i+1}" loading="${i === 0 ? 'eager' : 'lazy'}">`
  ).join('');
  return `<section class="galeria"><h2>📸 Fotos</h2><div class="galeria-scroll">${imgs}</div></section>`;
}

function plantilla(n, catalogo) {
  const nombre = esc(n.nombre);
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

  const telLimpio = limpiarNumero(n.telefono);
  const waLimpio = limpiarNumero(n.whatsapp || n.telefono);
  const waMsg = encodeURIComponent('Hola, vi tu negocio en Tranqui y quiero más información');

  const horario = n.horario ? esc(n.horario) : null;

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
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --primary:#FF5722;--primary-dark:#E64A19;
  --bg:#fafafa;--card:#fff;--text:#1a1a1a;--muted:#666;--border:#eee;
}
@media(prefers-color-scheme:dark){
  :root{--bg:#121212;--card:#1e1e1e;--text:#f0f0f0;--muted:#aaa;--border:#2a2a2a}
}
html{scroll-behavior:smooth}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--text);line-height:1.5;
  -webkit-font-smoothing:antialiased;padding-bottom:80px;
}
.header{
  background:linear-gradient(135deg,#FF9800,#FF5722);
  padding:32px 20px 24px;color:#fff;text-align:center;
}
.header-inner{max-width:600px;margin:0 auto}
.avatar{
  width:80px;height:80px;border-radius:50%;
  background:rgba(255,255,255,.2);backdrop-filter:blur(10px);
  display:flex;align-items:center;justify-content:center;
  font-size:40px;margin:0 auto 12px;border:3px solid rgba(255,255,255,.3);
  overflow:hidden;
}
.avatar img{width:100%;height:100%;object-fit:cover}
.badge-vip{
  display:inline-block;padding:4px 12px;border-radius:12px;
  font-size:11px;font-weight:700;letter-spacing:.5px;
  background:${vip.bg};color:${vip.fg};border:1px solid ${vip.border};
  margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.2);
}
.nombre{font-size:24px;font-weight:800;margin-bottom:4px}
.categoria{font-size:13px;opacity:.9}
.container{max-width:600px;margin:0 auto;padding:0 16px}
section{margin:24px 0}
h2{font-size:18px;margin-bottom:12px;color:var(--primary);font-weight:700}
h3{font-size:14px;margin:16px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.card{
  background:var(--card);border-radius:14px;padding:16px;
  box-shadow:0 2px 8px rgba(0,0,0,.05);border:1px solid var(--border);
}
.descripcion{white-space:pre-line;font-size:15px;line-height:1.6}
.galeria-scroll{
  display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding:4px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;
}
.galeria-scroll::-webkit-scrollbar{display:none}
.galeria-scroll img{
  flex:0 0 240px;height:240px;object-fit:cover;border-radius:12px;
  scroll-snap-align:start;background:#eee;
}
.horario{display:flex;align-items:center;gap:8px;font-size:14px}
.horario-icon{font-size:20px}
.acciones{
  display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0;
}
.btn{
  display:flex;align-items:center;justify-content:center;gap:8px;
  padding:14px;border-radius:12px;text-decoration:none;
  font-weight:600;font-size:15px;border:none;cursor:pointer;
  transition:transform .1s, box-shadow .2s;
}
.btn:active{transform:scale(.97)}
.btn-wa{background:#25D366;color:#fff}
.btn-tel{background:var(--primary);color:#fff}
.btn-app{background:var(--card);color:var(--primary);border:2px solid var(--primary);grid-column:1/-1}
.btn-share{background:var(--card);color:var(--text);border:1px solid var(--border);grid-column:1/-1}
.productos{display:flex;flex-direction:column;gap:10px}
.producto{
  display:flex;gap:12px;background:var(--card);border-radius:12px;
  padding:10px;border:1px solid var(--border);position:relative;
}
.producto.agotado{opacity:.6}
.prod-img{
  flex:0 0 80px;width:80px;height:80px;border-radius:8px;
  overflow:hidden;background:#eee;display:flex;align-items:center;justify-content:center;
}
.prod-img img{width:100%;height:100%;object-fit:cover}
.no-img{font-size:28px;color:#ccc}
.prod-info{flex:1;min-width:0}
.prod-nombre{font-weight:600;font-size:14px;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis}
.prod-desc{font-size:12px;color:var(--muted);margin-bottom:6px;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.prod-precio{font-weight:700;color:var(--primary);font-size:14px}
.badge-agotado{
  position:absolute;top:8px;right:8px;background:#e74c3c;color:#fff;
  font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700;
}
.fab{
  position:fixed;bottom:20px;right:20px;width:60px;height:60px;
  border-radius:50%;background:#25D366;color:#fff;font-size:28px;
  display:flex;align-items:center;justify-content:center;
  text-decoration:none;box-shadow:0 6px 20px rgba(37,211,102,.5);
  z-index:100;transition:transform .2s;
}
.fab:active{transform:scale(.92)}
.footer{
  text-align:center;padding:32px 16px;color:var(--muted);font-size:12px;
}
.footer a{color:var(--primary);text-decoration:none;font-weight:600}
.toast{
  position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(100px);
  background:#333;color:#fff;padding:12px 20px;border-radius:24px;
  font-size:14px;opacity:0;transition:all .3s;z-index:200;pointer-events:none;
}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media(max-width:400px){
  .acciones{grid-template-columns:1fr}
  .galeria-scroll img{flex:0 0 200px;height:200px}
}
</style>
</head>
<body>
<header class="header">
  <div class="header-inner">
    ${n.fotos && n.fotos.length > 0
      ? `<div class="avatar"><img src="${esc(optimizarCloudinary(n.fotos[0]))}" alt="${nombre}"></div>`
      : `<div class="avatar">🏪</div>`}
    <span class="badge-vip">${vip.label}</span>
    <h1 class="nombre">${nombre}</h1>
    ${n.categoriaPrincipal ? `<div class="categoria">${esc(n.categoriaPrincipal.replace(/_/g,' '))}</div>` : ''}
  </div>
</header>

<main class="container">

  <section class="card">
    <div class="descripcion">${desc}</div>
  </section>

  ${horario ? `
  <section class="card">
    <div class="horario">
      <span class="horario-icon">🕐</span>
      <span>${horario}</span>
    </div>
  </section>` : ''}

  ${renderGaleria(n.fotos)}

  <div class="acciones">
    ${waLimpio ? `<a class="btn btn-wa" href="https://wa.me/${waLimpio}?text=${waMsg}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
    ${telLimpio ? `<a class="btn btn-tel" href="tel:${telLimpio}">📞 Llamar</a>` : ''}
    <a class="btn btn-app" href="${deepLink}" id="btnApp">📱 Abrir en Tranqui</a>
    <button class="btn btn-share" id="btnShare">🔗 Compartir</button>
  </div>

  ${renderCatalogo(catalogo)}

</main>

<footer class="footer">
  <p>Este negocio está en <a href="https://fatestudiosgame.github.io/tranqui-web" target="_blank" rel="noopener">Tranqui</a></p>
  <p>La app donde aceptan transferencia sin ponerte cara rara 😉</p>
</footer>

${waLimpio ? `<a class="fab" href="https://wa.me/${waLimpio}?text=${waMsg}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}

<div class="toast" id="toast">Link copiado</div>

<script>
(function(){
  // Deep link: intentar abrir app nativa en Android
  if(/Android/i.test(navigator.userAgent)){
    var start = Date.now();
    var f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = '${deepLink}';
    document.body.appendChild(f);
    setTimeout(function(){
      if(Date.now() - start < 2000 && !document.hidden){
        // Si la app no abrió, quitar el iframe silenciosamente
        f.remove();
      }
    }, 1500);
  }

  // Compartir
  var btnShare = document.getElementById('btnShare');
  var toast = document.getElementById('toast');
  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function(){ toast.classList.remove('show'); }, 2000);
  }
  btnShare.addEventListener('click', function(){
    var data = {
      title: '${nombre}',
      text: 'Mira ${nombre} en Tranqui',
      url: location.href
    };
    if(navigator.share){
      navigator.share(data).catch(function(){});
    } else if(navigator.clipboard){
      navigator.clipboard.writeText(location.href).then(function(){
        showToast('📋 Link copiado');
      });
    } else {
      showToast(location.href);
    }
  });

  // Botón app: fallback si no abre
  var btnApp = document.getElementById('btnApp');
  btnApp.addEventListener('click', function(e){
    if(!/Android|iPhone|iPad/i.test(navigator.userAgent)){
      e.preventDefault();
      location.href = '${webFallback}';
    }
  });
})();
</script>
</body>
</html>`;
}

async function main() {
  console.log('📡 Obteniendo negocios VIP...');
  const res = await fetch(API_URL);
  const json = await res.json();
  const vips = (json.data || []).filter(n => n && n.esVip === true);
  console.log('⭐ VIPs encontrados: ' + vips.length);

  if (fs.existsSync(P_DIR)) {
    for (const e of fs.readdirSync(P_DIR, { withFileTypes: true })) {
      if (e.isDirectory()) fs.rmSync(path.join(P_DIR, e.name), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(P_DIR, { recursive: true });
  }

  for (const n of vips) {
    const catalogo = await obtenerCatalogo(n.id);
    const dir = path.join(P_DIR, n.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), plantilla(n, catalogo), 'utf8');
    const prodCount = Object.values(catalogo).reduce((s, arr) => s + (arr?.length || 0), 0);
    console.log('✅ /p/' + n.id + '/  →  ' + n.nombre + ' (' + prodCount + ' productos)');
  }

  // Sitemap.xml
  const urls = vips.map(n => '  <url><loc>' + BASE_URL + '/p/' + n.id + '/</loc><changefreq>daily</changefreq></url>').join('\n');
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + BASE_URL + '/</loc></url>\n' + urls + '\n</urlset>';
  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), sitemap, 'utf8');
  console.log('✅ sitemap.xml generado con ' + (vips.length + 1) + ' URLs');

  console.log('🎉 Generación completada');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });