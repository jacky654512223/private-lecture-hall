(() => {
 const $=id=>document.getElementById(id), api=window.classroomAPI;
 let identity=null,state=null,streamAbort=null,connected=false,occupantKey='',mediaKey='',ownSeat=null,lastRevision=-1,serverOffset=0,yt=null,ytReady=false,ytLoading=null,applyingUntil=0,joining=false,uploads=false;
 const {t, message, getCountLabel}=window.hallI18n;
 let bannerText='', linkErrorText='', lobbyStatus='Connecting…', rooms=[], connectionStatus='Connecting…';
 let copied=false, copyTimer, uploading=false, joiningByInvite=false;
 const banner=text=>{
   bannerText=text;
   $('networkNotice').textContent=message(text);
   $('networkNotice').hidden=!text;
 };
 function renderControls(){
   $('roomConnection').textContent=t(connectionStatus);
   $('inviteRoom').textContent=t(copied?'Link copied ✓':'Copy invite link ↗');
   $('upload').querySelector('span').textContent=t(uploading?'Uploading…':'Upload a video');
   $('createRoom').querySelector('h2').textContent=t(joiningByInvite?'Your seat is waiting.':'Open a classroom');
   $('createRoom').querySelector('button').textContent=t(joiningByInvite?'Join classroom →':'Create classroom →');
   $('linkError').textContent=message(linkErrorText);
   banner(bannerText);
 }
 const safe=fn=>(...args)=>{try{return Promise.resolve(fn(...args)).catch(e=>banner(e.message));}catch(e){banner(e.message);}};
 async function request(path,data,signal){const res=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{...(identity?{Authorization:'Bearer '+identity.token}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data),signal});const b=await res.json();if(res.status===401&&['create','join'].includes(path)){identity=null;sessionStorage.removeItem('hallIdentity');await session();return request(path,data,signal);}if(!res.ok)throw Error(b.error||'Connection unavailable.');return b;}
 async function session(){if(identity)return;const name=$('nickname').value.trim();if(!name){$('nickname').focus();throw Error('Enter your name to join.');}identity=await request('session',{name});sessionStorage.setItem('hallIdentity',JSON.stringify(identity));}
 try{identity=JSON.parse(sessionStorage.getItem('hallIdentity')||'null');if(identity)$('nickname').value=identity.name;}catch{}
 function isHost(){return !!state&&state.host===identity?.id;}
 function occupied(seat){return !!state?.members.some(m=>m.seat===seat&&m.id!==identity.id);}
 async function seat(id){if(!connected)return banner('Reconnecting. Please wait before choosing a seat.');try{const s=await request('seat',{seat:id});update(s);}catch(e){banner(e.message);}}
 window.multiplayer={seat,occupied,isHost};
 function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
 function renderLobby(){
   $('hallCount').textContent=lobbyStatus?t(lobbyStatus):t('{count} open',{count:rooms.length});
   const cards=$('roomList');
   cards.replaceChildren();
   if(lobbyStatus)return;
   if(!rooms.length){
     const empty=node('div','','empty-halls');
     empty.append(node('h3',t('The first seat is yours.')),node('p',t('Open a classroom and invite someone along.')));
     cards.append(empty);
   }
   const labels={idle:'Waiting for a lecture',youtube:'YouTube',video:'Shared video',embed:'Platform video',demo:'Mini lesson'};
   for(const room of rooms){
     const card=node('button','','room-card');
     card.append(
       node('span',t(room.playing?'● NOW PLAYING':'○ SETTLING IN'),'eyebrow'),
       node('h3',room.title),
       node('p',t(labels[room.media]||'Shared video')+' · '+t('{count} / 30 seats',{count:room.count})),
       node('span',t('Enter classroom ↗'),'card-enter')
     );
     card.onclick=safe(()=>enter(room.id));
     cards.append(card);
   }
 }
 async function lobby(){
   if(state)return;
   try{rooms=await request('rooms');lobbyStatus='';}
   catch(error){lobbyStatus='Offline';banner(error.message);}
   if(!state)renderLobby();
 }
 async function enter(id,created){if(joining)return;joining=true;try{await session();const s=created||await request('join',{room:id});state=s;mediaKey='';lastRevision=-1;occupantKey='';ownSeat=null;history.replaceState(null,'','?room='+encodeURIComponent(s.id));$('lobby').hidden=true;$('classroom').hidden=false;banner('');update(s);connect();}finally{joining=false;}}
 const createHandler=safe(async e=>{e.preventDefault();await session();const b=$('createRoom').querySelector('button');b.disabled=true;try{await enter(null,await request('create',{title:$('roomTitle').value,visibility:$('visibility').value}));}finally{b.disabled=false;}});
 $('createRoom').onsubmit=createHandler;
 $('leaveRoom').onclick=safe(async()=>{await request('leave',{});exit();});
 function exit(){streamAbort?.abort();state=null;connected=false;if(yt){api.disposeYouTube(yt);yt=null;}api.stop();api.seat(null);api.occupants([],identity?.id);ytReady=false;yt=null;history.replaceState(null,'',location.pathname);$('lobby').hidden=false;$('classroom').hidden=true;const form=$('createRoom');joiningByInvite=false;renderControls();$('roomTitle').parentElement.hidden=false;$('roomTitle').required=true;$('visibility').parentElement.hidden=false;form.onsubmit=createHandler;lobby();}
 $('inviteRoom').onclick=safe(async()=>{await navigator.clipboard.writeText(location.href);copied=true;renderControls();clearTimeout(copyTimer);copyTimer=setTimeout(()=>{copied=false;renderControls();},2000);});
 async function connect(){streamAbort?.abort();const controller=streamAbort=new AbortController();connected=false;connectionStatus='Connecting…';$('roomConnection').textContent=t(connectionStatus);
 const poll=async()=>{if(!state||controller.signal.aborted)return;try{const next=await request('state',undefined,controller.signal);if(controller.signal.aborted)return;connected=true;connectionStatus='● Connected';$('roomConnection').textContent=t(connectionStatus);update(next);}catch(e){if(e.name==='AbortError')return;connected=false;connectionStatus='Reconnecting…';$('roomConnection').textContent=t(connectionStatus);if(/closed|ended|join again/i.test(e.message)){exit();banner(e.message);return;}}if(state&&!controller.signal.aborted)setTimeout(poll,1200);};poll();}
 function update(next, synchronize=true){if(!state)return;state=next;if(synchronize)serverOffset=next.now-Date.now();$('sessionTitle').textContent=state.title;const host=state.members.find(m=>m.id===state.host);$('sessionInfo').textContent=t('{count} here · Hosted by {host}',{count:getCountLabel(state.members.length),host:host?.name||t('Guest')})+(isHost()?t(' (you)'):'');$('peopleCount').textContent=state.members.length;const me=state.members.find(m=>m.id===identity.id);if(me?.seat!==ownSeat){ownSeat=me?.seat||null;api.seat(ownSeat);}
 const key=JSON.stringify(state.members);if(key!==occupantKey){occupantKey=key;api.occupants(state.members,identity.id);$('people').replaceChildren(...state.members.map(m=>node('span',m.name+(m.id===identity.id?t(' (you)'):'')+' · '+(m.seat||t('standing'))+(m.id===state.host?' ♛':''))));}
 $('openLink').disabled=!isHost();$('demo').disabled=!isHost();$('play').disabled=!isHost();$('seek').disabled=!isHost();$('upload').hidden=!uploads;$('upload').disabled=!isHost()||uploading;
 const messages=$('chatMessages'),bottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60;const last=state.messages.at(-1)?.id||'';if(messages.dataset.last!==last){messages.dataset.last=last;messages.replaceChildren(...state.messages.map(m=>{const li=node('li','');li.append(node('small',m.name+' · '+(m.seat||t('standing'))),node('p',m.text));return li;}));if(bottom)messages.scrollTop=messages.scrollHeight;}
 if(synchronize)applyMedia();
 }
 function desired(){const m=state.media;return m.time+(m.playing?(Date.now()+serverOffset-m.updated)/1000:0);}
 async function youtubeAPI(){if(window.YT?.Player)return;if(!ytLoading)ytLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';window.onYouTubeIframeAPIReady=resolve;script.onerror=()=>reject(Error('YouTube could not connect.'));document.head.append(script);setTimeout(()=>{if(!window.YT?.Player)reject(Error('YouTube could not connect.'));},15000);});return ytLoading;}
 function applyMedia(){if(!state)return;const m=state.media,key=m.kind+':'+m.url;if(key!==mediaKey){mediaKey=key;ytReady=false;if(yt){api.disposeYouTube(yt);yt=null;}api.open(m);if(m.kind==='youtube'){youtubeAPI().then(()=>{if(!state||mediaKey!==key)return;yt=new YT.Player('embed',{events:{onReady:()=>{ytReady=true;applyMedia();},onStateChange:()=>{if(isHost()&&Date.now()>applyingUntil)publishCurrent();},onError:()=>banner('This YouTube video is unavailable.')}});}).catch(e=>banner(e.message));}}
 if(m.kind==='embed'){$('transport').hidden=true;$('joinAudio').hidden=true;return;}$('joinAudio').hidden=false;
 const changed=m.revision!==lastRevision;lastRevision=m.revision;
 if(m.kind==='youtube'&&ytReady){if(!isHost()||changed){applyingUntil=Date.now()+1200;if(Math.abs((yt.getCurrentTime()||0)-desired())>1.5)yt.seekTo(desired(),true);if(m.playing&&yt.getPlayerState()!==1)yt.playVideo();if(!m.playing&&yt.getPlayerState()===1)yt.pauseVideo();} $('transport').hidden=false;$('seek').disabled=!isHost();const d=yt.getDuration()||0;$('seek').value=d?1000*yt.getCurrentTime()/d:0;$('time').textContent=format(yt.getCurrentTime())+' / '+format(d);$('play').textContent=yt.getPlayerState()===1?'Ⅱ':'▶';$('play').setAttribute('aria-label',t(yt.getPlayerState()===1?'Pause':'Play'));}
 else if(m.kind!=='youtube'&&(!isHost()||changed)){applyingUntil=Date.now()+500;api.apply(desired(),m.playing);}
 }
 const format=t=>Math.floor((t||0)/60)+':'+String(Math.floor((t||0)%60)).padStart(2,'0');
 async function publish(media){if(!isHost()||!connected)return;update(await request('media',media));}
 async function publishCurrent(){if(!isHost()||!state||state.media.kind==='embed'||state.media.kind==='idle')return;const snap=state.media.kind==='youtube'&&ytReady?{time:yt.getCurrentTime(),playing:yt.getPlayerState()===1}:api.snapshot();try{await publish({...state.media,...snap});}catch(e){banner(e.message);}}
 $('demo').onclick=safe(()=>publish({kind:'demo',url:'',title:'Listening to Rain',time:0,playing:true}));
 $('linkForm').onsubmit=safe(async e=>{e.preventDefault();$('linkError').hidden=true;const button=$('linkForm').querySelector('[type=submit]');button.disabled=true;try{const m=await request('video-link',{url:$('linkInput').value});await publish({...m,time:0,playing:m.kind!=='embed'});$('linkDialog').close();}catch(e){$('linkError').hidden=false;linkErrorText=e.message;$('linkError').textContent=message(linkErrorText);}finally{button.disabled=false;}});
 request('capabilities').then(c=>{uploads=c.uploads;$('upload').hidden=!uploads;}).catch(()=>{});
 $('upload').onclick=()=>$('file').click();
 $('file').accept='video/mp4,video/webm,.mp4,.webm';
 $('file').onchange=safe(async()=>{const file=$('file').files[0];$('file').value='';if(!file||!isHost())return;const button=$('upload');button.disabled=true;try{if(file.size>200*1024*1024)throw Error('Choose a video smaller than 200 MB.');uploading=true;renderControls();const res=await fetch('/api/upload',{method:'POST',headers:{Authorization:'Bearer '+identity.token,'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});const m=await res.json();if(!res.ok)throw Error(m.error||'Upload failed.');await publish({...m,time:0,playing:true});}finally{uploading=false;button.disabled=!isHost();renderControls();}});
 const originalPlay=$('play').onclick,originalSeek=$('seek').oninput,originalVolume=$('volume').oninput;
 $('play').onclick=safe(async()=>{if(!isHost())return;if(state.media.kind==='youtube'&&ytReady){await publish({...state.media,time:yt.getCurrentTime(),playing:yt.getPlayerState()!==1});}else{originalPlay();await publishCurrent();}});
 $('seek').oninput=safe(async()=>{if(!isHost())return;if(state.media.kind==='youtube'&&ytReady){await publish({...state.media,time:yt.getDuration()*Number($('seek').value)/1000});}else{originalSeek();await publishCurrent();}});
 $('volume').oninput=()=>{originalVolume();if(ytReady)yt.setVolume(Number($('volume').value)*100);};
 $('joinAudio').onclick=safe(async()=>{if(state?.media.kind==='youtube'&&ytReady){yt.unMute();yt.playVideo();}else if(state?.media.kind==='video'){await $('video').play();}banner('');});
 $('chatForm').onsubmit=safe(async e=>{e.preventDefault();const input=$('chatInput'),text=input.value.trim();if(!text)return;await request('chat',{text});input.value='';});
 // Project recent speech beside the actual occupied seat, with a short lifetime.
 // Chat is also retained in the sidebar; bubbles are positioned by the renderer hook below.
 window.multiplayer.projectSpeech=({project,width,height})=>{if(!state)return;const recent=state.messages.filter(m=>Date.now()+serverOffset-m.at<6000).slice(-3);$('speech').replaceChildren(...recent.flatMap(m=>{const member=state.members.find(x=>x.id===m.user),seat=lectureRoom.seats.find(s=>s.id===member?.seat);if(!seat||m.user===identity.id)return[];const [x,y,z]=project([seat.x,seat.y+1.8,seat.z]);if(z<.1||x<20||x>width-20||y<45||y>height-30)return[];const el=node('span',m.name+': '+m.text,'speech-bubble');el.style.left=x+'px';el.style.top=y+'px';return[el];}));};
 setInterval(()=>{if(state){request('heartbeat',{}).catch(()=>{});if(isHost()&&connected)publishCurrent();}else lobby();},5000);
 setInterval(()=>{if(state&&!isHost())applyMedia();},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state){request('heartbeat',{}).catch(()=>{});applyMedia();}});
 const roomID=new URLSearchParams(location.search).get('room');
 if(roomID){const form=$('createRoom');$('roomTitle').required=false;joiningByInvite=true;$('roomTitle').parentElement.hidden=true;$('visibility').parentElement.hidden=true;form.onsubmit=safe(async e=>{e.preventDefault();await enter(roomID);});if(identity)enter(roomID).catch(e=>{banner(e.message);identity=null;sessionStorage.removeItem('hallIdentity');});}
 document.addEventListener('hall-language-change',()=>{
   renderControls();
   if(state){
     occupantKey='';
     delete $('chatMessages').dataset.last;
     update(state, false);
   }else renderLobby();
 });
 renderControls();
 lobby();
})();
