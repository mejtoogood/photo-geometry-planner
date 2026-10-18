(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.Cesium;
  if (!C || !window.Optics || !window.AstroDirections || !window.LensControls || !window.SkyShell || !window.SolarPhases || !window.PreviewProjection || !window.GroundBearings) {
    $('status').textContent = 'Required script failed to load. Check CDN access and refresh.';
    $('status').classList.add('error');
    return;
  }
  const L = window.LensControls;
  const S = window.SkyShell;
  const Solar = window.SolarPhases;
  const Projection = window.PreviewProjection;
  const Ground = window.GroundBearings;
  const rad = C.Math.toRadians;
  const deg = C.Math.toDegrees;

  const clamp = (x, a, b) => Math.max(a,Math.min(b,x));
  const fmt = (x,d=1) => Number.isFinite(x) ? x.toLocaleString('en-AU',{maximumFractionDigits:d,minimumFractionDigits:d}) : '∞';
  const SOLID_GEOMETRY_LIMIT_M=1000; // Avoid enormous translucent polygons across 3D Tiles.
  const presets = {d850:[35.9,23.9,.03],fe:[36,24,.03], 'nikon-dx':[23.5,15.6,.02],p67:[70,56,.05]};
  const tzHours = -new Date().getTimezoneOffset()/60;
  const defaultState = () => ({
    lat:-35.3000,lon:149.1250,ground:575,agl:1.6,
    heading:90,pitch:0,roll:0,extent:300,
    cameraPreset:'d850',sensorWidth:35.9,sensorHeight:23.9,
    focal:50,aperture:5.6,focus:10,coc:.03,
    showFrustum:true,showDof:true,showFocus:true,showAxis:true,
    showSun:true,showMoon:true,showCore:true,showTrajectories:true,
    showGroundBearings:true,groundBearingLength:Ground.DEFAULT_LENGTH,
    celestialShellScale:S.DEFAULT_SCALE,celestialThroughTerrain:true,
    targetLat:-35.3000,targetLon:149.135,targetGround:575,targetAgl:1.6,
    targetSunRise:true,targetSunSet:true,targetMoonRise:true,targetMoonSet:true,
    targetShowBody:true,targetShowCameras:true,targetProjectionLength:Ground.DEFAULT_LENGTH,
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
    out.targetProjectionLength=Ground.limitLength(out.targetProjectionLength);
    out.heading=((out.heading%360)+360)%360;out.pitch=clamp(out.pitch,-89,89);
    out.roll=clamp(out.roll,-180,180);out.extent=clamp(out.extent,1,50000);
    out.celestialShellScale=S.sanitiseScale(out.celestialShellScale);
    out.groundBearingLength=Ground.limitLength(out.groundBearingLength);
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
  let previewControllerState=null,lookPointer=null;
  let elevationRevision=0, targetElevationRevision=0, lastAstro=null, trajectoryCache=null, solarDayCache=null, groundDayCache=null,targetAlignmentCache=null;
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

  }
  function renderFields() {
    for (const key of schema) {
      const el=$(key);if(!el)continue;
      if (el.type==='checkbox') el.checked=Boolean(state[key]);
      else el.value=String(state[key]);
    }
    renderLensControls();renderTargetFields();
    $('groundBearingLengthSlider').value=Ground.toSlider(state.groundBearingLength);
    $('targetProjectionLengthSlider').value=Ground.toSlider(state.targetProjectionLength);
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
    $('groundBearingLength').value=state.groundBearingLength;
    $('targetProjectionLength').value=state.targetProjectionLength;
    $('projectionModeNote').textContent=state.extent>SOLID_GEOMETRY_LIMIT_M
      ? 'Long-range projection: outlines only. Filled volumes are hidden beyond 1 km to avoid covering the terrain.'
      : 'Short-range projection: translucent FOV, DOF and focus surfaces are enabled.';
    const when=dateFromWall();
    $('utcReadout').textContent=`UTC: ${when.toISOString().slice(0,16).replace('T',' ')} · Offset ${state.utcOffset>=0?'+':''}${state.utcOffset} h`;
    renderSolarEvents();
  }
  function cachedSolarDay() {
    const key=[state.wallTime.slice(0,10),state.utcOffset,state.lat,state.lon,absoluteHeight()].join('|');
    if(solarDayCache?.key!==key){
      solarDayCache={key,data:Solar.calculateDay(state.wallTime.slice(0,10),state.utcOffset,state.lat,state.lon,absoluteHeight())};
    }
    return solarDayCache.data;
  }
  function renderSolarEvents() {
    const solarAltitude=lastAstro?.sun?.alt;
    const phase=Solar.phaseForAltitude(solarAltitude);
    $('solarPhaseReadout').innerHTML=Number.isFinite(solarAltitude)
      ? '<span class="solar-swatch" style="background-color:'+Solar.PHASE_COLORS[phase.key]+'" aria-hidden="true"></span>'
        +phase.label+' · Sun altitude '+fmt(solarAltitude,1)+'°'
      : 'Sun altitude not yet calculated';
    try {
      const rows=Solar.toRows(cachedSolarDay());
      const cell=entry=>entry.time
        ? `<td><button type="button" class="solar-event" data-event-time="${entry.time.getTime()}" title="Set planning time to this event">${entry.text}</button></td>`
        : '<td>—</td>';
      $('solarEventsBody').innerHTML=rows.map(row=>`<tr class="${phase.key===row.key?'current-phase':''}"><th scope="row"><span class="solar-swatch" style="background-color:${Solar.PHASE_COLORS[row.key]}" aria-hidden="true"></span>${row.label}</th>${cell(row.morning)}${cell(row.evening)}</tr>`).join('');
    } catch(e) {
      console.warn('Solar event calculations unavailable',e);
      $('solarEventsBody').innerHTML='<tr><td colspan="3">Solar events unavailable for this date/location.</td></tr>';
    }
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
  function cameraVectors(pos,rollDegrees=state.roll) {
    const enu=transform(pos),f=azAltVector(enu,state.heading,state.pitch);
    const zenith=localToWorld(enu,new C.Cartesian3(0,0,1));
    let right=unit(C.Cartesian3.cross(f,zenith,new C.Cartesian3()));
    let up=unit(C.Cartesian3.cross(right,f,new C.Cartesian3()));
    // The 3D FOV and sensor projections use the selected sensor roll.
    // The Cesium *view camera* is always unrolled to keep the real world level.
    const roll=rad(rollDegrees),r=add(scaled(right,Math.cos(roll)),scaled(up,Math.sin(roll)));
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
  function pointLabel(pos,name,color,throughTerrain=true,selected=false) {
    const depthDistance=throughTerrain?Number.POSITIVE_INFINITY:0;
    return viewer.entities.add({position:pos,point:{pixelSize:selected?17:13,color,
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
  function cachedTargetAlignments() {
    // Rise/set directions must be evaluated at the physical target.
    const key=[state.targetLat,state.targetLon,state.targetGround,state.targetAgl,
      state.wallTime.slice(0,10),state.utcOffset].join('|');
    if(targetAlignmentCache?.key!==key){
      targetAlignmentCache={
        key,
        events:Ground.targetAlignments(window.Astronomy,window.AstroDirections.calculate,
          state.wallTime.slice(0,10),state.utcOffset,state.targetLat,state.targetLon,
          state.targetGround+state.targetAgl)
      };
    }
    return targetAlignmentCache.events;
  }
  function drawTargetAlignments() {
    const selected={sun:{rise:state.targetSunRise,set:state.targetSunSet},
      moon:{rise:state.targetMoonRise,set:state.targetMoonSet}};
    const events=cachedTargetAlignments();
    const names={sun:'Sun',moon:'Moon'},colours={sun:'#ffc268',moon:'#c5c9ff'};
    // Always refresh the table, including while the camera preview is active.
    const rows=events.map(event=>{
      const active=selected[event.body][event.event];
      const time=event.date?Solar.formatTime(event.date,state.utcOffset):'—';
      const to=event.celestialAz===null?'—':fmt(event.celestialAz,1)+'°';
      const from=event.cameraAz===null?'—':fmt(event.cameraAz,1)+'°';
      return '<tr'+(active?'':' class="target-event-off"')+'><th>'+
        '<span class="ground-bearing-dot" style="background:'+colours[event.body]+'"></span> '+
        names[event.body]+' '+event.event+'</th><td>'+time+'</td><td>'+to+'</td><td>'+from+'</td></tr>';
    }).join('');
    $('targetAlignmentReadout').innerHTML='<table class="target-alignment-table"><thead>'+
      '<tr><th>Event</th><th>Time</th><th>To body</th><th>Camera side</th></tr></thead><tbody>'+rows+'</tbody></table>';
    if(preview || (!state.targetShowBody && !state.targetShowCameras))return;
    for(const event of events){
      if(!selected[event.body][event.event] || !Number.isFinite(event.celestialAz))continue;
      const celestialColour=C.Color.fromCssColorString(colours[event.body]);
      const caption=names[event.body]+' '+event.event;
      for(const mode of ['body','camera']){
        const towardsBody=mode==='body';
        if(towardsBody&&!state.targetShowBody || !towardsBody&&!state.targetShowCameras)continue;
        const az=towardsBody?event.celestialAz:event.cameraAz;
        const path=Ground.sampleRay(state.targetLat,state.targetLon,az,state.targetProjectionLength,250);
        const coords=path.map(point=>C.Cartesian3.fromDegrees(point.lon,point.lat,0));
        const colour=towardsBody?celestialColour:C.Color.fromCssColorString('#70e9d5');
        collect(viewer.entities.add({
          name:'Target '+caption+' '+(towardsBody?'body direction':'candidate camera positions'),
          polyline:{
            positions:coords,clampToGround:true,classificationType:C.ClassificationType.BOTH,
            arcType:C.ArcType.GEODESIC,width:towardsBody?3.5:3,
            material:towardsBody?colour:new C.PolylineDashMaterialProperty({color:colour,dashLength:20}),
            zIndex:towardsBody?6:5
          }
        }));
        const end=path.at(-1);
        collect(viewer.entities.add({
          position:C.Cartesian3.fromDegrees(end.lon,end.lat,0),
          point:{
            pixelSize:towardsBody?8:9,color:colour,
            outlineColor:C.Color.fromCssColorString('#10202a'),outlineWidth:1,
            heightReference:C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance:Number.POSITIVE_INFINITY
          },
          label:{
            text:(towardsBody?'To ':'Camera · ')+caption+' · '+fmt(az,1)+'°',
            font:'bold 12px sans-serif',
            heightReference:C.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin:C.VerticalOrigin.BOTTOM,
            pixelOffset:new C.Cartesian2(0,-12),
            style:C.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth:3,outlineColor:C.Color.fromCssColorString('#10202a'),
            fillColor:colour,disableDepthTestDistance:Number.POSITIVE_INFINITY
          }
        }));
      }
    }
  }
  function cachedGroundDay() {
    const key=[state.lat,state.lon,absoluteHeight(),state.wallTime.slice(0,10),state.utcOffset].join('|');
    if(groundDayCache?.key!==key){
      const results=Ground.dailyRiseSet(window.Astronomy,window.AstroDirections.calculate,
        state.wallTime.slice(0,10),state.utcOffset,state.lat,state.lon,absoluteHeight());
      groundDayCache={key,data:results};
    }
    return groundDayCache.data;
  }
  function showGroundBearingReadout(day) {
    const colours={sun:'#ffc268',moon:'#c5c9ff'};
    const rows=[];
    for(const name of ['sun','moon']){
      const current=lastAstro?.[name];
      const format=entry=>entry?fmt(entry.az,1)+'°':'—';
      const rise=day[name].rise,set=day[name].set;
      rows.push('<div class="ground-bearing-row"><span class="ground-bearing-dot" style="background:'+colours[name]+'"></span>'+
        '<b>'+name.charAt(0).toUpperCase()+name.slice(1)+'</b>'+
        '<span>Rise '+format(rise)+'</span><span>Set '+format(set)+'</span>'+
        '<span>Now '+(current?fmt(current.az,1)+'° '+(current.alt<0?'↓':'↑'):'—')+'</span></div>');
    }
    $('groundBearingReadout').innerHTML=rows.join('');
  }
  function drawGroundBearings() {
    const day=cachedGroundDay();
    showGroundBearingReadout(day);
    // Only 3D planning view: camera preview uses angular sky trajectories.
    if(preview || !state.showGroundBearings)return;
    const colours={sun:'#ffc268',moon:'#c5c9ff'};
    for(const body of ['sun','moon']){
      if(!state['show'+(body==='sun'?'Sun':'Moon')])continue;
      const entries=[
        {kind:'Rise',az:day[body].rise?.az},
        {kind:'Set',az:day[body].set?.az},
        {kind:'Now',az:lastAstro[body].az,below:lastAstro[body].alt<0}
      ];
      for(const entry of entries){
        if(!Number.isFinite(entry.az))continue; // No rise/set on this local day.
        const route=Ground.sampleRay(state.lat,state.lon,entry.az,state.groundBearingLength,250);
        const points=route.map(point=>C.Cartesian3.fromDegrees(point.lon,point.lat,0));
        const current=entry.kind==='Now';
        const tint=C.Color.fromCssColorString(colours[body]).withAlpha(current?1:.7);
        const dashed=current&&entry.below;
        const material=dashed?new C.PolylineDashMaterialProperty({color:tint,dashLength:18}):tint;
        collect(viewer.entities.add({
          name:body+' '+entry.kind.toLowerCase()+' ground bearing',
          polyline:{
            positions:points,
            clampToGround:true,
            classificationType:C.ClassificationType.BOTH,
            arcType:C.ArcType.GEODESIC,
            width:current?4:2.5,
            material,
            zIndex:current?4:3
          }
        }));
        const end=route.at(-1);
        const labelColour=C.Color.fromCssColorString(colours[body]);
        collect(viewer.entities.add({
          position:C.Cartesian3.fromDegrees(end.lon,end.lat,0),
          label:{
            text:(body==='sun'?'Sun':'Moon')+' '+entry.kind.toLowerCase()+' · '+fmt(entry.az,1)+'°',
            font:'bold 12px sans-serif',
            heightReference:C.HeightReference.CLAMP_TO_GROUND,
            verticalOrigin:C.VerticalOrigin.BOTTOM,
            pixelOffset:new C.Cartesian2(0,-12),
            style:C.LabelStyle.FILL_AND_OUTLINE,outlineWidth:3,
            outlineColor:C.Color.fromCssColorString('#0c1925'),fillColor:labelColour,
            disableDepthTestDistance:Number.POSITIVE_INFINITY
          },
          point:{
            pixelSize:current?9:6,color:labelColour,
            outlineColor:C.Color.fromCssColorString('#152330'),outlineWidth:1,
            heightReference:C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance:Number.POSITIVE_INFINITY
          }
        }));
      }
    }
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
  function drawPreviewTrajectories(basis,op,colours,names) {
    const svg=$('previewTrajectories');
    svg.replaceChildren();
    if(!state.showTrajectories)return;
    const paths=cachedTrajectories();
    const ns='http://www.w3.org/2000/svg';
    const point=sample=>{
      const dir=azAltVector(basis.enu,sample.az,sample.alt);
      return Projection.project(dir,basis,op.tanHalfH,op.tanHalfV);
    };
    for(const key of ['sun','moon','core']){
      if(!state['show'+names[key]])continue;
      const data=paths[key];
      const visible={above:[],below:[]};
      for(let i=1;i<data.length;i++){
        const first=point(data[i-1]),second=point(data[i]);
        if(!first||!second)continue;
        let segments=[[first,second,data[i-1].alt>=0]];
        const before=data[i-1].alt,after=data[i].alt;
        if((before<0&&after>=0)||(before>=0&&after<0)){
          const ratio=before/(before-after);
          const middle={x:first.x+ratio*(second.x-first.x),y:first.y+ratio*(second.y-first.y)};
          segments=[[first,middle,before>=0],[middle,second,after>=0]];
        }
        for(const [a,b,above] of segments){
          const cut=Projection.clipSegment(a,b);
          if(!cut)continue;
          const x1=(cut.x1*1000).toFixed(2),y1=(cut.y1*1000).toFixed(2);
          const x2=(cut.x2*1000).toFixed(2),y2=(cut.y2*1000).toFixed(2);
          visible[above?'above':'below'].push('M'+x1+' '+y1+' L'+x2+' '+y2);
        }
      }
      for(const segment of ['below','above']){
        if(!visible[segment].length)continue;
        const path=document.createElementNS(ns,'path');
        path.setAttribute('d',visible[segment].join(' '));
        path.setAttribute('stroke',colours[key]);
        path.setAttribute('stroke-opacity',segment==='above'?'0.94':'0.55');
        path.setAttribute('stroke-width',segment==='above'?'2.5':'1.7');
        path.setAttribute('vector-effect','non-scaling-stroke');
        path.setAttribute('fill','none');
        if(segment==='below')path.setAttribute('stroke-dasharray','6 5');
        svg.append(path);
      }
    }
  }
  function drawPreviewCelestials(basis,op,colours,names) {
    const layer=$('previewCelestials');
    layer.replaceChildren();
    // All markers use angular coordinates rather than physical 3D positions.
    // Thus shell-radius changes cannot distort the camera-view overlay.
    for(const key of ['sun','moon','core']){
      if(!state['show'+names[key]])continue;
      const data=lastAstro[key],dir=azAltVector(basis.enu,data.az,data.alt);
      const coords=Projection.project(dir,basis,op.tanHalfH,op.tanHalfV);
      if(!coords?.inside)continue;
      const marker=document.createElement('div');
      marker.className='preview-body preview-'+key;
      marker.style.left=(coords.x*100).toFixed(5)+'%';
      marker.style.top=(coords.y*100).toFixed(5)+'%';
      marker.title=names[key]+' · Az '+fmt(data.az,1)+'° · Alt '+fmt(data.alt,1)+'°';
      const dot=document.createElement('span');
      dot.className='preview-body-dot';
      dot.style.backgroundColor=colours[key];
      const label=document.createElement('span');
      label.className='preview-body-label';
      label.textContent=names[key];
      marker.append(dot,label);
      layer.append(marker);
    }
  }
  function drawAstronomy(pos,basis,op) {
    try {
      const date=dateFromWall();lastAstro=window.AstroDirections.calculate(date,state.lat,state.lon,absoluteHeight());
      // Flat, discrete colours by solar phase; no interpolation, skybox or atmosphere.
      viewer.scene.backgroundColor=C.Color.fromCssColorString(Solar.skyColor(lastAstro.sun.alt));
      const colours={sun:'#ffc268',moon:'#c5c9ff',core:'#ee9bdc'};
      const names={sun:'Sun',moon:'Moon',core:'Core'};
      drawGroundBearings();
      // An arbitrary camera-centred sky shell: its radius does not affect azimuth/altitude.
      const markerRange=S.radius(state.extent,state.celestialShellScale);
      if(!preview)drawTrajectories(pos,basis,markerRange,colours);
      let html='';
      for (const key of ['sun','moon','core']) {
        const data=lastAstro[key],dir=azAltVector(basis.enu,data.az,data.alt);
        const inside=frameDirectionTest(dir,basis,op);
        html+=formatAstro(names[key],data,inside);
        const shouldShow=state['show'+names[key]];
        // Preview has its own angular overlay: no confusing long 3D rays or points.
        if(preview || !shouldShow)continue;
        const colour=C.Color.fromCssColorString(colours[key]);
        const mark=add(pos,scaled(dir,markerRange));
        // Celestial markers indicate angular direction, not a physical sightline.
        // Their all-day trajectories are drawn above; avoid 100 km marker rays.
        collect(pointLabel(mark,names[key],colour,state.celestialThroughTerrain));
      }
      $('astroReadout').innerHTML=html;
      if(preview){
        drawPreviewTrajectories(basis,op,colours,names);
        drawPreviewCelestials(basis,op,colours,names);
      }else{
        $('previewTrajectories').replaceChildren();
        $('previewCelestials').replaceChildren();
      }
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
      const target=targetCartesian(),accent=C.Color.fromCssColorString('#ffa875');
      collect(pointLabel(target,'Target',accent));
      collect(line([C.Cartesian3.fromDegrees(state.targetLon,state.targetLat,state.targetGround),target],accent.withAlpha(.7),2,true));
      collect(line([pos,target],accent.withAlpha(.45),1.6,true));
      const end=cornersAt(pos,basis,dist,op),start=cornersAt(pos,basis,tip,op);
      const shortRange=dist<=SOLID_GEOMETRY_LIMIT_M;
      if(state.showFrustum){
        const blue=C.Color.fromCssColorString('#60d0f2');
        outline(end,blue,2.6);outline(start,blue.withAlpha(.7),1.2);
        for(let i=0;i<4;i++)collect(line([pos,end[i]],blue.withAlpha(.9),1.5));
        if(shortRange)boxFaces(start,end,blue.withAlpha(.025));
      }
      if(state.showAxis)collect(line([pos,add(pos,scaled(basis.f,dist))],C.Color.WHITE.withAlpha(.8),2,true));
      const near=op.near,far=Math.min(op.far,dist);
      if(state.showDof && near<far && near<dist){
        const from=cornersAt(pos,basis,Math.max(.05,near),op);
        const to=cornersAt(pos,basis,far,op);
        const green=C.Color.fromCssColorString('#5de2aa');
        if(shortRange)boxFaces(from,to,green.withAlpha(.1));
        outline(from,green,3);outline(to,green.withAlpha(.75),3);
        if(!shortRange)for(let i=0;i<4;i++)collect(line([from[i],to[i]],green.withAlpha(.55),1));
      }
      if(state.showFocus && state.focus<=dist){
        const focusCorners=cornersAt(pos,basis,state.focus,op);
        if(shortRange)collect(polygon(focusCorners,C.Color.fromCssColorString('#ffdf74').withAlpha(.14)));
        outline(focusCorners,C.Color.fromCssColorString('#ffdf74'),2);
      }
    }
    try{drawTargetAlignments();}
    catch(e){console.warn('Target alignment calculation failed',e);
      $('targetAlignmentReadout').textContent='Target rise/set calculation unavailable.';}
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
    const frame=$('cameraFrame').querySelector('.frame-inner');
    const w=viewer.canvas.clientWidth,h=viewer.canvas.clientHeight;
    if(w<=0 || h<=0)return; // Wait for Cesium's canvas to acquire its display size.
    const ratio=state.sensorWidth/state.sensorHeight;
    // Fit the *rotated* rectangle inside the map. At 90° the portrait-shaped
    // viewfinder still fits, without shrinking or rolling Cesium's terrain.
    const {width:frameWidth,height:frameHeight}=Projection.fitRotatedFrame(
      w,h,state.sensorWidth,state.sensorHeight,state.roll);
    frame.style.width=frameWidth+'px';
    frame.style.height=frameHeight+'px';
    frame.style.aspectRatio=String(ratio);
    // Basis.right turns towards physical up with positive sensor roll, hence
    // screen-coordinate rotation is the opposite sign (CSS y increases down).
    frame.style.transform=`rotate(${-state.roll}deg)`;
    // The optical sensor rectangle, not the whole canvas, defines the FOV.
    const angle=Projection.fovForFrame(state.sensorWidth,state.sensorHeight,state.focal,
      w,h,frameWidth,frameHeight);
    if(viewer.camera.frustum instanceof C.PerspectiveFrustum)viewer.camera.frustum.fov=angle;
    const op=optical();
    $('frameInfo').textContent=`${state.focal} mm · f/${state.aperture} · ${fmt(op.horizontalFov)}° H × ${fmt(op.verticalFov)}° V · ${fmt(state.heading)}° az / ${fmt(state.pitch)}° alt · ${fmt(state.roll,0)}° roll`;
  }
  function updatePreview() {
    if(!preview)return;
    const pos=locationCartesian(),levelBasis=cameraVectors(pos,0);
    // Cesium renders the world level, regardless of the sensor roll.
    // The rolled sensor/frame and celestial trajectories rotate *over* it.
    viewer.camera.setView({destination:pos,orientation:{direction:levelBasis.f,up:levelBasis.up}});
    viewFrustum();
  }
  function setPreviewCameraControls(active) {
    const ctrl=viewer.scene.screenSpaceCameraController;
    const keys=['enableRotate','enableTranslate','enableZoom','enableTilt','enableLook'];
    if(active){
      previewControllerState=Object.fromEntries(keys.map(key=>[key,ctrl[key]]));
      for(const key of keys)ctrl[key]=false;
    }else if(previewControllerState){
      for(const key of keys)ctrl[key]=previewControllerState[key];
      previewControllerState=null;
    }
  }
  function registerPreviewDragging() {
    const canvas=viewer.canvas;
    canvas.addEventListener('pointerdown',event=>{
      if(!preview||event.button!==0)return;
      lookPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    },true);
    canvas.addEventListener('pointermove',event=>{
      if(!preview||lookPointer?.id!==event.pointerId)return;
      const dx=event.clientX-lookPointer.x,dy=event.clientY-lookPointer.y;
      lookPointer.x=event.clientX;lookPointer.y=event.clientY;
      if(dx===0&&dy===0)return;
      const frame=$('cameraFrame').querySelector('.frame-inner');
      const hfov=deg(2*Math.atan(state.sensorWidth/(2*state.focal)));
      const vfov=deg(2*Math.atan(state.sensorHeight/(2*state.focal)));
      // Mouse moves the level world view. Sensor roll changes composition only,
      // not how the user pans the scene with the mouse.
      const angles=Projection.dragToAngles(state.heading,state.pitch,0,dx,dy,
        frame.clientWidth,frame.clientHeight,hfov,vfov);
      state.heading=angles.heading;state.pitch=angles.pitch;
      $('heading').value=state.heading;$('headingNumber').value=Number(state.heading.toFixed(2));
      $('pitch').value=state.pitch;$('pitchNumber').value=Number(state.pitch.toFixed(2));
      schedule();
      event.preventDefault();
    },true);
    const release=event=>{
      if(lookPointer?.id!==event.pointerId)return;
      lookPointer=null;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerup',release,true);
    canvas.addEventListener('pointercancel',release,true);
    canvas.addEventListener('lostpointercapture',()=>{lookPointer=null;},true);
  }
  function setPreview(active) {
    if(!viewer||active===preview)return;
    if(active) {
      overviewPose={destination:C.Cartesian3.clone(viewer.camera.positionWC),
        direction:C.Cartesian3.clone(viewer.camera.directionWC),up:C.Cartesian3.clone(viewer.camera.upWC),
        fov:viewer.camera.frustum.fov};
      // Reveal FIRST: measuring a hidden frame returns 0 × 0 and previously
      // threw inside fovForFrame, preventing the viewfinder from appearing.
      preview=true;
      $('cameraFrame').hidden=false;
      $('previewHint').hidden=false;
      document.querySelector('.maparea').classList.add('preview-active');
      setPreviewCameraControls(true);
      updatePreview();
    } else {
      preview=false;
      lookPointer=null;
      setPreviewCameraControls(false);
      $('cameraFrame').hidden=true;
      $('previewHint').hidden=true;
      document.querySelector('.maparea').classList.remove('preview-active');
      $('previewCelestials').replaceChildren();
      $('previewTrajectories').replaceChildren();
      if(overviewPose){
        viewer.camera.setView({destination:overviewPose.destination,
          orientation:{direction:overviewPose.direction,up:overviewPose.up}});
        viewer.camera.frustum.fov=overviewPose.fov;
      }
    }
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
    const useGoogleMesh=state.scene==='google' && !!googleTiles?.show;
    function applyHeight(height,source) {
      if(!stillCurrent()||!Number.isFinite(height))return false;
      state[groundKey]=height;
      $(groundId).value=Number(height.toFixed(2));
      $(amslId).value=Number((height+state[aglKey]).toFixed(2));
      $(sourceId).textContent=source;
      schedule();
      return true;
    }
    if(useGoogleMesh){
      // When placing by clicking Google 3D, the picked surface is authoritative.
      // World Terrain can differ significantly from the photogrammetric mesh.
      if(Number.isFinite(pickedHeight)){
        if(applyHeight(pickedHeight,'Google 3D clicked surface (may be roof/tree).')) {
          status((target?'Target':'Camera')+' placed on clicked Google mesh surface.');
        }
        return;
      }
      if(viewer.scene.sampleHeightSupported){
        try{
          // Query full 3D-tiles detail at coordinates, excluding our schematic overlays.
          const pos=C.Cartographic.fromDegrees(longitude,latitude);
          const result=await viewer.scene.sampleHeightMostDetailed([pos],overlays);
          if(!stillCurrent())return;
          if(applyHeight(result?.[0]?.height,'Google 3D sampled surface (may be roof/tree).')){
            status((target?'Target':'Camera')+' position updated from Google 3D surface.');
            return;
          }
        }catch(e){console.warn('Google 3D surface sampling failed',e);}
      }
    }
    // A 3D mesh may be unavailable or not loaded. Fall back explicitly,
    // never pretend that the bare-earth model exactly matches Google's mesh.
    const provider=await ensureTerrain();
    if(!stillCurrent())return;
    if(provider){
      try{
        const arr=await C.sampleTerrainMostDetailed(provider,[C.Cartographic.fromDegrees(longitude,latitude)]);
        if(!stillCurrent())return;
        if(applyHeight(arr[0]?.height,useGoogleMesh
          ? 'Fallback: World Terrain bare-earth sample; may differ from Google 3D mesh.'
          : 'Ground: Cesium World Terrain (estimated bare-earth elevation).')){
          status(useGoogleMesh?'3D mesh sample unavailable; using World Terrain estimate.':'Ground elevation sampled.');
          return;
        }
      }catch(e){console.warn('Terrain sampling failed',e);}
    }
    if(Number.isFinite(pickedHeight)){
      if(applyHeight(pickedHeight,'Picked visible surface (may be roof/tree).'))status('Used picked surface elevation.');
      return;
    }
    $(sourceId).textContent='Ground unchanged: surface height unavailable. Enter elevation manually.';
    status((target?'Target':'Camera')+' placed; using existing ground height.');
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
    // A globe/ellipsoid fallback in Google mode could silently place the
    // camera at zero elevation, underneath the photogrammetry.
    if(!p && state.scene!=='google')p=viewer.camera.pickEllipsoid(screen,C.Ellipsoid.WGS84);
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
      status('Google 3D active. Camera elevation sampled from the visible mesh where available.');
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
    $('aimTargetBtn').addEventListener('click',()=>aim('custom'));
    for(const id of ['targetLat','targetLon'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter')$('targetCoordinatesBtn').click();});
    $('targetCoordinatesBtn').addEventListener('click',()=>placeTarget(Number($('targetLat').value),Number($('targetLon').value)));
    $('targetRefineGroundBtn').addEventListener('click',()=>sampleGround({target:true}));
    $('targetProjectionLengthSlider').addEventListener('input',()=>{
      state.targetProjectionLength=Ground.fromSlider($('targetProjectionLengthSlider').value);
      $('targetProjectionLength').value=state.targetProjectionLength;
      schedule();
    });
    $('targetProjectionLength').addEventListener('change',()=>{
      state.targetProjectionLength=Ground.limitLength(Number($('targetProjectionLength').value));
      $('targetProjectionLength').value=state.targetProjectionLength;
      $('targetProjectionLengthSlider').value=Ground.toSlider(state.targetProjectionLength);
      schedule();
    });
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
    $('groundBearingLengthSlider').addEventListener('input',()=>{
      state.groundBearingLength=Ground.fromSlider($('groundBearingLengthSlider').value);
      $('groundBearingLength').value=state.groundBearingLength;
      schedule();
    });
    $('groundBearingLength').addEventListener('change',()=>{
      const n=Number($('groundBearingLength').value);
      state.groundBearingLength=Ground.limitLength(Number.isFinite(n)?n:Ground.DEFAULT_LENGTH);
      $('groundBearingLength').value=state.groundBearingLength;
      $('groundBearingLengthSlider').value=Ground.toSlider(state.groundBearingLength);
      schedule();
    });
    for(const id of ['showFrustum','showDof','showFocus','showAxis','showSun','showMoon','showCore','showTrajectories','showGroundBearings','celestialThroughTerrain',
      'targetSunRise','targetSunSet','targetMoonRise','targetMoonSet',
      'targetShowBody','targetShowCameras'])
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
    $('solarEventsBody').addEventListener('click',e=>{
      const button=e.target.closest('button[data-event-time]');
      if(!button)return;
      const milliseconds=Number(button.dataset.eventTime);
      if(!Number.isFinite(milliseconds))return;
      setWallFromUtc(new Date(milliseconds));
      renderFields();
      schedule();
    });
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
    window.addEventListener('resize',()=>{if(preview){viewFrustum();viewer.scene.requestRender();}});
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
    viewer.scene.backgroundColor=C.Color.BLACK;
    // Use the camera pose for the planning camera, not the Cesium viewport camera.
    viewer.camera.setView({destination:C.Cartesian3.fromDegrees(state.lon,state.lat,state.ground+2500),
      orientation:{heading:rad(10),pitch:rad(-45),roll:0}});
    viewer.screenSpaceEventHandler.setInputAction(e=>onPlace(e.position),C.ScreenSpaceEventType.LEFT_CLICK);
    registerPreviewDragging();
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
