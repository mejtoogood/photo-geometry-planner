'use strict';
const assert=require('node:assert/strict');
const {calculate}=require('../optics');
function near(a,b,epsilon=1e-8){assert.ok(Math.abs(a-b)<epsilon,`${a} not close to ${b}`);}
const o=calculate({sensorWidth:36,sensorHeight:24,focal:50,aperture:8,focus:10,coc:.03});
near(o.horizontalFov,39.597752709049864);
near(o.verticalFov,26.991466561591622);
near(o.hyperfocal,(50*50/(8*.03)+50)/1000);
assert.ok(o.near<10 && o.far>10);
const hyper=calculate({sensorWidth:36,sensorHeight:24,focal:50,aperture:8,focus:o.hyperfocal,coc:.03});
assert.equal(hyper.far,Infinity);
const wide=calculate({sensorWidth:36,sensorHeight:24,focal:24,aperture:8,focus:10,coc:.03});
assert.ok(wide.horizontalFov>o.horizontalFov);
assert.throws(()=>calculate({sensorWidth:36,sensorHeight:24,focal:0,aperture:8,focus:10,coc:.03}));
console.log('Optics tests passed');
