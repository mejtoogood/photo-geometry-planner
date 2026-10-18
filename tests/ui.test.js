'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
for (const required of ['focalSlider','apertureSlider','focusSlider','targetLat','targetLon','targetGround','targetAgl','targetAmsl','targetPickBtn','aimTarget','aimTargetBtn','showTrajectories','celestialShellScale','celestialShellReadout','celestialThroughTerrain'])
  assert.ok(ids.includes(required),`Missing ${required}`);
for(const match of app.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(ids.includes(match[1]),`JavaScript references missing HTML element: ${match[1]}`);
}
const scripts=['optics.js','astro.js','controls.js','sky-shell.js','app.js'];
for(const s of scripts)assert.ok(html.includes(`src="${s}?`),`${s} not loaded`);
assert.ok(html.indexOf('controls.js')<html.indexOf('app.js'),'Lens module must load before app');
assert.ok(html.indexOf('sky-shell.js')<html.indexOf('app.js'),'Sky-shell calculations must load before app');
assert.ok(!app.includes('clamp(state.extent*.9,100,3000)'), 'Old capped celestial radius must be removed');
assert.ok(app.includes('S.radius(state.extent,state.celestialShellScale)'), 'Celestial display distance must use the adjustable shell radius');
assert.ok(app.includes('depthFailMaterial'), 'Celestial through-terrain rendering must use depth-fail material');
console.log('UI references tests passed');
