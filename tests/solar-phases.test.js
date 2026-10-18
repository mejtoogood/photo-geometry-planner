'use strict';
const assert=require('node:assert/strict');
const solar=require('../solar-phases.js');
assert.equal(solar.skyColor(-90),'#000000');
assert.equal(solar.skyColor(20),'#76b7e2');
assert.equal(solar.phaseName(-20),'Night');
assert.equal(solar.phaseName(-15),'Astronomical twilight');
assert.equal(solar.phaseName(-9),'Nautical twilight');
assert.equal(solar.phaseName(-5),'Blue hour');
assert.equal(solar.phaseName(0),'Sunrise / sunset');
assert.equal(solar.phaseName(7),'Day');
assert.equal(solar.phaseName(-5.75),'Civil twilight');
assert.equal(solar.phaseName(-5),'Blue hour');
assert.equal(solar.phaseName(-3),'Golden hour');
assert.equal(solar.phaseName(1),'Golden hour');
assert.equal(solar.skyColor(-5.75),solar.PHASE_COLORS.civil);
assert.equal(solar.skyColor(-5),solar.PHASE_COLORS.blue);
assert.equal(solar.skyColor(0),solar.PHASE_COLORS.sun);
assert.equal(solar.skyColor(2),solar.PHASE_COLORS.golden);
for(const key of ['astronomical','nautical','civil','sun','blue','golden'])assert.match(solar.PHASE_COLORS[key],/^#[0-9a-f]{6}$/);
assert.notEqual(solar.skyColor(-5.9),solar.skyColor(-5.4));
assert.equal(solar.skyColor(-5.4),solar.skyColor(-5.0),'Same phase must have identical colour; no gradient');
assert.equal(solar.localDayStart('2026-10-18',11).toISOString(),'2026-10-17T13:00:00.000Z');
assert.equal(solar.formatTime(null,11),'—');
const calls=[];
global.Astronomy={
  Observer:class{constructor(lat,lon,height){this.lat=lat;this.lon=lon;this.height=height;}},
  SearchAltitude(body,observer,direction,start,limit,angle){
    assert.equal(body,'Sun');assert.equal(limit,1);calls.push({angle,direction});
    return {date:new Date(start.getTime()+(direction===1?6:17)*3600000+angle*60000)};
  },
  SearchRiseSet(body,observer,direction,start,limit){
    calls.push({body,direction});
    return {date:new Date(start.getTime()+(direction===1?7:18)*3600000)};
  }
};
const info=solar.calculateDay('2026-10-18',11,-35.3,149.1,575);
const rows=solar.toRows(info);
assert.equal(rows.length,6);
assert.deepEqual(rows.map(r=>r.key),['astronomical','nautical','civil','sun','blue','golden']);
assert.equal(calls.length,12);
assert.equal(rows[3].morning.text,'07:00');
assert.equal(rows[3].evening.text,'18:00');
assert.ok(rows[4].morning.time instanceof Date);
assert.ok(rows[5].evening.time instanceof Date);
assert.ok(rows[4].morning.text.includes('–'));
assert.ok(rows[5].evening.text.includes('–'));
delete global.Astronomy;
console.log('Solar phase tests passed');
