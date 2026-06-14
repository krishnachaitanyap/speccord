const http=require('http'),fs=require('fs'),path=require('path');
const dir=__dirname;
http.createServer((req,res)=>{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);
  if(p==='/'||p==='') p='/index.html';
  const f=path.join(dir,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    const t=f.endsWith('.html')?'text/html':f.endsWith('.svg')?'image/svg+xml':'text/plain';
    res.writeHead(200,{'content-type':t});res.end(d);});
}).listen(8732,'127.0.0.1',()=>console.error('serving on 8732'));
