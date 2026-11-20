import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_shared_halls.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let values=[];const stmt=sqlite.prepare(sql);return {bind(...args){values=args;return this;},async first(){return stmt.get(...values)||null;},async all(){return {results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};}};}};
async function call(path,data,token,status=200,impl=worker){const res=await impl.fetch(new Request('https://test.example/api/'+path,{method:data===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),{DB});const result=await res.json();assert.equal(res.status,status,JSON.stringify(result));return result;}
const a=await call('session',{name:'Alice'}),b=await call('session',{name:'Bob'}),c=await call('session',{name:'Carol'});
const r=await call('create',{title:'A lecture',visibility:'public'},a.token);assert.equal((await call('rooms'))[0].id,r.id);await call('join',{room:r.id},b.token);
const race=await Promise.allSettled([call('seat',{seat:'C3'},a.token),call('seat',{seat:'C3'},b.token)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected').length,1);
await call('seat',{seat:'Z8'},a.token,400);await call('media',{kind:'demo',url:'',time:25,playing:true},a.token);await call('media',{kind:'demo',url:'',time:0,playing:false},b.token,403);
const late=await call('join',{room:r.id},c.token);assert.equal(late.media.time,25);assert.equal(late.media.playing,true);
await call('chat',{text:'Hello <script>'},b.token);await call('chat',{text:'spam'},b.token,429);
// A separate module instance shares only the database, matching independent Workers.
const other=(await import('../dist/server/index.js?second-instance')).default;
const remote=await call('state',undefined,c.token,200,other);assert.equal(remote.messages[0].text,'Hello <script>');assert.equal(remote.members.length,3);
await call('leave',{},a.token);assert.equal((await call('state',undefined,b.token)).host,b.id);await call('media',{kind:'demo',url:'',time:40,playing:false},b.token);
await call('leave',{},b.token);await call('leave',{},c.token);assert.equal((await call('rooms')).length,0);
const pr=await call('create',{title:'Private',visibility:'private'},a.token);assert.equal((await call('rooms')).length,0);await call('join',{room:pr.id},b.token);
await call('media',{kind:'video',url:'javascript:alert(1)',time:0},a.token,400);await call('media',{kind:'youtube',url:'M7lc1UVf-VE',time:0,playing:true},a.token);
const row=sqlite.prepare('SELECT state FROM hall_rooms WHERE id=?').get(pr.id);const stale=JSON.parse(row.state);stale.members.find(m=>m.id===a.id).last=Date.now()-130000;sqlite.prepare('UPDATE hall_rooms SET state=? WHERE id=?').run(JSON.stringify(stale),pr.id);
assert.equal((await call('heartbeat',{},b.token)).host,b.id);await call('state',undefined,a.token,404);
assert.equal((await worker.fetch(new Request('https://test.example/api/seat',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{DB})).status,403);
await call('seat',{seat:'A1'},undefined,401);await call('join',{room:'missing'},c.token,404);
assert.equal((await worker.fetch(new Request('https://test.example/'),{DB})).status,200);assert.equal((await worker.fetch(new Request('https://test.example/nope'),{DB})).status,404);
console.log('PASS: 3 users, cross-instance persistence, atomic seat race, public/private lobby, host permissions and transfer, chat, late join playback, expiry, invalid inputs, origin checks, static assets.');
