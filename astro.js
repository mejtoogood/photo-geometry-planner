/* Directions are true-north azimuth / horizon altitude in degrees. */
(function (root) {
  'use strict';
  const r = Math.PI / 180;
  // J2000 approximate ICRS coordinates of Sagittarius A*, as a directional marker.
  const GC_RA_DEG = 266.416837;
  const GC_DEC_DEG = -29.007806;
  function calculate(date, lat, lon, altitudeM) {
    if (!root.Astronomy) throw new Error('Astronomy Engine failed to load.');
    const A = root.Astronomy;
    const observer = new A.Observer(lat, lon, altitudeM);
    const results = {};
    for (const name of ['Sun', 'Moon']) {
      const eq = A.Equator(name, date, observer, true, true);
      const horizon = A.Horizon(date, observer, eq.ra, eq.dec, 'normal');
      results[name.toLowerCase()] = {az: horizon.azimuth, alt: horizon.altitude};
    }
    const moon = A.Illumination('Moon',date);
    results.moon.phase = moon.phase_fraction;
    const ca = Math.cos(GC_RA_DEG*r), sa = Math.sin(GC_RA_DEG*r);
    const cd = Math.cos(GC_DEC_DEG*r), sd = Math.sin(GC_DEC_DEG*r);
    const vector = new A.Vector(cd*ca,cd*sa,sd,A.MakeTime(date));
    const rotated = A.RotateVector(A.Rotation_EQJ_HOR(date,observer),vector);
    const hor = A.HorizonFromVector(rotated,'normal');
    results.core = {az:hor.lon,alt:hor.lat};
    return results;
  }
  const api = {calculate};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AstroDirections = api;
})(typeof window !== 'undefined' ? window : globalThis);
