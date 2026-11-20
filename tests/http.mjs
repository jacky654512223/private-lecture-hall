import assert from 'node:assert/strict';
const base=process.env.TEST_ORIGIN||'http://localhost:8790';
async function call(path,body,token,status=200){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));return b;}
const a=await call('session',{name:'Host'}),b=await call('session',{name:'Friend'});
try{
assert.equal((await call('capabilities')).uploads,true);const room=await call('create',{title:'HTTP test',visibility:'private'},a.token);await call('join',{room:room.id},b.token);
const bytes=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
const options=token=>({method:'POST',headers:{Origin:base,Authorization:'Bearer '+token,'Content-Type':'video/mp4','X-File-Name':'test.mp4'},body:bytes});
assert.equal((await fetch(base+'/api/upload',options(b.token))).status,403);
const upload=await fetch(base+'/api/upload',options(a.token));const media=await upload.json();assert.equal(upload.status,200,JSON.stringify(media));await call('media',{...media,time:0,playing:true},a.token);
const joined=await call('state',undefined,b.token);assert.equal(joined.media.url,media.url);
const response=await fetch(media.url,{headers:{Range:'bytes=0-7'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,8);assert.equal(response.headers.get('content-range'),`bytes 0-7/${bytes.length}`);
assert.equal((await fetch(media.url,{headers:{Range:'bytes=999999-'}})).status,416);assert.equal((await fetch(media.url,{headers:{Range:'bytes=-4'}})).status,206);
const platform=await call('video-link',{url:'https://www.bilibili.com/video/BV1B7411m7LV/'},a.token);await call('media',{...platform,time:0,playing:true},a.token);assert.equal((await call('state',undefined,b.token)).media.sync,false);
await call('media',{kind:'embed',url:'https://evil.example',time:0},a.token,400);
console.log('PASS: independent guest sessions, host-only upload, shared file URL, HTTP range playback transport, provider resolution and embed validation. Upload fixture tests transport, not video decoding.');
}finally{await call('leave',{},a.token);await call('leave',{},b.token);}
