/* astro.js — real positional astronomy for the Star Map poster.
 *
 * Pure math, no dependencies. Works in the browser (window.Astro) and in
 * Node (module.exports) so the exact same code that draws the poster is
 * the code exercised by the numeric self-tests in test/.
 *
 * Conventions:
 *  - RA in hours (0-24), Dec in degrees, lat/lon in degrees (lon +east).
 *  - Azimuth measured from true north, increasing eastward (0=N, 90=E).
 *  - Star positions are ICRS/J2000 catalogue values; precession over
 *    +/- a few decades shifts positions by well under a degree, which is
 *    below poster resolution, so J2000 coordinates are used directly.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Astro = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function norm360(d) { d = d % 360; return d < 0 ? d + 360 : d; }

  /* Julian Day from a JS Date (UTC). */
  function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }

  /* Greenwich Mean Sidereal Time in degrees (IAU 1982 expression). */
  function gmstDeg(jd) {
    var T = (jd - 2451545.0) / 36525;
    var g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
      + 0.000387933 * T * T - (T * T * T) / 38710000;
    return norm360(g);
  }

  /* Local sidereal time in degrees for east longitude lonDeg. */
  function lstDeg(jd, lonDeg) { return norm360(gmstDeg(jd) + lonDeg); }

  /* Equatorial -> horizontal. raH hours, decDeg, lstDeg, latDeg.
     Returns {alt, az} in degrees. */
  function altAz(raH, decDeg, lst, latDeg) {
    var H = norm360(lst - raH * 15);
    if (H > 180) H -= 360;
    var Hr = H * D2R, dec = decDeg * D2R, lat = latDeg * D2R;
    var sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(Hr);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
    var az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * R2D;
    if (Math.sin(Hr) > 0) az = 360 - az;
    return { alt: alt * R2D, az: az };
  }

  /* Zenith-centred stereographic projection onto the unit disc.
     alt 90 -> (0,0) zenith; alt 0 -> radius 1 (horizon). North up. */
  function project(altDeg, azDeg) {
    var rho = Math.tan((90 - altDeg) / 2 * D2R); // tan(zenith distance / 2)
    var az = azDeg * D2R;
    return { x: rho * Math.sin(az), y: -rho * Math.cos(az), r: rho };
  }

  /* --- Milky Way band -------------------------------------------------
   * The galactic plane is rendered from its true position: sample points
   * along galactic latitude b=0 are converted galactic -> equatorial
   * (J2000 constants: NGP at RA 192.859508 deg, Dec +27.128336 deg,
   * galactic longitude of the north celestial pole 122.932 deg), then to
   * horizontal coordinates for the observer. The renderer strokes these
   * polylines with a wide soft brush: position is real, the glow is art.
   */
  var NGP_RA = 192.859508, NGP_DEC = 27.128336, L_NCP = 122.932;
  function galacticToEquatorial(lDeg, bDeg) {
    var b = bDeg * D2R, dl = (L_NCP - lDeg) * D2R;
    var decP = NGP_DEC * D2R;
    var sinDec = Math.sin(decP) * Math.sin(b) + Math.cos(decP) * Math.cos(b) * Math.cos(dl);
    var dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
    var y = Math.cos(b) * Math.sin(dl);
    var x = Math.cos(decP) * Math.sin(b) - Math.sin(decP) * Math.cos(b) * Math.cos(dl);
    var ra = norm360(NGP_RA + Math.atan2(y, x) * R2D);
    return { raH: ra / 15, dec: dec * R2D };
  }

  /* Above-horizon runs of the galactic equator for an observer.
     Returns an array of segments; each segment is an array of {alt, az}. */
  function milkyWaySegments(lst, latDeg, stepDeg) {
    stepDeg = stepDeg || 3;
    var segments = [], cur = null;
    for (var l = 0; l <= 360; l += stepDeg) {
      var eq = galacticToEquatorial(l % 360, 0);
      var hz = altAz(eq.raH, eq.dec, lst, latDeg);
      if (hz.alt > -2) {
        if (!cur) { cur = []; segments.push(cur); }
        cur.push(hz);
      } else {
        cur = null;
      }
    }
    return segments.filter(function (s) { return s.length > 1; });
  }

  /* Star disc radius (px at reference size) and opacity from magnitude. */
  function starSize(mag) {
    var s = 3.4 - 0.52 * mag;         // mag -1.5 -> ~4.2, mag 4.85 -> ~0.9
    return Math.max(0.7, s);
  }
  function starAlpha(mag) {
    var a = 1.06 - 0.155 * mag;
    return Math.max(0.35, Math.min(1, a));
  }

  return {
    julianDay: julianDay,
    gmstDeg: gmstDeg,
    lstDeg: lstDeg,
    altAz: altAz,
    project: project,
    galacticToEquatorial: galacticToEquatorial,
    milkyWaySegments: milkyWaySegments,
    starSize: starSize,
    starAlpha: starAlpha,
    norm360: norm360
  };
});
