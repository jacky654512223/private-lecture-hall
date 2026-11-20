import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readdir,stat,readFile,unlink,rename,open} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,join} from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {usageHandler} from './usage.mjs';
import worker from '../dist/server/index.js';
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
const origin=new URL(process.env.PUBLIC_ORIGIN||`http://localhost:${port}`).origin;
const dataDir=resolve(process.env.DATA_DIR||fileURLToPath(new URL('../data',import.meta.url))),uploads=join(dataDir,'uploads');
await mkdir(uploads,{recursive:true});const sqlite=new DatabaseSync(join(dataDir,'hall.sqlite'));sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
sqlite.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)');
const migrationDir=fileURLToPath(new URL('../drizzle',import.meta.url));
for(const file of (await readdir(migrationDir)).filter(n=>n.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM app_migrations WHERE name=?').get(file)){
 sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(await readFile(join(migrationDir,file),'utf8'));sqlite.prepare('INSERT INTO app_migrations VALUES(?)').run(file);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
}
const recordUsage = usageHandler(sqlite, origin);
const DB={prepare(sql){const stmt=sqlite.prepare(sql);let values=[];return{bind(...args){values=args;return this;},async first(){return stmt.get(...values)||null;},async all(){return{results:stmt.all(...values)};},async run(){return{meta:{changes:Number(stmt.run(...values).changes)}};}};}};
const maxFile=200*1024*1024,maxStorage=Number(process.env.MAX_UPLOAD_GB||1)*1024**3;
let reserved=0;const recentUploads=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
function uploadError(status,message){throw Object.assign(Error(message),{status});}
async function upload(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(req.headers.origin!==origin)return json(res,403,{error:'Origin not allowed.'});
 const token=createHash('sha256').update(String(req.headers.authorization||'').replace(/^Bearer /,'')).digest('hex');
 const session=sqlite.prepare('SELECT * FROM hall_sessions WHERE token=? AND last>?').get(token,Date.now()-86400000);
 const room=session?.room&&sqlite.prepare('SELECT state FROM hall_rooms WHERE id=?').get(session.room);const state=room&&JSON.parse(room.state);
 if(!state||state.host!==session.id||!state.members.some(m=>m.id===session.id&&Date.now()-m.last<120000))return json(res,403,{error:'Only the room host can upload.'});
 if(Date.now()-(recentUploads.get(session.id)||0)<30000)return json(res,429,{error:'Please wait before uploading another video.'});
 let name;try{name=decodeURIComponent(req.headers['x-file-name']||'video.mp4');}catch{return json(res,400,{error:'Invalid file name.'});}
 const ext=name.match(/\.(mp4|webm)$/i)?.[1].toLowerCase();if(!ext)return json(res,400,{error:'Choose an MP4 or WebM video.'});
 const length=Number(req.headers['content-length']);if(!length||length>maxFile)return json(res,413,{error:'Choose a video smaller than 200 MB.'});
 let total=0;for(const file of await readdir(uploads)){const info=await stat(join(uploads,file));total+=info.size;}
 if(total+reserved+length>maxStorage)return json(res,507,{error:'Video storage is full.'});
 reserved+=length;recentUploads.set(session.id,Date.now());const id=randomBytes(16).toString('hex'),tmp=join(uploads,id+'.part'),target=join(uploads,id+'.'+ext);let file;
 try{
  file=await open(tmp,'wx');let size=0,head=Buffer.alloc(0);
  for await(const chunk of req){size+=chunk.length;if(size>maxFile||size>length)uploadError(413,'Video is too large.');if(head.length<16)head=Buffer.concat([head,chunk.subarray(0,16-head.length)]);await file.write(chunk);}
  if(size!==length)uploadError(400,'Upload was interrupted.');
  if(ext==='mp4'&&head.toString('ascii',4,8)!=='ftyp')uploadError(400,'This file is not an MP4 video.');
  if(ext==='webm'&&head.subarray(0,4).toString('hex')!=='1a45dfa3')uploadError(400,'This file is not a WebM video.');
  await file.close();file=null;await rename(tmp,target);json(res,200,{kind:'video',url:origin+'/media/'+id+'.'+ext,title:name.slice(0,100),provider:'Uploaded video',sync:true});
 }catch(e){await file?.close().catch(()=>{});await unlink(tmp).catch(()=>{});if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Upload failed.'});}finally{reserved-=length;}
}
const server=createServer({requestTimeout:300000,headersTimeout:10000},async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'}).end('ok');return;}
 if(url.pathname==='/api/usage')return await recordUsage(req,res);
 if(url.pathname==='/api/upload')return await upload(req,res);
 if(url.pathname.startsWith('/media/')){
  if(!['GET','HEAD'].includes(req.method))return res.writeHead(405).end();
  if(!/^\/media\/[a-f0-9]{32}\.(mp4|webm)$/.test(url.pathname))return res.writeHead(404).end();
  const path=join(uploads,url.pathname.split('/').pop());let info;try{info=await stat(path);}catch{return res.writeHead(404).end();}
  let start=0,end=info.size-1,status=200;
  if(req.headers.range){const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!range||(!range[1]&&!range[2]))return res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();if(!range[1])start=Math.max(0,info.size-Number(range[2]));else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}if(start>end||start>=info.size)return res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();status=206;}
  res.writeHead(status,{'Content-Type':path.endsWith('.webm')?'video/webm':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=3600',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
  if(req.method==='HEAD')return res.end();const stream=createReadStream(path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
 }
 const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
 // Never trust a client-supplied Cloudflare IP header on the independent server.
 headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');
 const init={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){init.body=Readable.toWeb(req);init.duplex='half';}
 const out=await worker.fetch(new Request(url,init),{DB,UPLOADS:true});res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));
}catch(e){console.error(e.message);if(!res.headersSent)json(res,500,{error:'Something went wrong.'});else res.end();}});
server.listen(port,host,()=>console.log('Lecture Hall ready: '+origin));
const cleanup=setInterval(async()=>{try{for(const file of await readdir(uploads)){const p=join(uploads,file),info=await stat(p);if(Date.now()-info.mtimeMs>7*86400000)await unlink(p);}for(const [key,time]of recentUploads)if(Date.now()-time>60000)recentUploads.delete(key);}catch(e){console.error('Cleanup failed',e.message);}},3600000);cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{sqlite.close();process.exit(0);}));
