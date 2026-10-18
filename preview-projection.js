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
  const api={project,fovForFrame};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PreviewProjection=api;
})(typeof window!=='undefined'?window:globalThis);
