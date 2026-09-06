const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const port=4173;
const chatBackend='http://localhost:3000';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};

async function proxy(req,res,url){
  const suffix=url.pathname.slice('/atendimento-api'.length)||'/';
  const target=new URL(`/api${suffix}${url.search}`,chatBackend);
  const headers={...req.headers};
  delete headers.host;delete headers.origin;delete headers.referer;delete headers.connection;delete headers['content-length'];
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=chunks.length?Buffer.concat(chunks):undefined;
  const upstream=await fetch(target,{method:req.method,headers,body,redirect:'manual'});
  res.statusCode=upstream.status;
  upstream.headers.forEach((value,key)=>{if(!['content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);});
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

function staticFile(req,res,url){
  let pathname;
  try{pathname=decodeURIComponent(url.pathname);}catch{return void(res.writeHead(400).end('Pedido inválido'));}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,`.${pathname}`);
  if(file!==root&&!file.startsWith(`${root}${path.sep}`))return void(res.writeHead(403).end('Acesso negado'));
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile())return void(res.writeHead(404).end('Não encontrado'));
    res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='HEAD')return void res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/atendimento-api'||url.pathname.startsWith('/atendimento-api/'))return await proxy(req,res,url);
    if(!['GET','HEAD'].includes(req.method))return void(res.writeHead(405).end('Método não permitido'));
    staticFile(req,res,url);
  }catch(error){res.writeHead(502,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({ok:false,error:'O atendimento local não respondeu.'}));}
}).listen(port,'127.0.0.1',()=>console.log(`O Mascote: http://127.0.0.1:${port}/app.html?omascote_app=1&chat_preview=1`));
