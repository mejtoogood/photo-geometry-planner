/* Schematic celestial geometry: distance is visual only, not orbital distance. */
(function (root) {
  'use strict';
  const MIN_SCALE=1.5;
  const MAX_SCALE=10;
  const DEFAULT_SCALE=3;
  function sanitiseScale(value) {
    const n=Number(value);
    return Number.isFinite(n) ? Math.min(MAX_SCALE,Math.max(MIN_SCALE,n)) : DEFAULT_SCALE;
  }
  function radius(extent,scale=DEFAULT_SCALE) {
    const e=Number(extent);
    if(!Number.isFinite(e) || e<=0)throw new RangeError('Projection extent must be positive and finite.');
    return e*sanitiseScale(scale);
  }
  const api={MIN_SCALE,MAX_SCALE,DEFAULT_SCALE,sanitiseScale,radius};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.SkyShell=api;
})(typeof window!=='undefined' ? window : globalThis);
