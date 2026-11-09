/* Pool room — props for the small pool room the bedroom's pool cue leads into.
   POOL.table()        8-ft pool table, long axis along x, origin on the floor at the table centre (cloth at y 0.76)
   POOL.ceilingLight() round dim-yellow flush light, origin at the ceiling attachment (hangs into -y); userData.light
   POOL.closet()       closed reach-in closet, wall item (origin on the back wall at floor level, extends into +z)
   POOL.chair()        plain wooden dining chair, front +z, userData.seatY
   POOL.boombox()      retro boombox, origin bottom centre; userData.pulse(k), userData.setOn(v)
   POOL.cueRack()      wall cue rack with 4 cues, the remaining 8 balls and a cube of chalk (wall item)
   Metres, y up, front faces +z. */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2;
  const POOL = window.POOL = {};

  // ---------------------------------------------------------------- helpers
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
  function polyShape(pts) { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); return s; }
  function rrPath(path, cx, cy, w, h, r) { const x = cx - w / 2, y = cy - h / 2; path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r); path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h); path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r); path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path; }
  // extrude a shape lying in the floor plane (shape x -> world x, shape y -> world -z), from y0 up by depth
  function flatExtrude(shape, depth, y0, bev, curveSeg) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bev, bevelThickness: bev || 0, bevelSize: bev || 0, bevelSegments: 3, curveSegments: curveSeg || 16 });
    g.rotateX(-PI / 2); g.translate(0, y0 + (bev || 0), 0); return g;
  }
  // lathe about y from [[r,y],...]
  function latheGeo(pts, seg, phiStart, phiLen) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg || 24, phiStart || 0, phiLen || TAU); }
  // a wall that follows a circle (centre cx,cz, radius r) from angle a0 to a1 (angle measured in the xz plane: x=cx+r cos, z=cz+r sin), cross-section [[dr, y],...]
  function arcWall(cx, cz, r, a0, a1, prof, steps, uvScale) {
    const pos = [], uv = [], idx = [], n = prof.length;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * i / steps, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j < n; j++) { const rr = r + prof[j][0]; pos.push(cx + rr * ca, prof[j][1], cz + rr * sa); uv.push(r * (a - a0) * (uvScale || 1), j / (n - 1)); }
    }
    for (let i = 0; i < steps; i++) for (let j = 0; j < n - 1; j++) { const a = i * n + j, b = a + n; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- textures
  // tileable wood grain (grain runs along u): straight fibre streaks, soft growth rings, a little figure
  function grainTex(key, light, dark, seed, rings, wav) {
    return LIB.canvasTex(key, 1024, 512, (g, w, h) => {
      const r = LIB.rnd(seed || 3), cl = new THREE.Color(light), cd = new THREE.Color(dark);
      const row = new Float32Array(h); for (let y = 0; y < h; y++) row[y] = r();
      const row2 = new Float32Array(h); for (let y = 0; y < h; y++) row2[y] = (row[(y + h - 1) % h] + 2 * row[y] + row[(y + 1) % h]) / 4;
      const W = []; for (let k = 0; k < 5; k++) W.push({ fx: 1 + Math.floor(r() * 3), fy: Math.floor(r() * 3) - 1, a: (0.4 + r()) * (k < 2 ? 1 : 0.35), p: r() * TAU });
      const L = []; for (let k = 0; k < 4; k++) L.push({ fx: 1 + Math.floor(r() * 2), fy: 1 + Math.floor(r() * 2), p: r() * TAU });
      const img = g.createImageData(w, h), R = rings || 14, A = wav == null ? 0.25 : wav;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = x / w, v = y / h; let warp = 0;
        for (const q of W) warp += q.a * Math.sin(TAU * (q.fx * u + q.fy * v) + q.p);
        const s = v * R + warp * A, f = s - Math.floor(s);
        const band = Math.pow(1 - Math.abs(f - 0.5) * 2, 6);                 // thin dark late-wood line
        const yy = ((Math.round(y + warp * A * h / R * 0.9) % h) + h) % h;  // fibres follow the warp
        const fib = row2[yy];
        let low = 0; for (const q of L) low += Math.sin(TAU * (q.fx * u + q.fy * v) + q.p) * 0.25;
        let t = 0.42 * band + 0.38 * fib + 0.12 * low + 0.12;
        t = clamp(t, 0, 1);
        const i = (y * w + x) * 4;
        img.data[i] = (cl.r + (cd.r - cl.r) * t) * 255; img.data[i + 1] = (cl.g + (cd.g - cl.g) * t) * 255; img.data[i + 2] = (cl.b + (cd.b - cl.b) * t) * 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (key === 'pool_mahog') for (let k = 0; k < 40; k++) { const x = r() * w, y = r() * h, Ln = 10 + r() * 60, a = (r() - 0.5) * 0.8; g.strokeStyle = 'rgba(190,120,90,' + (0.06 + r() * 0.1) + ')'; g.lineWidth = 0.6 + r() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * Ln, y + Math.sin(a) * Ln); g.stroke(); }
      for (let k = 0; k < 3000; k++) { const x = r() * w, y = r() * h, Ln = 3 + r() * 14; g.strokeStyle = 'rgba(' + Math.round(cd.r * 140) + ',' + Math.round(cd.g * 120) + ',' + Math.round(cd.b * 110) + ',' + (0.12 + r() * 0.22) + ')'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Ln, y); g.stroke(); }
    });
  }
  // planar uv in metres for a box-like mesh, grain along its longest axis (so panels of any size share a texel density)
  function woodUV(mesh, k) {
    const geo = mesh.geometry; geo.computeBoundingBox(); const b = geo.boundingBox, sz = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const la = sz.indexOf(Math.max(...sz)), p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, off = (mesh.position.x * 3.1 + mesh.position.y * 1.7 + mesh.position.z * 2.3) % 1;
    k = k || 1;
    for (let i = 0; i < p.count; i++) {
      const P = [p.getX(i), p.getY(i), p.getZ(i)], N = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))];
      const others = [0, 1, 2].filter(a => a !== la); const na = N[others[0]] > N[others[1]] ? others[0] : others[1]; const va = others.find(a => a !== na);
      uv.setXY(i, P[la] * 0.9 * k + off, P[va] * 3.2 * k + off * 3);
    }
    uv.needsUpdate = true; return mesh;
  }
  function texRepeat(t, rx, ry, rot) { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); if (rot) { c.rotation = rot; c.center.set(0.5, 0.5); } return c; }

  // ---------------------------------------------------------------- shared materials
  let MS = null;
  function M() {
    if (MS) return MS;
    const mah = grainTex('pool_mahog', '#58240f', '#220904', 11, 16);
    const maple = grainTex('pool_maple', '#e0c290', '#bf955f', 5, 10, 0.12);
    const oak = grainTex('pool_oak', '#a87443', '#5e3618', 21, 12, 0.06);
    const fine = LIB.noiseTex('pool_fine', 256, 128, 70, 0);
    const woodBump = LIB.noiseTex('pool_wbump', 256, 128, 40, 1);
    MS = {
      mahTex: mah, mapleTex: maple, oakTex: oak,
      mahog: LIB.mat({ map: texRepeat(mah, 0.9, 3.2), rough: 0.42, clearcoat: 0.55, clearcoatRough: 0.22, bump: texRepeat(woodBump, 6, 6), bumpScale: 0.0004 }),
      mahogV: LIB.mat({ map: texRepeat(mah, 2.0, 0.6, PI / 2), rough: 0.42, clearcoat: 0.55, clearcoatRough: 0.22 }), // grain along v (lathes)
      mahogBox: LIB.mat({ map: texRepeat(mah, 1, 1), rough: 0.42, clearcoat: 0.5, clearcoatRough: 0.25 }),
      black: LIB.mat({ c: '#0b0b0b', rough: 0.85 }),
      void: LIB.mat({ c: '#020202', rough: 1, side: THREE.DoubleSide, env: 0 }),
      rubber: LIB.mat({ c: '#121110', rough: 0.75, side: THREE.DoubleSide }),
      steel: LIB.mat({ c: '#b9bcbf', rough: 0.3, metal: 1 }),
      brass: LIB.mat({ c: '#c19a5b', rough: 0.32, metal: 1 }),
      fine: fine,
    };
    return MS;
  }

  // ================================================================ BALLS
  const BALL_R = 0.0285;
  const BALL_COL = { 1: '#f3b70f', 2: '#173c9a', 3: '#c8161d', 4: '#4a2479', 5: '#ee6411', 6: '#0e6a3b', 7: '#7c1716', 8: '#0d0d0d' };
  const ballMats = {};
  function ballMat(n) {
    if (ballMats[n]) return ballMats[n];
    const col = BALL_COL[n > 8 ? n - 8 : n], stripe = n > 8;
    const t = LIB.canvasTex('pool_ball' + n, 512, 256, (g, w, h) => {
      g.fillStyle = stripe ? '#f3efe4' : col; g.fillRect(0, 0, w, h);
      if (stripe) { g.fillStyle = col; g.fillRect(0, h * 0.5 - h * 0.215, w, h * 0.43); }
      for (const cx of [w * 0.25, w * 0.75]) {
        g.fillStyle = '#f5f2e9'; g.beginPath(); g.ellipse(cx, h / 2, 25, 25, 0, 0, TAU); g.fill();
        g.fillStyle = '#111'; g.font = 'bold 31px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(n), cx, h / 2 + 2);
        if (n === 6 || n === 9) { g.fillRect(cx - 8, h / 2 + 17, 16, 2.5); }
      }
    });
    ballMats[n] = LIB.mat({ map: t, rough: 0.1, clearcoat: 1, clearcoatRough: 0.04, env: 1.1 });
    return ballMats[n];
  }
  let ballGeo = null;
  function ball(parent, n, x, y, z, seed) {
    if (!ballGeo) ballGeo = new THREE.SphereGeometry(BALL_R, 32, 20);
    const r = LIB.rnd(seed || n * 7.3);
    const m = LIB.mesh(parent, ballGeo, ballMat(n), x, y, z);
    m.rotation.set(r() * TAU, r() * TAU, r() * TAU); m.name = 'ball' + n;
    return m;
  }
  POOL.ball = function (n) { const g = new THREE.Group(); ball(g, n, 0, BALL_R, 0); return g; };

  // ================================================================ TABLE
  // dims
  const CY = 0.76, HXP = 1.12, HZP = 0.56;          // playing surface
  const CUSH_D = 0.045, HXI = HXP + CUSH_D, HZI = HZP + CUSH_D; // inner edge of the wooden rail
  const HXO = 1.26, HZO = 0.70;                      // outer edge of the rail
  const RAIL_TOP = 0.797, RAIL_BOT = 0.748;
  const POCKETS = [];
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => POCKETS.push({ x: sx * 1.143, z: sz * 0.583, r: 0.068, corner: true, sx: sx, sz: sz })));
  [-1, 1].forEach(sz => POCKETS.push({ x: 0, z: sz * 0.598, r: 0.066, corner: false, sx: 0, sz: sz }));

  // rectangle (half sizes hx,hy in shape coords) with the pocket circles subtracted (mode 'minus') or added ('plus')
  // shape coordinates: (x, y) with y = -z
  function pocketOutline(hx, hy, grow, mode, path) {
    path = path || new THREE.Shape();
    const cw = mode === 'minus';
    const C = (p) => ({ x: p.x, y: -p.z, r: p.r + grow });
    const pk = (sx, sz) => C(POCKETS.find(p => p.sx === sx && p.sz === sz));
    // corner pocket circle ∩ edges
    const hitX = (c, yEdge, side) => c.x + side * Math.sqrt(Math.max(0, c.r * c.r - (yEdge - c.y) * (yEdge - c.y))); // point on horizontal edge
    const hitY = (c, xEdge, side) => c.y + side * Math.sqrt(Math.max(0, c.r * c.r - (xEdge - c.x) * (xEdge - c.x)));
    const arc = (c, px, py, qx, qy) => { const a0 = Math.atan2(py - c.y, px - c.x), a1 = Math.atan2(qy - c.y, qx - c.x); path.absarc(c.x, c.y, c.r, a0, a1, cw); };
    // pockets in shape coordinates: shape y = -world z, so world sz=+1 is shape bottom
    const BL = pk(-1, 1), BR = pk(1, 1), TR = pk(1, -1), TL = pk(-1, -1), SB = pk(0, 1), ST = pk(0, -1);
    // start on bottom edge just right of BL
    const sx0 = hitX(BL, -hy, 1);
    path.moveTo(sx0, -hy);
    path.lineTo(hitX(SB, -hy, -1), -hy); arc(SB, hitX(SB, -hy, -1), -hy, hitX(SB, -hy, 1), -hy);
    path.lineTo(hitX(BR, -hy, -1), -hy); arc(BR, hitX(BR, -hy, -1), -hy, hx, hitY(BR, hx, 1));
    path.lineTo(hx, hitY(TR, hx, -1)); arc(TR, hx, hitY(TR, hx, -1), hitX(TR, hy, -1), hy);
    path.lineTo(hitX(ST, hy, 1), hy); arc(ST, hitX(ST, hy, 1), hy, hitX(ST, hy, -1), hy);
    path.lineTo(hitX(TL, hy, 1), hy); arc(TL, hitX(TL, hy, 1), hy, -hx, hitY(TL, -hx, -1));
    path.lineTo(-hx, hitY(BL, -hx, 1)); arc(BL, -hx, hitY(BL, -hx, 1), sx0, -hy);
    return path;
  }

  // cushion: profile in (d outward from the nose, y); swept along s from s0 to s1; ends cut by jaw slopes kA, kB (s shift per metre of d)
  const CUSH = [[CUSH_D + 0.001, CY], [CUSH_D + 0.001, 0.7895], [0.03, 0.7902], [0.012, 0.7895], [0.005, 0.7878], [0.0012, 0.7852], [0, 0.7828], [0.0012, 0.7805], [0.005, 0.7768], [0.011, 0.7715], [0.018, 0.7655], [0.024, CY]];
  function cushionGeo(s0, s1, kA, kB) {
    const P = CUSH, n = P.length, pos = [], uv = [], idx = [];
    for (let e = 0; e < 2; e++) for (const [d, y] of P) { const s = e ? s1 + kB * d : s0 - kA * d; pos.push(s, y, d); uv.push(s * 4, (y + d) * 4); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, n + i, j, j, n + i, n + j); }
    const tri = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
    tri.forEach(t => {
      const [a, b, c] = t, A = P[a], B = P[b], Cc = P[c];
      const area = (B[0] - A[0]) * (Cc[1] - A[1]) - (Cc[0] - A[0]) * (B[1] - A[1]);
      const ccw = area > 0; // ccw in (d,y) => normal -x
      if (ccw) { idx.push(a, b, c); idx.push(n + a, n + c, n + b); } else { idx.push(a, c, b); idx.push(n + a, n + b, n + c); }
    });
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g = g.toNonIndexed(); smooth(g, 0.75); return g;
  }

  function clothMaps() {
    const W = 2048, H = 1068, SX = 2 * HXI, SZ = 2 * HZI;
    const toPx = (x, z) => [(x / SX + 0.5) * W, (0.5 - (-z) / SZ) * H]; // uv v = shape y = -z; canvas row 0 is v=1
    const map = LIB.canvasTex('pool_cloth', W, H, (g, w, h) => {
      const r = LIB.rnd(77);
      g.fillStyle = '#1b6234'; g.fillRect(0, 0, w, h);
      // low-frequency dye variation
      for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rad = 40 + r() * 220, gr = g.createRadialGradient(x, y, 0, x, y, rad), l = r() < 0.5; gr.addColorStop(0, l ? 'rgba(90,160,110,0.025)' : 'rgba(8,40,18,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      // nap streaks along the table
      for (let i = 0; i < 900; i++) { const y = r() * h; g.strokeStyle = r() < 0.5 ? 'rgba(120,190,140,0.025)' : 'rgba(0,30,10,0.03)'; g.lineWidth = 0.6 + r() * 1.5; g.beginPath(); const x0 = r() * w; g.moveTo(x0, y); g.lineTo(x0 + 80 + r() * 500, y + (r() - 0.5) * 3); g.stroke(); }
      // worn lane down the middle (break shots) and around the foot spot
      let gr = g.createLinearGradient(0, h * 0.3, 0, h * 0.7); gr.addColorStop(0, 'rgba(140,200,150,0)'); gr.addColorStop(0.5, 'rgba(140,200,150,0.045)'); gr.addColorStop(1, 'rgba(140,200,150,0)'); g.fillStyle = gr; g.fillRect(w * 0.18, h * 0.3, w * 0.62, h * 0.4);
      const [fx, fy] = toPx(0.56, 0); gr = g.createRadialGradient(fx, fy, 0, fx, fy, 90); gr.addColorStop(0, 'rgba(150,205,160,0.07)'); gr.addColorStop(1, 'rgba(150,205,160,0)'); g.fillStyle = gr; g.fillRect(fx - 90, fy - 90, 180, 180);
      // chalk dust: blue smudges and specks along the head string (x = -0.56) and in the kitchen
      const [hx] = toPx(-0.56, 0);
      for (let i = 0; i < 18; i++) { const x = hx + (r() - 0.5) * 70 * (0.4 + r()), y = h * (0.5 + (r() - 0.5) * 0.5 * r()), rad = 3 + r() * 14; gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(70,130,200,' + (0.04 + r() * 0.07) + ')'); gr.addColorStop(1, 'rgba(70,130,200,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      for (let i = 0; i < 260; i++) { const x = hx + (r() - 0.5) * 160 * r(), y = h * (0.5 + (r() - 0.5) * 0.7 * r()); g.fillStyle = 'rgba(90,150,220,' + (0.12 + r() * 0.3) + ')'; g.fillRect(x, y, 1 + r() * 1.6, 1 + r() * 1.6); }
      for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(90,150,220,' + (0.06 + r() * 0.15) + ')'; g.fillRect(x, y, 1.4, 1.4); }
      // fine fibre speckle
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const k = (r() - 0.5) * 9; d[i] = clamp(d[i] + k, 0, 255); d[i + 1] = clamp(d[i + 1] + k * 1.2, 0, 255); d[i + 2] = clamp(d[i + 2] + k, 0, 255); }
      g.putImageData(img, 0, 0);
    });
    map.repeat.set(1 / SX, 1 / SZ); map.offset.set(0.5, 0.5);
    return map;
  }

  POOL.table = function () {
    const S = M(), root = new THREE.Group(); root.name = 'poolTable';
    const fine = S.fine;
    const clothBump = texRepeat(fine, 30, 30);
    const cloth = LIB.mat({ c: '#ffffff', map: clothMaps(), rough: 0.95, bump: clothBump, bumpScale: 0.0006, env: 0.6 });
    const cushTex = LIB.canvasTex('pool_cushc', 256, 256, (g, w, h) => { const r = LIB.rnd(5); g.fillStyle = '#1b6234'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,190,140,0.06)' : 'rgba(0,30,10,0.07)'; g.fillRect(r() * w, r() * h, 2, 1); } });
    const cushM = LIB.mat({ map: cushTex, rough: 0.93, bump: clothBump, bumpScale: 0.0006, env: 0.6 });

    // --- bed (slate + cloth) with the six pocket holes
    const bevC = 0.003;
    const bedShape = pocketOutline(HXI - bevC, HZI - bevC, bevC, 'minus');
    const bedGeo = flatExtrude(bedShape, 0.03 - 2 * bevC, CY - 0.03, bevC, 20);
    const bed = LIB.mesh(root, bedGeo, cloth, 0, 0, 0); bed.castShadow = false; bed.name = 'cloth';
    // bed uv: caps already use shape coords (metres); the map's repeat/offset converts them

    // --- cushions (six)
    const A = 0.081; // nose set-back from the corner along each rail
    const kC = 0.85, kS = 0.0;
    const sideMouth = 0.064;
    const segs = [];
    // long rails (+z and -z)
    [[0, HZP], [PI, -HZP]].forEach(([ry, z]) => {
      segs.push({ ry, x: 0, z, s0: -HXP + A, s1: -sideMouth, kA: kC, kB: kS });
      segs.push({ ry, x: 0, z, s0: sideMouth, s1: HXP - A, kA: kS, kB: kC });
    });
    [[PI / 2, HXP], [-PI / 2, -HXP]].forEach(([ry, x]) => segs.push({ ry, x, z: 0, s0: -HZP + A, s1: HZP - A, kA: kC, kB: kC }));
    segs.forEach(sg => { const m = LIB.mesh(root, cushionGeo(sg.s0, sg.s1, sg.kA, sg.kB), cushM, sg.x, 0, sg.z, { ry: sg.ry }); m.name = 'cushion'; });

    // --- wooden top rail: rounded outer rectangle minus the pocketed inner opening
    const bevR = 0.009;
    const outer = new THREE.Shape(); rrPath(outer, 0, 0, 2 * (HXO - bevR), 2 * (HZO - bevR), 0.05);
    const hole = pocketOutline(HXI + bevR, HZI + bevR, bevR, 'plus', new THREE.Path());
    outer.holes.push(hole);
    const railGeo = flatExtrude(outer, RAIL_TOP - RAIL_BOT - 2 * bevR, RAIL_BOT, bevR, 20);
    // wood uv: grain along x for the long rails, along z for the end rails
    { const p = railGeo.attributes.position, uv = railGeo.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const endRail = Math.abs(x) - HXI > Math.abs(z) - HZI; if (endRail) uv.setXY(i, z + y * 0.3, x * 1.3 + y); else uv.setXY(i, x + y * 0.3, z * 1.3 + y); } }
    const rail = LIB.mesh(root, railGeo, S.mahog, 0, 0, 0); rail.name = 'rail';

    // --- diamond sights, mother of pearl
    const pearlTex = LIB.canvasTex('pool_pearl', 128, 128, (g, w, h) => { const r = LIB.rnd(9); g.fillStyle = '#efeae2'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rad = 6 + r() * 30, c = ['rgba(255,210,220,0.35)', 'rgba(200,235,240,0.35)', 'rgba(230,240,200,0.3)', 'rgba(255,255,255,0.5)'][i % 4], gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } });
    const pearl = LIB.mat({ map: pearlTex, rough: 0.18, clearcoat: 1, clearcoatRough: 0.05 });
    const dShape = polyShape([[0, 0.0145], [0.0075, 0], [0, -0.0145], [-0.0075, 0]]);
    const dGeo = new THREE.ExtrudeGeometry(dShape, { depth: 0.0006, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0006, bevelSegments: 1 }); dGeo.rotateX(-PI / 2);
    const dy = RAIL_TOP - 0.0007, midZ = (HZI + HZO) / 2 + 0.002, midX = (HXI + HXO) / 2 + 0.002;
    [-3, -2, -1, 1, 2, 3].forEach(k => [-1, 1].forEach(sz => { const m = LIB.mesh(root, dGeo, pearl, k * 0.28, dy, sz * midZ); m.castShadow = false; }));
    [-1, 0, 1].forEach(k => [-1, 1].forEach(sx => { const m = LIB.mesh(root, dGeo, pearl, sx * midX, dy, k * 0.28, { ry: PI / 2 }); m.castShadow = false; }));

    // --- pockets: leather rim over the cut in the rail, black cup below, leather drop on the corner
    const leatherTex = LIB.canvasTex('pool_leather', 512, 64, (g, w, h) => {
      const r = LIB.rnd(3); g.fillStyle = '#2a1a12'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,55,40,0.25)' : 'rgba(0,0,0,0.3)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }
      // stitch row near the lip
      g.strokeStyle = 'rgba(190,170,140,0.8)'; g.lineWidth = 2; for (let x = 2; x < w; x += 12) { g.beginPath(); g.moveTo(x, h * 0.78); g.lineTo(x + 6, h * 0.78); g.stroke(); }
    });
    const leather = LIB.mat({ map: leatherTex, rough: 0.55, clearcoat: 0.2, clearcoatRough: 0.4, side: THREE.DoubleSide });
    const rimProf = [[-0.0015, 0.738], [-0.0015, 0.790], [0.0005, 0.7955], [0.004, 0.7982], [0.010, 0.7986], [0.015, 0.7976], [0.017, 0.7965]];
    const cupProf = [[0, 0.585], [0.03, 0.588], [0.05, 0.60], [0.06, 0.625], [0.064, 0.66], [0.065, 0.70], [0.066, 0.759]];
    const inRect = (x, z) => Math.abs(x) < HXI - 0.0005 && Math.abs(z) < HZI - 0.0005;
    POCKETS.forEach(p => {
      // cup (opaque black inside)
      const cupR = p.r - 0.003, cp = cupProf.map(q => [q[0] * cupR / 0.066, q[1]]);
      const cup = LIB.mesh(root, latheGeo(cp, 24), S.void, p.x, 0, p.z); cup.castShadow = false;
      // rim: the part of the circle that lies in the wooden rail
      const out = a => !inRect(p.x + p.r * Math.cos(a), p.z + p.r * Math.sin(a));
      const N = 180; let start = -1;
      for (let i = 0; i < N; i++) { const a = i / N * TAU, b = (i - 1) / N * TAU; if (out(a) && !out(b)) { start = a; break; } }
      let a0 = start, a1 = start; while (out(a1 + TAU / N) && a1 < start + TAU) a1 += TAU / N;
      // refine end points
      const refine = (lo, hi) => { for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (out(m) === out(hi)) hi = m; else lo = m; } return hi; };
      a0 = refine(a0 - TAU / N, a0); { let lo = a1, hi = a1 + TAU / N; for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (out(m)) lo = m; else hi = m; } a1 = lo; }
      const rim = LIB.mesh(root, arcWall(p.x, p.z, p.r, a0, a1, rimProf, 28, 10), leather, 0, 0, 0); rim.name = 'pocketRim';
      // outside: the leather drop pocket shield below the rail at each pocket (classic drop-pocket look)
    });

    // --- body: apron with mouldings, leg blocks, legs, levellers
    const AX = HXO - 0.024, AZ = HZO - 0.024, AY0 = 0.575, AY1 = RAIL_BOT + 0.004, AT = 0.032;
    const aH = AY1 - AY0, aY = (AY0 + AY1) / 2;
    const apronMat = S.mahogBox;
    const wb = (...q) => woodUV(rb(root, ...q));
    const LB = 0.19; // leg block size
    // long aprons (between corner blocks), split by the middle block
    [-1, 1].forEach(sz => {
      [-1, 1].forEach(sx => {
        const x0 = LB / 2 - 0.02, x1 = AX - LB + 0.02, L = x1 - x0, cx = sx * (x0 + x1) / 2;
        wb(L, aH, AT, 0.006, apronMat, cx, aY, sz * (AZ - AT / 2));
        // raised field panel
        wb(L - 0.12, aH - 0.075, 0.008, 0.004, apronMat, cx, aY + 0.004, sz * (AZ + 0.002));
        // bottom bead and top cove
        LIB.cyl(root, 0.011, 0.011, L, apronMat, cx, AY0 + 0.012, sz * (AZ - 0.004), { rz: PI / 2, seg: 10 });
        wb(L, 0.016, 0.016, 0.005, apronMat, cx, AY1 - 0.012, sz * (AZ - 0.002));
      });
    });
    [-1, 1].forEach(sx => {
      const L = 2 * (AZ - LB) + 0.04;
      wb(AT, aH, L, 0.006, apronMat, sx * (AX - AT / 2), aY, 0);
      wb(0.008, aH - 0.075, L - 0.12, 0.004, apronMat, sx * (AX + 0.002), aY + 0.004, 0);
      LIB.cyl(root, 0.011, 0.011, L, apronMat, sx * (AX - 0.004), AY0 + 0.012, 0, { rx: PI / 2, seg: 10 });
      wb(0.016, 0.016, L, 0.005, apronMat, sx * (AX - 0.002), AY1 - 0.012, 0);
    });
    // underside board
    rb1(root, 2 * AX - 0.06, 0.02, 2 * AZ - 0.06, 0.004, S.black, 0, AY0 + 0.03, 0, { shadow: false });
    // leg blocks (corners and middles) with a carved recessed panel
    const legPos = [];
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => legPos.push([sx * (AX - LB / 2 + 0.008), sz * (AZ - LB / 2 + 0.008)])));
    [-1, 1].forEach(sz => legPos.push([0, sz * (AZ - LB / 2 + 0.008)]));
    const legProf = [[0, 0.028], [0.05, 0.028], [0.058, 0.034], [0.06, 0.05], [0.055, 0.062], [0.05, 0.07], [0.056, 0.082], [0.068, 0.105], [0.079, 0.145], [0.086, 0.19], [0.087, 0.225], [0.083, 0.26], [0.073, 0.30], [0.059, 0.34], [0.048, 0.375], [0.043, 0.405], [0.043, 0.425], [0.049, 0.438], [0.06, 0.448], [0.063, 0.46], [0.058, 0.472], [0.05, 0.48], [0.054, 0.492], [0.066, 0.505], [0.074, 0.522], [0.077, 0.545], [0.077, AY0 + 0.01], [0, AY0 + 0.01]];
    const legGeo = latheGeo(legProf, 28);
    { const p = legGeo.attributes.position, uv = legGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i), uv.getX(i) * 0.5); }
    legPos.forEach(([x, z], i) => {
      const bt = 0.022, bh = aH + 0.012;
      [-1, 1].forEach(k => { woodUV(rb(root, bt, bh, LB, 0.006, apronMat, x + k * (LB / 2 - bt / 2), aY - 0.002, z)); woodUV(rb(root, LB - 2 * bt + 0.004, bh, bt, 0.006, apronMat, x, aY - 0.002, z + k * (LB / 2 - bt / 2))); });
      // recessed panel faces (outward sides)
      const fx = Math.sign(x), fz = Math.sign(z);
      if (fx) wb(0.008, aH - 0.07, LB - 0.06, 0.003, apronMat, x + fx * (LB / 2 + 0.001), aY, z);
      wb(LB - 0.06, aH - 0.07, 0.008, 0.003, apronMat, x, aY, z + fz * (LB / 2 + 0.001));
      // bottom moulding on the block
      wb(LB + 0.02, 0.022, LB + 0.02, 0.008, apronMat, x, AY0 + 0.0, z);
      LIB.mesh(root, legGeo, S.mahog, x, 0, z, { ry: i * 0.7 });
      // leveller: rubber pad + threaded steel stem + hex nut
      LIB.cyl(root, 0.034, 0.036, 0.012, S.rubber, x, 0.006, z, { seg: 20 });
      LIB.cyl(root, 0.008, 0.008, 0.018, S.steel, x, 0.019, z, { seg: 10 });
      LIB.cyl(root, 0.014, 0.014, 0.006, S.steel, x, 0.024, z, { seg: 6 });
    });

    // --- foot spot sticker and a faint head spot
    const spotM = LIB.mat({ c: '#f2efe6', rough: 0.7 });
    const spot = LIB.cyl(root, 0.011, 0.011, 0.0006, spotM, HXP / 2, CY + 0.0003, 0, { seg: 20 }); spot.castShadow = false;

    // --- balls: seven object balls at rest (no cue ball; kitchen region left clear)
    const BY = CY + BALL_R - 0.0004;
    const placed = [[9, 0.36, 0.13], [2, 0.64, -0.31], [14, 0.97, 0.45], [5, -0.16, 0.41], [11, 0.17, -0.44], [7, -0.71, -0.43], [13, 0.80, 0.03]];
    const balls = new THREE.Group(); balls.name = 'balls'; root.add(balls);
    placed.forEach(([n, x, z], i) => ball(balls, n, x, BY, z, i * 13 + 5));

    root.userData.focus = { x: 0, y: 0.78, z: 0, r: 1.45 };
    root.userData.cloth = { y: CY, x0: -HXP, x1: HXP, z0: -HZP, z1: HZP };
    root.userData.pockets = POCKETS.map(p => ({ x: p.x, z: p.z, r: p.r }));
    root.userData.ballR = BALL_R;
    return root;
  };

  // ================================================================ CEILING LIGHT
  POOL.ceilingLight = function () {
    const g = new THREE.Group(); g.name = 'ceilingLight';
    const brass = LIB.mat({ c: '#b8925a', rough: 0.38, metal: 1, side: THREE.DoubleSide, bump: texRepeat(LIB.noiseTex('pool_brush', 256, 128, 90, 0), 1, 30), bumpScale: 0.0003 });
    const diff = LIB.mat({ c: '#ffe2a6', emissive: '#ffcc66', emissiveIntensity: 1.2, rough: 0.55, side: THREE.DoubleSide });
    const no = { shadow: false };
    LIB.lathe(g, [[0, 0], [0.072, 0], [0.072, -0.005], [0.068, -0.012], [0.05, -0.019], [0.012, -0.022], [0, -0.022]], brass, 0, 0, 0, Object.assign({ seg: 32 }, no));
    LIB.cyl(g, 0.0085, 0.0085, 0.05, brass, 0, -0.045, 0, Object.assign({ seg: 12 }, no));
    LIB.cyl(g, 0.016, 0.012, 0.012, brass, 0, -0.072, 0, Object.assign({ seg: 16 }, no));
    // shallow pan with a rolled rim, diameter 0.38
    LIB.lathe(g, [[0.0, -0.076], [0.03, -0.077], [0.12, -0.086], [0.172, -0.096], [0.186, -0.104], [0.19, -0.112], [0.19, -0.138], [0.188, -0.143], [0.183, -0.144], [0.181, -0.141]], brass, 0, 0, 0, Object.assign({ seg: 48 }, no));
    // frosted diffuser: slightly domed
    LIB.lathe(g, [[0, -0.162], [0.06, -0.160], [0.12, -0.154], [0.17, -0.145], [0.182, -0.140]], diff, 0, 0, 0, Object.assign({ seg: 48 }, no));
    // three small retaining screws on the rim
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.4; LIB.cyl(g, 0.003, 0.003, 0.0022, brass, Math.cos(a) * 0.1905, -0.126, Math.sin(a) * 0.1905, { rz: PI / 2, ry: -a, seg: 8, shadow: false }); }
    const L = new THREE.PointLight(0xffc46b, 0.9, 7, 2);
    L.position.set(0, -0.2, 0); L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.camera.near = 0.05;
    g.add(L);
    g.userData.light = L;
    g.userData.focus = { x: 0, y: -0.1, z: 0, r: 0.3 };
    return g;
  };

  // ================================================================ CLOSET
  POOL.closet = function () {
    const g = new THREE.Group(); g.name = 'closet';
    const W = 1.20, H = 2.40, D = 0.62;
    const paintTex = LIB.canvasTex('pool_paint', 512, 512, (c, w, h) => {
      const r = LIB.rnd(4); c.fillStyle = '#ece7dc'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 120, gr = c.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(255,255,250,0.05)' : 'rgba(150,140,120,0.04)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    });
    const paint = LIB.mat({ map: paintTex, rough: 0.42, clearcoat: 0.15, clearcoatRough: 0.5 });
    const paintPlain = LIB.mat({ c: '#e9e4d9', rough: 0.45 });
    // faint shoe scuffs on the bottom door rails (decal)
    const scuffT = LIB.canvasTex('pool_scuff', 256, 64, (c, w, h) => { const r = LIB.rnd(8); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { const x = r() * w, y = 10 + r() * 44; c.strokeStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.5) + ')'; c.lineWidth = 1 + r() * 2.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.4) * 50, y + (r() - 0.5) * 8); c.stroke(); } }, false);
    const scuffM = LIB.mat({ c: '#2e2a26', rough: 0.9, env: 0, transparent: true, opacity: 0.3, alphaMap: scuffT, alphaTest: 0.02 });
    const shadowM = LIB.mat({ c: '#2a2724', rough: 0.9 });
    const nickel = LIB.mat({ c: '#c9c7c2', rough: 0.28, metal: 1 });
    const TK = 0.095, TKset = 0.07, FT = 0.02; // toe kick height & set-back; face frame thickness
    const zF = D; // front plane of the face frame
    // carcass (dark interior shows through gaps)
    rb1(g, W - 0.04, H - 0.06, D - 0.04, 0.002, shadowM, 0, H / 2 - 0.02, D / 2 - 0.01, { shadow: false });
    // end panels (both sides finished)
    [-1, 1].forEach(s => rb(g, 0.019, H, D + 0.004, 0.003, paintPlain, s * (W / 2 - 0.0095), H / 2, D / 2 + 0.002));
    // toe kick (recessed)
    rb1(g, W - 0.04, TK, 0.018, 0.002, paintPlain, 0, TK / 2, D - TKset);
    // face frame: stiles, bottom rail, top rail
    const st = 0.045;
    [-1, 1].forEach(s => rb(g, st, H - TK - 0.06, FT, 0.003, paintPlain, s * (W / 2 - st / 2 - 0.0005), TK + (H - TK - 0.06) / 2, zF - FT / 2));
    rb(g, W - 2 * st, 0.045, FT, 0.003, paintPlain, 0, TK + 0.0225, zF - FT / 2);
    rb(g, W - 2 * st, 0.11, FT, 0.003, paintPlain, 0, H - 0.06 - 0.055, zF - FT / 2);
    // crown: header band + cove + cap
    rb(g, W + 0.03, 0.035, 0.03, 0.004, paintPlain, 0, H - 0.06 + 0.0175, zF + 0.0);
    LIB.cyl(g, 0.012, 0.012, W + 0.05, paintPlain, 0, H - 0.017, zF + 0.012, { rz: PI / 2, seg: 12 });
    rb(g, W + 0.07, 0.018, 0.05, 0.004, paintPlain, 0, H - 0.009, zF + 0.002);
    // base shoe on top of the toe kick
    rb(g, W + 0.004, 0.014, 0.012, 0.004, paintPlain, 0, TK + 0.005, zF + 0.004);
    // doors: shaker style with two recessed panels each, overlay on the face frame
    const dY0 = TK + 0.03, dY1 = H - 0.075, dH = dY1 - dY0, gap = 0.003, dW = (W - 2 * 0.02 - gap) / 2, dT = 0.022, dz = zF + dT / 2 + 0.0015;
    [-1, 1].forEach(s => {
      const cx = s * (gap / 2 + dW / 2), dg = LIB.group(g, cx, dY0 + dH / 2, dz);
      const sw = 0.075, rw = 0.085, mid = -dH / 2 + 0.95;
      // panel slab behind the frame
      rb(dg, dW - 0.02, dH - 0.02, dT * 0.45, 0.002, paint, 0, 0, -dT * 0.18);
      // stiles & rails
      [-1, 1].forEach(k => rb(dg, sw, dH, dT, 0.004, paint, k * (dW / 2 - sw / 2), 0, 0));
      rb(dg, dW - 2 * sw + 0.004, rw, dT, 0.004, paint, 0, dH / 2 - rw / 2, 0);
      rb(dg, dW - 2 * sw + 0.004, rw + 0.02, dT, 0.004, paint, 0, -dH / 2 + (rw + 0.02) / 2, 0);
      rb(dg, dW - 2 * sw + 0.004, rw, dT, 0.004, paint, 0, mid, 0);
      { const sc = LIB.plane(dg, dW - 0.02, 0.09, scuffM, s * 0.01, -dH / 2 + 0.05, dT / 2 + 0.0004); sc.castShadow = false; sc.material.depthWrite = false; }
      // small bevelled raised fields inside the panels
      const pW = dW - 2 * sw - 0.03, upH = dH / 2 - rw - (mid + rw / 2) - 0.03, loH = (mid - rw / 2) - (-dH / 2 + rw + 0.02) - 0.03;
      rb(dg, pW, upH, 0.008, 0.006, paint, 0, (mid + rw / 2 + dH / 2 - rw) / 2, 0.0015);
      rb(dg, pW, loH, 0.008, 0.006, paint, 0, (mid - rw / 2 + (-dH / 2 + rw + 0.02)) / 2, 0.0015);
      // long bar pull near the meeting stiles
      const px = -s * (dW / 2 - 0.038), py = 1.05 - (dY0 + dH / 2);
      LIB.cyl(dg, 0.0065, 0.0065, 0.32, nickel, px, py, 0.042, { seg: 14 });
      [-1, 1].forEach(k => { LIB.cyl(dg, 0.0055, 0.0065, 0.032, nickel, px, py + k * 0.128, 0.026, { rx: PI / 2, seg: 12 }); LIB.cyl(dg, 0.009, 0.009, 0.003, nickel, px, py + k * 0.128, dT / 2 + 0.0015, { rx: PI / 2, seg: 14 }); });
      [-1, 1].forEach(k => LIB.sph(dg, 0.0066, nickel, px, py + k * 0.16, 0.042, { ws: 12, hs: 8 }));
      // butt hinges on the outer edge: three knuckles
      [-dH / 2 + 0.22, 0, dH / 2 - 0.22].forEach(hy => {
        const hx = s * (dW / 2 + 0.002);
        LIB.cyl(dg, 0.0055, 0.0055, 0.075, nickel, hx, hy, -dT / 2 + 0.002, { seg: 10 });
        LIB.sph(dg, 0.0056, nickel, hx, hy + 0.04, -dT / 2 + 0.002, { ws: 10, hs: 6 });
        LIB.cyl(dg, 0.0015, 0.0015, 0.004, nickel, hx, hy - 0.04, -dT / 2 + 0.002, { seg: 6 });
      });
    });
    // hinge-side screws visible on the face frame are omitted (concealed by the knuckles)
    g.userData.focus = { x: 0, y: 1.2, z: D, r: 1.35 };
    return g;
  };

  // ================================================================ CHAIR
  POOL.chair = function () {
    const S = M(), g = new THREE.Group(); g.name = 'chair';
    const wood = LIB.mat({ map: texRepeat(S.oakTex, 1.5, 1.5), rough: 0.5, clearcoat: 0.35, clearcoatRough: 0.3 });
    const woodV = LIB.mat({ map: texRepeat(S.oakTex, 1.5, 0.6, PI / 2), rough: 0.5, clearcoat: 0.35, clearcoatRough: 0.3 });
    const SY = 0.46, ST = 0.026, SW = 0.44, SD = 0.42;
    const fx = 0.195, fz = 0.175, bz = -0.175;
    // seat: thick board with rounded edges, slightly scooped
    const seatShape = new THREE.Shape(); rrPath(seatShape, 0, 0, SW, SD, 0.04);
    const seatGeo = new THREE.ExtrudeGeometry(seatShape, { depth: ST - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 8 });
    seatGeo.rotateX(-PI / 2); seatGeo.translate(0, SY - ST + 0.006, 0);
    { const p = seatGeo.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) > SY - 0.004) { const x = p.getX(i) / (SW / 2), z = p.getZ(i) / (SD / 2); p.setY(i, p.getY(i) - 0.006 * Math.max(0, 1 - x * x) * Math.max(0, 1 - (z + 0.2) * (z + 0.2))); } } seatGeo.computeVertexNormals(); smooth(seatGeo, 0.6); }
    // ExtrudeGeometry uv in metres: scale for the grain
    { const uv = seatGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.8, uv.getY(i) * 1.8); }
    LIB.mesh(g, seatGeo, wood, 0, 0, 0);
    // front legs: tapered square
    [-1, 1].forEach(s => {
      const lg = new THREE.Group(); g.add(lg); lg.position.set(s * fx, 0, fz);
      rb(lg, 0.034, SY - ST, 0.034, 0.006, woodV, 0, (SY - ST) / 2, 0);
      // little chamfered foot pad
      LIB.cyl(lg, 0.012, 0.012, 0.004, S.black, 0, 0.002, 0, { seg: 10 });
    });
    // back legs: one bent piece from floor to the top of the back (side profile extruded across x)
    // build the outline with a smooth curve: front edge then back edge
    const front = new THREE.CatmullRomCurve3([[-0.172, 0.0], [-0.168, 0.25], [-0.166, SY - 0.02], [-0.18, 0.64], [-0.222, 0.895]].map(p => new THREE.Vector3(-p[0], p[1], 0)));
    const back = new THREE.CatmullRomCurve3([[-0.254, 0.895], [-0.214, 0.64], [-0.200, SY - 0.02], [-0.204, 0.25], [-0.208, 0.0]].map(p => new THREE.Vector3(-p[0], p[1], 0)));
    const pts = front.getPoints(14).concat(back.getPoints(14)).map(v => new THREE.Vector2(v.x, v.y));
    const blS = new THREE.Shape(pts);
    const blGeo = new THREE.ExtrudeGeometry(blS, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4 });
    blGeo.translate(0, 0, -0.013); blGeo.rotateY(PI / 2); // shape x (=-z) -> world -z after rotation? rotateY(90): (x,y,z)->(z,y,-x)
    smooth(blGeo, 0.7);
    { const uv = blGeo.attributes.uv; const p = blGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getY(i) * 1.2, (p.getZ(i) + p.getX(i)) * 2); }
    [-1, 1].forEach(s => LIB.mesh(g, blGeo, wood, s * fx, 0, 0));
    // seat aprons (under the seat) between legs
    const aY = SY - ST - 0.035;
    [-1, 1].forEach(s => rb(g, 0.02, 0.06, fz - bz - 0.03, 0.004, wood, s * (fx - 0.004), aY, (fz + bz) / 2 - 0.005));
    rb(g, 2 * fx - 0.03, 0.06, 0.02, 0.004, wood, 0, aY, fz - 0.004);
    rb(g, 2 * fx - 0.03, 0.06, 0.02, 0.004, wood, 0, aY, bz - 0.008);
    // stretchers: two side, one middle (H)
    const stM = woodV;
    [-1, 1].forEach(s => LIB.cyl(g, 0.0095, 0.0095, fz - bz + 0.02, wood, s * fx, 0.16, (fz + bz) / 2 - 0.01, { rx: PI / 2, seg: 12 }));
    LIB.cyl(g, 0.009, 0.009, 2 * fx, wood, 0, 0.17, -0.005, { rz: PI / 2, seg: 12 });
    LIB.cyl(g, 0.0085, 0.0085, 2 * fx, wood, 0, 0.22, fz, { rz: PI / 2, seg: 12 });
    // back: curved crest rail + lower rail + 5 spindles
    const CW = 2 * fx - 0.01, bow = (x) => 0.03 * (1 - Math.pow(x / (CW / 2), 2));
    const crest = (y, h, t, zc) => {
      const n = 12, sh = new THREE.Shape();
      for (let i = 0; i <= n; i++) { const x = -CW / 2 + CW * i / n; const z = zc - bow(x); i ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
      for (let i = n; i >= 0; i--) { const x = -CW / 2 + CW * i / n; sh.lineTo(x, -(zc - bow(x) - t)); }
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: h - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 });
      geo.rotateX(-PI / 2); geo.translate(0, y + 0.004, 0); smooth(geo, 0.6);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 3);
      return LIB.mesh(g, geo, wood, 0, 0, 0);
    };
    crest(0.80, 0.075, 0.024, -0.212);
    crest(0.555, 0.04, 0.02, -0.172);
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.064, zb = -0.182 - bow(x), zt = -0.224 - bow(x);
      const len = Math.hypot(0.215, zt - zb);
      const sp = LIB.lathe(g, [[0.0072, 0], [0.0085, 0.045], [0.0068, len * 0.5], [0.0062, len - 0.03], [0.0072, len]], woodV, x, 0.59, zb, { seg: 10 });
      sp.rotation.x = Math.atan2(zt - zb, 0.215);
    }
    g.userData.seatY = SY;
    g.userData.focus = { x: 0, y: 0.5, z: 0, r: 0.55 };
    return g;
  };

  // ================================================================ BOOMBOX
  POOL.boombox = function () {
    const g = new THREE.Group(); g.name = 'boombox';
    const W = 0.50, BH = 0.228, D = 0.15, Y0 = 0.012, YC = Y0 + BH / 2, ZF = D / 2;
    const plastic = LIB.mat({ c: '#121212', rough: 0.45, bump: texRepeat(M().fine, 6, 6), bumpScale: 0.0003 });
    const silver = LIB.mat({ c: '#b9bbbd', rough: 0.32, metal: 1, bump: texRepeat(LIB.noiseTex('pool_brush2', 256, 128, 90, 0), 1, 40), bumpScale: 0.0002 });
    const chrome = LIB.mat({ c: '#e4e6e8', rough: 0.12, metal: 1, side: THREE.DoubleSide });
    const darkGrey = LIB.mat({ c: '#2c2d2f', rough: 0.5, metal: 0.3 });
    const rubber = LIB.mat({ c: '#0a0a0a', rough: 0.9 });
    // body
    rb(g, W, BH, D, 0.022, plastic, 0, YC, 0, { seg: 3 });
    // silver front fascia (inset frame) with printed legend
    const legend = LIB.canvasTex('pool_bbface', 1024, 480, (c, w, h) => {
      c.fillStyle = '#c3c5c7'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.06) + ')'; c.fillRect(0, y, w, 1); }
      c.fillStyle = '#26282a'; c.font = 'bold 15px Arial'; c.textAlign = 'center';
      c.fillText('STEREO RADIO CASSETTE RECORDER', w / 2, h - 18);
      c.font = '11px Arial'; c.fillText('4 BAND  ·  FM STEREO / MW / SW1 / SW2', w / 2, 24);
      c.font = 'bold 10px Arial'; c.fillText('VU', 392, h * 0.875);
    });
    const face = LIB.mat({ map: legend, rough: 0.35, metal: 0.85 });
    rb(g, W - 0.02, BH - 0.032, 0.006, 0.006, face, 0, YC - 0.002, ZF - 0.0015);
    // speakers
    const cones = [];
    const holes = LIB.canvasTex('pool_grille', 256, 256, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#000'; for (let y = 0, row = 0; y < h + 8; y += 6.5, row++) for (let x = (row % 2) * 3.75; x < w + 8; x += 7.5) { c.beginPath(); c.arc(x, y, 3.0, 0, TAU); c.fill(); } });
    const grilleM = LIB.mat({ c: '#151617', rough: 0.45, metal: 0.4, alphaMap: holes, alphaTest: 0.5, side: THREE.DoubleSide });
    const coneTex = LIB.canvasTex('pool_cone', 256, 64, (c, w, h) => { c.fillStyle = '#9a9c9e'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, 0, 2, h); } for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, y, w, 3); } });
    const coneM = LIB.mat({ map: coneTex, rough: 0.45, metal: 0.6, side: THREE.DoubleSide });
    const surroundM = LIB.mat({ c: '#151515', rough: 0.6 });
    const capM = LIB.mat({ c: '#d8dadc', rough: 0.15, metal: 1, side: THREE.DoubleSide });
    [-1, 1].forEach(s => {
      const sg = LIB.group(g, s * 0.152, YC - 0.006, ZF);
      // chrome trim ring
      LIB.lathe(sg, [[0.074, 0.0], [0.080, 0.003], [0.084, 0.008], [0.083, 0.011], [0.079, 0.012], [0.075, 0.009], [0.074, 0.0]], chrome, 0, 0, 0, { rx: PI / 2, seg: 48 });
      // dark recess cup
      LIB.lathe(sg, [[0.074, 0.0], [0.074, -0.03], [0.0, -0.03]], darkGrey, 0, 0, 0, { rx: PI / 2, seg: 36 }).material = LIB.mat({ c: '#0c0c0c', rough: 0.9, side: THREE.DoubleSide });
      // grille (domed slightly)
      const gr = LIB.lathe(sg, [[0, 0.0085], [0.03, 0.008], [0.06, 0.0065], [0.0745, 0.0045]], grilleM, 0, 0, 0, { rx: PI / 2, seg: 40 });
      gr.geometry.attributes.uv && (() => { const p = gr.geometry.attributes.position, uv = gr.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 6.5 + 0.5, p.getZ(i) * 6.5 + 0.5); })();
      // woofer (moves): surround roll, cone, dust cap
      const cg = LIB.group(sg, 0, 0, -0.012); cones.push(cg);
      LIB.torus(cg, 0.064, 0.005, surroundM, 0, 0, -0.001, { rs: 8, ts: 40 });
      LIB.lathe(cg, [[0.062, 0], [0.045, -0.006], [0.03, -0.011], [0.019, -0.014]], coneM, 0, 0, 0, { rx: PI / 2, seg: 36 });
      LIB.lathe(cg, [[0.0195, -0.0135], [0.016, -0.009], [0.009, -0.0065], [0.0, -0.0058]], capM, 0, 0, 0, { rx: PI / 2, seg: 24 });
    });
    // centre section: tuning dial window (backlit), cassette door with window, VU LEDs
    const dialTex = LIB.canvasTex('pool_dial', 512, 96, (c, w, h) => {
      c.fillStyle = '#f2e3b8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a2116'; c.font = 'bold 13px Arial'; c.textAlign = 'center';
      const bands = [['FM', ['88', '92', '96', '100', '104', '108'], 22], ['MW', ['53', '60', '70', '90', '120', '160'], 48], ['SW', ['6', '7', '9', '12', '15', '18'], 74]];
      bands.forEach(([n, nums, y]) => { c.textAlign = 'left'; c.fillText(n, 6, y + 4); c.textAlign = 'center'; nums.forEach((t, i) => c.fillText(t, 70 + i * 84, y + 4)); for (let x = 60; x < w - 10; x += 8.4) { c.fillRect(x, y + 8, 1, 3); } });
      c.fillStyle = '#c4161c'; c.fillRect(205, 6, 3, h - 12);
    });
    const dialM = LIB.mat({ map: dialTex, emissive: '#ffd890', emissiveMap: dialTex, emissiveIntensity: 0.9, rough: 0.2 });
    rb(g, 0.13, 0.034, 0.006, 0.003, darkGrey, 0, YC + 0.076, ZF + 0.001);
    const dial = LIB.plane(g, 0.122, 0.026, dialM, 0, YC + 0.076, ZF + 0.0045);
    LIB.plane(g, 0.122, 0.026, LIB.mat({ c: '#ffffff', rough: 0.05, transparent: true, opacity: 0.12, env: 1.2 }), 0, YC + 0.076, ZF + 0.005);
    // cassette door: black slab, cassette behind a smoked window cut in a silver plate
    const doorG = LIB.group(g, 0, YC - 0.006, ZF + 0.001);
    rb(doorG, 0.124, 0.098, 0.008, 0.004, plastic, 0, 0, 0.002);
    const cas = LIB.group(doorG, 0, 0.006, 0.0062);
    rb1(cas, 0.1, 0.062, 0.003, 0.003, LIB.mat({ c: '#3a3836', rough: 0.5 }), 0, 0, 0.0);
    const casLabel = LIB.canvasTex('pool_casl', 256, 160, (c, w, h) => { c.fillStyle = '#e8e2d2'; c.fillRect(0, 0, w, h); c.fillStyle = '#c33'; c.fillRect(0, 18, w, 8); c.fillStyle = '#333'; c.font = 'italic 20px Georgia'; c.fillText('mix  -  side A', 18, 52); c.fillStyle = '#4a4542'; c.fillRect(40, 70, 176, 62); c.fillStyle = '#6b4a2e'; c.fillRect(50, 76, 156, 50); });
    LIB.plane(cas, 0.094, 0.056, LIB.mat({ map: casLabel, rough: 0.7 }), 0, 0, 0.0016);
    [-1, 1].forEach(s => {
      LIB.cyl(cas, 0.0105, 0.0105, 0.0012, LIB.mat({ c: '#3b2416', rough: 0.4 }), s * 0.022, -0.004, 0.0018, { rx: PI / 2, seg: 24 });
      LIB.cyl(cas, 0.0052, 0.0052, 0.0016, LIB.mat({ c: '#f2f2f2', rough: 0.4 }), s * 0.022, -0.004, 0.0022, { rx: PI / 2, seg: 6 });
      LIB.cyl(cas, 0.0022, 0.0022, 0.0018, LIB.mat({ c: '#111', rough: 0.6 }), s * 0.022, -0.004, 0.0024, { rx: PI / 2, seg: 8 });
    });
    const plateS = new THREE.Shape(); rrPath(plateS, 0, 0, 0.118, 0.092, 0.004); const win = new THREE.Path(); rrPath(win, 0, 0.002, 0.086, 0.036, 0.004); plateS.holes.push(win);
    LIB.extrude(doorG, plateS, 0.0012, silver, 0, 0, 0.0092, { bevelT: 0.0004, bevelS: 0.0006, curve: 6 });
    LIB.plane(doorG, 0.088, 0.038, LIB.mat({ c: '#1b1a19', rough: 0.05, transparent: true, opacity: 0.32, env: 1.3 }), 0, 0.002, 0.0094);
    // eject label
    rb1(doorG, 0.02, 0.006, 0.0015, 0.001, LIB.mat({ c: '#1a1a1a', rough: 0.6 }), 0, -0.038, 0.0102);
    // VU meter LEDs
    const leds = [];
    for (let i = 0; i < 10; i++) {
      const col = i < 6 ? '#3dff6a' : i < 8 ? '#ffd23d' : '#ff3d2e';
      const m = LIB.mat({ c: i < 6 ? '#0f3a18' : i < 8 ? '#3a300f' : '#3a120f', emissive: col, emissiveIntensity: 0.0, rough: 0.25 });
      leds.push(m); rb1(g, 0.008, 0.005, 0.003, 0.001, m, -0.046 + i * 0.0102, YC - 0.074, ZF + 0.002, { shadow: false });
    }
    // power LED
    const pled = LIB.mat({ c: '#3a0d0d', emissive: '#ff2a1a', emissiveIntensity: 1.5, rough: 0.2 });
    LIB.sph(g, 0.0026, pled, 0.058, YC - 0.074, ZF + 0.002, { ws: 10, hs: 6 });
    // top: piano-key cassette buttons, knobs
    const keyCols = ['#d81d1d', '#1b1b1b', '#1b1b1b', '#1b1b1b', '#1b1b1b', '#1b1b1b'];
    const topY = Y0 + BH;
    keyCols.forEach((c, i) => { rb(g, 0.0175, 0.012, 0.04, 0.003, LIB.mat({ c: c, rough: 0.35 }), -0.05 + i * 0.02, topY + 0.003, ZF - 0.03); rb1(g, 0.012, 0.002, 0.012, 0.0008, silver, -0.05 + i * 0.02, topY + 0.0095, ZF - 0.022); });
    // tuning / volume knobs on the top right
    [[0.12, '#1b1b1b'], [0.17, '#1b1b1b']].forEach(([x]) => { LIB.cyl(g, 0.013, 0.014, 0.014, chrome, x, topY + 0.007, 0.03, { seg: 24 }); LIB.cyl(g, 0.0115, 0.0115, 0.002, darkGrey, x, topY + 0.0145, 0.03, { seg: 24 }); });
    // band selector slide on top left
    rb1(g, 0.06, 0.002, 0.008, 0.001, LIB.mat({ c: '#050505', rough: 0.9 }), -0.15, topY + 0.0005, 0.03);
    rb(g, 0.01, 0.008, 0.012, 0.002, chrome, -0.165, topY + 0.004, 0.03);
    // carrying handle: chrome tube on two pivot mounts
    [-1, 1].forEach(s => { rb(g, 0.02, 0.016, 0.03, 0.005, plastic, s * 0.2, topY + 0.006, -0.02); LIB.cyl(g, 0.007, 0.007, 0.024, chrome, s * 0.2, topY + 0.012, -0.02, { rz: PI / 2, seg: 12 }); });
    LIB.tube(g, [[-0.2, topY + 0.012, -0.02], [-0.19, topY + 0.04, -0.02], [-0.16, topY + 0.052, -0.02], [0.16, topY + 0.052, -0.02], [0.19, topY + 0.04, -0.02], [0.2, topY + 0.012, -0.02]], 0.0065, chrome, { segs: 40, radial: 10 });
    // grip sleeve
    LIB.cyl(g, 0.0095, 0.0095, 0.14, rubber, 0, topY + 0.052, -0.02, { rz: PI / 2, seg: 14 });
    // telescopic antenna, swivelling from the back right corner
    const ant = LIB.group(g, 0.225, topY - 0.01, -D / 2 + 0.01); ant.rotation.z = 0.85; ant.rotation.x = -0.12;
    LIB.cyl(ant, 0.006, 0.006, 0.016, chrome, 0, 0.0, 0, { seg: 12 });
    const segL = [0.1, 0.085, 0.07, 0.06], segR = [0.0042, 0.0035, 0.0028, 0.0021]; let ay = 0.008;
    segL.forEach((L, i) => { LIB.cyl(ant, segR[i], segR[i], L, chrome, 0, ay + L / 2, 0, { seg: 10 }); ay += L - 0.006; });
    LIB.sph(ant, 0.0036, chrome, 0, ay + 0.006, 0, { ws: 10, hs: 8 });
    // feet
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => LIB.cyl(g, 0.012, 0.013, Y0, rubber, sx * 0.2, Y0 / 2, sz * 0.05, { seg: 14 })));
    // side jack + back battery door seam
    rb1(g, 0.003, 0.03, 0.05, 0.001, LIB.mat({ c: '#050505', rough: 0.9 }), W / 2 + 0.0005, YC, 0, { shadow: false });
    rb1(g, 0.28, 0.12, 0.002, 0.002, LIB.mat({ c: '#0a0a0a', rough: 0.6 }), 0, YC - 0.02, -D / 2 - 0.0005, { shadow: false });
    // screws on the face
    [[-0.235, YC + 0.1], [0.235, YC + 0.1], [-0.235, YC - 0.1], [0.235, YC - 0.1]].forEach(([x, y]) => LIB.cyl(g, 0.0028, 0.0028, 0.002, chrome, x, y, ZF + 0.0012, { rx: PI / 2, seg: 10, shadow: false }));
    const base = cones.map(c => c.position.z);
    let on = true;
    g.userData.pulse = function (k) {
      k = clamp(k || 0, 0, 1);
      cones.forEach((c, i) => { c.position.z = base[i] + k * 0.004; });
      const n = Math.round(k * leds.length);
      leds.forEach((m, i) => { m.emissiveIntensity = on && i < n ? 1.4 : 0.0; });
    };
    g.userData.setOn = function (v) {
      on = !!v; pled.emissiveIntensity = on ? 1.5 : 0; dialM.emissiveIntensity = on ? 0.9 : 0.0;
      if (!on) leds.forEach(m => { m.emissiveIntensity = 0; });
    };
    g.userData.cones = cones;
    g.userData.focus = { x: 0, y: 0.13, z: 0, r: 0.32 };
    return g;
  };

  // ================================================================ CUE RACK
  function cue(parent, x, y, z, style) {
    const S = M(), cg = LIB.group(parent, x, y, z);
    const st = style || {};
    const lat = (pts, mat, seg) => LIB.lathe(cg, pts, mat, 0, 0, 0, { seg: seg || 16 });
    const butt = LIB.mat({ map: texRepeat(st.buttTex || S.mahTex, 1, 1, PI / 2), rough: 0.25, clearcoat: 0.9, clearcoatRough: 0.06 });
    const maple = LIB.mat({ map: texRepeat(S.mapleTex, 1, 1, PI / 2), rough: 0.35, clearcoat: 0.5, clearcoatRough: 0.15 });
    const wrapTex = LIB.canvasTex('pool_wrap_' + (st.wrap || 'k'), 64, 256, (c, w, h) => { c.fillStyle = st.wrap || '#161616'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 3) { c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(0, y, w, 1); } });
    const wrap = LIB.mat({ map: wrapTex, rough: 0.8, bump: wrapTex, bumpScale: 0.0004 });
    const pts = LIB.canvasTex('pool_points_' + (st.point || 'e'), 256, 256, (c, w, h) => {
      c.fillStyle = '#e0c398'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) { const cx = (i + 0.5) * w / 4; c.fillStyle = st.veneer || '#d33'; c.beginPath(); c.moveTo(cx - 30, h); c.lineTo(cx, 18); c.lineTo(cx + 30, h); c.fill(); c.fillStyle = st.point || '#1a0f0a'; c.beginPath(); c.moveTo(cx - 25, h); c.lineTo(cx, 30); c.lineTo(cx + 25, h); c.fill(); }
      c.fillStyle = 'rgba(40,20,10,0.2)'; for (let y = 0; y < h; y += 5) c.fillRect(0, y, w, 1);
    });
    const fore = LIB.mat({ map: pts, rough: 0.25, clearcoat: 0.9, clearcoatRough: 0.06 });
    const ring = LIB.mat({ c: '#f0ece2', rough: 0.25, clearcoat: 0.6 });
    const metalRing = S.steel;
    lat([[0, 0], [0.0145, 0.0], [0.0152, 0.004], [0.0152, 0.012], [0, 0.012]], S.black);                 // rubber bumper
    lat([[0.0154, 0.012], [0.0154, 0.016]], ring);
    lat([[0.0154, 0.016], [0.0151, 0.22], [0.0150, 0.29]], butt);                                    // butt sleeve
    lat([[0.0151, 0.29], [0.0151, 0.297]], metalRing);
    lat([[0.0146, 0.297], [0.0143, 0.55]], wrap);                                                     // wrap
    lat([[0.0145, 0.55], [0.0145, 0.556]], ring);
    lat([[0.0143, 0.556], [0.0130, 0.735]], fore);                                                    // forearm with points
    lat([[0.0131, 0.735], [0.0131, 0.756], [0.0128, 0.758]], ring);                                   // joint collar
    lat([[0.0127, 0.758], [0.0115, 0.95], [0.0085, 1.25], [0.0066, 1.445]], maple);                   // shaft
    lat([[0.0066, 1.445], [0.0064, 1.462]], LIB.mat({ c: '#f4f1e8', rough: 0.3 }));                   // ferrule
    lat([[0.0064, 1.462], [0.0063, 1.468], [0.0045, 1.4715], [0, 1.4725]], LIB.mat({ c: '#3a6fb5', rough: 0.95 })); // chalked tip
    return cg;
  }
  POOL.cue = function (style) { const g = new THREE.Group(); cue(g, 0, 0, 0, style); return g; };

  POOL.cueRack = function () {
    const S = M(), g = new THREE.Group(); g.name = 'cueRack';
    const wood = S.mahog, woodBox = S.mahogBox, woodV = LIB.mat({ map: texRepeat(S.mahTex, 3, 0.5, PI / 2), rough: 0.42, clearcoat: 0.55, clearcoatRough: 0.22 });
    const Y0 = 0.45, Y1 = 1.95, W = 0.60;
    const brass = S.brass;
    // two uprights
    [-1, 1].forEach(s => {
      rb(g, 0.05, Y1 - Y0, 0.026, 0.006, woodV, s * (W / 2 - 0.025), (Y0 + Y1) / 2, 0.013);
      // brass mounting screws (top & bottom)
      [Y0 + 0.11, Y1 - 0.08].forEach(y => { LIB.cyl(g, 0.0045, 0.0045, 0.002, brass, s * (W / 2 - 0.025), y, 0.0265, { rx: PI / 2, seg: 12 }); rb1(g, 0.006, 0.0012, 0.0006, 0.0002, LIB.mat({ c: '#5a4a2a', rough: 0.6, metal: 1 }), s * (W / 2 - 0.025), y, 0.0276, { rz: 0.6, shadow: false }); });
    });
    // crown at top with arched shape
    const crownS = new THREE.Shape(); crownS.moveTo(-W / 2, 0); crownS.lineTo(W / 2, 0); crownS.lineTo(W / 2, 0.07); crownS.quadraticCurveTo(W / 4, 0.07, 0.08, 0.1); crownS.quadraticCurveTo(0, 0.125, -0.08, 0.1); crownS.quadraticCurveTo(-W / 4, 0.07, -W / 2, 0.07); crownS.closePath();
    const crown = LIB.extrude(g, crownS, 0.016, woodBox, 0, Y1 - 0.075, 0.012, { bevelT: 0.003, bevelS: 0.003, curve: 16 });
    { const uv = crown.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 2.5); }
    // top clip bar with notches for the cues
    const slots = [-0.2, -0.12, -0.04, 0.04, 0.12, 0.2], CZ = 0.07;
    const barS = new THREE.Shape(); barS.moveTo(-W / 2 + 0.05, 0); barS.lineTo(W / 2 - 0.05, 0); barS.lineTo(W / 2 - 0.05, 0.09);
    for (let i = slots.length - 1; i >= 0; i--) { const sx = slots[i]; barS.lineTo(sx + 0.0105, 0.09); barS.absarc(sx, CZ, 0.0105, 0, PI, true); barS.lineTo(sx - 0.0105, 0.09); }
    barS.lineTo(-W / 2 + 0.05, 0.09); barS.closePath();
    // shape (x, y) -> world (x, -z)... build in xz: extrude along y
    const barGeo = new THREE.ExtrudeGeometry(barS, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 });
    barGeo.rotateX(PI / 2); // shape y -> world z ; extrusion -> world -y
    { const uv = barGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 3); }
    LIB.mesh(g, barGeo, woodBox, 0, Y1 - 0.11, 0);
    // butt holder: thick block with round sockets
    const holdY = Y0 + 0.19;
    const holdS = new THREE.Shape(); rrPath(holdS, 0, 0.05, W - 0.1, 0.1, 0.012);
    slots.forEach(sx => { const h = new THREE.Path(); h.absarc(sx, CZ, 0.0185, 0, TAU, false); holdS.holes.push(h); });
    const holdGeo = new THREE.ExtrudeGeometry(holdS, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 16 });
    holdGeo.rotateX(PI / 2);
    { const uv = holdGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6, uv.getY(i) * 3); }
    LIB.mesh(g, holdGeo, woodBox, 0, holdY + 0.04, 0);
    // felt in the bottom of the sockets
    slots.forEach(sx => LIB.cyl(g, 0.0185, 0.0185, 0.004, LIB.mat({ c: '#1e5a32', rough: 1 }), sx, holdY - 0.0, CZ, { seg: 16 }));
    // bottom: ball shelf with a front lip and eight cups
    const shelfY = Y0 + 0.03;
    rb(g, W - 0.1, 0.022, 0.1, 0.005, woodBox, 0, shelfY, 0.05);
    rb(g, W - 0.1, 0.03, 0.012, 0.004, woodBox, 0, shelfY + 0.018, 0.096);
    // shelf bracket corbels
    [-1, 1].forEach(s => { const cs = polyShape([[0, 0], [0.014, 0], [0.085, 0.058], [0.085, 0.07], [0, 0.07]]); LIB.extrude(g, cs, 0.02, woodBox, s * (W / 2 - 0.06), shelfY - 0.08, 0, { ry: -PI / 2, bevelT: 0.002, bevelS: 0.002 }); });
    const cupM = LIB.mat({ c: '#2a1208', rough: 0.6 });
    const ballNums = [8, 1, 12, 3, 15, 4, 10, 6];
    ballNums.forEach((n, i) => {
      const x = -0.2275 + i * 0.065;
      LIB.torus(g, 0.019, 0.004, cupM, x, shelfY + 0.011, 0.05, { rx: PI / 2, rs: 8, ts: 20 });
      ball(g, n, x, shelfY + 0.011 + 0.0205, 0.05, 100 + i * 17);
    });
    // chalk cube on the butt holder's top, right end, and a second worn one
    const chalkTex = LIB.canvasTex('pool_chalk', 128, 128, (c, w, h) => { c.fillStyle = '#2f6fbf'; c.fillRect(0, 0, w, h); const r = LIB.rnd(2); for (let i = 0; i < 300; i++) { c.fillStyle = 'rgba(255,255,255,' + r() * 0.12 + ')'; c.fillRect(r() * w, r() * h, 2, 2); } c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'bold 18px Arial'; c.textAlign = 'center'; c.fillText('CHALK', w / 2, h / 2 + 6); });
    const chalk = LIB.mat({ map: chalkTex, rough: 0.95 });
    const ch = rb(g, 0.022, 0.022, 0.022, 0.002, chalk, 0.235, holdY + 0.051, 0.06, { ry: 0.3 });
    // worn cavity on top
    const cav = LIB.cyl(g, 0.0075, 0.0055, 0.0008, LIB.mat({ c: '#1d4f92', rough: 1 }), 0.235, holdY + 0.0622, 0.06, { seg: 16 }); cav.castShadow = false;
    // dust on the holder near the chalk
    const dust = LIB.plane(g, 0.06, 0.04, LIB.mat({ c: '#4f86cc', rough: 1, transparent: true, opacity: 0.25 }), 0.22, holdY + 0.0446, 0.06, { rx: -PI / 2 }); dust.castShadow = false;
    // four cues standing in slots 0,1,3,5
    const styles = [{ wrap: '#161616', veneer: '#c22', point: '#120a06' }, { wrap: '#1d2f5a', veneer: '#eee', point: '#3a1408', buttTex: grainTex('pool_rose', '#6e2416', '#2a0c06', 41, 18) }, { wrap: '#2a2a2a', veneer: '#2a6', point: '#0e0e0e', buttTex: grainTex('pool_ebony', '#2a1c16', '#0a0605', 31, 20) }, { wrap: '#5a1414', veneer: '#d9b', point: '#2a170c' }];
    [0, 1, 3, 5].forEach((si, i) => { const c = cue(g, slots[si], holdY + 0.002, CZ, styles[i]); c.rotation.y = i * 1.3; c.rotation.z = (i - 1.5) * 0.002; });
    g.userData.focus = { x: 0, y: 1.2, z: 0.06, r: 0.85 };
    return g;
  };
})();
