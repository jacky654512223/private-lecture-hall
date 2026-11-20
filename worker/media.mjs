const douyinPages = new Set(['douyin.com', 'www.douyin.com', 'm.douyin.com', 'www.iesdouyin.com', 'iesdouyin.com', 'jingxuan.douyin.com']);
const rednotePages = new Set(['xiaohongshu.com', 'www.xiaohongshu.com', 'm.xiaohongshu.com', 'rednote.com', 'www.rednote.com']);
const rednoteShort = new Set(['xhslink.com', 'www.xhslink.com', 'xhslink.cn', 'www.xhslink.cn']);
const mobileAgent = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const notePath = /^\/(?:explore|discovery\/item|user\/profile\/[0-9a-f]+)\/([0-9a-f]{24})\/?$/i;

function parseLink(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password) throw Error();
  url.protocol = 'https:';
  url.hash = '';
  return url;
}

async function expandShare(url, allowedHosts, options) {
  for (let hop = 0; hop < 4; hop++) {
    if (!allowedHosts.has(url.hostname)) throw Error('redirect-host');
    let response;
    try {
      response = await fetch(url, { ...options, redirect: 'manual' });
    } catch (error) {
      throw Error(error.name === 'TimeoutError' ? 'upstream-timeout' : 'upstream-network');
    }
    if (response.status < 300 || response.status >= 400) return { url, response };
    const next = response.headers.get('Location');
    await response.body?.cancel();
    if (!next) throw Error('redirect-missing');
    url = parseLink(new URL(next, url).href);
    if (!allowedHosts.has(url.hostname)) throw Error('redirect-host');
    if (douyinPages.has(url.hostname)) return { url };
  }
  throw Error('redirect-limit');
}

async function resolveDouyin(url, signal) {
  if (url.hostname === 'v.douyin.com' && /^\/[\w-]+\/?$/.test(url.pathname)) {
    const result = await expandShare(url, new Set([...douyinPages, 'v.douyin.com']), {
      signal, headers: {'User-Agent': mobileAgent},
    });
    await result.response?.body?.cancel();
    url = result.url;
  }
  let id = douyinPages.has(url.hostname)
    ? url.pathname.match(/^\/(?:share\/|m\/)?video\/(\d{15,22})\/?$/)?.[1] || url.searchParams.get('modal_id')
    : null;
  if (url.hostname === 'open.douyin.com' && url.pathname === '/player/video') id = url.searchParams.get('vid');
  if (!/^\d{15,22}$/.test(id || '')) throw Error();
  // Use the public player URL documented by Douyin for the resolved video ID.
  return { kind: 'embed', title: 'Douyin video', url: 'https://open.douyin.com/player/video?vid=' + id + '&autoplay=0' };
}

async function readNote(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, html = '';
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) return html + decoder.decode();
      bytes += value.length;
      if (bytes > 2_000_000) throw Error('note-page-too-large');
      html += decoder.decode(value, {stream: true});
    }
  } finally {
    await reader.cancel();
  }
}

function cleanNoteTitle(title){return typeof title==='string'&&title.trim()?title.trim().slice(0,100):'Xiaohongshu video';}

async function resolveRednote(url, signal) {
  if (rednoteShort.has(url.hostname)) {
    if (!/^\/(?:[ao]\/)?[\w-]+\/?$/.test(url.pathname)) throw Error();
  } else if (!rednotePages.has(url.hostname) || !notePath.test(url.pathname)) throw Error();

  const {url: noteUrl, response} = await expandShare(url, new Set([...rednotePages, ...rednoteShort]), {
    signal, headers: {'User-Agent': mobileAgent},
  });
  const id = rednotePages.has(noteUrl.hostname) && noteUrl.pathname.match(notePath)?.[1];
  if (!response?.ok || !id) {
    await response?.body?.cancel();
    throw Error('note-page-' + (response?.status ?? 'missing'));
  }
  const html = await readNote(response);
  const raw = html.match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw Error(/验证码|访问异常|安全验证|captcha|verify-page/i.test(html)?'note-verification-required':'note-metadata-missing');
  // The page serializes missing values as bare undefined. Parse data only.
  let state;try{state = JSON.parse(raw.trim().replace(/;$/, '').replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, part => part === 'undefined' ? 'null' : part));}catch{throw Error('note-metadata-invalid');}
  const note = state.noteData?.data?.noteData ?? state.note?.noteDetailMap?.[id]?.note;
  if (note?.type !== 'video' || (note.noteId ?? note.id) !== id) throw Error('note-video-missing');
  const streamData=note.video?.media?.stream;
  const streams=[...(streamData?.h264??[]),...(streamData?.h264List??[])];
  for (const stream of streams) {
    const backups=stream.backupUrls??stream.backup_urls??[];
    for(const candidate of [stream.masterUrl,...(Array.isArray(backups)?backups:[])]){
      if(typeof candidate!=='string')continue;
      let media;try{media=parseLink(candidate);}catch{continue;}
      if(media.hostname.endsWith('.xhscdn.com') && /\.mp4$/i.test(media.pathname))return {kind:'video',title:cleanNoteTitle(note.title),url:media.href};
    }
  }
  throw Error('note-stream-missing');
}


