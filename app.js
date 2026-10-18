(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.Cesium;
  if (!C || !window.Optics || !window.AstroDirections || !window.LensControls || !window.SkyShell) {
    $('status').textContent = 'Required script failed to load. Check CDN access and refresh.';
    $('status').classList.add('error');
    return;
  }
  const L = window.LensControls;
  const S = window.SkyShell;
  const rad = C.Math.toRadians;
  const deg = C.Math.toDegrees;
  const DAY_SKY=C.Color.fromCssColorString('#76b7e2');
  const clamp = (x, a, b) => Math.max(a,Math.min(b,x));
  const fmt = (x,d=1) => Number.isFinite(x) ? x.toLocaleString('en-AU',{maximumFractionDigits:d,minimumFractionDigits:d}) : '∞';
  const presets = {d850:[35.9,23.9,.03],fe:[36,24,.03], 'nikon-dx':[23.5,15.6,.02],p67:[70,56,.05]};
  const tzHours = -new Date().getTimezoneOffset()/60;
  const defaultState = () => ({
    lat:-35.3000,lon:149.1250,ground:575,agl:1.6,
    heading:90,pitch:0,roll:0,extent:300,
    cameraPreset:'d850',sensorWidth:35.9,sensorHeight:23.9,
    focal:50,aperture:5.6,focus:10,coc:.03,
    showFrustum:true,showDof:true,showFocus:true,showAxis:true,
    showSun:true,showMoon:true,showCore:true,showTrajectories:true,
    celestialShellScale:S.DEFAULT_SCALE,celestialThroughTerrain:true,
    aimTarget:'sun',targetLat:-35.3000,targetLon:149.135,targetGround:575,targetAgl:1.6,
    utcOffset:tzHours,wallTime:'',timeStep:15,scene:'standard'
  });
  const schema = Object.keys(defaultState());
  function defaultWall(offset) {
    const d = new Date(Date.now()+offset*3600000);
    return d.toISOString().slice(0,16);
  }
  function sanitise(obj) {
    const out=defaultState();
    for (const key of schema) {
      if (!(key in (obj || {}))) continue;
      if (typeof out[key] === 'boolean' && typeof obj[key] === 'boolean') out[key]=obj[key];
      else if (typeof out[key] === 'number' && Number.isFinite(Number(obj[key])) && obj[key] !== '') out[key]=Number(obj[key]);
      else if (typeof out[key] === 'string' && typeof obj[key] === 'string') out[key]=obj[key];
    }
    out.lat=clamp(out.lat,-90,90);out.lon=clamp(out.lon,-180,180);
    out.agl=clamp(out.agl,-5000,50000);out.ground=clamp(out.ground,-12000,20000);
    out.targetLat=clamp(out.targetLat,-90,90);out.targetLon=clamp(out.targetLon,-180,180);
    out.targetAgl=clamp(out.targetAgl,-5000,50000);out.targetGround=clamp(out.targetGround,-12000,20000);
    out.aimTarget=['sun','moon','core','custom'].includes(out.aimTarget)?out.aimTarget:'sun';
    out.heading=((out.heading%360)+360)%360;out.pitch=clamp(out.pitch,-89,89);
    out.roll=clamp(out.roll,-180,180);out.extent=clamp(out.extent,1,50000);
    out.celestialShellScale=S.sanitiseScale(out.celestialShellScale);
    for (const k of ['sensorWidth','sensorHeight','focal','aperture','focus','coc']) if (out[k]<=0) out[k]=defaultState()[k];
    out.focal=clamp(out.focal,1,2000);out.aperture=L.apertures[L.apertureIndex(out.aperture)];
    out.focus=clamp(out.focus,Math.max(.01,out.focal/1000+.001),10000);
    out.utcOffset=clamp(out.utcOffset,-12,14);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.wallTime) || !Number.isFinite(Date.parse(out.wallTime))) out.wallTime=defaultWall(out.utcOffset);
    out.scene=['standard','google'].includes(out.scene) ? out.scene : 'standard';
    return out;
  }
  function readShared() {
    if (!location.hash.startsWith('#s=')) return null;
    try {const data=location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(data));}
    catch(e){console.warn('Bad shared configuration',e);return null;}
  }
  const previous=(()=>{try{return JSON.parse(localStorage.getItem('photoGeometrySettings')||'null');}catch(e){return null;}})();
  let state=sanitise(readShared()||previous||{});
  let viewer=null, googleTiles=null, terrainProvider=null, terrainTask=null;
  let overlays=[]; let preview=false, overviewPose=null, placing=null, drawPending=false;
  let elevationRevision=0, targetElevationRevision=0, lastAstro=null, trajectoryCache=null;
  function status(message,error=false) {
    $('status').textContent=message;$('status').classList.toggle('error',error);
  }
  function persist() {localStorage.setItem('photoGeometrySettings',JSON.stringify(state));}
  function showField(id) {const val=state[id];$(id).value=typeof val==='number'?String(Number(val.toFixed(7))):val;}
  function renderLensControls() {
    $('focalSlider').value=L.focalToSlider(state.focal);$('focal').value=state.focal;
    $('apertureSlider').value=L.apertureIndex(state.aperture);$('aperture').value=state.aperture;
    $('focusSlider').value=L.focusToSlider(state.focus);$('focus').value=state.focus;
  }
  function renderTargetFields() {
    $('targetLat').value=state.targetLat.toFixed(6);$('targetLon').value=state.targetLon.toFixed(6);
    $('targetGround').value=Number(state.targetGround.toFixed(2));$('targetAgl').value=Number(state.targetAgl.toFixed(2));
    $('targetAmsl').value=Number((state.targetGround+state.targetAgl).toFixed(2));
    $('customTargetControls').hidden=state.aimTarget!=='custom';
  }
  function renderFields() {
    for (const key of schema) {
      const el=$(key);if(!el)continue;
      if (el.type==='checkbox') el.checked=Boolean(state[key]);
      else el.value=String(state[key]);
    }
    renderLensControls();renderTargetFields();
    $('headingNumber').value=state.heading;$('pitchNumber').value=state.pitch;$('rollNumber').value=state.roll;
    $('lat').value=state.lat.toFixed(6);$('lon').value=state.lon.toFixed(6);
    $('amsl').value=(state.ground+state.agl).toFixed(2);
    $('timeSlider').value=Number(state.wallTime.slice(11,13))*60+Number(state.wallTime.slice(14,16));
    $('timeStep').value=state.timeStep;
    renderReadouts();
  }
  function dateFromWall() {
    const [day,clock]=state.wallTime.split('T');
    const [year,month,date]=day.split('-').map(Number),[hour,minute]=clock.split(':').map(Number);
    return new Date(Date.UTC(year,month-1,date,hour,minute)-state.utcOffset*3600000);
  }
  function setWallFromUtc(utc) {state.wallTime=new Date(utc.getTime()+state.utcOffset*3600000).toISOString().slice(0,16);}
  function moveMinutes(delta) {
    const t=dateFromWall().getTime()+delta*60000;
    setWallFromUtc(new Date(t));$('wallTime').value=state.wallTime;schedule();
  }
  function optical() {return window.Optics.calculate(state);}
  function renderReadouts() {
    try {
      const o=optical();
      $('opticsReadout').innerHTML=`FOV: <b>${fmt(o.horizontalFov)}° H × ${fmt(o.verticalFov)}° V</b> · ${fmt(o.diagonalFov)}° diagonal<br>`+
        `Near focus: <b>${fmt(o.near,2)} m</b> · Far: <b>${fmt(o.far,2)} m</b><br>`+
        `DOF: ${fmt(o.total,2)} m · Hyperfocal: ${fmt(o.hyperfocal,2)} m`;
    } catch(e){$('opticsReadout').textContent=e.message;}
    $('celestialShellReadout').textContent=`${state.celestialShellScale.toLocaleString('en-AU',{maximumFractionDigits:1})}× · ${fmt(S.radius(state.extent,state.celestialShellScale),0)} m`;
    const when=dateFromWall();
    $('utcReadout').textContent=`UTC: ${when.toISOString().slice(0,16).replace('T',' ')} · Offset ${state.utcOffset>=0?'+':''}${state.utcOffset} h`;
  }
  const absoluteHeight=()=>state.ground+state.agl;
  const locationCartesian=()=>C.Cartesian3.fromDegrees(state.lon,state.lat,absoluteHeight());
  const targetCartesian=()=>C.Cartesian3.fromDegrees(state.targetLon,state.targetLat,state.targetGround+state.targetAgl);
  function transform(position) {return C.Transforms.eastNorthUpToFixedFrame(position);}
  function add(...vecs) {let o=new C.Cartesian3(0,0,0);for(const v of vecs) o=C.Cartesian3.add(o,v,new C.Cartesian3());return o;}
  function scaled(v,d) {return C.Cartesian3.multiplyByScalar(v,d,new C.Cartesian3());}
  function unit(v) {return C.Cartesian3.normalize(v,new C.Cartesian3());}
  function localToWorld(enu,v) {return unit(C.Matrix4.multiplyByPointAsVector(enu,v,new C.Cartesian3()));}
  function azAltVector(enu,az,alt) {
    const a=rad(az),e=rad(alt);
    return localToWorld(enu,new C.Cartesian3(Math.sin(a)*Math.cos(e),Math.cos(a)*Math.cos(e),Math.sin(e)));
  }
  function cameraVectors(pos) {
    const enu=transform(pos),f=azAltVector(enu,state.heading,state.pitch);
    const zenith=localToWorld(enu,new C.Cartesian3(0,0,1));
    let right=unit(C.Cartesian3.cross(f,zenith,new C.Cartesian3()));
    let up=unit(C.Cartesian3.cross(right,f,new C.Cartesian3()));
    const roll=rad(state.roll),r=add(scaled(right,Math.cos(roll)),scaled(up,Math.sin(roll)));
    up=add(scaled(up,Math.cos(roll)),scaled(right,-Math.sin(roll)));
    return {enu,f,right:unit(r),up:unit(up)};
  }
  function cornersAt(pos,basis,d,op) {
    const center=add(pos,scaled(basis.f,d));
    const h=d*op.tanHalfV,w=d*op.tanHalfH;
    return [add(center,scaled(basis.right,-w),scaled(basis.up,-h)),
      add(center,scaled(basis.right,w),scaled(basis.up,-h)),
      add(center,scaled(basis.right,w),scaled(basis.up,h)),
      add(center,scaled(basis.right,-w),scaled(basis.up,h))];
  }
  function line(points,color,width=2,dashed=false,throughTerrain=false) {
    const material=dashed?new C.PolylineDashMaterialProperty({color}):color;
    const polyline={positions:points,width,arcType:C.ArcType.NONE,material};
    // Draw the same directional line when it fails depth testing against terrain/3D tiles.
    // Cesium depthFailMaterial can show artifacts on some WebGL implementations.
    if(throughTerrain)polyline.depthFailMaterial=material;
    return viewer.entities.add({polyline});
  }
  function polygon(points,color) {
    return viewer.entities.add({polygon:{hierarchy:new C.PolygonHierarchy(points),perPositionHeight:true,
      material:color,outline:false}});
  }
  function collect(entity) {overlays.push(entity);return entity;}
  function outline(corners,color,width=2) {
    collect(line([...corners,corners[0]],color,width));
  }
  function boxFaces(front,back,color) {
    for(let i=0;i<4;i++)collect(polygon([front[i],front[(i+1)%4],back[(i+1)%4],back[i]],color));
    collect(polygon(front,color.withAlpha(.12)));collect(polygon(back,color.withAlpha(.14)));
  }
  function frameDirectionTest(direction,basis,op) {
    const z=C.Cartesian3.dot(direction,basis.f);
    if(z<=0) return false;
    return Math.abs(C.Cartesian3.dot(direction,basis.right)/z)<=op.tanHalfH &&
      Math.abs(C.Cartesian3.dot(direction,basis.up)/z)<=op.tanHalfV;
  }
  function pointLabel(pos,name,color,throughTerrain=true) {
    const depthDistance=throughTerrain?Number.POSITIVE_INFINITY:0;
    return viewer.entities.add({position:pos,point:{pixelSize:13,color,
      outlineWidth:2,outlineColor:C.Color.fromCssColorString('#0c1925'),disableDepthTestDistance:depthDistance},
      label:{text:name,font:'bold 13px sans-serif',pixelOffset:new C.Cartesian2(12,-17),
        horizontalOrigin:C.HorizontalOrigin.LEFT,style:C.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth:3,outlineColor:C.Color.fromCssColorString('#17202c'),fillColor:color,
        disableDepthTestDistance:depthDistance}});
  }
  function formatAstro(name,details,inside) {
    const shown=inside?' <span class="isIn">in FOV</span>':'';
    const phase=name==='Moon'?` · ${Math.round(details.phase*100)}% lit`:'';
    return `<div class="astro-line"><b>${name}</b><span>Az ${fmt(details.az,1)}° · Alt ${fmt(details.alt,1)}°${phase}${shown}</span><button type="button" data-aim="${name.toLowerCase()}">Aim</button></div>`;
  }
  function localDayStartUtc() {
    const [y,m,d]=state.wallTime.slice(0,10).split('-').map(Number);
    return Date.UTC(y,m-1,d)-state.utcOffset*3600000;
  }
  function cachedTrajectories() {
    const key=[state.lat,state.lon,absoluteHeight(),state.wallTime.slice(0,10),state.utcOffset].join('|');
    if(trajectoryCache?.key===key)return trajectoryCache.paths;
    const paths={sun:[],moon:[],core:[]},begin=localDayStartUtc();
    for(let minutes=0;minutes<=1440;minutes+=15){
      const data=window.AstroDirections.calculate(new Date(begin+minutes*60000),state.lat,state.lon,absoluteHeight());
      for(const name of Object.keys(paths)) paths[name].push(data[name]);
    }
    trajectoryCache={key,paths};return paths;
  }
  function drawTrajectories(pos,basis,range,colours) {
    if(!state.showTrajectories)return;
    const paths=cachedTrajectories();
    for(const key of ['sun','moon','core']) {
      if(!state['show'+({sun:'Sun',moon:'Moon',core:'Core'})[key]])continue;
      const colour=C.Color.fromCssColorString(colours[key]);
      let segment=[],priorAbove=null;
      function flush(){if(segment.length>1)collect(line(segment,colour.withAlpha(priorAbove?.45:.24),priorAbove?2.7:1.5,!priorAbove,state.celestialThroughTerrain));segment=[];}
      for(const sample of paths[key]){
        const above=sample.alt>=0;
        const point=add(pos,scaled(azAltVector(basis.enu,sample.az,sample.alt),range));
        if(priorAbove!==null && priorAbove!==above){const prev=segment.at(-1);flush();segment=prev?[prev,point]:[point];}
        else segment.push(point);
        priorAbove=above;
      }
      flush();
    }
  }
  function drawAstronomy(pos,basis,op) {
    try {
      const date=dateFromWall();lastAstro=window.AstroDirections.calculate(date,state.lat,state.lon,absoluteHeight());
      // Simple sky tied to the selected planning time: no Cesium starfield or celestial sprites.
      viewer.scene.backgroundColor=lastAstro.sun.alt>=0 ? DAY_SKY : C.Color.BLACK;
      const colours={sun:'#ffc268',moon:'#c5c9ff',core:'#ee9bdc'};
      const names={sun:'Sun',moon:'Moon',core:'Core'};
      // An arbitrary camera-centred sky shell: its radius does not affect azimuth/altitude.
      const markerRange=S.radius(state.extent,state.celestialShellScale);
      if(!preview)drawTrajectories(pos,basis,markerRange,colours);
      let html='';
      for (const key of ['sun','moon','core']) {
        const data=lastAstro[key],dir=azAltVector(basis.enu,data.az,data.alt);
        const inside=frameDirectionTest(dir,basis,op);
        html+=formatAstro(names[key],data,inside);
        const shouldShow=state['show'+names[key]];
        if(!shouldShow)continue;
        const colour=C.Color.fromCssColorString(colours[key]);
        const mark=add(pos,scaled(dir,markerRange));
        collect(line([pos,mark],colour.withAlpha(.63),2,false,state.celestialThroughTerrain));
        collect(pointLabel(mark,names[key],colour,state.celestialThroughTerrain));
      }
      $('astroReadout').innerHTML=html;
    } catch(e) {
      $('astroReadout').textContent='Celestial calculation unavailable: '+e.message;
      console.error('Astronomy calculation',e);
    }
  }
  function draw() {
    drawPending=false;
    if(!viewer)return;
    for(const entity of overlays)viewer.entities.remove(entity);
    overlays=[];
    let op;
    try { op=optical(); } catch(e) { status('Invalid camera optics: '+e.message,true);renderReadouts();return; }
    const pos=locationCartesian(),basis=cameraVectors(pos);
    const dist=state.extent,tip=Math.min(.3,dist*.15);
    if(!preview){
      collect(pointLabel(pos,'Camera',C.Color.WHITE));
      const base=C.Cartesian3.fromDegrees(state.lon,state.lat,state.ground);
      collect(line([base,pos],C.Color.WHITE.withAlpha(.55),2,true));
      if(state.aimTarget==='custom'){
        const target=targetCartesian(),accent=C.Color.fromCssColorString('#ffa875');
        collect(pointLabel(target,'Target',accent));
        collect(line([C.Cartesian3.fromDegrees(state.targetLon,state.targetLat,state.targetGround),target],accent.withAlpha(.7),2,true));
        collect(line([pos,target],accent.withAlpha(.45),1.6,true));
      }
      const end=cornersAt(pos,basis,dist,op),start=cornersAt(pos,basis,tip,op);
      if(state.showFrustum){
        const blue=C.Color.fromCssColorString('#60d0f2');
        outline(end,blue,2.6);outline(start,blue.withAlpha(.7),1.2);
        for(let i=0;i<4;i++)collect(line([pos,end[i]],blue.withAlpha(.9),1.5));
        boxFaces(start,end,blue.withAlpha(.025));
      }
      if(state.showAxis)collect(line([pos,add(pos,scaled(basis.f,dist))],C.Color.WHITE.withAlpha(.8),2,true));
      const near=op.near,far=Math.min(op.far,dist);
      if(state.showDof && near<far && near<dist){
        const from=cornersAt(pos,basis,Math.max(.05,near),op);
        const to=cornersAt(pos,basis,far,op);
        const green=C.Color.fromCssColorString('#5de2aa');
        boxFaces(from,to,green.withAlpha(.1));
        outline(from,green,3);outline(to,green.withAlpha(.75),3);
      }
      if(state.showFocus && state.focus<=dist){
        const focusCorners=cornersAt(pos,basis,state.focus,op);
        collect(polygon(focusCorners,C.Color.fromCssColorString('#ffdf74').withAlpha(.14)));
        outline(focusCorners,C.Color.fromCssColorString('#ffdf74'),2);
      }
    }
    drawAstronomy(pos,basis,op);
    renderReadouts();
    if(preview)updatePreview();
    viewer.scene.requestRender();
  }
  function schedule() {
    persist();
    if(!drawPending){drawPending=true;requestAnimationFrame(draw);}
  }
  function viewFrustum() {
    const aspect=viewer.canvas.clientWidth/Math.max(1,viewer.canvas.clientHeight);
    const tanH=state.sensorWidth/(2*state.focal),tanV=state.sensorHeight/(2*state.focal);
    const tanViewportH=Math.max(tanH,tanV*aspect);
    const tanViewportV=Math.max(tanV,tanH/aspect);
    const angle=aspect>=1 ? 2*Math.atan(tanViewportH):2*Math.atan(tanViewportV);
    if (viewer.camera.frustum instanceof C.PerspectiveFrustum) viewer.camera.frustum.fov=angle;
    $('cameraFrame').querySelector('.frame-inner').style.aspectRatio=`${state.sensorWidth} / ${state.sensorHeight}`;
  }
  function updatePreview() {
    if(!preview)return;
    viewer.camera.setView({destination:locationCartesian(),orientation:{
      heading:rad(state.heading),pitch:rad(state.pitch),roll:rad(state.roll)}});
    viewFrustum();
  }
  function setPreview(active) {
    if(!viewer)return;
    if(active===preview)return;
    if(active) {
      overviewPose={destination:C.Cartesian3.clone(viewer.camera.positionWC),
        direction:C.Cartesian3.clone(viewer.camera.directionWC),up:C.Cartesian3.clone(viewer.camera.upWC),
        fov:viewer.camera.frustum.fov};
      preview=true;updatePreview();
    } else {
      preview=false;
      if(overviewPose){viewer.camera.setView({destination:overviewPose.destination,
        orientation:{direction:overviewPose.direction,up:overviewPose.up}});
        viewer.camera.frustum.fov=overviewPose.fov;}
    }
    $('cameraFrame').hidden=!preview;
    $('previewBtn').classList.toggle('primary',preview);
    $('overviewBtn').classList.toggle('primary',!preview);
    schedule();
  }
  function flyToCamera() {
    setPreview(false);
    const p=locationCartesian();
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(p,40),{
      offset:new C.HeadingPitchRange(rad(state.heading+15),rad(-27),Math.max(130,state.extent*.8)),duration:.9});
  }
  async function ensureTerrain() {
    if(terrainProvider)return terrainProvider;
    if(terrainTask)return terrainTask;
    if(!ionToken())return null;
    C.Ion.defaultAccessToken=ionToken();
    terrainTask=C.CesiumTerrainProvider.fromIonAssetId(1).then(p=>{terrainProvider=p;return p;})
      .catch(e=>{console.warn('World Terrain unavailable',e);return null;}).finally(()=>{terrainTask=null;});
    return terrainTask;
  }
  function ionToken() {return $('ionToken').value.trim();}
  async function sampleGround({pickedHeight=null,target=false}={}) {
    const sequence=target?++targetElevationRevision:++elevationRevision;
    const stillCurrent=()=>sequence===(target?targetElevationRevision:elevationRevision);
    const latitude=target?state.targetLat:state.lat,longitude=target?state.targetLon:state.lon;
    const groundKey=target?'targetGround':'ground';
    const aglKey=target?'targetAgl':'agl';
    const groundId=target?'targetGround':'ground',amslId=target?'targetAmsl':'amsl';
    const sourceId=target?'targetHeightSource':'heightSource';
    const provider=await ensureTerrain();
    if(!stillCurrent())return;
    if(provider){
      try{
        const arr=await C.sampleTerrainMostDetailed(provider,[C.Cartographic.fromDegrees(longitude,latitude)]);
        if(!stillCurrent())return;
        if(Number.isFinite(arr[0]?.height)){
          state[groundKey]=arr[0].height;
          $(groundId).value=Number(state[groundKey].toFixed(2));
          $(amslId).value=Number((state[groundKey]+state[aglKey]).toFixed(2));
          $(sourceId).textContent='Ground: Cesium World Terrain sample (estimated bare-earth elevation).';
          status(target?'Target ground sampled.':'Camera ground sampled.');schedule();return;
        }
      }catch(e){console.warn('Terrain sampling failed',e);}
    }
    if(Number.isFinite(pickedHeight)){
      state[groundKey]=pickedHeight;
      $(groundId).value=Number(state[groundKey].toFixed(2));
      $(amslId).value=Number((state[groundKey]+state[aglKey]).toFixed(2));
      $(sourceId).textContent='Fallback: picked mesh surface (may be roof/tree rather than ground).';
      status('Used picked surface height; adjust if necessary.');schedule();return;
    }
    $(sourceId).textContent='Ground unchanged: terrain sampling unavailable. Adjust elevation manually.';
    status((target?'Target':'Camera')+' placed; using existing ground estimate.');
  }
  function place(lat,lon,pickedHeight=null,reframe=false){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){status('Invalid latitude/longitude.',true);return;}
    ++elevationRevision;
    state.lat=lat;state.lon=lon;
    $('lat').value=lat.toFixed(6);$('lon').value=lon.toFixed(6);
    schedule();if(reframe)flyToCamera();sampleGround({pickedHeight});
  }
  function placeTarget(lat,lon,pickedHeight=null){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){status('Invalid target latitude/longitude.',true);return;}
    ++targetElevationRevision;
    state.targetLat=lat;state.targetLon=lon;
    renderTargetFields();schedule();sampleGround({pickedHeight,target:true});
  }
  function getClickPosition(screen) {
    const picked=viewer.scene.pick(screen);
    let p;
    if(viewer.scene.pickPositionSupported && !C.defined(picked?.id)){
      try{p=viewer.scene.pickPosition(screen);}catch(e){console.warn(e);}
    }
    if(!p){const ray=viewer.camera.getPickRay(screen);p=viewer.scene.globe.pick(ray,viewer.scene);}
    if(!p)p=viewer.camera.pickEllipsoid(screen,C.Ellipsoid.WGS84);
    return p;
  }
  function armPlacement(kind) {
    if(preview)setPreview(false);
    placing=placing===kind?null:kind;
    $('pickBtn').classList.toggle('armed',placing==='camera');
    $('targetPickBtn').classList.toggle('armed',placing==='target');
    $('pickBtn').textContent=placing==='camera'?'Cancel camera placement':'Click map to place';
    $('targetPickBtn').textContent=placing==='target'?'Cancel target placement':'Click map to place target';
    status(placing?`Click a location in the scene for the ${placing}.`:'Map placement cancelled.');
  }
  function onPlace(screen) {
    if(!placing||preview)return;
    const kind=placing,p=getClickPosition(screen);
    placing=null;
    $('pickBtn').classList.remove('armed');$('pickBtn').textContent='Click map to place';
    $('targetPickBtn').classList.remove('armed');$('targetPickBtn').textContent='Click map to place target';
    if(!p){status('No terrain/mesh hit. Try another visible surface.',true);return;}
    const carto=C.Cartographic.fromCartesian(p);
    if(kind==='target')placeTarget(deg(carto.latitude),deg(carto.longitude),carto.height);
    else place(deg(carto.latitude),deg(carto.longitude),carto.height);
  }
  async function enableGoogle() {
    const token=ionToken();
    if(!token){status('Enter a Cesium ion token to load Google Photorealistic 3D.',true);return;}
    localStorage.setItem('photoGeometryIonToken',token);C.Ion.defaultAccessToken=token;
    try{
      status('Loading Google Photorealistic 3D Tiles…');
      if(!googleTiles){googleTiles=await C.createGooglePhotorealistic3DTileset({onlyUsingWithGoogleGeocoder:true});
        viewer.scene.primitives.add(googleTiles);}
      googleTiles.show=true;
      viewer.scene.globe.show=false;
      state.scene='google';schedule();
      await sampleGround();
      status('Google Photorealistic 3D active. Click map to place camera; terrain elevation is approximate.');
    }catch(e){console.error(e);status('Google tiles could not load: '+(e.message||e),true);}
  }
  function standardMap() {
    if(googleTiles)googleTiles.show=false;
    viewer.scene.globe.show=true;
    state.scene='standard';status('Standard map active.');schedule();
  }
  function aim(key){
    let az,alt;
    if(key==='custom'){
      const camera=locationCartesian(),target=targetCartesian();
      const diff=C.Cartesian3.subtract(target,camera,new C.Cartesian3());
      if(C.Cartesian3.magnitude(diff)<.01){status('Target and camera are at the same position.',true);return;}
      const frame=transform(camera);
      const east=localToWorld(frame,new C.Cartesian3(1,0,0));
      const north=localToWorld(frame,new C.Cartesian3(0,1,0));
      const up=localToWorld(frame,new C.Cartesian3(0,0,1));
      const e=C.Cartesian3.dot(diff,east),n=C.Cartesian3.dot(diff,north),u=C.Cartesian3.dot(diff,up);
      az=(deg(Math.atan2(e,n))+360)%360;
      alt=deg(Math.atan2(u,Math.hypot(e,n)));
    }else{
      try {
        const details=window.AstroDirections.calculate(dateFromWall(),state.lat,state.lon,absoluteHeight());
        az=details[key].az;alt=details[key].alt;
      }catch(e){status('Unable to aim: '+e.message,true);return;}
    }
    state.heading=az;
    state.pitch=clamp(alt,-89,89);
    $('heading').value=state.heading;$('headingNumber').value=Number(state.heading.toFixed(2));
    $('pitch').value=state.pitch;$('pitchNumber').value=Number(state.pitch.toFixed(2));
    schedule();status('Pointed camera at '+(key==='custom'?'user target':key)+'.');
  }
  function updateLens(id,value){
    if(!Number.isFinite(value)||value<=0){renderLensControls();return;}
    if(id==='focal')state.focal=clamp(value,1,2000);
    else if(id==='focus')state.focus=clamp(value,.01,10000);
    else if(id==='aperture')state.aperture=L.apertures[L.apertureIndex(value)];
    // The near focus limit must be beyond the focal length for our thin-lens model.
    if(state.focus<=state.focal/1000)state.focus=Math.min(10000,Number((state.focal/1000+.01).toFixed(3)));
    renderLensControls();schedule();
  }
  function updateNumber(id){const el=$(id),n=Number(el.value);if(el.value===''||!Number.isFinite(n))return;
    const min=el.min!==''?Number(el.min):-Infinity,max=el.max!==''?Number(el.max):Infinity;
    state[id]=clamp(n,min,max);
    if(id==='ground'||id==='agl')$('amsl').value=Number(absoluteHeight().toFixed(2));
    if(id==='targetGround'||id==='targetAgl')$('targetAmsl').value=Number((state.targetGround+state.targetAgl).toFixed(2));
    if(id==='sensorWidth'||id==='sensorHeight'||id==='coc')state.cameraPreset='custom';
    if(['sensorWidth','sensorHeight','coc'].includes(id))$('cameraPreset').value='custom';
    schedule();}
  function wire() {
    for(const id of ['lat','lon']) $(id).addEventListener('keydown',e=>{if(e.key==='Enter')$('coordinatesBtn').click();});
    $('coordinatesBtn').addEventListener('click',()=>place(Number($('lat').value),Number($('lon').value),null,true));
    $('pickBtn').addEventListener('click',()=>armPlacement('camera'));
    $('targetPickBtn').addEventListener('click',()=>armPlacement('target'));
    for(const id of ['ground','agl','targetGround','targetAgl']) $(id).addEventListener('change',()=>{
      if(id.startsWith('target'))targetElevationRevision++;else elevationRevision++;
      updateNumber(id);
      $(id.startsWith('target')?'targetHeightSource':'heightSource').textContent='Ground/height adjusted manually.';
    });
    $('amsl').addEventListener('change',()=>{const n=Number($('amsl').value);if(!Number.isFinite(n))return;
      elevationRevision++;state.agl=n-state.ground;$('agl').value=Number(state.agl.toFixed(2));schedule();});
    $('targetAmsl').addEventListener('change',()=>{const n=Number($('targetAmsl').value);if(!Number.isFinite(n))return;
      targetElevationRevision++;state.targetAgl=n-state.targetGround;$('targetAgl').value=Number(state.targetAgl.toFixed(2));schedule();});
    for(const id of ['sensorWidth','sensorHeight','coc','extent'])$(id).addEventListener('change',()=>updateNumber(id));
    $('focalSlider').addEventListener('input',()=>updateLens('focal',L.focalFromSlider($('focalSlider').value)));
    $('focusSlider').addEventListener('input',()=>updateLens('focus',L.focusFromSlider($('focusSlider').value)));
    $('apertureSlider').addEventListener('input',()=>updateLens('aperture',L.apertures[Number($('apertureSlider').value)]));
    $('focal').addEventListener('change',()=>updateLens('focal',Number($('focal').value)));
    $('focus').addEventListener('change',()=>updateLens('focus',Number($('focus').value)));
    $('aperture').addEventListener('change',()=>updateLens('aperture',Number($('aperture').value)));
    $('aimTarget').addEventListener('change',()=>{state.aimTarget=$('aimTarget').value;renderTargetFields();schedule();});
    $('aimTargetBtn').addEventListener('click',()=>aim(state.aimTarget));
    for(const id of ['targetLat','targetLon'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter')$('targetCoordinatesBtn').click();});
    $('targetCoordinatesBtn').addEventListener('click',()=>placeTarget(Number($('targetLat').value),Number($('targetLon').value)));
    $('targetRefineGroundBtn').addEventListener('click',()=>sampleGround({target:true}));
    $('cameraPreset').addEventListener('change',()=>{
      const preset=$('cameraPreset').value;state.cameraPreset=preset;
      if(presets[preset]){[state.sensorWidth,state.sensorHeight,state.coc]=presets[preset];
        for(const id of ['sensorWidth','sensorHeight','coc'])showField(id);}
      schedule();});
    for(const id of ['heading','pitch','roll']){
      $(id).addEventListener('input',()=>{state[id]=Number($(id).value);$(id+'Number').value=$(id).value;schedule();});
      $(id+'Number').addEventListener('change',()=>{const v=clamp(Number($(id+'Number').value),Number($(id).min),Number($(id).max));
        state[id]=v;$(id).value=v;$(id+'Number').value=v;schedule();});
    }
    $('celestialShellScale').addEventListener('input',()=>{
      state.celestialShellScale=S.sanitiseScale(Number($('celestialShellScale').value));
      schedule();
    });
    for(const id of ['showFrustum','showDof','showFocus','showAxis','showSun','showMoon','showCore','showTrajectories','celestialThroughTerrain'])
      $(id).addEventListener('change',()=>{state[id]=$(id).checked;schedule();});
    $('wallTime').addEventListener('change',()=>{
      if(!Number.isFinite(Date.parse($('wallTime').value)))return;
      state.wallTime=$('wallTime').value.slice(0,16);
      $('timeSlider').value=Number(state.wallTime.slice(11,13))*60+Number(state.wallTime.slice(14,16));schedule();});
    $('utcOffset').addEventListener('change',()=>{state.utcOffset=clamp(Number($('utcOffset').value),-12,14);
      // Preserve local wall-clock time on offset change: represents planning at another site's clock time.
      $('utcOffset').value=state.utcOffset;schedule();});
    $('timeStep').addEventListener('change',()=>{state.timeStep=Number($('timeStep').value);persist();});
    $('timeSlider').addEventListener('input',()=>{const m=Number($('timeSlider').value);
      state.wallTime=state.wallTime.slice(0,11)+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
      $('wallTime').value=state.wallTime;schedule();});
    $('backTime').addEventListener('click',()=>moveMinutes(-state.timeStep));
    $('forwardTime').addEventListener('click',()=>moveMinutes(state.timeStep));
    $('nowTime').addEventListener('click',()=>{state.wallTime=defaultWall(state.utcOffset);renderFields();schedule();});
    $('astroReadout').addEventListener('click',e=>{
      const key=e.target.closest('button[data-aim]')?.dataset.aim;if(key)aim(key);});
    $('overviewBtn').addEventListener('click',()=>setPreview(false));
    $('previewBtn').addEventListener('click',()=>setPreview(true));
    $('zoomBtn').addEventListener('click',flyToCamera);
    $('refineGroundBtn').addEventListener('click',()=>sampleGround());
    $('googleBtn').addEventListener('click',enableGoogle);
    $('mapBtn').addEventListener('click',standardMap);
    $('saveBtn').addEventListener('click',()=>{persist();status('Settings saved in this browser.');});
    $('shareBtn').addEventListener('click',async()=>{
      const encoded=btoa(JSON.stringify(state)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const url=location.href.split('#')[0]+'#s='+encoded;
      try{await navigator.clipboard.writeText(url);status('Share link copied (includes configuration, not token).');}
      catch(e){location.hash='s='+encoded;status('Share link set in address bar. Copy it to share.');}
    });
    $('exportBtn').addEventListener('click',()=>{
      const blob=new Blob([JSON.stringify({version:1,settings:state},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='photo-geometry.json';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);});
    $('importBtn').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',async()=>{
      const file=$('importFile').files?.[0];if(!file)return;
      try{const data=JSON.parse(await file.text());state=sanitise(data.settings||data);renderFields();sampleGround();schedule();status('Configuration imported.');}
      catch(e){status('Cannot import JSON: '+e.message,true);}
      $('importFile').value='';});
    $('resetBtn').addEventListener('click',()=>{state=sanitise(defaultState());renderFields();schedule();status('Configuration reset (ion token retained in browser).');});
    window.addEventListener('resize',()=>{if(preview)viewFrustum();});
  }
  function initialise() {
    viewer=new C.Viewer('cesiumContainer',{
      animation:false,timeline:false,homeButton:false,sceneModePicker:false,baseLayerPicker:false,
      navigationHelpButton:false,fullscreenButton:false,selectionIndicator:false,infoBox:false,
      geocoder:C.IonGeocodeProviderType.GOOGLE,
      terrainProvider:new C.EllipsoidTerrainProvider(),
      skyBox:false,
      skyAtmosphere:false,
      baseLayer:false
    });
    viewer.imageryLayers.addImageryProvider(new C.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));
    viewer.scene.globe.depthTestAgainstTerrain=true;
    viewer.scene.globe.showGroundAtmosphere=false;
    viewer.scene.backgroundColor=DAY_SKY;
    // Use the camera pose for the planning camera, not the Cesium viewport camera.
    viewer.camera.setView({destination:C.Cartesian3.fromDegrees(state.lon,state.lat,state.ground+2500),
      orientation:{heading:rad(10),pitch:rad(-45),roll:0}});
    viewer.screenSpaceEventHandler.setInputAction(e=>onPlace(e.position),C.ScreenSpaceEventType.LEFT_CLICK);
    const existing=localStorage.getItem('photoGeometryIonToken')||localStorage.getItem('cesiumIonToken')||'';
    $('ionToken').value=existing;
    $('apertureSlider').max=String(L.apertures.length-1);
    for(const f of L.apertures){const option=document.createElement('option');option.value=f;option.textContent='f/'+f;$('aperture').append(option);}
    wire();renderFields();draw();
    status('Ready. Place a camera by clicking the map or entering coordinates.');
    if(existing){
      C.Ion.defaultAccessToken=existing;
      ensureTerrain().then(()=>sampleGround());
      if(state.scene==='google')enableGoogle();
    }
  }
  try{initialise();}catch(e){console.error(e);status('Initialisation failed: '+(e.message||e),true);}
})();
