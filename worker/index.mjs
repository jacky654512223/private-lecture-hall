import {resolveMedia,validEmbed} from './media.mjs';
const uid=()=>crypto.randomUUID().replaceAll('-','');
const clean=(v,n)=>String(v||'').trim().slice(0,n);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
const publicView=r=>({...r,members:r.members.map(({id,name,seat})=>({id,name,seat})),now:Date.now()});
function prune(r){r.members=r.members.filter(m=>Date.now()-m.last<120000);if(!r.members.some(m=>m.id===r.host))r.host=r.members[0]?.id||null;return r;}
async function mutate(db,id,fn){
 for(let i=0;i<8;i++){
  const row=await db.prepare('SELECT state,version FROM hall_rooms WHERE id=?').bind(id).first();if(!row)fail(404,'This room has closed.');
  const r=prune(JSON.parse(row.state));await fn(r);
  const changed=await db.prepare('UPDATE hall_rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(JSON.stringify(r),Date.now(),id,row.version).run();
  if(changed.meta.changes){if(!r.members.length)await db.prepare('DELETE FROM hall_rooms WHERE id=? AND version=?').bind(id,row.version+1).run();return r;}
 }
 fail(409,'The room is busy. Please try again.');
}
async function leave(db,s){if(s.room){try{await mutate(db,s.room,r=>{r.members=r.members.filter(m=>m.id!==s.id);prune(r);});}catch(e){if(e.status!==404)throw e;}}await db.prepare('UPDATE hall_sessions SET room=NULL WHERE token=?').bind(s.token).run();s.room=null;}
async function rate(db,key,max,window=60000){const now=Date.now(),bucket=key+':'+Math.floor(now/window);const r=await db.prepare('INSERT INTO hall_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+window*2).first();if(r.count>max)fail(429,'Please slow down.');}
export default {async fetch(request,env){try{
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/')){
  if(!['GET','HEAD'].includes(request.method))fail(405,'Method not allowed.');
  const asset=assets[path];if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset[0],'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'}});
 }
 const db=env.DB;if(!db)fail(503,'The classroom is starting up.');
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)fail(403,'Origin not allowed.');
 let b={};if(request.method==='POST'){
  if(Number(request.headers.get('Content-Length'))>8192)fail(413,'Request too large.');
  const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>8192){reader.cancel();fail(413,'Request too large.');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();try{b=JSON.parse(text||'{}');}catch{fail(400,'Invalid request.');}
 }
 if(path==='/api/capabilities'&&request.method==='GET')return json({uploads:!!env.UPLOADS});
 if(path==='/api/session'&&request.method==='POST'){
  const ip=await hash(request.headers.get('CF-Connecting-IP')||'local');await rate(db,'session:'+ip,30);
  const token=uid()+uid(),id=uid(),name=clean(b.name,24)||'Guest';
  await db.prepare('INSERT INTO hall_sessions(token,id,name,room,last) VALUES(?,?,?,NULL,?)').bind(await hash(token),id,name,Date.now()).run();
  await db.prepare('DELETE FROM hall_sessions WHERE last<?').bind(Date.now()-86400000).run();await db.prepare('DELETE FROM hall_limits WHERE expires<?').bind(Date.now()).run();
  return json({token,id,name});
 }
 if(path==='/api/rooms'&&request.method==='GET'){
  const {results}=await db.prepare('SELECT state FROM hall_rooms WHERE updated>? ORDER BY updated DESC LIMIT 100').bind(Date.now()-120000).all();
  return json(results.map(x=>prune(JSON.parse(x.state))).filter(r=>r.visibility==='public'&&r.members.length).map(r=>({id:r.id,title:r.title,count:r.members.length,media:r.media.kind,playing:r.media.playing})));
 }
 const token=await hash((request.headers.get('Authorization')||'').replace(/^Bearer /,''));
 const s=await db.prepare('SELECT * FROM hall_sessions WHERE token=? AND last>?').bind(token,Date.now()-86400000).first();if(!s)fail(401,'Please join again.');
 if(!['GET','POST'].includes(request.method))fail(405,'Method not allowed.');
 if(request.method==='POST')await rate(db,'action:'+s.id,240);
 await db.prepare('UPDATE hall_sessions SET last=? WHERE token=?').bind(Date.now(),token).run();
 if(path==='/api/video-link'&&request.method==='POST'){await rate(db,'resolve:'+s.id,15);try{return json(await resolveMedia(b.url));}catch(e){return json({error:e.message||'This video is unavailable.'},422);}}
 if(path==='/api/create'&&request.method==='POST'){
  await rate(db,'create:'+s.id,8);await leave(db,s);
  await db.prepare('DELETE FROM hall_rooms WHERE updated<?').bind(Date.now()-120000).run();
  const count=await db.prepare('SELECT COUNT(*) AS n FROM hall_rooms').first();if(count.n>=100)fail(503,'All halls are busy.');
  const r={id:uid(),title:clean(b.title,80)||'A quiet study session',visibility:b.visibility==='private'?'private':'public',host:s.id,members:[{id:s.id,name:s.name,seat:null,last:Date.now()}],messages:[],media:{kind:'idle',url:'',title:'Private Lecture Hall',time:0,playing:false,updated:Date.now(),revision:0}};
  await db.prepare('INSERT INTO hall_rooms(id,state,version,updated) VALUES(?,?,0,?)').bind(r.id,JSON.stringify(r),Date.now()).run();await db.prepare('UPDATE hall_sessions SET room=? WHERE token=?').bind(r.id,token).run();return json(publicView(r));
 }
 if(path==='/api/join'&&request.method==='POST'){
  const target=await db.prepare('SELECT state FROM hall_rooms WHERE id=?').bind(String(b.room||'')).first();if(!target||!prune(JSON.parse(target.state)).members.length)fail(404,'This room has closed.');
  if(s.room!==b.room)await leave(db,s);
  const r=await mutate(db,b.room,r=>{if(!r.members.length)fail(404,'This room has closed.');const m=r.members.find(m=>m.id===s.id);if(m){m.last=Date.now();return;}if(r.members.length>=30)fail(409,'This room is full.');r.members.push({id:s.id,name:s.name,seat:null,last:Date.now()});});
  await db.prepare('UPDATE hall_sessions SET room=? WHERE token=?').bind(r.id,token).run();return json(publicView(r));
 }
 if(path==='/api/leave'&&request.method==='POST'){await leave(db,s);return json({ok:true});}
 if(!s.room)fail(404,'This room has closed.');
 if(path==='/api/state'&&request.method==='GET'){
  const row=await db.prepare('SELECT state FROM hall_rooms WHERE id=?').bind(s.room).first();if(!row)fail(404,'This room has closed.');const r=prune(JSON.parse(row.state));if(!r.members.some(m=>m.id===s.id))fail(404,'Your session ended. Join again.');return json(publicView(r));
 }
 if(request.method!=='POST')fail(405,'Method not allowed.');
 const r=await mutate(db,s.room,r=>{
  const m=r.members.find(m=>m.id===s.id);if(!m)fail(404,'Your session ended. Join again.');m.last=Date.now();
  if(path==='/api/heartbeat')return;
  if(path==='/api/seat'){
   if(b.seat!==null&&!/^[A-E][1-6]$/.test(b.seat))fail(400,'Invalid seat.');if(b.seat&&r.members.some(x=>x.id!==s.id&&x.seat===b.seat))fail(409,'Someone just took that seat. Choose another.');m.seat=b.seat;
  }else if(path==='/api/chat'){
   const text=clean(b.text,500);if(!text)fail(400,'Write a message first.');if(Date.now()-(m.chatAt||0)<800)fail(429,'Please slow down.');m.chatAt=Date.now();r.messages.push({id:uid(),user:s.id,name:s.name,seat:m.seat,text,at:Date.now()});r.messages=r.messages.slice(-80);
  }else if(path==='/api/media'){
   if(r.host!==s.id)fail(403,'Only the host controls the lecture.');if(!['idle','demo','video','youtube','embed'].includes(b.kind))fail(400,'Choose a shared MP4 or YouTube video.');
   let mediaURL='';if(b.kind==='youtube'){if(!/^[\w-]{11}$/.test(b.url))fail(400,'Invalid YouTube video.');mediaURL=b.url;}
   if(b.kind==='embed'){if(!validEmbed(b.url))fail(400,'Unsupported player URL.');mediaURL=b.url;}
   if(b.kind==='video'){let u;try{u=new URL(b.url,url.origin);}catch{fail(400,'Invalid video URL.');}if((u.protocol!=='https:'&&!(env.UPLOADS&&u.origin===url.origin&&/^\/media\/[a-f0-9]{32}\.(mp4|webm)$/.test(u.pathname)))||u.username||u.password||!(/\.(mp4|webm|m4v|ogv)$/i.test(u.pathname)))fail(400,'Use an HTTPS MP4 link.');mediaURL=u.href;}
   const time=Number(b.time);if(!Number.isFinite(time)||time<0||time>604800)fail(400,'Invalid playback position.');r.media={kind:b.kind,url:mediaURL,title:clean(b.title,100)||'Shared lecture',time,playing:b.kind==='embed'?false:b.playing===true,provider:clean(b.provider,32),sync:b.kind!=='embed',updated:Date.now(),revision:r.media.revision+1};
  }else fail(404,'Not found.');
 });return json(publicView(r));
}catch(e){if(!e.status)console.error('Hall request failed',e.message);return json({error:e.status?e.message:'Something went wrong. Please try again.'},e.status||500);}}};
