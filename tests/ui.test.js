'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
for (const required of ['focalSlider','apertureSlider','focusSlider','targetLat','targetLon','targetGround','targetAgl','targetAmsl','targetPickBtn','aimTarget','aimTargetBtn','showTrajectories','celestialShellScale','celestialShellReadout','celestialThroughTerrain','solarEventsBody','solarPhaseReadout','previewCelestials','levelRollBtn','previewHint','previewLevelBtn','projectionModeNote','frameInfo'])
  assert.ok(ids.includes(required),`Missing ${required}`);
for(const match of app.matchAll(/\$\('([^']+)'\)/g)){
  assert.ok(ids.includes(match[1]),`JavaScript references missing HTML element: ${match[1]}`);
}
const scripts=['optics.js','astro.js','controls.js','sky-shell.js','solar-phases.js','preview-projection.js','app.js'];
for(const s of scripts)assert.ok(html.includes(`src="${s}?`),`${s} not loaded`);
assert.ok(html.indexOf('controls.js')<html.indexOf('app.js'),'Lens module must load before app');
assert.ok(html.indexOf('sky-shell.js')<html.indexOf('app.js'),'Sky-shell calculations must load before app');
assert.ok(html.indexOf('solar-phases.js')<html.indexOf('app.js'),'Solar-phase module must load before app');
assert.ok(html.indexOf('preview-projection.js')<html.indexOf('app.js'),'Projection module loads before app');
assert.ok(!app.includes('clamp(state.extent*.9,100,3000)'), 'Old capped celestial radius must be removed');
assert.ok(app.includes('S.radius(state.extent,state.celestialShellScale)'), 'Celestial display distance must use the adjustable shell radius');
assert.ok(app.includes('depthFailMaterial'), 'Celestial through-terrain rendering must use depth-fail material');
assert.ok(app.includes('Solar.skyColor(lastAstro.sun.alt)'), 'Solar phase must control the sky background');
assert.ok(app.includes('Solar.PHASE_COLORS[row.key]'), 'Every solar table row must show its sky colour');
assert.ok(!app.includes('lastAstro.sun.alt>=0 ? DAY_SKY : C.Color.BLACK'), 'Old binary sky must be removed');
assert.ok(app.includes("if(preview || !shouldShow)continue;"),'No 3D celestial lines in camera view');
assert.ok(app.includes("if(shortRange)boxFaces(start,end"),'Large FOV polygon surfaces must not render');
assert.ok(app.includes("if(shortRange)boxFaces(from,to"),'Large DOF volume surfaces must not render');
assert.ok(!app.includes("collect(line([pos,mark]"),'Do not render long physical sightlines to celestial markers');
assert.ok(app.includes("scene.sampleHeightMostDetailed([pos],overlays)"),'Sample Google 3D mesh elevation before World Terrain');
assert.ok(app.includes("if(useGoogleMesh)"),'Mesh sampling must depend on active Google 3D');
assert.ok(app.includes("if(!p && state.scene!=='google')"),'No ellipsoid fallbacks in Google mode');
assert.ok(app.includes("orientation:{direction:basis.f,up:basis.up}"),'Preview camera uses optical frustum basis');
const previewSource=app.slice(app.indexOf('function setPreview(active)'),app.indexOf('function flyToCamera()'));
assert.ok(previewSource.indexOf("$('cameraFrame').hidden=false") < previewSource.indexOf('updatePreview()'),'Must show viewfinder before measuring or updating preview');
assert.ok(previewSource.includes("document.querySelector('.maparea').classList.add('preview-active')"),'Viewfinder mode activates presentation');
assert.ok(html.includes('viewfinder-corner'),'Viewfinder must contain explicit corner marks');
console.log('UI references tests passed');
