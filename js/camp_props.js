/* Campfire — props for the night clearing the guitar leads into.
   CAMP.ground()       a roughly round island of earth (r ≈ 4.2 m) floating in the void: packed dirt, short grass and clover,
                       a crumbling earthy underside with roots and rocks; rocks, cones, twigs, leaves and grass tufts scattered
   CAMP.firepit()      ring of fieldstones, ash bed, split logs in a teepee, glowing embers, static flames, sparks;
                       userData.light (PointLight), userData.setGlow(k)
   CAMP.log()          the seat log along x (L 2.0, r 0.18, axis y 0.20), bark, sawn end grain, stubs, moss; front +z
   CAMP.plants()       ferns, a shrub, tall grass, wildflowers, a sapling — in LOG coordinates (log at the origin)
   CAMP.marshmallows() green-wood roasting sticks with toasted marshmallows — in FIRE coordinates (fire at the origin)
   CAMP.fireflies()    ~40 blinking fireflies; userData.setWobble(v 0..1), userData.tick(t, dt)
   Every builder returns a THREE.Group with its origin on the ground (y = 0). Metres, y up.
   The ground's trampled clearing and its scatter keep clear of the fire and the log where room.js puts them
   (ground at z +0.2, fire at z +0.9, log at z -0.6): see FIRE_G / LOG_G below. */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, DS = THREE.DoubleSide;
  const CAMP = window.CAMP = {};
  // where the page puts things, in GROUND coordinates (the ground group sits at z = +0.2 in the page)
  const FIRE_G = { x: 0, z: 0.7 }, LOG_G = { x: 0, z: -0.8 };

  // ================================================================ maths & noise
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
  function ss(a, b, x) { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function h3(x, y, z, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function n3(x, y, z, s) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const a = lerp(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), fx), b = lerp(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), fx);
    const c = lerp(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), fx), d = lerp(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), fx);
    return lerp(lerp(a, b, fy), lerp(c, d, fy), fz) * 2 - 1;
  }
  // fbm, roughly -1..1
  function f3(x, y, z, oct, s) { let sum = 0, amp = 1, norm = 0, f = 1; for (let o = 0; o < oct; o++) { sum += amp * n3(x * f, y * f, z * f, s + o * 17); norm += amp; amp *= 0.5; f *= 2.03; } return sum / norm * 1.5; }
  // periodic lattice noise over the unit square (tileable textures); bx, by = cells across
  const LAT = {};
  function lat(nx, ny, seed) { const k = nx + 'x' + ny + ':' + seed; if (LAT[k]) return LAT[k]; const r = mulberry(seed * 7919 + nx * 31 + ny), a = new Float32Array(nx * ny); for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1; return (LAT[k] = { nx, ny, a }); }
  function lsample(L, x, y) {
    const nx = L.nx, ny = L.ny, a = L.a; let xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    xi %= nx; if (xi < 0) xi += nx; yi %= ny; if (yi < 0) yi += ny; const x1 = xi + 1 === nx ? 0 : xi + 1, y1 = yi + 1 === ny ? 0 : yi + 1;
    const r0 = yi * nx, r1 = y1 * nx; const a0 = a[r0 + xi] + (a[r0 + x1] - a[r0 + xi]) * fx, a1 = a[r1 + xi] + (a[r1 + x1] - a[r1 + xi]) * fx; return a0 + (a1 - a0) * fy;
  }
  const PFC = new Map();
  function pf(u, v, bx, by, oct, seed) {
    const key = bx * 1e9 + by * 1e5 + oct * 1e4 + seed; let Ls = PFC.get(key);
    if (!Ls) { Ls = []; for (let o = 0; o < oct; o++) Ls.push(lat(bx << o, by << o, seed + o)); PFC.set(key, Ls); }
    let s = 0, amp = 1, norm = 0; for (let o = 0; o < oct; o++) { const L = Ls[o]; s += amp * lsample(L, u * L.nx, v * L.ny); norm += amp; amp *= 0.5; } return s / norm * 1.6;
  }

  // periodic Worley (cellular) noise over the unit square: nx x ny cells; returns the shared object WR {f1, f2, id}
  const WP = new Map(), WR = { f1: 0, f2: 0, id: 0 };
  function worley(u, v, nx, ny, seed) {
    const key = nx * 1e8 + ny * 1e4 + seed; let P = WP.get(key);
    if (!P) { const r = mulberry(seed * 131 + nx * 7 + ny), a = new Float32Array(nx * ny * 2); for (let i = 0; i < a.length; i++) a[i] = 0.1 + 0.8 * r(); P = a; WP.set(key, a); }
    const x = u * nx, y = v * ny, xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, ix = ((cx % nx) + nx) % nx, iy = ((cy % ny) + ny) % ny, k = iy * nx + ix;
      const px = cx + P[k * 2] - x, py = cy + P[k * 2 + 1] - y, d = px * px + py * py;
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    WR.f1 = Math.sqrt(f1); WR.f2 = Math.sqrt(f2); WR.id = id; return WR;
  }
  const hash1 = (k, s) => h3(k, s, 7, 3);

  // ================================================================ geometry helpers
  // smooth vertex normals across coincident vertices (from kitchen_props)
  function smooth(geo, crease) {
    const cc = Math.cos(crease == null ? 1.0 : crease);
    const p = geo.attributes.position, n = p.count, keyOf = i => Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5);
    const idx = geo.index ? geo.index.array : null, tri = idx ? idx.length / 3 : n / 3, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    const faceN = new Float32Array(tri * 3), map = new Map(), vf = new Int32Array(n);
    for (let t = 0; t < tri; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      A.fromBufferAttribute(p, a); B.fromBufferAttribute(p, b); C.fromBufferAttribute(p, c);
      B.sub(A); C.sub(A); B.cross(C);
      faceN[t * 3] = B.x; faceN[t * 3 + 1] = B.y; faceN[t * 3 + 2] = B.z;
      [a, b, c].forEach(v => { vf[v] = t; const k = keyOf(v); let l = map.get(k); if (!l) map.set(k, l = []); l.push(t); });
    }
    const nn = new Float32Array(n * 3), F = new THREE.Vector3(), G = new THREE.Vector3(), S = new THREE.Vector3();
    for (let v = 0; v < n; v++) {
      const t0 = vf[v]; F.set(faceN[t0 * 3], faceN[t0 * 3 + 1], faceN[t0 * 3 + 2]).normalize(); S.set(0, 0, 0);
      const seen = new Set();
      for (const t of map.get(keyOf(v))) { if (seen.has(t)) continue; seen.add(t); G.set(faceN[t * 3], faceN[t * 3 + 1], faceN[t * 3 + 2]); const l = G.length(); if (l < 1e-12) continue; if (G.dot(F) / l >= cc) S.add(G); }
      if (S.lengthSq() < 1e-20) S.copy(F); S.normalize(); nn[v * 3] = S.x; nn[v * 3 + 1] = S.y; nn[v * 3 + 2] = S.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    return geo;
  }
  // closed loft: rows = [[ [x,y,z] x T ], ...]; duplicates the seam column and welds its normals (from kitchen_props)
  function loftClosed(rows) {
    const S = rows.length, T = rows[0].length, pos = [], uv = [], idx = [];
    for (let i = 0; i < S; i++) for (let j = 0; j <= T; j++) { const p = rows[i][j % T]; pos.push(p[0], p[1], p[2]); uv.push(j / T, 1 - i / (S - 1)); }
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < T; j++) { const a = i * (T + 1) + j, b = a + T + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < S; i++) { const a = i * (T + 1), b = a + T; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
    return g;
  }
  // tapered tube along a Catmull-Rom curve through pts; rad(t) or [r0, r1]; optional per-vertex colour fn col(t) -> [r,g,b]
  function taper(pts, rad, radial, segs, col) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const fr = curve.computeFrenetFrames(segs, false), len = curve.getLength();
    const R = typeof rad === 'function' ? rad : (t) => lerp(rad[0], rad[1], t);
    const pos = [], nor = [], uv = [], cl = [], idx = [], P = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; curve.getPointAt(t, P); const N = fr.normals[i], B = fr.binormals[i], r = R(t), c = col ? col(t) : null;
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * TAU, cx = Math.cos(a), sx = Math.sin(a);
        const nx = N.x * cx + B.x * sx, ny = N.y * cx + B.y * sx, nz = N.z * cx + B.z * sx;
        pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r); nor.push(nx, ny, nz); uv.push(j / radial, t * len); if (c) cl.push(c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setIndex(idx); return g;
  }
  // concatenate geometries (position, normal, uv, colour); missing colours become `fill`
  function merge(list, fill) {
    list = list.filter(Boolean); let nv = 0, ni = 0; const hasC = list.some(g => g.attributes.color);
    list.forEach(g => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = hasC ? new Float32Array(nv * 3) : null, I = new Uint32Array(ni);
    let ov = 0, oi = 0; const f = fill || [1, 1, 1];
    list.forEach(g => {
      const p = g.attributes.position; if (!g.attributes.normal) g.computeVertexNormals();
      P.set(p.array, ov * 3); N.set(g.attributes.normal.array, ov * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, ov * 2);
      if (C) { if (g.attributes.color) C.set(g.attributes.color.array, ov * 3); else for (let k = 0; k < p.count; k++) C.set(f, (ov + k) * 3); }
      if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) I[oi++] = a[k] + ov; } else for (let k = 0; k < p.count; k++) I[oi++] = ov + k;
      ov += p.count;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setIndex(new THREE.BufferAttribute(I, 1)); return g;
  }
  // reverse the winding (and normals) of an indexed geometry
  function flipFaces(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); g.index.needsUpdate = true; return g; }
  function setColor(geo, rgb) { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(rgb, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
  const srgb = (r, g, b) => [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), EU = new THREE.Euler();
  function xform(geo, x, y, z, rx, ry, rz, s, order) { EU.set(rx || 0, ry || 0, rz || 0, order || 'XYZ'); Q.setFromEuler(EU); if (Array.isArray(s)) SC.set(s[0], s[1], s[2]); else SC.set(s || 1, s || 1, s || 1); M4.compose(V.set(x, y, z), Q, SC); geo.applyMatrix4(M4); return geo; }
  function mk(parent, geo, mat, cast, recv) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = recv !== false; parent.add(m); return m; }
  function inst(parent, geo, mat, list, cast) {
    const im = new THREE.InstancedMesh(geo, mat, list.length); const col = new THREE.Color();
    list.forEach((o, i) => { EU.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ'); Q.setFromEuler(EU); if (Array.isArray(o.s)) SC.set(o.s[0], o.s[1], o.s[2]); else SC.set(o.s, o.s, o.s); M4.compose(V.set(o.x, o.y, o.z), Q, SC); im.setMatrixAt(i, M4); if (o.c) { col.setRGB(o.c[0], o.c[1], o.c[2]); im.setColorAt(i, col); } });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast !== false; im.receiveShadow = true; parent.add(im); return im;
  }
  // displaced rock (non-indexed icosahedron, smooth normals); flat-ish bottom
  function rockGeo(seed, detail, flat, rough, cuts) {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, rr = mulberry(seed * 977 + 1);
    const C = []; for (let k = 0; k < (cuts || 0); k++) { const a = rr() * TAU, e = (rr() - 0.3) * 1.4; C.push({ n: new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)), d: 0.6 + rr() * 0.25 }); }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + 0.22 * f3(x * 1.1 + seed, y * 1.1, z * 1.1, 3, seed) + (rough || 0.05) * f3(x * 4 + seed, y * 4, z * 4, 2, seed + 3);
      V.set(x * d, y * d, z * d);
      C.forEach(c => { const e = V.dot(c.n) - c.d; if (e > 0) V.addScaledVector(c.n, -e * 0.85); });
      if (V.y < -(flat || 0.45)) V.y = -(flat || 0.45) + (V.y + (flat || 0.45)) * 0.15;
      p.setXYZ(i, V.x, V.y, V.z);
    }
    return smooth(g, cuts ? 0.75 : PI);
  }

  // ================================================================ textures
  function pix(g, w, h, fn) { const img = g.createImageData(w, h), d = img.data, c = [0, 0, 0, 255]; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { c[3] = 255; fn(x / w, y / h, c, x, y); const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3]; } g.putImageData(img, 0, 0); }
  function wrapAt(g, w, h, x, y, m, fn) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const X = x + dx * w, Y = y + dy * h; if (X < -m || X > w + m || Y < -m || Y > h + m) continue; g.save(); g.translate(X, Y); fn(g); g.restore(); } }
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')';
  const grey = (v, a) => rgba([v, v, v], a);
  function leafPath(g, L, W) { g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(-L * 0.1, -W * 1.25, L, 0); g.quadraticCurveTo(-L * 0.1, W * 1.25, -L, 0); g.closePath(); }

  // forest-floor litter, drawn identically into the colour and the bump map (tileable 1024)
  function litter(g, w, h, bump, seed) {
    const r = mulberry(seed);
    // organic dark specks
    for (let i = 0; i < 3800; i++) { const x = r() * w, y = r() * h, s = 0.6 + r() * 1.6, dark = r() < 0.7; g.fillStyle = bump ? grey(dark ? 90 : 170, 0.5) : (dark ? rgba([40, 30, 22], 0.45) : rgba([150, 130, 105], 0.4)); g.fillRect(x, y, s, s); }
    // pine needles
    for (let i = 0; i < 520; i++) {
      const x = r() * w, y = r() * h, a = r() * TAU, L = 18 + r() * 26, cc = [[112, 62, 30], [138, 86, 44], [96, 60, 36], [150, 110, 70]][(r() * 4) | 0], al = 0.55 + r() * 0.35, bend = (r() - 0.5) * 6;
      wrapAt(g, w, h, x, y, 50, (q) => { q.rotate(a); q.strokeStyle = bump ? grey(150, 0.6) : rgba(cc, al); q.lineWidth = 0.9 + r() * 0.5; q.beginPath(); q.moveTo(-L / 2, 0); q.quadraticCurveTo(0, bend, L / 2, 0); q.stroke(); });
    }
    // small twigs
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, a = r() * TAU, L = 20 + r() * 50, wd = 1.6 + r() * 1.8, cc = [[92, 76, 62], [70, 56, 44], [110, 92, 74]][(r() * 3) | 0];
      wrapAt(g, w, h, x, y, 80, (q) => { q.rotate(a); if (!bump) { q.strokeStyle = 'rgba(0,0,0,0.35)'; q.lineWidth = wd + 1.5; q.beginPath(); q.moveTo(-L / 2 + 1, 1.2); q.lineTo(L / 2 + 1, 1.2); q.stroke(); } q.strokeStyle = bump ? grey(200) : rgba(cc); q.lineWidth = wd; q.lineCap = 'round'; q.beginPath(); q.moveTo(-L / 2, 0); q.lineTo(L / 2, (r() - 0.5) * 4); q.stroke(); });
    }
    // dry leaves and leaf fragments
    for (let i = 0; i < 150; i++) {
      const x = r() * w, y = r() * h, a = r() * TAU, L = 8 + r() * 16, W = L * (0.3 + r() * 0.2), cc = [[120, 72, 34], [142, 94, 44], [98, 62, 34], [160, 112, 56], [86, 56, 32], [128, 100, 62]][(r() * 6) | 0], al = 0.7 + r() * 0.3;
      wrapAt(g, w, h, x, y, 40, (q) => { q.rotate(a); if (!bump) { q.save(); q.translate(1.5, 1.5); leafPath(q, L, W); q.fillStyle = 'rgba(0,0,0,0.3)'; q.fill(); q.restore(); } leafPath(q, L, W); q.fillStyle = bump ? grey(175) : rgba(cc, al); q.fill(); if (!bump) { q.strokeStyle = rgba([cc[0] * 0.7, cc[1] * 0.7, cc[2] * 0.7], 0.8); q.lineWidth = 0.8; q.beginPath(); q.moveTo(-L, 0); q.lineTo(L, 0); q.stroke(); } });
    }
    // pebbles and grit
    for (let i = 0; i < 1100; i++) {
      const x = r() * w, y = r() * h, rr = i < 900 ? 0.8 + r() * 2.2 : 2.5 + r() * 5, el = 0.6 + r() * 0.4, a = r() * PI, cc = [[150, 140, 125], [118, 110, 100], [172, 158, 136], [96, 90, 84], [140, 120, 96], [180, 172, 160]][(r() * 6) | 0];
      wrapAt(g, w, h, x, y, 10, (q) => {
        q.rotate(a);
        if (bump) { const gr = q.createRadialGradient(0, 0, 0, 0, 0, rr); gr.addColorStop(0, grey(235)); gr.addColorStop(1, grey(150)); q.fillStyle = gr; q.beginPath(); q.ellipse(0, 0, rr, rr * el, 0, 0, TAU); q.fill(); return; }
        q.fillStyle = 'rgba(20,14,10,0.45)'; q.beginPath(); q.ellipse(rr * 0.25, rr * 0.3, rr * 1.05, rr * el * 1.05, 0, 0, TAU); q.fill();
        const gr = q.createRadialGradient(-rr * 0.3, -rr * 0.3, 0, 0, 0, rr); gr.addColorStop(0, rgba([cc[0] * 1.15, cc[1] * 1.15, cc[2] * 1.15])); gr.addColorStop(1, rgba([cc[0] * 0.7, cc[1] * 0.7, cc[2] * 0.7])); q.fillStyle = gr; q.beginPath(); q.ellipse(0, 0, rr, rr * el, 0, 0, TAU); q.fill();
      });
    }
  }
  const TX = {};
  function T() {
    if (TX.ok) return TX; TX.ok = true;
    const N = 1024;
    TX.dirt = LIB.canvasTex('camp_dirt', N, N, (g, w, h) => {
      pix(g, w, h, (u, v, c) => { const n1 = pf(u, v, 4, 4, 4, 11), n2 = pf(u, v, 32, 32, 2, 12), gr = Math.random() * 2 - 1; const t = clamp(0.5 + 0.55 * n1, 0, 1), k = 1 + 0.08 * n2 + 0.1 * gr; c[0] = lerp(70, 128, t) * k; c[1] = lerp(52, 104, t) * k; c[2] = lerp(37, 80, t) * k; });
      litter(g, w, h, false, 5);
    }, true);
    TX.dirtB = LIB.canvasTex('camp_dirtB', N, N, (g, w, h) => { pix(g, w, h, (u, v, c) => { const n2 = pf(u, v, 32, 32, 2, 12); c[0] = c[1] = c[2] = 120 + 35 * n2 + (Math.random() - 0.5) * 50; }); litter(g, w, h, true, 5); }, false);
    TX.grass = LIB.canvasTex('camp_grass', N, N, (g, w, h) => {
      pix(g, w, h, (u, v, c) => { const n1 = pf(u, v, 8, 8, 3, 21), gr = Math.random() * 0.16 - 0.08; c[0] = (52 + 14 * n1) * (1 + gr); c[1] = (62 + 14 * n1) * (1 + gr); c[2] = (30 + 6 * n1) * (1 + gr); });
      const r = mulberry(33);
      for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, s = 2 + r() * 5; g.fillStyle = rgba([82, 64, 44], 0.35); g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
      const pal = [[66, 92, 34], [86, 112, 42], [104, 124, 52], [58, 80, 30], [132, 132, 70], [150, 138, 84], [74, 104, 40]];
      for (let i = 0; i < 16000; i++) {
        const x = r() * w, y = r() * h, a = r() * TAU, L = 4 + r() * 11, cc = pal[(r() * pal.length) | 0], k = 0.75 + r() * 0.45;
        wrapAt(g, w, h, x, y, 16, (q) => { q.rotate(a); q.strokeStyle = 'rgba(16,20,8,0.35)'; q.lineWidth = 1.6; q.beginPath(); q.moveTo(0, 0.8); q.lineTo(L, 1.2); q.stroke(); q.strokeStyle = rgba([cc[0] * k, cc[1] * k, cc[2] * k], 0.95); q.lineWidth = 1 + r() * 0.6; q.beginPath(); q.moveTo(0, 0); q.lineTo(L, (r() - 0.5) * 2); q.stroke(); });
      }
      for (let i = 0; i < 420; i++) { // clover
        const x = r() * w, y = r() * h, a = r() * TAU, s = 2.6 + r() * 1.8, k = 0.8 + r() * 0.35;
        wrapAt(g, w, h, x, y, 14, (q) => { q.rotate(a); for (let l = 0; l < 3; l++) { const b = l * TAU / 3; q.fillStyle = 'rgba(10,16,6,0.4)'; q.beginPath(); q.arc(Math.cos(b) * s + 0.8, Math.sin(b) * s + 0.8, s, 0, TAU); q.fill(); q.fillStyle = rgba([62 * k, 104 * k, 44 * k]); q.beginPath(); q.arc(Math.cos(b) * s, Math.sin(b) * s, s, 0, TAU); q.fill(); q.fillStyle = rgba([120 * k, 150 * k, 100 * k], 0.5); q.beginPath(); q.arc(Math.cos(b) * s * 1.1, Math.sin(b) * s * 1.1, s * 0.45, PI + b - 1, PI + b + 1); q.fill(); } });
      }
      litter(g, w, h, false, 77);
    }, true);
    TX.mask = LIB.canvasTex('camp_mask', 256, 256, (g, w, h) => pix(g, w, h, (u, v, c) => { c[0] = c[1] = c[2] = clamp(128 + 120 * pf(u, v, 4, 4, 4, 41), 0, 255); }), false);
    // earthy cross-section for the island's flank: v = 1 at the turf, 0 at the bottom tip (1.47 m)
    TX.soil = LIB.canvasTex('camp_soil', N, N, (g, w, h) => {
      pix(g, w, h, (u, vv, c) => {
        const d = vv * 1.47, st = pf(u, vv, 4, 24, 3, 51), n = pf(u, vv, 16, 16, 3, 52), gr = Math.random() * 0.18 - 0.09;
        const top = ss(0.16, 0.06, d + 0.03 * n), deep = ss(0.45, 1.0, d + 0.1 * n);
        let R = lerp(lerp(84, 112, deep), 34, top), G = lerp(lerp(64, 90, deep), 26, top), B = lerp(lerp(46, 72, deep), 19, top);
        const k = 1 + 0.07 * st + 0.14 * n + gr; c[0] = R * k; c[1] = G * k; c[2] = B * k;
      });
      const r = mulberry(53);
      for (let i = 0; i < 700; i++) { const x = r() * w, y = 30 + r() * h * 0.08; g.strokeStyle = rgba([150, 120, 85], 0.35 + r() * 0.3); g.lineWidth = 0.6 + r() * 0.6; g.beginPath(); g.moveTo(x, y - 30); g.quadraticCurveTo(x + (r() - 0.5) * 12, y, x + (r() - 0.5) * 10, y + 10 + r() * 30); g.stroke(); }
      for (let i = 0; i < 140; i++) { let x = r() * w, y = h * (0.03 + r() * r() * 0.6); const wd = 0.8 + r() * 2.6; g.strokeStyle = rgba([132, 102, 72], 0.85); g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += 8 + r() * 30; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 520; i++) {
        const y = h * Math.pow(r(), 0.7), x = r() * w, s = 2 + r() * (3 + 16 * y / h), cc = [[120, 114, 104], [104, 96, 86], [140, 128, 110], [86, 80, 74]][(r() * 4) | 0];
        wrapAt(g, w, h, x, y, 30, (q) => { q.fillStyle = 'rgba(16,10,6,0.55)'; q.beginPath(); q.ellipse(1, s * 0.35, s * 1.1, s * 0.75, 0, 0, TAU); q.fill(); const gg = q.createLinearGradient(0, -s, 0, s); gg.addColorStop(0, rgba(cc.map(x => x * 1.2))); gg.addColorStop(1, rgba(cc.map(x => x * 0.55))); q.fillStyle = gg; q.beginPath(); q.ellipse(0, 0, s, s * 0.7, (r() - 0.5) * 0.6, 0, TAU); q.fill(); });
      }
    }, true);
    TX.soilB = LIB.canvasTex('camp_soilB', 512, 512, (g, w, h) => pix(g, w, h, (u, v, c) => { c[0] = c[1] = c[2] = clamp(128 + 50 * pf(u, v, 6, 20, 3, 55) + 60 * pf(u, v, 32, 32, 2, 56), 0, 255); }), false);
    TX.rock = LIB.canvasTex('camp_rock', 256, 256, (g, w, h) => pix(g, w, h, (u, v, c) => {
      const n = pf(u, v, 4, 4, 4, 61), sp = Math.random(), li = ss(0.35, 0.6, pf(u, v, 6, 6, 3, 62));
      let k = 0.85 + 0.2 * n + (sp > 0.93 ? 0.25 : sp < 0.06 ? -0.3 : 0); c[0] = lerp(196 * k, 190, li * 0.5); c[1] = lerp(190 * k, 196, li * 0.5); c[2] = lerp(180 * k, 160, li * 0.5);
    }), true);
    TX.rockB = LIB.noiseTex('camp_rockB', 256, 128, 90, 0.8);
    return TX;
  }

  // ================================================================ 1. the ground island
  const R0 = 4.2;
  function rimR(th) { const c = Math.cos(th), s = Math.sin(th); return R0 * (1 + 0.065 * f3(c * 1.2 + 3, s * 1.2, 0.5, 3, 11) + 0.018 * f3(c * 6, s * 6, 2.5, 2, 12)); }
  function segD(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
  function actD(x, z) { return Math.min(Math.hypot(x - FIRE_G.x, z - FIRE_G.z) - 0.95, segD(x, z, -1.05, LOG_G.z, 1.05, LOG_G.z) - 0.5, segD(x, z, -0.5, LOG_G.z + 0.25, 0.5, LOG_G.z + 0.6) - 0.55); }
  function trample(x, z) { return 1 - ss(-0.1, 0.85, actD(x, z) + 0.3 * f3(x * 1.3, 0.3, z * 1.3, 2, 21)); }
  function topY(x, z) { const tr = trample(x, z); return (0.035 * f3(x * 0.45, 1.7, z * 0.45, 3, 31) + 0.012 * f3(x * 2.2, 0.2, z * 2.2, 2, 32)) * (1 - 0.8 * tr) - 0.003 * tr; }
  function grassW(x, z, t) { return clamp(0.18 + 0.6 * t * t + 0.4 * f3(x * 0.7, 3, z * 0.7, 3, 41), 0, 1) * (1 - trample(x, z)); }
  // the flank: depth below the rim -> radius factor
  const SD = [0, 0.02, 0.045, 0.08, 0.12, 0.17, 0.23, 0.3, 0.38, 0.47, 0.57, 0.68, 0.8, 0.92, 1.04, 1.16, 1.27, 1.36, 1.42, 1.47];
  const SF = [1, 1.005, 1.0, 0.99, 0.986, 0.985, 0.982, 0.975, 0.965, 0.945, 0.915, 0.87, 0.8, 0.71, 0.6, 0.47, 0.33, 0.19, 0.08, 0];
  function edgeY(th) { const R = rimR(th); return topY(Math.cos(th) * R, Math.sin(th) * R) - 0.03; }
  function flank(th, d) {
    let k = SD.length - 2; for (let i = 0; i < SD.length - 1; i++) if (d <= SD[i + 1]) { k = i; break; }
    const t = clamp((d - SD[k]) / (SD[k + 1] - SD[k]), 0, 1), f = lerp(SF[k], SF[k + 1], t);
    const c = Math.cos(th), s = Math.sin(th), R = rimR(th) * f, y = edgeY(th) - d;
    const amp = 0.22 * ss(0.03, 0.3, d) * ss(1.5, 1.1, d), dr = amp * f3(c * 2.4, y * 1.9, s * 2.4, 3, 51) + 0.08 * ss(0.03, 0.14, d) * ss(1.45, 1.2, d) * f3(c * 9, y * 5, s * 9, 2, 52) + 0.035 * ss(0.03, 0.1, d) * f3(c * 22, y * 11, s * 22, 1, 53);
    const tipx = 0.35 * (1 - f), tipz = -0.2 * (1 - f);
    return [c * (R + dr) + tipx, y, s * (R + dr) + tipz];
  }

  CAMP.ground = function () {
    const t0 = T(), g = new THREE.Group(); g.name = 'ground';
    const NR = 48, NS = 180;
    // --- the top: a polar grid out to the irregular rim
    const rim = []; for (let j = 0; j < NS; j++) rim.push(rimR(j / NS * TAU));
    const pos = [0, topY(0, 0), 0], uv = [0, 0], col = [], gw = [], idx = [];
    const vcol = (x, z, t) => {
      const n = f3(x * 0.6, 5, z * 0.6, 3, 71), tr = trample(x, z), fd = Math.hypot(x - FIRE_G.x, z - FIRE_G.z), soot = ss(1.15, 0.45, fd + 0.15 * n);
      let r = 1 + 0.12 * n, gg = 1 + 0.1 * n, b = 1 + 0.08 * n;
      r = lerp(r, 0.86, tr); gg = lerp(gg, 0.8, tr); b = lerp(b, 0.76, tr);
      r = lerp(r, 0.58, soot); gg = lerp(gg, 0.55, soot); b = lerp(b, 0.54, soot);
      const lip = ss(0.93, 1.0, t); return [r * (1 - 0.25 * lip), gg * (1 - 0.25 * lip), b * (1 - 0.25 * lip)];
    };
    col.push(...vcol(0, 0, 0)); gw.push(0);
    for (let i = 1; i <= NR; i++) {
      const t = i / NR;
      for (let j = 0; j < NS; j++) {
        const th = j / NS * TAU, x = Math.cos(th) * rim[j] * t, z = Math.sin(th) * rim[j] * t;
        let y = topY(x, z); y -= 0.03 * Math.pow(ss(0.955, 1.0, t), 1.5);
        pos.push(x, y, z); uv.push(x * 0.75, z * 0.75); col.push(...vcol(x, z, t)); gw.push(grassW(x, z, t));
      }
    }
    for (let j = 0; j < NS; j++) idx.push(0, 1 + (j + 1) % NS, 1 + j);
    for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) { const a = 1 + (i - 1) * NS + j, b = 1 + (i - 1) * NS + (j + 1) % NS, c = a + NS, d = b + NS; idx.push(a, b, c, b, d, c); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); tg.setAttribute('aGrass', new THREE.Float32BufferAttribute(gw, 1));
    tg.setIndex(idx); tg.computeVertexNormals();
    const topM = LIB.mat({ c: '#ffffff', map: t0.dirt, bump: t0.dirtB, bumpScale: 0.006, rough: 0.96, env: 0.5 });
    topM.vertexColors = true;
    topM.onBeforeCompile = (sh) => {
      sh.uniforms.grassMap = { value: t0.grass }; sh.uniforms.maskMap = { value: t0.mask };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGrass;\nvarying float vGrass;\nvarying vec2 vGuv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGrass = aGrass; vGuv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D grassMap;\nuniform sampler2D maskMap;\nvarying float vGrass;\nvarying vec2 vGuv;')
        .replace('#include <map_fragment>', [
          'vec4 dA = mapTexelToLinear(texture2D(map, vGuv));',
          'vec4 dB = mapTexelToLinear(texture2D(map, vec2(vGuv.y, -vGuv.x) * 0.71 + 0.37));',
          'float mk = texture2D(maskMap, vGuv * 0.21).r;',
          'vec4 dirt = mix(dA, dB, smoothstep(0.35, 0.65, mk));',
          'vec4 gr = mapTexelToLinear(texture2D(grassMap, vGuv * 1.37 + 0.13));',
          'float gm = smoothstep(0.34, 0.68, vGrass + (texture2D(maskMap, vGuv * 0.93).r - 0.5) * 0.6 + (texture2D(maskMap, vGuv * 3.7 + 0.5).r - 0.5) * 0.35);',
          'diffuseColor *= mix(dirt, gr, gm);'].join('\n'));
    };
    topM.customProgramCacheKey = () => 'camp_ground_top';
    mk(g, tg, topM, false, true).name = 'top';
    // --- the flank and underside
    const rows = SD.map(d => { const row = []; for (let j = 0; j < NS; j++) row.push(flank(j / NS * TAU, d)); return row; });
    for (let j = 0; j < NS; j++) { const p = pos.slice((1 + (NR - 1) * NS + j) * 3, (1 + (NR - 1) * NS + j) * 3 + 3); rows[0][j] = p; }
    const fg = flipFaces(loftClosed(rows)), fuv = fg.attributes.uv, fc = new Float32Array(fuv.count * 3);
    for (let i = 0; i < SD.length; i++) for (let j = 0; j <= NS; j++) { const k = i * (NS + 1) + j; fuv.setXY(k, j / NS * 24, 1 - SD[i] / 1.47); const P = rows[i][j % NS], R0j = Math.hypot(P[0], P[2]), th = j / NS * TAU; const rec = i > 1 && i < SD.length - 2 ? clamp((R0j - rimR(th) * SF[i]) / 0.08, -1, 1) : 0; const c = (1 - 0.5 * ss(0.15, 1.3, SD[i])) * (0.75 + 0.25 * ss(0.0, 0.1, SD[i])) * (0.72 + 0.28 * ss(-0.8, 0.6, rec)); fc[k * 3] = fc[k * 3 + 1] = fc[k * 3 + 2] = c; }
    fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    const soilM = LIB.mat({ c: '#ffffff', map: t0.soil, bump: t0.soilB, bumpScale: 0.02, rough: 0.97, env: 0.3 }); soilM.vertexColors = true;
    mk(g, fg, soilM, true, true).name = 'flank';

    const r = mulberry(901);
    // --- roots hanging out of the flank
    const roots = [];
    for (let i = 0; i < 26; i++) {
      const th = r() * TAU, d = 0.06 + Math.pow(r(), 1.4) * 0.65, p0 = flank(th, d), c = Math.cos(th), s = Math.sin(th), out = 0.03 + r() * 0.06, drop = 0.1 + r() * 0.35, side = (r() - 0.5) * 0.1;
      const pts = [[p0[0] - c * 0.03, p0[1], p0[2] - s * 0.03], [p0[0] + c * out * 0.6, p0[1] - 0.02, p0[2] + s * out * 0.6], [p0[0] + c * out - s * side * 0.5, p0[1] - drop * 0.45, p0[2] + s * out + c * side * 0.5], [p0[0] + c * out * 0.8 - s * side, p0[1] - drop, p0[2] + s * out * 0.8 + c * side]];
      const r0 = 0.004 + r() * 0.01, k = 0.75 + r() * 0.4;
      roots.push(taper(pts, (t) => r0 * (1 - 0.85 * t) + 0.0008, 5, 10, () => srgb(120 * k, 92 * k, 66 * k)));
      if (r() < 0.6) { const q = pts[2]; roots.push(taper([q, [q[0] + c * 0.03 + (r() - 0.5) * 0.05, q[1] - 0.06, q[2] + s * 0.03 + (r() - 0.5) * 0.05], [q[0] + c * 0.03, q[1] - 0.14 - r() * 0.1, q[2] + s * 0.03]], [r0 * 0.4, 0.0006], 4, 6, () => srgb(130 * k, 100 * k, 72 * k))); }
    }
    mk(g, merge(roots), (() => { const m = LIB.mat({ c: '#ffffff', rough: 0.85, bump: t0.rockB, bumpScale: 0.002 }); m.vertexColors = true; return m; })(), true, true).name = 'roots';

    // --- scatter (positions on the top)
    function spot(minT, maxT, clearance) { for (let k = 0; k < 60; k++) { const th = r() * TAU, t = lerp(minT, maxT, Math.pow(r(), 0.55)), R = rimR(th) * t, x = Math.cos(th) * R, z = Math.sin(th) * R; if (actD(x, z) > clearance) return { x, z, t, th, y: topY(x, z) - 0.03 * Math.pow(ss(0.955, 1.0, t), 1.5) }; } return null; }
    // rocks: three shapes, instanced
    const rockM = LIB.mat({ c: '#ffffff', map: t0.rock, bump: t0.rockB, bumpScale: 0.004, rough: 0.82, env: 0.6 });
    const rocks = [[], [], []];
    for (let i = 0; i < 46; i++) { const p = spot(0.2, 0.98, 0.25); if (!p) continue; const s = i < 10 ? 0.07 + r() * 0.1 : 0.02 + r() * 0.04, k = 0.6 + r() * 0.35, w = r(); rocks[i % 3].push({ x: p.x, y: p.y + s * 0.15, z: p.z, ry: r() * TAU, rx: (r() - 0.5) * 0.3, s: [s * (1 + r() * 0.5), s * (0.55 + r() * 0.3), s], c: srgb(lerp(150, 175, w) * k, lerp(146, 160, w) * k, lerp(140, 140, w) * k) }); }
    for (let i = 0; i < 18; i++) { const th = r() * TAU, d = 0.08 + r() * 0.75, p = flank(th, d), s = 0.05 + r() * 0.12, k = 0.55 + r() * 0.3; rocks[i % 3].push({ x: p[0] - Math.cos(th) * s * 0.4, y: p[1], z: p[2] - Math.sin(th) * s * 0.4, ry: r() * TAU, rx: r() * 3, s: [s, s * 0.7, s * 0.9], c: srgb(150 * k, 140 * k, 128 * k) }); }
    rocks.forEach((l, i) => l.length && inst(g, rockGeo(i * 3.7 + 1, i === 0 ? 2 : 1, 0.4, 0.06, i), rockM, l));
    // pine cones
    const cone = (() => {
      const parts = [setColor(new THREE.LatheGeometry([[0, -0.04], [0.008, -0.036], [0.014, -0.02], [0.016, 0], [0.013, 0.02], [0.007, 0.034], [0, 0.04]].map(p => new THREE.Vector2(p[0], p[1])), 8), srgb(70, 48, 30))];
      for (let i = 0; i < 46; i++) {
        const t = i / 46, y = lerp(-0.036, 0.034, t), a = i * 2.39996, rr = 0.016 * Math.sin(PI * (0.08 + 0.9 * t)) + 0.002, sc = new THREE.PlaneGeometry(0.011, 0.012 * (0.6 + 0.5 * Math.sin(PI * t)), 1, 1);
        sc.translate(0, 0.006, 0); xform(sc, Math.cos(a) * rr, y, Math.sin(a) * rr, 0, 0, 0, 1);
        const m = new THREE.Matrix4().makeRotationY(-a + PI / 2); const m2 = new THREE.Matrix4().makeRotationX(-0.9 - 0.3 * t);
        sc.translate(-Math.cos(a) * rr, -y, -Math.sin(a) * rr); sc.applyMatrix4(m2); sc.applyMatrix4(m); sc.translate(Math.cos(a) * rr, y, Math.sin(a) * rr);
        const k = 0.8 + 0.4 * ((i * 7) % 5) / 5; parts.push(setColor(sc, srgb(118 * k, 78 * k, 44 * k)));
      }
      return merge(parts);
    })();
    const coneM = LIB.mat({ c: '#ffffff', rough: 0.8, side: DS }); coneM.vertexColors = true;
    const cones = []; for (let i = 0; i < 14; i++) { const p = spot(0.35, 0.95, 0.3); if (p) cones.push({ x: p.x, y: p.y + 0.012, z: p.z, ry: r() * TAU, rz: PI / 2 + (r() - 0.5) * 0.3, order: 'YZX', s: 0.8 + r() * 0.5 }); }
    inst(g, cone, coneM, cones);
    // fallen twigs (three shapes)
    const twigM = LIB.mat({ c: '#ffffff', rough: 0.85, bump: t0.rockB, bumpScale: 0.0015 }); twigM.vertexColors = true;
    for (let v = 0; v < 3; v++) {
      const L = 0.25 + v * 0.12, br = srgb(86, 70, 56);
      const tw = merge([taper([[-L / 2, 0, 0], [-L / 6, 0.006, 0.01], [L / 6, 0.004, -0.008], [L / 2, 0, 0.004]], [0.006 - v * 0.001, 0.002], 5, 10, () => br), taper([[-L / 8, 0.004, 0], [0, 0.008, 0.04], [L / 12, 0.006, 0.08 + v * 0.02]], [0.003, 0.001], 4, 5, () => br)]);
      const list = []; for (let i = 0; i < 12; i++) { const p = spot(0.25, 0.98, 0.2); if (p) { const k = 0.7 + r() * 0.5; list.push({ x: p.x, y: p.y + 0.004, z: p.z, ry: r() * TAU, s: 0.7 + r() * 0.6, c: [k, k * 0.95, k * 0.9] }); } }
      inst(g, tw, twigM, list);
    }
    // fallen leaves (bent cards)
    const leafTex = LIB.canvasTex('camp_leaf_dry', 128, 64, (q, w, h) => { q.clearRect(0, 0, w, h); q.save(); q.translate(w / 2, h / 2); leafPath(q, 60, 18); q.fillStyle = '#d9c4a0'; q.fill(); q.strokeStyle = 'rgba(90,60,30,0.7)'; q.lineWidth = 1.5; q.beginPath(); q.moveTo(-60, 0); q.lineTo(60, 0); q.stroke(); for (let k = -4; k <= 4; k++) { q.beginPath(); q.moveTo(k * 11, 0); q.lineTo(k * 11 + 10, -14); q.moveTo(k * 11, 0); q.lineTo(k * 11 + 10, 14); q.stroke(); } q.restore(); }, true);
    const leafG = new THREE.PlaneGeometry(0.06, 0.03, 2, 1); { const p = leafG.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.004 * Math.abs(p.getX(i)) / 0.03 + 0.003 * Math.abs(p.getY(i)) / 0.015); leafG.rotateX(-PI / 2); leafG.computeVertexNormals(); }
    const leafM = LIB.mat({ c: '#ffffff', map: leafTex, rough: 0.75, side: DS }); leafM.alphaTest = 0.5;
    const leaves = []; const lpal = [[0.62, 0.32, 0.1], [0.7, 0.45, 0.16], [0.45, 0.26, 0.11], [0.75, 0.6, 0.25], [0.5, 0.36, 0.18]];
    for (let i = 0; i < 170; i++) { const p = spot(0.1, 0.99, -0.2 + 0.4 * r()); if (!p) continue; const c = lpal[(r() * 5) | 0], k = 0.7 + r() * 0.4; leaves.push({ x: p.x, y: p.y + 0.004, z: p.z, ry: r() * TAU, rx: (r() - 0.5) * 0.25, s: 0.6 + r() * 0.8, c: [c[0] * k, c[1] * k, c[2] * k] }); }
    inst(g, leafG, leafM, leaves, false);
    // grass tufts: three upright shapes + a draping one for the rim
    const grassM = LIB.mat({ c: '#ffffff', rough: 0.72, side: DS, env: 0.5 }); grassM.vertexColors = true;
    function tuft(seed, n, h0, h1, lean, droop) {
      const rr = mulberry(seed), pos = [], cl = [], idx = []; let base = 0;
      for (let b = 0; b < n; b++) {
        const a = rr() * TAU, ox = Math.cos(a) * rr() * 0.025, oz = Math.sin(a) * rr() * 0.025, h = lerp(h0, h1, rr()), w = 0.0028 + rr() * 0.002, la = lean * (0.4 + rr()), dr = droop * (0.5 + rr());
        const dir = [Math.cos(a), Math.sin(a)], perp = [-dir[1], dir[0]], tw = (rr() - 0.5) * 0.6, cb = srgb(46, 58, 24), ct = rr() < 0.15 ? srgb(150, 140, 80) : srgb(lerp(90, 130, rr()), lerp(118, 150, rr()), lerp(40, 60, rr()));
        for (let k = 0; k <= 3; k++) {
          const s = k / 3, out = la * s * h + dr * s * s * h, up = h * s - dr * 0.6 * s * s * s * h, ww = k === 3 ? 0.0003 : w * (1 - s * 0.75), px = ox + dir[0] * out, pz = oz + dir[1] * out, pp = [perp[0] * Math.cos(tw * s) - dir[0] * Math.sin(tw * s), perp[1] * Math.cos(tw * s) - dir[1] * Math.sin(tw * s)];
          pos.push(px - pp[0] * ww, up, pz - pp[1] * ww, px + pp[0] * ww, up, pz + pp[1] * ww);
          const c = [lerp(cb[0], ct[0], s), lerp(cb[1], ct[1], s), lerp(cb[2], ct[2], s)]; cl.push(...c, ...c);
        }
        for (let k = 0; k < 3; k++) { const a0 = base + k * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
        base += 8;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const nn = geo.attributes.normal; for (let i = 0; i < nn.count; i++) { V.set(nn.getX(i) * 0.45, Math.abs(nn.getY(i)) * 0.45 + 0.55, nn.getZ(i) * 0.45).normalize(); nn.setXYZ(i, V.x, V.y, V.z); }
      return geo;
    }
    // a lawn of short grass: alpha-tested crossed cards wherever the grass shows on the ground texture
    const cardTex = LIB.canvasTex('camp_grasscard', 256, 128, (q, w, h) => {
      q.clearRect(0, 0, w, h); const rr = mulberry(611);
      for (let i = 0; i < 70; i++) {
        const x0 = 8 + rr() * (w - 16), H = h * (0.35 + rr() * 0.62), lean = (rr() - 0.5) * 50, bw = 1.6 + rr() * 2.2, k = 0.7 + rr() * 0.5, straw = rr() < 0.12;
        const gr = q.createLinearGradient(0, h, 0, h - H); gr.addColorStop(0, rgba([62 * k, 78 * k, 34 * k])); gr.addColorStop(1, straw ? rgba([186, 174, 112]) : rgba([122 * k, 158 * k, 62 * k]));
        q.fillStyle = gr; q.beginPath(); q.moveTo(x0 - bw, h); q.quadraticCurveTo(x0 - bw * 0.5 + lean * 0.3, h - H * 0.6, x0 + lean, h - H); q.quadraticCurveTo(x0 + bw * 0.5 + lean * 0.3, h - H * 0.6, x0 + bw, h); q.closePath(); q.fill();
      }
    }, true);
    const cardM = LIB.mat({ c: '#ffffff', map: cardTex, rough: 0.75, side: DS, env: 0.5 }); cardM.alphaTest = 0.4;
    const cardG = (() => { const a = new THREE.PlaneGeometry(0.15, 0.06); a.translate(0, 0.027, 0); const b = a.clone(); b.rotateY(PI / 2); const m = merge([a, b]); const n = m.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return m; })();
    const maskAt = (x, z) => { const fr = (t) => t - Math.floor(t); return clamp(128 + 120 * pf(fr(x * 0.75 * 0.93), 1 - fr(z * 0.75 * 0.93), 4, 4, 4, 41), 0, 255) / 255; };
    const cardsL = [];
    for (let i = 0; i < 7000 && cardsL.length < 2300; i++) {
      const th = r() * TAU, t = Math.sqrt(r()) * 0.985, R = rimR(th) * t, x = Math.cos(th) * R, z = Math.sin(th) * R;
      const gm = ss(0.34, 0.68, grassW(x, z, t) + (maskAt(x, z) - 0.5) * 0.6); if (gm < 0.5 || r() > gm) continue;
      const k = 0.85 + r() * 0.4; cardsL.push({ x, y: topY(x, z) - 0.03 * Math.pow(ss(0.955, 1.0, t), 1.5) - 0.006, z, ry: r() * TAU, s: [0.7 + r() * 0.6, 0.5 + r() * 0.9, 0.7 + r() * 0.6], c: [k, k * (0.95 + r() * 0.1), k * 0.85] });
    }
    inst(g, cardG, cardM, cardsL, false);
    const tufts = [[], [], [], []];
    for (let i = 0; i < 200; i++) {
      const p = spot(0.25, 0.985, 0.15); if (!p) continue; const w = grassW(p.x, p.z, p.t); if (r() > w * 1.4) continue;
      const k = 0.8 + r() * 0.35; tufts[i % 3].push({ x: p.x, y: p.y - 0.005, z: p.z, ry: r() * TAU, s: [0.8 + r() * 0.6, 0.6 + r() * 0.9, 0.8 + r() * 0.6], c: [k, k, k * 0.9] });
    }
    for (let i = 0; i < 200; i++) { // along the rim, leaning out over the edge
      const th = r() * TAU, R = rimR(th) * (0.975 + r() * 0.02), x = Math.cos(th) * R, z = Math.sin(th) * R; if (actD(x, z) < 0.2) continue;
      const k = 0.8 + r() * 0.3; tufts[3].push({ x, y: topY(x, z) - 0.035, z, ry: -th, rz: -0.15 - r() * 0.35, order: 'YZX', s: [0.8 + r() * 0.6, 0.7 + r() * 0.8, 0.8 + r() * 0.5], c: [k, k, k * 0.9] });
    }
    inst(g, tuft(1, 11, 0.05, 0.12, 0.25, 0.25), grassM, tufts[0]);
    inst(g, tuft(2, 9, 0.07, 0.16, 0.3, 0.35), grassM, tufts[1]);
    inst(g, tuft(3, 14, 0.03, 0.08, 0.35, 0.2), grassM, tufts[2]);
    const drape = tuft(4, 12, 0.08, 0.18, 0.2, 0.9); drape.translate(0, 0, 0); // blades fan around; rotation tips the clump outward (+x after ry = -th)
    inst(g, drape, grassM, tufts[3]);
    g.userData.focus = { x: 0, y: 0.2, z: 0, r: 4.2 };
    g.userData.radius = R0;
    return g;
  };

  // ================================================================ shared wood textures
  // bark: a network of deep furrows strongly stretched along the trunk (they meander, merge and split), short cross-checks on the ridges
  function barkPlates(u, v) {
    const wu = u + 0.02 * pf(u, v, 3, 4, 2, 301), wv = v + 0.012 * pf(u, v, 4, 8, 2, 302);
    const n = pf(wu, wv, 3, 40, 3, 401), a = Math.abs(n);
    const crack = ss(0.34, 0.06, a), cross = ss(0.03, 0.0, Math.abs(pf(u, v, 44, 9, 1, 402))) * (1 - crack) * ss(0.1, 0.5, pf(u, v, 12, 18, 1, 403));
    return { crack, fine: cross * 0.6, e: a };
  }
  function barkPix(u, v, moss) { // u along, v around (both 0..1, periodic); returns [r,g,b,height]
    const B = barkPlates(u, v), n2 = pf(u, v, 24, 40, 2, 102) * 0.6 + pf(u, v, 96, 160, 2, 308) * 0.6, fib = pf(u, v, 80, 6, 1, 306), t = 0.5 + 0.5 * pf(u, v, 6, 20, 2, 404), li = ss(0.35, 0.75, pf(u, v, 8, 8, 3, 104));
    const sc = pf(u, v, 160, 240, 1, 309), k = 1 + 0.12 * n2 + 0.1 * fib + 0.14 * sc + (Math.random() - 0.5) * 0.2, top = ss(0.32, 0.85, B.e);
    let r = lerp(52, 78, t) * k, g = lerp(45, 68, t) * k, b = lerp(39, 58, t) * k;
    r = lerp(r, 104 * k, top * 0.55); g = lerp(g, 99 * k, top * 0.55); b = lerp(b, 90 * k, top * 0.55);
    r = lerp(r, 112, li * 0.35); g = lerp(g, 110, li * 0.35); b = lerp(b, 96, li * 0.35);
    const wall = ss(0.06, 0.16, B.e) * (1 - ss(0.2, 0.34, B.e)) * 0.65; r = lerp(r, 74, wall); g = lerp(g, 46, wall); b = lerp(b, 30, wall);
    const dk = Math.max(B.crack * 0.92, B.fine); r = lerp(r, 14, dk); g = lerp(g, 10, dk); b = lerp(b, 8, dk);
    let hgt = 60 + 150 * ss(0.05, 0.55, B.e) + 16 * n2 + 12 * fib + 14 * sc - 40 * B.fine;
    if (moss > 0) { const m = clamp(moss * (0.5 + 0.7 * B.crack) + 0.2 * moss, 0, 1), mk = 0.7 + 0.6 * Math.random(); r = lerp(r, 78 * mk, m); g = lerp(g, 104 * mk, m); b = lerp(b, 34 * mk, m); hgt = lerp(hgt, 175 + 70 * (Math.random() - 0.5), m); }
    return [r, g, b, hgt];
  }
  function endGrainTex() {
    return LIB.canvasTex('camp_endgrain', 512, 512, (g, w, h) => {
      const px = 0.53, py = 0.47;
      pix(g, w, h, (u, v, c) => {
        const dx = u - px, dy = v - py, a = Math.atan2(dy, dx), r0 = Math.hypot(u - 0.5, v - 0.5) * 2, rr = Math.hypot(dx, dy) * 2 * (1 + 0.05 * f3(Math.cos(a) * 2, Math.sin(a) * 2, 0, 2, 111));
        const ring = (rr * 26) % 1, late = ss(0.72, 0.92, ring) * ss(1.0, 0.95, ring), heart = ss(0.62, 0.5, rr), n = (Math.random() - 0.5) * 0.08;
        let R = lerp(200, 168, heart), G = lerp(166, 122, heart), B = lerp(120, 80, heart);
        const k = 1 - 0.22 * late + n; R *= k; G *= k; B *= k;
        const gy = 0.3 + 0.15 * f3(u * 4, v * 4, 1, 2, 112); R = lerp(R, 150, gy); G = lerp(G, 140, gy); B = lerp(B, 128, gy);
        const bark = ss(0.88, 0.92, r0 + 0.02 * f3(Math.cos(a) * 6, Math.sin(a) * 6, 2, 1, 113)), camb = ss(0.84, 0.88, r0) * (1 - bark);
        R = lerp(R, 118, camb * 0.6); G = lerp(G, 82, camb * 0.6); B = lerp(B, 50, camb * 0.6);
        R = lerp(R, 58, bark); G = lerp(G, 48, bark); B = lerp(B, 40, bark);
        c[0] = R; c[1] = G; c[2] = B;
      });
      const r = mulberry(115);
      g.save(); g.translate(px * w, py * h);
      for (let i = 0; i < 6; i++) { const a = r() * TAU, L0 = 0.05 + r() * 0.3, L1 = 0.84; g.fillStyle = 'rgba(28,18,10,0.9)'; g.beginPath(); g.moveTo(Math.cos(a) * L0 * w / 2, Math.sin(a) * L0 * h / 2); const wd = 0.012 + r() * 0.02; g.lineTo(Math.cos(a + wd) * L1 * w / 2, Math.sin(a + wd) * L1 * h / 2); g.lineTo(Math.cos(a - wd) * L1 * w / 2, Math.sin(a - wd) * L1 * h / 2); g.closePath(); g.fill(); }
      g.restore();
      g.strokeStyle = 'rgba(80,60,40,0.12)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(-w * 1.2, h * 0.5, w * 1.2 + i * 14 + r() * 4, -0.6, 0.6); g.stroke(); }
    }, true);
  }

  // ================================================================ 3. the seat log
  const MOSS_TH = PI * 0.7;
  function logMoss(u, v) { let d = Math.abs(((v * TAU - MOSS_TH) % TAU + TAU + PI) % TAU - PI); return ss(1.25, 0.3, d + 0.45 * pf(u, v, 10, 8, 3, 121)) * ss(-0.3, 0.6, pf(u, v, 3, 2, 2, 122) + 0.4); }
  CAMP.log = function () {
    const g = new THREE.Group(); g.name = 'log';
    const AX = 0.20, NX = 72, NT = 128;
    const KN = [{ x: 0.18, th: 0.42, a: 0.012, s: 0.045 }, { x: -0.62, th: 1.25, a: 0.01, s: 0.04 }];
    const STUBS = [{ x: 0.74, th: 2.5, r: 0.03, len: 0.06, tilt: 0.25 }, { x: -0.48, th: 3.75, r: 0.026, len: 0.045, tilt: -0.3 }];
    function radius(x, th) {
      const s = Math.sin(th), u = (x + 1) / 2, v = th / TAU;
      let r = 0.18 + 0.045 * Math.pow(Math.max(0, -s), 2);
      r *= 1 + 0.035 * x; r += 0.007 * f3(x * 1.4, Math.cos(th), Math.sin(th), 2, 131);
      r -= 0.008 * barkPlates(u, ((v % 1) + 1) % 1).crack;
      r += 0.003 * logMoss(u, ((v % 1) + 1) % 1);
      KN.concat(STUBS.map(o => ({ x: o.x, th: o.th, a: 0.012, s: 0.05 }))).forEach(k => { let dt = Math.abs(((th - k.th) % TAU + TAU + PI) % TAU - PI) * 0.19; const d2 = (x - k.x) * (x - k.x) + dt * dt; r += k.a * Math.exp(-d2 / (k.s * k.s)); });
      return r;
    }
    const xEnd = (th, e) => e > 0 ? 1.0 + 0.012 * Math.cos(th - 0.6) : -1.0 - 0.01 * Math.sin(th + 0.3);
    const surf = (x, th) => { const r = radius(x, th); return [x, AX + Math.sin(th) * r, Math.cos(th) * r]; };
    const rows = [];
    for (let i = 0; i <= NX; i++) { const s = i / NX, row = []; for (let j = 0; j < NT; j++) { const th = j / NT * TAU, x = lerp(xEnd(th, -1), xEnd(th, 1), s); const p = surf(x, th); if (i === 0 || i === NX) { const k = 0.993; p[1] = AX + (p[1] - AX) * k; p[2] *= k; } row.push(p); } rows.push(row); }
    const lg = loftClosed(rows), luv = lg.attributes.uv;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NT; j++) luv.setXY(i * (NT + 1) + j, i / NX, j / NT);
    let HB = null;
    const barkC = LIB.canvasTex('camp_bark', 1280, 560, (q, w, h) => {
      HB = new Uint8ClampedArray(w * h);
      pix(q, w, h, (u, vc, c, x, y) => { const v = 1 - vc, b = barkPix(u, v, logMoss(u, v)); c[0] = b[0]; c[1] = b[1]; c[2] = b[2]; HB[y * w + x] = b[3]; });
      // a flush knot on the front
      KN.forEach((k, i) => { const x = (k.x + 1) / 2 * w, y = (1 - k.th / TAU) * h; q.save(); q.translate(x, y); q.scale(1, 1.6); for (let rr = 26; rr > 2; rr -= 3) { q.strokeStyle = 'rgba(50,34,22,' + (0.25 + 0.04 * (26 - rr)) + ')'; q.lineWidth = 1.6; q.beginPath(); q.ellipse(0, 0, rr * 1.5, rr * 0.7, 0, 0, TAU); q.stroke(); } q.fillStyle = 'rgba(40,26,16,0.95)'; q.beginPath(); q.ellipse(0, 0, 10, 5, 0, 0, TAU); q.fill(); q.restore(); });
    }, true);
    const barkB = LIB.canvasTex('camp_barkB', 1280, 560, (q, w, h) => pix(q, w, h, (u, vc, c, x, y) => { c[0] = c[1] = c[2] = HB ? HB[y * w + x] : 128; }), false);
    const barkM = LIB.mat({ c: '#ffffff', map: barkC, bump: barkB, bumpScale: 0.014, rough: 0.92, env: 0.5 });
    mk(g, lg, barkM).name = 'bark';
    // sawn ends
    const egM = LIB.mat({ c: '#ffffff', map: endGrainTex(), bump: LIB.noiseTex('camp_egB', 256, 128, 60, 1), bumpScale: 0.002, rough: 0.88, env: 0.5 });
    [-1, 1].forEach(e => {
      const NRG = 6, pos = [], uv = [], idx = [], cx = e > 0 ? xEnd(0, 1) : xEnd(0, -1);
      const rim = rows[e > 0 ? NX : 0];
      pos.push(cx - e * 0.002, AX, 0); uv.push(0.5, 0.5);
      for (let k = 1; k <= NRG; k++) { const t = k / NRG; for (let j = 0; j < NT; j++) { const p = rim[j], cut = 0.003 * Math.sin(j / NT * TAU * 3 + k) * t * (1 - t) * 4; const x = lerp(cx - e * 0.002, p[0], t) - e * cut, y = lerp(AX, p[1], t), z = lerp(0, p[2], t); pos.push(x, y, z); uv.push(0.5 + e * z / 0.46, 0.5 + (y - AX) / 0.46); } }
      for (let j = 0; j < NT; j++) { const a = 1 + j, b = 1 + (j + 1) % NT; e > 0 ? idx.push(0, b, a) : idx.push(0, a, b); }
      for (let k = 1; k < NRG; k++) for (let j = 0; j < NT; j++) { const a = 1 + (k - 1) * NT + j, b = 1 + (k - 1) * NT + (j + 1) % NT, c = a + NT, d = b + NT; e > 0 ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d); }
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx); cg.computeVertexNormals();
      mk(g, cg, egM).name = 'end';
    });
    // cut branch stubs
    STUBS.forEach(o => {
      const p = surf(o.x, o.th), n = new THREE.Vector3(0, Math.sin(o.th), Math.cos(o.th)), d = n.clone().add(new THREE.Vector3(o.tilt, 0, 0)).normalize();
      const a = [p[0] - n.x * 0.03, p[1] - n.y * 0.03, p[2] - n.z * 0.03], b = [p[0] + d.x * o.len * 0.5, p[1] + d.y * o.len * 0.5, p[2] + d.z * o.len * 0.5], c = [p[0] + d.x * o.len, p[1] + d.y * o.len, p[2] + d.z * o.len];
      const sg = taper([a, b, c], (t) => o.r * (1 + 0.6 * (1 - t) * (1 - t)), 14, 6); mk(g, sg, barkM);
      const cap = new THREE.CircleGeometry(o.r * 1.0, 16); const m = LIB.mat({ c: '#b9a68c', map: endGrainTex(), rough: 0.9 });
      const cm = mk(g, cap, m); cm.position.set(c[0], c[1], c[2]); cm.lookAt(c[0] + d.x, c[1] + d.y, c[2] + d.z);
    });
    // a little settled earth along the bottom so the log sits IN the ground
    {
      const t0 = T(), pts = [], hx = 1.0, hz = 0.06, rc = 0.06, nc = 10, C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (let k = 0; k < 4; k++) { for (let i = 0; i < nc; i++) { const a = (k + i / (nc - 1)) * PI / 2; pts.push([C[k][0] * (hx - rc) + rc * Math.cos(a), C[k][1] * (hz - rc) + rc * Math.sin(a), Math.cos(a), Math.sin(a)]); } if (k % 2 === 0) for (let i = 1; i < 30; i++) { const x = C[k][0] * (hx - rc) * (1 - 2 * i / 30) * 1; pts.push([x, C[k][1] * hz, 0, C[k][1]]); } }
      const prof = [[-0.03, 0.025], [0.0, 0.02], [0.02, 0.019], [0.05, 0.012], [0.09, 0.004], [0.14, -0.006]];
      const rowsB = prof.map(([o, y], pi) => pts.map(([x, z, nx, nz], j) => { const n = f3(x * 6, pi, z * 6, 2, 141); return [x + nx * o, y + (pi > 0 && pi < 5 ? 0.006 * n : 0), z + nz * o * (1 + 0.4 * n)]; }));
      const bg = flipFaces(loftClosed(rowsB)), buv = bg.attributes.uv, bp = bg.attributes.position; for (let i = 0; i < bp.count; i++) buv.setXY(i, bp.getX(i) * 0.75, bp.getZ(i) * 0.75);
      const bm = LIB.mat({ c: '#c2b6aa', map: t0.dirt, bump: t0.dirtB, bumpScale: 0.006, rough: 0.96, env: 0.5 });
      mk(g, bg, bm, false, true).name = 'berm';
    }
    g.userData.focus = { x: 0, y: 0.25, z: 0, r: 1.1 };
    return g;
  };

  // ================================================================ 2. the fire pit
  function flameTex(key, seed, kind) {
    const ramp = [[0, 0, 0, 0], [0.06, 0, 0, 0], [0.14, 50, 4, 0], [0.3, 170, 34, 3], [0.5, 255, 100, 12], [0.7, 255, 172, 50], [0.86, 255, 225, 130], [1, 255, 248, 215]];
    const col = (T, c) => { T = clamp(T, 0, 1); for (let i = 1; i < ramp.length; i++) if (T <= ramp[i][0]) { const a = ramp[i - 1], b = ramp[i], t = (T - a[0]) / (b[0] - a[0]); c[0] = lerp(a[1], b[1], t); c[1] = lerp(a[2], b[2], t); c[2] = lerp(a[3], b[3], t); return; } };
    return LIB.canvasTex(key, 128, 256, (g, w, h) => pix(g, w, h, (u, vc, c) => {
      const v = 1 - vc, x = u * 2 - 1, n1 = f3(u * 2.5, v * 3.5, seed, 3, seed);
      const wob = 0.14 * Math.sin(v * 5 + seed) * v + 0.14 * n1 * v;
      const wid = (kind === 1 ? 0.55 : 0.85) * Math.pow(Math.max(0, 1 - v), 0.75) * ss(-0.08, 0.2, v) + 0.03;
      let dx = Math.abs(x - wob);
      if (kind === 2) { const sp = 0.42 * ss(0.25, 0.75, v); dx = Math.min(Math.abs(x - wob - sp), Math.abs(x - wob + sp * 0.8)); }
      const d = dx / wid + 0.38 * f3(x * 2.2, v * 4.5 - seed, seed * 1.7, 3, seed + 5) * (0.25 + v);
      const I = ss(0.85, 0.1, d) * ss(1.02, 0.6, v + 0.18 * n1) * ss(0.0, 0.07, v) * ss(1.0, 0.8, Math.abs(x)) * ss(1.0, 0.92, v);
      col(Math.pow(I, 1.5) * (1.02 - 0.6 * v), c);
    }), true);
  }
  function flameRibbon(W, H, bend, lean, twist, seed) {
    const geo = new THREE.PlaneGeometry(1, 1, 6, 10), p = geo.attributes.position, rad = Math.max(W * 0.7, 0.01);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * W, y = (p.getY(i) + 0.5) * H, ang = x / rad * bend, s = y / H;
      let X = Math.sin(ang) * rad, Z = (Math.cos(ang) - 1) * rad * bend;
      const tw = twist * s, cx = Math.cos(tw), sx = Math.sin(tw); const X2 = X * cx - Z * sx, Z2 = X * sx + Z * cx;
      p.setXYZ(i, X2 + lean[0] * s * s * H + 0.02 * Math.sin(s * 6 + seed) * s, y, Z2 + lean[1] * s * s * H);
    }
    geo.computeVertexNormals(); return geo;
  }
  function charTex(key, wood) { // u around, v along (canvas top = hot end)
    return LIB.canvasTex(key, 160, 320, (g, w, h) => pix(g, w, h, (u, vc, c) => {
      const v = 1 - vc, n = pf(u, v, 4, 8, 3, 151), ch = ss(0.42, 0.72, v + 0.12 * n);
      let R, G, B;
      if (wood) { const gr = pf(u, v, 40, 3, 2, 152); R = 178 + 22 * gr; G = 140 + 18 * gr; B = 98 + 12 * gr; }
      else { const b = barkPix(v * 0.4, u, 0); R = b[0]; G = b[1]; B = b[2]; }
      const cr = ss(0.12, 0.0, worley(u, v, 9, 22, 153).f2 - WR.f1);
      const ash = ss(0.8, 0.98, v + 0.1 * n) * ss(-0.2, 0.4, n);
      let cR = 26 - 14 * cr, cG = 23 - 13 * cr, cB = 21 - 12 * cr; cR = lerp(cR, 120, ash * 0.6); cG = lerp(cG, 116, ash * 0.6); cB = lerp(cB, 110, ash * 0.6);
      const sc = ss(0.25, 0.45, v + 0.12 * n) * (1 - ch) * 0.5;
      c[0] = lerp(lerp(R, R * 0.4, sc), cR, ch); c[1] = lerp(lerp(G, G * 0.35, sc), cG, ch); c[2] = lerp(lerp(B, B * 0.3, sc), cB, ch);
    }), true);
  }
  function emberCrackTex() {
    return LIB.canvasTex('camp_emberCrack', 160, 320, (g, w, h) => pix(g, w, h, (u, vc, c) => {
      const v = 1 - vc, n = pf(u, v, 4, 8, 3, 151), hot = ss(0.55, 0.9, v + 0.12 * n);
      const cr = ss(0.13, 0.0, worley(u, v, 9, 22, 153).f2 - WR.f1);
      const glow = hot * (cr * cr * 0.9 + 0.1 * ss(0.85, 1, v)) * (0.5 + 0.5 * ss(-0.3, 0.4, pf(u, v, 6, 6, 2, 155))) + 0.035 * ss(0.45, 0.75, v + 0.12 * n) * (1 - cr) + 0.012;
      c[0] = 255 * clamp(glow * 1.2, 0, 1); c[1] = 90 * clamp(glow * 1.1, 0, 1) + 40 * clamp(glow - 0.6, 0, 1); c[2] = 12 * glow;
    }), true);
  }
  function splitLog(L, R, kind, seed) {
    // cross-section: bark arc + split face(s); rows along y (0..L). kind 0 = half, 1 = quarter, 2 = round
    const rr = mulberry(seed), sec = [], isBark = [];
    if (kind === 2) { for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, k = 1 + 0.06 * Math.sin(a * 3 + seed) + 0.04 * (rr() - 0.5); sec.push([Math.cos(a) * R * k, Math.sin(a) * R * k * 0.92]); isBark.push(true); } }
    else {
      const a0 = 0, a1 = kind === 0 ? PI : PI / 2, nA = kind === 0 ? 9 : 6;
      for (let i = 0; i <= nA; i++) { const a = lerp(a0, a1, i / nA); sec.push([Math.cos(a) * R, Math.sin(a) * R]); isBark.push(i < nA); }
      if (kind === 0) { for (let i = 1; i < 4; i++) { sec.push([lerp(-R, R, i / 4), -0.004 * Math.sin(i)]); isBark.push(false); } }
      else { sec.push([0.002, 0.002]); isBark.push(false); sec.push([R * 0.5, 0.0]); isBark.push(false); }
    }
    const S = sec.length, NL = 10, pos = [], uv = [], idxB = [], idxW = [];
    const bw = (0.012 + rr() * 0.02) * (rr() < 0.5 ? -1 : 1), bz = (rr() - 0.5) * 0.02, sw = 0.12 * (rr() - 0.5), kn = rr(); for (let i = 0; i <= NL; i++) { const t = i / NL, y = t * L, bow = bw * Math.sin(PI * t), bowz = bz * Math.sin(PI * t * 1.5); for (let j = 0; j <= S; j++) { const q = sec[j % S], aa = Math.atan2(q[1], q[0]), knot = 0.18 * Math.exp(-((t - kn) ** 2) / 0.004) * Math.max(0, Math.cos(aa - 2)), k = (1 + sw * (t - 0.5) + knot) * (1 + 0.05 * (rr() - 0.5)) * (t > 0.92 ? 0.93 : 1); pos.push(q[0] * k + bow, y, q[1] * k + bowz); uv.push(j / S, t); } }
    for (let i = 0; i < NL; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; (isBark[j] ? idxB : idxW).push(a, a + 1, b, b, a + 1, b + 1); }
    // caps: bottom (cold end grain), top (charred)
    const capStart = pos.length / 3; const capIdx = [];
    const capBot = []; [0, L].forEach((y, e) => { const c0 = pos.length / 3; const ci = e ? capIdx : capBot; let cx = 0, cz = 0; sec.forEach(q => { cx += q[0] / S; cz += q[1] / S; }); pos.push(cx, y, cz); uv.push(0.5, e); sec.forEach(q => { pos.push(q[0], y, q[1]); uv.push(0.5 + q[0] / (R * 2.2), e); }); for (let j = 0; j < S; j++) { const a = c0 + 1 + j, b = c0 + 1 + (j + 1) % S; e ? ci.push(c0, b, a) : ci.push(c0, a, b); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idxB.concat(idxW, capIdx, capBot)); geo.addGroup(0, idxB.length, 0); geo.addGroup(idxB.length, idxW.length, 1); geo.addGroup(idxB.length + idxW.length, capIdx.length, 2); geo.addGroup(idxB.length + idxW.length + capIdx.length, capBot.length, 3);
    smooth(geo, 0.7); return geo;
  }

  CAMP.firepit = function () {
    const g = new THREE.Group(); g.name = 'firepit'; const t0 = T(), r = mulberry(4242);
    const glowList = []; // {mat, base} emissive things that follow setGlow
    const glowMat = (m) => { glowList.push({ m, base: m.emissiveIntensity }); return m; };
    // --- stones
    const stones = [], NSt = 12;
    for (let i = 0; i < NSt; i++) {
      const a = i / NSt * TAU + (r() - 0.5) * 0.18, R = 0.5 + (r() - 0.5) * 0.05, big = i % 4 === 1 ? 1.25 : i % 4 === 3 ? 0.85 : 1, sx = (0.085 + r() * 0.045) * big, sy = (0.055 + r() * 0.04) * big, sz = (0.07 + r() * 0.03) * big;
      const geo = rockGeo(i * 5.3 + 7, 5, 0.5, 0.09, 2 + (i % 3)), p = geo.attributes.position, nrm = geo.attributes.normal, cl = new Float32Array(p.count * 3);
      const tint = [srgb(168, 164, 156), srgb(150, 132, 108), srgb(110, 108, 106), srgb(178, 168, 148), srgb(132, 122, 110), srgb(146, 140, 132)][i % 6], k = 0.8 + r() * 0.3;
      xform(geo, Math.cos(a) * R, sy * 0.45 - 0.015, Math.sin(a) * R, (r() - 0.5) * 0.3, -a + (r() - 0.5) * 0.8, (r() - 0.5) * 0.25, [sx, sy, sz]);
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v), y = p.getY(v), z = p.getZ(v), nx = nrm.getX(v), ny = nrm.getY(v), nz = nrm.getZ(v), l = Math.hypot(x, z) || 1;
        const inward = clamp(-(nx * x + nz * z) / l, 0, 1), soot = clamp(ss(0.0, 0.8, inward) * (0.55 + 0.35 * (n3(x * 18, y * 18, z * 18, 4) * 0.5 + 0.5)) + 0.15 * ss(0.47, 0.42, l), 0, 0.85);
        const n = 0.85 + 0.3 * (n3(x * 30, y * 30, z * 30, 9) * 0.5 + 0.5);
        cl[v * 3] = lerp(tint[0] * k * n, 0.02, soot); cl[v * 3 + 1] = lerp(tint[1] * k * n, 0.018, soot); cl[v * 3 + 2] = lerp(tint[2] * k * n, 0.016, soot);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cl, 3)); stones.push(geo);
    }
    const stoneM = LIB.mat({ c: '#ffffff', map: t0.rock, bump: t0.rockB, bumpScale: 0.003, rough: 0.78, env: 0.6 }); stoneM.vertexColors = true;
    mk(g, merge(stones), stoneM, true, true).name = 'stones';
    // --- ash and charcoal bed
    {
      const NRg = 14, NSg = 72, pos = [0, 0.035, 0], uv = [0.5, 0.5], idx = [];
      for (let i = 1; i <= NRg; i++) { const t = i / NRg; for (let j = 0; j < NSg; j++) { const a = j / NSg * TAU, rr = 0.47 * t, x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = 0.035 * (1 - t * t) + 0.008 * f3(x * 14, 0, z * 14, 2, 161) - 0.012 * t * t * t; pos.push(x, y, z); uv.push(0.5 + x / 0.96, 0.5 - z / 0.96); } }
      for (let j = 0; j < NSg; j++) idx.push(0, 1 + (j + 1) % NSg, 1 + j);
      for (let i = 1; i < NRg; i++) for (let j = 0; j < NSg; j++) { const a = 1 + (i - 1) * NSg + j, b = 1 + (i - 1) * NSg + (j + 1) % NSg; idx.push(a, b, a + NSg, b, b + NSg, a + NSg); }
      const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ag.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ag.setIndex(idx); ag.computeVertexNormals();
      // ash: grey powder with white flecks, black charcoal lumps, a glowing heart (emissive follows the charcoal near the centre)
      const ashPix = (u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = pf(u, v, 8, 8, 3, 172), cw = worley(u, v, 46, 46, 176), cid = hash1(cw.id, 5), cedge = ss(0.0, 0.12, cw.f2 - cw.f1), coal = (cid < 0.06 + 0.6 * ss(0.8, 0.05, d + 0.15 * pf(u, v, 6, 6, 2, 177)) ? 1 : 0) * cedge * ss(-0.6, 0.2, pf(u, v, 30, 30, 2, 173)),
          fleck = ss(0.55, 0.8, pf(u, v, 64, 64, 1, 174)), crk = ss(0.07, 0.0, Math.abs(pf(u, v, 40, 40, 2, 175))), heat = Math.pow(ss(0.62, 0.05, d + 0.12 * n), 1.3);
        return { d, n, coal, fleck, crk, heat };
      };
      let AS = null; // the colour pass keeps each pixel's sample for the emissive pass
      const ashC = LIB.canvasTex('camp_ash', 512, 512, (q, w, h) => { AS = new Array(w * h); pix(q, w, h, (u, v, c, x, y) => {
        const A = AS[y * w + x] = ashPix(u, v), k = 1 + 0.22 * A.n + (Math.random() - 0.5) * 0.2, soil = ss(0.86, 0.98, A.d);
        let R = 82 * k, G = 79 * k, B = 76 * k; R = lerp(R, 132, A.fleck * 0.6); G = lerp(G, 129, A.fleck * 0.6); B = lerp(B, 124, A.fleck * 0.6);
        R = lerp(R, 74, soil); G = lerp(G, 60, soil); B = lerp(B, 48, soil);
        const ck = 0.6 + 0.8 * Math.random() * 0.3; R = lerp(R, 20 * ck, A.coal); G = lerp(G, 18 * ck, A.coal); B = lerp(B, 17 * ck, A.coal);
        c[0] = R; c[1] = G; c[2] = B;
      }); }, true);
      const ashE = LIB.canvasTex('camp_ashE', 512, 512, (q, w, h) => pix(q, w, h, (u, v, c, x, y) => {
        const A = AS ? AS[y * w + x] : ashPix(u, v), core = ss(0.45, 0.1, A.d + 0.1 * A.n), e = A.heat * (A.coal * (0.25 + 0.75 * A.crk) + 0.06 * (1 - A.coal)) * (0.7 + 0.5 * Math.random()) + core * (0.35 + 0.4 * A.coal);
        c[0] = 255 * clamp(e * 1.3, 0, 1); c[1] = 255 * clamp(e * 0.42 + Math.max(0, e - 0.6) * 0.5, 0, 1); c[2] = 255 * clamp(e * 0.05, 0, 1);
      }), true);
      const ashM = glowMat(LIB.mat({ c: '#ffffff', map: ashC, emissive: '#ffffff', emissiveMap: ashE, emissiveIntensity: 1.8, bump: LIB.noiseTex('camp_ashB', 256, 128, 80, 0.6), bumpScale: 0.003, rough: 0.97, env: 0.3 }));
      mk(g, ag, ashM, false, true).name = 'ash';
    }
    // --- glowing embers and dead charcoal
    {
      const crack = LIB.canvasTex('camp_coal', 256, 256, (q, w, h) => pix(q, w, h, (u, v, c) => { const cr = Math.max(ss(0.05, 0, Math.abs(pf(u, v, 6, 6, 2, 181))), ss(0.04, 0, Math.abs(pf(u, v, 12, 12, 1, 182)))), hot = ss(-0.4, 0.5, pf(u, v, 3, 3, 2, 183)); const b = (0.03 + 0.14 * hot + 0.83 * cr) * (0.5 + 0.5 * hot); c[0] = 255 * b; c[1] = 255 * (0.3 * b * b + 0.08 * b); c[2] = 18 * b; }), true);
      const hotM = glowMat(LIB.mat({ c: '#1a1512', emissive: '#ff5a14', emissiveMap: crack, emissiveIntensity: 2.0, rough: 0.85, bump: t0.rockB, bumpScale: 0.002 }));
      const coldM = LIB.mat({ c: '#151312', rough: 0.7, bump: t0.rockB, bumpScale: 0.003, env: 0.8 });
      const hot = [], cold = [];
      for (let i = 0; i < 40; i++) { const a = r() * TAU, d = (i < 14 ? r() * 0.16 : Math.pow(r(), 0.7) * 0.36), s = 0.012 + r() * (i < 14 ? 0.022 : 0.016), x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.035 * (1 - (d / 0.47) ** 2) + s * 0.25; (d < 0.2 ? hot : cold).push({ x, y, z, rx: r() * 3, ry: r() * 6, s: [s * (1 + r() * 0.6), s * 0.8, s] }); }
      inst(g, rockGeo(31, 1, 0.6, 0.12, 2), hotM, hot, false);
      inst(g, rockGeo(37, 1, 0.6, 0.12, 2), coldM, cold, false);
    }
    // --- split logs: a teepee, plus two burnt-down logs at the base
    {
      const barkCh = charTex('camp_barkChar', false), cr = emberCrackTex();
      const bm = glowMat(LIB.mat({ c: '#ffffff', map: barkCh, emissive: '#ffffff', emissiveMap: cr, emissiveIntensity: 1.6, bump: LIB.noiseTex('camp_logB', 256, 128, 90, 0.8), bumpScale: 0.002, rough: 0.9 }));
      const wm = bm; // (split faces would use a pale split-wood map; every log here is round)
      const cm = glowMat(LIB.mat({ c: '#1c1816', emissive: '#ff5212', emissiveMap: LIB.canvasTex('camp_coal', 256, 256, () => {}), emissiveIntensity: 1.2, rough: 0.9 }));
      const em = LIB.mat({ c: '#6a5644', map: endGrainTex(), rough: 0.9 });
      const mats = [bm, wm, cm, em];
      const N = 6;
      for (let i = 0; i < N; i++) {
        const a = i / N * TAU + 0.3 + (r() - 0.5) * 0.35, rb = 0.29 + r() * 0.07, top = [Math.cos(a + 0.6) * 0.04, 0.4 + r() * 0.07, Math.sin(a + 0.6) * 0.04], bot = [Math.cos(a) * rb, 0.035, Math.sin(a) * rb];
        const L = Math.hypot(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]) + 0.04, R = 0.034 + r() * 0.018;
        const geo = splitLog(L, R, 2, 900 + i); const m = new THREE.Mesh(geo, mats); m.castShadow = false; m.receiveShadow = true;
        m.position.set(bot[0], bot[1], bot[2]); const dir = new THREE.Vector3(top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.rotateY(r() * TAU); g.add(m);
      }
      [[2.2, 0.4, 0.045], [4.6, 0.38, 0.04], [0.9, 0.34, 0.035]].forEach(([a, rb, R], i) => {
        const bot = new THREE.Vector3(Math.cos(a) * rb, 0.04, Math.sin(a) * rb), top = new THREE.Vector3(Math.cos(a + 0.4) * 0.05, 0.09 + i * 0.02, Math.sin(a + 0.4) * 0.05), L = bot.distanceTo(top) + 0.03;
        const geo = splitLog(L, R, 2, 950 + i); const m = new THREE.Mesh(geo, mats); m.castShadow = false; m.receiveShadow = true;
        m.position.copy(bot); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); m.rotateY(i * 2); g.add(m);
      });
    }
    // --- flames: layered curved ribbons with additive blending
    {
      const tex = [flameTex('camp_flame0', 3, 0), flameTex('camp_flame1', 7, 1), flameTex('camp_flame2', 11, 2), flameTex('camp_flame3', 19, 1)];
      // pure emitters: an unlit additive material (a lit one would also catch the fire's own light as a faint sheet)
      const fm = (t, k) => { const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(k, k, k), side: DS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); glowList.push({ m, base: k, col: true }); return m; };
      const fl = new THREE.Group(); fl.name = 'flames'; g.add(fl);
      const tongues = [
        { x: 0, z: 0, W: 0.42, H: 0.78, t: 0, k: 1.0, n: 3 }, { x: 0.02, z: -0.02, W: 0.3, H: 0.62, t: 2, k: 0.95, n: 2 },
        { x: 0.1, z: 0.06, W: 0.22, H: 0.5, t: 1, k: 0.9, n: 2 }, { x: -0.11, z: 0.03, W: 0.24, H: 0.46, t: 3, k: 0.9, n: 2 },
        { x: 0.04, z: -0.12, W: 0.2, H: 0.42, t: 1, k: 0.85, n: 2 }, { x: -0.06, z: -0.08, W: 0.16, H: 0.34, t: 3, k: 0.85, n: 2 },
        { x: 0.17, z: -0.05, W: 0.14, H: 0.24, t: 1, k: 0.8, n: 2 }, { x: -0.16, z: 0.12, W: 0.13, H: 0.22, t: 3, k: 0.9, n: 2 },
        { x: 0.12, z: 0.17, W: 0.12, H: 0.2, t: 1, k: 0.85, n: 2 }, { x: -0.2, z: -0.1, W: 0.1, H: 0.16, t: 3, k: 0.85, n: 2 },
        { x: 0.21, z: 0.12, W: 0.09, H: 0.17, t: 1, k: 0.8, n: 1 }, { x: -0.05, z: 0.22, W: 0.1, H: 0.2, t: 3, k: 0.8, n: 1 }, { x: -0.22, z: 0.06, W: 0.09, H: 0.15, t: 1, k: 0.8, n: 1 }, { x: 0.08, z: -0.22, W: 0.1, H: 0.18, t: 3, k: 0.8, n: 1 }, { x: 0.24, z: -0.08, W: 0.08, H: 0.13, t: 1, k: 0.75, n: 1 },
      ];
      tongues.forEach((o, i) => {
        const mat = fm(tex[o.t], o.k);
        for (let c = 0; c < o.n; c++) {
          const geo = flameRibbon(o.W, o.H, 0.8 + r() * 0.6, [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25], (r() - 0.5) * 1.2, i * 3 + c);
          const m = new THREE.Mesh(geo, mat); m.position.set(o.x, 0.04, o.z); m.rotation.y = c / o.n * PI + r() * 0.6; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; fl.add(m);
        }
      });
      // soft hot core low in the logs
      const coreT = LIB.canvasTex('camp_fcore', 64, 64, (q, w, h) => { q.fillStyle = '#000'; q.fillRect(0, 0, w, h); const gr = q.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, w / 2); gr.addColorStop(0, 'rgb(255,190,100)'); gr.addColorStop(0.4, 'rgb(150,60,12)'); gr.addColorStop(1, 'rgb(0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); }, true);
      const coreM = fm(coreT, 0.9);
      for (let c = 0; c < 3; c++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), coreM); m.position.set(0, 0.15, 0); m.rotation.y = c * PI / 3; m.castShadow = false; m.receiveShadow = false; fl.add(m); }
      // the glow halo that a camera sees around a fire at night
      const haloT = LIB.canvasTex('camp_fhalo', 128, 128, (q, w, h) => { const gr = q.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,140,50,0.55)'); gr.addColorStop(0.3, 'rgba(255,100,30,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); }, true);
      const hm = new THREE.SpriteMaterial({ map: haloT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
      const halo = new THREE.Sprite(hm); halo.position.set(0, 0.36, 0); halo.scale.set(1.5, 1.5, 1); fl.add(halo); glowList.push({ m: hm, base: 0.55, op: true });
      // sparks drifting up
      const NSp = 70, sp = new Float32Array(NSp * 3), sc = new Float32Array(NSp * 3);
      for (let i = 0; i < NSp; i++) { const h = 0.35 + Math.pow(r(), 1.6) * 1.6, a = r() * TAU, d = (0.03 + r() * 0.12) * (1 + h * 0.3); sp[i * 3] = Math.cos(a) * d + h * 0.06; sp[i * 3 + 1] = h; sp[i * 3 + 2] = Math.sin(a) * d - h * 0.03; const b = (1.6 - h * 0.6) * (0.5 + r() * 0.8); sc[i * 3] = 1.0 * b; sc[i * 3 + 1] = 0.42 * b; sc[i * 3 + 2] = 0.08 * b; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      const dot = LIB.canvasTex('camp_spark', 32, 32, (q, w, h) => { const gr = q.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); }, true);
      const pm = new THREE.PointsMaterial({ size: 0.014, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); fl.add(new THREE.Points(sg, pm));
    }
    // --- the light
    const light = new THREE.PointLight(0xff8a3a, 2.2, 9, 2); light.position.set(0, 0.45, 0); light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.002; light.shadow.camera.near = 0.06; light.shadow.radius = 3; g.add(light);
    g.userData.light = light; const lightBase = light.intensity;
    g.userData.setGlow = (k) => { light.intensity = lightBase * k; glowList.forEach(o => { if (o.op) o.m.opacity = o.base * k; else if (o.col) o.m.color.setScalar(o.base * k); else o.m.emissiveIntensity = o.base * k; }); };
    g.userData.focus = { x: 0, y: 0.3, z: 0, r: 0.7 };
    return g;
  };

  // ================================================================ 4. plants (log coordinates)
  function alphaLeafTex(key, draw) { return LIB.canvasTex(key, 128, 64, (q, w, h) => { q.clearRect(0, 0, w, h); draw(q, w, h); }, true); }
  function plantMats() {
    if (TX.plant) return TX.plant;
    const pinna = alphaLeafTex('camp_pinna', (q, w, h) => { // lobed fern pinna along +u
      q.fillStyle = '#e8f0dc'; for (let i = 0; i < 13; i++) { const t = i / 12, x = 6 + t * 116, s = 10 * Math.pow(1 - t, 0.6) + 1.5; q.beginPath(); q.ellipse(x, h / 2 - s * 0.45, s * 0.75, s, -0.5, 0, TAU); q.fill(); q.beginPath(); q.ellipse(x, h / 2 + s * 0.45, s * 0.75, s, 0.5, 0, TAU); q.fill(); }
      q.strokeStyle = '#b8c8a0'; q.lineWidth = 2; q.beginPath(); q.moveTo(0, h / 2); q.lineTo(w, h / 2); q.stroke();
    });
    const leaf = alphaLeafTex('camp_leaf', (q, w, h) => { // ovate serrated leaf along +u with veins
      q.fillStyle = '#eef3e6'; q.beginPath(); q.moveTo(2, h / 2); for (let i = 0; i <= 24; i++) { const t = i / 24, x = 2 + t * 124, y = h / 2 - (Math.sin(PI * Math.pow(t, 0.8)) * 26 + (i % 2) * 2); q.lineTo(x, y); } for (let i = 24; i >= 0; i--) { const t = i / 24, x = 2 + t * 124, y = h / 2 + (Math.sin(PI * Math.pow(t, 0.8)) * 26 + (i % 2) * 2); q.lineTo(x, y); } q.fill();
      q.strokeStyle = 'rgba(160,180,120,0.9)'; q.lineWidth = 2; q.beginPath(); q.moveTo(2, h / 2); q.lineTo(124, h / 2); q.stroke(); q.lineWidth = 1; for (let i = 1; i < 8; i++) { const x = 6 + i * 14; q.beginPath(); q.moveTo(x, h / 2); q.lineTo(x + 14, h / 2 - 18); q.moveTo(x, h / 2); q.lineTo(x + 14, h / 2 + 18); q.stroke(); }
    });
    const petal = alphaLeafTex('camp_petal', (q, w, h) => { q.fillStyle = '#ffffff'; q.beginPath(); q.ellipse(w / 2 + 4, h / 2, w / 2 - 6, h / 2 - 8, 0, 0, TAU); q.fill(); q.strokeStyle = 'rgba(200,200,200,0.5)'; for (let i = -2; i <= 2; i++) { q.beginPath(); q.moveTo(4, h / 2); q.lineTo(w - 6, h / 2 + i * 6); q.stroke(); } });
    const mm = (map, rough) => { const m = LIB.mat({ c: '#ffffff', map, rough: rough || 0.62, side: DS, env: 0.5 }); m.vertexColors = true; m.alphaTest = 0.45; return m; };
    const stem = LIB.mat({ c: '#ffffff', rough: 0.7, env: 0.5 }); stem.vertexColors = true;
    const pm = mm(pinna), lm = mm(leaf); pm.color.setRGB(1.7, 1.6, 1.25); lm.color.setRGB(1.7, 1.6, 1.25); stem.color.setRGB(1.3, 1.3, 1.15);
    return (TX.plant = { pinna: pm, leaf: lm, petal: mm(petal, 0.5), stem });
  }
  // a quad card with u along its length, bent: base at origin pointing along dir (Vector3), across = side vector
  function card(base, dir, side, L, W, droop, cola, colb, segs) {
    segs = segs || 2; const pos = [], uv = [], cl = [], idx = [];
    for (let i = 0; i <= segs; i++) { const s = i / segs, c = [lerp(cola[0], colb[0], s), lerp(cola[1], colb[1], s), lerp(cola[2], colb[2], s)]; const px = base.x + dir.x * L * s, py = base.y + dir.y * L * s - droop * L * s * s, pz = base.z + dir.z * L * s; for (let k = 0; k < 2; k++) { const o = (k - 0.5) * W; pos.push(px + side.x * o, py + side.y * o + Math.abs(o) * 0.25, pz + side.z * o); uv.push(s, k); cl.push(...c); } }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { V.set(n.getX(i), n.getY(i), n.getZ(i)); if (V.y < 0) V.negate(); V.y += 0.5; V.normalize(); n.setXYZ(i, V.x, V.y, V.z); }
    return g;
  }
  function fern(seed, size) {
    const rr = mulberry(seed), pin = [], stems = [], NF = 11;
    for (let f = 0; f < NF; f++) {
      const az = f / NF * TAU + (rr() - 0.5) * 0.5, L = size * (0.75 + rr() * 0.35) * (f % 3 === 0 ? 0.8 : 1), arch = f % 3 === 0 ? 1.45 : 1.0 + rr() * 0.2;
      const ca = Math.cos(az), sa = Math.sin(az);
      const P = (s) => { const d = L * s * (f % 3 === 0 ? 0.7 : 0.92), y = 0.02 + L * arch * (1.05 * s - 1.12 * s * s) + (f % 3 === 0 ? 0.08 * L * s : 0); return new THREE.Vector3(ca * d, Math.max(0.01, y), sa * d); };
      const pts = []; for (let i = 0; i <= 8; i++) { const p = P(i / 8); pts.push([p.x, p.y, p.z]); }
      stems.push(taper(pts, [0.0035, 0.0008], 4, 12, (t) => srgb(lerp(70, 96, t), lerp(78, 118, t), lerp(38, 46, t))));
      const side = new THREE.Vector3(-sa, 0, ca), young = rr(), c0 = srgb(lerp(44, 70, young), lerp(80, 112, young), lerp(30, 38, young)), c1 = srgb(lerp(70, 110, young), lerp(112, 146, young), lerp(40, 50, young));
      for (let i = 0; i < 24; i++) {
        const s = 0.1 + 0.88 * i / 23, p = P(s), tn = P(Math.min(1, s + 0.02)).sub(P(Math.max(0, s - 0.02))).normalize(), lp = size * 0.2 * Math.pow(Math.sin(PI * Math.min(1, (s - 0.04) / 1.0)), 0.7) * (1 - 0.6 * s * s) + 0.008;
        [-1, 1].forEach(sd => { const d = tn.clone().multiplyScalar(0.55).add(side.clone().multiplyScalar(sd * 0.83)).normalize(); const acr = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(); pin.push(card(p, d, acr, lp, lp * 0.36, 0.25, c0, c1, 2)); });
      }
    }
    return { pin: merge(pin), stem: merge(stems) };
  }
  function leafyBranch(rr, list, stems, base, dir, L, r0, nLeaves, leafL, colA, colB, sub) {
    const pts = [], bend = new THREE.Vector3((rr() - 0.5) * 0.2, -0.05, (rr() - 0.5) * 0.2);
    for (let i = 0; i <= 5; i++) { const s = i / 5; pts.push([base.x + dir.x * L * s + bend.x * s * s * L, base.y + dir.y * L * s + bend.y * s * s * L, base.z + dir.z * L * s + bend.z * s * s * L]); }
    stems.push(taper(pts, [r0, r0 * 0.25], 5, 8, () => srgb(84, 70, 52)));
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    for (let i = 0; i < nLeaves; i++) {
      const s = 0.25 + 0.75 * (i + rr() * 0.5) / nLeaves, p = curve.getPointAt(Math.min(1, s)), a = i * 2.4 + rr(), t = curve.getTangentAt(Math.min(1, s));
      const out = new THREE.Vector3(Math.cos(a), 0.35 + rr() * 0.4, Math.sin(a)).add(t.clone().multiplyScalar(0.6)).normalize(), acr = new THREE.Vector3().crossVectors(out, new THREE.Vector3(0, 1, 0)).normalize();
      if (acr.lengthSq() < 0.01) acr.set(1, 0, 0);
      const k = 0.8 + rr() * 0.35, ll = leafL * (0.7 + rr() * 0.5) * (1 - 0.3 * s);
      // a short petiole, then the blade
      const pb = p.clone().add(out.clone().multiplyScalar(ll * 0.15));
      list.push(card(pb, out, acr, ll, ll * 0.5, 0.35, colA.map(x => x * k), colB.map(x => x * k), 2));
    }
    if (sub) for (let i = 0; i < sub; i++) { const s = 0.35 + rr() * 0.5, p = curve.getPointAt(s), t = curve.getTangentAt(s), a = rr() * TAU; const d = t.clone().add(new THREE.Vector3(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(0.9)).normalize(); leafyBranch(rr, list, stems, p, d, L * 0.4, r0 * 0.5, Math.ceil(nLeaves * 0.45), leafL * 0.9, colA, colB, 0); }
  }
  function flower(rr, petals, stems, centres, base, h, kind) {
    const lean = new THREE.Vector3((rr() - 0.5) * 0.25, 1, (rr() - 0.5) * 0.25).normalize(), top = base.clone().add(lean.clone().multiplyScalar(h));
    const mid = base.clone().lerp(top, 0.55).add(new THREE.Vector3((rr() - 0.5) * 0.03, 0, (rr() - 0.5) * 0.03));
    stems.push(taper([[base.x, base.y, base.z], [mid.x, mid.y, mid.z], [top.x, top.y, top.z]], [0.0022, 0.0014], 4, 8, () => srgb(72, 100, 44)));
    // two small leaves on the stem
    for (let i = 0; i < 2; i++) { const p = base.clone().lerp(top, 0.2 + i * 0.25), a = rr() * TAU, d = new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize(), acr = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(); petals.leaf.push(card(p, d, acr, 0.045, 0.014, 0.3, srgb(56, 92, 36), srgb(80, 120, 46), 2)); }
    const face = new THREE.Vector3((rr() - 0.5) * 0.8, 1, (rr() - 0.5) * 0.8).normalize(), u = new THREE.Vector3().crossVectors(face, new THREE.Vector3(1, 0, 0)).normalize(), v = new THREE.Vector3().crossVectors(face, u);
    const spec = kind === 'daisy' ? { n: 16, L: 0.018, W: 0.006, cup: 0.12, col: srgb(246, 244, 236), col2: srgb(255, 255, 250), cr: 0.0055, cc: srgb(236, 180, 30) }
      : kind === 'aster' ? { n: 22, L: 0.014, W: 0.0035, cup: 0.05, col: srgb(150, 104, 205), col2: srgb(176, 140, 225), cr: 0.004, cc: srgb(240, 196, 50) }
        : { n: 5, L: 0.012, W: 0.011, cup: 0.7, col: srgb(250, 205, 30), col2: srgb(255, 226, 60), cr: 0.003, cc: srgb(220, 170, 30) };
    for (let i = 0; i < spec.n; i++) { const a = i / spec.n * TAU + rr() * 0.1, d = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).add(face.clone().multiplyScalar(spec.cup)).normalize(), acr = new THREE.Vector3().crossVectors(face, d).normalize(); petals.petal.push(card(top.clone().add(d.clone().multiplyScalar(spec.cr * 0.6)), d, acr, spec.L * (0.9 + rr() * 0.2), spec.W, -0.05, spec.col, spec.col2, 1)); }
    const cg = new THREE.SphereGeometry(spec.cr, 10, 6); cg.scale(1, 0.55, 1); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), face); cg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); cg.translate(top.x, top.y + 0.001, top.z); centres.push(setColor(cg, spec.cc));
  }
  CAMP.plants = function () {
    const g = new THREE.Group(); g.name = 'plants'; const M = plantMats(), rr = mulberry(5150);
    const pinnae = [], leaves = [], petals = [], stems = [], centres = [];
    const put = (o, x, z, ry) => { o.pin && pinnae.push(xform(o.pin, x, 0, z, 0, ry, 0, 1)); o.stem && stems.push(xform(o.stem, x, 0, z, 0, ry, 0, 1)); };
    // two ferns: behind the left end, and behind the log on the right
    put(fern(11, 0.62), -1.38, -0.32, 0.3);
    put(fern(23, 0.52), 1.22, -0.5, 1.4);
    // a small shrub behind the right end
    { const base = new THREE.Vector3(1.62, 0, 0.02); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rr() * 0.5, d = new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize(); leafyBranch(rr, leaves, stems, base.clone().add(new THREE.Vector3(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02)), d, 0.36 + rr() * 0.16, 0.007, 16, 0.062, srgb(44, 82, 32), srgb(78, 118, 42), 2); } }
    // a sapling behind the left half
    { const b = new THREE.Vector3(-0.82, 0, -0.88), pts = [[b.x, 0, b.z], [b.x + 0.02, 0.35, b.z - 0.01], [b.x - 0.01, 0.7, b.z + 0.02], [b.x + 0.015, 1.05, b.z]];
      stems.push(taper(pts, [0.012, 0.0025], 6, 14, (t) => srgb(lerp(96, 110, t), lerp(84, 96, t), lerp(70, 64, t))));
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
      for (let i = 0; i < 8; i++) { const s = 0.3 + i * 0.085, p = curve.getPointAt(s), a = i * 2.3 + 0.4, d = new THREE.Vector3(Math.cos(a), 0.75, Math.sin(a)).normalize(); leafyBranch(rr, leaves, stems, p, d, 0.24 - i * 0.015, 0.004, 13, 0.08, srgb(52, 92, 34), srgb(92, 132, 48), 1); }
      leafyBranch(rr, leaves, stems, curve.getPointAt(0.97), new THREE.Vector3(0.05, 1, 0), 0.08, 0.003, 5, 0.06, srgb(70, 116, 40), srgb(110, 150, 56), 0); }
    // a clump of tall grass at the right end, and one at the left end
    const grassBlades = [];
    [[1.2, 0.26, 60, 0.6], [-1.22, 0.22, 40, 0.45], [0.35, -0.6, 30, 0.42]].forEach(([cx, cz, n, H]) => {
      for (let i = 0; i < n; i++) {
        const a = rr() * TAU, r0 = rr() * 0.06, x = cx + Math.cos(a) * r0, z = cz + Math.sin(a) * r0, h = H * (0.5 + rr() * 0.6), lean = 0.15 + rr() * 0.45, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const pts = []; for (let k = 0; k <= 5; k++) { const s = k / 5; pts.push([x + dir.x * (lean * s * s * h), h * s * (1 - 0.25 * lean * s), z + dir.z * (lean * s * s * h)]); }
        const straw = rr() < 0.2, cb = srgb(52, 70, 30), ct = straw ? srgb(176, 160, 100) : srgb(lerp(90, 130, rr()), lerp(120, 150, rr()), 52);
        const pos = [], cl = [], idx = []; const side = new THREE.Vector3(-dir.z, 0, dir.x).applyAxisAngle(new THREE.Vector3(0, 1, 0), (rr() - 0.5) * 1.2);
        pts.forEach((p, k) => { const s = k / 5, w = 0.0045 * (1 - s * 0.85); pos.push(p[0] - side.x * w, p[1], p[2] - side.z * w, p[0] + side.x * w, p[1], p[2] + side.z * w); const c = [lerp(cb[0], ct[0], s), lerp(cb[1], ct[1], s), lerp(cb[2], ct[2], s)]; cl.push(...c, ...c); });
        for (let k = 0; k < 5; k++) { const q = k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); bg.setIndex(idx); bg.computeVertexNormals();
        const nn = bg.attributes.normal; for (let q = 0; q < nn.count; q++) { V.set(nn.getX(q), nn.getY(q), nn.getZ(q)); if (V.y < 0) V.negate(); V.y += 0.6; V.normalize(); nn.setXYZ(q, V.x, V.y, V.z); }
        grassBlades.push(bg);
        if (i % 9 === 0) { const tp = pts[5], sh = tp[1] + 0.06; stems.push(taper([[x, 0, z], [lerp(x, tp[0], 0.5), sh * 0.6, lerp(z, tp[2], 0.5)], [tp[0], sh, tp[2]]], [0.0012, 0.0008], 3, 6, () => srgb(150, 140, 90))); for (let k = 0; k < 7; k++) { const sg = new THREE.SphereGeometry(0.0035, 5, 3); sg.scale(0.7, 2.2, 0.7); sg.translate(tp[0] + (rr() - 0.5) * 0.008, sh - 0.005 - k * 0.009, tp[2] + (rr() - 0.5) * 0.008); centres.push(setColor(sg, srgb(160, 146, 96))); } }
      }
    });
    // wildflowers: daisies behind the middle, asters at the left end, buttercups behind the right
    const P = { petal: petals, leaf: leaves };
    [[-0.35, -0.55], [-0.28, -0.62], [-0.42, -0.66], [-0.2, -0.52]].forEach(([x, z]) => flower(rr, P, stems, centres, new THREE.Vector3(x, 0, z), 0.22 + rr() * 0.12, 'daisy'));
    [[-1.42, 0.12], [-1.5, 0.05], [-1.36, 0.2], [-1.55, -0.02], [-1.3, 0.04]].forEach(([x, z]) => flower(rr, P, stems, centres, new THREE.Vector3(x, 0, z), 0.26 + rr() * 0.14, 'aster'));
    [[1.0, -0.82], [1.08, -0.76], [0.94, -0.74], [1.12, -0.86]].forEach(([x, z]) => flower(rr, P, stems, centres, new THREE.Vector3(x, 0, z), 0.18 + rr() * 0.1, 'butter'));
    mk(g, merge(pinnae), M.pinna).name = 'ferns';
    mk(g, merge(leaves), M.leaf).name = 'leaves';
    mk(g, merge(petals), M.petal).name = 'petals';
    mk(g, merge(stems.concat(centres, grassBlades)), M.stem).name = 'stems';
    g.userData.focus = { x: 0, y: 0.35, z: -0.4, r: 1.5 };
    return g;
  };

  // ================================================================ 5. marshmallows on sticks (fire coordinates)
  CAMP.marshmallows = function () {
    const g = new THREE.Group(); g.name = 'marshmallows'; const rr = mulberry(777);
    const stickTex = LIB.canvasTex('camp_stick', 64, 256, (q, w, h) => { pix(q, w, h, (u, v, c) => { const n = pf(u, v, 2, 8, 2, 191); c[0] = 128 + 20 * n; c[1] = 124 + 18 * n; c[2] = 100 + 12 * n; }); const r = mulberry(192); for (let i = 0; i < 90; i++) { q.fillStyle = 'rgba(225,215,180,0.7)'; q.fillRect(r() * w, r() * h, 2.5, 1); } }, true, 1, 3);
    const stickM = LIB.mat({ c: '#ffffff', map: stickTex, rough: 0.6, env: 0.6 }); stickM.vertexColors = true;
    const mallowM = LIB.mat({ c: '#ffffff', rough: 0.75, bump: LIB.noiseTex('camp_mallowB', 128, 128, 70, 0.8), bumpScale: 0.0008, env: 0.7 }); mallowM.vertexColors = true;
    // [angle around the fire (rad, 0 = +x, PI/2 = +z far side), planted radius, tip radius, tip height, roast]
    const S = [[0.12, 0.86, 0.4, 0.44, 0.55], [1.25, 0.82, 0.38, 0.48, 0.25], [2.05, 0.88, 0.42, 0.4, 0.9], [3.05, 0.84, 0.37, 0.46, 0.45]];
    const sticks = [], mallows = [];
    S.forEach(([a, rb, rt, ht, roast], si) => {
      const ca = Math.cos(a), sa = Math.sin(a), B = new THREE.Vector3(ca * rb, -0.06, sa * rb), Tp = new THREE.Vector3(ca * rt, ht, sa * rt);
      const side = new THREE.Vector3(-sa, 0, ca), mid = B.clone().lerp(Tp, 0.5).add(new THREE.Vector3(0, 0.03, 0)).add(side.clone().multiplyScalar((rr() - 0.5) * 0.04));
      const pts = []; for (let i = 0; i <= 6; i++) { const s = i / 6, p = new THREE.Vector3().copy(B).multiplyScalar((1 - s) * (1 - s)).add(mid.clone().multiplyScalar(2 * s * (1 - s))).add(Tp.clone().multiplyScalar(s * s)); pts.push([p.x, p.y, p.z]); }
      const bark = srgb(lerp(86, 104, rr()), lerp(92, 100, rr()), 52), peel = srgb(214, 214, 168), point = srgb(196, 182, 130);
      sticks.push(taper(pts, (t) => t < 0.965 ? lerp(0.0075, 0.0048, t) : 0.0048 * ss(1.0, 0.965, t) + 0.0004, 7, 30, (t) => t < 0.86 ? bark : t < 0.875 ? [lerp(bark[0], peel[0], 0.5), lerp(bark[1], peel[1], 0.5), lerp(bark[2], peel[2], 0.5)] : t < 0.965 ? peel : point));
      // a couple of trimmed side shoots
      for (let k = 0; k < 2; k++) { const s = 0.3 + k * 0.28 + rr() * 0.08, i0 = Math.floor(s * 6), p = new THREE.Vector3(...pts[i0]).lerp(new THREE.Vector3(...pts[i0 + 1]), s * 6 - i0), d = side.clone().multiplyScalar(k ? 1 : -1).add(new THREE.Vector3(0, 0.8, 0)).normalize(); sticks.push(taper([[p.x, p.y, p.z], [p.x + d.x * 0.015, p.y + d.y * 0.015, p.z + d.z * 0.015]], [0.003, 0.0026], 5, 1, () => bark)); }
      // the marshmallow, 3 cm from the point, skewered along the stick
      const n = pts.length, pe = new THREE.Vector3(...pts[n - 1]), pd = pe.clone().sub(new THREE.Vector3(...pts[n - 2])).normalize(), c = pe.clone().sub(pd.clone().multiplyScalar(0.032));
      const prof = [[0.0005, -0.0172], [0.009, -0.0168], [0.0128, -0.0156], [0.0152, -0.0132], [0.0163, -0.0095], [0.0167, 0], [0.0163, 0.0095], [0.0152, 0.0132], [0.0128, 0.0156], [0.009, 0.0168], [0.0005, 0.0172]];
      const mg = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 22), mp = mg.attributes.position;
      for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), rq = Math.hypot(x, z) / 0.0167, k = (1 + 0.05 * f3(x * 120 + si, y * 120, z * 120, 2, 201)) * (1 + 0.025 * (1 - (y / 0.0172) ** 2)); mp.setXYZ(i, x * k, y * (1 + 0.05 * (1 - rq * rq)), z * k * 0.94); }
      mg.computeVertexNormals(); mg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pd))); mg.translate(c.x, c.y, c.z);
      const mn = mg.attributes.normal, cl = new Float32Array(mp.count * 3), white = srgb(250, 244, 232), gold = srgb(214, 152, 70), brown = srgb(120, 66, 28), black = srgb(36, 24, 16);
      for (let i = 0; i < mp.count; i++) {
        const px = mp.getX(i), py = mp.getY(i), pz = mp.getZ(i), toF = new THREE.Vector3(-px, 0.25 - py, -pz).normalize(), d = mn.getX(i) * toF.x + mn.getY(i) * toF.y + mn.getZ(i) * toF.z;
        const n = 0.15 * f3(px * 200, py * 200, pz * 200, 2, 211), t = clamp(ss(-0.55, 0.85, d + n) * (0.35 + roast), 0, 1.3);
        let col = t < 0.6 ? white.map((w, k) => lerp(w, gold[k], t / 0.6)) : t < 1.0 ? gold.map((w, k) => lerp(w, brown[k], (t - 0.6) / 0.4)) : brown.map((w, k) => lerp(w, black[k], clamp((t - 1) / 0.3, 0, 1)));
        cl.set(col, i * 3);
      }
      mg.setAttribute('color', new THREE.BufferAttribute(cl, 3)); mallows.push(mg);
    });
    mk(g, merge(sticks), stickM, false, true).name = 'sticks';
    mk(g, merge(mallows), mallowM).name = 'mallows';
    g.userData.focus = { x: 0, y: 0.3, z: 0.2, r: 0.85 };
    return g;
  };

  // ================================================================ 6. fireflies
  CAMP.fireflies = function () {
    const g = new THREE.Group(); g.name = 'fireflies'; const r = mulberry(3131), N = 40;
    const F = [];
    for (let i = 0; i < N; i++) {
      let x, z; do { x = (r() * 2 - 1); z = (r() * 2 - 1); } while (x * x + z * z > 1);
      F.push({ bx: x * 0.8, by: 0.4 + Math.pow(r(), 0.8) * 1.2, bz: z * 0.8, f: [0.11 + r() * 0.22, 0.09 + r() * 0.2, 0.13 + r() * 0.24, 0.31 + r() * 0.4], p: [r() * TAU, r() * TAU, r() * TAU, r() * TAU, r() * TAU, r() * TAU], A: 0.2 + r() * 0.2, per: 2.0 + r() * 3.0, ph: r() * 10, duty: 0.2 + r() * 0.22, sb: 0.4 + r() * 0.6 });
    }
    const pos = new Float32Array(N * 3), cc = new Float32Array(N * 3), ch = new Float32Array(N * 3);
    const base = LIB.col('#d8ff5a');
    const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const gc = new THREE.BufferGeometry(); gc.setAttribute('position', pa); gc.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const gh = new THREE.BufferGeometry(); gh.setAttribute('position', pa); gh.setAttribute('color', new THREE.BufferAttribute(ch, 3));
    const dot = LIB.canvasTex('camp_flydot', 32, 32, (q, w, h) => { const gr = q.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); }, true);
    const halo = LIB.canvasTex('camp_flyhalo', 64, 64, (q, w, h) => { const gr = q.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.32)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = gr; q.fillRect(0, 0, w, h); }, true);
    const pc = new THREE.Points(gc, new THREE.PointsMaterial({ size: 0.03, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ph = new THREE.Points(gh, new THREE.PointsMaterial({ size: 0.2, map: halo, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pc.frustumCulled = ph.frustumCulled = false; pc.renderOrder = ph.renderOrder = 3; g.add(ph, pc);
    // two faint lights riding with two of the flies
    const lights = [0, 7].map(i => { const l = new THREE.PointLight(0xc8ff50, 0.06, 1.1, 2); l.userData.i = i; g.add(l); return l; });
    let wob = 0;
    function update(t) {
      for (let i = 0; i < N; i++) {
        const o = F[i], A = o.A * wob;
        const dx = A * (0.7 * Math.sin(t * o.f[0] * TAU + o.p[0]) + 0.3 * Math.sin(t * o.f[3] * TAU + o.p[3]));
        const dy = A * 0.6 * (0.7 * Math.sin(t * o.f[1] * TAU + o.p[1]) + 0.3 * Math.sin(t * o.f[3] * 1.3 * TAU + o.p[4]));
        const dz = A * (0.7 * Math.sin(t * o.f[2] * TAU + o.p[2]) + 0.3 * Math.sin(t * o.f[3] * 0.8 * TAU + o.p[5]));
        pos[i * 3] = o.bx + dx; pos[i * 3 + 1] = o.by + dy; pos[i * 3 + 2] = o.bz + dz;
        const u = (((t + o.ph) / o.per) % 1 + 1) % 1, fl = u < o.duty ? Math.pow(Math.sin(PI * u / o.duty), 1.4) : 0;
        const b = lerp(o.sb, 0.1 + fl * 1.1, clamp(wob * 1.5, 0, 1));
        cc[i * 3] = base.r * b * 0.95; cc[i * 3 + 1] = base.g * b * 0.95; cc[i * 3 + 2] = base.b * b * 0.95;
        ch[i * 3] = base.r * b * 2.0; ch[i * 3 + 1] = base.g * b * 2.0; ch[i * 3 + 2] = base.b * b * 2.0;
      }
      pa.needsUpdate = true; gc.attributes.color.needsUpdate = true; gh.attributes.color.needsUpdate = true;
      lights.forEach(l => { const i = l.userData.i; l.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); const b = cc[i * 3 + 1] / (base.g * 0.95); l.intensity = 0.07 * b; });
    }
    update(0);
    g.userData.setWobble = (v) => { wob = clamp(v, 0, 1); };
    g.userData.tick = (t) => update(t);
    g.userData.focus = { x: 0, y: 0.95, z: 0, r: 0.9 };
    return g;
  };
})();
