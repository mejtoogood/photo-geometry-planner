/* Project a celestial unit direction onto the actual camera sensor frame.
   Uses the same (ECEF) forward, right and up vectors as the FOV frustum. */
(function (root) {
  'use strict';
  function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
  function project(direction,basis,tanHalfH,tanHalfV) {
    if (!(tanHalfH>0&&tanHalfV>0))throw new RangeError('Invalid sensor FOV');
    const forward=dot(direction,basis.f);
    if(!(forward>0))return null;
    const x=.5+dot(direction,basis.right)/(forward*2*tanHalfH);
    const y=.5-dot(direction,basis.up)/(forward*2*tanHalfV);
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    return {x,y,inside:x>=0&&x<=1&&y>=0&&y<=1};
  }
  function fovForFrame(sensorWidth,sensorHeight,focalLength,canvasWidth,canvasHeight,frameWidth,frameHeight) {
    if([sensorWidth,sensorHeight,focalLength,canvasWidth,canvasHeight,frameWidth,frameHeight].some(n=>!(n>0)))throw new RangeError('Invalid frame dimensions');
    const tanH=sensorWidth/(2*focalLength),tanV=sensorHeight/(2*focalLength);
    // Cesium's PerspectiveFrustum.fov is horizontal in landscape viewport, vertical in portrait.
    return canvasWidth>=canvasHeight ?
      2*Math.atan(tanH*canvasWidth/frameWidth) :
      2*Math.atan(tanV*canvasHeight/frameHeight);
  }
  // Liang-Barsky clipping to the [0,1] × [0,1] sensor rectangle.
  // Unlike simply skipping outside vertices, this preserves trajectory portions
  // that cross the frame even when both sampled endpoints lie outside it.
  function clipSegment(a,b) {
    if(!a||!b)return null;
    const dx=b.x-a.x,dy=b.y-a.y;
    let start=0,end=1;
    const edges=[[-dx,a.x],[dx,1-a.x],[-dy,a.y],[dy,1-a.y]];
    for(const [v,w] of edges){
      if(v===0){if(w<0)return null;}
      else {
        const t=w/v;
        if(v<0){if(t>end)return null;start=Math.max(start,t);}
        else {if(t<start)return null;end=Math.min(end,t);}
      }
    }
    return {x1:a.x+start*dx,y1:a.y+start*dy,x2:a.x+end*dx,y2:a.y+end*dy};
  }
  function dragToAngles(heading,pitch,roll,dx,dy,frameWidth,frameHeight,hfovDeg,vfovDeg) {
    if(frameWidth<=0||frameHeight<=0)return {heading,pitch};
    // Dragging moves the image with the cursor. Roll rotates the viewfinder
    // axes, so the same gesture must change the appropriate world az/el.
    const x=dx*hfovDeg/frameWidth;
    const y=dy*vfovDeg/frameHeight;
    const r=roll*Math.PI/180;
    const azDelta=-x*Math.cos(r)+y*Math.sin(r);
    const altDelta=y*Math.cos(r)+x*Math.sin(r);
    return {
      heading:((heading+azDelta)%360+360)%360,
      pitch:Math.max(-89,Math.min(89,pitch+altDelta))
    };
  }
  const api={project,fovForFrame,clipSegment,dragToAngles};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PreviewProjection=api;
})(typeof window!=='undefined'?window:globalThis);
