const fs = require('fs');
const path = require('path');

const API_URL = 'https://tranqui-server.onrender.com/api/negocios';
const BASE_URL = 'https://fatestudiosgame.github.io/tranqui-web';
const P_DIR = path.join(process.cwd(), 'p');

function esc(t) {
  return String(t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plantilla(n) {
  const nombre = esc(n.nombre);
  const desc = esc(n.descripcionVip || n.descripcion || 'Negocio en Tranqui que acepta transferencia en Cuba.');
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
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#FF9800,#FF5722);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.box{background:#fff;border-radius:20px;padding:40px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}.logo{font-size:48px;margin-bottom:16px}h1{color:#FF5722;font-size:22px;margin-bottom:8px}p{color:#666;margin-bottom:24px}.loader{border:4px solid #f3f3f3;border-top:4px solid #FF5722;border-radius:50%;width:36px;height:36px;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{to{transform:rotate(360deg)}}a{color:#FF5722;font-weight:bold}</style>
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
  console.log('📡 Obteniendo negocios VIP...');
  const res = await fetch(API_URL);
  const json = await res.json();
  // Tu API devuelve { success: true, data: [...] }
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
    const dir = path.join(P_DIR, n.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), plantilla(n), 'utf8');
    console.log('✅ /p/' + n.id + '/  ->  ' + n.nombre);
  }
  console.log('🎉 Generacion completada');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
