'use strict';
const assert=require('node:assert/strict');
const G=require('../ground-bearings');
function close(actual,expected,tol=1e-4){assert.ok(Math.abs(actual-expected)<tol,actual+' vs '+expected);}
close(G.destination(0,0,90,1000).lon,.00898315284,1e-7);
close(G.destination(0,0,0,1000).lat,.00904369477,1e-7);
close(G.destination(0,0,180,1000).lat,-.00904369477,1e-7);
assert.equal(G.destination(-35.3,149.125,0,0).lat,-35.3);
assert.equal(G.sampleRay(-35.3,149.125,90,5000,500).length,11);
assert.equal(G.limitLength(-10),100);
assert.equal(G.limitLength(999999),50000);
assert.equal(G.limitLength(Number.NaN),3000);
assert.equal(G.fromSlider(0),100);
assert.equal(G.fromSlider(1000),50000);
for(const length of [100,250,1000,3000,10000,50000])
  assert.ok(Math.abs(G.fromSlider(G.toSlider(length))-length)/length<.005);
assert.equal(G.startUtc('2026-10-18',11).toISOString(),'2026-10-17T13:00:00.000Z');
const requests=[];
const astronomy={
  Observer:class{constructor(lat,lon,height){this.lat=lat;this.lon=lon;this.height=height;}},
  SearchRiseSet(body,observer,dir,start,days){
    requests.push({body,dir,days});
    if(body==='Moon'&&dir===-1)return null; // No lunar setting that day.
    const hrs=body==='Sun'?(dir===1?6:18):8;
    return {date:new Date(start.getTime()+hrs*3600000)};
  }
};
const result=G.dailyRiseSet(astronomy,(date)=>({
  sun:{az:date.getUTCHours()===19?72:285},
  moon:{az:115}
}),'2026-10-18',11,-35.3,149.1,576);
assert.equal(requests.length,4);
assert.equal(result.sun.rise.az,72);
assert.equal(result.sun.set.az,285);
assert.equal(result.moon.rise.az,115);
assert.equal(result.moon.set,null);
const targetEvents=G.targetAlignments(astronomy,(date)=>({
  sun:{az:72},moon:{az:115}
}),'2026-10-18',11,-35.3,149.1,576);
assert.equal(targetEvents.length,4);
assert.deepEqual(targetEvents.map(e=>e.body+e.event),['sunrise','sunset','moonrise','moonset']);
assert.equal(targetEvents[0].celestialAz,72);
assert.equal(targetEvents[0].cameraAz,252);
assert.equal(targetEvents[2].cameraAz,295);
assert.equal(targetEvents[3].celestialAz,null);
assert.equal(targetEvents[3].cameraAz,null);
assert.equal(G.oppositeAzimuth(270),90);
assert.equal(G.oppositeAzimuth(90),270);
assert.equal(G.oppositeAzimuth(350),170);
assert.equal(G.oppositeAzimuth(-10),170);
assert.throws(()=>G.oppositeAzimuth(Number.NaN));
console.log('Ground-bearing geodesic, target alignment, and rise/set tests passed');