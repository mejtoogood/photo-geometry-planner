'use strict';
const assert=require('node:assert/strict');
const P=require('../preview-projection');
const basis={f:{x:0,y:1,z:0},right:{x:1,y:0,z:0},up:{x:0,y:0,z:1}};
const center=P.project({x:0,y:1,z:0},basis,1,2/3);
assert.ok(center.inside);
assert.equal(center.x,.5);
assert.equal(center.y,.5);
const right=P.project({x:1,y:1,z:0},basis,1,2/3);
assert.equal(right.x,1);
assert.equal(right.y,.5);
const up=P.project({x:0,y:1,z:2/3},basis,1,2/3);
assert.equal(up.y,0);
const behind=P.project({x:0,y:-1,z:0},basis,1,2/3);
assert.equal(behind,null);
const banked={f:basis.f,right:{x:0,y:0,z:1},up:{x:-1,y:0,z:0}};
assert.equal(P.project({x:1,y:1,z:0},banked,1,2/3).y,1.25);
const fov=P.fovForFrame(36,24,50,1200,800,900,600);
assert.ok(Math.abs(fov-2*Math.atan(.36*1200/900))<1e-12);
assert.throws(()=>P.fovForFrame(36,24,50,0,800,900,600));
const crossing=P.clipSegment({x:-.5,y:.5},{x:1.5,y:.5});
assert.deepEqual(crossing,{x1:0,y1:.5,x2:1,y2:.5});
assert.equal(P.clipSegment({x:-2,y:-1},{x:-1,y:2}),null);
assert.equal(P.clipSegment(null,{x:0,y:0}),null);
assert.deepEqual(P.clipSegment({x:.2,y:.1},{x:.8,y:.9}),{x1:.2,y1:.1,x2:.8,y2:.9});
const drag=P.dragToAngles(90,10,0,100,-50,1000,600,80,40);
assert.ok(drag.heading<90,'Drag right should move the sky right, rotating heading left');
assert.ok(drag.pitch<10,'Drag up should lower the optical axis');
assert.equal(P.dragToAngles(359,88,0,-100,-100,100,100,90,60).pitch,28);
assert.equal(P.dragToAngles(10,20,0,30,20,0,0,80,50).heading,10);
// Sensor roll moves the frame, not the projected world: test the composition
// of the rolled sensor basis with its inverse CSS rotation.
const sceneDirection={x:.12,y:1,z:.17},sensorH=36,sensorV=24,focal=50;
const baseline=P.project(sceneDirection,basis,sensorH/(2*focal),sensorV/(2*focal));
for(const roll of [-180,-90,-45,0,30,90,135,180]){
  const r=roll*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  const rolledBasis={
    f:basis.f,
    right:{x:c,y:0,z:s},
    up:{x:-s,y:0,z:c}
  };
  const frame=P.fitRotatedFrame(1400,900,sensorH,sensorV,roll);
  const boxW=Math.abs(c)*frame.width+Math.abs(s)*frame.height;
  const boxH=Math.abs(s)*frame.width+Math.abs(c)*frame.height;
  assert.ok(boxW<=1400*.88+1e-6,`frame exceeds canvas width at roll ${roll}`);
  assert.ok(boxH<=900*.84+1e-6,`frame exceeds canvas height at roll ${roll}`);
  const local=P.project(sceneDirection,rolledBasis,sensorH/(2*focal),sensorV/(2*focal));
  assert.ok(local?.inside,'direction should remain inside sensor for these angles');
  const worldPixel=P.unrollPixel((local.x-.5)*frame.width,(local.y-.5)*frame.height,roll);
  const intendedPixel={x:(baseline.x-.5)*frame.width,y:(baseline.y-.5)*frame.height};
  assert.ok(Math.abs(worldPixel.x-intendedPixel.x)<1e-8,`world x shifted by roll ${roll}`);
  assert.ok(Math.abs(worldPixel.y-intendedPixel.y)<1e-8,`world y shifted by roll ${roll}`);
}
assert.throws(()=>P.fitRotatedFrame(0,900,36,24,0),RangeError);
assert.throws(()=>P.fitRotatedFrame(1400,900,36,24,NaN),RangeError);
console.log('Camera preview projection tests passed');
