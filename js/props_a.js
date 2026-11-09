/* Bedroom — props A: the study / gaming corner.
   desk() (light-brown wood desk + black gaming setup + PC tower), controller(), books(), fridge(), chair().
   Every builder returns a THREE.Group, origin on the floor at the footprint centre, front facing +z. Metres. */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2;
  const P = window.PROPS_A = {};

  // ---------------------------------------------------------------- helpers
  // box-projected UVs measured in metres (su, sv per metre), optional swap of u/v and offsets; p* = mesh position so
  // neighbouring boards share one continuous texture space
  function uvMetric(geo, su, sv, o) {
    o = o || {};
    const p = geo.attributes.position, n = geo.attributes.normal, a = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (o.px || 0), y = p.getY(i) + (o.py || 0), z = p.getZ(i) + (o.pz || 0);
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = -z; } else if (az >= ax) { u = x; v = y; } else { u = z; v = y; }
      if (o.swap) { const t = u; u = v; v = t; }
      a[i * 2] = u * su + (o.ou || 0); a[i * 2 + 1] = v * sv + (o.ov || 0);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(a, 2));
    return geo;
  }
  // lofted surface: fn(s,t) -> [x,y,z], s along (rows), t around (cols)
  function loftGeo(S, T, fn) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= S; i++) for (let j = 0; j <= T; j++) { const p = fn(i / S, j / T); pos.push(p[0], p[1], p[2]); uv.push(j / T, i / S); }
    for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) { const a = i * (T + 1) + j, b = a + T + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // smooth closed outline through points (2D) -> THREE.Shape
  function smoothShape(pts, n) {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
    const sp = c.getSpacedPoints(n || 160); sp.pop();
    return new THREE.Shape(sp.map(v => new THREE.Vector2(v.x, v.y)));
  }
  // piecewise-linear interpolation on [[s,v],...]
  function interp(tab, s) { for (let i = 1; i < tab.length; i++) if (s <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; const t = (s - a[0]) / (b[0] - a[0]); const k = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * k; } return tab[tab.length - 1][1]; }
  // LIB.loadTex clones the cached texture before its image has arrived, so a first-time clone stays black.
  // tex() patches the clone with its own image once the (browser-cached) file is loaded.
  function tex(name, srgb, rx, ry) {
    const t = LIB.loadTex(name, srgb, rx, ry);
    if (!t.image) { const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; }; img.src = 'assets/tex/' + name; }
    return t;
  }
  // smooth vertex normals across coincident vertices (ExtrudeGeometry is non-indexed and comes out faceted);
  // faces meeting at more than `crease` radians keep a hard edge
  function smooth(geo, crease) {
    const cc = Math.cos(crease == null ? 1.0 : crease);
    const p = geo.attributes.position, n = p.count, fn = new Float32Array(n * 3), keyOf = i => Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5);
    const idx = geo.index ? geo.index.array : null, tri = idx ? idx.length / 3 : n / 3, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    const faceN = new Float32Array(tri * 3), map = new Map(), vf = new Int32Array(n);
    for (let t = 0; t < tri; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      A.fromBufferAttribute(p, a); B.fromBufferAttribute(p, b); C.fromBufferAttribute(p, c);
      B.sub(A); C.sub(A); B.cross(C); // area-weighted
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
  function rb(parent, w, h, d, r, mat, x, y, z, o) { return LIB.rbox(parent, w, h, d, r, mat, x, y, z, Object.assign({ seg: 2 }, o || {})); }
  function rb1(parent, w, h, d, r, mat, x, y, z, o) { return LIB.rbox(parent, w, h, d, r, mat, x, y, z, Object.assign({ seg: 1 }, o || {})); }
  function pf(parent, w, h, d, r, mat, x, y, z, o) { const m = LIB.puffy(parent, w, h, d, r, mat, x, y, z, Object.assign({ seg: 4 }, o || {})); smooth(m.geometry, 1.3); return m; }
  function ext(parent, shape, depth, mat, x, y, z, o) { const m = LIB.extrude(parent, shape, depth, mat, x, y, z, o); smooth(m.geometry, o && o.crease); return m; }
  // naive surface nets: polygonise the zero set of a signed distance f(x,y,z) (negative inside) on a grid of
  // cell size cs; normals come from the SDF gradient so a coarse grid still shades smoothly
  function surfaceNets(f, b0, b1, cs) {
    const nx = Math.ceil((b1[0] - b0[0]) / cs) + 1, ny = Math.ceil((b1[1] - b0[1]) / cs) + 1, nz = Math.ceil((b1[2] - b0[2]) / cs) + 1;
    const F = new Float32Array(nx * ny * nz), I = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[I(i, j, k)] = f(b0[0] + i * cs, b0[1] + j * cs, b0[2] + k * cs, i, k);
    const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k), vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { cv[c] = F[I(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const e of E) { const a = cv[e[0]], b = cv[e[1]]; if ((a < 0) === (b < 0)) continue; const t = a / (a - b);
        const ax = e[0] & 1, ay = (e[0] >> 1) & 1, az = (e[0] >> 2) & 1, bx = e[1] & 1, by = (e[1] >> 1) & 1, bz = (e[1] >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++; }
      vid[C(i, j, k)] = pos.length / 3; pos.push(b0[0] + (i + sx / n) * cs, b0[1] + (j + sy / n) * cs, b0[2] + (k + sz / n) * cs);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i + 1, j, k)] < 0; if (a === b) continue; quad(vid[C(i, j - 1, k - 1)], vid[C(i, j, k - 1)], vid[C(i, j, k)], vid[C(i, j - 1, k)], !a); }
    for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i, j + 1, k)] < 0; if (a === b) continue; quad(vid[C(i - 1, j, k - 1)], vid[C(i - 1, j, k)], vid[C(i, j, k)], vid[C(i, j, k - 1)], !a); }
    for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i, j, k + 1)] < 0; if (a === b) continue; quad(vid[C(i - 1, j - 1, k)], vid[C(i, j - 1, k)], vid[C(i, j, k)], vid[C(i - 1, j, k)], !a); }
    const nrm = [], h = cs * 0.35;
    for (let v = 0; v < pos.length; v += 3) { const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h), l = Math.hypot(gx, gy, gz) || 1; nrm.push(gx / l, gy / l, gz / l); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const uv = []; for (let v = 0; v < pos.length; v += 3) uv.push(pos[v] * 8, pos[v + 2] * 8 + pos[v + 1] * 8); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }
  // signed distance to a closed 2D polygon (array of THREE.Vector2), negative inside
  function sdPoly(P, x, y) {
    let d = 1e9, s = 1;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const ax = P[j].x, ay = P[j].y, ex = P[i].x - ax, ey = P[i].y - ay, wx = x - ax, wy = y - ay;
      const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey))), dx = wx - ex * t, dy = wy - ey * t; d = Math.min(d, dx * dx + dy * dy);
      const c1 = y >= ay, c2 = y < P[i].y, c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  }
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  function sdCapsule(px, py, pz, a, b, ra, rb, sy) { // tapered capsule, vertical axis squashed by sy
    py /= sy; const ay = a[1] / sy, by = b[1] / sy;
    const bax = b[0] - a[0], bay = by - ay, baz = b[2] - a[2], pax = px - a[0], pay = py - ay, paz = pz - a[2];
    const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - (ra + (rb - ra) * t);
  }
  // a soft sagging cable lying on / hanging from things
  function cable(parent, pts, r, mat) { return LIB.tube(parent, pts, r || 0.0022, mat, { segs: Math.max(24, pts.length * 10), radial: 6 }); }

  // ---------------------------------------------------------------- shared materials
  let MS = null;
  function M() {
    if (MS) return MS;
    const brushed = LIB.canvasTex('pa_brushed', 512, 128, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(3);
      for (let i = 0; i < 1400; i++) { const y = r() * h, x0 = r() * w; g.strokeStyle = (r() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.04 + r() * 0.12) + ')'; g.lineWidth = 0.5 + r(); g.beginPath(); g.moveTo(x0 - 220, y); g.lineTo(x0 + 220 + r() * 200, y); g.stroke(); }
    }, false);
    const fine = LIB.noiseTex('pa_fine', 256, 128, 60, 0.8);
    const grain = LIB.noiseTex('pa_grain', 256, 128, 90, 1.6);
    MS = {
      brushed, fine, grain,
      plastic: LIB.mat({ c: '#141516', rough: 0.62, bump: fine, bumpScale: 0.00025 }),     // matte black ABS
      plastic2: LIB.mat({ c: '#1b1c1e', rough: 0.5 }),                                         // charcoal, a touch lighter
      soft: LIB.mat({ c: '#121212', rough: 0.82, bump: grain, bumpScale: 0.0002 }),          // soft-touch rubberised
      gloss: LIB.mat({ c: '#0a0a0b', rough: 0.18, physical: true, clearcoat: 0.8, clearcoatRough: 0.12 }),
      metal: LIB.mat({ c: '#2e2f33', rough: 0.36, metal: 0.85, bump: brushed, bumpScale: 0.0003 }), // brushed dark aluminium
      steel: LIB.mat({ c: '#9a9da2', rough: 0.3, metal: 1 }),
      rubber: LIB.mat({ c: '#0d0d0d', rough: 0.92 }),
      hole: LIB.mat({ c: '#020202', rough: 1 }),
      cable: LIB.mat({ c: '#101011', rough: 0.55 }),
    };
    return MS;
  }
  function woodMat() {
    if (M().wood) return MS.wood;
    // grain runs along texture u; UVs are set in metres by uvMetric (u: 6.4 m per repeat, v: 3.2 m)
    MS.wood = LIB.mat({ c: '#f0d7b0', map: tex('wood_diffuse.jpg', true, 1, 1), bump: tex('wood_bump.jpg', false, 1, 1), bumpScale: 0.0005, roughMap: tex('wood_roughness.jpg', false, 1, 1), rough: 0.62 });
    return MS.wood;
  }
  const WU = 1 / 6.4, WV = 1 / 3.2;
  function woodBox(parent, w, h, d, r, x, y, z, uvo, o) {
    const m = rb(parent, w, h, d, r, woodMat(), x, y, z, o);
    uvMetric(m.geometry, WU, WV, Object.assign({ px: x, py: y, pz: z }, uvo || {}));
    return m;
  }

  // ---------------------------------------------------------------- the game frame on the monitor
  function gameFrame(g, W, H) {
    const R = LIB.rnd(11);
    let gr = g.createLinearGradient(0, 0, 0, H * 0.7);
    gr.addColorStop(0, '#0d1529'); gr.addColorStop(0.35, '#26375a'); gr.addColorStop(0.68, '#8c5f6a'); gr.addColorStop(0.86, '#d98b5c'); gr.addColorStop(1, '#f2b277');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + R() * 0.5) + ')'; g.fillRect(R() * W, R() * H * 0.3, 1.2, 1.2); }
    let rg = g.createRadialGradient(W * 0.68, H * 0.6, 4, W * 0.68, H * 0.6, W * 0.4);
    rg.addColorStop(0, 'rgba(255,226,170,1)'); rg.addColorStop(0.06, 'rgba(255,190,120,0.75)'); rg.addColorStop(0.3, 'rgba(240,140,90,0.25)'); rg.addColorStop(1, 'rgba(240,120,80,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    // cloud streaks
    for (let i = 0; i < 14; i++) { const y = H * (0.2 + R() * 0.32), x = R() * W, w = 120 + R() * 260; g.fillStyle = 'rgba(' + (R() < 0.5 ? '255,170,140' : '70,70,110') + ',' + (0.08 + R() * 0.15) + ')'; g.beginPath(); g.ellipse(x, y, w, 3 + R() * 6, 0, 0, TAU); g.fill(); }
    function ridge(base, amp, f, seed, col, rough) {
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) { const y = base - amp * (0.55 * Math.sin(x * f + seed) + 0.3 * Math.sin(x * f * 2.7 + seed * 1.7) + 0.15 * Math.sin(x * f * 6.3 + seed * 3.1)) - (rough ? (R() - 0.5) * rough : 0); g.lineTo(x, y); }
      g.lineTo(W, H); g.closePath(); g.fillStyle = col; g.fill();
    }
    ridge(H * 0.60, 70, 0.006, 1, '#6a6488', 2);
    g.fillStyle = 'rgba(240,160,120,0.18)'; g.fillRect(0, H * 0.5, W, H * 0.2);
    ridge(H * 0.68, 55, 0.009, 4, '#3f3c5c', 3);
    // ruined watchtower on the mid ridge
    g.fillStyle = '#34314d'; const tx = W * 0.8, ty = H * 0.56; g.fillRect(tx, ty - 70, 26, 90); g.fillRect(tx - 4, ty - 78, 34, 10);
    for (let i = 0; i < 4; i++) g.fillRect(tx - 4 + i * 9, ty - 86, 5, 8);
    g.fillStyle = 'rgba(255,200,120,0.9)'; g.fillRect(tx + 10, ty - 50, 4, 7);
    g.fillStyle = 'rgba(230,150,110,0.14)'; g.fillRect(0, H * 0.62, W, H * 0.12);
    ridge(H * 0.80, 40, 0.012, 7, '#22213a', 4);
    // foreground cliff the hero stands on
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.78); g.bezierCurveTo(W * 0.2, H * 0.74, W * 0.33, H * 0.78, W * 0.42, H * 0.8); g.bezierCurveTo(W * 0.5, H * 0.82, W * 0.55, H * 0.9, W * 0.62, H); g.closePath(); g.fillStyle = '#0c0b14'; g.fill();
    for (let i = 0; i < 60; i++) { const x = R() * W * 0.55, y = H * 0.77 + (x / W) * 40; g.strokeStyle = 'rgba(30,30,40,0.9)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 6, y - 4 - R() * 8); g.stroke(); }
    // hero (back to camera): cloak, hood, sword across the back
    const hx = W * 0.4, hy = H * 0.795;
    g.fillStyle = '#060509';
    g.beginPath(); g.moveTo(hx - 26, hy); g.quadraticCurveTo(hx - 30, hy - 60, hx - 18, hy - 92); g.quadraticCurveTo(hx, hy - 102, hx + 18, hy - 92); g.quadraticCurveTo(hx + 34, hy - 55, hx + 30, hy + 2); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(hx, hy - 106, 13, 15, 0, 0, TAU); g.fill();
    g.save(); g.translate(hx, hy - 70); g.rotate(-0.7); g.fillRect(-3, -62, 6, 110); g.fillRect(-12, -8, 24, 5); g.restore();
    g.strokeStyle = 'rgba(255,175,110,0.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(hx + 18, hy - 92); g.quadraticCurveTo(hx + 34, hy - 55, hx + 30, hy); g.stroke();
    g.beginPath(); g.arc(hx, hy - 106, 14, -1.2, 0.6); g.stroke();
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,' + (140 + R() * 80 | 0) + ',80,' + (0.3 + R() * 0.6) + ')'; g.fillRect(R() * W, H * 0.4 + R() * H * 0.5, 2, 2); }
    // vignette
    rg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.65); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    // ---- HUD
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(52, 52, 26, 0, TAU); g.fill(); g.strokeStyle = 'rgba(230,220,200,0.8)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#e8dcc0'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('27', 52, 53);
    const bar = (y, wFull, frac, col) => { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(88, y, wFull, 11); g.fillStyle = col; g.fillRect(89, y + 1, (wFull - 2) * frac, 9); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(88, y, wFull, 11); };
    bar(34, 260, 0.72, '#c3393b'); bar(50, 200, 0.55, '#d8c26a'); bar(66, 170, 0.8, '#4f86d9');
    g.textAlign = 'center'; g.fillStyle = 'rgba(240,235,220,0.85)'; g.font = '13px sans-serif';
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(W / 2 - 200, 18, 400, 22); g.fillStyle = 'rgba(240,235,220,0.85)';
    ['W', 'NW', 'N', 'NE', 'E'].forEach((t, i) => g.fillText(t, W / 2 - 160 + i * 80, 29)); g.fillStyle = '#f0c75e'; g.fillText('▼', W / 2 + 38, 29);
    g.textAlign = 'left'; g.fillStyle = 'rgba(240,200,110,0.95)'; g.font = 'bold 13px sans-serif'; g.fillText('MAIN QUEST', W - 250, 36);
    g.fillStyle = 'rgba(240,235,225,0.9)'; g.font = '15px sans-serif'; g.fillText('Reach the Old Watchtower', W - 250, 56); g.font = '12px sans-serif'; g.fillStyle = 'rgba(220,220,220,0.75)'; g.fillText('◆  Light the beacon  0 / 1', W - 250, 75);
    // minimap
    const mx = W - 86, my = H - 86; g.fillStyle = 'rgba(12,16,24,0.6)'; g.beginPath(); g.arc(mx, my, 62, 0, TAU); g.fill(); g.strokeStyle = 'rgba(230,225,210,0.7)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(160,170,190,0.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx - 50, my + 20); g.quadraticCurveTo(mx - 10, my - 5, mx + 30, my - 40); g.stroke();
    g.fillStyle = '#f0c75e'; g.beginPath(); g.arc(mx + 30, my - 40, 4, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 6, my + 6); g.lineTo(mx, my + 3); g.lineTo(mx - 6, my + 6); g.closePath(); g.fill();
    // ability slots
    for (let i = 0; i < 4; i++) { const x = W / 2 - 112 + i * 58, y = H - 70; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, 48, 48); g.strokeStyle = 'rgba(230,220,200,0.6)'; g.lineWidth = 1.5; g.strokeRect(x, y, 48, 48);
      g.strokeStyle = ['#e0a050', '#7fb0e0', '#c070c0', '#90d080'][i]; g.lineWidth = 3; g.beginPath(); if (i === 0) { g.moveTo(x + 12, y + 36); g.lineTo(x + 36, y + 12); } else if (i === 1) g.arc(x + 24, y + 24, 12, 0, TAU); else if (i === 2) { g.moveTo(x + 24, y + 10); g.lineTo(x + 36, y + 36); g.lineTo(x + 12, y + 36); g.closePath(); } else g.rect(x + 14, y + 14, 20, 20); g.stroke();
      g.fillStyle = 'rgba(240,235,220,0.8)'; g.font = '11px sans-serif'; g.fillText(String(i + 1), x + 4, y + 12); }
    g.fillStyle = 'rgba(240,235,220,0.9)'; g.font = 'bold 18px sans-serif'; g.fillText('12 / 30', 40, H - 40); g.font = '12px sans-serif'; g.fillStyle = 'rgba(220,220,220,0.7)'; g.fillText('ARROWS', 40, H - 22);
  }

  // ---------------------------------------------------------------- monitor
  function monitor(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    g.userData.name = 'the monitor';
    // V-shaped flat foot (brushed metal)
    const foot = smoothShape([[0, 0.075], [0.05, 0.07], [0.15, -0.035], [0.19, -0.11], [0.165, -0.125], [0.1, -0.075], [0, -0.005], [-0.1, -0.075], [-0.165, -0.125], [-0.19, -0.11], [-0.15, -0.035], [-0.05, 0.07]], 110);
    ext(g, foot, 0.008, m.metal, 0, 0.0065, -0.03, { rx: -PI / 2, bevelT: 0.0025, bevelS: 0.003, bevelSeg: 3 });
    // neck: an upright with a slight backward lean
    const neck = LIB.group(g, 0, 0.012, -0.1);
    rb(neck, 0.058, 0.4, 0.024, 0.008, m.metal, 0, 0.2, 0, { rx: -0.04 });
    rb(neck, 0.03, 0.03, 0.006, 0.003, m.hole, 0, 0.06, -0.012, { rx: -0.04 }); // cable-management cut-out (dark)
    // panel assembly
    const py = 0.29, pz = -0.035;
    const pg = LIB.group(g, 0, py, pz); pg.rotation.x = -0.05;
    rb(pg, 0.615, 0.36, 0.016, 0.004, m.plastic, 0, 0, 0);                               // thin body
    rb(pg, 0.42, 0.25, 0.04, 0.016, m.plastic2, 0, -0.01, -0.02);                         // back bulge (electronics)
    rb(pg, 0.12, 0.12, 0.03, 0.01, m.plastic, 0, 0.0, -0.045);                            // VESA hinge block
    rb(pg, 0.06, 0.05, 0.05, 0.008, m.metal, 0, 0.0, -0.06);                              // tilt hinge into neck
    for (let i = 0; i < 9; i++) rb(pg, 0.3, 0.0025, 0.002, 0.001, m.hole, 0, 0.08 - i * 0.008, -0.0405, { seg: 1 }); // rear vent slots
    // screen: dark glossy glass with the game frame glowing through
    const tex = LIB.canvasTex('pa_game', 1024, 576, gameFrame, true);
    const scr = LIB.mat({ c: '#050607', rough: 0.08, emissive: '#ffffff', emissiveIntensity: 0.9, physical: true, clearcoat: 1, clearcoatRough: 0.04 });
    scr.emissiveMap = tex;
    LIB.plane(pg, 0.598, 0.3365, scr, 0, 0.0035, 0.0082);
    // chin: a hairline power LED and a small joystick nub under the bottom edge
    rb(pg, 0.004, 0.0015, 0.001, 0.0005, LIB.mat({ c: '#ffffff', emissive: '#dfe9ff', emissiveIntensity: 1.2 }), 0.27, -0.172, 0.0082, { seg: 1, shadow: false });
    rb(pg, 0.01, 0.006, 0.01, 0.003, m.plastic2, 0, -0.181, -0.003);
    g.userData.focus = { x: 0, y: py, z: 0.05, r: 0.42 }; // in this group's own frame
    return g;
  }

  // ---------------------------------------------------------------- keyboard
  function keyboard(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    g.userData.name = 'the keyboard';
    const k = LIB.group(g, 0, 0.0035, 0); k.rotation.x = 0.045; // feet at the back
    const u = 0.0185, KW = 22.5 * u, KD = 6.5 * u;
    rb(k, 0.44, 0.022, 0.135, 0.006, m.plastic, 0, 0.011, 0);
    rb(k, 0.429, 0.003, 0.125, 0.0012, m.metal, 0, 0.0225, 0);                           // brushed top plate
    rb(k, 0.418, 0.001, 0.118, 0.0004, LIB.mat({ c: '#0c0d10', emissive: '#b8c8ff', emissiveIntensity: 0.015 }), 0, 0.0242, 0, { seg: 1, shadow: false }); // switch plate with faint backlight
    // layout (units): [x, w, label, h]
    const rows = [];
    const r0 = [[0, 1, 'Esc']]; ['F1', 'F2', 'F3', 'F4'].forEach((t, i) => r0.push([2 + i, 1, t])); ['F5', 'F6', 'F7', 'F8'].forEach((t, i) => r0.push([6.5 + i, 1, t])); ['F9', 'F10', 'F11', 'F12'].forEach((t, i) => r0.push([11 + i, 1, t])); ['PrtSc', 'ScrLk', 'Pause'].forEach((t, i) => r0.push([15.25 + i, 1, t]));
    rows.push({ y: 0, keys: r0 });
    const r1 = '`1234567890-='.split('').map((t, i) => [i, 1, t]); r1.push([13, 2, 'Bksp']); ['Ins', 'Home', 'PgUp'].forEach((t, i) => r1.push([15.25 + i, 1, t])); ['Num', '/', '*', '-'].forEach((t, i) => r1.push([18.5 + i, 1, t]));
    rows.push({ y: 1.5, keys: r1 });
    const r2 = [[0, 1.5, 'Tab']]; 'QWERTYUIOP[]'.split('').forEach((t, i) => r2.push([1.5 + i, 1, t])); r2.push([13.5, 1.5, '\\']); ['Del', 'End', 'PgDn'].forEach((t, i) => r2.push([15.25 + i, 1, t])); ['7', '8', '9'].forEach((t, i) => r2.push([18.5 + i, 1, t])); r2.push([21.5, 1, '+', 2]);
    rows.push({ y: 2.5, keys: r2 });
    const r3 = [[0, 1.75, 'Caps']]; "ASDFGHJKL;'".split('').forEach((t, i) => r3.push([1.75 + i, 1, t])); r3.push([12.75, 2.25, 'Enter']); ['4', '5', '6'].forEach((t, i) => r3.push([18.5 + i, 1, t]));
    rows.push({ y: 3.5, keys: r3 });
    const r4 = [[0, 2.25, 'Shift']]; 'ZXCVBNM,./'.split('').forEach((t, i) => r4.push([2.25 + i, 1, t])); r4.push([12.25, 2.75, 'Shift']); r4.push([16.25, 1, '↑']); ['1', '2', '3'].forEach((t, i) => r4.push([18.5 + i, 1, t])); r4.push([21.5, 1, '', 2]);
    rows.push({ y: 4.5, keys: r4 });
    const r5 = [[0, 1.25, 'Ctrl'], [1.25, 1.25, 'Fn'], [2.5, 1.25, 'Alt'], [3.75, 6.25, ''], [10, 1.25, 'Alt'], [11.25, 1.25, 'Fn'], [12.5, 1.25, 'Menu'], [13.75, 1.25, 'Ctrl'], [15.25, 1, '←'], [16.25, 1, '↓'], [17.25, 1, '→'], [18.5, 2, '0'], [20.5, 1, '.']];
    rows.push({ y: 5.5, keys: r5 });
    const prof = [{ h: 0.0105, t: 0.16 }, { h: 0.0105, t: 0.13 }, { h: 0.0095, t: 0.07 }, { h: 0.0088, t: 0.0 }, { h: 0.0092, t: -0.07 }, { h: 0.0096, t: -0.12 }];
    const geos = {}, inst = {};
    function capGeo(wu, du, h) {
      const key = wu + 'x' + du + 'x' + h;
      if (geos[key]) return key;
      const w = wu * u - 0.0013, d = du * u - 0.0013;
      const gg = new THREE.RoundedBoxGeometry(w, h, d, 1, 0.0012);
      const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) { const yy = p.getY(i), f = (yy + h / 2) / h; const ins = 0.0024 * f; p.setX(i, p.getX(i) - Math.sign(p.getX(i)) * ins); p.setZ(i, p.getZ(i) - Math.sign(p.getZ(i)) * ins * 1.2); }
      gg.computeVertexNormals();
      geos[key] = gg; inst[key] = [];
      return key;
    }
    const base = 0.0262, x0 = -KW / 2, z0 = -KD / 2;
    const ob = new THREE.Object3D();
    rows.forEach((row, ri) => {
      const pr = prof[ri];
      // legends for this row (backlit, slightly frosted)
      const lt = LIB.canvasTex('pa_kbleg' + ri, 2048, 96, (c, W, H) => {
        c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(225,230,240,0.95)'; c.textBaseline = 'middle';
        row.keys.forEach(kk => { if (!kk[2] || kk[3]) return; const cx = (kk[0] + 0.5) / 22.5 * W; const big = kk[2].length === 1; c.font = (big ? '600 30px' : '500 17px') + ' sans-serif'; c.textAlign = big ? 'center' : 'left'; c.fillText(kk[2], big ? cx : (kk[0] / 22.5 * W + 14), big ? H * 0.42 : H * 0.36); });
      }, true);
      const lm = LIB.mat({ c: '#d6dbe4', map: lt, transparent: true, rough: 0.5, emissive: '#c9d6ff', emissiveIntensity: 0.22 }); lm.emissiveMap = lt; lm.depthWrite = false; lm.polygonOffset = true; lm.polygonOffsetFactor = -2;
      const zc = z0 + (row.y + 0.5) * u;
      const lp = LIB.plane(k, KW, u, lm, 0, base + pr.h + 0.00015, zc, { rx: -PI / 2 + pr.t });
      lp.position.y += Math.sin(pr.t) * 0; lp.renderOrder = 2;
      row.keys.forEach(kk => {
        const wu = kk[1], du = kk[3] || 1;
        const key = capGeo(wu, du, pr.h);
        ob.position.set(x0 + (kk[0] + wu / 2) * u, base + pr.h / 2, z0 + (row.y + du / 2) * u);
        ob.rotation.set(pr.t, 0, 0); ob.updateMatrix();
        inst[key].push(ob.matrix.clone());
      });
    });
    const capM = LIB.mat({ c: '#141517', rough: 0.78, env: 0.6, bump: m.fine, bumpScale: 0.00015 }); // PBT-like texture
    Object.keys(inst).forEach(key => { const im = new THREE.InstancedMesh(geos[key], capM, inst[key].length); inst[key].forEach((mx, i) => im.setMatrixAt(i, mx)); im.castShadow = true; im.receiveShadow = true; k.add(im); });
    // little status LEDs and the USB-C at the back
    [0, 1, 2].forEach(i => rb(k, 0.003, 0.001, 0.0015, 0.0005, LIB.mat({ c: '#fff', emissive: '#e9f0ff', emissiveIntensity: i === 0 ? 1 : 0.05 }), 0.17 + i * 0.008, 0.0232, -0.062, { seg: 1, shadow: false }));
    rb(k, 0.012, 0.006, 0.006, 0.002, m.metal, -0.06, 0.011, -0.0685);
    g.userData.focus = { x: 0, y: 0.03, z: 0, r: 0.28 };
    return g;
  }

  // ---------------------------------------------------------------- desk mat
  function deskMat(parent, x, y, z) {
    const tex = LIB.canvasTex('pa_mat', 1600, 600, (g, W, H) => {
      g.fillStyle = '#121213'; g.fillRect(0, 0, W, H);
      const r = LIB.rnd(5); for (let i = 0; i < 26000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'; g.fillRect(r() * W, r() * H, 2, 2); }
      g.strokeStyle = '#3a3b3e'; g.lineWidth = 4; g.setLineDash([10, 5]); const m = 9; g.beginPath(); g.roundRect ? g.roundRect(m, m, W - 2 * m, H - 2 * m, 18) : g.rect(m, m, W - 2 * m, H - 2 * m); g.stroke();
    }, true);
    tex.repeat.set(1 / 0.8, 1 / 0.3); tex.offset.set(0.5, 0.5);
    const weave = LIB.weaveBump(); const wb = weave.clone(); wb.needsUpdate = true; wb.repeat.set(1 / 0.8 * 18, 1 / 0.3 * 18);
    const mat = LIB.mat({ c: '#ffffff', map: tex, rough: 0.88, bump: wb, bumpScale: 0.0006 });
    const sh = LIB.roundRectShape(0.8, 0.3, 0.02);
    const mesh = ext(parent, sh, 0.0024, mat, x, y + 0.0015, z, { rx: -PI / 2, bevelT: 0.0003, bevelS: 0.0006, bevelSeg: 2 });
    return mesh;
  }

  // ---------------------------------------------------------------- gaming mouse (lofted ergonomic shell)
  function mouse(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    const L = 0.126;
    const Wt = [[0, 0.05], [0.18, 0.063], [0.42, 0.062], [0.66, 0.057], [0.88, 0.061], [1, 0.058]];
    const Ht = [[0, 0.018], [0.2, 0.035], [0.38, 0.041], [0.6, 0.035], [0.85, 0.025], [1, 0.02]];
    const env = s => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * s - 1), 5)), 0.3);
    const n = 2.6;
    const shell = (s, t) => {
      const e = env(s), w = interp(Wt, s) * e * 0.5, h = interp(Ht, s) * Math.pow(e, 0.6);
      const th = t * PI; const c = Math.cos(th), sn = Math.sin(th);
      const xx = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), yy = 0.002 + h * Math.pow(Math.abs(sn), 2 / n);
      // thumb scoop on the left (+t side is left: x<0)
      const scoop = (c < 0 ? Math.exp(-Math.pow((s - 0.45) / 0.18, 2)) * Math.exp(-Math.pow((th - PI * 0.85) / 0.25, 2)) * 0.004 : 0);
      return [xx + (c < 0 ? scoop : 0), yy, L / 2 - s * L];
    };
    // texture: button split lines and side grip
    const draw = (lineCol, base) => (c, W, H) => {
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      c.strokeStyle = lineCol; c.lineWidth = 3;
      const yb = (1 - 0.58) * H;
      c.beginPath(); c.moveTo(0.5 * W, 0); c.lineTo(0.5 * W, yb); c.stroke();             // L/R split
      c.beginPath(); c.moveTo(0.27 * W, yb + 4); c.quadraticCurveTo(0.5 * W, yb - 10, 0.73 * W, yb + 4); c.stroke(); // rear of buttons
      c.beginPath(); c.moveTo(0.27 * W, 0); c.lineTo(0.27 * W, yb + 4); c.moveTo(0.73 * W, 0); c.lineTo(0.73 * W, yb + 4); c.stroke();
    };
    const map = LIB.canvasTex('pa_mouse_c', 512, 512, draw('#050505', '#1a1a1b'), true);
    const bump = LIB.canvasTex('pa_mouse_b', 512, 512, draw('#000000', '#808080'), false);
    const mat = LIB.mat({ c: '#ffffff', map: map, rough: 0.72, bump: bump, bumpScale: 0.0006 });
    LIB.mesh(g, loftGeo(48, 32, shell), mat, 0, 0, 0);
    // flat sole
    const sole = []; for (let i = 0; i <= 24; i++) { const s = i / 24; const p = shell(s, 0); sole.push(new THREE.Vector2(p[0], p[2])); } for (let i = 24; i >= 0; i--) { const s = i / 24; const p = shell(s, 1); sole.push(new THREE.Vector2(p[0], p[2])); }
    LIB.mesh(g, new THREE.ShapeGeometry(new THREE.Shape(sole)), m.rubber, 0, 0.0021, 0, { rx: PI / 2 });
    // scroll wheel with ribbed rubber
    const rib = LIB.canvasTex('pa_rib', 64, 16, (c, W, H) => { c.fillStyle = '#808080'; c.fillRect(0, 0, W, H); c.fillStyle = '#202020'; for (let i = 0; i < W; i += 4) c.fillRect(i, 0, 2, H); }, false);
    const sz = L / 2 - 0.75 * L;
    LIB.cyl(g, 0.0095, 0.0095, 0.0075, LIB.mat({ c: '#2a2a2b', rough: 0.85, bump: rib, bumpScale: 0.0006 }), 0, interp(Ht, 0.75) - 0.004, sz, { rz: PI / 2, seg: 28 });
    rb(g, 0.011, 0.004, 0.024, 0.002, m.hole, 0, interp(Ht, 0.75) - 0.0015, sz, { seg: 1 });
    rb(g, 0.006, 0.003, 0.01, 0.0015, m.gloss, 0, interp(Ht, 0.55) + 0.0005, L / 2 - 0.55 * L - 0.004, { seg: 1, rx: -0.3 }); // DPI button
    // two thumb buttons on the left side
    [[0.5, 0.019], [0.36, 0.017]].forEach((b, i) => { const s = b[0]; const p = shell(s, 0.86); rb(g, 0.004, 0.007, 0.018, 0.002, m.gloss, p[0] - 0.0005, 0.021, p[2], { rz: 0.25, seg: 2 }); });
    // the faint underglow strip at the rear
    rb(g, 0.024, 0.0012, 0.002, 0.0005, LIB.mat({ c: '#fff', emissive: '#cfdcff', emissiveIntensity: 0.35 }), 0, 0.0045, L / 2 - 0.018, { seg: 1, shadow: false });
    return g;
  }

  // ---------------------------------------------------------------- headset on a stand
  function headset(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    g.userData.name = 'the headset';
    // stand
    rb(g, 0.11, 0.012, 0.11, 0.005, m.metal, 0, 0.006, 0);
    rb(g, 0.09, 0.002, 0.09, 0.001, m.rubber, 0, 0.0005, 0, { seg: 1 });
    rb(g, 0.022, 0.29, 0.016, 0.006, m.metal, 0, 0.155, 0);
    rb(g, 0.03, 0.016, 0.1, 0.007, m.rubber, 0, 0.305, 0); // rubber saddle
    // headset: the band arc lies in the x-y plane, cups hanging on either side
    const Rb = 0.084, cy = 0.31 - Rb - 0.005;
    const arcShape = (r0, r1, a0, a1) => { const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true); s.closePath(); return s; };
    ext(g, arcShape(Rb + 0.004, Rb + 0.009, 0.08, PI - 0.08), 0.03, m.plastic, 0, cy, 0, { bevelT: 0.002, bevelS: 0.0015, bevelSeg: 2, curve: 28 });
    ext(g, arcShape(Rb - 0.007, Rb + 0.003, 0.35, PI - 0.35), 0.026, LIB.mat({ c: '#191919', rough: 0.5, bump: m.grain, bumpScale: 0.0004 }), 0, cy, 0, { bevelT: 0.004, bevelS: 0.003, bevelSeg: 3, curve: 28 });
    [-1, 1].forEach(sd => {
      const ex = sd * (Rb + 0.0065) * Math.cos(0.08), ey = cy + (Rb + 0.0065) * Math.sin(0.08);
      // steel slider + yoke
      rb(g, 0.004, 0.06, 0.012, 0.0015, m.steel, ex, ey - 0.026, 0);
      const yk = LIB.group(g, sd * (Rb + 0.012), cy - 0.045, 0);
      LIB.tube(yk, [[-sd * 0.002, 0.012, 0], [sd * 0.004, 0.006, -0.035], [sd * 0.004, -0.04, -0.045]], 0.0035, m.plastic, { segs: 12, radial: 6 });
      LIB.tube(yk, [[-sd * 0.002, 0.012, 0], [sd * 0.004, 0.006, 0.035], [sd * 0.004, -0.04, 0.045]], 0.0035, m.plastic, { segs: 12, radial: 6 });
      // cup: axis along x
      const cup = LIB.group(g, sd * 0.098, cy - 0.095, 0); cup.scale.set(1, 1.18, 1);
      LIB.lathe(cup, [[0.044, -0.012], [0.046, -0.008], [0.046, 0.004], [0.042, 0.011], [0.03, 0.015], [0, 0.016]], m.plastic, 0, 0, 0, { rz: -sd * PI / 2, seg: 32 });
      LIB.cyl(cup, 0.031, 0.031, 0.002, m.metal, sd * 0.0165, 0, 0, { rz: PI / 2, seg: 40 });          // brushed outer plate
      LIB.cyl(cup, 0.025, 0.025, 0.0015, m.gloss, sd * 0.018, 0, 0, { rz: PI / 2, seg: 40 });
      // leatherette cushion and fabric inner
      LIB.torus(cup, 0.033, 0.012, LIB.mat({ c: '#161616', rough: 0.55, bump: m.grain, bumpScale: 0.0005 }), -sd * 0.018, 0, 0, { ry: PI / 2, rs: 10, ts: 32 });
      LIB.cyl(cup, 0.026, 0.026, 0.002, LIB.mat({ c: '#202022', rough: 0.95, bump: LIB.weaveBump(), bumpScale: 0.0005 }), -sd * 0.014, 0, 0, { rz: PI / 2, seg: 32 });
    });
    // mic boom from the left cup forward
    const mx = -0.098 - 0.012, my = cy - 0.095 - 0.03;
    LIB.tube(g, [[mx, my, 0.01], [mx + 0.004, my - 0.02, 0.05], [mx + 0.022, my - 0.03, 0.095], [mx + 0.05, my - 0.028, 0.12]], 0.0028, m.plastic, { segs: 30, radial: 8 });
    rb(g, 0.024, 0.011, 0.011, 0.005, m.soft, mx + 0.06, my - 0.027, 0.124, { ry: -0.5 });
    LIB.cyl(g, 0.0035, 0.0035, 0.004, LIB.mat({ c: '#b23030', rough: 0.4, emissive: '#ff3030', emissiveIntensity: 0.15 }), mx + 0.071, my - 0.027, 0.13, { rz: PI / 2, ry: -0.5, seg: 12 });
    g.userData.focus = { x: 0, y: 0.18, z: 0, r: 0.2 };
    return g;
  }

  // ---------------------------------------------------------------- bookshelf speaker
  function speaker(parent, x, y, z, ry, led) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    const W = 0.1, H = 0.165, D = 0.125;
    rb(g, W, H, D, 0.008, LIB.mat({ c: '#151516', rough: 0.72, bump: m.grain, bumpScale: 0.0003 }), 0, H / 2 + 0.004, 0);
    rb(g, W - 0.006, H - 0.006, 0.006, 0.004, m.plastic2, 0, H / 2 + 0.004, D / 2 - 0.001);  // baffle
    [[-0.035, -0.035], [0.035, -0.035], [-0.035, 0.035], [0.035, 0.035]].forEach(f => LIB.cyl(g, 0.006, 0.006, 0.004, m.rubber, f[0], 0.002, f[1], { seg: 12 }));
    const zf = D / 2 + 0.002;
    // woofer
    const wy = 0.06;
    LIB.torus(g, 0.036, 0.0035, m.plastic, 0, wy, zf, { rs: 6, ts: 32 });
    LIB.torus(g, 0.032, 0.003, m.rubber, 0, wy, zf - 0.001, { rs: 6, ts: 32 });
    LIB.lathe(g, [[0.03, 0.0], [0.02, -0.006], [0.01, -0.011], [0.0, -0.011]], LIB.mat({ c: '#1d1e20', rough: 0.45, metal: 0.2, bump: m.fine, bumpScale: 0.0003, side: THREE.DoubleSide }), 0, wy, zf, { rx: PI / 2, seg: 32 });
    LIB.sph(g, 0.011, m.gloss, 0, wy, zf - 0.016, { ws: 16, hs: 8 });
    // tweeter
    const ty = 0.128;
    LIB.torus(g, 0.018, 0.003, m.plastic, 0, ty, zf, { rs: 8, ts: 32 });
    LIB.cyl(g, 0.016, 0.016, 0.002, m.metal, 0, ty, zf - 0.001, { rx: PI / 2, seg: 32 });
    LIB.sph(g, 0.009, LIB.mat({ c: '#1a1a1c', rough: 0.3, metal: 0.4 }), 0, ty, zf - 0.004, { ws: 16, hs: 8 });
    if (led) LIB.cyl(g, 0.0016, 0.0016, 0.001, LIB.mat({ c: '#fff', emissive: '#e6eeff', emissiveIntensity: 1 }), 0.035, 0.02, zf + 0.0005, { rx: PI / 2, seg: 10, shadow: false });
    return g;
  }

  // ---------------------------------------------------------------- articulated desk lamp
  function lamp(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    const blk = LIB.mat({ c: '#121214', rough: 0.45, metal: 0.4 });
    LIB.lathe(g, [[0, 0], [0.07, 0], [0.072, 0.006], [0.068, 0.018], [0.055, 0.024], [0, 0.024]], blk, 0, 0, 0, { seg: 48 });
    LIB.cyl(g, 0.012, 0.016, 0.03, blk, 0, 0.038, 0, { seg: 20 });
    LIB.cyl(g, 0.009, 0.009, 0.03, m.metal, 0, 0.058, 0, { rz: PI / 2, seg: 16 });  // shoulder joint
    const A = [0, 0.058, 0], B = [-0.035, 0.40, 0.075], C = [-0.13, 0.40, 0.28];
    const rod = (p, q, off) => LIB.tube(g, [[p[0] + off, p[1], p[2]], [(p[0] + q[0]) / 2 + off, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [q[0] + off, q[1], q[2]]], 0.0035, blk, { segs: 8, radial: 8 });
    [-0.008, 0.008].forEach(o => { rod(A, B, o); rod(B, C, o); });
    // springs along the lower arm
    const sp = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 18; const px = A[0] + (B[0] - A[0]) * (0.15 + t * 0.4), py = A[1] + (B[1] - A[1]) * (0.15 + t * 0.4), pz = A[2] + (B[2] - A[2]) * (0.15 + t * 0.4); sp.push([px + 0.016 + Math.cos(a) * 0.0035, py, pz - 0.012 + Math.sin(a) * 0.0035]); }
    LIB.tube(g, sp, 0.0007, m.steel, { segs: 180, radial: 3 });
    LIB.cyl(g, 0.01, 0.01, 0.03, m.metal, B[0], B[1], B[2], { rz: PI / 2, seg: 16 });  // elbow
    // head: cone shade pointing down and slightly forward
    const head = LIB.group(g, C[0], C[1], C[2]); head.rotation.set(0.35, 0, 0.15);
    LIB.cyl(head, 0.009, 0.009, 0.028, m.metal, 0, 0.012, 0, { rz: PI / 2, seg: 16 });
    LIB.lathe(head, [[0.012, 0.0], [0.022, -0.02], [0.05, -0.085], [0.052, -0.09]], LIB.mat({ c: '#121214', rough: 0.5, metal: 0.4, side: THREE.DoubleSide }), 0, 0, 0, { seg: 40 });
    LIB.lathe(head, [[0.05, -0.088], [0.021, -0.022], [0.011, -0.004]], LIB.mat({ c: '#e8e6e0', rough: 0.6, side: THREE.DoubleSide }), 0, 0, 0, { seg: 40 });
    LIB.sph(head, 0.018, LIB.mat({ c: '#f4f1ea', rough: 0.3, emissive: '#fff4e0', emissiveIntensity: 0.15 }), 0, -0.045, 0, { ws: 16, hs: 12 });
    LIB.cyl(head, 0.006, 0.006, 0.012, m.steel, 0.02, -0.005, 0, { seg: 10, rz: 0.6 }); // switch
    return g;
  }

  // ---------------------------------------------------------------- PC fan
  function fan(parent, s, x, y, z, ry, glow) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    const t = 0.025, b = 0.012;
    const fr = LIB.mat({ c: '#121213', rough: 0.6, side: THREE.DoubleSide });
    [[0, s / 2 - b / 2, s, b], [0, -s / 2 + b / 2, s, b], [s / 2 - b / 2, 0, b, s], [-s / 2 + b / 2, 0, b, s]].forEach(q => rb(g, q[2], q[3], t, 0.003, fr, q[0], q[1], 0, { seg: 1 }));
    LIB.cyl(g, s * 0.465, s * 0.465, t * 0.96, fr, 0, 0, 0, { rx: PI / 2, open: true, seg: 28 });
    LIB.cyl(g, 0.02, 0.02, t * 0.7, m.plastic2, 0, 0, 0, { rx: PI / 2, seg: 24 });
    const r0 = 0.019, r1 = s * 0.45, bl = new THREE.Shape(); const N = 5;
    for (let i = 0; i <= N; i++) { const f = i / N, r = r0 + (r1 - r0) * f, a = 0.28 + 0.38 * f; i ? bl.lineTo(r * Math.cos(a), r * Math.sin(a)) : bl.moveTo(r * Math.cos(a), r * Math.sin(a)); }
    for (let i = N; i >= 0; i--) { const f = i / N, r = r0 + (r1 - r0) * f, a = -0.22 + 0.12 * f; bl.lineTo(r * Math.cos(a), r * Math.sin(a)); }
    const bladeM = LIB.mat({ c: '#1a1b1e', rough: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) { const bg = LIB.group(g, 0, 0, 0); bg.rotation.z = i * TAU / 7; ext(bg, bl, 0.0012, bladeM, 0, 0, 0, { bevel: false, ry: 0.0, rx: 0.35 }); }
    if (glow) LIB.torus(g, s * 0.455, 0.0022, glow, 0, 0, t * 0.5, { rs: 4, ts: 40 });
    return g;
  }

  // ---------------------------------------------------------------- PC tower (glass side faces +x)
  function pcTower(parent, x, y, z, ry) {
    const m = M();
    const g = LIB.group(parent, x, y, z, ry);
    g.userData.name = 'the PC';
    const W = 0.21, H = 0.47, D = 0.45, y0 = 0.02, yc = y0 + H / 2;
    const steel = LIB.mat({ c: '#131416', rough: 0.55, bump: m.fine, bumpScale: 0.0002 });
    const glow = LIB.mat({ c: '#ffffff', emissive: '#cfe0ff', emissiveIntensity: 0.9, rough: 0.4 });
    // feet
    [[-0.08, -0.18], [0.08, -0.18], [-0.08, 0.18], [0.08, 0.18]].forEach(f => rb1(g, 0.035, 0.02, 0.06, 0.006, m.rubber, f[0], 0.01, f[1]));
    rb1(g, 0.006, H, D, 0.003, steel, -W / 2 + 0.003, yc, 0);                     // solid side
    rb1(g, W, 0.012, D, 0.004, steel, 0, y0 + H - 0.006, 0);                          // top
    rb1(g, W, 0.012, D, 0.004, steel, 0, y0 + 0.006, 0);                              // bottom
    rb1(g, W, H, 0.008, 0.003, steel, 0, yc, -D / 2 + 0.004);                         // rear
    rb1(g, 0.006, H, 0.012, 0.002, steel, W / 2 - 0.003, yc, -D / 2 + 0.01);         // glass frame posts
    rb1(g, 0.006, H, 0.012, 0.002, steel, W / 2 - 0.003, yc, D / 2 - 0.03);
    // top dust filter
    const tv = LIB.canvasTex('pa_topvent', 256, 256, (c, w, h) => { c.fillStyle = '#2a2a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#050505'; for (let yy = 0; yy < h; yy += 8) for (let xx = (yy / 8) % 2 ? 4 : 0; xx < w; xx += 8) { c.beginPath(); c.arc(xx, yy, 2.6, 0, TAU); c.fill(); } }, true, 10, 20);
    LIB.plane(g, 0.15, 0.3, LIB.mat({ c: '#ffffff', map: tv, rough: 0.8 }), 0, y0 + H + 0.0002, -0.05, { rx: -PI / 2 });
    // front: plastic frame with perforated mesh insert
    rb1(g, W, H, 0.022, 0.007, m.plastic, 0, yc, D / 2 - 0.011);
    const mesh = (srgb) => LIB.canvasTex('pa_mesh' + (srgb ? 'c' : 'b'), 256, 256, (c, w, h) => {
      c.fillStyle = srgb ? '#1c1d1f' : '#c0c0c0'; c.fillRect(0, 0, w, h); c.fillStyle = srgb ? '#030303' : '#000000';
      for (let yy = 0; yy <= h; yy += 16) for (let xx = (yy / 16) % 2 ? 8 : 0; xx <= w + 8; xx += 16) { c.beginPath(); c.arc(xx, yy, 5.2, 0, TAU); c.fill(); }
    }, srgb, 9, 22);
    LIB.plane(g, 0.17, 0.41, LIB.mat({ c: '#ffffff', map: mesh(true), bump: mesh(false), bumpScale: 0.0006, rough: 0.7 }), 0, yc - 0.01, D / 2 + 0.0004);
    // top-front I/O: power button with a ring LED, two USB, audio
    LIB.cyl(g, 0.0075, 0.0075, 0.003, m.metal, 0.06, y0 + H + 0.0015, D / 2 - 0.03, { seg: 24 });
    LIB.torus(g, 0.0079, 0.0007, glow, 0.06, y0 + H + 0.0015, D / 2 - 0.03, { rx: PI / 2, rs: 6, ts: 32 });
    [0.0, 0.022].forEach(o => rb1(g, 0.014, 0.002, 0.006, 0.0008, m.hole, -0.02 + o, y0 + H + 0.0005, D / 2 - 0.03, { seg: 1 }));
    LIB.cyl(g, 0.0025, 0.0025, 0.002, m.hole, -0.055, y0 + H + 0.0005, D / 2 - 0.03, { seg: 12 });
    // ---- internals (seen through the glass)
    const inner = LIB.mat({ c: '#0e0f11', rough: 0.7 });
    rb1(g, 0.004, H - 0.03, D - 0.04, 0.001, inner, -W / 2 + 0.008, yc, 0, { seg: 1 });   // tray
    rb1(g, 0.003, 0.3, 0.245, 0.002, LIB.mat({ c: '#1a1d22', rough: 0.45, metal: 0.2 }), -W / 2 + 0.0115, y0 + 0.31, -0.085);  // motherboard
    rb1(g, 0.018, 0.07, 0.03, 0.003, LIB.mat({ c: '#2b2d31', rough: 0.35, metal: 0.8 }), -W / 2 + 0.02, y0 + 0.42, -0.19);       // VRM heatsink
    // RAM
    for (let i = 0; i < 4; i++) rb1(g, 0.034, 0.13, 0.0065, 0.001, LIB.mat({ c: '#17181b', rough: 0.4, metal: 0.5 }), -W / 2 + 0.03, y0 + 0.36, -0.005 + i * 0.009, { seg: 1 });
    // CPU tower cooler + its fan (blows to the rear)
    rb1(g, 0.13, 0.13, 0.05, 0.003, LIB.mat({ c: '#1b1c1f', rough: 0.4, metal: 0.7, bump: LIB.canvasTex('pa_fins', 64, 64, (c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); c.fillStyle = '#000'; for (let i = 0; i < w; i += 4) c.fillRect(i, 0, 1, h); }, false, 1, 1), bumpScale: 0.001 }), -W / 2 + 0.08, y0 + 0.355, -0.09);
    rb1(g, 0.134, 0.012, 0.054, 0.004, m.metal, -W / 2 + 0.08, y0 + 0.426, -0.09);
    fan(g, 0.12, -W / 2 + 0.08, y0 + 0.355, -0.035, 0, glow);
    // GPU (shroud + backplate + a thin white light bar on the edge facing the glass)
    rb1(g, 0.135, 0.05, 0.3, 0.006, LIB.mat({ c: '#151619', rough: 0.45, metal: 0.4 }), -W / 2 + 0.08, y0 + 0.21, -0.07);
    rb1(g, 0.13, 0.004, 0.3, 0.0015, m.metal, -W / 2 + 0.078, y0 + 0.237, -0.07);
    rb1(g, 0.002, 0.004, 0.16, 0.001, glow, -W / 2 + 0.148, y0 + 0.215, -0.07, { seg: 1, shadow: false });
    // PSU shroud
    rb1(g, W - 0.016, 0.13, D - 0.02, 0.003, steel, 0.002, y0 + 0.075, 0);
    for (let i = 0; i < 10; i++) rb1(g, 0.0008, 0.07, 0.01, 0.0003, m.hole, W / 2 - 0.006, y0 + 0.075, -0.12 + i * 0.016, { seg: 1, shadow: false });
    // fans: two front intakes, one rear exhaust
    fan(g, 0.12, 0, y0 + 0.235, D / 2 - 0.038, 0, glow);
    fan(g, 0.12, 0, y0 + 0.365, D / 2 - 0.038, 0, glow);
    fan(g, 0.12, -0.005, y0 + 0.38, -D / 2 + 0.022, 0, glow);
    // cables inside (24-pin + PCIe)
    LIB.tube(g, [[-W / 2 + 0.03, y0 + 0.3, 0.05], [-W / 2 + 0.05, y0 + 0.27, 0.07], [-W / 2 + 0.04, y0 + 0.17, 0.09]], 0.006, m.cable, { segs: 20, radial: 8 });
    LIB.tube(g, [[-W / 2 + 0.11, y0 + 0.236, 0.05], [-W / 2 + 0.13, y0 + 0.2, 0.09], [-W / 2 + 0.11, y0 + 0.15, 0.1]], 0.004, m.cable, { segs: 20, radial: 8 });
    // faint internal LED strip under the top
    rb1(g, 0.004, 0.003, 0.36, 0.001, LIB.mat({ c: '#fff', emissive: '#bcd2ff', emissiveIntensity: 0.6 }), W / 2 - 0.02, y0 + H - 0.016, -0.01, { seg: 1, shadow: false });
    // tempered glass with a printed black border and thumb screws
    const glass = LIB.mat({ c: '#0e1114', rough: 0.04, transparent: true, opacity: 0.2, physical: true, clearcoat: 1, clearcoatRough: 0.03, env: 1.4 });
    glass.depthWrite = false;
    const gm = rb1(g, 0.004, H - 0.01, D - 0.016, 0.0015, glass, W / 2 + 0.001, yc, -0.002, { seg: 1, shadow: false });
    gm.renderOrder = 3;
    const bd = m.gloss, gx = W / 2 + 0.0034;
    LIB.box(g, 0.0006, 0.012, D - 0.016, bd, gx, y0 + H - 0.011, -0.002); LIB.box(g, 0.0006, 0.012, D - 0.016, bd, gx, y0 + 0.011, -0.002);
    LIB.box(g, 0.0006, H - 0.01, 0.012, bd, gx, yc, D / 2 - 0.016); LIB.box(g, 0.0006, H - 0.01, 0.012, bd, gx, yc, -D / 2 + 0.012);
    [[y0 + 0.02, D / 2 - 0.02], [y0 + H - 0.02, D / 2 - 0.02], [y0 + 0.02, -D / 2 + 0.016], [y0 + H - 0.02, -D / 2 + 0.016]].forEach(p => LIB.cyl(g, 0.0055, 0.0055, 0.004, m.metal, gx + 0.002, p[0], p[1], { rz: PI / 2, seg: 16 }));
    g.userData.focus = { x: 0, y: 0.26, z: 0, r: 0.32 };
    return g;
  }

  // ======================================================================= DESK
  P.desk = function () {
    const m = M();
    const root = new THREE.Group(); root.name = 'desk';
    const W = 1.5, D = 0.7, H = 0.75, T = 0.028, top = H;
    // top: one edge-glued board region of the plank texture (no end joints), grain along the width
    woodBox(root, W, T, D, 0.009, 0, H - T / 2, 0, { ou: 0.607, ov: 0.875 }, { seg: 4 });
    // two panel sides, grain vertical
    [-1, 1].forEach(sd => woodBox(root, 0.025, H - T, 0.64, 0.005, sd * (W / 2 - 0.05), (H - T) / 2, -0.005, { swap: true, ou: 0.52, ov: 0.125 }));
    // modesty panel at the back
    woodBox(root, W - 0.125, 0.4, 0.018, 0.004, 0, H - T - 0.2, -0.29, { ou: 0.617, ov: -0.08 });
    // drawer on the right: housing, front with a black bar pull
    const dx = 0.42, dw = 0.44, dh = 0.095;
    woodBox(root, 0.016, dh, 0.6, 0.002, dx - dw / 2 - 0.01, H - T - dh / 2, -0.01, { swap: true, ou: 0.3 });
    woodBox(root, dw + 0.02, 0.012, 0.6, 0.002, dx, H - T - dh - 0.006, -0.01, { ou: 0.3, ov: 0.6 });
    LIB.box(root, dw - 0.01, dh - 0.01, 0.004, m.hole, dx, H - T - dh / 2, 0.318);
    woodBox(root, dw, dh - 0.006, 0.018, 0.003, dx, H - T - dh / 2 - 0.002, 0.333, { ou: 0.5, ov: -0.05 });
    rb(root, 0.13, 0.01, 0.012, 0.004, m.metal, dx, H - T - dh / 2 - 0.002, 0.355);
    [-0.055, 0.055].forEach(o => LIB.cyl(root, 0.004, 0.004, 0.014, m.metal, dx + o, H - T - dh / 2 - 0.002, 0.347, { rx: PI / 2, seg: 12 }));
    // cable grommet, back left
    const gx = -0.62, gz = -0.285;
    LIB.cyl(root, 0.031, 0.031, 0.003, m.plastic, gx, top + 0.0012, gz, { seg: 32 });
    LIB.cyl(root, 0.024, 0.024, 0.0012, m.hole, gx, top + 0.0024, gz, { seg: 32 });
    rb(root, 0.03, 0.0008, 0.008, 0.0003, m.plastic, gx, top + 0.0031, gz + 0.012, { seg: 1 }); // cap brush slot
    // under-desk cable tray-ish bundle from the grommet to the PC
    cable(root, [[gx, top - 0.01, gz], [gx + 0.02, 0.62, gz + 0.02], [gx + 0.11, 0.5, -0.2], [-0.48, 0.45, -0.24]], 0.006, m.cable);
    cable(root, [[gx + 0.01, top - 0.01, gz], [gx + 0.04, 0.6, gz], [gx + 0.15, 0.49, -0.22]], 0.004, m.cable);

    // ---- gaming setup
    const parts = [];
    deskMat(root, -0.14, top, 0.17);
    const mon = monitor(root, -0.08, top, -0.17, 0); parts.push(mon);
    const kb = keyboard(root, -0.07, top + 0.0027, 0.165, 0.015); parts.push(kb);
    mouse(root, 0.205, top + 0.0027, 0.175, -0.1);
    const hs = headset(root, -0.62, top, -0.045, 0.12); parts.push(hs);
    speaker(root, -0.5, top, -0.205, 0.32, false);
    speaker(root, 0.33, top, -0.215, -0.32, true);
    lamp(root, 0.5, top, -0.27, -0.25);
    const pc = pcTower(root, -0.46, 0, -0.02, 0); parts.push(pc);
    // cables on the desk to the grommet (sagging/lying)
    const ly = top + 0.0024;
    cable(root, [[-0.07, top + 0.012, 0.096], [-0.09, ly, 0.05], [-0.2, ly, -0.03], [-0.42, ly, -0.12], [-0.55, ly, -0.22], [gx + 0.01, top + 0.004, gz + 0.01], [gx, top - 0.02, gz]], 0.0022, m.cable);
    cable(root, [[-0.08, top + 0.07, -0.2], [-0.08, top + 0.02, -0.245], [-0.2, ly, -0.29], [-0.45, ly, -0.31], [gx + 0.02, top + 0.004, gz - 0.005], [gx + 0.01, top - 0.02, gz]], 0.0028, m.cable);
    cable(root, [[-0.5 - 0.02, top + 0.03, -0.205 - 0.06], [-0.53, ly, -0.3], [gx + 0.02, top + 0.004, gz + 0.004], [gx + 0.005, top - 0.02, gz]], 0.0018, m.cable);
    cable(root, [[0.33 - 0.02, top + 0.03, -0.215 - 0.065], [0.28, ly, -0.31], [0.0, ly, -0.322], [-0.35, ly, -0.33], [gx + 0.025, top + 0.004, gz - 0.01], [gx + 0.012, top - 0.02, gz]], 0.0018, m.cable);
    cable(root, [[0.5 + 0.02, top + 0.008, -0.27 - 0.06], [0.52, top + 0.002, -0.345], [0.53, top - 0.02, -0.356], [0.54, top - 0.15, -0.36], [0.5, top - 0.35, -0.36]], 0.0022, m.cable);
    cable(root, [[-0.62, top + 0.008, -0.045 - 0.05], [-0.625, ly, -0.17], [gx + 0.006, top + 0.004, gz + 0.02], [gx + 0.004, top - 0.02, gz]], 0.0017, m.cable); // headset stand USB hub lead

    root.userData.focus = { x: 0, y: 0.95, z: 0, r: 0.95 };
    root.userData.parts = parts;
    root.userData.slots = { controller: { x: -0.45, y: top + 0.0027, z: 0.18 }, books: { x: 0.585, y: top, z: 0.02 } };
    return root;
  };

  // ======================================================================= CONTROLLER
  P.controller = function () {
    const m = M();
    const g = new THREE.Group(); g.name = 'controller';
    const body = LIB.mat({ c: '#151617', rough: 0.66, bump: m.grain, bumpScale: 0.00015 });
    const face = LIB.mat({ c: '#101112', rough: 0.4, env: 0.55, physical: true, clearcoat: 0.25, clearcoatRough: 0.35 });
    // outline (top view), shape y = towards the bumpers (-z)
    const half = [[0, 0.036], [0.028, 0.038], [0.05, 0.04], [0.064, 0.033], [0.07, 0.016], [0.07, -0.003], [0.066, -0.025], [0.058, -0.043], [0.047, -0.052], [0.036, -0.046], [0.028, -0.031], [0.016, -0.02], [0, -0.018]];
    const pts = half.concat(half.slice(1, -1).reverse().map(p => [-p[0], p[1]]));
    const shape = smoothShape(pts, 180);
    const DEP = 0.016, BT = 0.0095, BS = 0.0085, yb = 0.03;
    const ytop = yb + DEP / 2 + BT;
    // body: one smooth signed-distance volume = rounded slab of the outline, smoothly united with two tapered
    // grip capsules that hang down towards the player; polygonised with surface nets
    const poly = shape.getPoints().map(v => new THREE.Vector2(v.x, -v.y)); // plan in (x, z)
    const cs = 0.0025, b0 = [-0.09, -0.004, -0.066], b1 = [0.09, 0.056, 0.07];
    const nxg = Math.ceil((b1[0] - b0[0]) / cs) + 1, nzg = Math.ceil((b1[2] - b0[2]) / cs) + 1, D2 = new Float32Array(nxg * nzg);
    for (let k = 0; k < nzg; k++) for (let i = 0; i < nxg; i++) D2[i + nxg * k] = sdPoly(poly, b0[0] + i * cs, b0[2] + k * cs) - BS;
    const hh = (ytop - yb), rr = 0.0105;
    const gA = [0.05, 0.029, 0.004], gB = [0.046, 0.0175, 0.043];
    const sdf = (x, y, z, gi, gk) => {
      const d2 = gi !== undefined ? D2[gi + nxg * gk] : sdPoly(poly, x, z) - BS;
      const wx = d2 + rr, wy = Math.abs(y - yb) - hh + rr;
      let d = Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - rr;
      const gx = Math.abs(x);
      d = smin(d, sdCapsule(gx, y, z, gA, gB, 0.0185, 0.0172, 1.08), 0.012);
      return d;
    };
    LIB.mesh(g, surfaceNets(sdf, b0, b1, cs), body, 0, 0, 0);
    // glossy face plate (its edge is the visible seam)
    const facePts = smoothShape(pts.map(p => [p[0] * 0.82, p[1] * 0.8 + 0.002]), 160);
    ext(g, facePts, 0.0006, face, 0, ytop + 0.0003, 0, { rx: -PI / 2, bevelT: 0.0006, bevelS: 0.0008, bevelSeg: 2 });
    const yf = ytop + 0.0015;
    // equator seam: a thin dark line around the widest outline
    const sp = shape.getPoints(); const seam = [];
    let area = 0; for (let i = 0; i < sp.length; i++) { const a = sp[i], b = sp[(i + 1) % sp.length]; area += a.x * b.y - b.x * a.y; }
    const sg = area > 0 ? 1 : -1;
    for (let i = 0; i < sp.length; i += 2) { const a = sp[(i - 1 + sp.length) % sp.length], b = sp[(i + 1) % sp.length]; let nx = (b.y - a.y) * sg, ny = -(b.x - a.x) * sg; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; seam.push([sp[i].x + nx * BS, yb - 0.002, -(sp[i].y + ny * BS)]); }
    LIB.tube(g, seam, 0.00055, LIB.mat({ c: '#050505', rough: 0.4 }), { closed: true, segs: 240, radial: 4, shadow: false });
    // thumbsticks
    const grip = LIB.canvasTex('pa_stickgrip', 256, 32, (c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); c.fillStyle = '#000'; for (let i = 0; i < w; i += 6) c.fillRect(i, 0, 3, h); }, false);
    const stickM = LIB.mat({ c: '#161617', rough: 0.75, bump: grip, bumpScale: 0.0005 });
    [[-0.038, -0.016], [0.022, 0.012]].forEach(s => {
      LIB.torus(g, 0.0125, 0.0018, m.gloss, s[0], yf - 0.0004, s[1], { rx: PI / 2, rs: 8, ts: 36 });
      LIB.cyl(g, 0.0112, 0.0112, 0.001, m.hole, s[0], yf - 0.0004, s[1], { seg: 28 });
      LIB.lathe(g, [[0.0068, 0], [0.0072, 0.003]], m.plastic2, s[0], yf, s[1], { seg: 24 });
      LIB.lathe(g, [[0, 0.0035], [0.0094, 0.0035], [0.0101, 0.0045], [0.0102, 0.0072], [0.0096, 0.0088], [0.0086, 0.0092], [0.0060, 0.0084], [0.0, 0.0080]], stickM, s[0], yf, s[1], { seg: 36 });
      LIB.torus(g, 0.0074, 0.0008, LIB.mat({ c: '#0f0f10', rough: 0.9 }), s[0], yf + 0.0088, s[1], { rx: PI / 2, rs: 6, ts: 32 });
    });
    // D-pad
    const dp = new THREE.Shape(); const a = 0.0039, b = 0.0112;
    dp.moveTo(-a, b); dp.lineTo(a, b); dp.lineTo(a, a); dp.lineTo(b, a); dp.lineTo(b, -a); dp.lineTo(a, -a); dp.lineTo(a, -b); dp.lineTo(-a, -b); dp.lineTo(-a, -a); dp.lineTo(-b, -a); dp.lineTo(-b, a); dp.lineTo(-a, a); dp.closePath();
    const dpx = -0.022, dpz = 0.012;
    LIB.cyl(g, 0.0145, 0.0145, 0.0008, m.hole, dpx, yf - 0.0002, dpz, { seg: 32 });
    ext(g, dp, 0.0022, m.plastic2, dpx, yf + 0.0015, dpz, { rx: -PI / 2, bevelT: 0.0007, bevelS: 0.0007, bevelSeg: 2 });
    // face buttons (diamond) with subtle coloured glyph rings
    const fbx = 0.04, fbz = -0.016, sp2 = 0.0115;
    [[0, sp2, '#5f9a6c'], [sp2, 0, '#a85656'], [-sp2, 0, '#5a76ad'], [0, -sp2, '#bba04d']].forEach(q => {
      LIB.cyl(g, 0.0055, 0.0055, 0.0008, m.hole, fbx + q[0], yf - 0.0002, fbz + q[1], { seg: 24 });
      LIB.lathe(g, [[0, 0], [0.0047, 0], [0.0047, 0.0026], [0.0038, 0.0039], [0, 0.0043]], m.gloss, fbx + q[0], yf, fbz + q[1], { seg: 28 });
      LIB.torus(g, 0.0022, 0.00045, LIB.mat({ c: q[2], rough: 0.4, emissive: q[2], emissiveIntensity: 0.12 }), fbx + q[0], yf + 0.0041, fbz + q[1], { rx: PI / 2, rs: 6, ts: 24, shadow: false }).scale.z = 0.4;
    });
    // centre: glowing home button, view/menu, share
    LIB.cyl(g, 0.0072, 0.0072, 0.0008, m.hole, 0, yf - 0.0002, -0.027, { seg: 32 });
    LIB.lathe(g, [[0, 0], [0.0062, 0], [0.0062, 0.0016], [0.0045, 0.0024], [0, 0.0026]], m.gloss, 0, yf, -0.027, { seg: 32 });
    LIB.torus(g, 0.0064, 0.0005, LIB.mat({ c: '#fff', emissive: '#e4ecff', emissiveIntensity: 1.1 }), 0, yf + 0.0008, -0.027, { rx: PI / 2, rs: 6, ts: 40, shadow: false });
    [-0.0125, 0.0125].forEach(o => rb(g, 0.0042, 0.002, 0.0042, 0.0012, m.gloss, o, yf + 0.0006, -0.011, { seg: 2 }));
    rb(g, 0.0055, 0.0018, 0.0032, 0.0009, m.gloss, 0, yf + 0.0006, -0.002, { seg: 2 });
    // bumpers and triggers on the back edge
    [-1, 1].forEach(sd => {
      // bumper: a band following the shoulder outline, proud of the body by ~1.5 mm
      const outer = [], inner = [];
      for (let i = 0; i < sp.length; i++) { const p = sp[i]; if (p.y < 0.018 || p.x * sd < 0.02 || p.x * sd > 0.071) continue;
        const a = sp[(i - 1 + sp.length) % sp.length], b = sp[(i + 1) % sp.length]; let nx = (b.y - a.y) * sg, ny = -(b.x - a.x) * sg; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        outer.push(new THREE.Vector2(p.x + nx * (BS + 0.0012), p.y + ny * (BS + 0.0012))); inner.push(new THREE.Vector2(p.x + nx * (BS - 0.006), p.y + ny * (BS - 0.006))); }
      if (sd < 0) { outer.reverse(); inner.reverse(); }
      const bs = new THREE.Shape(outer.concat(inner.reverse()));
      ext(g, bs, 0.005, m.plastic2, 0, yb + 0.0085, 0, { rx: -PI / 2, bevelT: 0.0018, bevelS: 0.0012, bevelSeg: 2 });
      // curved trigger paddle tucked under the bumper (side profile extruded across x)
      const tp = smoothShape([[0.043, 0.041], [0.051, 0.0405], [0.0555, 0.035], [0.0545, 0.026], [0.05, 0.0235], [0.0465, 0.029], [0.0435, 0.035]], 60);
      ext(g, tp, 0.013, m.soft, sd * 0.047, 0, 0, { ry: PI / 2 + sd * 0.2, bevelT: 0.002, bevelS: 0.0018, bevelSeg: 3 });
    });
    // USB-C port, centre back
    rb(g, 0.0098, 0.0036, 0.004, 0.0016, m.hole, 0, yb + 0.002, -0.0455, { seg: 2 });
    rb(g, 0.0062, 0.0008, 0.0042, 0.0003, m.steel, 0, yb + 0.002, -0.0455, { seg: 1 });
    // 3.5 mm jack at the front bottom
    LIB.cyl(g, 0.0019, 0.0019, 0.004, m.hole, 0, yb - 0.004, 0.016, { rx: PI / 2, seg: 12 });
    g.userData.focus = { x: 0, y: 0.03, z: 0, r: 0.12 };
    return g;
  };

  // ======================================================================= BOOKS
  function pageTex(T) {
    const lines = Math.max(4, Math.round(T / 0.0006));
    return LIB.canvasTex('pa_pages', 64, 256, (c, w, h) => { c.fillStyle = '#ece3cf'; c.fillRect(0, 0, w, h); const r = LIB.rnd(2); for (let y = 0; y < h; y += 4) { c.fillStyle = 'rgba(120,100,70,' + (0.12 + r() * 0.22) + ')'; c.fillRect(0, y, w, 1); } }, true, 1, lines / 64);
  }
  function pageBump(T) {
    const lines = Math.max(4, Math.round(T / 0.0006));
    return LIB.canvasTex('pa_pagesb', 64, 256, (c, w, h) => { c.fillStyle = '#909090'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { c.fillStyle = '#404040'; c.fillRect(0, y, w, 1); } }, false, 1, lines / 64);
  }
  // a book lying flat: thickness T along y (0..T), spine length L along x, cover width C along z; spine at +z
  function book(parent, o) {
    const m = M();
    const g = new THREE.Group(); parent.add(g);
    const L = o.L, C = o.C, T = o.T, pb = !!o.paperback;
    const ct = pb ? 0.0009 : 0.0026, oh = pb ? 0.0004 : 0.003, sp = pb ? 0.0012 : 0.003;
    const cm = LIB.mat({ c: o.col, rough: o.rough || (pb ? 0.6 : 0.42), bump: m.fine, bumpScale: 0.0002, physical: !pb, clearcoat: pb ? undefined : 0.25, clearcoatRough: 0.4 });
    rb(g, L, ct, C, ct * 0.45, cm, 0, ct / 2, 0, { seg: 2 });
    rb(g, L, ct, C, ct * 0.45, cm, 0, T - ct / 2, 0, { seg: 2 });
    rb(g, L, T, sp * 1.6, Math.min(T * 0.3, 0.004), cm, 0, T / 2, C / 2 - sp * 0.8, { seg: 3 });
    const pm = LIB.mat({ c: '#ffffff', map: pageTex(T), bump: pageBump(T), bumpScale: 0.00025, rough: 0.9 });
    rb(g, L - 2 * oh, T - 2 * ct + 0.0004, C - oh - sp, 0.0006, pm, 0, T / 2, (oh - sp) / 2, { seg: 1 });
    // spine label
    const ph = Math.max(48, Math.round(1024 * T / L));
    const tex = LIB.textTex('pa_spine_' + o.key, 1024, ph, o.col, (c, w, h) => {
      c.textBaseline = 'middle'; c.fillStyle = o.ink || '#efe8d8';
      if (o.bands) { c.fillStyle = o.band || '#c9a85a'; c.fillRect(0, h * 0.1, w, Math.max(2, h * 0.05)); c.fillRect(0, h * 0.85, w, Math.max(2, h * 0.05)); c.fillStyle = o.ink || '#efe8d8'; }
      const fam = o.serif ? 'Georgia, "DejaVu Serif", serif' : '"DejaVu Sans", Arial, sans-serif';
      const tf = sz => (o.serif ? '600 ' : 'bold ') + sz + 'px ' + fam, sf = sz => (o.serif ? 'italic ' : '') + Math.round(sz * 0.62) + 'px ' + fam;
      let sz = Math.round(h * (o.big || 0.42));
      const widths = () => { c.font = tf(sz); const tw = c.measureText(o.title).width; c.font = sf(sz); const sw = o.sub ? c.measureText(o.sub).width + w * 0.05 : 0; return tw + sw; };
      while (widths() > w * 0.88 && sz > 8) sz--;
      c.textAlign = 'left'; c.font = tf(sz); c.fillText(o.title, w * 0.06, h * 0.53);
      if (o.sub) { c.font = sf(sz); c.textAlign = 'right'; c.fillStyle = o.subInk || c.fillStyle; c.fillText(o.sub, w * 0.94, h * 0.53); }
      if (o.mark) { c.fillStyle = o.band || '#c9a85a'; c.fillRect(w * 0.9, h * 0.25, h * 0.5, h * 0.5); }
    });
    LIB.plane(g, L * 0.985, T * 0.86, LIB.mat({ c: '#ffffff', map: tex, rough: o.rough || 0.45 }), 0, T / 2, C / 2 + 0.0002);
    return g;
  }
  P.books = function () {
    const m = M();
    const root = new THREE.Group(); root.name = 'books';
    // --- flat stack on the left
    const stack = [
      { key: 'psych', title: 'PSYCHOLOGY', sub: '2e', L: 0.232, C: 0.188, T: 0.03, col: '#3f4c57', ink: '#e9e4d8', bands: true, band: '#b8c2c9' },
      { key: 'complit', title: 'COMPARATIVE POLITICS', sub: 'Concepts & Cases', L: 0.222, C: 0.175, T: 0.022, col: '#6d2730', ink: '#efe2cf', serif: true },
      { key: 'forest', title: 'FORESTS OF THE WORLD', L: 0.214, C: 0.168, T: 0.019, col: '#2f4a3a', ink: '#e7dfc4', bands: true, band: '#cdb77a' },
      { key: 'modlit', title: 'MODERN LITERATURE', sub: 'an anthology', L: 0.2, C: 0.142, T: 0.026, col: '#e9e5dc', ink: '#2a2a2a', subInk: '#7a2a2a', serif: true, rough: 0.6 },
    ];
    let yy = 0; const R = LIB.rnd(4);
    stack.forEach((s, i) => { const b = book(root, s); if (s.key === 'forest') b.userData.fadeAway = 0.34; b.position.set(-0.05 + (R() - 0.5) * 0.012, yy, (R() - 0.5) * 0.012 + 0.005); b.rotation.y = (R() - 0.5) * 0.12; yy += s.T; });
    // spiral notebook on top
    const nb = LIB.group(root, -0.055, yy, 0.0, 0.07); nb.userData.fadeAway = 0.22;
    rb(nb, 0.21, 0.0009, 0.148, 0.0004, LIB.mat({ c: '#8a8d90', rough: 0.85 }), 0, 0.00045, 0, { seg: 1 });
    const ruled = LIB.canvasTex('pa_ruled', 64, 256, (c, w, h) => { c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(90,90,90,0.25)'; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1); }, true, 1, 3);
    rb(nb, 0.206, 0.0062, 0.142, 0.0005, LIB.mat({ c: '#ffffff', map: ruled, rough: 0.9 }), 0.0, 0.004, 0.002, { seg: 1 });
    const cov = LIB.textTex('pa_nbcover', 512, 360, '#3b5772', (c, w, h) => { c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(w * 0.55, h * 0.18, w * 0.38, h * 0.22); c.fillStyle = '#334'; c.font = '28px "DejaVu Sans", sans-serif'; c.fillText('ECE 252', w * 0.58, h * 0.28); c.font = '20px "DejaVu Sans", sans-serif'; c.fillText('notes', w * 0.58, h * 0.36); c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 2; for (let i = 0; i < 30; i++) { c.beginPath(); c.moveTo(0, i * 14); c.lineTo(w, i * 14 - 40); c.stroke(); } });
    const cv = rb(nb, 0.21, 0.0008, 0.148, 0.0003, LIB.mat({ c: '#ffffff', map: cov, rough: 0.5 }), 0, 0.0074, 0, { seg: 1 });
    cov.repeat.set(1, 1);
    const coil = LIB.mat({ c: '#c8c9cc', rough: 0.3, metal: 1 });
    for (let i = 0; i < 26; i++) LIB.torus(nb, 0.0052, 0.00055, coil, -0.096 + i * 0.0077, 0.004, -0.0735, { ry: PI / 2, rs: 5, ts: 14 });
    // pencil on the notebook
    const pc = LIB.group(nb, 0.01, 0.0078 + 0.0035, 0.03, 0.25);
    LIB.cyl(pc, 0.0035, 0.0035, 0.15, LIB.mat({ c: '#d9a321', rough: 0.35 }), 0, 0, 0, { rz: PI / 2, seg: 6 });
    LIB.cyl(pc, 0.0036, 0.0036, 0.012, LIB.mat({ c: '#b9b6ad', rough: 0.3, metal: 0.9 }), -0.081, 0, 0, { rz: PI / 2, seg: 16 });
    LIB.cyl(pc, 0.0034, 0.0034, 0.009, LIB.mat({ c: '#d98d8a', rough: 0.85 }), -0.0915, 0, 0, { rz: PI / 2, seg: 16 });
    LIB.cyl(pc, 0.0011, 0.0035, 0.018, LIB.mat({ c: '#dcb98f', rough: 0.8 }), 0.084, 0, 0, { rz: PI / 2, seg: 12 });
    LIB.cyl(pc, 0.0001, 0.0011, 0.0045, LIB.mat({ c: '#2a2a2c', rough: 0.4, metal: 0.4 }), 0.0952, 0, 0, { rz: PI / 2, seg: 12 });
    // --- black metal L bookend at the right end, three books leaning on it
    const bm = LIB.mat({ c: '#151516', rough: 0.45, metal: 0.6 });
    const xp = 0.153, hp = 0.13;
    rb(root, 0.002, hp, 0.12, 0.0008, bm, xp + 0.001, hp / 2, -0.03, { seg: 1 });
    rb(root, 0.095, 0.0015, 0.12, 0.0006, bm, xp + 0.002 - 0.0475, 0.00075, -0.03, { seg: 1 });
    const lean = 0.075;
    const standing = [
      { key: 'calc', title: 'CALCULUS', sub: 'EARLY TRANSCENDENTALS', L: 0.262, C: 0.21, T: 0.038, col: '#22324f', ink: '#f0e8d4', subInk: '#d8b65c', bands: true, band: '#d8b65c', big: 0.5 },
      { key: 'ice', title: 'INTRO TO COMPUTER ENGINEERING', L: 0.242, C: 0.19, T: 0.027, col: '#8a6a2a', ink: '#191712', big: 0.38 },
      { key: 'perec', title: 'SPECIES OF SPACES', sub: 'GEORGES PEREC', L: 0.198, C: 0.128, T: 0.0095, col: '#ebe6db', ink: '#1d1d1d', subInk: '#555', serif: true, paperback: true, big: 0.55 },
    ];
    let xr = xp - hp * Math.tan(lean);
    standing.forEach((s, i) => {
      const piv = LIB.group(root, xr, 0.0015, 0.1 - s.C / 2); piv.rotation.z = -lean; if (s.key === 'ice') piv.userData.fadeAway = 0.46;
      const b = book(piv, s); b.rotation.z = -PI / 2; // stand it: thickness along +x
      b.position.set(-s.T, s.L / 2, 0);              // bottom-right corner at the pivot
      xr -= s.T / Math.cos(lean) + 0.0005;
    });
    root.userData.focus = { x: 0, y: 0.1, z: 0, r: 0.22 };
    return root;
  };

  // ======================================================================= MINI FRIDGE
  P.fridge = function () {
    const m = M();
    const g = new THREE.Group(); g.name = 'fridge';
    const W = 0.48, H = 0.85, D = 0.5, fy = 0.018;
    const side = LIB.mat({ c: '#17181a', rough: 0.68, bump: tex('rough.jpg', false, 1, 1), bumpScale: 0.00015 });
    const door = LIB.mat({ c: '#121315', rough: 0.3, physical: true, clearcoat: 0.5, clearcoatRough: 0.2, bump: m.fine, bumpScale: 0.00008 });
    const cabD = D - 0.05;
    rb(g, W, H - fy, cabD, 0.022, side, 0, fy + (H - fy) / 2, -D / 2 + cabD / 2, { seg: 4 });
    const zf = -D / 2 + cabD;                          // cabinet front plane
    // kick plate grille under the door
    const gr = LIB.canvasTex('pa_grille', 256, 32, (c, w, h) => { c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h); c.fillStyle = '#020202'; for (let x = 8; x < w - 8; x += 10) c.fillRect(x, 6, 5, h - 12); }, true);
    rb(g, W - 0.01, 0.045, 0.02, 0.005, LIB.mat({ c: '#ffffff', map: gr, rough: 0.7 }), 0, fy + 0.0255, zf + 0.004);
    // gasket and door
    const dy0 = fy + 0.05, dh = H - dy0 - 0.004, dyc = dy0 + dh / 2;
    rb(g, W - 0.012, dh - 0.004, 0.008, 0.004, LIB.mat({ c: '#2a2b2d', rough: 0.85 }), 0, dyc, zf + 0.003);
    rb(g, W - 0.038, dh, 0.042, 0.012, door, -0.013, dyc, zf + 0.007 + 0.021, { seg: 4 });
    // recessed vertical handle on the right: a dark pocket and a set-back edge strip
    rb(g, 0.014, dh - 0.12, 0.03, 0.004, LIB.mat({ c: '#050506', rough: 0.6 }), W / 2 - 0.031, dyc, zf + 0.022);
    rb(g, 0.018, dh, 0.03, 0.007, door, W / 2 - 0.013, dyc, zf + 0.007 + 0.015, { seg: 3 });
    // hinge caps (left)
    [dy0 - 0.008, dy0 + dh + 0.002].forEach(y => rb(g, 0.045, 0.01, 0.05, 0.003, m.plastic2, -W / 2 + 0.03, y, zf + 0.02));
    // brand-free badge plate
    rb(g, 0.07, 0.014, 0.002, 0.0008, LIB.mat({ c: '#a9abb0', rough: 0.3, metal: 1, bump: m.brushed, bumpScale: 0.0002 }), -0.013, dy0 + dh - 0.05, zf + 0.0502, { seg: 1 });
    // feet
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(q => { LIB.cyl(g, 0.017, 0.019, 0.008, m.rubber, q[0] * (W / 2 - 0.05), 0.004, q[1] * 0.17 - 0.02, { seg: 20 }); LIB.cyl(g, 0.006, 0.006, 0.012, m.steel, q[0] * (W / 2 - 0.05), 0.012, q[1] * 0.17 - 0.02, { seg: 12 }); });
    // rear condenser serpentine
    const zb = -D / 2 - 0.012, cp = [];
    for (let i = 0; i < 12; i++) { const y = 0.14 + i * 0.05; const l = i % 2 ? 0.17 : -0.17; cp.push([-l, y, zb], [l, y, zb], [l * 1.04, y + 0.025, zb]); }
    LIB.tube(g, cp, 0.003, m.cable, { segs: 400, radial: 6 });
    [-0.12, 0, 0.12].forEach(xv => LIB.box(g, 0.002, 0.6, 0.002, m.cable, xv, 0.43, zb - 0.0035));
    [[-0.18, 0.13], [0.18, 0.13], [-0.18, 0.72], [0.18, 0.72]].forEach(q => LIB.box(g, 0.012, 0.012, 0.012, m.cable, q[0], q[1], zb + 0.006));
    rb(g, 0.12, 0.09, 0.08, 0.01, m.cable, 0.12, 0.08, -D / 2 - 0.02); // compressor hump
    const zd = zf + 0.007 + 0.042 + 0.0008;             // door front surface
    // magnets and a sticky note
    const note = LIB.textTex('pa_sticky', 256, 256, '#f2dc6a', (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, 0, w, 24); c.fillStyle = '#2b3a8f'; c.font = 'italic 34px "DejaVu Serif", serif'; c.fillText('hw due thu!', 18, 82); c.font = 'italic 30px "DejaVu Serif", serif'; c.fillText('- milk', 26, 140); c.fillText('- oat bars', 26, 188); c.strokeStyle = '#2b3a8f'; c.lineWidth = 3; c.beginPath(); c.moveTo(18, 96); c.lineTo(200, 92); c.stroke(); });
    const nt = LIB.group(g, -0.07, 0.62, zd + 0.0006); nt.userData.fadeAway = 0.28; nt.rotation.set(-0.02, 0, 0.06);
    rb(nt, 0.076, 0.076, 0.0005, 0.0002, LIB.mat({ c: '#ffffff', map: note, rough: 0.8 }), 0, 0, 0, { seg: 1 });
    LIB.cyl(g, 0.012, 0.012, 0.006, LIB.mat({ c: '#b2423a', rough: 0.3, physical: true, clearcoat: 0.8 }), -0.07, 0.65, zd + 0.004, { rx: PI / 2, seg: 24 }).userData.fadeAway = 0.28;
    const pic = LIB.textTex('pa_photo', 256, 192, '#f4f2ee', (c, w, h) => { const gr2 = c.createLinearGradient(0, 12, 0, h - 40); gr2.addColorStop(0, '#6aa2d6'); gr2.addColorStop(1, '#f0c58a'); c.fillStyle = gr2; c.fillRect(12, 12, w - 24, h - 52); c.fillStyle = '#3c5a3a'; c.beginPath(); c.moveTo(12, h - 40); c.lineTo(80, 70); c.lineTo(140, h - 70); c.lineTo(190, 90); c.lineTo(w - 12, h - 40); c.fill(); });
    rb(g, 0.064, 0.048, 0.003, 0.001, LIB.mat({ c: '#ffffff', map: pic, rough: 0.35 }), 0.06, 0.53, zd + 0.0015, { rz: -0.08, seg: 1 }).userData.fadeAway = 0.18;
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.006 : 0.014, a = PI / 2 + i * PI / 5; i ? star.lineTo(r * Math.cos(a), r * Math.sin(a)) : star.moveTo(r * Math.cos(a), r * Math.sin(a)); } star.closePath();
    ext(g, star, 0.003, LIB.mat({ c: '#d7b13c', rough: 0.4 }), 0.1, 0.36, zd + 0.0025, { bevelT: 0.001, bevelS: 0.001, bevelSeg: 2, rz: 0.2 }).userData.fadeAway = 0.12;
    // on top: an insulated bottle and a box of snack bars
    const ty = H;
    LIB.lathe(g, [[0, 0], [0.033, 0], [0.036, 0.004], [0.036, 0.2], [0.03, 0.225], [0.022, 0.235], [0.022, 0.24]], LIB.mat({ c: '#7d8f7a', rough: 0.55, bump: m.fine, bumpScale: 0.0002 }), 0.12, ty, -0.06, { seg: 40 });
    LIB.lathe(g, [[0, 0.24], [0.026, 0.24], [0.027, 0.27], [0.024, 0.28], [0, 0.28]], LIB.mat({ c: '#1a1a1a', rough: 0.5 }), 0.12, ty, -0.06, { seg: 32 });
    LIB.torus(g, 0.014, 0.003, LIB.mat({ c: '#1a1a1a', rough: 0.5 }), 0.12, ty + 0.285, -0.06, { rs: 8, ts: 24 });
    const box = LIB.textTex('pa_snack', 512, 256, '#c2462f', (c, w, h) => { c.fillStyle = '#f3e3c3'; c.fillRect(0, h * 0.62, w, h * 0.38); c.fillStyle = '#fff'; c.font = 'bold 64px "DejaVu Sans", sans-serif'; c.fillText('OAT BARS', 26, 110); c.font = '28px "DejaVu Sans", sans-serif'; c.fillStyle = '#5a2a1a'; c.fillText('honey & almond  ·  12 bars', 26, 205); });
    rb(g, 0.19, 0.075, 0.115, 0.003, LIB.mat({ c: '#ffffff', map: box, rough: 0.55 }), -0.09, ty + 0.0375, 0.04, { ry: 0.12 });
    g.userData.focus = { x: 0, y: 0.5, z: 0, r: 0.55 };
    return g;
  };

  // ======================================================================= GAMING CHAIR
  P.chair = function () {
    const m = M();
    const g = new THREE.Group(); g.name = 'chair';
    const pu = LIB.mat({ c: '#161617', rough: 0.45, bump: LIB.noiseTex('pa_pu', 256, 128, 70, 1.2), bumpScale: 0.0006 });
    const carbon = LIB.mat({ c: '#2a2a2c', map: tex('carbon.jpg', true, 3, 6), normal: tex('carbon_nm.jpg', false, 3, 6), normalScale: 0.4, rough: 0.5 });
    const nylon = LIB.mat({ c: '#121213', rough: 0.5, bump: m.fine, bumpScale: 0.0003 });
    // five-star base with twin-wheel casters
    LIB.cyl(g, 0.04, 0.05, 0.06, nylon, 0, 0.11, 0, { seg: 24 });
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + 0.3, arm = LIB.group(g, 0, 0, 0, a);
      rb(arm, 0.05, 0.04, 0.3, 0.012, nylon, 0, 0.105, 0.17, { rx: 0.1 });
      rb(arm, 0.046, 0.012, 0.28, 0.005, nylon, 0, 0.087, 0.17, { rx: 0.1 });
      const cs = LIB.group(arm, 0, 0, 0.315, 0.6 * Math.sin(i * 2.1));
      LIB.cyl(cs, 0.008, 0.008, 0.02, m.steel, 0, 0.08, 0, { seg: 10 });
      rb(cs, 0.03, 0.034, 0.05, 0.01, m.plastic, 0, 0.062, -0.012);
      [-1, 1].forEach(sd => { LIB.cyl(cs, 0.03, 0.03, 0.016, LIB.mat({ c: '#151516', rough: 0.35 }), sd * 0.02, 0.03, -0.02, { rz: PI / 2, seg: 28 }); LIB.cyl(cs, 0.012, 0.012, 0.0175, m.plastic2, sd * 0.02, 0.03, -0.02, { rz: PI / 2, seg: 16 }); });
    }
    // gas lift: telescoping shroud + chrome piston
    LIB.cyl(g, 0.03, 0.033, 0.1, nylon, 0, 0.18, 0, { seg: 24 });
    LIB.cyl(g, 0.027, 0.03, 0.08, nylon, 0, 0.27, 0, { seg: 24 });
    LIB.cyl(g, 0.015, 0.015, 0.06, m.steel, 0, 0.335, 0, { seg: 20 });
    // tilt mechanism
    rb(g, 0.22, 0.045, 0.24, 0.008, LIB.mat({ c: '#1a1b1d', rough: 0.4, metal: 0.6 }), 0, 0.385, 0);
    LIB.tube(g, [[0.1, 0.39, 0.05], [0.2, 0.385, 0.08], [0.27, 0.38, 0.1]], 0.006, nylon, { segs: 12, radial: 8 });
    LIB.sph(g, 0.012, nylon, 0.275, 0.38, 0.1);
    // seat
    const seat = LIB.group(g, 0, 0.41, 0.02); seat.rotation.x = -0.035;
    rb(seat, 0.44, 0.035, 0.44, 0.012, nylon, 0, 0.018, 0);
    // one contoured cushion (signed-distance volume): soft slab + raised side bolsters, waterfall front
    { const sdRB = (x, y, z, bx, by, bz, r) => { const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; };
      const f = (x, y, z) => {
        let d = sdRB(x, y - 0.072, z, 0.25, 0.034, 0.245, 0.03);
        d = smin(d, sdCapsule(Math.abs(x), y, z, [0.205, 0.105, -0.2], [0.205, 0.098, 0.165], 0.038, 0.034, 1.0), 0.045);
        return d + 0.0012 * Math.sin(x * 60) * Math.sin(z * 47);
      };
      LIB.mesh(seat, surfaceNets(f, [-0.3, 0.02, -0.28], [0.3, 0.16, 0.28], 0.0105), pu, 0, 0, 0); }
    pf(seat, 0.25, 0.012, 0.38, 0.005, carbon, 0, 0.104, -0.01, { amp: 0.0006, bulge: 0.4, seed: 4, seg: 4 }); // carbon-weave insert
    // backrest (reclined slightly)
    const back = LIB.group(g, 0, 0.45, -0.21); back.rotation.x = -0.17;
    const half = [[0, 0.0], [0.19, 0.0], [0.235, 0.05], [0.215, 0.22], [0.24, 0.42], [0.268, 0.56], [0.272, 0.64], [0.228, 0.69], [0.168, 0.72], [0.16, 0.8], [0.125, 0.865], [0, 0.88]];
    const pts = half.concat(half.slice(1, -1).reverse().map(p => [-p[0], p[1]]));
    ext(back, smoothShape(pts, 130), 0.05, pu, 0, 0, -0.045, { bevelT: 0.018, bevelS: 0.016, bevelSeg: 4 });
    ext(back, smoothShape(pts.map(p => [p[0] * 0.97, p[1] * 0.985 + 0.006]), 110), 0.01, nylon, 0, 0, -0.105, { bevelT: 0.006, bevelS: 0.006, bevelSeg: 3 }); // rear plastic shell
    pf(back, 0.24, 0.05, 0.6, 0.022, carbon, 0, 0.36, 0.0, { amp: 0.002, bulge: 0.3, seed: 12, rx: PI / 2 });
    [-1, 1].forEach(sd => {
      pf(back, 0.105, 0.06, 0.6, 0.026, pu, sd * 0.175, 0.33, 0.012, { amp: 0.0015, bulge: 0.35, seed: 14 + sd, rx: PI / 2, ry: -sd * 0.38, order: 'YXZ' });
      pf(back, 0.12, 0.055, 0.17, 0.024, pu, sd * 0.215, 0.63, 0.004, { amp: 0.0015, bulge: 0.35, seed: 18 + sd, rx: PI / 2, ry: -sd * 0.48, order: 'YXZ' });
      rb(back, 0.03, 0.065, 0.02, 0.012, m.hole, sd * 0.1, 0.705, 0.0); // harness slots
      rb(back, 0.018, 0.11, 0.05, 0.006, LIB.mat({ c: '#1a1b1d', rough: 0.4, metal: 0.6 }), sd * 0.238, 0.0, -0.035); // recline brackets
    });
    pf(back, 0.25, 0.05, 0.13, 0.022, pu, 0, 0.79, 0.0, { amp: 0.002, bulge: 0.3, seed: 21, rx: PI / 2 });
    // lumbar pillow with its strap
    pf(back, 0.3, 0.085, 0.14, 0.05, pu, 0, 0.17, 0.065, { amp: 0.004, bulge: 0.55, seed: 23, rx: PI / 2 + 0.08, seg: 6 });
    // armrests
    [-1, 1].forEach(sd => {
      rb(g, 0.2, 0.025, 0.06, 0.008, LIB.mat({ c: '#1a1b1d', rough: 0.4, metal: 0.6 }), sd * 0.17, 0.4, -0.04);
      rb(g, 0.035, 0.24, 0.06, 0.01, nylon, sd * 0.285, 0.52, -0.04);
      rb(g, 0.042, 0.06, 0.07, 0.012, nylon, sd * 0.285, 0.47, -0.04);
      rb(g, 0.09, 0.028, 0.25, 0.012, LIB.mat({ c: '#141415', rough: 0.7, bump: m.grain, bumpScale: 0.0003 }), sd * 0.285, 0.652, -0.02);
    });
    g.userData.focus = { x: 0, y: 0.75, z: 0, r: 0.75 };
    return g;
  };
})();
