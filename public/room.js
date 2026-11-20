/* A small, dependency-free renderer for the fixed lecture hall. */
(() => {
  const canvas = document.querySelector('#room');
  const viewport = canvas.parentElement;
  const gl = canvas.getContext('webgl', {antialias: true, alpha: true});
  const rows = 'ABCDE';
  const overview = {eye: [2.25, 5.05, 9.55], target: [-.55, 1.95, -4.5], fov: 55};
  const screen = {left:-3.35, top:4.82, width:6.7, height:3.76875, z:-6.568};
  const player = {
    left:screen.left+screen.width*.02, right:screen.left+screen.width*.98,
    bottom:screen.top-screen.height*.98, top:screen.top-screen.height*.02,
  };
  const playerCorners = [[player.left,player.top,screen.z],[player.right,player.top,screen.z],
    [player.right,player.bottom,screen.z],[player.left,player.bottom,screen.z]];
  const seats = [...rows].flatMap((row, r) => [-4.35,-2.92,-1.49,1.49,2.92,4.35].map((x,c) => ({
    id: row + (c+1), row, col: c+1, x, y: .36*r, z: -3.35+2.35*r,
  })));
  const subtract = (a,b) => a.map((v,i)=>v-b[i]);
  const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
  const unit = v => v.map(n=>n/Math.hypot(...v));
  const cross = ([a,b,c],[d,e,f])=>[b*f-c*e,c*d-a*f,a*e-b*d];
  const lerp = (a,b,t)=>a+(b-a)*t;

  function viewFromSeat(s,yaw=0,pitch=0,fitPlayer=false) {
    const eye = [s.x, s.y+1.42, s.z+.22];
    const target = [0, 2.85, -6.58];
    const [dx,dy,dz] = subtract(target,eye);
    const angle = Math.atan2(dx,-dz)+yaw;
    const height = Math.atan2(dy,Math.hypot(dx,dz))+pitch;
    // Keep the wall screen readable from every seat by changing the lens,
    // never its world position or the viewer's seat. Leave room around it.
    let fov;
    {
      const forward=unit([dx,dy,dz]),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
      const aspect=viewport.clientWidth/viewport.clientHeight;
      const required=Math.max(...playerCorners.map(point=>{
        const ray=subtract(point,eye),depth=dot(ray,forward);
        return Math.max(Math.abs(dot(ray,right))/aspect,Math.abs(dot(ray,up)))/depth;
      }));
      fov=Math.atan(required/.78)*360/Math.PI;
    }
    return {eye,target:[eye[0]+Math.sin(angle)*Math.cos(height),eye[1]+Math.sin(height),eye[2]-Math.cos(angle)*Math.cos(height)],fov};
  }

  const vertices = [], boxes = [];
  let geometryBuffer, baseVertices=0, baseBoxes=0;
  function face(points,normal,color,kind) {
    const rgb = color.match(/../g).map(c=>parseInt(c,16)/255);
    for (const n of [0,1,2,0,2,3]) vertices.push(...points[n],...normal,...rgb,kind);
  }
  function box(x,y,z,w,h,d,color,kind=0) {
    const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;
    if(g>screen.z)boxes.push({left:a,right:b,bottom:c,top:e,near:f,far:g});
    face([[a,e,f],[a,e,g],[b,e,g],[b,e,f]],[0,1,0],color,kind);
    face([[a,c,g],[a,c,f],[b,c,f],[b,c,g]],[0,-1,0],color,kind);
    face([[a,c,g],[b,c,g],[b,e,g],[a,e,g]],[0,0,1],color,kind);
    face([[b,c,f],[a,c,f],[a,e,f],[b,e,f]],[0,0,-1],color,kind);
    face([[b,c,g],[b,c,f],[b,e,f],[b,e,g]],[1,0,0],color,kind);
    face([[a,c,f],[a,c,g],[a,e,g],[a,e,f]],[-1,0,0],color,kind);
  }
  // Test the space between the eye and the player against the room geometry.
  function playerObstructed([x,y,z]){
    const distance=z-screen.z;
    if(distance<=0)return true;
    const edge=(start,end,depth)=>lerp(start,end,(depth-screen.z)/distance);
    return boxes.some(box=>{
      const near=Math.max(box.near,screen.z),far=Math.min(box.far,z);
      if(near>=far)return false;
      return box.right>Math.min(edge(player.left,x,near),edge(player.left,x,far))
        && box.left<Math.max(edge(player.right,x,near),edge(player.right,x,far))
        && box.top>Math.min(edge(player.bottom,y,near),edge(player.bottom,y,far))
        && box.bottom<Math.max(edge(player.top,y,near),edge(player.top,y,far));
    });
  }
  function build() {
    // Tiered risers and thin inset aisle lights.
    box(0,-.19,1,12.8,.36,17.3,'50414c',3);
    for(let r=1;r<=4;r++){
      const start=-2.27+(r-1)*2.35;
      box(0,(r-.5)*.36,(9.85+start)/2,12.8,.36,9.85-start,'53454e',3);
      box(0,r*.36-.022,start-.013,12.76,.037,.032,'7f6460');
      for(const x of [-5.68,-.61,.61,5.68]) box(x,r*.36-.078,start-.022,.28,.038,.04,'c69a70',2);
    }
    // Plaster, wainscoting and ceiling.
    box(0,3.2,-6.94,12.8,6.5,.29,'524653',3);
    box(0,.5,-6.76,12.8,1,.13,'423339',1);
    box(6.42,3.15,1.4,.25,6.45,17,'514655',3);
    box(6.27,1.13,1.4,.11,2.29,17,'473b41',1);
    box(-6.43,3.1,1.4,.25,6.5,17,'4a414f',3);
    box(-6.26,.97,1.4,.12,1.99,17,'493b47',1);
    box(0,6.05,1.4,12.8,.22,17,'39323e',3);
    for(const z of [-5,-.4,4.2,8.8]) {
      box(0,5.79,z,12.8,.32,.2,'413746');
      box(6.24,3.75,z,.16,4.1,.22,'5d4e5c');
      box(-6.24,3.75,z,.16,4.1,.22,'5d4e5c');
    }
    for (const z of [-4.25,-1.78,.69,3.16,5.63,8.1]) {
      // The window shader paints rain, trees, and distant lights.
      face([[-6.27,2.06,z-1.13],[-6.27,2.06,z+1.13],[-6.27,5.36,z+1.13],[-6.27,5.36,z-1.13]],[1,0,0],'8494b7',4);
      for(const u of [-1.16,0,1.16]) box(-6.19,3.71,z+u,.14,3.44,.085,'343140');
      for(const h of [2.04,3.03,5.37]) box(-6.18,h,z,.15,.075,2.4,'343140');
      box(-6.13,2.01,z,.28,.09,2.42,'716279');
    }
    // Dark blackboard and a framed projection surface.
    box(0,2.93,-6.72,10.42,4.22,.15,'946d52',1);
    box(0,2.93,-6.62,10.26,4.04,.07,'303b39',3);
    box(0,2.9356,-6.59,6.88,3.96,.02,'16151d');
    const {left,top,width,height,z}=screen;
    face([[left,top,z],[left+width,top,z],[left+width,top-height,z],[left,top-height,z]],
      [0,0,1],'16151d',5);
    box(0,4.89,-6.52,7.01,.112,.14,'a99688');
    box(0,1.00,-6.53,6.91,.067,.12,'ad9585');
    box(0,.79,-6.53,10.55,.08,.22,'a27a5f',1);
    box(-4.2,.849,-6.53,.19,.031,.048,'c2ac9b');
    box(0,.13,-5.82,11.3,.26,2.15,'765546',1);
    box(0,.25,-4.74,11.3,.04,.065,'a87c5e',1);
    // Lectern, microphone and acoustic panels.
    box(4.54,.76,-5.13,.72,1.06,.58,'78503a',1);
    box(4.54,1.31,-5.13,.91,.09,.77,'a47452',1);
    box(4.34,1.45,-5.27,.027,.23,.026,'292831');
    box(4.39,1.57,-5.27,.14,.045,.055,'33303b');
    for(const z of [-3.85,-.2,3.4,7]) {
      box(6.23,3.52,z,.24,.54,.20,'866b67');
      box(6.098,3.55,z,.06,.30,.15,'f0bd8a',2);
      box(6.25,3.5,z-.57,.08,1.72,.46,'3b3442',3);
    }
    for(const z of [-3.8,.65,5.1]) {
      for(const x of [-3.56,3.56]) {
        box(x,5.64,z,.24,.16,1.69,'49404d');
        box(x,5.547,z,.154,.03,1.47,'d9bcab',2);
      }
    }
    for(const s of seats) {
      const {x,y,z}=s;
      const wood = ['9e6444','946146','a66d4e','a87351','9f6848'][(s.col+2*rows.indexOf(s.row))%5];
      // Desk in front of the chair.
      for(const off of [-.52,.52]) {
        box(x+off,y+.39,z-.75,.07,.78,.075,'30313a');
        box(x+off,y+.028,z-.72,.11,.054,.59,'34323b');
      }
      box(x,y+.80,z-.78,1.34,.102,.61,wood,1);
      box(x,y+.715,z-.93,1.21,.10,.07,'805238',1);
      box(x,y+.857,z-.498,1.31,.019,.032,'b3805d',1);
      // Molded wooden back, aubergine seat and dark metal frame.
      for(const off of [-.37,.37]){
        box(x+off,y+.30,z+.23,.075,.60,.084,'32313b');
        box(x+off,y+.39,z-.09,.062,.74,.075,'32313b');
        box(x+off,y+.66,z+.05,.107,.053,.48,'775643',1);
      }
      box(x,y+.456,z+.035,.83,.106,.60,'4e3b49',3);
      box(x,y+.526,z+.038,.76,.055,.55,'62505e',3);
      box(x,y+.83,z+.32,.88,.57,.104,wood,1);
      box(x,y+1.127,z+.32,.84,.035,.11,'c1916d',1);
      box(x,y+.841,z+.381,.25,.045,.025,'b08c6b',1);
    }
  }

  let eye=overview.eye.slice(), target=overview.target.slice(), fov=overview.fov;
  let destination=overview, from=overview, elapsed=0, duration=0;
  let width=0,height=0,ambient=1,desiredAmbient=1, previous=0;
  let onFrame=()=>{}, program, uniforms, screenTexture;
  let embedded=false, screenSource=null, screenFit=[1,1], uploadedTime=NaN, uploadAt=-Infinity, projectionError;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function transition(view,seconds=.94) {
    from={eye:eye.slice(),target:target.slice(),fov};
    destination=view;
    elapsed=0;
    duration=motion.matches?0:seconds;
  }
  function shader(type,source){
    const result=gl.createShader(type);
    gl.shaderSource(result,source);gl.compileShader(result);
    if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  }
  function init() {
    if(!gl) return;
    build();baseVertices=vertices.length;baseBoxes=boxes.length;
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 position, normal, color;
      attribute float material;
      uniform vec3 eye, right, up, forward;
      uniform vec2 scale;
      varying vec3 p, n, c;
      varying float kind, depth;
      void main(){
        vec3 v=position-eye;
        depth=dot(v,forward);
        gl_Position=vec4(dot(v,right)*scale.x,dot(v,up)*scale.y,depth*1.003-.085,depth);
        p=position;n=normal;c=color;kind=material;
      }
    `));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision highp float;
      varying vec3 p,n,c;
      varying float kind,depth;
      uniform float dim, time;
      uniform sampler2D screenImage;
      uniform vec4 screenBounds;
      uniform vec2 screenFit;
      uniform bool embedded;
      float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        float surface=floor(kind+.5);
        if(surface==5.){
          vec2 uv=(vec2(p.x,-p.y)-screenBounds.xy)/screenBounds.zw;
          if(embedded){
            // A depth-tested opening onto the DOM player beneath the room.
            // Foreground geometry still writes opaque color and depth.
            bool inside=all(greaterThanEqual(uv,vec2(.02))) && all(lessThanEqual(uv,vec2(.98)));
            gl_FragColor=inside?vec4(0.):vec4(.018,.016,.025,1.);
            return;
          }
          uv=(uv-.5)*screenFit+.5;
          if(any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))){
            gl_FragColor=vec4(.018,.016,.025,1.);
          }else{
            gl_FragColor=texture2D(screenImage,uv);
          }
          return;
        }
        vec3 color=c;
        float spec=0.;
        float noise=hash(floor(p.xz*500.+p.y*133.));
        if(surface==1.){
          float grain=sin(p.z*95.+p.y*133.+sin(p.x*5.)*2.+sin(p.x*19.+p.z*11.));
          color*=.94+grain*.065+noise*.07;
          spec=.045;
        }
        if(surface==3.) color*=.95+.12*noise;
        float ceiling=max(0.,n.y*.22-n.z*.04+n.x*.075);
        float left=exp(-abs(p.x+6.2)*.38)*.21;
        float pool=pow(.5+.5*cos((p.z+3.8)*1.41),3.)*.13;
        float base=(.42+ceiling+pool+spec)*dim;
        vec3 tint=vec3(1.1,.92,.91)*base+vec3(.31,.43,.76)*left;
        tint+=vec3(.10,.07,.16)*exp(-abs(p.z+6.6)*.5);
        tint*=.72+.28*smoothstep(0.,.55,p.y);
        color*=tint;
        if(surface==2.) color=c*(.69+.28*dim);
        if(surface==4.){
          float y=(p.y-2.05)/3.3;
          float z=p.z;
          vec3 sky=mix(vec3(.25,.24,.39),vec3(.105,.12,.25),y);
          float ridge=.26+sin(z*1.4)*.095+cos(z*2.7)*.035;
          sky=mix(vec3(.104,.108,.193),sky,smoothstep(ridge,ridge+.035,y));
          float tree=abs(fract(z*1.55+.13)-.5);
          float treeTop=.21+.37*hash(vec2(floor(z*1.55+.13),5.));
          float branch=max(0.,treeTop-y)*(.54+sin(y*91.)*.12);
          if(tree<branch && y<treeTop) sky*=.55;
          float lamp=abs(fract(z*.81+.21)-.5)+abs(y-.215)*4.;
          sky+=vec3(.45,.29,.18)*exp(-lamp*28.);
          vec2 rain=vec2(z*45.-y*3.,y*6.+time*1.8);
          float streak=step(.977,hash(vec2(floor(rain.x),floor(rain.y))))*(1.-smoothstep(.025,.31,fract(rain.y)))*(1.-smoothstep(.08,.21,abs(fract(rain.x)-.5)));
          sky+=vec3(.22,.27,.38)*streak;
          color=sky*(.85+.15*dim);
        }
        vec3 air=vec3(.105,.09,.15)*(.60+.40*dim);
        color=mix(color,air,min(.26,depth*.017));
        gl_FragColor=vec4(color,1.);
      }
    `));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=geometryBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    for(const [name,size,offset] of [['position',3,0],['normal',3,3],['color',3,6],['material',1,9]]) {
      const loc=gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset*4);
    }
    uniforms=Object.fromEntries(['eye','right','up','forward','scale','dim','time','screenImage','screenBounds','screenFit','embedded']
      .map(name=>[name,gl.getUniformLocation(program,name)]));
    screenTexture=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,screenTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([22,21,29,255]));
    gl.uniform1i(uniforms.screenImage,0);
    gl.uniform4f(uniforms.screenBounds,screen.left,-screen.top,screen.width,screen.height);
    gl.enable(gl.DEPTH_TEST);
  }
  function setProjection(source,onError){
    screenSource=source;
    projectionError=onError;
    uploadedTime=NaN;
    uploadAt=-Infinity;
  }
  function updateProjection(now){
    if(!screenSource)return;
    const video=screenSource instanceof HTMLVideoElement;
    const time=video?screenSource.currentTime:0;
    if(time===uploadedTime || (video && (screenSource.readyState<2 || now-uploadAt<30)))return;
    const aspect=video?screenSource.videoWidth/screenSource.videoHeight:screenSource.width/screenSource.height;
    if(!Number.isFinite(aspect)||aspect<=0)return;
    const ratio=aspect/(screen.width/screen.height);
    try{
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,screenSource);
    }catch(error){
      screenSource=null;
      projectionError?.(error);
      return;
    }
    screenFit=[Math.max(1,1/ratio),Math.max(1,ratio)];
    uploadedTime=time;
    uploadAt=now;
  }
  let supported=false;
  try {init(); supported=Boolean(gl);} catch(error){console.error(error);}
  function draw(now) {
    const dt=Math.min((now-previous)/1000,.05);
    previous=now;
    elapsed+=dt;
    const t=duration?Math.min(1,elapsed/duration):1;
    const eased=t*t*(3-2*t);
    eye=from.eye.map((v,i)=>lerp(v,destination.eye[i],eased));
    target=from.target.map((v,i)=>lerp(v,destination.target[i],eased));
    fov=lerp(from.fov,destination.fov,eased);
    ambient=lerp(ambient,desiredAmbient,Math.min(1,dt*3.3));
    width=viewport.clientWidth;height=viewport.clientHeight;
    const forward=unit(subtract(target,eye)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    const sy=1/Math.tan(fov*Math.PI/360),sx=sy*height/Math.max(width,1);
    const project=point=>{
      const v=subtract(point,eye),z=dot(v,forward);
      return [width/2*(1+dot(v,right)*sx/z),height/2*(1-dot(v,up)*sy/z),z];
    };
    if(supported){
      // Match Retina displays; bound the framebuffer on very large screens.
      const ratio=Math.min(devicePixelRatio||1,3,Math.sqrt(8000000/(width*height)));
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      gl.clearColor(.13,.109,.167,1);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      for(const [name,value] of Object.entries({eye,right,up,forward})) gl.uniform3fv(uniforms[name],value);
      gl.uniform2f(uniforms.scale,sx,sy);
      gl.uniform1f(uniforms.dim,ambient);
      gl.uniform1i(uniforms.embedded,embedded?1:0);
      gl.uniform1f(uniforms.time,motion.matches?0:now/1000);
      updateProjection(now);
      gl.uniform2fv(uniforms.screenFit,screenFit);
      gl.drawArrays(gl.TRIANGLES,0,vertices.length/10);
    }
    onFrame({project,dt,width,height,playerCorners,playerObstructed:()=>playerObstructed(eye)});
    requestAnimationFrame(draw);
  }
  function setOccupants(members){
    if(!supported)return;vertices.length=baseVertices;boxes.length=baseBoxes;
    for(const m of members){const s=seats.find(s=>s.id===m.seat);if(!s)continue;
      const {x,y,z}=s;const palette=['a294cd','87acaa','bc947c','93a9c4'];const color=palette[m.id.charCodeAt(0)%4];
      // Seated low-poly silhouette. Real geometry shares the scene depth buffer.
      box(x,y+.92,z+.02,.46,.64,.30,color,3);
      box(x,y+1.40,z+.01,.29,.32,.28,'d8c5b7',3);
      box(x,y+1.56,z+.025,.30,.085,.29,color,3);
      for(const dx of [-.29,.29]){box(x+dx,y+.85,z-.03,.13,.43,.16,color,3);box(x+dx,y+.68,z-.20,.13,.14,.38,color,3);}
      for(const dx of [-.14,.14]){box(x+dx,y+.52,z-.22,.19,.19,.53,'484254',3);box(x+dx,y+.29,z-.43,.17,.42,.17,'484254',3);}
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,geometryBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
  }
  window.lectureRoom={setOccupants,seats,overview,viewFromSeat,transition,supported,setProjection,
    setEmbedded:value=>{embedded=Boolean(value);},
    setDim:value=>{desiredAmbient=value?.47:1;},
    onFrame:callback=>{onFrame=callback;},
  };
  requestAnimationFrame(draw);
})();
