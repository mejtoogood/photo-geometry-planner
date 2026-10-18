/* Pure optical calculations: distances in metres except focal length and CoC in mm. */
(function (root) {
  'use strict';
  function calculate({sensorWidth, sensorHeight, focal, aperture, focus, coc}) {
    const vals = [sensorWidth,sensorHeight,focal,aperture,focus,coc].map(Number);
    if (vals.some(x => !Number.isFinite(x) || x <= 0)) throw new Error('Optical parameters must be positive numbers.');
    const [w,h,f,n,s,c] = vals;
    const focusMm = s * 1000;
    // Thin-lens, symmetric acceptable circle-of-confusion model.
    if (focusMm <= f) throw new Error('Focus distance must exceed focal length.');
    const hyper0Mm = f*f/(n*c);
    const hyperMm = hyper0Mm + f;
    // Consistent object-distance thin-lens model: far is infinite at focus=hyperfocal.
    const nearMm = hyper0Mm*focusMm/(hyper0Mm + (focusMm-f));
    const farDenominator = hyper0Mm - (focusMm-f);
    const farMm = farDenominator > 0 ? hyper0Mm*focusMm/farDenominator : Infinity;
    return {
      horizontalFov: 2*Math.atan(w/(2*f))*180/Math.PI,
      verticalFov: 2*Math.atan(h/(2*f))*180/Math.PI,
      diagonalFov: 2*Math.atan(Math.hypot(w,h)/(2*f))*180/Math.PI,
      hyperfocal: hyperMm/1000,
      near: nearMm/1000,
      far: farMm/1000,
      total: Number.isFinite(farMm) ? (farMm-nearMm)/1000 : Infinity,
      tanHalfH: w/(2*f), tanHalfV: h/(2*f)
    };
  }
  const api = {calculate};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.Optics=api;
})(typeof window !== 'undefined' ? window : globalThis);