const biliHosts=new Set(['b23.tv','www.bilibili.com','m.bilibili.com','bilibili.com','player.bilibili.com']);
export function validEmbed(value){
 try{const u=parseLink(value);return (u.hostname==='player.bilibili.com'&&u.pathname==='/player.html'&&(/^(?:BV[\w]{10})$/.test(u.searchParams.get('bvid')||'')||/^\d+$/.test(u.searchParams.get('aid')||'')))
 ||(u.hostname==='open.douyin.com'&&u.pathname==='/player/video'&&/^\d{15,22}$/.test(u.searchParams.get('vid')||''))
 ||(u.hostname==='v.qq.com'&&u.pathname==='/txp/iframe/player.html'&&/^[a-zA-Z0-9]{11}$/.test(u.searchParams.get('vid')||''))
 ||(u.hostname==='player.youku.com'&&/^\/embed\/[A-Za-z0-9=]+$/.test(u.pathname));}catch{return false;}
}
export async function resolveMedia(input){
 const raw=String(input||'').trim();if(raw.length>4096)throw Error('This link is too long.');
 const iframe=raw.match(/<iframe[^>]+src=["']([^"']+)/i)?.[1];
 const extracted=iframe||(raw.match(/https?:\/\/[^\s<>"，。！？；]+/i)?.[0])||raw;
 let url;try{url=parseLink(extracted.replace(/^\/\//,'https://').replaceAll('&amp;','&'));}catch{throw Error('Paste a video link or a supported player embed code.');}
 const original=url.href,signal=AbortSignal.timeout(8000);let host=url.hostname.replace(/^www\./,'');
 const result=(kind,url,title,provider)=>({kind,url,title,provider,original,sync:kind!=='embed'});
 let youtube='';if(host==='youtu.be')youtube=url.pathname.split('/')[1];if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host))youtube=url.searchParams.get('v')||url.pathname.split('/')[2];
 if(/^[\w-]{11}$/.test(youtube||''))return result('youtube',youtube,'YouTube video','YouTube');
 if(biliHosts.has(url.hostname)){
  if(url.hostname==='b23.tv'){const expanded=await expandShare(url,biliHosts,{signal});await expanded.response?.body?.cancel();url=expanded.url;}
  const bv=url.pathname.match(/\/(BV[\w]{10})(?:\/|$)/)?.[1]||url.searchParams.get('bvid');const aid=url.pathname.match(/\/av(\d+)(?:\/|$)/)?.[1]||url.searchParams.get('aid');
  const page=Math.max(1,Math.min(999,Number(url.searchParams.get('p')||url.searchParams.get('page'))||1));
  if(!/^BV[\w]{10}$/.test(bv||'')&&!/^\d+$/.test(aid||''))throw Error('Paste an individual Bilibili video link.');
  return result('embed','https://player.bilibili.com/player.html?'+(bv?'bvid='+bv:'aid='+aid)+'&page='+Math.floor(page)+'&autoplay=0','Bilibili video','Bilibili');
 }
 if(douyinPages.has(url.hostname)||['v.douyin.com','open.douyin.com'].includes(url.hostname)){
  const m=await resolveDouyin(url,signal);return result(m.kind,m.url,m.title,'Douyin');
 }
 if(rednotePages.has(url.hostname)||rednoteShort.has(url.hostname)){
  try{const m=await resolveRednote(url,signal);return result(m.kind,m.url,m.title,'Xiaohongshu');}catch(error){const reason=/^(note-[a-z0-9-]+|redirect-[a-z-]+|upstream-[a-z-]+)$/.test(error.message)?error.message:'note-unexpected-response';console.error('Xiaohongshu resolution failed',JSON.stringify({reason}));const code='XHS_'+reason.replace(/^note-/, '').replaceAll('-','_').toUpperCase();throw Error('Xiaohongshu could not load this video ('+code+').');}
 }
 if(['v.qq.com','m.v.qq.com'].includes(host)){
  const vid=url.searchParams.get('vid')||url.pathname.match(/\/([a-zA-Z0-9]{11})\.html$/)?.[1];if(!vid)throw Error('Paste an individual Tencent Video link.');
  return result('embed','https://v.qq.com/txp/iframe/player.html?vid='+vid+'&auto=0','Tencent Video','Tencent Video');
 }
 if(['v.youku.com','player.youku.com'].includes(host)){
  const id=url.pathname.match(/(?:id_|\/embed\/)([A-Za-z0-9=]+)/)?.[1];if(!id)throw Error('Paste an individual Youku video link.');
  return result('embed','https://player.youku.com/embed/'+id,'Youku video','Youku');
 }
 if(/\.(mp4|webm|m4v|ogv)$/i.test(url.pathname))return result('video',url.href,decodeURIComponent(url.pathname.split('/').pop()),'Video file');
 throw Error('This platform has no connected player yet. Use its video file link or upload the video.');
}
