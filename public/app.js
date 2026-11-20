(() => {
  const $ = id => document.getElementById(id);
  const {t, message} = window.hallI18n;
  const room = window.lectureRoom;
  const viewport = $('viewport');
  const video = $('video');let iframe = $('embed');
  const idle = document.createElement('canvas'), demoCanvas = document.createElement('canvas');
  for(const surface of [idle,demoCanvas]){
    surface.width=1920;surface.height=1080;
    surface.getContext('2d').scale(2,2);
  }
  const buttons = new Map(), markers = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected=null, seated=false, dim=false;
  let yaw=0,pitch=0,drag=null;
  let source='', objectURL='', demoTime=0, demoPlaying=false, lastSlide=-1;
  const demoDuration=72;
  const seatView=(seat,pan=0,tilt=0)=>room.viewFromSeat(seat,pan,tilt,source==='embed');

  function select(seat) {
    if(window.multiplayer?.occupied(seat.id))return;
    if(selected===seat && !seated){returnToOverview();return;}
    selected=seat;seated=false;yaw=0;pitch=0;
    room.transition(seatView(seat));
    update();
  }
  for(const s of room.seats){
    if(s.col===1){
      const row=document.createElement('span');
      row.className='row-label';row.textContent=s.row;
      $('seatGrid').append(row);
    }
    const seat=document.createElement('button');
    seat.type='button';seat.className='seat';seat.textContent=s.col;
    seat.style.gridColumn=s.col+(s.col<=3?1:2);
    seat.setAttribute('aria-label',t('Seat {seat}', {seat:s.id}));
    seat.title=t('Seat {seat}', {seat:s.id});
    seat.onclick=()=>select(s);
    $('seatGrid').append(seat);buttons.set(s.id,seat);
    const marker=document.createElement('button');
    marker.type='button';marker.className='marker';marker.tabIndex=-1;
    marker.title=t('Preview {seat}', {seat:s.id});
    marker.setAttribute('aria-label',marker.title);
    marker.onclick=()=>select(s);
    $('markers').append(marker);markers.set(s.id,marker);
  }
  function update(){
    viewport.classList.toggle('seated',seated);
    $('markers').hidden=Boolean(selected||!room.supported);
    $('sceneLabel').textContent=!room.supported?t('3D hall unavailable'):seated?t('{seat} · Seated',{seat:selected.id}):selected?t('{seat} · Seat preview',{seat:selected.id}):t('Room overview');
    $('back').hidden=!selected;
    $('hint').hidden=!room.supported;
    $('hint').lastChild.textContent=' '+t(seated?'Drag or use arrow keys to look around':selected?'Previewing seat':'Choose a seat to preview the view');
    $('sit').disabled=!selected||seated;
    $('sit').querySelector('span').textContent=seated?t('Seated in {seat}',{seat:selected.id}):selected?t('Sit in {seat}',{seat:selected.id}):t('Select a seat');
    const rowName=selected && ({A:'Front row',B:'Near the front',C:'Middle row',D:'Near the back',E:'Back row'})[selected.row];
    $('seatStatus').textContent=selected?t(rowName)+' · '+selected.id+' · '+t(seated?'Seated':'Previewing'):t('5 rows · 30 seats');
    for(const [id,button] of buttons){
      const active=selected?.id===id;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }
  function sit(){
    if(!selected)return;
    if(window.multiplayer){window.multiplayer.seat(selected.id);return;}
    sitLocal();
  }
  function sitLocal(){
    if(!selected)return;
    seated=true;yaw=0;pitch=0;
    // Move from the preview toward the seat back as the viewer settles.
    pitch=source==='embed'?0:-.028;
    room.transition(seatView(selected,0,pitch),.65);
    update();
  }
  function returnToOverview(){
    if(window.multiplayer && seated)window.multiplayer.seat(null);
    selected=null;seated=false;yaw=0;pitch=0;
    room.transition(room.overview);
    update();
  }
  function startClass(){
    if(window.multiplayer){setLights(true);return;}
    if(!selected)selected=room.seats.find(s=>s.id==='C3');
    if(!seated)sit();
    setLights(true);
    if(matchMedia('(max-width: 740px)').matches){
      viewport.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
    }
  }
  $('sit').onclick=sit;
  $('back').onclick=returnToOverview;
  $('faceScreen').onclick=()=>{
    yaw=0;pitch=0;
    room.transition(selected?seatView(selected):room.overview);
  };
  window.addEventListener('resize',()=>{
    if(selected)room.transition(seatView(selected,yaw,pitch),0);
  });

  function setLights(value){
    dim=value;
    room.setDim(value);
    $('lights').setAttribute('aria-pressed',String(value));
    $('lights').querySelector('span').textContent=t(value?'Raise lights':'Dim lights');
  }
  $('lights').onclick=()=>setLights(!dim);
  const rainTrack=$('rainTrack'), rainButton=$('rainAudio');
  rainTrack.volume=.28;
  function updateRain(){
    rainButton.setAttribute('aria-pressed',String(!rainTrack.paused));
    rainButton.querySelector('span').textContent=t(rainTrack.paused?'Rain off':'Rain on');
  }
  rainTrack.addEventListener('playing',updateRain);
  rainTrack.addEventListener('pause',updateRain);
  rainButton.onclick=()=>{
    if(!rainTrack.paused){rainTrack.pause();return;}
    rainTrack.play().catch(error=>{
      if(error.name!=='AbortError')notice('Rain audio is unavailable.');
      updateRain();
    });
  };

  function look(dx,dy){
    yaw=Math.max(-.43,Math.min(.43,yaw+dx));
    pitch=Math.max(-.22,Math.min(.20,pitch+dy));
    room.transition(seatView(selected,yaw,pitch),0);
  }
  viewport.addEventListener('pointerdown',event=>{
    if(!seated||!room.supported||event.button!==0||event.target.closest('button,iframe'))return;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    look((drag.x-event.clientX)*.003,(event.clientY-drag.y)*.003);
    drag.x=event.clientX;drag.y=event.clientY;
  });
  viewport.addEventListener('lostpointercapture',()=>{drag=null;viewport.classList.remove('dragging');});
  document.addEventListener('keydown',event=>{
    if($('linkDialog').open||event.target.closest('input,button,textarea,select'))return;
    if(event.key==='Escape'&&selected)returnToOverview();
    if(!seated||!room.supported)return;
    const direction={ArrowLeft:[-.045,0],ArrowRight:[.045,0],ArrowUp:[0,.04],ArrowDown:[0,-.04]}[event.key];
    if(direction){event.preventDefault();look(...direction);}
  });

  let noticeText='', sourceTitle='', idleMessage='';
  function updateSourceTitle(){
    $('courseName').textContent=t(sourceTitle);
    if(source==='embed') iframe.title=t('{title} on the lecture hall screen',{title:t(sourceTitle)});
  }

  function notice(text=''){
    noticeText=text;
    $('notice').textContent=message(text);
    $('notice').hidden=!text;
  }
  function setSource(kind,title){
    source=kind;
    video.pause();video.removeAttribute('src');video.load();
    video.removeAttribute('crossorigin');
    iframe.removeAttribute('src');
    if(objectURL){URL.revokeObjectURL(objectURL);objectURL='';}
    demoPlaying=false;demoTime=0;lastSlide=-1;
    iframe.hidden=true;
    $('faceScreen').hidden=kind!=='embed';
    $('transport').hidden=kind==='embed'||!kind;
    sourceTitle=title;
    updateSourceTitle();
    notice();
    drawIdle();
    room.setEmbedded(kind==='embed');
    syncTransport();
  }
  function playVideo(){
    notice();
    video.play().catch(error=>{
      if(source==='video'&&error.name!=='AbortError'){
        notice(error.name==='NotAllowedError'?'Press Play to start.':'This video could not be played.');
      }
    });
  }
  function openVideo(url,title,file){
    setSource('video',title);
    if(file){objectURL=URL.createObjectURL(file);url=objectURL;}
    else video.crossOrigin='anonymous';
    video.src=url;
    startClass();
    playVideo();
  }
  $('upload').onclick=()=>$('file').click();
  $('file').onchange=()=>{
    const file=$('file').files[0];
    $('file').value='';
    if(!file)return;
    if(file.type!=='video/mp4'&&!/\.mp4$/i.test(file.name)){notice('Choose an MP4 file.');return;}
    openVideo('',file.name,file);
  };
  function projectionFailed(){
    video.pause();
    drawIdle('Video unavailable');
    notice('This video cannot be projected. Try a local MP4.');
  }
  video.addEventListener('loadeddata',()=>{
    if(source==='video')room.setProjection(video,projectionFailed);
  });
  video.addEventListener('error',()=>{
    if(source==='video'&&video.hasAttribute('src'))notice('This video could not be loaded.');
  });

  function openEmbed(url,title){
    setSource('embed',title);
    iframe.title=t('{title} on the lecture hall screen',{title:t(title)});
    iframe.src=url;
    if(seated)$('faceScreen').click();
    startClass();
  }

  let linkLookup=null;
  const linkSubmit=$('linkForm').querySelector('[type=submit]');
  $('linkDialog').addEventListener('close',()=>{
    linkLookup?.abort();
    linkLookup=null;
    linkSubmit.disabled=false;
  });
  $('openLink').onclick=()=>{$('linkError').hidden=true;$('linkDialog').showModal();$('linkInput').focus();};
  $('closeLink').onclick=()=>$('linkDialog').close();
  $('linkForm').onsubmit=async event=>{
    event.preventDefault();
    if(linkLookup)return;
    const linkError=$('linkError');
    linkError.hidden=true;
    let originalLink;
    try{
      const input=$('linkInput').value.trim();
      const pastedUrl=input.match(/https?:\/\/[^\s<>"，。！？；]+/i)?.[0] || input;
      const url=new URL(pastedUrl);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();
      const host=url.hostname.replace(/^(www\.|m\.)/,'');
      let id='';
      if(host==='youtu.be')id=url.pathname.split('/')[1];
      else if(['youtube.com','youtube-nocookie.com'].includes(host)){
        id=url.searchParams.get('v')||(/^\/(?:embed|shorts|live)\//.test(url.pathname)?url.pathname.split('/')[2]:'');
      }
      if(/^[\w-]{11}$/.test(id||'')){
        if(location.protocol==='file:'){
          linkError.textContent='Open the web preview to use this link.';
          linkError.hidden=false;
          return;
        }
        openEmbed('https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0&fs=0&hl=en','YouTube video');
      }else if(['douyin.com','v.douyin.com','open.douyin.com','jingxuan.douyin.com','iesdouyin.com',
        'xiaohongshu.com','rednote.com','xhslink.com','xhslink.cn'].includes(host)){
        originalLink=url.href;
        if(location.protocol==='file:')throw Error('Open the live site to use this link.');
        const lookup=new AbortController();
        linkLookup=lookup;
        linkSubmit.disabled=true;
        try{
          const response=await fetch('/api/video-link',{method:'POST',body:url.href,signal:lookup.signal});
          if(!response.ok)throw Error('This video could not be loaded. Try a fresh public video link.');
          const result=await response.json();
          if(lookup.signal.aborted || !$('linkDialog').open)return;
          if(result.kind==='embed')openEmbed(result.url,result.title);
          else openVideo(result.url,result.title);
        }finally{
          if(linkLookup===lookup){
            linkLookup=null;
            linkSubmit.disabled=false;
          }
        }
      }else if(url.protocol==='https:' && /\.mp4$/i.test(url.pathname)){
        openVideo(url.href,decodeURIComponent(url.pathname.split('/').pop()));
      }else throw Error();
      $('linkDialog').close();
    }catch(error){
      if(error.name==='AbortError' || !$('linkDialog').open)return;
      linkError.textContent=error.message && error.name==='Error' ? error.message :
        'Paste a YouTube, Douyin, Xiaohongshu, or HTTPS MP4 link.';
      if(originalLink){
        const original=document.createElement('a');
        original.href=originalLink;
        original.target='_blank';
        original.rel='noopener noreferrer';
        original.textContent='Open original';
        linkError.append(' ',original);
      }
      linkError.hidden=false;
    }
  };

  const slides=[
    {id:'01',title:'What do you hear when it rains?',desc:'A short lesson on sound and space',tag:'OBSERVE',points:['Raindrops strike different surfaces','Window glass softens high frequencies','Indoors, those sounds blend together']},
    {id:'02',title:'A window is a sound filter.',desc:'Glass reflects, absorbs, and transmits sound.',tag:'LISTEN',points:['Outside: sharper individual drops','Inside: a softer, steady wash','Open the window and hear the change']},
    {id:'03',title:'Listen for distance.',desc:'Close your eyes and listen for ten seconds.',tag:'TRY',points:['Near: drops tapping the window','Midrange: rain on leaves and pavement','Far: the sounds merge into a wash']},
  ];
  function drawIdle(message=''){
    idleMessage=message;
    const ctx=idle.getContext('2d');
    const grad=ctx.createRadialGradient(500,235,40,500,235,570);
    grad.addColorStop(0,'#383048');grad.addColorStop(1,'#181725');
    ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    ctx.strokeStyle='#c5aee9';ctx.lineWidth=4;ctx.lineCap='round';
    ctx.strokeRect(446,125,68,42);
    ctx.beginPath();
    ctx.moveTo(480,167);ctx.lineTo(480,181);
    ctx.moveTo(463,181);ctx.lineTo(497,181);
    ctx.stroke();
    ctx.textAlign='center';
    ctx.fillStyle='#e1d8ef';ctx.font='700 76px Georgia, serif';
    ctx.fillText(t('Private Lecture Hall'),480,284,850);
    ctx.fillStyle='#d0bfef';ctx.font='600 23px monospace';
    ctx.fillText(t('HALL 01'),480,349);
    if(message){
      ctx.font='28px system-ui, sans-serif';ctx.fillText(t(message),480,419);
    }
    room.setProjection(idle);
  }
  function renderSlide(){
    const index=Math.min(2,Math.floor(demoTime/24));
    if(index===lastSlide)return;
    lastSlide=index;
    const slide=slides[index],ctx=demoCanvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,960,540);
    grad.addColorStop(0,'#211b31');grad.addColorStop(1,'#39314c');
    ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    ctx.strokeStyle='#6b5985';ctx.lineWidth=2;ctx.strokeRect(32,32,896,476);
    ctx.fillStyle='#cbb7f2';ctx.font='600 20px monospace';ctx.fillText(t('PRIVATE LECTURE HALL  /  MINI LESSON'),65,87);
    ctx.fillStyle='#f5edf9';ctx.font='700 46px system-ui, sans-serif';ctx.fillText(t(slide.title),65,174,830);
    ctx.fillStyle='#d3c4e6';ctx.font='26px system-ui, sans-serif';ctx.fillText(t(slide.desc),66,228,830);
    ctx.font='24px system-ui, sans-serif';
    slide.points.forEach((point,i)=>{
      ctx.fillStyle='#b197ea';ctx.fillRect(68,302+i*49,8,8);
      ctx.fillStyle='#ede2f5';ctx.fillText(t(point),93,313+i*49,505);
    });
    ctx.strokeStyle='#8771a8';ctx.lineWidth=2;
    for(let i=0;i<3;i++){
      ctx.beginPath();
      for(let x=630;x<=884;x++){
        const y=344+i*30+Math.sin(x*.048+i)*Math.sin((x-630)/254*Math.PI)*15;
        if(x===630)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.fillStyle='#b7a3d9';ctx.font='600 17px monospace';ctx.fillText(t(slide.tag),67,469);ctx.fillText(slide.id+' / 03',800,469);
    room.setProjection(demoCanvas);
  }
  $('demo').onclick=()=>{
    setSource('demo','Demo · Listening to Rain');
    renderSlide();startClass();demoPlaying=true;syncTransport();
  };
  const format=value=>{
    const seconds=Math.floor(value||0);
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  };
  function syncTransport(){
    const demo=source==='demo';
    const duration=demo?demoDuration:Number.isFinite(video.duration)?video.duration:0;
    const current=demo?demoTime:video.currentTime;
    const playing=demo?demoPlaying:source==='video'&&!video.paused&&!video.ended;
    $('seek').value=duration?Math.round(1000*current/duration):0;
    $('seek').disabled=!duration || (window.multiplayer && !window.multiplayer.isHost());
    $('time').textContent=format(current)+' / '+format(duration);
    $('play').setAttribute('aria-label',t(playing?'Pause':'Play'));
    $('playIcon').setAttribute('href',playing?'#icon-pause':'#icon-play');
    $('volume').disabled=demo;
  }
  $('play').onclick=()=>{
    if(source==='demo'){
      if(demoTime>=demoDuration)demoTime=0;
      demoPlaying=!demoPlaying;syncTransport();
    }else if(source==='video'){
      if(video.paused||video.ended)playVideo();
      else video.pause();
    }
  };
  $('seek').oninput=()=>{
    const progress=Number($('seek').value)/1000;
    if(source==='demo'){demoTime=progress*demoDuration;renderSlide();}
    else if(source==='video'&&Number.isFinite(video.duration))video.currentTime=progress*video.duration;
    syncTransport();
  };
  $('volume').oninput=()=>{video.volume=Number($('volume').value);};
  video.volume=Number($('volume').value);
  for(const event of ['play','pause','ended','timeupdate','loadedmetadata','emptied','durationchange']){
    video.addEventListener(event,syncTransport);
  }

  let lastDemoSecond=-1;
  room.onFrame(({width,height,project,dt,playerCorners,playerObstructed})=>{
    window.multiplayer?.projectSpeech?.({project,width,height});
    if(source==='embed'){
      const corners=playerCorners.map(project);
      // The viewport crops the player naturally; the room's depth-tested
      // transparent screen handles furniture occlusion without hiding playback.
      const visible=room.supported && corners.every(([, ,z])=>z>.05);
      if(visible){
        // Map the iframe into the camera's homogeneous coordinates, just like the 3D geometry.
        const [[x0,y0,z0],[x1,y1,z1],,[x3,y3,z3]]=corners;
        const origin=[x0*z0,y0*z0,0,z0];
        const horizontal=[x1*z1,y1*z1,0,z1].map((value,i)=>(value-origin[i])/960);
        const vertical=[x3*z3,y3*z3,0,z3].map((value,i)=>(value-origin[i])/540);
        iframe.style.transform='matrix3d('+[...horizontal,...vertical,0,0,1,0,...origin].map(n=>n/z0).join(',')+')';
      }
      iframe.hidden=!visible;
    }
    if(!$('markers').hidden){
      for(const s of room.seats){
        const [mx,my,z]=project([s.x,s.y+1.24,s.z+.32]);
        const marker=markers.get(s.id);
        marker.hidden=z<=.12||mx<6||mx>width-6||my<42||my>height-14;
        marker.style.left=mx+'px';marker.style.top=my+'px';
      }
    }
    if(demoPlaying){
      demoTime=Math.min(demoDuration,demoTime+dt);
      if(demoTime>=demoDuration){demoPlaying=false;syncTransport();}
      renderSlide();
      const second=Math.floor(demoTime);
      if(second!==lastDemoSecond){lastDemoSecond=second;syncTransport();}
    }
  });
  window.classroomAPI={
    select, notice,
    disposeYouTube(player){const replacement=iframe.cloneNode(false);replacement.removeAttribute('src');replacement.hidden=true;iframe.before(replacement);player.destroy();iframe=replacement;},
    seat(id){if(id){selected=room.seats.find(s=>s.id===id);sitLocal();}else{selected=null;seated=false;room.transition(room.overview);update();}},
    occupants(members,self){for(const s of room.seats){const m=members.find(m=>m.seat===s.id&&m.id!==self);buttons.get(s.id).disabled=!!m;buttons.get(s.id).classList.toggle('occupied',!!m);buttons.get(s.id).title=m?m.name+' · '+s.id:t('Seat {seat}', {seat:s.id});markers.get(s.id).disabled=!!m;markers.get(s.id).classList.toggle('occupied',!!m);}room.setOccupants(members.filter(m=>m.id!==self));},
    open(media){if(media.kind==='demo'){setSource('demo',media.title);renderSlide();startClass();}else if(media.kind==='video')openVideo(media.url,media.title);else if(media.kind==='embed')openEmbed(media.url,media.title);else if(media.kind==='youtube')openEmbed('https://www.youtube-nocookie.com/embed/'+media.url+'?enablejsapi=1&playsinline=1&rel=0&origin='+encodeURIComponent(location.origin),media.title);else setSource('', '');},
    apply(time,playing){if(source==='demo'){demoTime=Math.min(demoDuration,time);demoPlaying=playing&&time<demoDuration;renderSlide();syncTransport();}else if(source==='video'){if(video.readyState>=1&&Math.abs(video.currentTime-time)>1.2)video.currentTime=Math.min(Number.isFinite(video.duration)?video.duration:time,time);if(playing&&video.paused)playVideo();else if(!playing&&!video.paused)video.pause();}},
    snapshot(){return {time:source==='demo'?demoTime:video.currentTime||0,playing:source==='demo'?demoPlaying:!video.paused,duration:source==='demo'?demoDuration:video.duration||0};},
    stop(){setSource('','');setLights(false);},
  };
  document.addEventListener('hall-language-change',()=>{
    update();
    setLights(dim);
    updateRain();
    notice(noticeText);
    updateSourceTitle();
    syncTransport();
    if(source==='demo'){
      lastSlide=-1;
      renderSlide();
    }else if(source!=='video'||idleMessage){
      drawIdle(idleMessage);
    }
    for(const [id,button] of buttons){
      const label=t('Seat {seat}',{seat:id});
      button.setAttribute('aria-label',label);
      if(!button.disabled)button.title=label;
      const markerLabel=t('Preview {seat}',{seat:id});
      markers.get(id).title=markerLabel;
      markers.get(id).setAttribute('aria-label',markerLabel);
    }
  });
  drawIdle();
  update();
  if(!room.supported){
    for(const id of ['upload','openLink','demo'])$(id).disabled=true;
    notice('This browser could not load the 3D hall.');
  }
})();
