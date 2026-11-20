import assert from 'node:assert/strict';
import {resolveMedia,validEmbed} from '../worker/media.mjs';
const cases=[['https://www.bilibili.com/video/BV1B7411m7LV/?p=2','embed','page=2'],['<iframe src="//player.bilibili.com/player.html?bvid=BV1B7411m7LV"></iframe>','embed','BV1B7411m7LV'],['https://www.bilibili.com/video/av123456/','embed','aid=123456'],['复制链接 https://www.douyin.com/video/7146408143612345678 打开抖音','embed','vid=7146408143612345678'],['https://v.qq.com/x/cover/coverid/a00269ix3l8.html','embed','a00269ix3l8'],['https://v.youku.com/v_show/id_XMzg0MTE2NjAxNg==.html','embed','XMzg0MTE2NjAxNg=='],['https://youtu.be/M7lc1UVf-VE','youtube','M7lc1UVf-VE'],['https://cdn.example.com/lesson.webm?token=x','video','lesson.webm']];
for(const [input,kind,fragment] of cases){const r=await resolveMedia(input);assert.equal(r.kind,kind);assert(r.url.includes(fragment));if(kind==='embed'){assert(validEmbed(r.url));assert.equal(r.sync,false);}}
for(const u of ['javascript:alert(1)','https://player.bilibili.com.evil.example/player.html?bvid=BV1B7411m7LV','https://v.qq.com/evil','https://open.douyin.com/player/video?vid=no'])assert.equal(validEmbed(u),false);
const original=globalThis.fetch;
try{
 globalThis.fetch=async u=>new URL(u).hostname==='b23.tv'?new Response(null,{status:302,headers:{location:'https://www.bilibili.com/video/BV1B7411m7LV/'}}):new Response('ok');
 assert.equal((await resolveMedia('https://b23.tv/example')).provider,'Bilibili');
 globalThis.fetch=async u=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secrets'}});
 await assert.rejects(()=>resolveMedia('https://b23.tv/example'));
 globalThis.fetch=async u=>new Response('blocked',{status:403});await assert.rejects(()=>resolveMedia('https://www.xiaohongshu.com/explore/0123456789abcdef01234567'),/XHS_PAGE_403/);
 const id='0123456789abcdef01234567',state={note:{noteDetailMap:{[id]:{note:{type:'video',noteId:id,video:{media:{stream:{h264:[{masterUrl:'https://sns-video.xhscdn.com/demo.mp4'}]}}}}}}}};
 globalThis.fetch=async()=>new Response('<script>window.__INITIAL_STATE__='+JSON.stringify(state)+'</script>');assert.equal((await resolveMedia('https://www.xiaohongshu.com/explore/'+id)).provider,'Xiaohongshu');
globalThis.fetch=async()=>new Response('<html>安全验证</html>');await assert.rejects(()=>resolveMedia('https://www.xiaohongshu.com/explore/'+id),/XHS_VERIFICATION_REQUIRED/);
 state.note.noteDetailMap[id].note.video.media.stream.h264=[{backupUrls:['https://sns-video.xhscdn.com/backup.mp4']}];globalThis.fetch=async()=>new Response('<script>window.__INITIAL_STATE__='+JSON.stringify(state)+'</script>');assert((await resolveMedia('https://www.xiaohongshu.com/explore/'+id)).url.endsWith('/backup.mp4'));
}finally{globalThis.fetch=original;}
console.log('PASS: Bilibili/BV/AV/embed/short-link, Douyin share text, Tencent Video, Youku, YouTube, video files, XHS metadata and blocked pages, redirect allowlist, unsafe embeds. Network behavior uses fixtures, not a playback claim.');
