'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
for (const required of ['focalSlider','apertureSlider','focusSlider','targetLat','targetLon','targetGround','targetAgl','targetAmsl','targetPickBtn','aimTarget','aimTargetBtn','showTrajectories'])
  assert.ok(ids.includes(required),`Missing ${required}`);
for(const match of app.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(ids.includes(match[1]),`JavaScript references missing HTML element: ${match[1]}`);
}
const scripts=['optics.js','astro.js','controls.js','app.js'];
for(const s of scripts)assert.ok(html.includes(`src="${s}?`),`${s} not loaded`);
assert.ok(html.indexOf('controls.js')<html.indexOf('app.js'),'Lens module must load before app');
console.log('UI references tests passed');
