// generar_paginas_vip.js
// Genera una página HTML estática por cada negocio VIP con sus etiquetas Open Graph.
// Uso:  node generar_paginas_vip.js   (requiere Node 18+)
const fs = require('fs');
const path = require('path');

const API_URL = 'https://tranqui-server.onrender.com/api/negocios';
const BASE_URL = 'https://fatestudiosgame.github.io/tranqui-web';
const OUT_DIR = path.join(__dirname, 'web', 'p');

function escaparHtml(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plantilla(n) {
  const nombre = escaparHtml(n.nombre);
  const desc = escaparHtml(
    n.descripcionVip || n.descripcion ||
    'Negocio en Tranqui que acepta transferencia en Cuba.'
  );
  const url = BASE_URL + '/p/' + n.id + '/';
  const img = BASE_URL + '/og-image.png';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nombre} | Tranqui</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tranqui">
<meta property="og:title" content="${nombre}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${nombre}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#FF9800,#FF5722);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:white;border-radius:20px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.logo{font-size:48px;margin-bottom:16px}
h1{color:#FF5722;font-size:22px;margin-bottom:8px}
p{color:#666;margin-bottom:24px}
.loader{border:4px solid #f3f3f3;border-top:4px solid #FF5722;border-radius:50%;width:36px;height:36px;animation:spin 1s linear infinite;margin:0 auto 20px}
@keyframes spin{to{transform:rotate(360deg)}}
a{color:#FF5722;font-weight:bold}
</style>
</head>
<body>
<div class="box">
<div class="logo">&#127978;</div>
<h1>${nombre}</h1>
<p>Abriendo la pagina del negocio...</p>
<div class="loader"></div>
<a href="${BASE_URL}/#/p/${n.id}">Ver en la web</a>
</div>
<script>
(function(){
var app='tranqui://p/${n.id}';
var web='${BASE_URL}/#/p/${n.id}';
if(/Android/i.test(navigator.userAgent)){
var f=document.createElement('iframe');f.style.display='none';f.src=app;document.body.appendChild(f);
setTimeout(function(){if(!document.hidden){location.replace(web);}},1500);
}else{location.replace(web);}
})();
</script>
</body>
</html>`;
}

async function main() {
  console.log('📡 Obteniendo negocios desde la API...');
  const res = await fetch(API_URL);
  const json = await res.json();
  const vips = (json.data || []).filter(n => n.esVip === true);
  console.log('⭐ Negocios VIP encontrados: ' + vips.length);

  // Limpiar solo subcarpetas de web/p/ (conserva el index.html genérico)
  if (fs.existsSync(OUT_DIR)) {
    for (const e of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
      if (e.isDirectory()) fs.rmSync(path.join(OUT_DIR, e.name), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const n of vips) {
    const dir = path.join(OUT_DIR, n.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), plantilla(n), 'utf8');
    console.log('✅ /p/' + n.id + '/  →  ' + n.nombre);
  }

  // sitemap.xml para Google
  const urls = vips.map(n => '  <url><loc>' + BASE_URL + '/p/' + n.id + '/</loc></url>').join('\n');
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n' +
    '  <url><loc>' + BASE_URL + '/</loc></url>\n' + urls + '\n</urlset>\n';
  fs.writeFileSync(path.join(__dirname, 'web', 'sitemap.xml'), sitemap, 'utf8');
  console.log('✅ sitemap.xml generado con ' + (vips.length + 1) + ' URLs');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });