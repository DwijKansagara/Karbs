import http from 'node:http';
import {readFile} from 'node:fs/promises';
const routes=new Map([['/','index.html'],['/index.html','index.html'],['/privacy/','privacy/index.html'],['/privacy/index.html','privacy/index.html'],['/terms/','terms/index.html'],['/terms/index.html','terms/index.html'],['/style.css','style.css'],['/downloads.js','downloads.js'],['/favicon.svg','favicon.svg']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
const headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=15552000'};
http.createServer(async(req,res)=>{
 res.setHeaders(new Headers(headers));
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 let path;try{path=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
 if(path==='/privacy'||path==='/terms'){res.writeHead(301,{'Location':path+'/'});res.end();return;}
 const file=routes.get(path);if(!file){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:'Page not found.');return;}
 try{const bytes=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Content-Length':bytes.length,'Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500);res.end();}
}).listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Karbs website is ready.'));
