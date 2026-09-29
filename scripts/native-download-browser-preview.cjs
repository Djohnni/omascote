// Manual browser harness. Loopback only; no production API/auth/payment calls.
// Usage: node scripts/native-download-browser-preview.cjs <order-directory>
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const orderDirectory = process.argv[2];
if (!orderDirectory) throw new Error('Provide the existing test order directory');
const html = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const start = html.indexOf('const downloadsDiretosEmAndamento = new Set();');
const end = html.indexOf('function ambienteDownloadAtual()', start);
if (start < 0 || end < start) throw new Error('Native helpers not found');
const script = html.slice(start, end);
const files = {
  imagem: { bytes: fs.readFileSync(path.join(orderDirectory, 'resultado_final.png')), type: 'image/png', name: 'omascote-teste-https-imagem.png' },
  video: { bytes: fs.readFileSync(path.join(orderDirectory, 'resultado_video.mp4')), type: 'video/mp4', name: 'omascote-teste-https-video.mp4' }
};
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Teste isolado do download HTTPS</title>
      <style>body{font:18px sans-serif;max-width:700px;margin:50px auto}button{padding:16px;margin:10px}#ia4ToastPedido{padding:20px;border:1px solid green}</style>
      <h1>Teste isolado de download</h1><p>Sem login, cobrança ou alterações nos pedidos. A página deve permanecer aberta.</p>
      <button onclick="testar('imagem')">Baixar imagem de teste</button><button onclick="testar('video')">Baixar vídeo de teste</button>
      <div id="ia4ToastPedido"><strong>Pronto</strong><br><span>Escolha um arquivo.</span></div><pre id="status"></pre>
      <script>function ia4Track(){} function mostrarAvisoPedido(t,m){document.querySelector('strong').textContent=t;document.querySelector('#ia4ToastPedido span').textContent=m;}
      ${script}
      function testar(tipo){document.getElementById('status').textContent='Preparando por 2 segundos…';setTimeout(()=>{
        solicitarDownloadHttps({url:location.origin+'/arquivo/'+tipo,id:'teste',formato:tipo,expiresIn:300});
        mostrarAlternativaDownloadHttps('teste',tipo);document.getElementById('status').textContent='Solicitado: '+tipo+' — página preservada';
      },2000);}</script></html>`);
  }
  const file = files[req.url?.split('/arquivo/')[1]];
  if (!file) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Length', file.bytes.length);
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(file.bytes);
  console.log('File response:', file.name, file.bytes.length);
});
server.listen(18769, '127.0.0.1', () => {
  console.log('Preview: http://127.0.0.1:18769/');
  for (const file of Object.values(files)) console.log(file.name, file.bytes.length, crypto.createHash('sha256').update(file.bytes).digest('hex'));
});
