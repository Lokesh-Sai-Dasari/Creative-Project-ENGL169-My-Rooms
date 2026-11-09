/* Kitchen — props for the kitchen the bedroom's mini-fridge leads into.
   KIT.counter()  black-granite L counter with shaker base cabinets, navy tile backsplash, undermount sink + faucet (ROOM coords)
   KIT.stove()    tabletop two-burner gas stove with animated blue flames (origin bottom centre, front +z)
   KIT.hood()     stainless chimney hood with baffle grate (wall item: origin on the wall at floor level)
   KIT.fridge()   big white top-freezer fridge covered in magnets; the freezer opens (origin bottom centre, front +z)
   Moving parts expose setters taking v in 0..1 so the page can animate them. Metres, y up. */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const KIT = window.KIT = {};

  // ---------------------------------------------------------------- helpers
  function tex(name, srgb, rx, ry) {
    const t = LIB.loadTex(name, srgb, rx, ry);
    if (!t.image) { const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; }; img.src = 'assets/tex/' + name; }
    return t;
  }
  // smooth vertex normals across coincident vertices; faces meeting at more than `crease` radians keep a hard edge
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
  function rb(parent, w, h, d, r, mat, x, y, z, o) { return LIB.rbox(parent, w, h, d, r, mat, x, y, z, Object.assign({ seg: 2 }, o || {})); }
  function rb1(parent, w, h, d, r, mat, x, y, z, o) { return LIB.rbox(parent, w, h, d, r, mat, x, y, z, Object.assign({ seg: 1 }, o || {})); }
  function ext(parent, shape, depth, mat, x, y, z, o) { const m = LIB.extrude(parent, shape, depth, mat, x, y, z, o); smooth(m.geometry, o && o.crease); return m; }
  function polyShape(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); return s; }
  function smoothShape(pts, n) {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)), true, 'centripetal');
    const sp = c.getSpacedPoints(n || 80); sp.pop();
    return new THREE.Shape(sp.map(v => new THREE.Vector2(v.x, v.y)));
  }
  function rrPath(path, cx, cy, w, h, r) { const x = cx - w / 2, y = cy - h / 2; path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r); path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h); path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r); path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path; }
  // planar uv over the geometry's xy bounding box (0..1); returns the box so canvas drawings can match it
  function planarUV(geo) {
    geo.computeBoundingBox(); const b = geo.boundingBox, dx = b.max.x - b.min.x, dy = b.max.y - b.min.y, p = geo.attributes.position, a = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { a[i * 2] = (p.getX(i) - b.min.x) / dx; a[i * 2 + 1] = (p.getY(i) - b.min.y) / dy; }
    geo.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return b;
  }
  // closed loft: rows = [[ [x,y,z] x T ], ...]; duplicates the seam column and welds its normals
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
  // rounded-rectangle ring of 4*nc points in the xz plane (centre cx,cz; half sizes hx,hz; corner radius r) at height y
  function rrRing(cx, cz, hx, hz, r, y, nc) {
    r = Math.max(0.0005, Math.min(r, hx, hz)); const out = [], C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) for (let i = 0; i < nc; i++) { const a = (k + i / (nc - 1)) * PI / 2; out.push([cx + C[k][0] * (hx - r) + r * Math.cos(a), y, cz + C[k][1] * (hz - r) + r * Math.sin(a)]); }
    return out;
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- shared materials
  let MS = null;
  function K() {
    if (MS) return MS;
    const streaks = (key, vertical) => LIB.canvasTex(key, 512, 512, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(vertical ? 5 : 3);
      for (let i = 0; i < 2600; i++) { const a = r() * w, b0 = r() * h; g.strokeStyle = (r() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (0.03 + r() * 0.1) + ')'; g.lineWidth = 0.4 + r() * 0.9; g.beginPath(); const L = 120 + r() * 300; if (vertical) { g.moveTo(a, b0 - L); g.lineTo(a, b0 + L); } else { g.moveTo(b0 - L, a); g.lineTo(b0 + L, a); } g.stroke(); }
    }, false);
    const brushedH = streaks('k_brushH', false), brushedV = streaks('k_brushV', true);
    const fine = LIB.noiseTex('k_fine', 256, 128, 60, 0.8);
    const steelM = (bm, c, rough) => LIB.mat({ c: c || '#c2c5c9', rough: rough || 0.34, metal: 1, bump: bm, bumpScale: 0.00018, roughMap: bm });
    MS = {
      brushedH, brushedV, fine,
      steel: steelM(brushedH), steelV: steelM(brushedV),
      steelDark: steelM(brushedH, '#8d9095', 0.4),
      chrome: LIB.mat({ c: '#eceef0', rough: 0.06, metal: 1 }),
      satin: LIB.mat({ c: '#d4d6d8', rough: 0.22, metal: 1 }),
      paint: LIB.mat({ c: '#e9e7e1', rough: 0.4, bump: fine, bumpScale: 0.00005 }),
      carcass: LIB.mat({ c: '#f1efea', rough: 0.55 }),
      drawerSide: LIB.mat({ c: '#c9cbcd', rough: 0.38, metal: 0.4 }),
      kick: LIB.mat({ c: '#1c1c1e', rough: 0.65 }),
      black: LIB.mat({ c: '#121214', rough: 0.45 }),
      rubber: LIB.mat({ c: '#151515', rough: 0.9 }),
      whitePl: LIB.mat({ c: '#f2f2ef', rough: 0.35 }),
      greyPl: LIB.mat({ c: '#8e9296', rough: 0.45 }),
      ceramic: LIB.mat({ c: '#f4f2ec', rough: 0.12, physical: true, clearcoat: 0.6, clearcoatRough: 0.08 }),
    };
    return MS;
  }

  // shaker front (rails & stiles modelled), centred at x,y with its front face at z
  function shaker(parent, w, h, x, y, z, mat) {
    const T = 0.02, s = Math.min(0.064, h * 0.24, w * 0.2), g = LIB.group(parent, x, y, z);
    rb1(g, s, h, T, 0.0025, mat, -w / 2 + s / 2, 0, -T / 2);
    rb1(g, s, h, T, 0.0025, mat, w / 2 - s / 2, 0, -T / 2);
    rb1(g, w - 2 * s, s, T, 0.0025, mat, 0, h / 2 - s / 2, -T / 2);
    rb1(g, w - 2 * s, s, T, 0.0025, mat, 0, -h / 2 + s / 2, -T / 2);
    rb1(g, w - 2 * s + 0.004, h - 2 * s + 0.004, 0.01, 0.001, panelMat(mat, w - 2 * s, h - 2 * s), 0, 0, -0.0145);
    return g;
  }
  // recessed shaker panel: same paint with a soft occlusion gradient into the frame corners
  const PM = new Map();
  function panelMat(mat, w, h) {
    const kx = Math.round(w * 40), ky = Math.round(h * 40), key = mat.uuid + kx + '_' + ky;
    if (PM.has(key)) return PM.get(key);
    const ao = LIB.canvasTex('k_ao_' + kx + '_' + ky, 128, 128, (c, W, H) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      const ex = Math.min(0.5, 0.012 / w) * W, ey = Math.min(0.5, 0.012 / h) * H;
      const L = c.createLinearGradient(0, 0, ex, 0); L.addColorStop(0, 'rgba(70,64,58,0.5)'); L.addColorStop(1, 'rgba(70,64,58,0)'); c.fillStyle = L; c.fillRect(0, 0, ex, H);
      const R = c.createLinearGradient(W, 0, W - ex, 0); R.addColorStop(0, 'rgba(70,64,58,0.45)'); R.addColorStop(1, 'rgba(70,64,58,0)'); c.fillStyle = R; c.fillRect(W - ex, 0, ex, H);
      const T2 = c.createLinearGradient(0, 0, 0, ey); T2.addColorStop(0, 'rgba(70,64,58,0.6)'); T2.addColorStop(1, 'rgba(70,64,58,0)'); c.fillStyle = T2; c.fillRect(0, 0, W, ey);
      const B = c.createLinearGradient(0, H, 0, H - ey); B.addColorStop(0, 'rgba(70,64,58,0.35)'); B.addColorStop(1, 'rgba(70,64,58,0)'); c.fillStyle = B; c.fillRect(0, H - ey, W, ey);
    }, true);
    const pm = mat.clone(); pm.map = ao; pm.needsUpdate = true; PM.set(key, pm); return pm;
  }
  function barPull(parent, len, x, y, z, vertical, mat) {
    const g = LIB.group(parent, x, y, z); if (!vertical) g.rotation.z = PI / 2;
    LIB.cyl(g, 0.006, 0.006, len, mat, 0, 0, 0.032, { seg: 16 });
    [-1, 1].forEach(sd => { LIB.sph(g, 0.006, mat, 0, sd * len / 2, 0.032, { ws: 10, hs: 6 }); LIB.cyl(g, 0.0042, 0.0052, 0.03, mat, 0, sd * (len / 2 - 0.018), 0.016, { rx: PI / 2, seg: 12 }); LIB.cyl(g, 0.007, 0.007, 0.002, mat, 0, sd * (len / 2 - 0.018), 0.001, { rx: PI / 2, seg: 14 }); });
    return g;
  }
  function platePts(R) { return [[0, 0.0], [R * 0.55, 0.0], [R * 0.57, 0.004], [R * 0.6, 0.006], [R * 0.95, 0.017], [R, 0.022], [R * 0.985, 0.024], [R * 0.93, 0.02], [R * 0.6, 0.011], [0, 0.009]]; }
  function pot(parent, r, h, x, y, z, m, lid) {
    const g = LIB.group(parent, x, y, z);
    LIB.lathe(g, [[0, 0.002], [r - 0.01, 0], [r, 0.008], [r, h], [r + 0.004, h + 0.003], [r - 0.003, h + 0.002], [r - 0.006, h - 0.004], [r - 0.006, 0.01], [0, 0.008]], m.steel, 0, 0, 0, { seg: 36 });
    [-1, 1].forEach(sd => LIB.torus(g, 0.022, 0.0045, m.steel, sd * (r + 0.012), h - 0.025, 0, { rx: PI / 2, rs: 8, ts: 16, arc: PI, rz: sd > 0 ? -PI / 2 : PI / 2 }));
    if (lid) { LIB.lathe(g, [[0, h + 0.03], [r * 0.5, h + 0.026], [r * 0.9, h + 0.012], [r + 0.004, h + 0.004], [r + 0.003, h + 0.002], [0, h + 0.002]], m.steel, 0, 0, 0, { seg: 36 }); LIB.cyl(g, 0.012, 0.016, 0.018, m.black, 0, h + 0.038, 0, { seg: 16 }); }
    return g;
  }

  // ======================================================================= COUNTER (room coordinates)
  KIT.counter = function () {
    const m = K();
    const root = new THREE.Group(); root.name = 'counter';
    const TOP = 0.92, TT = 0.03, CT = TOP - TT, KICK = 0.10, FZ = 0.62, CZ = 0.60;
    const Y0 = KICK + 0.003, Y1 = CT - 0.003;
    const movers = [];
    // run frames: local x along the run, local z out of the wall (wall at 0, door faces at FZ)
    const north = LIB.group(root, 0, 0, -2.0);
    const east = LIB.group(root, 2.2, 0, 0, -PI / 2);   // local x = room z, local z = 2.2 - room x
    north.name = 'N'; east.name = 'E';

    // ---------- carcasses
    function carcass(run, u0, u1, o) {
      o = o || {}; const w = u1 - u0, uc = (u0 + u1) / 2, ih = CT - KICK, d = CZ - 0.01;
      rb1(run, w, 0.018, d, 0.001, m.carcass, uc, KICK + 0.009, 0.01 + d / 2);
      rb1(run, w, ih, 0.012, 0.001, m.carcass, uc, KICK + ih / 2, 0.016);
      if (o.top !== false) rb1(run, w, 0.018, d, 0.001, m.carcass, uc, CT - 0.009, 0.01 + d / 2);
      else { rb1(run, w, 0.06, 0.02, 0.001, m.carcass, uc, CT - 0.03, CZ - 0.012); rb1(run, w, 0.018, 0.09, 0.001, m.carcass, uc, CT - 0.009, 0.06); }
      if (o.shelf) rb1(run, w - 0.02, 0.018, d - 0.06, 0.002, m.carcass, uc, o.shelf, 0.03 + (d - 0.06) / 2);
    }
    function sides(run, us) { us.forEach(u => rb1(run, 0.018, CT - KICK, CZ - 0.01, 0.001, m.carcass, u, KICK + (CT - KICK) / 2, 0.01 + (CZ - 0.01) / 2)); }
    // ---------- doors and drawers
    function door(run, u0, u1, y0, y1, hinge, fill) {
      const w = u1 - u0 - 0.003, h = y1 - y0, sx = hinge === 'L' ? 1 : -1;
      const piv = LIB.group(run, hinge === 'L' ? u0 + 0.0015 : u1 - 0.0015, 0, CZ);
      shaker(piv, w, h, sx * w / 2, y0 + h / 2, FZ - CZ, m.paint);
      barPull(piv, 0.16, sx * (w - 0.04), y1 - Math.min(0.14, h * 0.3), FZ - CZ, true, m.steel);
      // concealed hinge cups on the back
      [y0 + 0.1, y1 - 0.1].forEach(y => { LIB.cyl(piv, 0.0175, 0.0175, 0.004, m.drawerSide, sx * 0.024, y, -0.002, { rx: PI / 2, seg: 18 }); rb1(piv, 0.05, 0.016, 0.012, 0.002, m.drawerSide, sx * 0.03, y, -0.009); });
      if (fill) fill(piv);
      movers.push({ kind: 'door', run: run.name || '', u0: u0, u1: u1, swing: w, set: v => { piv.rotation.y = -sx * v * 100 * D2R; } });
      return piv;
    }
    function drawer(run, u0, u1, y0, y1, fill) {
      const w = u1 - u0 - 0.003, h = y1 - y0, g = LIB.group(run, (u0 + u1) / 2, 0, 0);
      shaker(g, w, h, 0, (y0 + y1) / 2, FZ, m.paint);
      barPull(g, Math.min(0.30, w * 0.5), 0, (y0 + y1) / 2, FZ, false, m.steel);
      const bw = (u1 - u0) - 0.044, bd = 0.5, bh = Math.max(0.075, Math.min(0.22, h - 0.07)), by0 = y0 + 0.022, zb = CZ - 0.012 - bd;
      [-1, 1].forEach(sd => rb1(g, 0.014, bh, bd, 0.003, m.drawerSide, sd * (bw / 2 - 0.007), by0 + bh / 2, zb + bd / 2));
      rb1(g, bw - 0.026, 0.012, bd - 0.004, 0.001, m.carcass, 0, by0 + 0.006, zb + bd / 2);
      rb1(g, bw - 0.026, bh * 0.85, 0.012, 0.001, m.carcass, 0, by0 + bh * 0.425, zb + 0.006);
      rb1(g, bw - 0.026, bh, 0.012, 0.001, m.drawerSide, 0, by0 + bh / 2, CZ - 0.008);
      if (fill) fill(g, bw - 0.03, by0 + 0.012, zb + bd / 2, bd - 0.03);
      movers.push({ kind: 'drawer', run: run.name || '', u0: u0, u1: u1, set: v => { g.position.z = 0.42 * v; } });
      return g;
    }
    const DR1 = Y1 - 0.17, DR2 = DR1 - 0.003 - 0.30;

    // ---------- contents
    const cutlery = (g, w, y, zc, d) => {
      const tray = LIB.mat({ c: '#d9dbdc', rough: 0.5 }); const tw = Math.min(w, 0.42), td = Math.min(d, 0.44);
      rb1(g, tw, 0.006, td, 0.002, tray, 0, y + 0.003, zc);
      const cols = [-0.42, -0.18, 0.06, 0.3, 0.5].map(f => f * tw);
      [-0.5, -0.3, -0.06, 0.18, 0.4].forEach(f => rb1(g, 0.004, 0.045, td, 0.0015, tray, f * tw + (f > 0 ? 0 : 0), y + 0.0255, zc));
      [-0.5, 0.5].forEach(f => rb1(g, tw, 0.045, 0.004, 0.0015, tray, 0, y + 0.0255, zc + f * td));
      rb1(g, 0.004, 0.045, td, 0.0015, tray, tw / 2, y + 0.0255, zc);
      const r = LIB.rnd(4);
      for (let i = 0; i < 4; i++) { // forks
        const x = -0.4 * tw + i * 0.012 - 0.018, yy = y + 0.008 + i * 0.002;
        rb1(g, 0.012, 0.003, 0.12, 0.0012, m.satin, x, yy, zc + 0.03); rb1(g, 0.022, 0.003, 0.055, 0.001, m.satin, x, yy, zc - 0.06);
      }
      for (let i = 0; i < 4; i++) { // spoons
        const x = -0.06 * tw + i * 0.011 - 0.015, yy = y + 0.008 + i * 0.002;
        rb1(g, 0.011, 0.003, 0.12, 0.0012, m.satin, x, yy, zc + 0.03); const s = LIB.sph(g, 0.02, m.satin, x, yy + 0.003, zc - 0.065, { ws: 16, hs: 8 }); s.scale.set(0.95, 0.22, 1.45);
      }
      for (let i = 0; i < 3; i++) { // knives
        const x = 0.18 * tw + i * 0.016 + 0.005, yy = y + 0.008 + i * 0.002;
        rb1(g, 0.014, 0.012, 0.1, 0.004, m.black, x, yy + 0.003, zc + 0.06); rb1(g, 0.018, 0.0025, 0.12, 0.001, m.satin, x + 0.002, yy, zc - 0.05);
      }
      for (let i = 0; i < 2; i++) { const x = 0.44 * tw, yy = y + 0.01 + i * 0.012; rb1(g, 0.03, 0.01, 0.2, 0.004, LIB.mat({ c: ['#8a5a32', '#2b2b2b'][i], rough: 0.6 }), x, yy, zc + r() * 0.02); }
    };
    const bowlsDrawer = (g, w, y, zc, d) => {
      const bowl = LIB.mat({ c: '#e7e3da', rough: 0.15, physical: true, clearcoat: 0.6 });
      [-0.11, 0.11].forEach((x, k) => { for (let i = 0; i < 4; i++) LIB.lathe(g, [[0, 0], [0.04, 0], [0.042, 0.006], [0.07, 0.03], [0.08, 0.055], [0.077, 0.056], [0.066, 0.031], [0.035, 0.008], [0, 0.007]], bowl, x, y + i * 0.012, zc + 0.08 - k * 0.04, { seg: 24 }); });
      const box = LIB.mat({ c: '#ffffff', rough: 0.2, physical: true, transparent: true, opacity: 0.55 });
      rb(g, 0.16, 0.08, 0.12, 0.01, box, -0.08, y + 0.04, zc - 0.13); rb(g, 0.162, 0.012, 0.122, 0.005, LIB.mat({ c: '#3f6db0', rough: 0.4 }), -0.08, y + 0.086, zc - 0.13);
      rb(g, 0.12, 0.06, 0.12, 0.01, box, 0.1, y + 0.03, zc - 0.13); rb(g, 0.122, 0.012, 0.122, 0.005, LIB.mat({ c: '#3f6db0', rough: 0.4 }), 0.1, y + 0.066, zc - 0.13);
    };
    const potsDrawer = (g, w, y, zc, d) => { pot(g, 0.1, 0.12, -0.1, y, zc + 0.06, m, true); pot(g, 0.085, 0.1, 0.12, y, zc - 0.1, m, false); pot(g, 0.07, 0.08, 0.12, y + 0.0, zc + 0.12, m, true); };
    const towelDrawer = (g, w, y, zc, d) => {
      [['#c8473d', 0], ['#e9e3d4', 0.012], ['#3b5f8a', 0.024]].forEach((c, i) => LIB.puffy(g, 0.15, 0.02, 0.24, 0.008, LIB.mat({ c: c[0], rough: 0.95, bump: LIB.weaveBump(), bumpScale: 0.002 }), -0.1 + i * 0.01, y + 0.012 + c[1], zc + 0.02, { seed: 3 + i, amp: 0.003, seg: 4, ry: (i - 1) * 0.05 }));
      LIB.puffy(g, 0.14, 0.02, 0.22, 0.008, LIB.mat({ c: '#d8b45c', rough: 0.95, bump: LIB.weaveBump(), bumpScale: 0.002 }), 0.1, y + 0.012, zc - 0.02, { seed: 9, amp: 0.003, seg: 4 });
      rb(g, 0.12, 0.03, 0.06, 0.004, LIB.mat({ c: '#d7d0c0', rough: 0.8 }), 0.1, y + 0.04, zc + 0.15); // roll of foil box
    };

    // ---------- north run (left to right): A doors | B 3 drawers | C doors (under the stove) | D drawer+door | E door | F blind corner | filler
    const N = north;
    sides(N, [-2.2 + 0.009, -1.30, -0.70, 0.0, 0.50, 1.02, 1.52]);
    carcass(N, -2.2, -1.30, { shelf: 0.49 }); carcass(N, -1.30, -0.70, {}); carcass(N, -0.70, 0.0, { shelf: 0.46 }); carcass(N, 0.0, 0.50, {}); carcass(N, 0.50, 1.02, { shelf: 0.49 });
    rb1(N, 0.68, CT - KICK, 0.012, 0.001, m.carcass, 1.86, KICK + (CT - KICK) / 2, 0.016);
    door(N, -2.2, -1.75, Y0, Y1, 'L'); door(N, -1.75, -1.30, Y0, Y1, 'R');
    drawer(N, -1.30, -0.70, DR1, Y1, cutlery); drawer(N, -1.30, -0.70, DR2, DR1 - 0.003, bowlsDrawer); drawer(N, -1.30, -0.70, Y0, DR2 - 0.003, potsDrawer);
    door(N, -0.70, -0.35, Y0, Y1, 'L'); door(N, -0.35, 0.0, Y0, Y1, 'R');
    drawer(N, 0.0, 0.50, DR1, Y1, towelDrawer); door(N, 0.0, 0.50, Y0, DR1 - 0.003, 'L');
    door(N, 0.50, 1.02, Y0, Y1, 'L');
    shaker(N, 0.497, Y1 - Y0, 1.27, (Y0 + Y1) / 2, FZ, m.paint);           // blind corner panel
    rb1(N, 0.06, Y1 - Y0 + 0.003, 0.02, 0.002, m.paint, 1.55, (Y0 + Y1) / 2, FZ - 0.01); // corner filler
    // contents of the north door bays
    { // A: stacked dinner plates, side plates and glasses
      const pm = m.ceramic;
      for (let i = 0; i < 8; i++) LIB.lathe(N, platePts(0.13), pm, -1.95, KICK + 0.018 + i * 0.0125, 0.32, { seg: 28 });
      for (let i = 0; i < 6; i++) LIB.lathe(N, platePts(0.1), pm, -1.6, KICK + 0.018 + i * 0.0115, 0.33, { seg: 24 });
      const glass = LIB.mat({ c: '#ffffff', rough: 0.05, physical: true, transparent: true, opacity: 0.28, env: 1.5 });
      for (let i = 0; i < 5; i++) LIB.lathe(N, [[0, 0], [0.032, 0], [0.034, 0.004], [0.036, 0.12], [0.034, 0.12], [0.032, 0.006], [0, 0.006]], glass, -2.05 + i * 0.08, 0.499, 0.38 - (i % 2) * 0.09, { seg: 24 });
      for (let i = 0; i < 3; i++) { const mg = LIB.group(N, -1.6 + i * 0.1, 0.499, 0.33 - (i % 2) * 0.12, i * 0.8); LIB.lathe(mg, [[0, 0], [0.038, 0], [0.04, 0.006], [0.042, 0.095], [0.039, 0.095], [0.037, 0.008], [0, 0.007]], LIB.mat({ c: ['#2f4a7a', '#e6e2d8', '#b24a3a'][i], rough: 0.2, physical: true, clearcoat: 0.6 }), 0, 0, 0, { seg: 28 }); LIB.torus(mg, 0.025, 0.006, LIB.mat({ c: ['#2f4a7a', '#e6e2d8', '#b24a3a'][i], rough: 0.2 }), 0.05, 0.05, 0, { rs: 8, ts: 16, arc: PI, rz: -PI / 2 }); }
    }
    { // C (under the stove): frying pan and pots
      pot(N, 0.11, 0.13, -0.5, KICK + 0.018, 0.3, m, true);
      pot(N, 0.09, 0.09, -0.2, KICK + 0.018, 0.34, m, false);
      const pan = LIB.group(N, -0.35, 0.469, 0.3, 0.3);
      LIB.lathe(pan, [[0, 0.003], [0.1, 0], [0.125, 0.012], [0.135, 0.045], [0.13, 0.045], [0.12, 0.016], [0.1, 0.006], [0, 0.007]], LIB.mat({ c: '#1b1b1c', rough: 0.35 }), 0, 0, 0, { seg: 40 });
      rb(pan, 0.2, 0.016, 0.03, 0.007, m.black, 0.23, 0.04, 0, { rz: 0.15 });
    }
    { // D (under its drawer): cleaning bottles; E: mixing bowls and a colander
      const bot = (x, z, c, h) => { const g = LIB.group(N, x, KICK + 0.018, z); LIB.lathe(g, [[0, 0], [0.04, 0], [0.042, 0.01], [0.042, h], [0.03, h + 0.03], [0.014, h + 0.04], [0, h + 0.04]], LIB.mat({ c: c, rough: 0.3 }), 0, 0, 0, { seg: 24 }); LIB.cyl(g, 0.014, 0.014, 0.03, m.whitePl, 0, h + 0.05, 0, { seg: 16 }); };
      bot(0.12, 0.3, '#3d8fd1', 0.18); bot(0.24, 0.36, '#e5c440', 0.15); bot(0.36, 0.28, '#e7e7e7', 0.2);
      const mb = LIB.mat({ c: '#c7c9cc', rough: 0.25, metal: 1 });
      [0, 1, 2].forEach(i => LIB.lathe(N, [[0, 0], [0.05, 0], [0.11 - i * 0.015, 0.05], [0.14 - i * 0.02, 0.1 - i * 0.01], [0.137 - i * 0.02, 0.1 - i * 0.01], [0.107 - i * 0.015, 0.052], [0.048, 0.003], [0, 0.003]], mb, 0.76, KICK + 0.018 + i * 0.018, 0.32, { seg: 40 }));
      LIB.lathe(N, [[0, 0], [0.06, 0], [0.1, 0.05], [0.11, 0.08], [0.105, 0.08], [0.095, 0.052], [0.056, 0.004], [0, 0.004]], LIB.mat({ c: '#c94a3a', rough: 0.35 }), 0.76, 0.499, 0.3, { seg: 32 });
    }

    // ---------- east run: filler | G drawer+door | sink base (double doors) | filler | finished end panel
    const E = east;
    sides(E, [-1.38, -0.80, -0.04]);
    carcass(E, -1.38, -0.80, {}); carcass(E, -0.80, -0.04, { top: false });
    rb1(E, 0.06, Y1 - Y0 + 0.003, 0.02, 0.002, m.paint, -1.35, (Y0 + Y1) / 2, FZ - 0.01);
    drawer(E, -1.32, -0.80, DR1, Y1, cutlery); door(E, -1.32, -0.80, Y0, DR1 - 0.003, 'L');
    door(E, -0.80, -0.42, Y0, Y1, 'L'); door(E, -0.42, -0.04, Y0, Y1, 'R');
    rb1(E, 0.022, Y1 - Y0 + 0.003, 0.02, 0.002, m.paint, -0.029, (Y0 + Y1) / 2, FZ - 0.01);
    rb(E, 0.018, CT, FZ, 0.003, m.paint, -0.009, CT / 2, FZ / 2);            // finished end panel
    { // G door bay: chopping boards on edge, a stand mixer bowl
      rb(E, 0.3, 0.32, 0.02, 0.008, LIB.mat({ c: '#d9a76b', rough: 0.6 }), -1.06, KICK + 0.018 + 0.16, 0.15, { ry: PI / 2 + 0.05 });
      rb(E, 0.26, 0.28, 0.015, 0.008, LIB.mat({ c: '#ececec', rough: 0.5 }), -1.1, KICK + 0.018 + 0.14, 0.18, { ry: PI / 2 - 0.05 });
      pot(E, 0.09, 0.12, -1.0, KICK + 0.018, 0.4, m, true);
    }
    { // sink base: P-trap, bottles, a bin
      const pvc = LIB.mat({ c: '#e9e9e6', rough: 0.4 }); // local u = room z, local w = 2.2 - room x; drain at room x 1.91 -> w 0.29
      LIB.cyl(E, 0.019, 0.019, 0.13, m.chrome, -0.42, CT - 0.27, 0.29, { seg: 18 });
      LIB.tube(E, [[-0.42, CT - 0.33, 0.29], [-0.42, CT - 0.4, 0.29], [-0.42, CT - 0.45, 0.24], [-0.42, CT - 0.4, 0.19], [-0.42, CT - 0.36, 0.14], [-0.42, CT - 0.36, 0.0]], 0.02, pvc, { segs: 40, radial: 14 });
      [[-0.65, 0.42, '#2f8f5b', 0.2], [-0.56, 0.47, '#d9473c', 0.16], [-0.62, 0.3, '#f0f0f0', 0.22]].forEach(b => { const g = LIB.group(E, b[0], KICK + 0.018, b[1]); LIB.lathe(g, [[0, 0], [0.038, 0], [0.04, 0.01], [0.04, b[3]], [0.025, b[3] + 0.04], [0.012, b[3] + 0.05], [0, b[3] + 0.05]], LIB.mat({ c: b[2], rough: 0.3 }), 0, 0, 0, { seg: 24 }); LIB.cyl(g, 0.012, 0.012, 0.025, m.whitePl, 0, b[3] + 0.062, 0, { seg: 14 }); });
      const bin = LIB.group(E, -0.2, KICK + 0.018, 0.4); LIB.lathe(bin, [[0, 0], [0.11, 0], [0.12, 0.3], [0.125, 0.305], [0.118, 0.305], [0.108, 0.006], [0, 0.006]], LIB.mat({ c: '#c8cacc', rough: 0.4 }), 0, 0, 0, { seg: 32 });
      LIB.lathe(bin, [[0.118, 0.3], [0.13, 0.31], [0.11, 0.32], [0.08, 0.3], [0.04, 0.27]], LIB.mat({ c: '#2b2b2b', rough: 0.7, side: THREE.DoubleSide }), 0, 0, 0, { seg: 32 });
    }
    // toe kicks
    rb1(N, 3.866, KICK - 0.003, 0.016, 0.002, m.kick, -2.2 + 3.866 / 2, (KICK - 0.003) / 2, 0.542);
    rb1(E, 1.432, KICK - 0.003, 0.016, 0.002, m.kick, -1.45 + 1.432 / 2, (KICK - 0.003) / 2, 0.542);

    // ---------- worktop: one L slab of polished black granite with the sink cut out
    const granite = LIB.canvasTex('k_granite', 1024, 1024, (g, w, h) => {
      g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, w, h); const r = LIB.rnd(11);
      for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rad = 40 + r() * 140; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(34,34,36,0.35)' : 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      for (let i = 0; i < 30000; i++) { const x = r() * w, y = r() * h, s = r() < 0.85 ? 1 : 2, l = 14 + r() * 34 | 0; g.fillStyle = 'rgb(' + l + ',' + l + ',' + (l + 2) + ')'; g.fillRect(x, y, s, s); }
      for (let i = 0; i < 1400; i++) { const x = r() * w, y = r() * h, l = 80 + r() * 120 | 0; g.fillStyle = 'rgba(' + l + ',' + l + ',' + (l + 4) + ',' + (0.4 + r() * 0.6) + ')'; g.fillRect(x, y, 1 + (r() < 0.25 ? 1 : 0), 1); }
    }, true, 1 / 0.7, 1 / 0.7);
    const graniteR = LIB.canvasTex('k_graniteR', 512, 512, (g, w, h) => {
      g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, w, h); const r = LIB.rnd(12);
      for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad); const v = r() < 0.5 ? 205 : 120; gr.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.5)'); gr.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      g.globalAlpha = 0.25; for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgb(215,215,215)'; g.lineWidth = 2 + r() * 6; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.bezierCurveTo(x + 60, y + 30 * r(), x + 120, y - 30, x + 200 * r(), y + 40 * r()); g.stroke(); } g.globalAlpha = 1;
    }, false, 1 / 0.9, 1 / 0.9);
    const stone = LIB.mat({ c: '#ffffff', map: granite, roughMap: graniteR, rough: 0.24, physical: true, clearcoat: 0.3, clearcoatRough: 0.03, env: 0.75, bump: LIB.noiseTex('k_gbump', 256, 128, 40, 0.5), bumpScale: 0.00002 });
    {
      const bs = 0.005, bt = 0.005, s = polyShape([[-2.198 + bs, -1.998 + bs], [2.198 - bs, -1.998 + bs], [2.198 - bs, 0.02 - bs], [1.555 + bs, 0.02 - bs], [1.555 + bs, -1.355 - bs], [-2.198 + bs, -1.355 - bs]]);
      s.holes.push(rrPath(new THREE.Path(), 1.83, -0.42, 0.40 + 2 * bs, 0.54 + 2 * bs, 0.035 + bs));
      const top = ext(root, s, TT - 2 * bt, stone, 0, TOP - TT / 2, 0, { rx: PI / 2, bevelT: bt, bevelS: bs, bevelSeg: 4, curve: 12, crease: 0.7 });
      top.name = 'worktop';
    }

    // ---------- navy blue tile backsplash (0.55 m) behind the whole L
    const tileDraw = (kind) => (g, w, h) => {
      // canvas = 0.6 m x 0.3143 m -> 4 tiles x 4 rows of 150 x 78.6 mm subway tiles, running bond
      const r = LIB.rnd(21), tw = w / 4, th = h / 4, gr = 3;
      g.fillStyle = kind === 'col' ? '#9fa6b3' : kind === 'bump' ? '#000000' : '#e8e8e8'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) for (let c = -1; c < 5; c++) {
        const x = c * tw + (row % 2 ? tw / 2 : 0) + gr / 2, y = row * th + gr / 2, ww = tw - gr, hh = th - gr;
        if (kind === 'col') {
          const L = 17 + (r() - 0.5) * 4, S = 44 + (r() - 0.5) * 10, H = 223 + (r() - 0.5) * 6;
          g.fillStyle = 'hsl(' + H + ',' + S + '%,' + L + '%)'; g.fillRect(x, y, ww, hh);
          const gg = g.createLinearGradient(x, y, x + ww * 0.3, y + hh); gg.addColorStop(0, 'rgba(255,255,255,0.06)'); gg.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = gg; g.fillRect(x, y, ww, hh);
          g.strokeStyle = 'rgba(110,125,170,0.18)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, ww - 2, hh - 2); // glaze thinning on the edges
        } else if (kind === 'bump') {
          for (let k = 0; k < 6; k++) { const v = 110 + k * 22; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x + k, y + k, ww - 2 * k, hh - 2 * k); }
          g.globalAlpha = 0.25; for (let k = 0; k < 4; k++) { const cx = x + r() * ww, cy = y + r() * hh, rr = 20 + r() * 40; const q = g.createRadialGradient(cx, cy, 0, cx, cy, rr); q.addColorStop(0, '#ffffff'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); } g.globalAlpha = 1;
        } else { g.fillStyle = 'rgb(' + (52 + r() * 14 | 0) + ',0,0)'; g.fillStyle = 'rgb(58,58,58)'; g.fillRect(x, y, ww, hh); }
      }
    };
    const tileMat = (len) => LIB.mat({ c: '#ffffff', map: LIB.canvasTex('k_tile_col', 1024, 512, tileDraw('col'), true, len / 0.6, 1.75), bump: LIB.canvasTex('k_tile_bump', 1024, 512, tileDraw('bump'), false, len / 0.6, 1.75), bumpScale: 0.0012, roughMap: LIB.canvasTex('k_tile_rough', 1024, 512, tileDraw('rough'), false, len / 0.6, 1.75), rough: 1.0, physical: true, clearcoat: 0.25, clearcoatRough: 0.2, env: 0.7 });
    const BH = 0.55, trim = LIB.mat({ c: '#22335a', rough: 0.2, physical: true, clearcoat: 0.6 });
    LIB.box(root, 4.4, BH, 0.008, tileMat(4.4), 0, TOP + BH / 2, -2.0 + 0.004);
    LIB.box(root, 0.008, BH, 1.992, tileMat(1.992), 2.2 - 0.004, TOP + BH / 2, -0.996);
    rb1(root, 4.4, 0.012, 0.012, 0.005, trim, 0, TOP + BH + 0.006, -2.0 + 0.006);
    rb1(root, 0.012, 0.012, 1.992, 0.005, trim, 2.2 - 0.006, TOP + BH + 0.006, -0.996);
    rb1(root, 0.012, BH + 0.012, 0.012, 0.005, trim, 2.2 - 0.006, TOP + (BH + 0.012) / 2, -0.002);

    // ---------- the sink (child group so the page can select it)
    const sink = LIB.group(root, 0, 0, 0); sink.name = 'sink';
    const SX = 1.83, SZ = -0.42, HW = 0.20, HD = 0.27, DEPTH = 0.20, DDX = 0.08;
    const bowlMat = LIB.mat({ c: '#b8bbbf', rough: 0.3, metal: 1, bump: m.fine, bumpScale: 0.00004, side: THREE.DoubleSide, roughMap: m.brushedH });
    {
      const rows = [], NC = 7, R0 = 0.035, i0 = 0.006, rc = 0.032, dr = 0.045;
      rows.push(rrRing(0, 0, HW + 0.03, HD + 0.03, R0 + 0.03, 0.0, NC));
      rows.push(rrRing(0, 0, HW, HD, R0, 0.0, NC));
      rows.push(rrRing(0, 0, HW, HD, R0, -0.01, NC));
      for (let k = 0; k <= 5; k++) { const a = k / 5 * PI / 2, ins = i0 + rc * (1 - Math.cos(a)); rows.push(rrRing(0, 0, HW - ins, HD - ins, R0 - ins * 0.4, -DEPTH + rc * (1 - Math.sin(a)), NC)); }
      for (let k = 1; k <= 5; k++) { const f = k / 5, f2 = Math.pow(f, 0.8); rows.push(rrRing(DDX * f2, 0, lerp(HW - i0 - rc, dr, f2), lerp(HD - i0 - rc, dr, f2), lerp(R0 - (i0 + rc) * 0.4, dr, f2), -DEPTH - 0.005 * f, NC)); }
      rows.push(rrRing(DDX, 0, dr - 0.004, dr - 0.004, dr, -DEPTH - 0.03, NC));
      rows.push(rrRing(DDX, 0, 0.001, 0.001, 0.0008, -DEPTH - 0.03, NC));
      LIB.mesh(sink, loftClosed(rows), bowlMat, SX, CT, SZ);
      // outside of the bowl (seen inside the sink base): a slightly bigger shell, sound-deadening grey
      const outer = rows.slice(1, 9).map(r => r.map(p => [p[0] * 1.03, p[1] - 0.002, p[2] * 1.025]));
      LIB.mesh(sink, loftClosed(outer), LIB.mat({ c: '#6d6f70', rough: 0.85, side: THREE.DoubleSide }), SX, CT, SZ);
      // drain strainer
      const sy = CT - DEPTH - 0.005, holes = LIB.canvasTex('k_strainer', 256, 256, (g, w, h) => { g.fillStyle = '#d8dadc'; g.fillRect(0, 0, w, h); g.fillStyle = '#151515'; for (let rr = 30; rr < 110; rr += 16) { const n = Math.floor(rr * 0.45); for (let i = 0; i < n; i++) { const a = i / n * TAU + rr; g.beginPath(); g.arc(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr, 3.2, 0, TAU); g.fill(); } } }, true);
      LIB.lathe(sink, [[0.034, 0.0], [0.05, 0.0006], [0.052, 0.002], [0.05, 0.0035], [0.036, 0.003]], m.chrome, SX + DDX, sy, SZ, { seg: 40 });
      LIB.cyl(sink, 0.036, 0.036, 0.002, LIB.mat({ c: '#ffffff', map: holes, metal: 1, rough: 0.2 }), SX + DDX, sy - 0.002, SZ, { seg: 40 });
      LIB.lathe(sink, [[0, 0.012], [0.01, 0.011], [0.012, 0.004], [0.009, 0.0], [0, 0]], m.chrome, SX + DDX, sy - 0.002, SZ, { seg: 20 });
    }
    // faucet: tall chrome gooseneck with a side lever
    const FX = 2.11, FZb = SZ, FTOP = TOP + 0.26, TIPX = FX - 0.2, TIPY = FTOP + 0.035 - 0.065;
    {
      LIB.lathe(sink, [[0, 0], [0.03, 0], [0.031, 0.003], [0.026, 0.012], [0.019, 0.016], [0, 0.016]], m.chrome, FX, TOP, FZb, { seg: 36 });
      LIB.cyl(sink, 0.018, 0.018, 0.2, m.chrome, FX, TOP + 0.11, FZb, { seg: 28 });
      LIB.lathe(sink, [[0.018, 0], [0.018, 0.006], [0.0115, 0.03], [0, 0.03]], m.chrome, FX, TOP + 0.21, FZb, { seg: 28 });
      const pts = [[FX, TOP + 0.22, FZb], [FX, FTOP - 0.02, FZb]];
      for (let i = 0; i <= 12; i++) { const a = i / 12 * PI; pts.push([FX - 0.1 + 0.1 * Math.cos(a), FTOP + 0.1 * Math.sin(a) * 0.72 + 0.035 * Math.sin(a), FZb]); }
      pts.push([TIPX, FTOP - 0.03, FZb], [TIPX, TIPY + 0.012, FZb]);
      LIB.tube(sink, pts, 0.0112, m.chrome, { segs: 90, radial: 16 });
      LIB.cyl(sink, 0.013, 0.012, 0.024, m.chrome, TIPX, TIPY + 0.012, FZb, { seg: 20 });
      LIB.cyl(sink, 0.0095, 0.0095, 0.001, LIB.mat({ c: '#2a2a2a', rough: 0.6 }), TIPX, TIPY - 0.0003, FZb, { seg: 16 });
    }
    const lever = LIB.group(sink, FX, TOP + 0.15, FZb + 0.018);
    LIB.cyl(sink, 0.014, 0.014, 0.02, m.chrome, FX, TOP + 0.15, FZb + 0.018, { rx: PI / 2, seg: 20 });
    {
      const arm = LIB.group(lever, 0, 0, 0.012);
      LIB.cyl(arm, 0.0105, 0.0105, 0.012, m.chrome, 0, 0, 0, { rx: PI / 2, seg: 18 });
      LIB.lathe(arm, [[0.008, 0], [0.0055, 0.04], [0.0048, 0.085], [0.0058, 0.092], [0, 0.096]], m.chrome, 0, 0, 0.002, { seg: 14 });
      lever.rotation.z = -0.45;
    }
    // water: a wavy translucent column from the aerator into the drain, plus ripple rings
    const waterMat = LIB.mat({ c: '#cfe3ea', rough: 0.02, transparent: true, opacity: 0.3, physical: true, clearcoat: 1, clearcoatRough: 0.02, env: 1.8 });
    waterMat.depthWrite = false;
    const coreMat = LIB.mat({ c: '#ffffff', rough: 0.05, transparent: true, opacity: 0.35, env: 3 }); coreMat.depthWrite = false;
    const RS = 14, HS = 48, WTOP = TIPY - 0.001, WBOT = CT - DEPTH - 0.006, WLEN = WTOP - WBOT;
    const wGeo = new THREE.CylinderGeometry(1, 1, 1, RS, HS, true); wGeo.translate(0, -0.5, 0);
    const wBase = wGeo.attributes.position.array.slice();
    const water = LIB.mesh(sink, wGeo, waterMat, TIPX, WTOP, FZb, { shadow: false }); water.castShadow = false; water.renderOrder = 3;
    const cGeo = wGeo.clone(); const cBase = wBase;
    const core = LIB.mesh(sink, cGeo, coreMat, TIPX, WTOP, FZb, { shadow: false }); core.castShadow = false; core.renderOrder = 4;
    const rippleMat = LIB.mat({ c: '#f2fbff', rough: 0.05, transparent: true, opacity: 0.5, env: 2.5 }); rippleMat.depthWrite = false;
    const ripples = [0, 1, 2].map(i => { const t = LIB.torus(sink, 1, 0.12, rippleMat.clone(), TIPX, WBOT + 0.004, FZb, { rx: PI / 2, rs: 6, ts: 32, shadow: false }); t.castShadow = false; t.renderOrder = 5; return t; });
    const splash = LIB.lathe(sink, [[0.004, 0], [0.012, 0.004], [0.02, 0.012], [0.022, 0.016], [0.018, 0.01], [0.008, 0.002]], rippleMat, TIPX, WBOT + 0.001, FZb, { seg: 20, shadow: false }); splash.castShadow = false;
    let wV = 0, wT = 0;
    function updWater(t) {
      const on = wV > 0.001; water.visible = core.visible = splash.visible = on; ripples.forEach(r => r.visible = on && wV > 0.35);
      if (!on) return;
      const len = WLEN * Math.min(1, wV / 0.4), R = 0.0035 + 0.0035 * Math.min(1, wV * 1.5);
      waterMat.opacity = 0.14 + 0.2 * Math.min(1, wV * 1.6); coreMat.opacity = 0.06 + 0.14 * wV;
      [[wGeo, 1], [cGeo, 0.45]].forEach(([geo, k]) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const bx = wBase[i * 3], by = wBase[i * 3 + 1], bz = wBase[i * 3 + 2], s = -by; // 0 at the aerator, 1 at the drain
          const neck = 1 - 0.32 * Math.sqrt(s) + 0.12 * Math.pow(s, 4);
          const wob = 1 + 0.08 * Math.sin(s * 38 - t * 22 + bx * 2) * s;
          const rr = R * neck * wob * k, sw = 0.0016 * s * s;
          p.setXYZ(i, bx * rr + sw * Math.sin(t * 7.3 + s * 9), by * len, bz * rr * (1 + 0.15 * s) + sw * Math.cos(t * 5.1 + s * 11));
        }
        p.needsUpdate = true; geo.computeVertexNormals();
      });
      const reach = Math.min(1, wV / 0.4) >= 1;
      splash.visible = reach; splash.scale.setScalar(0.8 + 0.3 * Math.sin(t * 30) * 0.3 + wV * 0.3);
      ripples.forEach((r, i) => { const ph = ((t * 1.6 + i / 3) % 1); const rad = 0.012 + ph * 0.05 * (0.5 + wV); r.scale.set(rad, rad, 0.012 * (1 - ph) + 0.002); r.visible = reach; r.material.opacity = 0.55 * (1 - ph) * Math.min(1, wV * 1.5); });
    }
    root.userData.setWater = function (v) { wV = Math.max(0, Math.min(1, v)); lever.rotation.z = -0.45 + 0.75 * wV; updWater(wT); };
    root.userData.setWater(0);

    // ---------- small things on the worktop
    // electric kettle (north run, left of the stove)
    {
      const k = LIB.group(root, -0.98, TOP, -1.76, 0.6);
      LIB.lathe(k, [[0, 0], [0.088, 0], [0.093, 0.004], [0.092, 0.015], [0.082, 0.02], [0, 0.02]], m.black, 0, 0, 0, { seg: 40 });
      LIB.lathe(k, [[0, 0.02], [0.078, 0.02], [0.084, 0.026], [0.085, 0.034], [0.082, 0.12], [0.073, 0.185], [0.062, 0.207], [0.058, 0.212], [0.05, 0.212], [0, 0.214]], m.steelV, 0, 0, 0, { seg: 44 });
      LIB.lathe(k, [[0, 0.232], [0.03, 0.228], [0.052, 0.218], [0.06, 0.212], [0.055, 0.21], [0, 0.21]], m.black, 0, 0, 0, { seg: 36 });
      rb(k, 0.03, 0.012, 0.02, 0.005, m.black, 0, 0.236, 0);
      LIB.tube(k, [[-0.078, 0.06, 0], [-0.115, 0.08, 0], [-0.125, 0.15, 0], [-0.105, 0.205, 0], [-0.05, 0.218, 0]], 0.011, m.black, { segs: 40, radial: 10 });
      LIB.lathe(k, [[0.03, 0], [0.024, 0.02], [0.016, 0.045], [0.014, 0.05]], m.steelV, 0.07, 0.15, 0, { seg: 20, rz: -1.0 });
      rb1(k, 0.012, 0.09, 0.016, 0.005, LIB.mat({ c: '#2d3a40', rough: 0.05, physical: true, transparent: true, opacity: 0.7 }), -0.02, 0.09, 0.079, { ry: -0.25 });
      rb1(k, 0.02, 0.008, 0.01, 0.003, LIB.mat({ c: '#2a2a2a', rough: 0.4, emissive: '#ff5a2a', emissiveIntensity: 0.15 }), -0.06, 0.013, 0.072);
      LIB.tube(root, [[-1.00, TOP + 0.005, -1.86], [-1.02, TOP + 0.003, -1.94], [-1.08, TOP + 0.003, -1.975], [-1.14, TOP + 0.08, -1.985]], 0.0028, m.black, { segs: 30, radial: 6 });
    }
    // paper towel holder
    {
      const p = LIB.group(root, -1.30, TOP, -1.84);
      LIB.lathe(p, [[0, 0], [0.074, 0], [0.076, 0.004], [0.07, 0.01], [0.025, 0.014], [0, 0.014]], m.steel, 0, 0, 0, { seg: 40 });
      LIB.cyl(p, 0.006, 0.006, 0.32, m.chrome, 0, 0.17, 0, { seg: 12 });
      LIB.sph(p, 0.012, m.chrome, 0, 0.335, 0, { ws: 16, hs: 10 });
      const quilt = LIB.canvasTex('k_quilt', 256, 256, (g, w, h) => { g.fillStyle = '#909090'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4c4c4'; for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.beginPath(); g.arc(x + 16 + ((y / 32) % 2) * 16, y + 16, 9, 0, TAU); g.fill(); } }, false, 6, 4);
      const towel = LIB.mat({ c: '#f6f5f1', rough: 0.95, bump: quilt, bumpScale: 0.0015 });
      LIB.cyl(p, 0.058, 0.058, 0.27, towel, 0, 0.155, 0, { seg: 40, open: true });
      const ring = new THREE.RingGeometry(0.021, 0.058, 40, 1); ring.rotateX(-PI / 2);
      LIB.mesh(p, ring, LIB.mat({ c: '#efeee9', rough: 0.9, bump: LIB.canvasTex('k_rollend', 256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9a9a9a'; for (let r = 30; r < 128; r += 2.2) { g.beginPath(); g.arc(128, 128, r, 0, TAU); g.stroke(); } }, false), bumpScale: 0.0006 }), 0, 0.29, 0);
      LIB.cyl(p, 0.021, 0.021, 0.27, LIB.mat({ c: '#a57b4f', rough: 0.9, side: THREE.DoubleSide }), 0, 0.155, 0, { seg: 24, open: true });
      // a loose sheet hanging from the roll
      const sh = new THREE.PlaneGeometry(0.05, 0.268, 4, 6); sh.translate(0.025, 0, 0); const sp = sh.attributes.position; for (let i = 0; i < sp.count; i++) { const x = sp.getX(i); sp.setZ(i, 0.12 * x * x + 0.004 * Math.sin(sp.getY(i) * 40) * x * 20); } sh.computeVertexNormals();
      LIB.mesh(p, sh, LIB.mat({ c: '#f6f5f1', rough: 0.95, side: THREE.DoubleSide, bump: quilt, bumpScale: 0.001 }), 0.0, 0.155, 0.058, { ry: -0.5 });
    }
    // fruit bowl
    {
      const b = LIB.group(root, -1.72, TOP, -1.67);
      LIB.lathe(b, [[0, 0], [0.05, 0], [0.052, 0.012], [0.09, 0.03], [0.14, 0.085], [0.145, 0.095], [0.139, 0.096], [0.132, 0.088], [0.085, 0.04], [0, 0.026]], LIB.mat({ c: '#5e7f86', rough: 0.15, physical: true, clearcoat: 0.8 }), 0, 0, 0, { seg: 48 });
      const apple = (x, y, z, c, s) => { const g = LIB.group(b, x, y, z); LIB.lathe(g, [[0, 0.004], [0.022, 0.0], [0.034, 0.012], [0.038, 0.03], [0.034, 0.05], [0.02, 0.058], [0.004, 0.052], [0, 0.05]], LIB.mat({ c: c, rough: 0.35, physical: true, clearcoat: 0.4, bump: m.fine, bumpScale: 0.0001 }), 0, 0, 0, { seg: 28 }); LIB.cyl(g, 0.0018, 0.0014, 0.016, LIB.mat({ c: '#4a3420', rough: 0.8 }), 0.002, 0.058, 0, { rz: 0.3, seg: 6 }); g.rotation.set(s * 0.3, s, s * 0.2); return g; };
      apple(-0.04, 0.03, 0.02, '#b3241e', 1); apple(0.045, 0.03, -0.03, '#c8392a', 2); apple(0.0, 0.07, -0.01, '#86a636', 0.4);
      const orangeM = LIB.mat({ c: '#e8811f', rough: 0.55, bump: LIB.noiseTex('k_peel', 128, 128, 90, 0.6), bumpScale: 0.0006 });
      LIB.sph(b, 0.037, orangeM, 0.03, 0.065, 0.05, { ws: 28, hs: 18 }); LIB.sph(b, 0.036, orangeM, -0.06, 0.07, -0.05, { ws: 28, hs: 18 });
      const lemon = LIB.lathe(b, [[0, -0.042], [0.008, -0.036], [0.026, -0.02], [0.03, 0], [0.026, 0.02], [0.008, 0.036], [0, 0.042]], LIB.mat({ c: '#e8d23a', rough: 0.5, bump: LIB.noiseTex('k_peel', 128, 128, 90, 0.6), bumpScale: 0.0005 }), -0.085, 0.07, 0.04, { seg: 24, rz: PI / 2 - 0.3, rx: 0.4 });
      // bananas draped over the rim
      const banM = LIB.mat({ c: '#e9c94a', rough: 0.5, bump: m.fine, bumpScale: 0.0001 });
      [0, 1].forEach(i => {
        const curve = new THREE.CatmullRomCurve3([[-0.02, 0.11, 0.0], [0.05, 0.12, 0.03], [0.11, 0.11, 0.06], [0.16, 0.08, 0.075]].map(p => new THREE.Vector3(p[0], p[1] - i * 0.012, p[2] + i * 0.03 - 0.06)));
        const N2 = 30, R2 = 8, rows = [];
        for (let s2 = 0; s2 <= N2; s2++) { const t = s2 / N2, P = curve.getPoint(t), T2 = curve.getTangent(t), Nn = new THREE.Vector3(0, 1, 0).cross(T2).normalize(), Bn = T2.clone().cross(Nn).normalize(); const rad = 0.017 * Math.pow(Math.sin(Math.min(1, t * 1.1) * PI), 0.5) + 0.003; const row = []; for (let j = 0; j < R2; j++) { const a = j / R2 * TAU, rr = rad * (1 + 0.08 * Math.cos(a * 5)); row.push([P.x + Nn.x * Math.cos(a) * rr + Bn.x * Math.sin(a) * rr, P.y + Nn.y * Math.cos(a) * rr + Bn.y * Math.sin(a) * rr, P.z + Nn.z * Math.cos(a) * rr + Bn.z * Math.sin(a) * rr]); } rows.push(row); }
        LIB.mesh(b, loftClosed(rows), banM, 0, 0, 0);
        const e = curve.getPoint(1); LIB.sph(b, 0.004, LIB.mat({ c: '#2b2216', rough: 0.8 }), e.x, e.y, e.z, { ws: 8, hs: 6 });
      });
      LIB.cyl(b, 0.006, 0.008, 0.03, LIB.mat({ c: '#6b5a2a', rough: 0.8 }), -0.025, 0.105, -0.045, { rz: 1.1, seg: 8 });
    }
    // dish rack beside the sink (east run, towards the corner)
    {
      const r = LIB.group(root, 1.86, TOP, -1.0, PI / 2); // local x along room -z
      const tray = LIB.mat({ c: '#d8dadb', rough: 0.35 });
      rb(r, 0.44, 0.012, 0.31, 0.006, tray, 0, 0.006, 0); rb1(r, 0.06, 0.004, 0.08, 0.002, tray, 0.23, 0.004, 0.0, { rz: -0.05 }); // tray + spout
      const wire = LIB.mat({ c: '#d9dbdd', rough: 0.2, metal: 1 });
      const W2 = 0.2, D2 = 0.14, y0 = 0.025, y1 = 0.12;
      [y0, y1].forEach(y => LIB.tube(r, [[-W2, y, -D2], [W2, y, -D2], [W2, y, D2], [-W2, y, D2]], 0.0025, wire, { closed: true, segs: 60, radial: 6 }));
      [[-W2, -D2], [W2, -D2], [W2, D2], [-W2, D2]].forEach(c => { LIB.cyl(r, 0.0028, 0.0028, y1 - 0.012, wire, c[0], (y1 + 0.012) / 2, c[1], { seg: 6 }); LIB.cyl(r, 0.006, 0.006, 0.012, m.greyPl, c[0], 0.018, c[1], { seg: 10 }); });
      for (let i = -6; i <= 6; i++) LIB.cyl(r, 0.0018, 0.0018, D2 * 2, wire, i * 0.03, y0, 0, { rx: PI / 2, seg: 5 });
      for (let i = -7; i <= 7; i++) LIB.cyl(r, 0.0018, 0.0018, 0.07, wire, i * 0.026, y0 + 0.035, 0.07, { seg: 5 });
      for (let i = -7; i <= 7; i++) LIB.cyl(r, 0.0018, 0.0018, 0.05, wire, i * 0.026, y0 + 0.025, 0.115, { seg: 5 });
      LIB.cyl(r, 0.0018, 0.0018, 0.38, wire, 0, y0 + 0.07, 0.07, { rz: PI / 2, seg: 5 });
      [-0.13, -0.078, -0.026, 0.026].forEach((x, i) => LIB.lathe(r, platePts(0.12), m.ceramic, x, y0 + 0.124, 0.09, { seg: 40, rz: PI / 2 + 0.08 - i * 0.03 }));
      const glass = LIB.mat({ c: '#ffffff', rough: 0.05, physical: true, transparent: true, opacity: 0.3, env: 1.5 });
      LIB.lathe(r, [[0, 0], [0.032, 0], [0.034, 0.004], [0.036, 0.12], [0.034, 0.12], [0.032, 0.006], [0, 0.006]], glass, 0.12, y0 + 0.124, -0.06, { seg: 24, rx: PI });
      const mg = LIB.group(r, 0.05, y0 + 0.002, -0.07); LIB.lathe(mg, [[0, 0.095], [0.039, 0.095], [0.041, 0.09], [0.042, 0.004], [0.04, 0.0], [0.037, 0.0], [0.039, 0.088], [0, 0.088]], LIB.mat({ c: '#2f6f6a', rough: 0.2, physical: true, clearcoat: 0.6 }), 0, 0, 0, { seg: 28 }); LIB.torus(mg, 0.025, 0.006, LIB.mat({ c: '#2f6f6a', rough: 0.2 }), 0.05, 0.045, 0, { rs: 8, ts: 16, arc: PI, rz: -PI / 2 });
      const cad = LIB.group(r, -0.17, y0, -0.09); rb(cad, 0.06, 0.1, 0.08, 0.004, tray, 0, 0.05, 0);
      [[-0.01, -0.01, '#d7d9db'], [0.012, 0.01, '#222']].forEach(u => rb1(cad, 0.012, 0.13, 0.004, 0.002, LIB.mat({ c: u[2], rough: 0.3, metal: u[2] === '#222' ? 0 : 1 }), u[0], 0.12, u[1], { rz: u[0] * 8 }));
      root.remove(r); // the dish rack was taken off the counter
    }
    // dish soap and a sponge by the tap
    {
      const g = LIB.group(root, 2.12, TOP, -0.1);
      const label = LIB.textTex('k_soap', 512, 256, '#f3f6ef', (c, w, h) => { c.fillStyle = '#3d8b3d'; c.fillRect(0, 0, w, 40); c.fillRect(0, h - 30, w, 30); c.fillStyle = '#1f4f1f'; c.font = 'bold 54px "DejaVu Sans", sans-serif'; c.fillText('DISH SOAP', 40, 120); c.font = '34px "DejaVu Sans", sans-serif'; c.fillStyle = '#3d8b3d'; c.fillText('lime & aloe', 40, 175); c.beginPath(); c.fillStyle = '#9ac54a'; c.arc(400, 130, 50, 0, TAU); c.fill(); });
      LIB.lathe(g, [[0, 0], [0.032, 0], [0.034, 0.006], [0.034, 0.14], [0.028, 0.17], [0.014, 0.185], [0.013, 0.19], [0, 0.19]], LIB.mat({ c: '#8fd15a', rough: 0.08, physical: true, clearcoat: 1, transparent: true, opacity: 0.85 }), 0, 0, 0, { seg: 32 });
      LIB.cyl(g, 0.0342, 0.0342, 0.07, LIB.mat({ map: label, rough: 0.3 }), 0, 0.07, 0, { seg: 32, open: true, ry: -PI / 2 });
      LIB.lathe(g, [[0, 0.215], [0.012, 0.213], [0.015, 0.2], [0.015, 0.186], [0, 0.186]], m.whitePl, 0, 0, 0, { seg: 20 });
      const sp = LIB.group(root, 2.14, TOP, -0.25, 0.3);
      LIB.puffy(sp, 0.09, 0.022, 0.06, 0.008, LIB.mat({ c: '#f0cf3a', rough: 0.95, bump: LIB.noiseTex('k_sponge', 128, 128, 160, 0.4), bumpScale: 0.002 }), 0, 0.011, 0, { seed: 5, amp: 0.002 });
      rb(sp, 0.088, 0.008, 0.058, 0.003, LIB.mat({ c: '#2f7a3a', rough: 1, bump: LIB.noiseTex('k_scrub', 128, 128, 200, 0.2), bumpScale: 0.002 }), 0, 0.026, 0);
    }

    // ---------- api
    root.userData.movers = movers;
    root.userData.focus = { x: 0.4, y: 0.95, z: -1.3, r: 2.3 };
    sink.userData.name = 'the sink'; sink.userData.focus = { x: 1.85, y: 1.0, z: -0.42, r: 0.42 };
    root.userData.parts = [{ name: 'the counter', group: root, focus: { x: 0.4, y: 0.95, z: -1.3, r: 2.3 } }, { name: 'the sink', group: sink, focus: { x: 1.85, y: 1.0, z: -0.42, r: 0.42 } }];
    root.userData.tick = function (t, dt) { wT = t; if (wV > 0.001) updWater(t); };
    return root;
  };

  // ======================================================================= TABLETOP GAS STOVE
  KIT.stove = function () {
    const m = K();
    const g = new THREE.Group(); g.name = 'stove';
    const W = 0.70, D = 0.42, BX = 0.175;
    const steel = m.steel;
    const glass = LIB.mat({ c: '#060607', rough: 0.06, physical: true, clearcoat: 1, clearcoatRough: 0.04, env: 1.2 });
    // feet, body, glass top
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(q => LIB.cyl(g, 0.014, 0.016, 0.012, m.rubber, q[0] * 0.3, 0.006, q[1] * 0.17, { seg: 18 }));
    rb(g, W - 0.004, 0.08, D - 0.004, 0.01, steel, 0, 0.012 + 0.04, 0, { seg: 3 });
    rb(g, W, 0.008, D, 0.004, glass, 0, 0.096, 0, { seg: 2 });
    // front fascia print around the knobs
    const fascia = LIB.textTex('k_fascia', 1024, 128, '#000000', (c, w, h) => {
      c.clearRect(0, 0, w, h); c.fillStyle = '#1b1b1d'; c.fillRect(0, 0, w, h);
      [0.25, 0.75].forEach(f => { const cx = f * w, cy = h / 2; c.strokeStyle = '#cfd2d6'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { const a = -PI / 2 - i * 0.3; c.beginPath(); c.moveTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46); c.lineTo(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54); c.stroke(); } c.fillStyle = '#4b8cff'; c.beginPath(); c.moveTo(cx + 66, cy + 10); c.quadraticCurveTo(cx + 60, cy - 6, cx + 70, cy - 18); c.quadraticCurveTo(cx + 80, cy - 4, cx + 72, cy + 10); c.fill(); });
      c.fillStyle = '#9ea2a8'; c.font = 'bold 22px "DejaVu Sans", sans-serif'; c.fillText('GAS  ·  2 BURNER', w / 2 - 95, h / 2 + 8);
    });
    rb1(g, W - 0.04, 0.05, 0.002, 0.0008, LIB.mat({ c: '#ffffff', map: fascia, rough: 0.2, physical: true, clearcoat: 0.8 }), 0, 0.052, D / 2 - 0.001);
    // knobs (turn with the flame)
    const knobs = [-1, 1].map(sd => {
      const kx = sd * BX, k = LIB.group(g, kx, 0.052, D / 2 + 0.001);
      LIB.lathe(g, [[0.016, 0], [0.026, 0], [0.027, 0.003], [0.024, 0.005], [0.016, 0.005]], m.chrome, kx, 0.052, D / 2, { rx: PI / 2, seg: 32 });
      LIB.lathe(k, [[0, 0], [0.021, 0], [0.022, 0.004], [0.021, 0.016], [0.018, 0.02], [0, 0.021]], m.black, 0, 0, 0, { rx: PI / 2, seg: 32 });
      rb(k, 0.009, 0.036, 0.016, 0.004, m.black, 0, 0, 0.026);
      rb1(k, 0.0025, 0.012, 0.001, 0.0008, LIB.mat({ c: '#e8e8e8', rough: 0.4 }), 0, 0.011, 0.0345);
      LIB.torus(k, 0.0215, 0.0012, m.chrome, 0, 0, 0.004, { rs: 6, ts: 32 });
      return k;
    });
    // burners
    const brass = LIB.mat({ c: '#b48a4e', rough: 0.42, metal: 1, bump: m.fine, bumpScale: 0.0001 });
    const capM = LIB.mat({ c: '#121213', rough: 0.35, physical: true, clearcoat: 0.6 });
    const ports = LIB.canvasTex('k_ports', 512, 32, (c, w, h) => { c.fillStyle = '#b48a4e'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a120a'; for (let i = 0; i < 24; i++) c.fillRect(i * w / 24 + 4, 0, 8, h * 0.7); }, true);
    const BR = [0.042, 0.038];
    const burners = [-1, 1].map((sd, bi) => {
      const bx = sd * BX, R = BR[bi], b = LIB.group(g, bx, 0.1, -0.005);
      LIB.lathe(b, [[0.045, -0.001], [0.075, -0.001], [0.078, 0.001], [0.07, 0.0035], [0.05, 0.004], [0.045, 0.003]], m.steel, 0, 0, 0, { seg: 48 });
      LIB.lathe(b, [[0, 0.002], [R + 0.008, 0.002], [R + 0.009, 0.008], [R + 0.004, 0.012], [0, 0.012]], LIB.mat({ c: '#5d5f62', rough: 0.6, metal: 0.6 }), 0, 0, 0, { seg: 40 });
      LIB.cyl(b, R, R, 0.01, LIB.mat({ c: '#ffffff', map: ports, rough: 0.42, metal: 1 }), 0, 0.017, 0, { seg: 48, open: true });
      LIB.lathe(b, [[R - 0.006, 0.022], [R, 0.022], [R + 0.0005, 0.0225], [R + 0.0005, 0.012]], brass, 0, 0, 0, { seg: 48 });
      LIB.lathe(b, [[0, 0.033], [R * 0.5, 0.031], [R * 0.92, 0.027], [R + 0.001, 0.0235], [R + 0.0005, 0.0215], [0, 0.0215]], capM, 0, 0, 0, { seg: 48 });
      // thermocouple + igniter pins
      LIB.cyl(b, 0.0025, 0.0025, 0.03, m.satin, R + 0.012, 0.015, 0.01, { seg: 8 }); LIB.cyl(b, 0.003, 0.003, 0.026, m.whitePl, R + 0.011, 0.013, -0.012, { seg: 8 });
      return { b, R, x: bx };
    });
    // cast-iron pan supports
    const iron = LIB.mat({ c: '#1a1a1b', rough: 0.72, metal: 0.3, bump: LIB.noiseTex('k_iron', 128, 128, 120, 0.6), bumpScale: 0.0005 });
    [-1, 1].forEach(sd => {
      const gx = sd * BX, gr = LIB.group(g, gx, 0.1 + 0.002, -0.005);
      const outer = new THREE.Shape(); rrPath(outer, 0, 0, 0.33, 0.35, 0.03); outer.holes.push(rrPath(new THREE.Path(), 0, 0, 0.3, 0.32, 0.018));
      ext(gr, outer, 0.008, iron, 0, 0.007, 0, { rx: -PI / 2, bevelT: 0.003, bevelS: 0.002, bevelSeg: 2, curve: 8, crease: 0.8 });
      const L = 0.155, prof = polyShape([[0, 0], [L, 0.008], [L, 0.044], [L - 0.022, 0.044], [L - 0.034, 0.03], [0.02, 0.018], [0, 0.018]]);
      [45, 135, 225, 315].forEach(deg => {
        const a = deg * D2R, rr = 0.212, arm = LIB.group(gr, Math.cos(a) * rr, 0, -Math.sin(a) * rr, PI + a);
        ext(arm, prof, 0.006, iron, 0, 0, 0, { bevelT: 0.002, bevelS: 0.0015, bevelSeg: 2, crease: 0.8 });
      });
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(q => LIB.cyl(gr, 0.006, 0.006, 0.004, m.rubber, q[0] * 0.15, 0.0, q[1] * 0.16, { seg: 10 }));
    });
    // flames: a ring of tongues per burner (inner bright core + outer translucent mantle), updated on the CPU each frame
    const grad = (key, stops) => LIB.canvasTex(key, 64, 256, (c, w, h) => { const q = c.createLinearGradient(0, h, 0, 0); stops.forEach(s => q.addColorStop(s[0], s[1])); c.fillStyle = q; c.fillRect(0, 0, w, h); }, true);
    const outerMap = grad('k_flo', [[0, '#000000'], [0.08, '#5a5a5a'], [0.3, '#ffffff'], [0.65, '#9a9a9a'], [1, '#000000']]);
    const innerMap = grad('k_fli', [[0, '#202020'], [0.15, '#ffffff'], [0.6, '#d0d0d0'], [1, '#000000']]);
    const fmat = (c, map, k) => { const mt = LIB.mat({ c: '#000000', emissive: c, emissiveIntensity: k, emissiveMap: map, rough: 1, env: 0, side: THREE.DoubleSide, transparent: true, opacity: 1 }); mt.blending = THREE.AdditiveBlending; mt.depthWrite = false; return mt; };
    const flames = [];
    const mkRing = (parent, R, n, prof, mat, tilt, seed) => {
      const base = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 7);
      const bp = base.attributes.position, bu = base.attributes.uv, bi = base.index ? base.index.array : null, nv = bp.count;
      const pos = new Float32Array(nv * n * 3), uv = new Float32Array(nv * n * 2), root = new Float32Array(nv * n * 3), off = new Float32Array(nv * n * 3), idx = [];
      const M4 = new THREE.Matrix4(), Rz = new THREE.Matrix4(), Ry = new THREE.Matrix4(), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) / n * TAU; Ry.makeRotationY(-a); Rz.makeRotationZ(-tilt); M4.multiplyMatrices(Ry, Rz);
        for (let k = 0; k < nv; k++) {
          v.fromBufferAttribute(bp, k).applyMatrix4(M4); const o = (i * nv + k) * 3;
          root[o] = Math.cos(a) * R; root[o + 1] = 0; root[o + 2] = Math.sin(a) * R; off[o] = v.x; off[o + 1] = v.y; off[o + 2] = v.z;
          uv[(i * nv + k) * 2] = bu.getX(k); uv[(i * nv + k) * 2 + 1] = bu.getY(k);
        }
        if (bi) for (let k = 0; k < bi.length; k++) idx.push(bi[k] + i * nv);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
      const nrm = new Float32Array(nv * n * 3); for (let i = 0; i < nv * n; i++) nrm[i * 3 + 1] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.computeBoundingSphere(); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.02, 0), 0.12);
      const mesh = LIB.mesh(parent, geo, mat, 0, 0, 0, { shadow: false }); mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 6; mesh.frustumCulled = false;
      const ph = []; const r = LIB.rnd(seed); for (let i = 0; i < n; i++) ph.push([r() * 6.28, 0.8 + r() * 0.6, r() * 6.28]);
      flames.push({ geo, root, off, n, nv, ph, mesh });
    };
    const outerProf = [[0, 0], [0.0032, 0.002], [0.005, 0.008], [0.0048, 0.016], [0.0034, 0.025], [0.0016, 0.032], [0, 0.036]];
    const innerProf = [[0, 0], [0.0025, 0.0015], [0.0031, 0.004], [0.0024, 0.008], [0.0012, 0.0115], [0, 0.0135]];
    const glowMat = fmat('#2e6cff', null, 0.9);
    burners.forEach((B, i) => {
      const fg = LIB.group(B.b, 0, 0.0175, 0);
      const n = Math.round(B.R * 520);
      mkRing(fg, B.R + 0.0015, n, outerProf, fmat('#2a48ff', outerMap, 1.1), 48 * D2R, 3 + i);
      mkRing(fg, B.R + 0.0012, n, innerProf, fmat('#58b8ff', innerMap, 1.8), 62 * D2R, 7 + i);
      const glow = LIB.torus(fg, B.R + 0.0025, 0.0022, glowMat, 0, 0.001, 0, { rx: PI / 2, rs: 6, ts: 48, shadow: false }); glow.castShadow = false; glow.renderOrder = 6;
      B.glow = glow; B.fg = fg;
    });
    const lights = burners.map(B => { const L = new THREE.PointLight(0x4a74ff, 0, 0.8, 2); L.position.set(B.x, 0.14, -0.005); g.add(L); return L; });
    let fV = 0, fT = 0;
    function updFlames(t) {
      const on = fV > 0.001;
      flames.forEach(F => {
        F.mesh.visible = on; if (!on) return;
        const p = F.geo.attributes.position.array;
        for (let i = 0; i < F.n; i++) {
          const q = F.ph[i]; const fl = 1 + 0.12 * Math.sin(t * 19 * q[1] + q[0]) + 0.07 * Math.sin(t * 43 + q[2]);
          const s = (0.35 + 0.65 * fV) * fl, sway = 0.0012 * Math.sin(t * 11 + q[0]) * fV;
          for (let k = 0; k < F.nv; k++) { const o = (i * F.nv + k) * 3, up = F.off[o + 1]; p[o] = F.root[o] + F.off[o] * s * (0.7 + 0.3 * fV) + sway * up * 40; p[o + 1] = F.root[o + 1] + up * s; p[o + 2] = F.root[o + 2] + F.off[o + 2] * s * (0.7 + 0.3 * fV); }
        }
        F.geo.attributes.position.needsUpdate = true;
        F.mesh.material.opacity = Math.min(1, 0.25 + fV);
      });
      burners.forEach(B => { B.glow.visible = on; B.glow.material.opacity = 0.3 + 0.6 * fV; });
      lights.forEach((L, i) => { L.intensity = on ? fV * (0.55 + 0.06 * Math.sin(t * 23 + i * 2)) : 0; });
    }
    g.userData.setFlame = function (v) { fV = Math.max(0, Math.min(1, v)); knobs.forEach(k => { k.rotation.z = fV * 0.75 * PI; }); updFlames(fT); };
    g.userData.tick = function (t, dt) { fT = t; if (fV > 0.001) updFlames(t); };
    g.userData.lights = lights;
    g.userData.setFlame(0);
    g.userData.focus = { x: 0, y: 0.08, z: 0, r: 0.45 };
    return g;
  };

  // ======================================================================= CHIMNEY HOOD (wall item)
  KIT.hood = function () {
    const m = K();
    const g = new THREE.Group(); g.name = 'hood';
    const W = 0.70, D = 0.50, YB = 1.62, YS = 1.70, YT = 1.95, DW = 0.26, DD = 0.22;
    const st = m.steel, stV = m.steelV;
    // lower box ("skirt"): front lip, sides, back
    rb(g, W, YS - YB, 0.012, 0.004, st, 0, (YB + YS) / 2, D - 0.006);
    [-1, 1].forEach(sd => rb(g, 0.012, YS - YB, D - 0.004, 0.004, st, sd * (W / 2 - 0.006), (YB + YS) / 2, D / 2));
    rb1(g, W, YS - YB, 0.01, 0.002, st, 0, (YB + YS) / 2, 0.005);
    // canopy: lofted rounded-rect pyramid
    {
      const rows = [], NC = 5;
      rows.push(rrRing(0, D / 2, W / 2, D / 2, 0.006, YS - 0.004, NC));
      rows.push(rrRing(0, D / 2, W / 2, D / 2, 0.006, YS + 0.004, NC));
      rows.push(rrRing(0, DD / 2 + 0.002, DW / 2 + 0.002, DD / 2 + 0.002, 0.005, YT, NC));
      const cg = loftClosed(rows); const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
      LIB.mesh(g, cg, LIB.mat({ c: '#c2c5c9', rough: 0.3, metal: 1, bump: m.brushedH, bumpScale: 0.00018, roughMap: m.brushedH, side: THREE.DoubleSide }), 0, 0, 0);
    }
    // duct: lower and upper telescoping sections, seams and screws
    rb(g, DW, 0.4, DD, 0.004, stV, 0, YT - 0.01 + 0.2, DD / 2);
    rb(g, DW - 0.008, 2.70 - (YT + 0.36), DD - 0.008, 0.004, stV, 0, (YT + 0.36 + 2.70) / 2, (DD - 0.008) / 2);
    const seam = LIB.mat({ c: '#3a3c3f', rough: 0.6 });
    rb1(g, DW + 0.004, 0.006, DD + 0.002, 0.002, st, 0, YT - 0.007, DD / 2);                    // collar where duct meets canopy
    [-1, 1].forEach(sd => {
      LIB.box(g, 0.0008, 0.39, 0.0015, seam, sd * (DW / 2 + 0.0002), YT + 0.19, 0.018);
      LIB.box(g, 0.0008, 2.70 - YT - 0.37, 0.0015, seam, sd * (DW / 2 - 0.0038), (YT + 0.37 + 2.70) / 2, 0.018);
      [[YT + 0.37, 0.06], [YT + 0.37, 0.16], [YT + 0.025, 0.06], [YT + 0.025, 0.16], [2.66, 0.11]].forEach(q => { const x = sd * (q[0] > YT + 0.3 && q[0] < 2.6 ? DW / 2 : (q[0] > 2.6 ? DW / 2 - 0.004 : DW / 2)); const s = LIB.sph(g, 0.0042, m.chrome, x, q[0], q[1], { ws: 12, hs: 6 }); s.scale.set(0.35, 1, 1); LIB.box(g, 0.001, 0.0055, 0.0011, seam, x + sd * 0.0013, q[0], q[1]); });
    });
    // underside: frame, two baffle filters, lamps
    const YU = YB + 0.002;
    rb1(g, W - 0.024, 0.004, 0.058, 0.001, st, 0, YU, D - 0.041);
    rb1(g, W - 0.024, 0.004, 0.06, 0.001, st, 0, YU, 0.04);
    [-1, 1].forEach(sd => rb1(g, 0.08, 0.004, D - 0.13, 0.001, st, sd * 0.3, YU, D / 2 - 0.006));
    LIB.box(g, W - 0.03, 0.002, D - 0.02, LIB.mat({ c: '#1a1b1d', rough: 0.8 }), 0, YS - 0.01, D / 2);
    const filt = LIB.mat({ c: '#d0d3d6', rough: 0.25, metal: 1, bump: m.brushedH, bumpScale: 0.00012 });
    [-1, 1].forEach(sd => {
      const fx = sd * 0.13, f = LIB.group(g, fx, YB + 0.006, 0.25);
      [[-0.129, 0], [0.129, 0]].forEach(e => rb1(f, 0.006, 0.026, 0.37, 0.001, filt, e[0], 0.012, 0));
      [-0.183, 0.183].forEach(z => rb1(f, 0.264, 0.026, 0.006, 0.001, filt, 0, 0.012, z));
      for (let i = 0; i < 12; i++) { const x = -0.115 + i * 0.021; rb1(f, 0.0016, 0.026, 0.36, 0.0005, filt, x, 0.013, 0, { rz: (i % 2 ? 1 : -1) * 0.55 }); }
      rb(f, 0.06, 0.006, 0.012, 0.003, filt, 0, -0.001, 0.178);
    });
    const lampM = LIB.mat({ c: '#fff6e6', emissive: '#fff1d6', emissiveIntensity: 1.6, rough: 0.2 });
    [-1, 1].forEach(sd => { LIB.cyl(g, 0.024, 0.024, 0.003, m.chrome, sd * 0.28, YB - 0.0005, D - 0.042, { seg: 32 }); LIB.cyl(g, 0.019, 0.019, 0.003, lampM, sd * 0.28, YB - 0.001, D - 0.042, { seg: 28 }); });
    // control strip on the front lip
    const panel = LIB.textTex('k_hoodpanel', 512, 64, '#0b0b0c', (c, w, h) => {
      c.strokeStyle = '#e9edf2'; c.fillStyle = '#e9edf2'; c.lineWidth = 3;
      c.beginPath(); c.arc(40, 32, 12, -1.1, 4.25); c.stroke(); c.fillRect(38, 14, 4, 14);
      c.font = 'bold 26px "DejaVu Sans", sans-serif'; ['1', '2', '3'].forEach((s, i) => c.fillText(s, 120 + i * 80, 42));
      c.beginPath(); c.arc(450, 28, 10, 0, TAU); c.stroke(); c.fillRect(445, 40, 10, 6);
      c.fillStyle = '#5ab0ff'; c.fillRect(196, 50, 16, 3);
    });
    rb1(g, 0.22, 0.026, 0.003, 0.001, LIB.mat({ c: '#0b0b0c', map: panel, emissiveMap: panel, emissive: '#ffffff', emissiveIntensity: 0.35, rough: 0.08, physical: true, clearcoat: 1 }), 0, (YB + YS) / 2, D + 0.0015);
    g.userData.setLight = function (v) { lampM.emissiveIntensity = 0.1 + 1.6 * Math.max(0, Math.min(1, v)); };
    g.userData.focus = { x: 0, y: 1.9, z: 0.25, r: 0.65 };
    return g;
  };

  // ======================================================================= BIG TOP-FREEZER FRIDGE
  KIT.fridge = function () {
    const m = K();
    const g = new THREE.Group(); g.name = 'fridge';
    const W = 0.90, H = 1.85, CZB = -0.37, CZF = 0.30, DZ0 = 0.306, DZ1 = 0.361;
    const white = LIB.mat({ c: '#f3f3f0', rough: 0.25, physical: true, clearcoat: 0.7, clearcoatRough: 0.1, bump: m.fine, bumpScale: 0.00003 });
    const whiteSide = LIB.mat({ c: '#efefec', rough: 0.3, physical: true, clearcoat: 0.5, clearcoatRough: 0.15, bump: LIB.noiseTex('k_peelw', 256, 128, 60, 1.2), bumpScale: 0.00005 });
    const OY0 = 1.37, OY1 = 1.80, OX = 0.40; // freezer opening
    // cabinet shell: extruded outline with the freezer opening punched through, bevelled front/back edges
    {
      const bs = 0.012, s = new THREE.Shape(); rrPath(s, 0, (0.012 + H) / 2, W - 2 * bs, H - 0.012 - 2 * bs, 0.012);
      s.holes.push(rrPath(new THREE.Path(), 0, (OY0 + OY1) / 2, 2 * OX + 2 * bs, OY1 - OY0 + 2 * bs, 0.012));
      const sh = ext(g, s, (CZF - CZB) - 2 * bs, whiteSide, 0, 0, (CZB + CZF) / 2, { bevelT: bs, bevelS: bs, bevelSeg: 3, curve: 6, crease: 0.6 });
    }
    // back panel + condenser hint
    rb1(g, W - 0.02, H - 0.05, 0.01, 0.002, LIB.mat({ c: '#2a2b2c', rough: 0.8 }), 0, H / 2, CZB - 0.004);
    // freezer liner (frosty white plastic)
    const frost = LIB.canvasTex('k_frost', 512, 512, (c, w, h) => {
      c.fillStyle = '#e3e9ed'; c.fillRect(0, 0, w, h); const r = LIB.rnd(31);
      for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 90; const q = c.createRadialGradient(x, y, 0, x, y, rr); q.addColorStop(0, 'rgba(196,212,224,0.45)'); q.addColorStop(1, 'rgba(196,212,224,0)'); c.fillStyle = q; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 6 + r() * 40; const q = c.createRadialGradient(x, y, 0, x, y, rr); q.addColorStop(0, 'rgba(255,255,255,0.7)'); q.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = q; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 9000; i++) { const v = 215 + r() * 40 | 0; c.fillStyle = 'rgba(' + v + ',' + (v + 3) + ',255,' + (0.3 + r() * 0.5) + ')'; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
      c.strokeStyle = 'rgba(205,220,232,0.35)'; for (let i = 0; i < 120; i++) { const x = r() * w, y = r() * h; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 24, y + (r() - 0.5) * 24); c.stroke(); }
    }, true);
    const liner = LIB.mat({ c: '#e6ebee', map: frost, rough: 0.5, bump: LIB.noiseTex('k_frostb', 256, 160, 120, 1.0), bumpScale: 0.0006 });
    const LZ0 = CZB + 0.04, LZ1 = CZF - 0.012, LD = LZ1 - LZ0, LZc = (LZ0 + LZ1) / 2, t = 0.008;
    rb1(g, 2 * OX, t, LD, 0.002, liner, 0, OY0 + t / 2, LZc);
    rb1(g, 2 * OX, t, LD, 0.002, liner, 0, OY1 - t / 2, LZc);
    [-1, 1].forEach(sd => rb1(g, t, OY1 - OY0, LD, 0.002, liner, sd * (OX - t / 2), (OY0 + OY1) / 2, LZc));
    rb1(g, 2 * OX, OY1 - OY0, t, 0.002, liner, 0, (OY0 + OY1) / 2, LZ0 + t / 2);
    // a frost ridge on the back wall
    LIB.puffy(g, 2 * OX - 0.03, 0.012, 0.01, 0.004, LIB.mat({ c: '#f7fbff', rough: 0.7, bump: LIB.noiseTex('k_frostb', 256, 160, 120, 1.0), bumpScale: 0.001 }), 0, OY1 - 0.04, LZ0 + 0.01, { seed: 3, amp: 0.002, seg: 6 });
    const IY0 = OY0 + t, IY1 = OY1 - t, IX = OX - t;
    // interior lamp (ceiling, front)
    const lampM = LIB.mat({ c: '#f5f8ff', emissive: '#eaf2ff', emissiveIntensity: 0.2, rough: 0.3 });
    rb(g, 0.14, 0.008, 0.05, 0.003, lampM, 0, IY1 - 0.004, 0.18);
    const fl = new THREE.PointLight(0xe8f0ff, 0, 1.3, 2); fl.position.set(0, IY1 - 0.05, 0.15); g.add(fl);
    // wire shelf (back half)
    const wire = LIB.mat({ c: '#f4f4f2', rough: 0.45 });
    const SY = 1.585, SZ0 = LZ0 + 0.01, SZ1 = 0.04;
    LIB.cyl(g, 0.003, 0.003, 2 * IX - 0.004, wire, 0, SY, SZ1, { rz: PI / 2, seg: 6 });
    LIB.cyl(g, 0.0022, 0.0022, 2 * IX - 0.004, wire, 0, SY, (SZ0 + SZ1) / 2, { rz: PI / 2, seg: 6 });
    LIB.cyl(g, 0.0022, 0.0022, 2 * IX - 0.004, wire, 0, SY, SZ0 + 0.01, { rz: PI / 2, seg: 6 });
    for (let i = 0; i < 25; i++) LIB.cyl(g, 0.0018, 0.0018, SZ1 - SZ0, wire, -IX + 0.015 + i * (2 * IX - 0.03) / 24, SY + 0.003, (SZ0 + SZ1) / 2, { rx: PI / 2, seg: 5 });
    [-1, 1].forEach(sd => rb1(g, 0.012, 0.008, SZ1 - SZ0, 0.002, liner, sd * (IX - 0.006), SY - 0.007, (SZ0 + SZ1) / 2));

    // ---- cola cans (generic: red, white wave, the plain word COLA)
    const canLabel = LIB.canvasTex('k_cola', 1024, 256, (c, w, h) => {
      const q = c.createLinearGradient(0, 0, w, 0); for (let i = 0; i <= 8; i++) q.addColorStop(i / 8, i % 2 ? '#c4141c' : '#d92027'); c.fillStyle = q; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, h * 0.72); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.70 + Math.sin(x / w * TAU * 2) * h * 0.08); for (let x = w; x >= 0; x -= 8) c.lineTo(x, h * 0.78 + Math.sin(x / w * TAU * 2 + 0.6) * h * 0.07); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.font = 'bold 92px "DejaVu Sans", sans-serif'; [0.06, 0.56].forEach(f => c.fillText('COLA', f * w, h * 0.5));
      c.font = '20px "DejaVu Sans", sans-serif'; [0.38, 0.88].forEach(f => c.fillText('355 ml', f * w, h * 0.94));
    }, true);
    const canM = LIB.mat({ c: '#ffffff', map: canLabel, rough: 0.28, metal: 0.55, physical: true, clearcoat: 0.6, clearcoatRough: 0.1 });
    const alu = LIB.mat({ c: '#cfd2d5', rough: 0.25, metal: 1 });
    function can(parent, x, y, z, o) {
      o = o || {}; const c = LIB.group(parent, x, y, z);
      if (o.lie) { c.rotation.z = PI / 2; c.position.y += 0.033; c.rotation.y = o.ry || 0; c.rotation.order = 'YZX'; } else if (o.ry) c.rotation.y = o.ry;
      LIB.lathe(c, [[0, 0.006], [0.02, 0.001], [0.025, 0], [0.028, 0.002], [0.032, 0.008], [0.033, 0.013]], alu, 0, 0, 0, { seg: 28 });
      LIB.cyl(c, 0.033, 0.033, 0.096, canM, 0, 0.061, 0, { seg: 28, open: true });
      LIB.lathe(c, [[0.033, 0.109], [0.031, 0.114], [0.0275, 0.119], [0.0272, 0.1215], [0.0285, 0.1228], [0.027, 0.1232], [0.0255, 0.121], [0.0255, 0.1195], [0, 0.1195]], alu, 0, 0, 0, { seg: 28 });
      rb1(c, 0.012, 0.0012, 0.02, 0.003, alu, 0, 0.1205, 0.005);
      return c;
    }
    // standing on the freezer floor (front right), lying ones on the left, a few on the shelf
    [[0.12, 0.09], [0.19, 0.08], [0.26, 0.09], [0.33, 0.085], [0.155, 0.015], [0.225, 0.012]].forEach((p, i) => can(g, p[0], IY0, p[1], { ry: i * 1.3 }));
    can(g, -0.07, IY0, 0.06, { lie: true, ry: 0.15 }); can(g, -0.07, IY0, -0.012, { lie: true, ry: -0.1 });
    can(g, 0.2, SY + 0.005, -0.12, { ry: 0.4 }); can(g, 0.27, SY + 0.005, -0.15, { ry: 2 }); can(g, 0.05, SY + 0.005, -0.18, { lie: true, ry: PI / 2 - 0.2 });
    // ice tray with cubes
    {
      const tr = LIB.group(g, -0.25, IY0, 0.0, 0.05);
      const trayM = LIB.mat({ c: '#dbe8f3', rough: 0.2, physical: true, transparent: true, opacity: 0.85 });
      rb(tr, 0.12, 0.004, 0.27, 0.003, trayM, 0, 0.002, 0);
      [-0.06, 0.06].forEach(x => rb1(tr, 0.004, 0.03, 0.27, 0.001, trayM, x, 0.015, 0)); [-0.135, 0.135].forEach(z => rb1(tr, 0.12, 0.03, 0.004, 0.001, trayM, 0, 0.015, z));
      LIB.box(tr, 0.003, 0.026, 0.27, trayM, 0, 0.013, 0); for (let i = -2; i <= 2; i++) LIB.box(tr, 0.12, 0.026, 0.003, trayM, 0, 0.013, i * 0.045 + 0.0225 - 0.0225 * (i > 0 ? 0 : 0));
      const ice = LIB.mat({ c: '#eaf6ff', rough: 0.15, physical: true, transparent: true, opacity: 0.75, clearcoat: 1 });
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) rb(tr, 0.05, 0.022, 0.038, 0.006, ice, (j - 0.5) * 0.058, 0.016, -0.112 + i * 0.045, { seg: 2 });
    }
    // frozen peas bag at the back
    {
      const bag = LIB.textTex('k_peas', 256, 256, '#2f8a3a', (c, w, h) => { c.fillStyle = '#76c04a'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(60 + (i % 8) * 20, 150 + Math.floor(i / 8) * 18, 9, 0, TAU); c.fill(); } c.fillStyle = '#ffffff'; c.font = 'bold 44px "DejaVu Sans", sans-serif'; c.fillText('PEAS', 70, 90); c.font = '20px "DejaVu Sans", sans-serif'; c.fillText('garden  ·  frozen', 52, 124); });
      LIB.puffy(g, 0.2, 0.045, 0.24, 0.015, LIB.mat({ c: '#ffffff', map: bag, rough: 0.35, physical: true, clearcoat: 0.6 }), -0.2, IY0 + 0.03 + SY - IY0 - 0.02 + 0.0, -0.2, { seed: 8, amp: 0.004, seg: 6, rz: 0.04 });
    }

    // ---- fresh-food door (closed), freezer door (opens)
    const gasket = LIB.mat({ c: '#dcdcd8', rough: 0.75 });
    function doorBody(parent, y0, y1) {
      const h = y1 - y0, yc = (y0 + y1) / 2;
      rb(parent, W - 0.004, h, DZ1 - DZ0, 0.016, white, 0, yc, (DZ0 + DZ1) / 2, { seg: 4 });
      [[0, y1 - 0.02, W - 0.03, 0.022], [0, y0 + 0.02, W - 0.03, 0.022]].forEach(q => rb1(parent, q[2], q[3], 0.008, 0.004, gasket, q[0], q[1], DZ0 - 0.004));
      [-1, 1].forEach(sd => rb1(parent, 0.022, h - 0.04, 0.008, 0.004, gasket, sd * (W / 2 - 0.026), yc, DZ0 - 0.004));
    }
    function handle(parent, y0, y1) {
      const hx = W / 2 - 0.06, hz = 0.395, L = y1 - y0;
      rb(parent, 0.024, L, 0.02, 0.009, m.steelV, hx, (y0 + y1) / 2, hz, { seg: 3 });
      [y0 + 0.025, y1 - 0.025].forEach(y => { rb(parent, 0.02, 0.03, 0.03, 0.006, m.steelV, hx, y, (DZ1 + hz) / 2, { seg: 2 }); });
    }
    doorBody(g, 0.108, 1.338); handle(g, 0.86, 1.3);
    // toe grille
    const grille = LIB.canvasTex('k_toegrille', 512, 64, (c, w, h) => { c.fillStyle = '#3a3b3d'; c.fillRect(0, 0, w, h); c.fillStyle = '#0a0a0b'; for (let x = 14; x < w - 14; x += 9) c.fillRect(x, 10, 5, h - 20); }, true);
    rb(g, W - 0.04, 0.085, 0.022, 0.006, LIB.mat({ c: '#ffffff', map: grille, rough: 0.6 }), 0, 0.058, CZF + 0.008);
    [-1, 1].forEach(sd => { LIB.cyl(g, 0.014, 0.016, 0.014, m.black, sd * (W / 2 - 0.05), 0.007, CZF - 0.04, { seg: 16 }); });
    // hinges (left): top cover, middle plate, bottom
    rb(g, 0.06, 0.016, 0.1, 0.005, LIB.mat({ c: '#f0f0ec', rough: 0.35 }), -W / 2 + 0.045, H + 0.008, 0.315);
    rb(g, 0.05, 0.007, 0.07, 0.002, m.satin, -W / 2 + 0.035, 1.343, 0.33);
    rb(g, 0.05, 0.01, 0.07, 0.002, m.satin, -W / 2 + 0.035, 0.1, 0.33);
    // freezer door
    const piv = LIB.group(g, -W / 2 + 0.002, 0, DZ1); const fd = LIB.group(piv, W / 2 - 0.002, 0, -DZ1);
    const FY0 = 1.348, FY1 = 1.845;
    doorBody(fd, FY0, FY1); handle(fd, FY0 + 0.03, FY0 + 0.28);
    // inner door liner, shelf rail with two cans
    rb(fd, 2 * OX - 0.04, OY1 - OY0 - 0.03, 0.02, 0.006, LIB.mat({ c: '#f4f6f7', rough: 0.4 }), 0, (OY0 + OY1) / 2, DZ0 - 0.018);
    const clearP = LIB.mat({ c: '#e8f1f6', rough: 0.1, physical: true, transparent: true, opacity: 0.45 });
    const BY = OY0 + 0.03, BZ0 = DZ0 - 0.1;
    rb1(fd, 0.66, 0.005, 0.072, 0.002, m.whitePl, 0, BY, BZ0 + 0.036 + 0.002);
    rb1(fd, 0.66, 0.05, 0.004, 0.0015, clearP, 0, BY + 0.024, BZ0 + 0.002);
    [-1, 1].forEach(sd => rb1(fd, 0.004, 0.05, 0.072, 0.0015, clearP, sd * 0.33, BY + 0.024, BZ0 + 0.038));
    can(fd, -0.2, BY + 0.003, BZ0 + 0.04, { ry: 1 }); can(fd, -0.12, BY + 0.003, BZ0 + 0.04, { ry: 2.2 });
    const lights = [fl];
    g.userData.setFreezer = function (v) { v = Math.max(0, Math.min(1, v)); piv.rotation.y = -110 * D2R * v; lampM.emissiveIntensity = 0.15 + 1.6 * Math.min(1, v * 3); fl.intensity = 0.35 * Math.min(1, v * 3); };
    g.userData.lights = lights;

    // ---- magnets and papers
    const ZF = DZ1 + 0.0004;
    const glossy = (c) => LIB.mat({ c: c, rough: 0.25, physical: true, clearcoat: 0.7, clearcoatRough: 0.1 });
    const shadowFix = (mesh) => { mesh.castShadow = true; return mesh; };
    let mk = 0;
    // one magnet: shape (metres, centred) extruded `d` deep with a bevel; optional canvas detail mapped over its xy box
    function magnet(parent, shape, x, y, rz, col, draw, d, outlineCol) {
      d = d || 0.004; const bt = 0.0014;
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 10 });
      const box = planarUV(geo); smooth(geo, 0.7);
      let mat;
      if (draw) { const key = 'k_mag' + (mk++); const tx = LIB.canvasTex(key, 256, 256, (c, w, h) => { const P = (px, py) => [(px - box.min.x) / (box.max.x - box.min.x) * w, (1 - (py - box.min.y) / (box.max.y - box.min.y)) * h]; c.fillStyle = col; c.fillRect(0, 0, w, h); draw(c, w, h, P); if (outlineCol) { c.strokeStyle = outlineCol; c.lineWidth = 7; c.beginPath(); shape.getPoints().forEach((p2, i) => { const q = P(p2.x, p2.y); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); c.stroke(); } }, true); mat = LIB.mat({ c: '#ffffff', map: tx, rough: 0.28, physical: true, clearcoat: 0.6, clearcoatRough: 0.12 }); }
      else mat = glossy(col);
      const mesh = LIB.mesh(parent, geo, mat, x, y, ZF + bt, { rz: rz || 0 });
      return mesh;
    }
    const circle = (r) => new THREE.Shape().absarc(0, 0, r, 0, TAU, false);
    const roundRect = (w, h, r) => rrPath(new THREE.Shape(), 0, 0, w, h, r);
    const outline = (c, P, pts) => { c.beginPath(); pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath(); };
    function paper(parent, w, h, draw, key, x, y, rz, curl, seed) {
      const geo = new THREE.PlaneGeometry(w, h, 10, 14), p = geo.attributes.position, r = LIB.rnd(seed), ph = r() * 6;
      for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i), yn = py / (h / 2), xn = px / (w / 2); p.setZ(i, curl * Math.pow(Math.max(0, -yn), 2.2) + curl * 0.5 * Math.pow(Math.abs(xn), 3) * Math.max(0, -yn * 0.8) + 0.0006 * Math.sin(px * 50 + ph) * Math.sin(py * 37) + 0.0003); }
      geo.computeVertexNormals();
      const t = LIB.canvasTex('k_paper_' + key, 512, Math.round(512 * h / w), (c, W2, H2) => { c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, W2, H2); draw(c, W2, H2); }, true);
      const mesh = LIB.mesh(parent, geo, LIB.mat({ c: '#ffffff', map: t, rough: 0.85, side: THREE.DoubleSide }), x, y, ZF, { rz: rz });
      mesh.castShadow = true; return mesh;
    }
    const hand = (sz) => 'italic ' + sz + 'px "DejaVu Serif", serif';
    const lowerDecorStart = g.children.length; // everything added from here to the freezer section is removed below
    // --- papers on the fresh-food door
    paper(g, 0.2, 0.27, (c, w, h) => { // calendar page
      const q = c.createLinearGradient(0, 0, 0, h * 0.32); q.addColorStop(0, '#7fb2d9'); q.addColorStop(1, '#e8c890'); c.fillStyle = q; c.fillRect(16, 16, w - 32, h * 0.3);
      c.fillStyle = '#4f6d48'; c.beginPath(); c.moveTo(16, h * 0.3 + 16); c.lineTo(120, h * 0.14); c.lineTo(220, h * 0.26); c.lineTo(330, h * 0.12); c.lineTo(w - 16, h * 0.3 + 16); c.fill();
      c.fillStyle = '#20242a'; c.font = 'bold 40px "DejaVu Sans", sans-serif'; c.fillText('NOVEMBER 2026', 40, h * 0.3 + 70);
      const gx = 24, gy = h * 0.3 + 92, cw = (w - 48) / 7, chh = (h - gy - 20) / 6; c.font = '15px "DejaVu Sans", sans-serif'; ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => c.fillText(d, gx + i * cw + 6, gy - 6));
      c.strokeStyle = '#b8bcc2'; c.lineWidth = 1; for (let i = 0; i <= 7; i++) { c.beginPath(); c.moveTo(gx + i * cw, gy); c.lineTo(gx + i * cw, gy + 5 * chh); c.stroke(); } for (let j = 0; j <= 5; j++) { c.beginPath(); c.moveTo(gx, gy + j * chh); c.lineTo(gx + 7 * cw, gy + j * chh); c.stroke(); }
      c.fillStyle = '#333'; for (let d = 1; d <= 30; d++) { const k = d - 1; c.fillText(String(d), gx + (k % 7) * cw + 4, gy + Math.floor(k / 7) * chh + 16); }
      c.fillStyle = '#c0392b'; c.font = hand(16); c.fillText('dentist', gx + 4 * cw + 2, gy + 1 * chh + 38); c.fillStyle = '#1d4fa0'; c.fillText('game nite', gx + 5 * cw + 1, gy + 2 * chh + 38); c.fillText('trash', gx + 1 * cw + 4, gy + 0 * chh + 38);
      c.strokeStyle = '#c0392b'; c.lineWidth = 3; c.beginPath(); c.ellipse(gx + 4.5 * cw, gy + 3.5 * chh, cw * 0.42, chh * 0.42, 0, 0, TAU); c.stroke(); c.fillStyle = '#c0392b'; c.fillText('b-day!', gx + 4 * cw + 6, gy + 3 * chh + 40);
    }, 'cal', -0.19, 1.07, 0.02, 0.006, 1);
    magnet(g, circle(0.012), -0.19, 1.19, 0, '#d63a3a');
    paper(g, 0.13, 0.29, (c, w, h) => { // takeout menu
      c.fillStyle = '#b3261e'; c.fillRect(0, 0, w, 150); c.fillStyle = '#f7d36b'; c.font = 'bold 54px "DejaVu Serif", serif'; c.fillText('GOLDEN', 40, 66); c.fillText('WOK', 120, 126);
      c.fillStyle = '#b3261e'; c.font = 'bold 24px "DejaVu Sans", sans-serif'; c.fillText('TAKEOUT · DELIVERY', 52, 190);
      const items = ['Hot & Sour Soup', 'Spring Rolls (2)', 'Kung Pao Chicken', 'Beef & Broccoli', 'Veg Lo Mein', 'Fried Rice', 'Orange Chicken', 'Mapo Tofu', 'Dumplings (6)', 'Sesame Noodles', 'Egg Foo Young', 'Fortune Cookies'];
      c.font = '22px "DejaVu Sans", sans-serif'; items.forEach((s, i) => { c.fillStyle = '#222'; c.fillText(s, 30, 250 + i * 70); c.fillStyle = '#b3261e'; c.fillText((6.5 + (i * 1.7) % 7).toFixed(2), w - 100, 250 + i * 70); c.strokeStyle = '#ddd'; c.beginPath(); c.moveTo(30, 268 + i * 70); c.lineTo(w - 30, 268 + i * 70); c.stroke(); });
      c.fillStyle = '#222'; c.font = 'bold 26px "DejaVu Sans", sans-serif'; c.fillText('(608) 555-0142', 90, h - 40);
    }, 'menu', 0.11, 1.0, -0.04, 0.008, 2);
    magnet(g, roundRect(0.036, 0.024, 0.006), 0.11, 1.135, -0.04, '#2d5ba8', (c, w, h, P) => { c.fillStyle = '#ffffff'; c.font = 'bold 84px "DejaVu Sans", sans-serif'; c.fillText('YUM', 36, 156); });
    paper(g, 0.22, 0.165, (c, w, h) => { // child's crayon drawing
      const crayon = (col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; };
      crayon('#3aa14a', 7); for (let x = 10; x < w; x += 9) { c.beginPath(); c.moveTo(x, h - 10); c.lineTo(x + 4, h - 40 - (x * 7) % 14); c.stroke(); }
      c.fillStyle = 'rgba(240,200,40,0.85)'; c.beginPath(); c.arc(w - 70, 60, 34, 0, TAU); c.fill(); crayon('#f0b020', 5); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; c.beginPath(); c.moveTo(w - 70 + Math.cos(a) * 44, 60 + Math.sin(a) * 44); c.lineTo(w - 70 + Math.cos(a) * 64, 60 + Math.sin(a) * 64); c.stroke(); }
      crayon('#c0392b', 6); c.strokeRect(60, 170, 150, 130); c.beginPath(); c.moveTo(48, 176); c.lineTo(135, 100); c.lineTo(222, 176); c.stroke(); crayon('#6b4a2a', 6); c.strokeRect(118, 230, 34, 70); crayon('#2d7fd0', 5); c.strokeRect(78, 196, 30, 28); c.strokeRect(166, 196, 30, 28);
      const kid = (x, s, col) => { crayon(col, 5); c.beginPath(); c.arc(x, h - 120 * s, 16 * s, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x, h - 104 * s); c.lineTo(x, h - 60 * s); c.lineTo(x - 16 * s, h - 30 * s); c.moveTo(x, h - 60 * s); c.lineTo(x + 16 * s, h - 30 * s); c.moveTo(x - 24 * s, h - 92 * s); c.lineTo(x + 24 * s, h - 92 * s); c.stroke(); };
      kid(270, 1.15, '#7a3cb0'); kid(330, 1.15, '#d04080'); kid(385, 0.8, '#2d7fd0');
      c.fillStyle = '#e0602a'; c.font = 'bold 40px "DejaVu Sans", sans-serif'; c.save(); c.translate(26, 52); c.rotate(-0.05); c.fillText('MY FAMLY', 0, 0); c.restore();
    }, 'drawing', -0.17, 0.66, 0.035, 0.007, 3);
    magnet(g, circle(0.011), -0.26, 0.735, 0, '#f2c230', (c, w, h, P) => { c.fillStyle = '#3a2a10'; c.beginPath(); c.arc(95, 100, 14, 0, TAU); c.arc(161, 100, 14, 0, TAU); c.fill(); c.strokeStyle = '#3a2a10'; c.lineWidth = 12; c.beginPath(); c.arc(128, 128, 62, 0.4, PI - 0.4); c.stroke(); });
    magnet(g, circle(0.011), -0.08, 0.742, 0, '#2e9e5b');
    paper(g, 0.09, 0.16, (c, w, h) => { // grocery list (lined notepad)
      c.fillStyle = '#fffbe0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#9cc3e6'; c.lineWidth = 2; for (let y = 150; y < h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.strokeStyle = '#e59a9a'; c.beginPath(); c.moveTo(60, 0); c.lineTo(60, h); c.stroke();
      c.fillStyle = '#1d3f8f'; c.font = hand(52); c.fillText('groceries', 80, 110); c.font = hand(44); ['milk', 'eggs', 'bread', 'apples', 'rice', 'coffee', 'cola!', 'peas'].forEach((s, i) => c.fillText(s, 84, 140 + 64 * (i + 1) - 14));
      c.strokeStyle = '#1d3f8f'; c.lineWidth = 4; [0, 3].forEach(i => { c.beginPath(); c.moveTo(80, 128 + 64 * (i + 1) - 30); c.lineTo(260, 128 + 64 * (i + 1) - 34); c.stroke(); });
    }, 'grocery', 0.17, 0.6, 0.05, 0.006, 4);
    magnet(g, circle(0.0105), 0.17, 0.67, 0, '#ffffff', (c, w, h) => { c.fillStyle = '#e8473c'; c.beginPath(); c.moveTo(128, 200); c.bezierCurveTo(20, 120, 60, 40, 128, 90); c.bezierCurveTo(196, 40, 236, 120, 128, 200); c.fill(); });

    // --- letters H O M E (fresh door, kid height)
    const sL = 0.011, hL = 0.05;
    const Hs = polyShape([[-0.02, -hL / 2], [-0.02 + sL, -hL / 2], [-0.02 + sL, -sL / 2], [0.02 - sL, -sL / 2], [0.02 - sL, -hL / 2], [0.02, -hL / 2], [0.02, hL / 2], [0.02 - sL, hL / 2], [0.02 - sL, sL / 2], [-0.02 + sL, sL / 2], [-0.02 + sL, hL / 2], [-0.02, hL / 2]]);
    const Os = circle(0.024); Os.holes.push(new THREE.Path().absarc(0, 0, 0.012, 0, TAU, true));
    const Ms = polyShape([[-0.025, -hL / 2], [-0.025 + sL, -hL / 2], [-0.025 + sL, hL / 2 - 0.02], [-0.004, -0.004], [0.004, -0.004], [0.025 - sL, hL / 2 - 0.02], [0.025 - sL, -hL / 2], [0.025, -hL / 2], [0.025, hL / 2], [0.025 - sL * 0.9, hL / 2], [0, 0.006], [-0.025 + sL * 0.9, hL / 2], [-0.025, hL / 2]]);
    const Es = polyShape([[-0.018, -hL / 2], [0.018, -hL / 2], [0.018, -hL / 2 + sL], [-0.018 + sL, -hL / 2 + sL], [-0.018 + sL, -sL / 2], [0.012, -sL / 2], [0.012, sL / 2], [-0.018 + sL, sL / 2], [-0.018 + sL, hL / 2 - sL], [0.018, hL / 2 - sL], [0.018, hL / 2], [-0.018, hL / 2]]);
    [[Hs, '#d8322e', -0.3, 0.44, 0.06], [Os, '#f2b81c', -0.245, 0.43, -0.05], [Ms, '#2563c4', -0.185, 0.44, 0.04], [Es, '#2f9e48', -0.13, 0.43, -0.08]].forEach(q => magnet(g, q[0], q[2], q[3], q[4], q[1], null, 0.006));
    // --- fruit cluster
    magnet(g, smoothShape([[0, 0.016], [0.012, 0.022], [0.022, 0.012], [0.022, -0.006], [0.012, -0.022], [0, -0.018], [-0.012, -0.022], [-0.022, -0.006], [-0.022, 0.012], [-0.012, 0.022]], 60), 0.05, 0.42, 0.1, '#c8231f', (c, w, h, P) => { c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(80, 90, 22, 34, -0.4, 0, TAU); c.fill(); c.fillStyle = '#4a3420'; c.fillRect(120, 0, 14, 40); c.fillStyle = '#3a9a3a'; c.beginPath(); c.ellipse(165, 26, 40, 16, -0.4, 0, TAU); c.fill(); });
    magnet(g, smoothShape([[-0.035, 0.006], [-0.02, -0.012], [0.0, -0.017], [0.02, -0.012], [0.035, 0.008], [0.03, 0.01], [0.015, -0.002], [0.0, -0.005], [-0.017, 0.0], [-0.03, 0.01]], 70), 0.12, 0.39, -0.3, '#f1cf3c', (c, w, h, P) => { c.fillStyle = '#5a4520'; c.fillRect(0, 110, 18, 40); c.fillRect(w - 16, 0, 16, 36); c.strokeStyle = 'rgba(160,120,20,0.6)'; c.lineWidth = 4; c.beginPath(); c.moveTo(20, 140); c.quadraticCurveTo(128, 240, w - 20, 40); c.stroke(); });
    magnet(g, smoothShape([[0, -0.024], [0.014, -0.01], [0.019, 0.006], [0.012, 0.016], [0, 0.017], [-0.012, 0.016], [-0.019, 0.006], [-0.014, -0.01]], 60), 0.2, 0.43, 0.15, '#d72a3a', (c, w, h, P) => { c.fillStyle = '#ffe48a'; for (let i = 0; i < 26; i++) { const x = 40 + (i * 53) % 180, y = 40 + (i * 37) % 170; c.beginPath(); c.ellipse(x, y + 20, 4, 6, 0, 0, TAU); c.fill(); } c.fillStyle = '#2e8b2e'; c.beginPath(); for (let i = 0; i < 5; i++) { const a = PI + i / 5 * PI; c.moveTo(128, 30); c.lineTo(128 + Math.cos(a) * 80, 30 - Math.sin(a) * 30 + 10); c.lineTo(128 + Math.cos(a + 0.3) * 30, 34); } c.fill(); });
    magnet(g, smoothShape([[-0.024, 0], [-0.016, 0.012], [0, 0.016], [0.016, 0.012], [0.024, 0], [0.016, -0.012], [0, -0.016], [-0.016, -0.012]], 60), 0.27, 0.4, -0.25, '#efd84a');
    { const ch = new THREE.Shape().absarc(-0.01, -0.008, 0.01, 0, TAU, false); magnet(g, ch, 0.09, 0.3, 0, '#9e1624'); const ch2 = new THREE.Shape().absarc(0.008, -0.01, 0.0095, 0, TAU, false); magnet(g, ch2, 0.09, 0.3, 0, '#b01a2a'); LIB.tube(g, [[0.08, 0.292, ZF + 0.006], [0.087, 0.31, ZF + 0.005], [0.095, 0.326, ZF + 0.004], [0.098, 0.292, ZF + 0.006]], 0.0012, LIB.mat({ c: '#4b6a2a', rough: 0.6 }), { segs: 20, radial: 5 }); }
    // pizza slice
    magnet(g, smoothShape([[0, -0.035], [0.022, 0.012], [0.026, 0.022], [0.012, 0.028], [0, 0.03], [-0.012, 0.028], [-0.026, 0.022], [-0.022, 0.012]], 70), 0.25, 0.85, 0.2, '#f1c04a', (c, w, h, P) => { c.fillStyle = '#c47a2c'; c.fillRect(0, 0, w, 44); c.fillStyle = '#e6a03a'; c.fillRect(0, 44, w, 10); c.fillStyle = '#b42a1e'; [[100, 100], [160, 120], [120, 170], [80, 70], [175, 70]].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 20, 0, TAU); c.fill(); }); c.fillStyle = '#3d7a2a'; c.fillRect(140, 150, 10, 6); c.fillRect(90, 130, 8, 6); });
    // guitar
    magnet(g, smoothShape([[0, -0.045], [0.02, -0.04], [0.025, -0.022], [0.014, -0.006], [0.018, 0.006], [0.012, 0.016], [0.004, 0.018], [0.004, 0.045], [0.007, 0.05], [0.007, 0.062], [-0.007, 0.062], [-0.007, 0.05], [-0.004, 0.045], [-0.004, 0.018], [-0.012, 0.016], [-0.018, 0.006], [-0.014, -0.006], [-0.025, -0.022], [-0.02, -0.04]], 120), -0.33, 0.95, 0.25, '#c8742a', (c, w, h, P) => { const q = c.createRadialGradient(128, 200, 10, 128, 200, 120); q.addColorStop(0, '#f0b050'); q.addColorStop(1, '#6a2c10'); c.fillStyle = q; c.fillRect(0, 70, w, h); c.fillStyle = '#4a2a14'; c.fillRect(110, 0, 36, 140); c.fillStyle = '#111'; const s = P(0, -0.006); c.beginPath(); c.arc(s[0], s[1], 20, 0, TAU); c.fill(); c.fillStyle = '#2a1a0c'; const b = P(0, -0.03); c.fillRect(b[0] - 26, b[1] - 4, 52, 8); c.strokeStyle = '#ddd'; c.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(128 + i * 4, 20); c.lineTo(128 + i * 5, b[1]); c.stroke(); } });
    // game controller
    magnet(g, smoothShape([[-0.04, 0.012], [-0.022, 0.018], [0.022, 0.018], [0.04, 0.012], [0.046, -0.01], [0.04, -0.024], [0.03, -0.022], [0.018, -0.008], [-0.018, -0.008], [-0.03, -0.022], [-0.04, -0.024], [-0.046, -0.01]], 100), 0.05, 0.25, -0.1, '#2b2d31', (c, w, h, P) => { c.fillStyle = '#9a9ea6'; const d = P(-0.026, 0.004); c.fillRect(d[0] - 18, d[1] - 6, 36, 12); c.fillRect(d[0] - 6, d[1] - 18, 12, 36); const b = P(0.026, 0.004); [[0, -14, '#4ab04a'], [14, 0, '#e04a3a'], [-14, 0, '#3a7ae0'], [0, 14, '#f0c020']].forEach(q => { c.fillStyle = q[2]; c.beginPath(); c.arc(b[0] + q[0], b[1] + q[1], 7, 0, TAU); c.fill(); }); c.fillStyle = '#555'; [P(-0.01, -0.002), P(0.01, -0.002)].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 10, 0, TAU); c.fill(); }); });
    // star, heart, buttons
    { const st = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.008 : 0.019, a = PI / 2 + i * PI / 5; i ? st.lineTo(r * Math.cos(a), r * Math.sin(a)) : st.moveTo(r * Math.cos(a), r * Math.sin(a)); } st.closePath(); magnet(g, st, 0.26, 0.24, 0.2, '#e8b923'); }
    magnet(g, smoothShape([[0, -0.018], [0.016, -0.002], [0.017, 0.01], [0.009, 0.016], [0, 0.01], [-0.009, 0.016], [-0.017, 0.01], [-0.016, -0.002]], 60), -0.36, 0.32, -0.2, '#e0457b');
    [[-0.05, 0.85, '#4fb3c9', 0.011], [0.29, 0.56, '#9b59b6', 0.01], [-0.38, 0.55, '#f39c12', 0.012], [0.3, 1.24, '#1abc9c', 0.01]].forEach((q, i) => magnet(g, circle(q[3]), q[0], q[1], 0, q[2], i === 0 ? (c, w, h) => { c.fillStyle = '#fff'; c.font = 'bold 90px "DejaVu Sans", sans-serif'; c.fillText('hi!', 52, 160); } : null));

    g.children.splice(lowerDecorStart).forEach(o => { o.parent = null; }); // the lower door stays plain
    // --- freezer door: photo strip, Wisconsin, cow, MADISON, flags, letters
    const FD = fd;
    const ps = paper(FD, 0.05, 0.17, (c, w, h) => {
      c.fillStyle = '#f5f3ee'; c.fillRect(0, 0, w, h); const fh = (h - 60) / 4;
      for (let i = 0; i < 4; i++) { const y = 14 + i * (fh + 10); const q = c.createLinearGradient(0, y, 0, y + fh); q.addColorStop(0, ['#6c8ab3', '#b37a6c', '#7aa37a', '#a38fc2'][i]); q.addColorStop(1, '#2a2a30'); c.fillStyle = q; c.fillRect(20, y, w - 40, fh);
        [[0.36, 0.5], [0.66, 0.55]].forEach((f, k) => { const x = 20 + (w - 40) * f[0] + (i % 2) * 8, yy = y + fh * f[1]; c.fillStyle = k ? '#d9a77a' : '#c58a62'; c.beginPath(); c.arc(x, yy, 30, 0, TAU); c.fill(); c.fillStyle = '#2a1d14'; c.beginPath(); c.arc(x, yy - 12, 30, PI, TAU); c.fill(); c.fillStyle = k ? '#e05050' : '#3a5f9a'; c.fillRect(x - 40, yy + 30, 80, fh); }); }
    }, 'strip', -0.31, 1.6, 0.06, 0.004, 5);
    magnet(FD, circle(0.0105), -0.31, 1.675, 0, '#2c3e50');
    // Wisconsin outline
    {
      const L = [[-92.3, 46.7], [-92.0, 46.72], [-91.4, 46.85], [-90.9, 46.95], [-90.4, 46.6], [-90.0, 46.45], [-89.1, 46.12], [-88.2, 45.95], [-87.8, 45.75], [-87.6, 45.1], [-87.9, 44.85], [-88.0, 44.52], [-87.75, 44.65], [-87.3, 45.0], [-86.95, 45.3], [-87.2, 44.9], [-87.5, 44.4], [-87.7, 43.9], [-87.9, 43.2], [-87.8, 42.5], [-90.6, 42.5], [-91.1, 42.85], [-91.2, 43.5], [-91.3, 43.9], [-91.8, 44.2], [-92.3, 44.5], [-92.8, 44.8], [-92.7, 45.5], [-92.9, 45.65], [-92.3, 46.1]];
      const k = 0.0165, cx = -89.9, cy = 44.7, wi = polyShape(L.map(p => [(p[0] - cx) * k * 0.72, (p[1] - cy) * k]));
      magnet(FD, wi, -0.12, 1.75, -0.05, '#c5283d', (c, w, h, P) => { const s = P((-89.4 - cx) * k * 0.72, (43.07 - cy) * k); c.fillStyle = '#ffffff'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -PI / 2 + i * PI / 5; c.lineTo(s[0] + r * Math.cos(a), s[1] + r * Math.sin(a)); } c.fill(); c.font = 'bold 22px "DejaVu Sans", sans-serif'; c.fillText('WISCONSIN', 52, 120); });
    }
    // cow
    magnet(FD, smoothShape([[-0.03, 0.012], [-0.012, 0.016], [0.014, 0.016], [0.022, 0.022], [0.034, 0.02], [0.04, 0.008], [0.036, 0.0], [0.026, 0.002], [0.022, -0.004], [0.022, -0.02], [0.016, -0.02], [0.014, -0.008], [-0.018, -0.008], [-0.02, -0.02], [-0.026, -0.02], [-0.028, -0.004], [-0.036, 0.0], [-0.038, 0.008]], 120), 0.05, 1.77, 0.05, '#f4f0e6', (c, w, h, P) => { c.fillStyle = '#1b1b1b'; [[70, 110, 30, 22], [150, 90, 26, 18], [110, 150, 20, 14], [40, 80, 14, 10]].forEach(s => { c.beginPath(); c.ellipse(s[0], s[1], s[2], s[3], 0.4, 0, TAU); c.fill(); }); const n = P(0.037, 0.006); c.fillStyle = '#f0a0a8'; c.beginPath(); c.ellipse(n[0] - 6, n[1], 14, 12, 0, 0, TAU); c.fill(); const e = P(0.028, 0.014); c.fillStyle = '#111'; c.beginPath(); c.arc(e[0], e[1], 4, 0, TAU); c.fill(); const b = P(0.012, -0.008); c.fillStyle = '#f0a0a8'; c.beginPath(); c.ellipse(b[0], b[1] - 4, 12, 7, 0, 0, TAU); c.fill(); }, 0.005, '#3a3530');
    // MADISON souvenir
    magnet(FD, roundRect(0.085, 0.048, 0.006), 0.21, 1.76, -0.03, '#1f3a68', (c, w, h, P) => {
      c.fillStyle = '#7fb6e0'; c.fillRect(10, 150, w - 20, 40); c.strokeStyle = '#ffffff'; c.lineWidth = 3; for (let x = 16; x < w - 20; x += 22) { c.beginPath(); c.arc(x + 11, 175, 9, PI, TAU); c.stroke(); }
      c.fillStyle = '#f2efe6'; c.fillRect(102, 104, 52, 46); c.beginPath(); c.arc(128, 104, 24, PI, TAU); c.fill(); c.fillRect(126, 62, 4, 22); c.fillRect(80, 128, 96, 22);
      c.fillStyle = '#ffffff'; c.font = 'bold 40px "DejaVu Sans", sans-serif'; c.fillText('MADISON', 30, 54); c.font = 'bold 22px "DejaVu Sans", sans-serif'; c.fillStyle = '#f2c94c'; c.fillText('WISCONSIN', 66, 228);
    });
    // flags
    const flag = (draw, x, y, rz) => magnet(FD, roundRect(0.045, 0.03, 0.002), x, y, rz, '#ffffff', draw, 0.0025);
    flag((c, w, h) => { c.fillStyle = '#ff9933'; c.fillRect(0, 0, w, h / 3); c.fillStyle = '#138808'; c.fillRect(0, 2 * h / 3, w, h / 3 + 1); c.strokeStyle = '#000080'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, 24, 0, TAU); c.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * 24, h / 2 + Math.sin(a) * 24); c.stroke(); } }, -0.33, 1.42, 0.05);
    flag((c, w, h) => { c.fillStyle = '#009246'; c.fillRect(0, 0, w / 3, h); c.fillStyle = '#ce2b37'; c.fillRect(2 * w / 3, 0, w / 3 + 1, h); }, -0.26, 1.415, -0.06);
    flag((c, w, h) => { c.fillStyle = '#bc002d'; c.beginPath(); c.arc(w / 2, h / 2, 46, 0, TAU); c.fill(); }, -0.19, 1.42, 0.04);
    flag((c, w, h) => { for (let i = 0; i < 13; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#b22234'; c.fillRect(0, i * h / 13, w, h / 13 + 1); } c.fillStyle = '#3c3b6e'; c.fillRect(0, 0, w * 0.42, h * 0.54); c.fillStyle = '#fff'; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(12 + i * 20, 14 + j * 30, 3.5, 0, TAU); c.fill(); } }, -0.12, 1.415, 0.07);
    // letters A and Z, two buttons
    magnet(FD, polyShape([[-0.021, -0.025], [-0.01, -0.025], [-0.007, -0.016], [0.007, -0.016], [0.01, -0.025], [0.021, -0.025], [0.005, 0.025], [-0.005, 0.025]]), 0.12, 1.43, 0.1, '#8e44ad', null, 0.006);
    magnet(FD, polyShape([[-0.018, 0.025], [0.018, 0.025], [0.018, 0.016], [-0.006, -0.016], [0.018, -0.016], [0.018, -0.025], [-0.018, -0.025], [-0.018, -0.016], [0.006, 0.016], [-0.018, 0.016]]), 0.18, 1.44, -0.08, '#e67e22', null, 0.006);
    magnet(FD, circle(0.012), 0.0, 1.55, 0, '#ffffff', (c, w, h) => { c.fillStyle = '#2b2b2b'; c.font = 'bold 120px "DejaVu Sans", sans-serif'; c.fillText('♪', 80, 170); });
    magnet(FD, circle(0.0115), 0.25, 1.62, 0, '#e74c3c');
    { const dn = circle(0.019); dn.holes.push(new THREE.Path().absarc(0, 0, 0.0065, 0, TAU, true)); magnet(FD, dn, 0.13, 1.57, 0.3, '#d9a35a', (c, w, h) => { c.fillStyle = '#f07aa8'; c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, r = 100 + 12 * Math.sin(i * 2.7); c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.fill(); c.fillStyle = '#d9a35a'; c.beginPath(); c.arc(128, 128, 50, 0, TAU); c.fill(); ['#ffffff', '#7ad0f0', '#f6e05a', '#7a4ad0'].forEach((col, k) => { c.fillStyle = col; for (let i = 0; i < 5; i++) { const a = (i * 5 + k) * 0.29, r = 75 + (i % 2) * 18; c.save(); c.translate(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); c.rotate(a * 3); c.fillRect(-7, -2.5, 14, 5); c.restore(); } }); }, 0.005); }
    magnet(FD, circle(0.016), -0.2, 1.52, 0.4, '#e2702a', (c, w, h) => { c.strokeStyle = '#2a1a10'; c.lineWidth = 7; c.beginPath(); c.moveTo(128, 0); c.lineTo(128, 256); c.moveTo(0, 128); c.lineTo(256, 128); c.stroke(); c.beginPath(); c.arc(-20, 128, 110, -1, 1); c.stroke(); c.beginPath(); c.arc(276, 128, 110, PI - 1, PI + 1); c.stroke(); }, 0.006);

    g.userData.focus = { x: 0, y: 1.0, z: 0.1, r: 1.05 };
    // the selectable freezer group is the swinging door (its pivot); focus is in the fridge frame
    piv.userData.name = 'the freezer'; piv.userData.focus = { x: 0, y: 1.6, z: 0.25, r: 0.5 };
    g.userData.parts = [{ name: 'the freezer', group: piv, focus: { x: 0, y: 1.6, z: 0.25, r: 0.5 } }];
    g.userData.setFreezer(0);
    return g;
  };
})();
