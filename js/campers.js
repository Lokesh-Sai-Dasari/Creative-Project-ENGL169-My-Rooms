/* Campfire — "me, with the guitar" and "the girl beside me": two young people sitting on a log by a campfire.
   CAMPERS.build() -> THREE.Group. Origin on the ground at the centre of the log. The log itself is NOT built here: it is
   a horizontal cylinder along x, radius 0.18, axis at y = 0.20 (top ~0.38). They face +z (the fire is at z ~ +1.5).
     him (x ~ -0.35): young man with an acoustic guitar in playing position (body on his right thigh, neck to his left,
       left hand fretting a G chord at frets 2-3, right forearm over the upper bout, pick in the right hand)
     her (x ~ +0.35): young woman, turned ~20 deg towards him, hands resting on her thighs, watching him play
   Animation (only his right forearm, hand and pick move):
     userData.setStrum(v)   amplitude 0..1 (0 = completely still, pick resting just above the low E string)
     userData.tick(t, dt)   when amplitude > 0: a downstroke across all six strings then a relaxed upstroke clear of the
                            strings, every ~0.7 s; if strumNow() was called in the last 2 s it only animates those strokes
     userData.strumNow()    trigger one downstroke immediately (scaled by the current amplitude envelope)
   Bodies are signed-distance fields polygonised with surface nets (technique and much helper code from friend.js / mom.js);
   the guitar is the bedroom wall guitar from props_b.js (without its hanger). */
(function () {
  'use strict';
  const L = window.LIB;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const A3 = (v) => [v.x, v.y, v.z];

  // ------------------------------------------------------------------ SDF primitives
  function sdCap(px, py, pz, a, b, ra, rb) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], pax = px - a[0], pay = py - a[1], paz = pz - a[2];
    const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
    return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - (ra + (rb - ra) * t);
  }
  function capT(px, py, pz, a, b) { // parameter along a->b (unclamped)
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    return ((px - a[0]) * bax + (py - a[1]) * bay + (pz - a[2]) * baz) / (bax * bax + bay * bay + baz * baz);
  }
  function sdEll(px, py, pz, c, r) {
    const x = px - c[0], y = py - c[1], z = pz - c[2], rx = r[0], ry = r[1], rz = r[2];
    const k0 = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz));
    const k1 = Math.sqrt(x * x / (rx * rx * rx * rx) + y * y / (ry * ry * ry * ry) + z * z / (rz * rz * rz * rz));
    return k1 < 1e-12 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  }
  function sdRBox(px, py, pz, hx, hy, hz, r) {
    const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  function table(rows) {
    const n = rows.length, m = rows[0].length - 1, out = new Float64Array(m);
    const tan = rows.map((r, i) => { const a = rows[Math.max(0, i - 1)], b = rows[Math.min(n - 1, i + 1)], o = []; for (let k = 1; k <= m; k++) o.push((b[k] - a[k]) / (b[0] - a[0])); return o; });
    return function (y) {
      if (y <= rows[0][0]) { for (let k = 0; k < m; k++) out[k] = rows[0][k + 1]; return out; }
      if (y >= rows[n - 1][0]) { for (let k = 0; k < m; k++) out[k] = rows[n - 1][k + 1]; return out; }
      let i = 0; while (rows[i + 1][0] < y) i++;
      const a = rows[i], b = rows[i + 1], h = b[0] - a[0], t = (y - a[0]) / h, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      for (let k = 0; k < m; k++) out[k] = h00 * a[k + 1] + h10 * h * tan[i][k] + h01 * b[k + 1] + h11 * h * tan[i + 1][k];
      return out;
    };
  }
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash(a * 157 + b * 113 + c * 271);
    const l = (a, b, t) => a + (b - a) * t;
    return 2 * l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), ux), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux), uy),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux), uy), uz) - 1;
  }

  // ------------------------------------------------------------------ meshing helpers (friend.js)
  function surfaceNets(f, b0, b1, cs) {
    const nx = Math.ceil((b1[0] - b0[0]) / cs) + 1, ny = Math.ceil((b1[1] - b0[1]) / cs) + 1, nz = Math.ceil((b1[2] - b0[2]) / cs) + 1;
    const F = new Float32Array(nx * ny * nz), I = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[I(i, j, k)] = f(b0[0] + i * cs, b0[1] + j * cs, b0[2] + k * cs);
    const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k), vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { cv[c] = F[I(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const e of E) {
        const a = cv[e[0]], b = cv[e[1]]; if ((a < 0) === (b < 0)) continue; const t = a / (a - b);
        const ax = e[0] & 1, ay = (e[0] >> 1) & 1, az = (e[0] >> 2) & 1, bx = e[1] & 1, by = (e[1] >> 1) & 1, bz = (e[1] >> 2) & 1;
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; sz += az + (bz - az) * t; n++;
      }
      vid[C(i, j, k)] = pos.length / 3; pos.push(b0[0] + (i + sx / n) * cs, b0[1] + (j + sy / n) * cs, b0[2] + (k + sz / n) * cs);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i + 1, j, k)] < 0; if (a === b) continue; quad(vid[C(i, j - 1, k - 1)], vid[C(i, j, k - 1)], vid[C(i, j, k)], vid[C(i, j - 1, k)], !a); }
    for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i, j + 1, k)] < 0; if (a === b) continue; quad(vid[C(i - 1, j, k - 1)], vid[C(i - 1, j, k)], vid[C(i, j, k)], vid[C(i, j, k - 1)], !a); }
    for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const a = F[I(i, j, k)] < 0, b = F[I(i, j, k + 1)] < 0; if (a === b) continue; quad(vid[C(i - 1, j - 1, k)], vid[C(i, j - 1, k)], vid[C(i, j, k)], vid[C(i - 1, j, k)], !a); }
    const nrm = [], h = cs * 0.35;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h), l = Math.hypot(gx, gy, gz) || 1; nrm.push(gx / l, gy / l, gz / l);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const uv = []; for (let v = 0; v < pos.length; v += 3) { const ax = Math.abs(nrm[v]), ay = Math.abs(nrm[v + 1]), az = Math.abs(nrm[v + 2]); if (ay >= ax && ay >= az) uv.push(pos[v] * 20, pos[v + 2] * 20); else if (ax >= az) uv.push(pos[v + 2] * 20, pos[v + 1] * 20); else uv.push(pos[v] * 20, pos[v + 1] * 20); } g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }
  function loft(rows, closed, uvf) {
    const S = rows.length, T = rows[0].length, TT = closed ? T + 1 : T, pos = [], uv = [], idx = [];
    for (let i = 0; i < S; i++) for (let j = 0; j < TT; j++) { const p = rows[i][j % T]; pos.push(p[0], p[1], p[2]); const u = uvf ? uvf(i, j, p) : [j / (TT - 1), 1 - i / (S - 1)]; uv.push(u[0], u[1]); }
    for (let i = 0; i < S - 1; i++) for (let j = 0; j < TT - 1; j++) { const a = i * TT + j, b = a + TT; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    if (closed) { const n = g.attributes.normal; for (let i = 0; i < S; i++) { const a = i * TT, b = a + T; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); } }
    return g;
  }
  function vcol(geo, fn) {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
  }
  function clipGeo(g, keep) {
    const p = g.attributes.position, ix = g.index.array, out = [];
    for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (keep((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3)) out.push(a, b, c); }
    g.setIndex(out); return g;
  }
  function tris(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
  function strandGeo(strands) {
    const pos = [], col = [], idx = [], uv = [];
    for (const s of strands) {
      const P = s.pts, n = P.length, base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], t = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
        const nn = V(s.nrm[0], s.nrm[1], s.nrm[2]), side = t.clone().cross(nn).normalize();
        const w = s.w * (1 - 0.85 * i / (n - 1)) * 0.5;
        pos.push(P[i][0] - side.x * w, P[i][1] - side.y * w, P[i][2] - side.z * w, P[i][0] + side.x * w, P[i][1] + side.y * w, P[i][2] + side.z * w);
        for (let k = 0; k < 2; k++) col.push(s.c[0], s.c[1], s.c[2]);
        uv.push(0, i / (n - 1), 1, i / (n - 1));
        if (i < n - 1) { const q = base + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function mergeGeos(list) {
    let nv = 0; list.forEach(g => { nv += g.attributes.position.count; });
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = []; let o = 0;
    list.forEach(g => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.color) C.set(g.attributes.color.array, o * 3); else C.fill(1, o * 3, (o + g.attributes.position.count) * 3); U.set(g.attributes.uv.array, o * 2); for (const v of g.index.array) I.push(v + o); o += g.attributes.position.count; });
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); mg.setAttribute('color', new THREE.BufferAttribute(C, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(U, 2)); mg.setIndex(I);
    return mg;
  }
  function gradAt(f, x, y, z, h) { const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h), l = Math.hypot(gx, gy, gz) || 1; return [gx / l, gy / l, gz / l]; }
  function project(f, p, off) { let x = p[0], y = p[1], z = p[2]; for (let i = 0; i < 8; i++) { const d = f(x, y, z) - (off || 0), g = gradAt(f, x, y, z, 0.0008); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; } return [x, y, z]; }
  // ambient occlusion from the distance field: how much the field closes in along the normal
  function sdfAO(f, x, y, z, nx, ny, nz, h0, k) {
    let o = 0, w = 1;
    for (let i = 1; i <= 4; i++) { const h = h0 * i, d = f(x + nx * h, y + ny * h, z + nz * h); o += w * Math.max(0, h - d) / h; w *= 0.6; }
    return clamp(1 - k * o, 0.25, 1);
  }
  function aoCol(geo, f, h0, k, base) { // multiply/initialise vertex colours with SDF AO
    const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color ? geo.attributes.color.array : null, out = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const a = sdfAO(f, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), h0, k);
      for (let j = 0; j < 3; j++) out[i * 3 + j] = (c ? c[i * 3 + j] : (base ? base[j] : 1)) * a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 3)); return geo;
  }
  function ik(S, W, L1, L2, pole) {
    const d = W.clone().sub(S); let dl = d.length(); const u = d.clone().divideScalar(dl); dl = Math.min(dl, L1 + L2 - 1e-4);
    const a = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    return S.clone().addScaledVector(u, a).addScaledVector(v, h);
  }
  const orth = (v, n) => v.clone().addScaledVector(n, -v.dot(n)).normalize();

  // ------------------------------------------------------------------ textures / materials
  function grainTex(key, W, H, o) { // props_b
    return L.canvasTex(key, W, H, (g, w, h) => {
      const r = L.rnd(o.seed || 3);
      g.fillStyle = o.base; g.fillRect(0, 0, w, h);
      g.save(); if (o.vertical) { g.translate(w, 0); g.rotate(PI / 2); }
      const AL = o.vertical ? h : w, AC = o.vertical ? w : h;
      const line = (y0, amp, f1, p1, lw, col) => {
        for (const oy of [-AC, 0, AC]) {
          g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
          for (let x = 0; x <= AL; x += AL / 64) { const y = y0 + oy + amp * Math.sin(x / AL * TAU * f1 + p1) + amp * 0.4 * Math.sin(x / AL * TAU * (f1 + 2) + p1 * 2); x ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
        }
      };
      for (let k = 0; k < (o.bands || 14); k++) line(r() * AC, AC * 0.02 * r(), 1 + Math.floor(r() * 2), r() * 6, AC * (0.02 + r() * 0.06), r() < 0.5 ? o.dark + '22' : o.light + '1c');
      for (let k = 0; k < (o.lines || 160); k++) line(r() * AC, AC * (o.wave || 0.012) * r(), 1 + Math.floor(r() * 3), r() * 6, 0.6 + r() * (o.lw || 2.2), (r() < 0.75 ? o.dark : o.light) + (o.alpha || '55'));
      if (o.pores) { g.fillStyle = o.dark + '66'; for (let k = 0; k < o.pores; k++) g.fillRect(r() * AL, r() * AC, 2 + r() * 8, 0.8 + r()); }
      g.restore();
    }, true, o.rx, o.ry);
  }
  let MS = null;
  function mats() {
    if (MS) return MS;
    const hairTex = LIB.canvasTex('cp_hair', 256, 512, (g, w, h) => {
      g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, h); const r = LIB.rnd(23);
      for (let i = 0; i < 4200; i++) { const x = r() * w, v = 70 + Math.floor(r() * 185); g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + r() * 0.5) + ')'; g.lineWidth = 0.4 + r() * 1.0; g.beginPath(); const y0 = r() * h, Lh = 60 + r() * 260; g.moveTo(x, y0 - Lh); g.bezierCurveTo(x + (r() - 0.5) * 4, y0 - Lh / 3, x + (r() - 0.5) * 4, y0 + Lh / 3, x + (r() - 0.5) * 3, y0 + Lh); g.stroke(); }
    }, true);
    const hairBump = LIB.canvasTex('cp_hairb', 256, 512, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(29);
      for (let i = 0; i < 2600; i++) { const x = r() * w; g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 5, h); g.stroke(); }
    }, false);
    const pore = LIB.canvasTex('cp_pore', 256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(41);
      for (let i = 0; i < 5000; i++) { const v = r() < 0.5 ? 70 : 150; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    }, false);
    const weave = LIB.weaveBump();
    // fleece/jersey: heathered, soft
    const heather = LIB.canvasTex('cp_heather', 256, 256, (g, w, h) => {
      g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h); const r = LIB.rnd(61);
      for (let i = 0; i < 9000; i++) { const v = 90 + Math.floor(r() * 90); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
    }, true);
    const rib = LIB.canvasTex('cp_rib', 64, 64, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 2, 0, 1, h); } }, false);
    const knit = LIB.canvasTex('cp_knit', 256, 256, (g, W, H) => { // stockinette Vs (props_b)
      g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, W, H);
      const cw = 16, ch = 14, r = LIB.rnd(9);
      for (let y = -ch; y < H + ch; y += ch) for (let x = 0; x < W; x += cw) for (const sgn of [-1, 1]) {
        g.save(); g.translate(x + cw / 2 + sgn * cw * 0.22, y + ch / 2); g.rotate(sgn * 0.5);
        const gr = g.createLinearGradient(-cw * 0.25, 0, cw * 0.25, 0); const v = 205 + Math.floor((r() - 0.5) * 24);
        gr.addColorStop(0, 'rgb(150,150,150)'); gr.addColorStop(0.5, 'rgb(' + v + ',' + v + ',' + v + ')'); gr.addColorStop(1, 'rgb(140,140,140)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, cw * 0.26, ch * 0.62, 0, 0, TAU); g.fill(); g.restore();
      }
    }, true);
    const knitB = LIB.canvasTex('cp_knitb', 256, 256, (g, W, H) => {
      g.fillStyle = '#606060'; g.fillRect(0, 0, W, H);
      const cw = 16, ch = 14;
      for (let y = -ch; y < H + ch; y += ch) for (let x = 0; x < W; x += cw) for (const sgn of [-1, 1]) {
        g.save(); g.translate(x + cw / 2 + sgn * cw * 0.22, y + ch / 2); g.rotate(sgn * 0.5);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, cw * 0.4); gr.addColorStop(0, '#e0e0e0'); gr.addColorStop(1, '#606060');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, cw * 0.27, ch * 0.64, 0, 0, TAU); g.fill(); g.restore();
      }
    }, false);
    const denim = (key, base) => LIB.canvasTex('cp_denim_' + key, 256, 256, (g, W, H) => {
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      const r = LIB.rnd(key.length * 7 + 3);
      g.lineWidth = 2;
      for (let k = -H; k < W + H; k += 4) { g.strokeStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.07) + ')'; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.6, H); g.stroke(); }
      for (let k = 0; k < 1200; k++) { g.fillStyle = 'rgba(235,240,250,' + (r() * 0.18) + ')'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1); }
      for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,30') + ',0.025)'; g.fillRect(r() * W, 0, 2 + r() * 8, H); }
    }, true);
    const twill = LIB.canvasTex('cp_twill', 256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let k = -h; k < w; k += 5) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(k + 2.5, h); g.lineTo(k + 2.5 + h, 0); g.stroke(); }
    }, false);
    const vc = (m) => { m.vertexColors = true; return m; };
    const skinM = vc(LIB.mat({ c: '#8a5a40', rough: 0.48, bump: pore, bumpScale: 0.00022, emissive: '#4a1608', emissiveIntensity: 0.04 }));
    const skinMFar = vc(LIB.mat({ c: '#8a5a40', rough: 0.55, bump: pore, bumpScale: 0.00022, emissive: '#4a1608', emissiveIntensity: 0.04 }));
    skinMFar.polygonOffset = true; skinMFar.polygonOffsetFactor = 1; skinMFar.polygonOffsetUnits = 2;
    const skinF = vc(LIB.mat({ c: '#b67f5a', rough: 0.46, bump: pore, bumpScale: 0.00018, emissive: '#6a2410', emissiveIntensity: 0.05 }));
    const skinFFar = vc(LIB.mat({ c: '#b67f5a', rough: 0.5, bump: pore, bumpScale: 0.00018, emissive: '#6a2410', emissiveIntensity: 0.05 }));
    skinFFar.polygonOffset = true; skinFFar.polygonOffsetFactor = 1; skinFFar.polygonOffsetUnits = 2;
    const lips = vc(LIB.mat({ c: '#ffffff', rough: 0.4 }));
    const hair = vc(LIB.mat({ c: '#ffffff', map: hairTex, rough: 0.5, bump: hairBump, bumpScale: 0.0007, env: 0.35 }));
    const hairS = vc(LIB.mat({ c: '#ffffff', map: hairTex, rough: 0.36, bump: hairBump, bumpScale: 0.0005, env: 0.55, side: THREE.DoubleSide }));
    const strand = vc(LIB.mat({ c: '#ffffff', rough: 0.85, env: 0.15, side: THREE.DoubleSide }));
    const eyeTex = (key, iris) => LIB.canvasTex(key, 512, 256, (g, w, h) => {
      const sc = g.createLinearGradient(0, 0, w, 0); sc.addColorStop(0, '#7a6d62'); sc.addColorStop(0.25, '#a3978a'); sc.addColorStop(0.5, '#7a6d62'); sc.addColorStop(1, '#7a6d62');
      g.fillStyle = sc; g.fillRect(0, 0, w, h);
      const r = LIB.rnd(7); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(170,60,50,' + (0.08 + r() * 0.12) + ')'; g.lineWidth = 0.6; g.beginPath(); let x = w * 0.25 + (r() < 0.5 ? -1 : 1) * (60 + r() * 40), y = h * 0.5 + (r() - 0.5) * 60; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 20; y += (r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
      const cx = w * 0.25, cy = h * 0.5, R = 0.56 / TAU * w;
      const ir = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R); ir.addColorStop(0, iris[0]); ir.addColorStop(0.45, iris[1]); ir.addColorStop(0.8, iris[2]); ir.addColorStop(0.93, '#1a100a'); ir.addColorStop(1, 'rgba(40,25,15,0)');
      g.fillStyle = ir; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      for (let i = 0; i < 90; i++) { const a = r() * TAU; g.strokeStyle = 'rgba(' + (r() < 0.5 ? '120,80,40' : '20,10,5') + ',0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.35, cy + Math.sin(a) * R * 0.35); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke(); }
      g.fillStyle = '#050403'; g.beginPath(); g.arc(cx, cy, R * 0.36, 0, TAU); g.fill();
    }, true);
    const eye = LIB.mat({ c: '#ffffff', map: eyeTex('cp_eyeM', ['#2a170c', '#4a2a14', '#3a2210']), rough: 0.35, clearcoat: 0.7, clearcoatRough: 0.05 });
    const eyeF = LIB.mat({ c: '#ffffff', map: eyeTex('cp_eyeF', ['#3a2010', '#5a3418', '#40260f']), rough: 0.35, clearcoat: 0.7, clearcoatRough: 0.05 });
    const hoodie = vc(LIB.mat({ c: '#4a4d55', map: heather, rough: 0.92, bump: weave, bumpScale: 0.0007 }));
    const hoodie2 = vc(LIB.mat({ c: '#4a4d55', map: heather, rough: 0.92, bump: rib, bumpScale: 0.0008, side: THREE.DoubleSide }));
    const cord = LIB.mat({ c: '#43464d', rough: 0.85, bump: rib, bumpScale: 0.0004 });
    const aglet = LIB.mat({ c: '#c9c9c6', rough: 0.3, metal: 0.9 });
    const jeansM = vc(LIB.mat({ c: '#ffffff', map: denim('mid', '#33496a'), rough: 0.88, bump: twill, bumpScale: 0.0009 }));
    const jeansF = vc(LIB.mat({ c: '#ffffff', map: denim('dark', '#2b3142'), rough: 0.86, bump: twill, bumpScale: 0.0008 }));
    const stitch = LIB.mat({ c: '#c8923e', rough: 0.8 });
    const sneaker = vc(LIB.mat({ c: '#e8e6e1', rough: 0.55, bump: pore, bumpScale: 0.0002 }));
    const sneakerSole = LIB.mat({ c: '#f1efe9', rough: 0.7 });
    const sneakerTrim = LIB.mat({ c: '#b9bcc2', rough: 0.6 });
    const lace = LIB.mat({ c: '#f2f0ea', rough: 0.9 });
    const boot = vc(LIB.mat({ c: '#4a2e1c', rough: 0.48, bump: pore, bumpScale: 0.0003, physical: true, clearcoat: 0.3, clearcoatRough: 0.35 }));
    const bootSole = LIB.mat({ c: '#1c1714', rough: 0.8 });
    const cardi = vc(LIB.mat({ c: '#e2d3b4', map: knit, rough: 0.95, bump: knitB, bumpScale: 0.0016 }));
    const cardi2 = vc(LIB.mat({ c: '#e2d3b4', map: knit, rough: 0.95, bump: knitB, bumpScale: 0.0016, side: THREE.DoubleSide }));
    const topM = vc(LIB.mat({ c: '#2a2a30', rough: 0.85, bump: weave, bumpScale: 0.0005 }));
    const gold = LIB.mat({ c: '#d6b06a', rough: 0.25, metal: 1 });
    const pick = LIB.mat({ c: '#ffffff', map: LIB.canvasTex('cp_tort', 128, 128, (q, W, H) => { q.fillStyle = '#3a1608'; q.fillRect(0, 0, W, H); const r = LIB.rnd(23); q.filter = 'blur(2px)'; for (let k = 0; k < 120; k++) { q.fillStyle = ['rgba(170,80,20,0.5)', 'rgba(200,120,40,0.35)', 'rgba(10,4,2,0.55)'][k % 3]; q.beginPath(); q.ellipse(r() * W, r() * H, 3 + r() * 10, 2 + r() * 4, r() * 3, 0, TAU); q.fill(); } q.filter = 'none'; }, true), rough: 0.25, clearcoat: 1, clearcoatRough: 0.1 });
    MS = { skinM, skinMFar, skinF, skinFFar, lips, hair, hairS, strand, eye, eyeF, hoodie, hoodie2, cord, aglet, jeansM, jeansF, stitch, sneaker, sneakerSole, sneakerTrim, lace, boot, bootSole, cardi, cardi2, topM, gold, pick };
    return MS;
  }

  // ------------------------------------------------------------------ spine: a bent body axis with a frame field
  // canonical = upright standing body (y = height of a 1.75 m man; a = towards the person's left, b = towards the front)
  function makeSpine(o) {
    const S = o.S, SY0 = 0.62, SY1 = 1.62, SDY = 0.01, SN = Math.round((SY1 - SY0) / SDY);
    const SP = new Float64Array((SN + 1) * 3), ST = new Float64Array((SN + 1) * 3), SL = new Float64Array((SN + 1) * 3), SF = new Float64Array((SN + 1) * 3);
    const fr = [];
    for (let i = 0; i <= SN; i++) {
      const y = SY0 + i * SDY, phi = o.phi(y), lat = o.lat ? o.lat(y) : 0;
      const T = V(Math.sin(lat), Math.cos(phi) * Math.cos(lat), Math.sin(phi) * Math.cos(lat)).normalize();
      const Lv = o.L(y); Lv.addScaledVector(T, -Lv.dot(T)).normalize();
      fr.push({ T, L: Lv, F: Lv.clone().cross(T) });
    }
    const ia = Math.round((o.ya - SY0) / SDY), P = []; P[ia] = o.anchor.clone();
    for (let i = ia + 1; i <= SN; i++) P[i] = P[i - 1].clone().addScaledVector(fr[i - 1].T.clone().add(fr[i].T).normalize(), SDY * S);
    for (let i = ia - 1; i >= 0; i--) P[i] = P[i + 1].clone().addScaledVector(fr[i + 1].T.clone().add(fr[i].T).normalize(), -SDY * S);
    for (let i = 0; i <= SN; i++) { const k = i * 3, f = fr[i]; SP[k] = P[i].x; SP[k + 1] = P[i].y; SP[k + 2] = P[i].z; ST[k] = f.T.x; ST[k + 1] = f.T.y; ST[k + 2] = f.T.z; SL[k] = f.L.x; SL[k + 1] = f.L.y; SL[k + 2] = f.L.z; SF[k] = f.F.x; SF[k + 1] = f.F.y; SF[k + 2] = f.F.z; }
    const sd2 = (i, x, y, z) => { const k = i * 3, dx = x - SP[k], dy = y - SP[k + 1], dz = z - SP[k + 2]; return dx * dx + dy * dy + dz * dz; };
    let last = ia;
    function toC(x, y, z, out) {
      let bi = last, bd = sd2(bi, x, y, z);
      // coarse scan when the previous answer is far, then hill-climb
      if (bd > 0.0004) { for (let i = 0; i <= SN; i += 4) { const d = sd2(i, x, y, z); if (d < bd) { bd = d; bi = i; } } }
      for (;;) { if (bi < SN) { const d = sd2(bi + 1, x, y, z); if (d < bd) { bd = d; bi++; continue; } } if (bi > 0) { const d = sd2(bi - 1, x, y, z); if (d < bd) { bd = d; bi--; continue; } } break; }
      last = bi;
      const k = bi * 3, dx = x - SP[k], dy = y - SP[k + 1], dz = z - SP[k + 2];
      out[0] = (dx * SL[k] + dy * SL[k + 1] + dz * SL[k + 2]) / S;
      out[1] = SY0 + bi * SDY + (dx * ST[k] + dy * ST[k + 1] + dz * ST[k + 2]) / S;
      out[2] = (dx * SF[k] + dy * SF[k + 1] + dz * SF[k + 2]) / S;
      return out;
    }
    function toW(a, yc, b) {
      const f = clamp((yc - SY0) / SDY, 0, SN), i = Math.min(SN - 1, Math.floor(f)), t = f - i, k = i * 3, k2 = k + 3;
      const Lr = (arr, j) => lerp(arr[k + j], arr[k2 + j], t);
      const ext = (yc - (SY0 + f * SDY));
      return V(Lr(SP, 0) + (a * Lr(SL, 0) + b * Lr(SF, 0) + ext * Lr(ST, 0)) * S, Lr(SP, 1) + (a * Lr(SL, 1) + b * Lr(SF, 1) + ext * Lr(ST, 1)) * S, Lr(SP, 2) + (a * Lr(SL, 2) + b * Lr(SF, 2) + ext * Lr(ST, 2)) * S);
    }
    function frame(yc) { const i = clamp(Math.round((yc - SY0) / SDY), 0, SN); return fr[i]; }
    return { toC, toW, frame, S };
  }

  // ------------------------------------------------------------------ canonical torsos (upright)
  const TTM = table([ // male (friend.js): y, half-width, front depth, back depth, centre x, centre z
    [0.74, 0.150, 0.070, 0.092, 0, 0.000], [0.80, 0.162, 0.076, 0.106, 0, -0.004], [0.86, 0.168, 0.082, 0.114, 0, -0.008], [0.92, 0.169, 0.087, 0.108, 0, -0.006],
    [0.98, 0.159, 0.090, 0.093, 0, -0.002], [1.04, 0.147, 0.092, 0.087, 0, 0.000], [1.10, 0.149, 0.097, 0.089, 0, 0.000], [1.17, 0.156, 0.103, 0.095, 0, -0.004],
    [1.24, 0.163, 0.107, 0.100, 0, -0.008], [1.30, 0.167, 0.104, 0.103, 0, -0.012], [1.36, 0.169, 0.092, 0.099, 0, -0.016], [1.41, 0.158, 0.074, 0.088, 0, -0.020],
    [1.45, 0.122, 0.060, 0.072, 0, -0.022], [1.49, 0.066, 0.049, 0.058, 0, -0.024],
  ]);
  const TTF = table([ // female, in the same canonical units (the body is then scaled by S)
    [0.74, 0.170, 0.074, 0.104, 0, 0.000], [0.80, 0.180, 0.078, 0.116, 0, -0.006], [0.86, 0.181, 0.082, 0.118, 0, -0.010], [0.92, 0.172, 0.083, 0.106, 0, -0.008],
    [0.98, 0.154, 0.082, 0.090, 0, -0.002], [1.04, 0.137, 0.080, 0.083, 0, 0.000], [1.10, 0.139, 0.083, 0.085, 0, 0.000], [1.17, 0.147, 0.088, 0.089, 0, -0.004],
    [1.24, 0.153, 0.090, 0.093, 0, -0.008], [1.30, 0.157, 0.088, 0.096, 0, -0.012], [1.36, 0.159, 0.080, 0.094, 0, -0.016], [1.41, 0.150, 0.068, 0.084, 0, -0.020],
    [1.45, 0.114, 0.057, 0.069, 0, -0.022], [1.49, 0.060, 0.046, 0.055, 0, -0.024],
  ]);
  function torsoBase(TT, a, y, b) {
    const r = TT(y), W = r[0], dx = a - r[3], dz = b - r[4], D = dz > 0 ? r[1] : r[2];
    const ux = Math.abs(dx) / W, uz = Math.abs(dz) / D, n = 2.35;
    return (Math.pow(Math.pow(ux, n) + Math.pow(uz, n), 1 / n) - 1) * Math.min(W, D);
  }
  function torsoM(a, y, b) {
    let d = smax(torsoBase(TTM, a, y, b), y - 1.505, 0.03);
    if (y > 1.05) {
      const aa = Math.abs(a);
      d = smin(d, sdCap(aa, y, b, [0.03, 1.488, -0.03], [0.158, 1.442, -0.02], 0.042, 0.04), 0.05);
      d = smin(d, sdEll(aa, y, b, [0.178, 1.405, -0.006], [0.046, 0.055, 0.05]), 0.03);
      if (b > -0.02) d = smin(d, sdEll(aa, y, b, [0.072, 1.30, 0.062], [0.07, 0.055, 0.05]), 0.05);
      if (b < 0.0) d = smin(d, sdEll(aa, y, b, [0.085, 1.31, -0.07], [0.065, 0.085, 0.04]), 0.05);
    }
    return d;
  }
  function torsoF(a, y, b) {
    let d = smax(torsoBase(TTF, a, y, b), y - 1.505, 0.03);
    if (y > 1.05) {
      const aa = Math.abs(a);
      d = smin(d, sdCap(aa, y, b, [0.03, 1.484, -0.028], [0.15, 1.44, -0.02], 0.036, 0.034), 0.05);
      d = smin(d, sdEll(aa, y, b, [0.166, 1.402, -0.006], [0.04, 0.05, 0.045]), 0.03);
      if (b > -0.02) d = smin(d, sdEll(aa, y, b, [0.071, 1.245, 0.058], [0.066, 0.062, 0.058]), 0.045); // bust
      if (b < 0.0) d = smin(d, sdEll(aa, y, b, [0.08, 1.31, -0.066], [0.06, 0.08, 0.038]), 0.05);
    }
    return d;
  }

  // ------------------------------------------------------------------ hands (mom / friend chain model)
  const FING = [
    { base: [0.089, 0.000, 0.025], len: [0.042, 0.025, 0.019], rad: [0.0082, 0.0074, 0.0067, 0.0059] },
    { base: [0.093, 0.000, 0.007], len: [0.047, 0.029, 0.020], rad: [0.0084, 0.0076, 0.0069, 0.0061] },
    { base: [0.089, -0.001, -0.011], len: [0.044, 0.027, 0.019], rad: [0.0079, 0.0072, 0.0065, 0.0058] },
    { base: [0.080, -0.003, -0.027], len: [0.034, 0.020, 0.017], rad: [0.0071, 0.0064, 0.0058, 0.0052] },
  ];
  const THUMB = { base: [0.014, -0.010, 0.019], len: [0.040, 0.031, 0.025], rad: [0.0122, 0.0101, 0.0091, 0.0081] };
  function fingerChain(F, ang) {
    const pts = [F.base.slice()]; let a = 0, p = F.base; const sp = ang[3] || 0;
    for (let j = 0; j < 3; j++) { a += ang[j]; const Lf = F.len[j]; p = [p[0] + Lf * Math.cos(a) * Math.cos(sp), p[1] - Lf * Math.sin(a), p[2] + Lf * Math.cos(a) * Math.sin(sp)]; pts.push(p); }
    return pts;
  }
  function thumbChain(T, bow) {
    const J = [THUMB.base.slice()]; let p = THUMB.base;
    for (let j = 0; j < 3; j++) { const Lt = THUMB.len[j], b = j === 0 ? bow : j === 1 ? bow.map(v => v * 0.35) : [0, 0, 0]; let dx = T[0] - p[0] + b[0], dy = T[1] - p[1] + b[1], dz = T[2] - p[2] + b[2]; const l = Math.hypot(dx, dy, dz) || 1; p = [p[0] + dx / l * Lt, p[1] + dy / l * Lt, p[2] + dz / l * Lt]; J.push(p); }
    return J;
  }
  // a finger reaching a target (hand-local): spread from the plan direction, MCP/PIP angles by search (DIP = 0.7 PIP)
  function reachFinger(F, T, distalDir) {
    const B = F.base, sp = Math.atan2(T[2] - B[2], T[0] - B[0]), r = Math.hypot(T[0] - B[0], T[2] - B[2]), hy = T[1] - B[1];
    let best = null;
    for (let a1 = -0.4; a1 <= 1.75; a1 += 0.01) for (let a2 = 0; a2 <= 1.9; a2 += 0.01) {
      const a3 = 0.7 * a2, A2 = a1 + a2, A3 = A2 + a3;
      const ex = F.len[0] * Math.cos(a1) + F.len[1] * Math.cos(A2) + F.len[2] * Math.cos(A3), ey = -(F.len[0] * Math.sin(a1) + F.len[1] * Math.sin(A2) + F.len[2] * Math.sin(A3));
      let e = Math.hypot(ex - r, ey - hy);
      if (distalDir) { const dx = Math.cos(A3) * Math.cos(sp), dy = -Math.sin(A3), dz = Math.cos(A3) * Math.sin(sp); e += 0.0018 * (1 - (dx * distalDir[0] + dy * distalDir[1] + dz * distalDir[2])); }
      e += 0.002 * Math.max(0, a1 - 0.9) + 0.0015 * Math.max(0, a2 - 1.5);
      if (!best || e < best.e) best = { e, a: [a1, a2, a3, sp] };
    }
    return { pts: fingerChain(F, best.a), err: best.e, ang: best.a };
  }
  function handSDF(chains, thumb) {
    const caps = [];
    chains.forEach((pts, i) => { for (let j = 0; j < 3; j++) caps.push([pts[j], pts[j + 1], FING[i].rad[j], FING[i].rad[j + 1], i]); });
    const tc = []; for (let j = 0; j < 3; j++) tc.push([thumb[j], thumb[j + 1], THUMB.rad[j], THUMB.rad[j + 1]]);
    const kn = chains.map((pts) => [pts[0][0] - 0.002, pts[0][1] + 0.0055, pts[0][2]]);
    const tw = kn.map((k) => [0.008, 0.0118, k[2] * 0.45 + 0.004]);
    return function (x, y, z) {
      const bx = x - 0.06, by = y + 0.012, bz = z - 0.01, br = Math.sqrt(bx * bx + by * by + bz * bz);
      if (br > 0.16) return br - 0.14;
      let d = sdRBox(x - 0.048, y + 0.003, z - 0.002, 0.032, 0.003, 0.026, 0.0125);
      d = smin(d, sdEll(x, y, z, [0.052, 0.002, 0.0], [0.042, 0.0125, 0.034]), 0.01);
      d = smin(d, sdEll(x, y, z, [-0.008, 0, 0.0], [0.032, 0.0165, 0.0255]), 0.016);
      d = smin(d, sdEll(x, y, z, [0.03, -0.009, 0.022], [0.03, 0.0135, 0.017]), 0.012);
      d = smin(d, sdEll(x, y, z, [0.04, -0.007, -0.025], [0.034, 0.012, 0.012]), 0.01);
      for (let i = 0; i < 4; i++) d = smin(d, sdEll(x, y, z, kn[i], [0.0088, 0.0082, 0.0078]), 0.005);
      // extensor tendons fanning from the wrist to the knuckles
      if (y > 0.004 && x > 0.0 && x < 0.09) for (let i = 0; i < 4; i++) d = smin(d, sdCap(x, y, z, tw[i], kn[i], 0.0014, 0.0017), 0.0035);
      let fd = 1e9, cur = 1e9, last = -1;
      for (let i = 0; i < caps.length; i++) {
        const c = caps[i]; let e = sdCap(x, y, z, c[0], c[1], c[2], c[3]);
        if (c[4] !== last) { fd = Math.min(fd, cur); cur = e; last = c[4]; } else cur = smin(cur, e, 0.0028);
      }
      fd = Math.min(fd, cur);
      // knuckle creases on the back of the fingers (a hair of relief at PIP/DIP)
      d = smin(d, fd, 0.006);
      let td = 1e9; for (let i = 0; i < 3; i++) { const c = tc[i]; td = smin(td, sdCap(x, y, z, c[0], c[1], c[2], c[3]), 0.003); }
      d = smin(d, td, 0.013);
      return d;
    };
  }
  // hand frame helpers: X fingers, Y back of hand, Z thumb side (right hand); left hands mirror local z
  function handXf(W, X, Y, Z, mirror, hsc) {
    const sg = mirror ? -1 : 1;
    return {
      W, X, Y, Z, sg, hsc,
      toL(x, y, z, o) { const hx = (x - W.x) / hsc, hy = (y - W.y) / hsc, hz = (z - W.z) / hsc; o[0] = hx * X.x + hy * X.y + hz * X.z; o[1] = hx * Y.x + hy * Y.y + hz * Y.z; o[2] = sg * (hx * Z.x + hy * Z.y + hz * Z.z); return o; },
      toW(p) { return W.clone().addScaledVector(X, p[0] * hsc).addScaledVector(Y, p[1] * hsc).addScaledVector(Z, sg * p[2] * hsc); },
      dirL(v) { return [v.dot(X), v.dot(Y), sg * v.dot(Z)]; },
    };
  }
  // hand + wrist + the end of the forearm (the rest of the arm is inside a sleeve)
  function handArmSDF(E, hx, hand, foreR) {
    const W = hx.W, u = W.clone().sub(E), Lf = u.length(); u.divideScalar(Lf);
    const Yf = orth(hx.Y, u), Zf = u.clone().cross(Yf);
    const e = A3(E), ua = A3(u), ya = A3(Yf), za = A3(Zf), q = [0, 0, 0];
    const r0 = foreR || [0.036, 0.04];
    return function (x, y, z) {
      const px = x - e[0], py = y - e[1], pz = z - e[2], tt = px * ua[0] + py * ua[1] + pz * ua[2], t = clamp(tt / Lf, 0, 1);
      const cx = px - ua[0] * t * Lf, cy = py - ua[1] * t * Lf, cz = pz - ua[2] * t * Lf, a = cx * ya[0] + cy * ya[1] + cz * ya[2], b = cx * za[0] + cy * za[1] + cz * za[2];
      const k = sstep(0.1, 0.92, t);
      const ry = lerp(r0[0], 0.0185, k), rz = lerp(r0[1], 0.0285, k);
      let f = (Math.sqrt(a * a / (ry * ry) + b * b / (rz * rz)) - 1) * Math.min(ry, rz);
      f = smax(f, tt - Lf - 0.004, 0.01);
      hx.toL(x, y, z, q);
      let d = smin(f, hand(q[0], q[1], q[2]) * hx.hsc, 0.012);
      return smax(d, (Lf - 0.065) - tt, 0.004); // starts 6.5 cm up the forearm (inside the cuff)
    };
  }
  function handBox(hx, E) {
    const b0 = [9, 9, 9], b1 = [-9, -9, -9];
    const pts = [hx.W.clone().lerp(E, 0.26)];
    for (const lx of [-0.04, 0.21]) for (const ly of [-0.07, 0.06]) for (const lz of [-0.067, 0.083]) pts.push(hx.toW([lx, ly, lz]));
    pts.forEach(p => { const v = A3(p); for (let i = 0; i < 3; i++) { b0[i] = Math.min(b0[i], v[i] - 0.03); b1[i] = Math.max(b1[i], v[i] + 0.03); } });
    return [b0, b1];
  }
  function handColours(hx, chains, sk) {
    const q = [0, 0, 0];
    return (x, y, z) => {
      hx.toL(x, y, z, q); const lx = q[0], ly = q[1], lz = q[2];
      let c = 1 + 0.03 * vnoise(x * 200, y * 200, z * 200);
      const palm = sstep(-0.006, -0.016, ly) * sstep(-0.01, 0.01, lx);
      let r = c * (1 + sk.palm[0] * palm), g = c * (1 + sk.palm[1] * palm), b = c * (1 + sk.palm[2] * palm);
      // knuckles slightly darker on the back
      for (const pts of chains) for (let j = 0; j < 3; j++) { const p = pts[j]; const dd = Math.hypot(lx - p[0], ly - p[1] - 0.006, lz - p[2]); const kk = sstep(0.008, 0.002, dd) * sstep(0.0, 0.004, ly - p[1]); r *= 1 - 0.1 * kk; g *= 1 - 0.12 * kk; b *= 1 - 0.12 * kk; }
      // nails on the distal phalanges (back side)
      for (const pts of chains) {
        const a = pts[2], e = pts[3], dx = e[0] - a[0], dy = e[1] - a[1], dz = e[2] - a[2], ll = dx * dx + dy * dy + dz * dz;
        const t = ((lx - a[0]) * dx + (ly - a[1]) * dy + (lz - a[2]) * dz) / ll; if (t < 0.25 || t > 1.15) continue;
        const qx = lx - a[0] - dx * t, qy = ly - a[1] - dy * t, qz = lz - a[2] - dz * t, ql = Math.hypot(qx, qy, qz);
        if (ql > 0.012) continue;
        const l = Math.sqrt(ll), bn = [dy / l, -dx / l, 0];
        const dorsal = (qx * bn[0] + qy * bn[1]) / (ql || 1), lat = Math.abs(qz) / (ql || 1);
        const nk = sstep(0.55, 0.8, dorsal) * sstep(0.75, 0.5, lat) * sstep(0.25, 0.4, t);
        r = lerp(r, sk.nail[0], nk * 0.85); g = lerp(g, sk.nail[1], nk * 0.85); b = lerp(b, sk.nail[2], nk * 0.85);
      }
      // creases between fingers
      let f1 = 1e9, f2 = 1e9;
      for (let fi = 0; fi < chains.length; fi++) { const pts = chains[fi]; let fd = 1e9; for (let j = 0; j < 3; j++) fd = Math.min(fd, sdCap(lx, ly, lz, pts[j], pts[j + 1], FING[fi].rad[j], FING[fi].rad[j + 1])); if (fd < f1) { f2 = f1; f1 = fd; } else if (fd < f2) f2 = fd; }
      const cr = sstep(0.0035, 0.0005, f2) * sstep(0.004, 0.0, Math.abs(f1 - f2));
      r *= 1 - 0.3 * cr; g *= 1 - 0.32 * cr; b *= 1 - 0.32 * cr;
      return [r, g, b];
    };
  }

  // ------------------------------------------------------------------ heads (local frame: cranium centre, +z face, +y up, +x the person's left)
  const EYE = [0.0315, 0.003, 0.070], EYE_R = 0.0122;
  function makeHeadSDF(H, lidRef) {
    return function (x, y, z) {
      const ax = Math.abs(x), LID = lidRef.v;
      let d = sdEll(x, y, z, [0, 0.016, -0.014], [0.075, 0.088, 0.099]);
      d = smin(d, sdEll(x, y, z, [0, -0.03, 0.018], [0.058 * H.jw, 0.06, 0.064]), 0.03);
      d = smin(d, sdEll(x, y, z, [0, -0.052, 0.045], [0.04, 0.035, 0.037]), 0.025);
      d = smin(d, sdCap(ax, y, z, [0.056 * H.jw, -0.03, -0.024], H.jaw, H.jr[0], H.jr[1]), 0.03);
      d = smin(d, sdEll(x, y, z, H.chinC, H.chinR), 0.02);
      d = smin(d, sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);
      if (z > -0.01) {
        d = smin(d, sdEll(ax, y, z, [0.047, -0.018, 0.049], H.cheekR), 0.026);
        d = smin(d, sdEll(ax, y, z, [0.038, -0.045, 0.045], H.cheek2), 0.02);
        d = smin(d, sdCap(x, y, z, [-0.041, 0.026, 0.077], [0.041, 0.026, 0.077], H.brow, H.brow), 0.02);
        d = smax(d, -sdEll(ax, y, z, [0.0315, 0.002, 0.095], [0.019, 0.0145, 0.017]), 0.007);
        if (ax > 0.012 && ax < 0.052 && y > -0.018 && y < 0.022) {
          const qx = ax - EYE[0], qy = y - EYE[1], qz = z - EYE[2], ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
          let sh = Math.abs(ql - (EYE_R + 0.0021)) - 0.0021;
          const az = Math.atan2(qx, qz), el = Math.atan2(qy, Math.hypot(qx, qz));
          const amax = 1.05, hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / amax, 2)) - 0.03;
          const up = el - LID.e0 - 0.025 * Math.sin(az * 2.0), open = (hh - Math.abs(up)) * EYE_R;
          sh = smax(sh, open, 0.0012);
          sh = smax(sh, -qz - 0.004, 0.003);
          d = smin(d, sh, 0.0025);
        }
        d = smin(d, sdCap(x, y, z, [0, 0.013, 0.085], [0, -0.03, 0.1075 * H.nose], H.nb[0], H.nb[1]), 0.01);
        d = smin(d, sdEll(x, y, z, [0, -0.0322, 0.1025 * H.nose], [0.0088 * H.nt, 0.0088 * H.nt, 0.0094 * H.nt]), 0.006);
        d = smin(d, sdEll(ax, y, z, [0.0116 * H.nt, -0.0362, 0.0962 * H.nose], [0.0062 * H.nt, 0.0058, 0.0068]), 0.0095);
        d = smax(d, -sdEll(ax, y, z, [0.0068 * H.nt, -0.0445, 0.1005 * H.nose], [0.0034, 0.0022, 0.0048]), 0.0016);
        // philtrum: a shallow groove
        d += 0.0005 * Math.exp(-x * x / 0.000006) * sstep(-0.042, -0.046, y) * sstep(-0.056, -0.052, y);
        d = smin(d, sdEll(x, y, z, [0, -0.0565, 0.0825], H.ul), 0.009);
        d = smin(d, sdEll(x, y, z, [0, -0.0672, 0.0805], H.ll), 0.009);
        d = smax(d, -sdEll(x, y, z, [0, -0.0617, 0.0915], [0.0185, 0.0008, 0.012]), 0.0011);
        d = smax(d, -sdEll(x, y, z, [0, -0.077, 0.09], [0.016, 0.004, 0.006]), 0.004);
        // nasolabial fold (very soft)
        const nl = sdCap(ax, y, z, [0.019, -0.036, 0.093], [0.025, -0.06, 0.083], 0.0, 0.0);
        d += 0.0006 * sstep(0.004, 0.0, nl) * H.fold;
      }
      if (ax > 0.05) {
        const ex = ax - 0.0765, ey = y + 0.004, ez = z + 0.016, c = Math.cos(0.22), s = Math.sin(0.22), ry = ey * c - ez * s, rz = ey * s + ez * c;
        let e = sdEll(ex, ry, rz, [0, 0, 0], [0.0098, 0.0275 * H.ear, 0.0168 * H.ear]);
        e = smax(e, -sdEll(ex, ry, rz, [0.0068, 0.003, 0.003], [0.0056, 0.0172 * H.ear, 0.0098 * H.ear]), 0.004);
        e = smin(e, sdEll(ex, ry, rz, [0.0, -0.003, 0.011], [0.007, 0.007, 0.006]), 0.004);
        e = smin(e, sdEll(ex, ry, rz, [0.003, -0.022 * H.ear, 0.002], [0.006, 0.008, 0.008]), 0.004); // lobe
        d = smin(d, e, 0.006);
      }
      return d;
    };
  }
  const HEAD_M = { jw: 1.0, jaw: [0.031, -0.093, 0.049], jr: [0.015, 0.013], chinC: [0, -0.096, 0.07], chinR: [0.025, 0.018, 0.02], cheekR: [0.022, 0.019, 0.025], cheek2: [0.016, 0.019, 0.019], brow: 0.0115, nose: 1.0, nt: 1.0, nb: [0.0078, 0.011], ul: [0.0182, 0.005, 0.0086], ll: [0.0165, 0.0058, 0.0086], smile: 0.0, fold: 1, ear: 1 };
  const HEAD_F = { jw: 0.93, jaw: [0.026, -0.089, 0.048], jr: [0.012, 0.0102], chinC: [0, -0.094, 0.066], chinR: [0.0185, 0.017, 0.0175], cheekR: [0.022, 0.02, 0.025], cheek2: [0.016, 0.018, 0.019], brow: 0.0082, nose: 0.985, nt: 0.88, nb: [0.0064, 0.0092], ul: [0.0178, 0.0058, 0.0095], ll: [0.0168, 0.0068, 0.0094], smile: 0.0, fold: 0.4, ear: 0.93 };

  // ------------------------------------------------------------------ the guitar (props_b.js, without the wall hanger)
  // local frame: tail at the origin, neck along +y, back on z = 0, top at z = 0.10, treble side at +x
  function buildGuitar() {
    const g = new THREE.Group();
    const V3 = V;
    function gridGeo(nu, nv, f) {
      const P = new Float32Array((nu + 1) * (nv + 1) * 3), U = new Float32Array((nu + 1) * (nv + 1) * 2), I = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * (nu + 1) + i, r = f(i, j); P[3 * k] = r[0]; P[3 * k + 1] = r[1]; P[3 * k + 2] = r[2]; U[2 * k] = r[3]; U[2 * k + 1] = r[4]; }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, b, c, b, d, c); }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(P, 3)); ge.setAttribute('uv', new THREE.BufferAttribute(U, 2)); ge.setIndex(I); ge.computeVertexNormals();
      return ge;
    }
    function rod(p, a, b, r, mat, seg) {
      const Av = V3(a[0], a[1], a[2]), Bv = V3(b[0], b[1], b[2]), d = Bv.clone().sub(Av), len = d.length();
      const m = L.cyl(p, r, r, len, mat, (Av.x + Bv.x) / 2, (Av.y + Bv.y) / 2, (Av.z + Bv.z) / 2, { seg: seg || 8 });
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return m;
    }
    const half = [[0, 0], [0.06, 0.003], [0.115, 0.014], [0.158, 0.036], [0.186, 0.068], [0.199, 0.108], [0.2005, 0.15], [0.193, 0.19], [0.173, 0.232], [0.147, 0.268], [0.127, 0.298], [0.1225, 0.322], [0.128, 0.35], [0.139, 0.385], [0.1448, 0.42], [0.1435, 0.458], [0.132, 0.488], [0.105, 0.506], [0.055, 0.5115], [0, 0.513]];
    const loop = []; for (let i = half.length - 1; i >= 1; i--) loop.push(new THREE.Vector2(-half[i][0], half[i][1])); for (let i = 0; i < half.length - 1; i++) loop.push(new THREE.Vector2(half[i][0], half[i][1]));
    const curve = new THREE.SplineCurve(loop.concat([loop[0].clone()]));
    const OUT = curve.getSpacedPoints(200); OUT.pop();
    const HOLE = { x: 0, y: 0.37, r: 0.0505 };
    const mkShape = (hole) => { const s = new THREE.Shape(OUT); if (hole) { const h = new THREE.Path(); for (let k = 0; k <= 64; k++) { const a = -k / 64 * TAU; k ? h.lineTo(HOLE.x + Math.cos(a) * HOLE.r, HOLE.y + Math.sin(a) * HOLE.r) : h.moveTo(HOLE.x + HOLE.r, HOLE.y); } s.holes.push(h); } return s; };
    const mahoV = grainTex('b_mahoV', 512, 1024, { base: '#5a2a16', dark: '#2a1008', light: '#8a4826', vertical: true, lines: 120, wave: 0.01, pores: 500, seed: 12, rx: 2, ry: 2 });
    const mahoH = grainTex('b_mahoH', 1024, 256, { base: '#5a2a16', dark: '#2a1008', light: '#8a4826', lines: 80, wave: 0.01, pores: 300, seed: 13, rx: 2, ry: 6 });
    const backM = L.mat({ c: '#ffffff', map: mahoV, rough: 0.25, clearcoat: 1, clearcoatRough: 0.06 });
    const sideM = L.mat({ c: '#ffffff', map: mahoH, rough: 0.25, clearcoat: 1, clearcoatRough: 0.06 });
    const neckM = L.mat({ c: '#ffffff', map: mahoV, rough: 0.45, clearcoat: 0.4, clearcoatRough: 0.4 });
    const binding = L.mat({ c: '#0c0c0c', rough: 0.2, clearcoat: 1 });
    const bone = L.mat({ c: '#efe8d6', rough: 0.35 });
    const nickel = L.mat({ c: '#d4d3cf', rough: 0.22, metal: 1 });
    const bronze = L.mat({ c: '#b58f5a', rough: 0.3, metal: 1 });
    const steel = L.mat({ c: '#d9d9d9', rough: 0.2, metal: 1 });
    const rosewood = grainTex('b_fretboard', 256, 1024, { base: '#2c160d', dark: '#120804', light: '#5a2e18', vertical: true, lines: 90, wave: 0.02, pores: 400, seed: 14, rx: 1 / 0.08, ry: 2 });
    rosewood.offset.set(0.5, 0);
    const fbM = L.mat({ c: '#ffffff', map: rosewood, rough: 0.6 });
    const topTex = L.canvasTex('b_sprucetop', 1024, 1280, (q, W, H) => {
      const X = x => (x / 0.42 + 0.5) * W, Y = y => (1 - y / 0.525) * H, Sx = W / 0.42;
      q.fillStyle = '#d7ad72'; q.fillRect(0, 0, W, H);
      const r = L.rnd(17);
      const gr = q.createRadialGradient(X(0), Y(0.2), 30, X(0), Y(0.25), W * 0.7); gr.addColorStop(0, 'rgba(240,200,140,0.25)'); gr.addColorStop(1, 'rgba(150,95,40,0.25)'); q.fillStyle = gr; q.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 2 + r() * 5) { q.strokeStyle = 'rgba(140,90,40,' + (0.15 + r() * 0.3) + ')'; q.lineWidth = 0.8 + r() * 1.8; q.beginPath(); q.moveTo(x, 0); q.lineTo(x + (r() - 0.5) * 6, H); q.stroke(); }
      for (let k = 0; k < 900; k++) { q.fillStyle = 'rgba(255,235,200,0.10)'; q.fillRect(r() * W, r() * H, 6 + r() * 20, 1.5); }
      const cx = X(HOLE.x), cy = Y(HOLE.y), rr = m => m * Sx;
      const ring = (r0, r1, col) => { q.beginPath(); q.arc(cx, cy, rr(r1), 0, TAU); q.arc(cx, cy, rr(r0), 0, TAU, true); q.fillStyle = col; q.fill(); };
      ring(0.0505, 0.0525, '#111'); ring(0.0525, 0.0532, '#eee'); ring(0.0532, 0.0545, '#111');
      for (let k = 0; k < 220; k++) { const a = k / 220 * TAU; q.save(); q.translate(cx + Math.cos(a) * rr(0.0553), cy + Math.sin(a) * rr(0.0553)); q.rotate(a + (k % 2 ? 0.7 : -0.7)); q.fillStyle = k % 2 ? '#1a1a1a' : '#f2eee4'; q.fillRect(-1.2, -rr(0.0008) * 2, 2.4, rr(0.0016) * 2); q.restore(); }
      ring(0.0562, 0.0575, '#111'); ring(0.0575, 0.0582, '#eee'); ring(0.0582, 0.0595, '#111'); ring(0.0615, 0.0622, '#111');
      q.beginPath(); OUT.forEach((p, i) => i ? q.lineTo(X(p.x), Y(p.y)) : q.moveTo(X(p.x), Y(p.y))); q.closePath();
      q.strokeStyle = '#f0ebe0'; q.lineWidth = rr(0.0042) * 2; q.stroke();
      q.strokeStyle = '#141414'; q.lineWidth = rr(0.0033) * 2; q.stroke();
      // a little pick wear below the sound hole (treble side)
      const pw = q.createRadialGradient(X(0.05), Y(0.33), 4, X(0.05), Y(0.33), rr(0.035)); pw.addColorStop(0, 'rgba(150,110,70,0.25)'); pw.addColorStop(1, 'rgba(150,110,70,0)'); q.fillStyle = pw; q.fillRect(0, 0, W, H);
    }, true, 1 / 0.42, 1 / 0.525);
    topTex.offset.set(0.5, 0);
    const topM = L.mat({ c: '#ffffff', map: topTex, rough: 0.22, clearcoat: 1, clearcoatRough: 0.05 });
    const G = L.group(g);
    const bodyGeo = new THREE.ExtrudeGeometry(mkShape(true), { depth: 0.092, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 12 });
    bodyGeo.translate(0, 0, 0.004);
    {
      const pos = bodyGeo.attributes.position, g1 = bodyGeo.groups[1], end = g1.start + g1.count; let k = end;
      for (let i = g1.start; i < end; i += 3) if (Math.hypot(pos.getX(i) - HOLE.x, pos.getY(i) - HOLE.y) < HOLE.r + 0.002) { k = i; break; }
      g1.count = k - g1.start; bodyGeo.addGroup(k, end - k, 2);
    }
    L.mesh(G, bodyGeo, [backM, sideM, L.mat({ c: '#2a1c10', rough: 0.9, env: 0.15 })], 0, 0, 0);
    L.mesh(G, new THREE.ShapeGeometry(mkShape(true)), topM, 0, 0, 0.1002);
    const bind3 = (z) => new THREE.CatmullRomCurve3(OUT.map((p, i) => { const a = OUT[(i + OUT.length - 1) % OUT.length], b = OUT[(i + 1) % OUT.length]; const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty); return V3(p.x + ty / l * 0.0016, p.y - tx / l * 0.0016, z); }), true);
    L.mesh(G, new THREE.TubeGeometry(bind3(0.0982), 200, 0.0034, 5, true), binding, 0, 0, 0);
    L.mesh(G, new THREE.TubeGeometry(bind3(0.0018), 200, 0.0034, 5, true), binding, 0, 0, 0);
    const inner = L.mat({ c: '#140b06', rough: 0.95, env: 0.08, side: THREE.BackSide });
    L.cyl(G, 0.0468, 0.0468, 0.088, inner, HOLE.x, HOLE.y, 0.0555, { rx: PI / 2, open: true, seg: 40 });
    const label = L.canvasTex('b_label', 256, 256, (q, W, H) => { q.fillStyle = '#1c120b'; q.fillRect(0, 0, W, H); q.fillStyle = '#4a2f1a'; q.fillRect(0, H * 0.42, W, H * 0.16); q.fillStyle = '#7a6a50'; q.fillRect(W * 0.28, H * 0.05, W * 0.44, H * 0.3); q.fillStyle = '#3a3020'; q.font = '20px serif'; q.textAlign = 'center'; q.fillText('No. 1124', W / 2, H * 0.22); });
    L.mesh(G, new THREE.CircleGeometry(0.047, 32), L.mat({ c: '#6a6a6a', map: label, rough: 1, env: 0.08 }), HOLE.x, HOLE.y, 0.0115);
    const pgS = new THREE.Shape(); const a0 = -62 * PI / 180, a1 = 48 * PI / 180, pr = 0.0655;
    pgS.moveTo(HOLE.x + Math.cos(a0) * pr, HOLE.y + Math.sin(a0) * pr);
    pgS.absarc(HOLE.x, HOLE.y, pr, a0, a1, false);
    pgS.quadraticCurveTo(0.068, 0.448, 0.092, 0.441);
    pgS.bezierCurveTo(0.114, 0.433, 0.117, 0.365, 0.106, 0.318);
    pgS.bezierCurveTo(0.096, 0.276, 0.058, 0.268, HOLE.x + Math.cos(a0) * pr, HOLE.y + Math.sin(a0) * pr);
    const tort = L.canvasTex('b_tort', 512, 512, (q, W, H) => { q.fillStyle = '#2a1006'; q.fillRect(0, 0, W, H); const r = L.rnd(23); q.filter = 'blur(3px)'; for (let k = 0; k < 420; k++) { q.fillStyle = ['rgba(150,70,20,0.45)', 'rgba(190,105,40,0.3)', 'rgba(10,4,2,0.55)', 'rgba(90,30,10,0.5)'][k % 4]; q.beginPath(); q.ellipse(r() * W, r() * H, 4 + r() * 18, 2 + r() * 7, 0.5 + (r() - 0.5) * 0.6, 0, TAU); q.fill(); } q.filter = 'none'; }, true, 9, 9);
    L.mesh(G, new THREE.ShapeGeometry(pgS, 20), L.mat({ c: '#ffffff', map: tort, rough: 0.18, clearcoat: 1 }), 0, 0, 0.1007);
    const yS = 0.225;
    const bridgeM = L.mat({ c: '#ffffff', map: grainTex('b_bridgewood', 256, 128, { base: '#24120a', dark: '#0d0603', light: '#4a2615', lines: 50, seed: 15 }), rough: 0.45 });
    L.rbox(G, 0.115, 0.03, 0.009, 0.0035, bridgeM, 0, yS - 0.008, 0.1002 + 0.0045, { seg: 2 });
    for (const sx of [-1, 1]) { const w = L.rbox(G, 0.034, 0.024, 0.006, 0.003, bridgeM, sx * 0.06, yS - 0.008, 0.1002 + 0.003, { seg: 2 }); w.rotation.z = sx * 0.04; }
    const sad = L.rbox(G, 0.074, 0.0028, 0.006, 0.001, bone, 0, yS, 0.1092, { seg: 1 }); sad.rotation.z = -0.05;
    const pinM = L.mat({ c: '#ece4d0', rough: 0.3 }), dotM = L.mat({ c: '#1a1a1a', rough: 0.4 });
    const sx0 = -0.0272, sdx = 0.01088;
    const pinY = i => yS - 0.0135 - Math.abs(i - 2.5) * 0.0006;
    for (let i = 0; i < 6; i++) { const x = (sx0 + i * sdx) * 0.98; L.lathe(G, [[0, 0], [0.0029, 0], [0.0028, 0.0012], [0.0018, 0.0022], [0, 0.0025]], pinM, x, pinY(i), 0.1092, { rx: PI / 2, seg: 12 }); L.cyl(G, 0.0007, 0.0007, 0.0004, dotM, x, pinY(i), 0.1117, { rx: PI / 2, seg: 8 }); }
    const yN = 0.513 + 0.645 * (1 - Math.pow(2, -14 / 12)), SCALE = 0.645;
    const wN = y => 0.044 + (yN - y) * 0.0322;
    const neckGeo = gridGeo(16, 40, (i, j) => {
      const y = lerp(0.506, yN + 0.012, j / 40), a = i / 16 * PI;
      let d = 0.021 + 0.0035 * (1 - clamp((y - 0.513) / (yN - 0.513), 0, 1));
      const heel = sstep(0.585, 0.508, y); d = Math.max(d, 0.024 + 0.074 * heel);
      if (y > yN - 0.004) d = lerp(d, 0.017, sstep(yN - 0.004, yN + 0.012, y));
      const w = wN(Math.max(y, 0.513)) * (1 - 0.12 * heel * Math.sin(a));
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = (w / 2) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.85), z = 0.1001 - d * Math.pow(sa, 0.75 - 0.35 * heel);
      return [x, y, z, a * 0.02, y];
    });
    L.mesh(G, neckGeo, neckM, 0, 0, 0);
    const ebony = L.mat({ c: '#121010', rough: 0.3, clearcoat: 0.8 });
    L.cyl(G, 0.005, 0.0045, 0.006, ebony, 0, -0.006, 0.05, { seg: 16 });
    L.sph(G, 0.005, ebony, 0, -0.0095, 0.05, { ws: 12, hs: 8 });
    const fbS = new THREE.Shape(); const yE = 0.428;
    fbS.moveTo(-wN(yE) / 2, yE); fbS.lineTo(wN(yE) / 2, yE); fbS.lineTo(wN(yN) / 2, yN); fbS.lineTo(-wN(yN) / 2, yN); fbS.closePath();
    const fbG = new THREE.ExtrudeGeometry(fbS, { depth: 0.0052, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1 }); fbG.translate(0, 0, 0.1006);
    L.mesh(G, fbG, fbM, 0, 0, 0);
    const fbTop = 0.1062;
    const fretY = n => yN - SCALE * (1 - Math.pow(2, -n / 12));
    for (let n = 1; n <= 20; n++) { const y = fretY(n); L.cyl(G, 0.0011, 0.0011, wN(y) - 0.0004, nickel, 0, y, fbTop, { rz: PI / 2, seg: 6 }); }
    const pearl = L.mat({ c: '#f4f1ea', rough: 0.25, clearcoat: 1 });
    for (const n of [3, 5, 7, 9, 12, 15, 17]) { const y = (fretY(n) + fretY(n - 1)) / 2; for (const dx of (n === 12 ? [-0.009, 0.009] : [0])) L.cyl(G, 0.003, 0.003, 0.0004, pearl, dx, y, fbTop - 0.00005, { rx: PI / 2, seg: 16 }); }
    L.rbox(G, wN(yN) + 0.0004, 0.005, 0.0086, 0.0012, bone, 0, yN + 0.0025, 0.1002 + 0.0043, { seg: 1 });
    const ha = -14 * PI / 180, HO = { y: yN + 0.005, z: 0.1 };
    const hsPt = (x, y, z) => [x, HO.y + y * Math.cos(ha) - z * Math.sin(ha), HO.z + y * Math.sin(ha) + z * Math.cos(ha)];
    const HS = L.group(G, 0, HO.y, HO.z); HS.rotation.x = ha;
    const hw = y => 0.027 + 0.0105 * (y / 0.165);
    const hsS = new THREE.Shape(); hsS.moveTo(-0.027, 0); hsS.lineTo(0.027, 0); hsS.lineTo(0.0375, 0.160); hsS.quadraticCurveTo(0.038, 0.168, 0.030, 0.169); hsS.quadraticCurveTo(0, 0.175, -0.030, 0.169); hsS.quadraticCurveTo(-0.038, 0.168, -0.0375, 0.160); hsS.closePath();
    const hsG = new THREE.ExtrudeGeometry(hsS, { depth: 0.0115, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 8 }); hsG.translate(0, 0, -0.0135);
    const veneer = L.mat({ c: '#0d0c0b', rough: 0.15, clearcoat: 1, clearcoatRough: 0.04 });
    L.mesh(HS, hsG, [veneer, neckM], 0, 0, 0);
    const posts = [0.035, 0.08, 0.125];
    for (const sd of [-1, 1]) for (const yk of posts) {
      const xp = sd * 0.0205;
      L.cyl(HS, 0.0052, 0.0052, 0.0022, nickel, xp, yk, 0.0008, { rx: PI / 2, seg: 14 });
      L.cyl(HS, 0.0029, 0.0029, 0.013, nickel, xp, yk, 0.0065, { rx: PI / 2, seg: 10 });
      L.cyl(HS, 0.0039, 0.0039, 0.0035, bronze, xp, yk, 0.0055, { rx: PI / 2, seg: 10 });
      const xh = sd * (hw(yk) - 0.0095);
      L.rbox(HS, 0.017, 0.022, 0.010, 0.002, nickel, xh, yk, -0.0145 - 0.0045, { seg: 2 });
      L.cyl(HS, 0.0018, 0.0018, 0.016, nickel, sd * (hw(yk) + 0.006), yk, -0.0185, { rz: PI / 2, seg: 8 });
      const btn = L.sph(HS, 1, nickel, sd * (hw(yk) + 0.019), yk, -0.0185, { ws: 14, hs: 10 }); btn.scale.set(0.0075, 0.0105, 0.0032);
    }
    // strings: the speaking length (saddle -> nut) is its own mesh so it can shimmer when struck
    const SR = [0.00062, 0.00055, 0.00048, 0.0004, 0.0003, 0.00026].map(v => v + 0.0001);
    const strings = [];
    const strPt = (i, y) => { // point on top of string i at neck coordinate y (between saddle and nut)
      const xs = sx0 + i * sdx, xn = -0.0178 + i * 0.00712, t = clamp((y - yS) / (yN - yS), 0, 1);
      return [lerp(xs, xn, t), y, lerp(0.1123, 0.1088, t) + SR[i] * 2];
    };
    for (let i = 0; i < 6; i++) {
      const wound = i < 4, r = SR[i], m = wound ? bronze : steel;
      const xs = sx0 + i * sdx, xn = -0.0178 + i * 0.00712, sd = i < 3 ? -1 : 1, k = i < 3 ? i : 5 - i;
      const pPin = [xs * 0.98, pinY(i) + 0.0015, 0.1112], pSad = [xs, yS + 0.0003 * (i - 2.5), 0.1123 + r], pNut = [xn, yN + 0.0025, 0.1088 + r];
      const pPost = hsPt(sd * (0.0205 - 0.0032), posts[k], 0.006);
      rod(G, pPin, pSad, r, m, 5); strings.push(rod(G, pSad, pNut, r, m, 6)); rod(G, pNut, pPost, r, m, 5);
    }
    // 2D outline -> signed distance of the body (for contact with the player)
    const OP = OUT.map(p => [p.x, p.y]);
    function sd2(x, y) {
      let dm = 1e9, inside = false;
      for (let i = 0, j = OP.length - 1; i < OP.length; j = i++) {
        const a = OP[j], b = OP[i];
        if ((b[1] > y) !== (a[1] > y) && x < (a[0] - b[0]) * (y - b[1]) / (a[1] - b[1]) + b[0]) inside = !inside;
        const ex = a[0] - b[0], ey = a[1] - b[1], t = clamp(((x - b[0]) * ex + (y - b[1]) * ey) / (ex * ex + ey * ey), 0, 1);
        const dx = x - b[0] - ex * t, dy = y - b[1] - ey * t; dm = Math.min(dm, dx * dx + dy * dy);
      }
      return (inside ? -1 : 1) * Math.sqrt(dm);
    }
    function bodySD(x, y, z) { // guitar-local
      if (y < -0.05 || y > 0.56 || Math.abs(x) > 0.26 || z < -0.05 || z > 0.16) return 0.05;
      const d2 = sd2(x, y) + 0.002, dz = Math.abs(z - 0.051) - 0.053;
      return Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0));
    }
    function neckSD(x, y, z) { // neck + fretboard, guitar-local (approximate)
      if (y < 0.42 || y > yN + 0.03) return 0.05;
      const w = wN(clamp(y, 0.513, yN)) / 2;
      const dz = Math.abs(z - (0.1 + 0.0062 - 0.0245) / 1 - 0.0) - 0.0;
      const e = sdEll(x, 0, z, [0, 0, 0.1001], [w, 1, 0.0245]);
      const top = Math.max(Math.abs(x) - w, z - 0.1062, 0.1 - z);
      return Math.max(Math.min(e, top), Math.max(y - yN - 0.01, 0.42 - y)) + 0 * dz;
    }
    return { g, G, strings, strPt, fretY, yN, yS, wN, HOLE, bodySD, neckSD, fbTop, SR };
  }

  // ------------------------------------------------------------------ shoes
  function sneakerSDF(x, y, z) { // right shoe, origin on the floor under the heel, +z toes, +x big-toe side
    let d = sdEll(x, y, z, [0.0, 0.055, 0.045], [0.042, 0.048, 0.062]);
    d = smin(d, sdEll(x, y, z, [0.004, 0.05, 0.135], [0.048, 0.042, 0.088]), 0.04);
    d = smin(d, sdEll(x, y, z, [0.008, 0.04, 0.215], [0.049, 0.03, 0.066]), 0.03);
    d = smin(d, sdCap(x, y, z, [0, 0.075, 0.06], [0, 0.11, 0.055], 0.038, 0.036), 0.03);
    d = smax(d, -sdEll(x, y, z, [0.0, 0.125, 0.055], [0.034, 0.02, 0.05]), 0.006); // collar opening
    return smax(d, 0.026 - y, 0.004);
  }
  function bootSDF(x, y, z) { // ankle boot, slimmer toe, shaft to ~16 cm
    let d = sdEll(x, y, z, [0.0, 0.06, 0.04], [0.036, 0.05, 0.05]);
    d = smin(d, sdEll(x, y, z, [0.004, 0.045, 0.125], [0.041, 0.038, 0.08]), 0.04);
    d = smin(d, sdEll(x, y, z, [0.007, 0.032, 0.195], [0.039, 0.024, 0.058]), 0.03);
    d = smin(d, sdCap(x, y, z, [0, 0.06, 0.055], [0, 0.165, 0.05], 0.039, 0.044), 0.03);
    d = smax(d, y - 0.165, 0.004);
    return smax(d, 0.024 - y, 0.004);
  }

  // the face at a finer resolution, and each eye region finer still (thin eyelids need small cells)
  function facePatches(hf, fbox, col, MH, mat, add, root) {
    const eb = (x, y, z) => sdRBox(Math.abs(x) - 0.0315, y - 0.004, z - 0.083, 0.02, 0.0155, 0.019, 0.0);
    const fine = clipGeo(surfaceNets((x, y, z) => hf(x, y, z) + 0.0004 * sstep(0.0, -0.005, eb(x, y, z)), [-0.07, -0.13, 0.025], [0.07, 0.054, 0.135], 0.0036), (x, y, z) => fbox(x, y, z) < 0 && eb(x, y, z) > -0.004);
    vcol(fine, col); aoCol(fine, hf, 0.0035, 0.32); fine.applyMatrix4(MH); const fm = add(root, fine, mat); fm.name = 'face'; fm.castShadow = false;
    for (const sg of [-1, 1]) {
      const eg = clipGeo(surfaceNets(hf, [sg * 0.0315 - 0.024, -0.016, 0.06], [sg * 0.0315 + 0.024, 0.024, 0.108], 0.0021), (x, y, z) => eb(x, y, z) < 0);
      vcol(eg, col); aoCol(eg, hf, 0.0025, 0.32); eg.applyMatrix4(MH); const em = add(root, eg, mat); em.name = 'face'; em.castShadow = false;
    }
  }

  // ================================================================== HIM
  function buildHim(ctx) {
    const M = mats(), root = new THREE.Group(); root.name = 'him';
    let triCount = 0; const add = (parent, geo, mat, x, y, z, o) => { triCount += tris(geo); return LIB.mesh(parent, geo, mat, x || 0, y || 0, z || 0, o); };
    const tmp = [0, 0, 0], tmp2 = [0, 0, 0], DBG = ctx.dbg;
    const logD = ctx.logD;
    const S = 1.0;
    const TW = 0.0; // chest turned slightly to his left (towards the neck of the guitar)
    const spine = makeSpine({ S, ya: 0.905, anchor: V(0, 0.468, 0.03), phi: (y) => lerp(-0.12, 0.17, sstep(0.95, 1.32, y)), L: (y) => V(1, 0, 0).lerp(V(Math.cos(TW), 0, -Math.sin(TW)), sstep(1.0, 1.4, y)) });
    const toC = spine.toC, toW = spine.toW;
    // joints
    const HJL = toW(0.091, 0.905, 0.008), HJR = toW(-0.091, 0.905, 0.008);
    const SJL = toW(0.176, 1.415, -0.014), SJR = toW(-0.176, 1.415, -0.014);
    const AKL = V(0.17, 0.09, 0.56), AKR = V(-0.15, 0.09, 0.575);
    const KL = ik(HJL, AKL, 0.43, 0.425, V(0.25, 1, 0.3)), KR = ik(HJR, AKR, 0.43, 0.425, V(-0.15, 1, 0.3));
    DBG.him = { HJL, HJR, KL, KR, SJL, SJR };
    const legs = [[A3(HJL), A3(KL), A3(AKL)], [A3(HJR), A3(KR), A3(AKR)]];

    // ---------------- guitar placement ----------------
    const GT = buildGuitar();
    const el = 0.27, yw = 0.30, tau = 0.24;
    const gy = V(Math.cos(el) * Math.cos(yw), Math.sin(el), Math.cos(el) * Math.sin(yw)).normalize();
    const gz = orth(V(0, Math.sin(tau), Math.cos(tau)), gy);
    const gx = gy.clone().cross(gz);
    // waist edge rests on the right thigh, close to the belly
    const thighAt = (Lg, zz) => { const a = V(...Lg[0]), b = V(...Lg[1]); const t = (zz - a.z) / (b.z - a.z); return a.clone().lerp(b, t); };
    const Ct = thighAt(legs[1], 0.2).add(V(0.012, 0.08, 0));
    const GO = Ct.clone().addScaledVector(gx, -0.1265).addScaledVector(gy, -0.31).addScaledVector(gz, -0.05);
    const GM = new THREE.Matrix4().makeBasis(gx, gy, gz).setPosition(GO), GMi = GM.clone().invert(), gme = GMi.elements;
    const toG = (x, y, z, o) => { o[0] = gme[0] * x + gme[4] * y + gme[8] * z + gme[12]; o[1] = gme[1] * x + gme[5] * y + gme[9] * z + gme[13]; o[2] = gme[2] * x + gme[6] * y + gme[10] * z + gme[14]; return o; };
    const gW = (p) => V(p[0], p[1], p[2]).applyMatrix4(GM);
    const gq = [0, 0, 0];
    const guitarD = (x, y, z) => { toG(x, y, z, gq); return Math.min(GT.bodySD(gq[0], gq[1], gq[2]), GT.neckSD(gq[0], gq[1], gq[2])); };
    // push the guitar out of the belly (the back may just touch the hoodie)
    {
      let worst = 1e9, at = null;
      for (let yy = 0.02; yy < 0.5; yy += 0.02) for (let xx = -0.2; xx <= 0.2; xx += 0.02) { if (GT.bodySD(xx, yy, 0.002) > 0) continue; const p = gW([xx, yy, 0.0]); toC(p.x, p.y, p.z, tmp); if (tmp[1] < 0.85 || tmp[1] > 1.45) continue; const d = torsoM(tmp[0], tmp[1], tmp[2]); if (d < worst) { worst = d; at = [xx, yy]; } }
      DBG.gBelly = worst; DBG.gBellyAt = at;
      const allow = -0.012; // the belly gives a little where the back of the guitar presses in
      if (worst < allow) { GO.addScaledVector(gz, allow - worst); GM.setPosition(GO); GMi.copy(GM).invert(); }
    }
    GT.g.applyMatrix4(GM); root.add(GT.g);
    { let n = 0; GT.g.traverse(o => { if (o.isMesh) n += tris(o.geometry); }); triCount += n; DBG.guitarTris = n; }

    // ---------------- left hand: G chord at frets 2-3 ----------------
    const HSC = 1.03;
    const nAlong = gy.clone(), nUp = gx.clone().negate(), nFace = gz.clone();
    const fretMid = (n) => (GT.fretY(n) + GT.fretY(n - 1)) / 2;
    const target = (str, fret) => { const y = GT.fretY(fret) + 0.28 * (GT.fretY(fret - 1) - GT.fretY(fret)); const p = GT.strPt(str, y); return gW([p[0], p[1], p[2]]); };
    const chord = [[1, 2], [0, 3], [5, 3]]; // index: A string fret 2, middle: low E fret 3, ring: high e fret 3
    const LTILT = 0.72;
    const lX = nUp.clone().multiplyScalar(Math.cos(LTILT)).addScaledVector(nFace, Math.sin(LTILT)).addScaledVector(nAlong, 0.22).normalize();
    const lY = orth(nFace.clone().multiplyScalar(Math.cos(LTILT)).addScaledVector(nUp, -Math.sin(LTILT)).addScaledVector(nAlong, -0.1), lX);
    const lZ = lY.clone().cross(lX);
    const yMid = (GT.fretY(2) + GT.fretY(3)) / 2 - 0.004;
    const nc = GT.strPt(5, yMid); // treble edge side
    const mcpW = gW([0.0, yMid, GT.fbTop]).addScaledVector(nUp, -0.031).addScaledVector(nFace, 0.004);
    const WL = mcpW.clone().addScaledVector(lX, -0.093 * HSC).addScaledVector(lZ, 0.007 * HSC); // mirrored: z sign flipped
    const lhx = handXf(WL, lX, lY, lZ, true, HSC);
    const lChains = []; DBG.lfErr = [];
    const nFaceL = lhx.dirL(nFace);
    chord.forEach((c, i) => {
      const t = target(c[0], c[1]).addScaledVector(nFace, FING[i].rad[3] * HSC * 0.95);
      const tl = [0, 0, 0]; lhx.toL(t.x, t.y, t.z, tl);
      const r = reachFinger(FING[i], tl, [-nFaceL[0], -nFaceL[1], -nFaceL[2]]); lChains.push(r.pts); DBG.lfErr.push(+r.err.toFixed(4));
    });
    lChains.push(fingerChain(FING[3], [0.55, 0.9, 0.5, -0.08])); // pinky relaxed, hovering
    { const q = [0, 0, 0]; DBG.lchG = lChains.map(ch => ch.map(p => { const w = lhx.toW(p); toG(w.x, w.y, w.z, q); return q.map(v => +v.toFixed(3)).join(','); }).join(' | ')); toG(WL.x, WL.y, WL.z, q); DBG.WLg = q.map(v => +v.toFixed(3)); DBG.tgtG = chord.map(c => { const w = target(c[0], c[1]); toG(w.x, w.y, w.z, q); return q.map(v => +v.toFixed(3)).join(','); }).join(' | '); }
    // thumb behind the neck, pad against it, just reaching over the top edge
    const thW = gW([-0.012, yMid + 0.012, 0.0756 - 0.0085]);
    const thL = [0, 0, 0]; lhx.toL(thW.x, thW.y, thW.z, thL);
    const lThumb = thumbChain(thL, [0.0, -0.01, 0.01]);
    const lHand = handSDF(lChains, lThumb);
    DBG.lThumbErr = Math.hypot(lThumb[3][0] - thL[0], lThumb[3][1] - thL[1], lThumb[3][2] - thL[2]);

    // ---------------- right hand: pick over the strings ----------------
    const rest = (() => { const p = GT.strPt(0, 0.418); return [p[0] - 0.011, p[1], p[2] + 0.0015]; })();
    const pickRestW = gW(rest);
    const rX = gx.clone().multiplyScalar(0.72).addScaledVector(gy, 0.5).addScaledVector(gz, 0.2).normalize();
    const rY = orth(gz.clone().addScaledVector(gx, -0.25).addScaledVector(gy, -0.1), rX);
    const rZ = rY.clone().cross(rX);
    const rAng = [[0.95, 1.25, 0.75, 0.05], [1.2, 1.35, 0.8, 0.0], [1.3, 1.35, 0.8, -0.06], [1.4, 1.25, 0.8, -0.12]];
    const rChains = FING.map((F, i) => fingerChain(F, rAng[i]));
    const iD = rChains[0][2], iE = rChains[0][3], iMid = [(iD[0] + iE[0]) / 2, (iD[1] + iE[1]) / 2, (iD[2] + iE[2]) / 2];
    const rThT = [iMid[0] - 0.004, iMid[1] + 0.002, iMid[2] + 0.0067 + 0.0081 + 0.0015];
    const rThumb = thumbChain(rThT, [0.0, 0.012, 0.006]);
    const rHand = handSDF(rChains, rThumb);
    // pick between the thumb pad and the side of the index tip; it points into the strings
    const pc = [(iMid[0] + rThumb[3][0]) / 2, (iMid[1] + rThumb[3][1]) / 2 - 0.004, (iMid[2] + rThumb[3][2]) / 2];
    const pn = V(rThumb[3][0] - iMid[0], rThumb[3][1] - iMid[1], rThumb[3][2] - iMid[2]).normalize();
    const pdir = orth(V(0.25, -1, 0), pn);
    pn.applyAxisAngle(pdir, 0.45);
    const pickTipL = [pc[0] + pdir.x * 0.017, pc[1] + pdir.y * 0.017, pc[2] + pdir.z * 0.017];
    // wrist so the pick tip sits at the rest point
    const rhx0 = handXf(V(0, 0, 0), rX, rY, rZ, false, HSC);
    const WR = pickRestW.clone().sub(rhx0.toW(pickTipL));
    const rhx = handXf(WR, rX, rY, rZ, false, HSC);
    const Ewant = gW([-0.24, 0.08, 0.11]);
    const ER = ik(SJR, WR, 0.30, 0.265, Ewant.clone().sub(SJR));
    { const q = [0, 0, 0]; toG(ER.x, ER.y, ER.z, q); DBG.ERg = q.map(v => +v.toFixed(3)); toG(WR.x, WR.y, WR.z, q); DBG.WRg = q.map(v => +v.toFixed(3)); }
    const EL = ik(SJL, WL, 0.30, 0.265, V(0.5, -0.9, -0.15));
    DBG.him.ER = ER; DBG.him.EL = EL; DBG.him.WR = WR; DBG.him.WL = WL; DBG.rReach = SJR.distanceTo(WR); DBG.lReach = SJL.distanceTo(WL);

    // ---------------- head ----------------
    const LIDm = { v: { e0: -0.1, h: 0.33 } };
    const headM = makeHeadSDF(HEAD_M, LIDm);
    const top = spine.frame(1.6);
    let hx = top.L.clone(), hy = top.T.clone(), hz = top.F.clone();
    const yawH = 0.2, pitchH = 0.30, rollH = -0.06;
    const qy = new THREE.Quaternion().setFromAxisAngle(hy, yawH); hx.applyQuaternion(qy); hz.applyQuaternion(qy);
    const qp = new THREE.Quaternion().setFromAxisAngle(hx, pitchH); hy.applyQuaternion(qp); hz.applyQuaternion(qp);
    const qr = new THREE.Quaternion().setFromAxisAngle(hz, rollH); hx.applyQuaternion(qr); hy.applyQuaternion(qr);
    const PA = toW(0, 1.575, -0.03);
    const HC = PA.clone().addScaledVector(hy, 0.066).addScaledVector(hz, 0.026);
    const MH = new THREE.Matrix4().makeBasis(hx, hy, hz).setPosition(HC);
    const MHi = MH.clone().invert(), me = MHi.elements;
    const toHead = (x, y, z, o) => { o[0] = me[0] * x + me[4] * y + me[8] * z + me[12]; o[1] = me[1] * x + me[5] * y + me[9] * z + me[13]; o[2] = me[2] * x + me[6] * y + me[10] * z + me[14]; return o; };
    const eyeW = [V(EYE[0], EYE[1], EYE[2]).applyMatrix4(MH), V(-EYE[0], EYE[1], EYE[2]).applyMatrix4(MH)];
    const gazeT = target(1, 2).lerp(pickRestW, 0.25);
    const gazeL = gazeT.clone().sub(eyeW[0].clone().add(eyeW[1]).multiplyScalar(0.5)).normalize().transformDirection(MHi);
    LIDm.v = { e0: clamp(Math.atan2(gazeL.y, Math.hypot(gazeL.x, gazeL.z)) * 0.62, -0.32, 0.3), h: 0.34 };
    DBG.him.gaze = gazeL; DBG.him.lid = LIDm.v;
    const NTv = V(0, -0.05, -0.035).applyMatrix4(MH), NB0 = toW(0, 1.43, -0.012);
    const NBv = NB0.clone().lerp(NTv, 0.12), NB = A3(NBv), NT = A3(NTv);
    const NMv = toW(0, 1.505, -0.004).lerp(NTv, 0.3), NM = A3(NMv);
    const nU = NTv.clone().sub(NBv).normalize(), nF = hz.clone().addScaledVector(nU, -hz.dot(nU)).normalize();
    const ADAM = A3(NMv.clone().lerp(NTv, 0.35).addScaledVector(nF, 0.045));
    const neckD = (x, y, z) => smin(sdCap(x, y, z, NB, NM, 0.054, 0.051), sdCap(x, y, z, NM, NT, 0.05, 0.046), 0.02);

    // ---------------- hoodie ----------------
    const uRf = WR.clone().sub(ER).normalize(), uLf = WL.clone().sub(EL).normalize();
    const SLv = A3(SJL), SRv = A3(SJR), ELv = A3(EL), ERv = A3(ER);
    const WLc = A3(WL.clone().addScaledVector(uLf, -0.012)), WRc = A3(WR.clone().addScaledVector(uRf, -0.012));
    // the hood lies folded on his upper back; the drawstrings come out of eyelets at the front of the neck opening
    function hoodieC(a, y, b, nk) {
      let d = torsoM(a, y, b);
      const ease = 0.016 + 0.01 * sstep(1.16, 0.98, y) * sstep(0.0, 0.07, b) + 0.004 * sstep(0.0, -0.08, b);
      d -= ease;
      // seated slouch: soft horizontal folds over the stomach, pull folds at the sides, drape on the back
      d += sstep(0.03, 0.09, b) * sstep(1.18, 1.0, y) * sstep(0.88, 0.96, y) * 0.0042 * Math.sin(y * 105 + 1.4 * Math.sin(a * 13));
      d += sstep(0.12, 0.16, Math.abs(a)) * sstep(1.32, 1.08, y) * 0.0024 * Math.sin(y * 70 + Math.abs(a) * 30 + b * 40);
      d += sstep(-0.03, -0.09, b) * 0.0018 * Math.sin(a * 38 + y * 9) * sstep(1.0, 1.2, y);
      d += 0.0007 * Math.sin(a * 47 + y * 17) * Math.sin(b * 41 - y * 29);
      // waistband rib
      const hy0 = 0.79 + 0.095 * sstep(-0.04, 0.07, b);
      d = smax(d, hy0 - y, 0.006);
      d += 0.004 * sstep(hy0 + 0.064, hy0 + 0.056, y) - 0.002 * sstep(hy0 + 0.004, hy0 + 0.0, y);
      d += 0.0006 * Math.sin(Math.atan2(a, b) * 140) * sstep(hy0 + 0.064, hy0 + 0.056, y);
      // kangaroo pocket: a raised panel on the stomach with a seam
      if (b > 0.03) { const pk = sdRBox(a, y - 0.99, 0, 0.115 - (y - 0.93) * 0.25, 0.06, 1, 0.01); d -= 0.0022 * sstep(0.003, -0.004, pk); d += 0.001 * sstep(0.003, 0.0, Math.abs(pk)); }
      // neck opening
      d = smax(d, -sdEll(a, y, b, [0, 1.505, 0.006], [0.072, 0.1, 0.082]), 0.014);
      return d;
    }
    function hoodC(a, y, b) { // the hood, down: a soft roll around the neck and the bag lying on the upper back
      const th = Math.atan2(a, b); // 0 = front
      const back = 0.5 - 0.5 * Math.cos(th);
      const R = 0.083 + 0.012 * back, yr = 1.452 + 0.03 * back - 0.012 * (1 - back);
      const rr = 0.012 + 0.016 * back;
      let d = Math.hypot(Math.hypot(a, b + 0.004) - R - rr * 0.6, (y - yr) * 1.15) - rr;
      // the bag of the hood folded on the back
      const tb = torsoM(a, y, b);
      const reg = sdEll(a, y, b, [0, 1.35, -0.11], [0.125, 0.15, 0.2]);
      const bag = smax(smax(tb - 0.045, -(tb - 0.008), 0.006), reg, 0.03);
      d = smin(d, bag, 0.03);
      d += 0.0018 * Math.exp(-a * a / 0.00004) * sstep(1.42, 1.3, y) * sstep(-0.05, -0.1, b); // centre seam of the hood
      // the front: the two edges of the hood meet in a shallow V at the throat
      d = smax(d, -sdEll(a, y, b, [0, 1.445, 0.09], [0.022, 0.03, 0.03]), 0.01);
      return d;
    }
    const gcarve = (d, x, y, z) => { const gd = guitarD(x, y, z); return gd < 0.03 ? smax(d, -(gd - 0.0015), 0.01) : d; };
    function sleeveD(x, y, z, S0, E0, W0, foldSeed) {
      let d = sdCap(x, y, z, S0, E0, 0.062, 0.055);
      const tf = capT(x, y, z, E0, W0);
      let f = sdCap(x, y, z, E0, W0, 0.055, 0.042);
      // bunching around the elbow and above the cuff
      f += 0.0035 * Math.sin(tf * 40 + foldSeed + 3 * Math.sin(Math.atan2(y - E0[1], x - E0[0]) * 2)) * sstep(0.45, 0.05, tf) * sstep(-0.1, 0.05, tf);
      f += 0.003 * Math.sin(tf * 70 + foldSeed * 2) * sstep(0.68, 0.9, tf);
      d = smin(d, f, 0.03);
      d = smax(d, (tf - 1) * Math.hypot(W0[0] - E0[0], W0[1] - E0[1], W0[2] - E0[2]) - 0.0, 0.004);
      return d;
    }
    function hoodieW(x, y, z, noCarve) {
      toC(x, y, z, tmp);
      let d = hoodieC(tmp[0], tmp[1], tmp[2]);
      d = smin(d, hoodC(tmp[0], tmp[1], tmp[2]), 0.012);
      d = smax(d, 0.006 - neckD(x, y, z), 0.006);
      d = smin(d, sleeveD(x, y, z, SLv, ELv, WLc, 0.7), 0.04);
      d = smin(d, sleeveD(x, y, z, SRv, ERv, WRc, 2.3), 0.04);
      d = smax(d, -(logD(x, y, z) - 0.002), 0.012);
      if (!noCarve) d = gcarve(d, x, y, z);
      return d;
    }
    const hoodGeo = surfaceNets(hoodieW, [-0.42, 0.36, -0.26], [0.42, 1.24, 0.5], 0.0125);
    aoCol(hoodGeo, (x, y, z) => hoodieW(x, y, z, true), 0.012, 0.32);
    const hoodMesh = add(root, hoodGeo, M.hoodie); hoodMesh.name = 'hoodie';
    // cuffs (open ribbed tubes)
    function cuff(parent, E0, W0, seed, offset) {
      const u = W0.clone().sub(E0).normalize(), n1 = orth(V(0, 1, 0), u), n2 = u.clone().cross(n1), rows = [];
      for (let i = 0; i <= 6; i++) {
        const s = i / 6, row = [];
        for (let j = 0; j < 28; j++) {
          const a = j / 28 * TAU; const dist = lerp(-0.07, -0.006, s) + 0.002 * Math.sin(2 * a + seed);
          const r = lerp(0.044, 0.038, sstep(0, 0.45, s)) + 0.0009 * Math.sin(a * 14);
          row.push(A3(W0.clone().addScaledVector(u, dist).addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r).sub(offset || V(0, 0, 0))));
        }
        rows.push(row);
      }
      const r2 = []; for (let j = 0; j < 28; j++) { const a = j / 28 * TAU; r2.push(A3(W0.clone().addScaledVector(u, -0.02).addScaledVector(n1, Math.cos(a) * 0.033).addScaledVector(n2, Math.sin(a) * 0.033).sub(offset || V(0, 0, 0)))); }
      rows.push(r2);
      const g = loft(rows, true, (i, j) => [j / 28 * 6, i * 0.3]); vcol(g, (x, y, z, i) => { const k = Math.floor(i / 29) >= 6 ? 0.45 : 0.92; return [k, k, k]; });
      return add(parent, g, M.hoodie2);
    }
    cuff(root, EL, WL, 1.1);
    // drawstrings
    const cordG = new THREE.Group(); root.add(cordG);
    {
      for (const sg of [-1, 1]) {
        const ey = toW(sg * 0.03, 1.452, 0.0); toC(ey.x, ey.y, ey.z, tmp);
        // walk outward to the hoodie surface
        let p = toW(sg * 0.032, 1.452, 0.12); for (let k = 0; k < 80; k++) { const d = hoodieW(p.x, p.y, p.z, true); if (Math.abs(d) < 0.0005) break; const gq2 = gradAt((x, y, z) => hoodieW(x, y, z, true), p.x, p.y, p.z, 0.002); p.x -= gq2[0] * d; p.y -= gq2[1] * d; p.z -= gq2[2] * d; }
        const pts = [p.clone()]; let q = p.clone(); const step = 0.012, Lc = sg < 0 ? 0.25 : 0.23;
        for (let s = step; s <= Lc; s += step) {
          q = q.clone().add(V(0.0, -step, 0.0));
          const hfun = (x, y, z) => hoodieW(x, y, z, true);
          const d = hfun(q.x, q.y, q.z); if (d < 0.0045) { const gq3 = gradAt(hfun, q.x, q.y, q.z, 0.002); q.addScaledVector(V(gq3[0], gq3[1], gq3[2]), 0.0045 - d); }
          if (guitarD(q.x, q.y, q.z) < 0.012) break; // the end tucks in behind the guitar
          pts.push(q.clone());
        }
        const curve = new THREE.CatmullRomCurve3(pts), N = 40, P = curve.getSpacedPoints(N), rows = [];
        for (let i = 0; i <= N; i++) {
          const T = curve.getTangentAt(i / N), B = orth(V(1, 0, 0), T), Nn = B.clone().cross(T), row = [];
          const ag = i > N - 4;
          for (let j = 0; j < 8; j++) { const a = j / 8 * TAU; row.push(A3(P[i].clone().addScaledVector(B, Math.cos(a) * (ag ? 0.0024 : 0.0034)).addScaledVector(Nn, Math.sin(a) * (ag ? 0.0024 : 0.0013)))); }
          rows.push(row);
        }
        const gcord = loft(rows.slice(0, N - 2), true); add(cordG, gcord, M.cord);
        const gag = loft(rows.slice(N - 3), true); add(cordG, gag, M.aglet);
        // eyelet ring
        const ring = new THREE.TorusGeometry(0.0042, 0.0012, 6, 16); const rm = add(cordG, ring, M.aglet, p.x, p.y, p.z);
        const nn = gradAt((x, y, z) => hoodieW(x, y, z, true), p.x, p.y, p.z, 0.002); rm.quaternion.setFromUnitVectors(V(0, 0, 1), V(nn[0], nn[1], nn[2]));
      }
    }

    // ---------------- jeans ----------------
    function jeansW(x, y, z) {
      let d = 1e9;
      if (y > 0.28) { toC(x, y, z, tmp); d = smax(torsoM(tmp[0], tmp[1], tmp[2]) - 0.008, tmp[1] - 0.985, 0.006); d = smax(d, 0.80 - tmp[1], 0.04); d += 0.0025 * Math.exp(-tmp[0] * tmp[0] / 0.00012) * sstep(-0.03, -0.07, tmp[2]); }
      for (let i = 0; i < 2; i++) {
        const Lg = legs[i];
        let e = sdCap(x, y, z, Lg[0], Lg[1], 0.084, 0.068);
        e = smin(e, sdCap(x, y, z, Lg[1], [Lg[2][0], Lg[2][1] - 0.02, Lg[2][2]], 0.064, 0.056), 0.03);
        const tt = capT(x, y, z, Lg[0], Lg[1]), kd = Math.hypot(x - Lg[1][0], y - Lg[1][1], z - Lg[1][2]);
        // hip-crease fan on top of the thigh, bunching behind the knee, stacking over the shoe, soft drape on the shin
        e += sstep(0.25, 0.05, tt) * sstep(0.45, 0.6, y) * 0.004 * Math.sin(tt * 60 + x * 50 + i * 2);
        e += sstep(0.12, 0.05, kd) * sstep(Lg[1][2] - 0.02, Lg[1][2] - 0.08, z) * 0.004 * Math.sin(y * 90 + x * 40 + i);
        e += sstep(0.22, 0.1, y) * 0.0045 * Math.sin(y * 85 + 2.0 * Math.sin(x * 40 + z * 50) + i * 2);
        e += 0.0016 * Math.sin(Math.atan2(z - Lg[1][2], x - Lg[1][0]) * 5 + y * 9 + i) * sstep(0.45, 0.25, y);
        // outer side seam (a faint ridge)
        const side = Math.abs((x - Lg[1][0]) * (i ? -1 : 1)) ;
        e -= 0.0006 * sstep(0.004, 0.0, Math.abs(side - 0.07)) * sstep(0.35, 0.0, Math.abs(y - 0.3));
        d = smin(d, e, 0.04);
      }
      d = smax(d, -(logD(x, y, z) - 0.0015), 0.014); // sitting on the log: the seat flattens against it
      d = gcarve(d, x, y, z);
      return smax(d, 0.07 - y, 0.004);
    }
    const jGeo = surfaceNets(jeansW, [-0.33, 0.05, -0.2], [0.33, 0.66, 0.66], 0.0162);
    aoCol(jGeo, jeansW, 0.012, 0.3);
    add(root, jGeo, M.jeansM).name = 'jeans';

    // ---------------- sneakers ----------------
    function shoe(A, dir, mirror, sdf, matU, matSole, white) {
      const g = new THREE.Group(); const yawS = Math.atan2(dir.x, dir.z);
      g.position.set(A.x - dir.x * 0.075, 0, A.z - dir.z * 0.075); g.rotation.y = yawS; root.add(g);
      const s = mirror ? -1 : 1, f = (x, y, z) => sdf(x * s, y, z);
      const geo = surfaceNets(f, [-0.065, 0.0, -0.03], [0.065, 0.18, 0.29], 0.0098);
      vcol(geo, (x, y, z) => { let c = 1 + 0.03 * vnoise(x * 300, y * 300, z * 300); // toe-box seam and a heel tab
        c -= 0.12 * sstep(0.0025, 0.0, Math.abs(z - 0.17 - 0.3 * (y - 0.04))) * sstep(0.03, 0.05, y);
        return [c, c, c]; });
      aoCol(geo, f, 0.008, 0.3); add(g, geo, matU);
      const pts = [];
      for (let k = 0; k < 48; k++) { const a = k / 48 * TAU, dx = Math.cos(a), dz = Math.sin(a); let r = 0.2; const cz = 0.13; for (let it = 0; it < 80; it++) { const dd = f(dx * r, 0.035, cz + dz * r); if (Math.abs(dd) < 0.0003) break; r -= dd * 0.8; } pts.push(new THREE.Vector2(dx * (r + 0.0045), cz + dz * (r + 0.0045))); }
      const shp = new THREE.Shape(pts);
      const sh = white ? 0.024 : 0.018;
      const sg = new THREE.ExtrudeGeometry(shp, { depth: sh, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
      sg.rotateX(PI / 2); sg.translate(0, sh + 0.003, 0); sg.computeVertexNormals();
      add(g, sg, matSole);
      if (white) { // grey foxing stripe and laces
        const st = new THREE.ExtrudeGeometry(shp, { depth: 0.003, bevelEnabled: false, curveSegments: 4 }); st.rotateX(PI / 2); st.translate(0, 0.0105, 0); st.scale(1.004, 1, 1.004); add(g, st, M.sneakerTrim);
        for (let k = 0; k < 5; k++) {
          const zz = 0.1 + k * 0.016; let yy = 0.13; for (let it = 0; it < 60; it++) { const dd = f(0.002 * s, yy, zz); if (Math.abs(dd) < 0.0002) break; yy -= dd * 0.8; }
          const gr = gradAt(f, 0.002 * s, yy, zz, 0.001), tilt = Math.atan2(gr[2], gr[1]);
          const m = LIB.rbox(g, 0.032, 0.003, 0.005, 0.0014, M.lace, 0.002 * s, yy + 0.0013, zz, { rx: tilt, seg: 1 }); triCount += 108; m.rotation.y = (k % 2 ? 0.1 : -0.1);
        }
      }
      return g;
    }
    shoe(AKL, V(0.22, 0, 1).normalize(), true, sneakerSDF, M.sneaker, M.sneakerSole, true);
    shoe(AKR, V(-0.16, 0, 1).normalize(), false, sneakerSDF, M.sneaker, M.sneakerSole, true);

    // ---------------- head mesh ----------------
    const SKP = { palm: [0.2, 0.16, 0.14], nail: [1.35, 1.12, 1.02] };
    const HL_T = table([[0.0, 0.58], [0.25, 0.585], [0.45, 0.62], [0.62, 0.58], [0.82, 0.35], [0.98, 0.0], [1.07, -0.33], [1.16, -0.30], [1.24, 0.12], [1.45, 0.20], [1.7, 0.16], [1.9, -0.05], [2.1, -0.45], [2.5, -0.68], [3.15, -0.74]]);
    const HCEN = [0, 0.016, -0.012];
    const hairCoords = (x, y, z) => { const dx = x, dy = y - HCEN[1], dz = z - HCEN[2]; return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
    const hairEdge = (x, y, z) => { const c = hairCoords(x, y, z), az = Math.abs(c[0]); return c[1] - HL_T(az)[0] + 0.03 * vnoise(c[0] * 9, c[1] * 9, 3.1) + 0.014 * vnoise(c[0] * 30, c[1] * 30, 7.7) + 0.006 * vnoise(c[0] * 80, c[1] * 80, 1.7); };
    function headCol(x, y, z) {
      const ax = Math.abs(x); let r = 1, g = 1, b = 1;
      const n = 1 + 0.03 * vnoise(x * 120, y * 120, z * 120) + 0.015 * vnoise(x * 400, y * 400, z * 400);
      r *= n; g *= n; b *= n;
      if (z > 0.03) {
        const eo = Math.exp(-(Math.pow(ax - 0.032, 2) / 0.00035 + Math.pow(y - 0.0, 2) / 0.00012)); r *= 1 - 0.08 * eo; g *= 1 - 0.1 * eo; b *= 1 - 0.08 * eo;
        const ck = Math.exp(-(Math.pow(ax - 0.044, 2) + Math.pow(y + 0.026, 2)) / 0.0005); r *= 1 + 0.05 * ck; g *= 1 - 0.015 * ck;
        const ns = Math.exp(-(x * x + Math.pow(y + 0.03, 2)) / 0.0002) * sstep(0.09, 0.105, z); r *= 1 + 0.04 * ns; g *= 1 - 0.01 * ns;
        const lp = Math.pow(x / 0.0195, 2) + Math.pow((y + 0.0617) / 0.0105, 2);
        if (lp < 1.6) { const k = sstep(1.6, 0.6, lp); r *= 1 - 0.1 * k; g *= 1 - 0.22 * k; b *= 1 - 0.16 * k; }
        const by = 0.0255 + 0.0035 * (1 - Math.pow((ax - 0.036) / 0.022, 2)) - 0.0035 * sstep(0.045, 0.058, ax);
        const bw = lerp(0.0048, 0.0018, sstep(0.015, 0.057, ax));
        const bm = sstep(1.4, 0.3, Math.abs(y - by) / bw) * sstep(0.009, 0.014, ax) * sstep(0.06, 0.05, ax);
        const bk = bm * (0.3 + 0.15 * vnoise(x * 700, y * 1800, z * 300));
        r *= 1 - 0.5 * bk; g *= 1 - 0.52 * bk; b *= 1 - 0.52 * bk;
        const st = (sstep(-0.05, -0.058, y) * sstep(0.03, 0.01, Math.abs(x)) * sstep(-0.044, -0.05, y)) + sstep(-0.075, -0.09, y) * sstep(0.04, 0.03, Math.abs(x));
        const stb = Math.min(1, st) * (0.7 + 0.3 * vnoise(x * 300, y * 300, z * 300));
        r *= 1 - 0.06 * stb; g *= 1 - 0.06 * stb; b *= 1 - 0.045 * stb;
      }
      const jw = sstep(-0.06, -0.09, y) * sstep(0.03, 0.06, ax) * 0.05; r *= 1 - jw; g *= 1 - jw; b *= 1 - jw;
      // scalp under the hair; a soft, sparse transition at the hairline (no painted edge)
      const he = hairEdge(x, y, z), hcov = sstep(0.0, 0.07, he) * (0.75 + 0.25 * vnoise(x * 1500, y * 1500, z * 1500));
      r = lerp(r, 0.16, hcov); g = lerp(g, 0.13, hcov); b = lerp(b, 0.12, hcov);
      // ears a touch redder
      if (ax > 0.065) { r *= 1.04; g *= 0.98; }
      return [r, g, b];
    }
    {
      const fbox = (x, y, z) => sdRBox(x, y + 0.038, z - 0.08, 0.066, 0.09, 0.052, 0.0);
      const coarse = clipGeo(surfaceNets((x, y, z) => headM(x, y, z) + 0.0006 * sstep(0.0, -0.008, fbox(x, y, z)), [-0.11, -0.135, -0.13], [0.11, 0.12, 0.13], 0.0084), (x, y, z) => fbox(x, y, z) > -0.01);
      vcol(coarse, headCol); aoCol(coarse, headM, 0.004, 0.3); coarse.applyMatrix4(MH); add(root, coarse, M.skinMFar).name = 'head';
      facePatches(headM, fbox, headCol, MH, M.skinM, add, root);
    }
    for (let i = 0; i < 2; i++) {
      const eg = new THREE.SphereGeometry(EYE_R, 24, 14); triCount += tris(eg);
      const m = LIB.mesh(root, eg, M.eye, eyeW[i].x, eyeW[i].y, eyeW[i].z);
      m.quaternion.setFromUnitVectors(V(0, 0, 1), gazeT.clone().sub(eyeW[i]).normalize());
    }
    // brows + lashes as strands
    {
      const strands = [], R = LIB.rnd(5), f = headM;
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 300; k++) {
          const t = Math.pow(R(), 1.15), ax = lerp(0.010, 0.057, t);
          const by = 0.0255 + 0.0035 * (1 - Math.pow((ax - 0.036) / 0.022, 2)) - 0.0035 * sstep(0.045, 0.058, ax);
          const bw = lerp(0.0048, 0.0018, sstep(0.015, 0.057, ax));
          if (R() > 1 - 0.55 * sstep(0.048, 0.058, ax)) continue;
          const p0 = project(f, [sgn * ax, by + (R() - 0.5) * 2 * bw, 0.12], 0.0001);
          const nrm = gradAt(f, p0[0], p0[1], p0[2], 0.0008);
          const up = 1 - sstep(0.012, 0.024, ax);
          let dir = V(sgn * (0.3 + 0.7 * (1 - up)), 0.9 * up + 0.18 - 0.35 * sstep(0.042, 0.056, ax) + (R() - 0.5) * 0.35, 0).normalize();
          const nn = V(nrm[0], nrm[1], nrm[2]); dir.addScaledVector(nn, -dir.dot(nn)).normalize();
          const Ls = lerp(0.0038, 0.0062, R()), pts = [];
          for (let j = 0; j <= 2; j++) { const s = j / 2 * Ls, l = 0.00015 + 0.00035 * j / 2; pts.push([p0[0] + dir.x * s + nn.x * l, p0[1] + dir.y * s + nn.y * l, p0[2] + dir.z * s + nn.z * l]); }
          const c = 0.55 + R() * 0.6;
          strands.push({ pts, w: 0.00034, nrm, c: [0.016 * c, 0.012 * c, 0.01 * c] });
        }
        const LID = LIDm.v;
        for (let k = 0; k < 30; k++) {
          const az = lerp(-0.8, 0.9, k / 29 + (R() - 0.5) * 0.03), hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / 1.05, 2)) - 0.03;
          const el = LID.e0 + 0.025 * Math.sin(az * 2) + hh + 0.015, rr = EYE_R + 0.0028;
          const q = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          const p0 = [sgn * (EYE[0] + q.x * rr), EYE[1] + q.y * rr, EYE[2] + q.z * rr];
          const out = V(sgn * q.x, q.y, q.z), upv = V(0, 1, 0); const Ls = 0.005 + 0.0015 * Math.sin(k / 29 * PI), pts = [];
          for (let j = 0; j <= 2; j++) { const s = j / 2; const d = out.clone().multiplyScalar(s * Ls).addScaledVector(upv, s * s * Ls * 0.5); pts.push([p0[0] + d.x, p0[1] + d.y, p0[2] + d.z]); }
          strands.push({ pts, w: 0.0003, nrm: A3(upv.clone().cross(V(sgn, 0, 0)).normalize()), c: [0.012, 0.009, 0.008] });
        }
      }
      const sg = strandGeo(strands); sg.applyMatrix4(MH); const bm = add(root, sg, M.strand); bm.name = 'brows'; bm.castShadow = false;
    }
    // ---------------- hair: short, straight, black; tapered sides, a little longer on top, combed forward and to his right ----------------
    const SKULL = [[0, 0.016, -0.014], [0.075, 0.088, 0.099]];
    const skD = (x, y, z) => smin(sdEll(x, y, z, SKULL[0], SKULL[1]), sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);
    const topW = (az, el) => sstep(0.3, 0.75, el) * sstep(1.7, 1.05, Math.abs(az));
    function shellTh(x, y, z) {
      const c = hairCoords(x, y, z), az = c[0], el = c[1];
      const back = sstep(1.6, 2.4, Math.abs(az));
      return Math.max(0.001, lerp(0.0035, 0.0095, topW(az, el)) + 0.0025 * sstep(0.2, 0.6, el) * back - 0.0022 * sstep(-0.1, -0.5, el));
    }
    function hairSDF(x, y, z) {
      const sk = skD(x, y, z), he = hairEdge(x, y, z);
      let th = shellTh(x, y, z);
      const c = hairCoords(x, y, z);
      th += 0.0008 * vnoise(c[0] * 7, c[1] * 3, 1.3) + 0.0005 * vnoise(c[0] * 19, c[1] * 6, 4.1);
      const s1 = sstep(-0.01, 0.16, he); // long taper: no step at the hairline
      let d = sk - lerp(-0.0025, th, s1);
      d = smax(d, -sdEll(Math.abs(x), y, z, [0.082, -0.004, -0.016], [0.02, 0.036, 0.026]), 0.004);
      return smax(d, -he * 0.05 - 0.0006, 0.002);
    }
    const HAIRC = LIB.col('#0e0b09'), SCALP = LIB.col('#4a3020');
    const CROWN = V(-0.012, 0.074, -0.052).normalize();
    {
      const hg = surfaceNets(hairSDF, [-0.105, -0.11, -0.13], [0.105, 0.125, 0.125], 0.0058);
      const p = hg.attributes.position, uv = hg.attributes.uv, q = V(0, 0, 0);
      const ref = V(1, 0, 0).addScaledVector(CROWN, -CROWN.x).normalize(), ref2 = CROWN.clone().cross(ref);
      for (let i = 0; i < p.count; i++) { q.set(p.getX(i) - HCEN[0], p.getY(i) - HCEN[1], p.getZ(i) - HCEN[2]).normalize(); const dc = Math.acos(clamp(q.dot(CROWN), -1, 1)); const a = Math.atan2(q.dot(ref2), q.dot(ref)); uv.setXY(i, a / TAU * 16, dc * 2.4); }
      vcol(hg, (x, y, z) => { const he = hairEdge(x, y, z), k = sstep(-0.005, 0.14, he); const n = 1 + 0.15 * vnoise(x * 200, y * 200, z * 200); return [lerp(SCALP.r * 0.6, HAIRC.r * n, k), lerp(SCALP.g * 0.6, HAIRC.g * n, k), lerp(SCALP.b * 0.6, HAIRC.b * n, k)]; });
      hg.applyMatrix4(MH); add(root, hg, M.hair).name = 'hair';
    }
    {
      const CP = V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(CROWN, 0.096);
      const gH = V(0, -1, 0).transformDirection(MHi);
      const flow = (p, n) => {
        const d = p.clone().sub(CP); d.addScaledVector(n, -d.dot(n)); if (d.lengthSq() < 1e-8) d.set(0, 0, 1); d.normalize();
        const c = hairCoords(p.x, p.y, p.z), side = n.clone().cross(d);
        return d.addScaledVector(side, -0.8 * topW(c[0], c[1])).normalize();
      };
      const R = LIB.rnd(77), NR = 5, NS = 10, all = [];
      let made = 0;
      for (let tries = 0; tries < 2400 && made < 72; tries++) {
        const az0 = (R() * 2 - 1) * 1.55, el0 = lerp(0.5, 1.75, R());
        const dir0 = V(Math.sin(az0) * Math.cos(el0), Math.sin(el0), Math.cos(az0) * Math.cos(el0));
        let p = V(...project(skD, A3(V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(dir0, 0.11)), 0));
        if (hairEdge(p.x, p.y, p.z) < 0.16) continue;
        const tw = topW(hairCoords(p.x, p.y, p.z)[0], hairCoords(p.x, p.y, p.z)[1]);
        const Lk = lerp(0.03, 0.055, R()) * lerp(0.7, 1.15, tw), step = Lk / NS, w0 = lerp(0.0035, 0.007, R()), t0 = lerp(0.0011, 0.0018, R()), lift = lerp(0.0002, 0.0014, R());
        const ctr = [], nrm = []; let free = false, dir = null, freeAt = NS;
        for (let i = 0; i <= NS; i++) {
          const g = gradAt(skD, p.x, p.y, p.z, 0.001), n = V(g[0], g[1], g[2]), u = i / NS;
          let c;
          if (!free) {
            const h = shellTh(p.x, p.y, p.z) * lerp(0.55, 1, sstep(0, 0.25, u)) + lift + t0 * 0.5;
            c = p.clone().addScaledVector(n, h);
            dir = flow(p, n);
            p = V(...project(skD, A3(p.clone().addScaledVector(dir, step)), 0));
            if (hairEdge(p.x, p.y, p.z) < 0.05) { if (Math.abs(hairCoords(p.x, p.y, p.z)[0]) < 1.25) { ctr.push(c); nrm.push(n); while (ctr.length <= NS) { ctr.push(c.clone().addScaledVector(dir, 0.0004 * (ctr.length - i))); nrm.push(n); } break; } free = true; p = c.clone(); freeAt = i; }
          } else {
            dir = dir.clone().addScaledVector(gH, 0.12).normalize();
            p = p.clone().addScaledVector(dir, (i - freeAt) * step > 0.009 ? step * 0.2 : step); c = p.clone();
            const hd = headM(c.x, c.y, c.z); if (hd < 0.004) { const gg = gradAt(headM, c.x, c.y, c.z, 0.001); c.addScaledVector(V(gg[0], gg[1], gg[2]), 0.004 - hd); p = c.clone(); }
          }
          ctr.push(c); nrm.push(n);
        }
        const ring = [];
        for (let i = 0; i <= NS; i++) {
          const u = i / NS, c = ctr[i], t = ctr[Math.min(NS, i + 1)].clone().sub(ctr[Math.max(0, i - 1)]).normalize();
          const b = t.clone().cross(nrm[i]).normalize(), n = b.clone().cross(t).normalize();
          const w = w0 * (0.45 + 0.55 * sstep(0, 0.2, u)) * (1 - 0.6 * sstep(0.55, 1, u)), th = t0 * (0.5 + 0.5 * sstep(0, 0.2, u)) * (1 - 0.6 * sstep(0.55, 1, u));
          const row = [];
          for (let j = 0; j < NR; j++) { const a = j / NR * TAU; row.push(A3(c.clone().addScaledVector(b, Math.cos(a) * w * 0.5).addScaledVector(n, Math.sin(a) * th * 0.5 * (Math.sin(a) > 0 ? 1 : 0.6)))); }
          ring.push(row);
        }
        const lg = loft(ring, true, (i, j) => [j / NR * 0.3 + made * 0.13, i / NS * Lk * 30]);
        const k = 0.8 + 0.4 * R(); vcol(lg, () => [HAIRC.r * k, HAIRC.g * k, HAIRC.b * k]);
        all.push(lg); made++;
      }
      const mg = mergeGeos(all); mg.applyMatrix4(MH); add(root, mg, M.hair).name = 'locks';
      DBG.him.locks = made;
      // fine wisps along the hairline and sideburns (break up the edge)
      const strands = [];
      for (let k = 0, made2 = 0; k < 30000 && made2 < 950; k++) {
        const az0 = (R() * 2 - 1) * 2.9, el0 = lerp(-0.8, 0.8, R());
        { const ce = el0 - HL_T(Math.abs(az0))[0]; if (ce < -0.06 || ce > 0.14) continue; } made2++;
        const dir0 = V(Math.sin(az0) * Math.cos(el0), Math.sin(el0), Math.cos(az0) * Math.cos(el0));
        const p0 = project(skD, A3(V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(dir0, 0.11)), 0);
        const he = hairEdge(p0[0], p0[1], p0[2]);
        if (he < -0.02 || he > 0.1) continue;
        const nn = gradAt(skD, p0[0], p0[1], p0[2], 0.001), n = V(nn[0], nn[1], nn[2]);
        const P0 = V(p0[0], p0[1], p0[2]).addScaledVector(n, 0.0004);
        let d = flow(P0, n); if (Math.abs(hairCoords(p0[0], p0[1], p0[2])[0]) > 1.0) d = V(0, -1, 0).transformDirection(MHi).addScaledVector(n, -V(0, -1, 0).transformDirection(MHi).dot(n)).normalize().lerp(d, 0.4).normalize();
        const front = sstep(1.3, 0.9, Math.abs(hairCoords(p0[0], p0[1], p0[2])[0]));
        const Ls = lerp(0.004, 0.011, R()) * lerp(0.6, 1, sstep(-0.02, 0.06, he)) * (1 - 0.6 * front), pts = [];
        for (let j = 0; j <= 3; j++) { const s = j / 3 * Ls; pts.push(A3(P0.clone().addScaledVector(d, s).addScaledVector(n, 0.0003 + 0.0006 * j / 3))); }
        const c = 0.7 + 0.5 * R();
        strands.push({ pts, w: 0.0006, nrm: nn, c: [HAIRC.r * c, HAIRC.g * c, HAIRC.b * c] });
      }
      const sg = strandGeo(strands); sg.applyMatrix4(MH); const wm = add(root, sg, M.strand); wm.castShadow = false; wm.name = 'wisps';
    }
    // ---------------- neck ----------------
    {
      const ng = surfaceNets((x, y, z) => {
        let d = neckD(x, y, z);
        d = smin(d, sdEll(x, y, z, ADAM, [0.009, 0.012, 0.009]), 0.012);
        toHead(x, y, z, tmp2);
        const h0 = Math.min(sdEll(tmp2[0], tmp2[1], tmp2[2], [0, 0.016, -0.014], [0.075, 0.088, 0.099]), sdEll(tmp2[0], tmp2[1], tmp2[2], [0, -0.036, 0.022], [0.061, 0.07, 0.068]));
        d = smin(d, h0 + 0.005, 0.016); d = Math.max(d, -(h0 + 0.003));
        toC(x, y, z, tmp); const c = smax(torsoM(tmp[0], tmp[1], tmp[2]) + 0.004, d - 0.022, 0.008);
        return smin(d, c, 0.02);
      }, [Math.min(NB[0], NT[0]) - 0.11, Math.min(NB[1], NT[1]) - 0.1, Math.min(NB[2], NT[2]) - 0.11], [Math.max(NB[0], NT[0]) + 0.1, Math.max(NB[1], NT[1]) + 0.08, Math.max(NB[2], NT[2]) + 0.11], 0.0095);
      vcol(ng, (x, y, z) => { const n = 1 + 0.025 * vnoise(x * 150, y * 150, z * 150); return [0.95 * n, 0.94 * n, 0.93 * n]; });
      add(root, ng, M.skinM).name = 'neck';
    }

    // ---------------- hands ----------------
    {
      const f = handArmSDF(EL, lhx, lHand, [0.03, 0.034]), bb = handBox(lhx, EL);
      const geo = surfaceNets(f, bb[0], bb[1], 0.0037);
      vcol(geo, handColours(lhx, lChains, SKP)); aoCol(geo, f, 0.003, 0.25);
      add(root, geo, M.skinM).name = 'leftHand';
    }
    // right forearm group: hand, cuff, pick (moves as a rigid body about the elbow)
    const rG = new THREE.Group(); root.add(rG);
    {
      const f = handArmSDF(ER, rhx, rHand, [0.03, 0.034]), bb = handBox(rhx, ER);
      const geo = surfaceNets(f, bb[0], bb[1], 0.0037);
      vcol(geo, handColours(rhx, rChains, SKP)); aoCol(geo, f, 0.003, 0.25);
      add(rG, geo, M.skinM).name = 'rightHand';
      cuff(rG, ER, WR, 2.6);
      // pick: a 351-ish rounded triangle, 0.7 mm thick
      const ps = new THREE.Shape(); const R0 = 0.0125;
      ps.moveTo(0, -0.017); ps.quadraticCurveTo(0.009, -0.009, 0.0125, 0.002); ps.quadraticCurveTo(0.014, 0.0105, 0.0, 0.012); ps.quadraticCurveTo(-0.014, 0.0105, -0.0125, 0.002); ps.quadraticCurveTo(-0.009, -0.009, 0, -0.017);
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.0007, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0003, bevelSegments: 1, curveSegments: 6 });
      pg.translate(0, 0, -0.00035);
      // pick frame (hand-local -> world): tip direction = pdir, normal = pn
      const tipW = rhx.toW(pickTipL), cW = rhx.toW(pc);
      const ny = tipW.clone().sub(cW).normalize().negate(); // shape +y points away from the tip
      const nz = orth(V(0, 0, 0).add(rhx.toW([pc[0] + pn.x, pc[1] + pn.y, pc[2] + pn.z]).sub(cW)), ny);
      const nx = ny.clone().cross(nz);
      const pm = add(rG, pg, M.pick); pm.matrixAutoUpdate = true;
      const mm = new THREE.Matrix4().makeBasis(nx, ny, nz).setPosition(cW.clone().addScaledVector(ny, -0.017 + 0.017)); // centre at cW
      pm.applyMatrix4(mm);
      DBG.pickTip = tipW; DBG.pickRest = pickRestW;
    }

    // ---------------- strumming: rigid rotation of the forearm about the elbow + skinned sleeve ----------------
    const sk = { idx: [], w: [], P0: null, N0: null };
    {
      const g = hoodGeo, P = g.attributes.position.array, Nn = g.attributes.normal.array;
      sk.P0 = P.slice(); sk.N0 = Nn.slice();
      const Ea = A3(ER), Wa = A3(WR);
      for (let i = 0; i < P.length / 3; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const t = capT(x, y, z, Ea, Wa), dist = sdCap(x, y, z, Ea, Wa, 0, 0);
        const w = sstep(-0.05, 0.25, t) * sstep(0.1, 0.075, dist);
        if (w > 0.001) { sk.idx.push(i); sk.w.push(w); }
      }
      hoodMesh.frustumCulled = false;
    }
    const strumAxisBase = { E: ER.clone() };
    const qq = new THREE.Quaternion(), tv = V(0, 0, 0), tn = V(0, 0, 0);
    let lastKey = '';
    function poseRight(s, lift) {
      // pick path: across the strings (towards the floor along the top) with a slight diagonal; lift = out from the top
      const P = pickRestW.clone().addScaledVector(gx, s * 0.085).addScaledVector(gy, -s * 0.012).addScaledVector(gz, lift * 0.022 - s * (1 - lift) * 0.0035);
      const a = pickRestW.clone().sub(ER).normalize(), b = P.clone().sub(ER).normalize();
      const key = s.toFixed(4) + '/' + lift.toFixed(4); if (key === lastKey) return; lastKey = key;
      qq.setFromUnitVectors(a, b);
      const axis = V(qq.x, qq.y, qq.z); const sn = axis.length(); const ang = 2 * Math.atan2(sn, qq.w); if (sn > 1e-9) axis.divideScalar(sn); else axis.set(1, 0, 0);
      rG.quaternion.copy(qq); rG.position.copy(ER).sub(ER.clone().applyQuaternion(qq));
      const pa = hoodGeo.attributes.position.array, na = hoodGeo.attributes.normal.array, P0 = sk.P0, N0 = sk.N0, q2 = new THREE.Quaternion();
      for (let k = 0; k < sk.idx.length; k++) {
        const i = sk.idx[k], o = i * 3; q2.setFromAxisAngle(axis, ang * sk.w[k]);
        tv.set(P0[o] - ER.x, P0[o + 1] - ER.y, P0[o + 2] - ER.z).applyQuaternion(q2); pa[o] = tv.x + ER.x; pa[o + 1] = tv.y + ER.y; pa[o + 2] = tv.z + ER.z;
        tn.set(N0[o], N0[o + 1], N0[o + 2]).applyQuaternion(q2); na[o] = tn.x; na[o + 1] = tn.y; na[o + 2] = tn.z;
      }
      hoodGeo.attributes.position.needsUpdate = true; hoodGeo.attributes.normal.needsUpdate = true;
    }
    rG.children.forEach(m => { m.frustumCulled = false; });

    root.userData.poseRight = poseRight;
    root.userData.strings = GT.strings;
    root.userData.triangles = triCount;
    root.userData.focusLocal = { x: -0.02, y: 0.85, z: 0.2, r: 0.62 };
    DBG.him.HC = HC;
    return root;
  }

  // ================================================================== HER
  function buildHer(ctx) {
    const M = mats(), root = new THREE.Group(); root.name = 'her';
    let triCount = 0; const add = (parent, geo, mat, x, y, z, o) => { triCount += tris(geo); return LIB.mesh(parent, geo, mat, x || 0, y || 0, z || 0, o); };
    const tmp = [0, 0, 0], tmp2 = [0, 0, 0], DBG = ctx.dbg;
    const logD = ctx.logD;
    const S = 0.93;
    const spine = makeSpine({ S, ya: 0.905, anchor: V(0, 0.458, 0.03), phi: (y) => lerp(-0.12, 0.12, sstep(0.95, 1.32, y)), L: (y) => V(1, 0, 0).lerp(V(Math.cos(-0.1), 0, Math.sin(0.1)), sstep(1.0, 1.4, y)) });
    const toC = spine.toC, toW = spine.toW;
    const HJL = toW(0.094, 0.905, 0.008), HJR = toW(-0.094, 0.905, 0.008);
    const SJL = toW(0.166, 1.412, -0.014), SJR = toW(-0.166, 1.412, -0.014);
    const LT = 0.43 * S, LS = 0.425 * S;
    const AKL = V(0.085, 0.105, 0.49), AKR = V(-0.075, 0.105, 0.5);
    const KL = ik(HJL, AKL, LT, LS, V(0.05, 1, 0.3)), KR = ik(HJR, AKR, LT, LS, V(-0.05, 1, 0.3));
    const legs = [[A3(HJL), A3(KL), A3(AKL)], [A3(HJR), A3(KR), A3(AKR)]];
    DBG.her = { HJL, HJR, KL, KR, SJL, SJR };
    const HSC = 0.93;

    // ---------------- jeans (dark, slim), tucked into ankle boots ----------------
    function jeansW(x, y, z) {
      let d = 1e9;
      if (y > 0.28) { toC(x, y, z, tmp); d = smax((torsoF(tmp[0], tmp[1], tmp[2]) - 0.006) * S, (tmp[1] - 0.99) * S, 0.006); d = smax(d, (0.80 - tmp[1]) * S, 0.04); d += 0.002 * Math.exp(-tmp[0] * tmp[0] / 0.00012) * sstep(-0.03, -0.07, tmp[2]); }
      for (let i = 0; i < 2; i++) {
        const Lg = legs[i];
        let e = sdCap(x, y, z, Lg[0], Lg[1], 0.088, 0.062);
        e = smin(e, sdCap(x, y, z, Lg[1], [Lg[2][0], Lg[2][1] - 0.02, Lg[2][2]], 0.058, 0.04), 0.03);
        // calf
        const C = [lerp(Lg[1][0], Lg[2][0], 0.3), lerp(Lg[1][1], Lg[2][1], 0.3), lerp(Lg[1][2], Lg[2][2], 0.3) - 0.012];
        e = smin(e, sdEll(x, y, z, C, [0.045, 0.09, 0.044]), 0.03);
        const tt = capT(x, y, z, Lg[0], Lg[1]), kd = Math.hypot(x - Lg[1][0], y - Lg[1][1], z - Lg[1][2]);
        e += sstep(0.25, 0.05, tt) * sstep(0.44, 0.58, y) * 0.0032 * Math.sin(tt * 60 + x * 50 + i * 2);
        e += sstep(0.11, 0.05, kd) * sstep(Lg[1][2] - 0.02, Lg[1][2] - 0.08, z) * 0.0035 * Math.sin(y * 95 + x * 40 + i);
        e += 0.0012 * Math.sin(Math.atan2(z - Lg[1][2], x - Lg[1][0]) * 5 + y * 9 + i) * sstep(0.45, 0.25, y);
        d = smin(d, e, 0.04);
      }
      d = smax(d, -(logD(x, y, z) - 0.0015), 0.014);
      return smax(d, 0.12 - y, 0.004);
    }
    const jGeo = surfaceNets(jeansW, [-0.3, 0.09, -0.2], [0.3, 0.64, 0.62], 0.0155);
    aoCol(jGeo, jeansW, 0.012, 0.3);
    add(root, jGeo, M.jeansF).name = 'jeans';

    // ---------------- boots ----------------
    function boot(A, dir, mirror) {
      const g = new THREE.Group(); const yawS = Math.atan2(dir.x, dir.z);
      g.position.set(A.x - dir.x * 0.07, 0, A.z - dir.z * 0.07); g.rotation.y = yawS; root.add(g);
      const s = mirror ? -1 : 1, f = (x, y, z) => bootSDF(x * s, y, z);
      const geo = surfaceNets(f, [-0.06, 0.0, -0.03], [0.06, 0.18, 0.27], 0.0095);
      vcol(geo, (x, y, z) => { const c = 1 + 0.06 * vnoise(x * 150, y * 150, z * 150) - 0.15 * sstep(0.0025, 0.0, Math.abs(y - 0.162)); return [c, c * 0.98, c * 0.96]; });
      aoCol(geo, f, 0.008, 0.3); add(g, geo, M.boot);
      const pts = [];
      for (let k = 0; k < 48; k++) { const a = k / 48 * TAU, dx = Math.cos(a), dz = Math.sin(a); let r = 0.2; const cz = 0.12; for (let it = 0; it < 80; it++) { const dd = f(dx * r, 0.03, cz + dz * r); if (Math.abs(dd) < 0.0003) break; r -= dd * 0.8; } pts.push(new THREE.Vector2(dx * (r + 0.002), cz + dz * (r + 0.002))); }
      const shp = new THREE.Shape(pts);
      const sg = new THREE.ExtrudeGeometry(shp, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 4 });
      sg.rotateX(PI / 2); sg.translate(0, 0.026, 0); sg.computeVertexNormals(); add(g, sg, M.bootSole);
      // block heel
      const hs = new THREE.Shape(); hs.moveTo(-0.028, -0.02); hs.lineTo(0.028, -0.02); hs.quadraticCurveTo(0.034, 0.03, 0.026, 0.05); hs.lineTo(-0.026, 0.05); hs.quadraticCurveTo(-0.034, 0.03, -0.028, -0.02);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 6 }); hg.rotateX(PI / 2); hg.translate(0, 0.022, 0.028); add(g, hg, M.bootSole);
      return g;
    }
    boot(AKL, V(0.05, 0, 1).normalize(), true);
    boot(AKR, V(-0.12, 0, 1).normalize(), false);

    // ---------------- hands resting on the thighs ----------------
    const thighTop = (i, t) => { const Lg = legs[i]; const p = V(...Lg[0]).lerp(V(...Lg[1]), t); return p; };
    function restHand(i, t, mirror, turn) {
      const Lg = legs[i], hp = V(...Lg[0]), kp = V(...Lg[1]);
      const along = kp.clone().sub(hp).normalize();
      const X = along.clone().applyAxisAngle(V(0, 1, 0), turn).normalize(); X.y = along.y - 0.1; X.normalize();
      const Y = orth(V(mirror ? 0.25 : -0.25, 1, 0), X), Z = Y.clone().cross(X);
      // place the palm on top of the jeans: lower the hand until the palm touches
      const P = thighTop(i, t);
      let W = P.clone().add(V(0, 0.2, 0)), hx = null;
      for (let it = 0; it < 120; it++) {
        hx = handXf(W, X, Y, Z, mirror, HSC);
        let m = 1e9; for (const lx of [0.0, 0.02, 0.04, 0.07, 0.09]) for (const lz of [-0.02, 0.0, 0.02]) { const q = hx.toW([lx, -0.02, lz]); m = Math.min(m, jeansW(q.x, q.y, q.z)); }
        if (m < 0.0015) break; W.y -= Math.max(m * 0.7, 0.0004);
      }
      // fingers drape down over the thigh
      const SP = [0.04, 0.0, -0.03, -0.06];
      const chains = FING.map((F, k) => {
        let lo = -0.25, hi = 0.85;
        for (let it = 0; it < 26; it++) { const m = (lo + hi) / 2, ch = fingerChain(F, [m * 0.7, 0.12 + m * 0.45, 0.08 + m * 0.25, SP[k]]); let touch = false; for (let j = 1; j <= 3; j++) { const q = hx.toW(ch[j]); if (jeansW(q.x, q.y, q.z) < F.rad[j] * HSC + 0.0008) touch = true; } if (touch) hi = m; else lo = m; }
        const m = lo; return fingerChain(F, [m * 0.7, 0.12 + m * 0.45, 0.08 + m * 0.25, SP[k]]);
      });
      const thumb = thumbChain([0.075, -0.02, 0.05], [0.0, 0.006, 0.01]);
      return { hx, chains, thumb, hand: handSDF(chains, thumb) };
    }
    const RHd = restHand(1, 0.44, false, 0.06), LHd = restHand(0, 0.43, true, -0.08);
    const ER = ik(SJR, RHd.hx.W, 0.30 * S, 0.265 * S, V(-0.4, -0.3, -1)), EL = ik(SJL, LHd.hx.W, 0.30 * S, 0.265 * S, V(0.4, -0.3, -1));
    DBG.her.ER = ER; DBG.her.EL = EL; DBG.her.WR = RHd.hx.W; DBG.her.WL = LHd.hx.W;

    // ---------------- head ----------------
    const LIDf = { v: { e0: -0.05, h: 0.38 } };
    const headF = makeHeadSDF(HEAD_F, LIDf);
    const HS = 0.95; // head scale
    const top = spine.frame(1.6);
    let hx = top.L.clone(), hy = top.T.clone(), hz = top.F.clone();
    const yawH = -0.42, pitchH = 0.30, rollH = -0.08;
    const qy = new THREE.Quaternion().setFromAxisAngle(hy, yawH); hx.applyQuaternion(qy); hz.applyQuaternion(qy);
    const qp = new THREE.Quaternion().setFromAxisAngle(hx, pitchH); hy.applyQuaternion(qp); hz.applyQuaternion(qp);
    const qr = new THREE.Quaternion().setFromAxisAngle(hz, rollH); hx.applyQuaternion(qr); hy.applyQuaternion(qr);
    const PA = toW(0, 1.575, -0.03);
    const HC = PA.clone().addScaledVector(hy, 0.066 * HS).addScaledVector(hz, 0.026 * HS);
    const MH = new THREE.Matrix4().makeBasis(hx, hy, hz).scale(V(HS, HS, HS)).setPosition(HC);
    const MHi = MH.clone().invert(), me = MHi.elements;
    const toHead = (x, y, z, o) => { o[0] = me[0] * x + me[4] * y + me[8] * z + me[12]; o[1] = me[1] * x + me[5] * y + me[9] * z + me[13]; o[2] = me[2] * x + me[6] * y + me[10] * z + me[14]; return o; };
    const eyeW = [V(EYE[0], EYE[1], EYE[2]).applyMatrix4(MH), V(-EYE[0], EYE[1], EYE[2]).applyMatrix4(MH)];
    const gazeT = ctx.herGaze.clone();
    const gazeL = gazeT.clone().sub(eyeW[0].clone().add(eyeW[1]).multiplyScalar(0.5)).transformDirection(MHi).normalize();
    LIDf.v = { e0: clamp(Math.atan2(gazeL.y, Math.hypot(gazeL.x, gazeL.z)) * 0.62, -0.3, 0.3) - 0.03, h: 0.36 };
    DBG.her.gaze = gazeL;
    const NTv = V(0, -0.05, -0.035).applyMatrix4(MH), NB0 = toW(0, 1.43, -0.012);
    const NBv = NB0.clone().lerp(NTv, 0.12), NB = A3(NBv), NT = A3(NTv);
    const NMv = toW(0, 1.505, -0.004).lerp(NTv, 0.3), NM = A3(NMv);
    const neckD = (x, y, z) => smin(sdCap(x, y, z, NB, NM, 0.045, 0.042), sdCap(x, y, z, NM, NT, 0.042, 0.04), 0.02);

    // ---------------- dark top (scoop neck) and the knit cardigan ----------------
    const uRf = RHd.hx.W.clone().sub(ER).normalize(), uLf = LHd.hx.W.clone().sub(EL).normalize();
    const SLv = A3(SJL), SRv = A3(SJR), ELv = A3(EL), ERv = A3(ER);
    const WLc = A3(LHd.hx.W.clone().addScaledVector(uLf, -0.016)), WRc = A3(RHd.hx.W.clone().addScaledVector(uRf, -0.016));
    function topC(a, y, b) {
      let d = torsoF(a, y, b) - 0.003;
      d = smax(d, 0.88 - y, 0.01);
      d = smax(d, -sdEll(a, y, b, [0, 1.475, 0.05], [0.078, 0.095, 0.11]), 0.006); // scoop
      return d;
    }
    const OPEN = (a, y, b) => { // the open front of the cardigan (canonical): < 0 inside the opening
      const w = lerp(0.045, 0.085, sstep(1.0, 1.45, y)) + 0.02 * sstep(1.0, 0.86, y);
      return Math.max(Math.abs(a - 0.006) - w, 0.02 - b);
    };
    function cardC(a, y, b) {
      let d = torsoF(a, y, b) - 0.017 - 0.006 * sstep(1.12, 0.95, y);
      d += sstep(-0.03, -0.09, b) * 0.002 * Math.sin(a * 36 + y * 7) * sstep(1.0, 1.2, y);
      d += 0.0012 * Math.sin(a * 41 + y * 13) * Math.sin(b * 37 - y * 21);
      d += sstep(0.03, 0.09, b) * sstep(1.12, 0.95, y) * 0.0035 * Math.sin(y * 90 + 1.1 * Math.sin(a * 12));
      const hy0 = 0.83 + 0.02 * sstep(-0.02, 0.07, b);
      d = smax(d, hy0 - y, 0.008);
      // front panels hang open; collar/button band as a slightly thicker edge
      const op = OPEN(a, y, b);
      d = smax(d, -op, 0.012);
      d -= 0.003 * sstep(0.03, 0.0, op) * sstep(0.0, 0.05, b);
      // around the back of the neck the band rises a little
      d = smax(d, -sdEll(a, y, b, [0, 1.52, 0.02], [0.075, 0.085, 0.085]), 0.01);
      return d;
    }
    function cardSleeve(x, y, z, S0, E0, W0, seed) {
      let d = sdCap(x, y, z, S0, E0, 0.054, 0.048);
      const tf = capT(x, y, z, E0, W0);
      let f = sdCap(x, y, z, E0, W0, 0.048, 0.038);
      f += 0.0032 * Math.sin(tf * 38 + seed + 3 * Math.sin(Math.atan2(y - E0[1], x - E0[0]) * 2)) * sstep(0.45, 0.05, tf) * sstep(-0.1, 0.05, tf);
      f += 0.0028 * Math.sin(tf * 60 + seed * 2) * sstep(0.62, 0.9, tf);
      d = smin(d, f, 0.03);
      return smax(d, (tf - 1) * Math.hypot(W0[0] - E0[0], W0[1] - E0[1], W0[2] - E0[2]), 0.004);
    }
    // the cardigan's front hem lies on her lap
    function lapD(x, y, z) {
      let e = 1e9;
      for (let i = 0; i < 2; i++) { const Lg = legs[i]; const tt = capT(x, y, z, Lg[0], Lg[1]); e = Math.min(e, smax(sdCap(x, y, z, Lg[0], Lg[1], 0.098, 0.072), tt - 0.18 - 0.03 * Math.sin(i * 3 + x * 30), 0.01)); }
      return e;
    }
    function cardW(x, y, z) {
      toC(x, y, z, tmp);
      let d = cardC(tmp[0], tmp[1], tmp[2]) * S;
      d = smax(d, 0.004 - neckD(x, y, z), 0.006);
      const lp = smax(lapD(x, y, z), -(OPEN(tmp[0], tmp[1], tmp[2]) * S), 0.006);
      d = smin(d, smax(lp, -(jeansW(x, y, z) - 0.006), 0.004), 0.02);
      d = smin(d, cardSleeve(x, y, z, SLv, ELv, WLc, 0.4), 0.035);
      d = smin(d, cardSleeve(x, y, z, SRv, ERv, WRc, 1.9), 0.035);
      return smax(d, -(logD(x, y, z) - 0.002), 0.01);
    }
    function topW(x, y, z) { toC(x, y, z, tmp); let d = topC(tmp[0], tmp[1], tmp[2]) * S; d = smax(d, 0.004 - neckD(x, y, z), 0.006); return d; }
    {
      const cg = surfaceNets(cardW, [-0.38, 0.4, -0.24], [0.38, 1.2, 0.42], 0.012);
      aoCol(cg, cardW, 0.012, 0.32);
      add(root, cg, M.cardi).name = 'cardigan';
      const tg = surfaceNets(topW, [-0.2, 0.75, -0.14], [0.2, 1.2, 0.2], 0.0085);
      // keep only what can show through the opening of the cardigan
      clipGeo(tg, (x, y, z) => { toC(x, y, z, tmp); return OPEN(tmp[0], tmp[1], tmp[2]) < 0.02; });
      aoCol(tg, topW, 0.01, 0.3);
      add(root, tg, M.topM).name = 'top';
    }
    function cuffF(E0, W0, seed) {
      const u = W0.clone().sub(E0).normalize(), n1 = orth(V(0, 1, 0), u), n2 = u.clone().cross(n1), rows = [];
      for (let i = 0; i <= 6; i++) { const s = i / 6, row = []; for (let j = 0; j < 28; j++) { const a = j / 28 * TAU; const dist = lerp(-0.08, -0.01, s) + 0.002 * Math.sin(2 * a + seed); const r = lerp(0.04, 0.034, sstep(0, 0.5, s)) + 0.0008 * Math.sin(a * 14); row.push(A3(W0.clone().addScaledVector(u, dist).addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r))); } rows.push(row); }
      const r2 = []; for (let j = 0; j < 28; j++) { const a = j / 28 * TAU; r2.push(A3(W0.clone().addScaledVector(u, -0.024).addScaledVector(n1, Math.cos(a) * 0.029).addScaledVector(n2, Math.sin(a) * 0.029))); } rows.push(r2);
      const g = loft(rows, true, (i, j) => [j / 28 * 6, i * 0.3]); vcol(g, (x, y, z, i) => { const k = Math.floor(i / 29) >= 6 ? 0.45 : 0.92; return [k, k, k]; });
      return add(root, g, M.cardi2);
    }
    cuffF(ER, RHd.hx.W, 0.4); cuffF(EL, LHd.hx.W, 1.7);

    // ---------------- head mesh ----------------
    const SKP = { palm: [0.14, 0.1, 0.1], nail: [1.25, 1.08, 1.02] };
    // hairline: a natural female hairline, a side parting on her left
    const HCEN = [0, 0.016, -0.012];
    const HL_T = table([[0.0, 0.52], [0.25, 0.53], [0.45, 0.5], [0.62, 0.42], [0.82, 0.2], [0.98, -0.08], [1.07, -0.3], [1.16, -0.32], [1.3, 0.05], [1.45, 0.12], [1.7, 0.05], [1.9, -0.2], [2.1, -0.5], [2.5, -0.72], [3.15, -0.78]]);
    const hairCoords = (x, y, z) => { const dx = x, dy = y - HCEN[1], dz = z - HCEN[2]; return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
    const hairEdge = (x, y, z) => { const c = hairCoords(x, y, z), az = Math.abs(c[0]); return c[1] - HL_T(az)[0] + 0.02 * vnoise(c[0] * 9, c[1] * 9, 5.1) + 0.01 * vnoise(c[0] * 30, c[1] * 30, 2.7) + 0.005 * vnoise(c[0] * 80, c[1] * 80, 8.7); };
    function headCol(x, y, z) {
      const ax = Math.abs(x); let r = 1, g = 1, b = 1;
      const n = 1 + 0.025 * vnoise(x * 120, y * 120, z * 120) + 0.012 * vnoise(x * 400, y * 400, z * 400);
      r *= n; g *= n; b *= n;
      if (z > 0.03) {
        const eo = Math.exp(-(Math.pow(ax - 0.032, 2) / 0.00035 + Math.pow(y - 0.0, 2) / 0.00012)); r *= 1 - 0.08 * eo; g *= 1 - 0.1 * eo; b *= 1 - 0.08 * eo;
        const ck = Math.exp(-(Math.pow(ax - 0.045, 2) + Math.pow(y + 0.028, 2)) / 0.0005); r *= 1 + 0.07 * ck; g *= 1 - 0.02 * ck; b *= 1 - 0.01 * ck;
        const lp = Math.pow(x / 0.0195, 2) + Math.pow((y + 0.0617) / 0.0115, 2);
        if (lp < 1.5) { const k = sstep(1.5, 0.55, lp); r *= 1 - 0.08 * k; g *= 1 - 0.26 * k; b *= 1 - 0.2 * k; }
        // eyebrows (soft arch)
        const by = 0.0265 + 0.005 * (1 - Math.pow((ax - 0.038) / 0.02, 2)) - 0.004 * sstep(0.047, 0.058, ax);
        const bw = lerp(0.004, 0.0013, sstep(0.015, 0.057, ax));
        const bm = sstep(1.4, 0.3, Math.abs(y - by) / bw) * sstep(0.010, 0.015, ax) * sstep(0.06, 0.05, ax);
        r *= 1 - 0.3 * bm; g *= 1 - 0.33 * bm; b *= 1 - 0.33 * bm;
        // a little darker lash line (natural, not make-up)
      }
      const he = hairEdge(x, y, z), hcov = sstep(0.0, 0.06, he) * (0.8 + 0.2 * vnoise(x * 1500, y * 1500, z * 1500));
      r = lerp(r, 0.2, hcov); g = lerp(g, 0.15, hcov); b = lerp(b, 0.13, hcov);
      if (ax > 0.065) { r *= 1.04; g *= 0.98; }
      return [r, g, b];
    }
    {
      const fbox = (x, y, z) => sdRBox(x, y + 0.038, z - 0.08, 0.066, 0.09, 0.052, 0.0);
      const coarse = clipGeo(surfaceNets((x, y, z) => headF(x, y, z) + 0.0006 * sstep(0.0, -0.008, fbox(x, y, z)), [-0.11, -0.135, -0.13], [0.11, 0.12, 0.13], 0.0084), (x, y, z) => fbox(x, y, z) > -0.01);
      vcol(coarse, headCol); aoCol(coarse, headF, 0.004, 0.3); coarse.applyMatrix4(MH); add(root, coarse, M.skinFFar).name = 'head';
      facePatches(headF, fbox, headCol, MH, M.skinF, add, root);
    }
    for (let i = 0; i < 2; i++) {
      const eg = new THREE.SphereGeometry(EYE_R * HS, 24, 14); triCount += tris(eg);
      const m = LIB.mesh(root, eg, M.eyeF, eyeW[i].x, eyeW[i].y, eyeW[i].z);
      m.quaternion.setFromUnitVectors(V(0, 0, 1), gazeT.clone().sub(eyeW[i]).normalize());
    }
    // tiny stud earrings
    for (const sg of [-1, 1]) { const p = V(sg * 0.0815, -0.026, -0.012).applyMatrix4(MH); const e = new THREE.SphereGeometry(0.0022, 12, 8); add(root, e, M.gold, p.x, p.y, p.z); }
    {
      const strands = [], R = LIB.rnd(15), f = headF;
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 170; k++) {
          const t = Math.pow(R(), 1.1), ax = lerp(0.011, 0.056, t);
          const by = 0.0265 + 0.005 * (1 - Math.pow((ax - 0.038) / 0.02, 2)) - 0.004 * sstep(0.047, 0.058, ax);
          const bw = lerp(0.0036, 0.0012, sstep(0.015, 0.057, ax));
          if (R() > 1 - 0.5 * sstep(0.046, 0.056, ax)) continue;
          const p0 = project(f, [sgn * ax, by + (R() - 0.5) * 2 * bw, 0.12], 0.0001);
          const nrm = gradAt(f, p0[0], p0[1], p0[2], 0.0008);
          const up = 1 - sstep(0.013, 0.024, ax);
          let dir = V(sgn * (0.35 + 0.65 * (1 - up)), 0.85 * up + 0.12 - 0.4 * sstep(0.04, 0.056, ax) + (R() - 0.5) * 0.25, 0).normalize();
          const nn = V(nrm[0], nrm[1], nrm[2]); dir.addScaledVector(nn, -dir.dot(nn)).normalize();
          const Ls = lerp(0.003, 0.005, R()), pts = [];
          for (let j = 0; j <= 2; j++) { const s = j / 2 * Ls, l = 0.00012 + 0.0003 * j / 2; pts.push([p0[0] + dir.x * s + nn.x * l, p0[1] + dir.y * s + nn.y * l, p0[2] + dir.z * s + nn.z * l]); }
          const c = 0.6 + R() * 0.5;
          strands.push({ pts, w: 0.00028, nrm, c: [0.022 * c, 0.015 * c, 0.011 * c] });
        }
        const LID = LIDf.v;
        for (let k = 0; k < 44; k++) {
          const az = lerp(-0.85, 0.95, k / 43 + (R() - 0.5) * 0.02), hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / 1.05, 2)) - 0.03;
          const el = LID.e0 + 0.025 * Math.sin(az * 2) + hh + 0.015, rr = EYE_R + 0.0028;
          const q = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          const p0 = [sgn * (EYE[0] + q.x * rr), EYE[1] + q.y * rr, EYE[2] + q.z * rr];
          const out = V(sgn * q.x, q.y, q.z), upv = V(0, 1, 0); const Ls = 0.0072 + 0.002 * Math.sin(k / 43 * PI) + 0.0015 * sstep(0.3, 0.9, az), pts = [];
          for (let j = 0; j <= 3; j++) { const s = j / 3; const d = out.clone().multiplyScalar(s * Ls).addScaledVector(upv, s * s * Ls * 0.7); pts.push([p0[0] + d.x, p0[1] + d.y, p0[2] + d.z]); }
          strands.push({ pts, w: 0.00032, nrm: A3(upv.clone().cross(V(sgn, 0, 0)).normalize()), c: [0.008, 0.006, 0.005] });
        }
        // a few lower lashes
        for (let k = 0; k < 14; k++) {
          const az = lerp(-0.5, 0.8, k / 13), hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / 1.05, 2)) - 0.03;
          const el = LID.e0 + 0.025 * Math.sin(az * 2) - hh - 0.01, rr = EYE_R + 0.0024;
          const q = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          const p0 = [sgn * (EYE[0] + q.x * rr), EYE[1] + q.y * rr, EYE[2] + q.z * rr];
          const out = V(sgn * q.x, q.y, q.z), pts = []; const Ls = 0.0025;
          for (let j = 0; j <= 2; j++) { const s = j / 2; pts.push([p0[0] + out.x * s * Ls, p0[1] + (out.y - 0.4) * s * Ls, p0[2] + out.z * s * Ls]); }
          strands.push({ pts, w: 0.00022, nrm: [0, -1, 0], c: [0.015, 0.011, 0.009] });
        }
      }
      const sg = strandGeo(strands); sg.applyMatrix4(MH); const bm = add(root, sg, M.strand); bm.name = 'brows'; bm.castShadow = false;
    }

    // ---------------- neck and upper chest skin (inside the scoop) ----------------
    {
      const nfun = (x, y, z) => {
        let d = neckD(x, y, z);
        toHead(x, y, z, tmp2);
        const h0 = Math.min(sdEll(tmp2[0], tmp2[1], tmp2[2], [0, 0.016, -0.014], [0.075, 0.088, 0.099]), sdEll(tmp2[0], tmp2[1], tmp2[2], [0, -0.036, 0.022], [0.061, 0.07, 0.068])) * HS;
        d = smin(d, h0 + 0.005, 0.016); d = Math.max(d, -(h0 + 0.003));
        toC(x, y, z, tmp); const c = smax(torsoF(tmp[0], tmp[1], tmp[2]) * S + 0.001, d - 0.03, 0.008);
        // collarbones
        const cb = sdCap(Math.abs(tmp[0]), tmp[1], tmp[2], [0.02, 1.44, 0.04], [0.13, 1.455, 0.02], 0.006, 0.005) * S;
        return smin(smin(d, c, 0.02), cb + 0.004, 0.012);
      };
      const ng = surfaceNets(nfun, [Math.min(NB[0], NT[0]) - 0.12, Math.min(NB[1], NT[1]) - 0.13, Math.min(NB[2], NT[2]) - 0.11], [Math.max(NB[0], NT[0]) + 0.12, Math.max(NB[1], NT[1]) + 0.07, Math.max(NB[2], NT[2]) + 0.12], 0.009);
      vcol(ng, (x, y, z) => { const n = 1 + 0.02 * vnoise(x * 150, y * 150, z * 150); return [0.97 * n, 0.96 * n, 0.95 * n]; });
      aoCol(ng, nfun, 0.006, 0.3);
      add(root, ng, M.skinF).name = 'neck';
    }

    // ---------------- hands ----------------
    for (const [Hd, E] of [[RHd, ER], [LHd, EL]]) {
      const f = handArmSDF(E, Hd.hx, Hd.hand, [0.028, 0.032]), bb = handBox(Hd.hx, E);
      const geo = surfaceNets(f, bb[0], bb[1], 0.0042);
      vcol(geo, handColours(Hd.hx, Hd.chains, SKP)); aoCol(geo, f, 0.003, 0.25);
      add(root, geo, M.skinF).name = 'hand';
    }

    // ---------------- long hair ----------------
    // envelope: head + neck + back of the cardigan, bridged smoothly (hair falls straight from the head onto the back)
    const skullW = (x, y, z) => { toHead(x, y, z, tmp2); return smin(sdEll(tmp2[0], tmp2[1], tmp2[2], [0, 0.016, -0.014], [0.075, 0.088, 0.099]), sdEll(tmp2[0], tmp2[1], tmp2[2], [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03) * HS; };
    const backW = (x, y, z) => { toC(x, y, z, tmp); return (cardC(tmp[0], tmp[1], tmp[2]) - 0.004) * S; };
    const envW = (x, y, z) => smin(skullW(x, y, z), smin(neckD(x, y, z) + 0.012, backW(x, y, z), 0.05), 0.07);
    const hairBottom = (a) => 1.09 + 5.5 * a * a + 0.03 * vnoise(a * 30, 1.3, 2.2) + 0.02 * Math.pow(Math.abs(Math.sin(a * 55 + 0.6 * vnoise(a * 20, 0, 0))), 0.6);
    // the scalp shell (head-local)
    const hairShell = (x, y, z) => {
      const sk = smin(sdEll(x, y, z, [0, 0.016, -0.014], [0.075, 0.088, 0.099]), sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);
      const he = hairEdge(x, y, z), c = hairCoords(x, y, z);
      let th = 0.009 + 0.004 * sstep(0.3, 1.0, c[1]) + 0.0015 * vnoise(c[0] * 6, c[1] * 6, 1.1);
      // parting on her left: a small valley
      const part = Math.abs(c[0] - 0.22 * sstep(0.6, 1.4, c[1]) + 0.0) ;
      const pz = Math.abs(x - 0.022) / 0.004;
      th -= 0.006 * Math.exp(-pz * pz) * sstep(0.02, 0.06, y) * sstep(-0.05, 0.05, z + 0.0 * part);
      let d = sk - lerp(-0.0025, th, sstep(-0.01, 0.12, he));
      d = smax(d, -he * 0.05 - 0.0006, 0.002);
      return d;
    };
    const HAIRF = LIB.col('#24180f'), HAIRF2 = LIB.col('#3e2817');
    {
      const hg = surfaceNets(hairShell, [-0.11, -0.12, -0.135], [0.11, 0.13, 0.13], 0.0066);
      vcol(hg, (x, y, z) => { const he = hairEdge(x, y, z), k = sstep(-0.01, 0.1, he); const n = 0.85 + 0.3 * vnoise(x * 150, y * 60, z * 150); return [lerp(0.25, HAIRF.r * n, k), lerp(0.18, HAIRF.g * n, k), lerp(0.15, HAIRF.b * n, k)]; });
      // strand direction UVs: around the parting, down the head
      const p = hg.attributes.position, uv = hg.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) - 0.022, y = p.getY(i) - 0.11, z = p.getZ(i); uv.setXY(i, Math.atan2(z, x) * 3, Math.hypot(x, y, z) * 8); }
      hg.applyMatrix4(MH); add(root, hg, M.hair).name = 'hairShell';
    }
    // the curtain of hair down the back: a shell outside the envelope
    let curtain;
    {
      const Fh = (x, y, z) => {
        const e = envW(x, y, z);
        toC(x, y, z, tmp); const a = tmp[0], yc = tmp[1], b = tmp[2];
        toHead(x, y, z, tmp2);
        // only behind the ears/shoulders: region in canonical body coords and head coords
        const behind = tmp2[2] < 0.03 + 0.03 * sstep(0.0, -0.08, tmp2[1]);
        const wid = 0.1 + 0.025 * sstep(1.5, 1.3, yc);
        let thk = lerp(0.008, 0.019, sstep(0.0, -0.16, tmp2[1])) + 0.004 * vnoise(x * 30, y * 8, z * 30);
        thk *= sstep(hairBottom(a) + 0.03, hairBottom(a) + 0.12, yc) * 0.8 + 0.2;
        thk *= 0.35 + 0.65 * sstep(wid + 0.01, wid - 0.05, Math.abs(a));
        let d = smax(e - 0.003 - thk, -(e - 0.003), 0.003);
        d = smax(d, Math.abs(a) - wid, 0.02);
        d = smax(d, (hairBottom(a) + 0.045 - yc) * S, 0.01);
        d = smax(d, b - (-0.02 + 0.06 * sstep(1.4, 1.62, yc)), 0.015);
        if (!behind) d = Math.max(d, 0.002);
        d = smax(d, tmp2[1] * HS - 0.02, 0.02); // stops under the crown (the shell covers the top)
        return d;
      };
      curtain = Fh;
      const hg = surfaceNets(Fh, [-0.25, 0.6, -0.25], [0.25, 1.36, 0.12], 0.0085);
      vcol(hg, (x, y, z) => { const n = 0.8 + 0.35 * vnoise(x * 120, y * 12, z * 120); return [HAIRF.r * n, HAIRF.g * n, HAIRF.b * n]; });
      const p = hg.attributes.position, uv = hg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getX(i) - HC.x, p.getZ(i) - HC.z) * 1.6, p.getY(i) * 2.2);
      add(root, hg, M.hair).name = 'hairCurtain';
    }
    // locks: clumps that start on the scalp, sweep away from the parting and back over the ears, then fall onto the back
    {
      const R = LIB.rnd(91), all = [];
      const skL = (x, y, z) => smin(sdEll(x, y, z, [0, 0.016, -0.014], [0.075, 0.088, 0.099]), sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);
      const PART = 0.022;
      const envG = (p) => { const g = gradAt(envW, p.x, p.y, p.z, 0.002); return V(g[0], g[1], g[2]); };
      const backDir = spine.frame(1.3).F.clone().negate();
      const hzW = V(0, 0, 1).transformDirection(MH).normalize();
      const hl = [0, 0, 0];
      let made = 0;
      for (let tries = 0; tries < 6000 && made < 80; tries++) {
        const az0 = (R() * 2 - 1) * 2.9, el0 = lerp(-0.2, 1.5, Math.sqrt(R()));
        const dir0 = V(Math.sin(az0) * Math.cos(el0), Math.sin(el0), Math.cos(az0) * Math.cos(el0));
        const pl = project(skL, A3(V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(dir0, 0.11)), 0);
        if (hairEdge(pl[0], pl[1], pl[2]) < 0.03) continue;
        if (pl[1] > 0.03 && Math.abs(pl[0] - PART) < 0.004) continue;
        const side = pl[0] >= PART ? 1 : -1;
        const cL = hairCoords(pl[0], pl[1], pl[2]); const shT = 0.009 + 0.004 * sstep(0.3, 1.0, cL[1]);
        const off = shT + lerp(0.0, 0.0035, R()), stepA = 0.008;
        let p = V(pl[0], pl[1], pl[2]); const ptsL = [], nL = [];
        for (let i = 0; i < 40; i++) {
          const g = gradAt(skL, p.x, p.y, p.z, 0.001), n = V(g[0], g[1], g[2]);
          ptsL.push(p.clone().addScaledVector(n, 0.003 + off * sstep(0, 0.025, i * stepA))); nL.push(n);
          const top = sstep(-0.01, 0.07, p.y);
          const d = V(side * (0.3 + 1.2 * top), -1.0, -(0.3 + 1.6 * sstep(-0.05, 0.05, p.z)));
          d.addScaledVector(n, -d.dot(n)).normalize();
          p = V(...project(skL, A3(p.clone().addScaledVector(d, stepA)), 0));
          if (p.y < -0.035 || (p.z < -0.075 && p.y < -0.005)) break;
        }
        if (ptsL.length < 2) continue;
        const pts = ptsL.map(q => q.clone().applyMatrix4(MH)), nrm = nL.map(n => n.clone().transformDirection(MH));
        let q = pts[pts.length - 1].clone(), dir = q.clone().sub(pts[pts.length - 2]).normalize();
        const Lk = lerp(0.3, 0.46, R()); let len = (ptsL.length - 1) * stepA * HS;
        const offW = off * HS + 0.004 + 0.008 * R(), stepB = 0.026, endJ = 0.07 * R();
        while (len < Lk) {
          toC(q.x, q.y, q.z, tmp);
          const gt = V(0, -1, 0); if (tmp[1] < 1.56 && tmp[2] > -0.09) gt.addScaledVector(backDir, 0.9);
          dir = dir.multiplyScalar(0.45).add(gt.normalize().multiplyScalar(0.55)).normalize();
          q = q.clone().addScaledVector(dir, stepB); len += stepB;
          for (let k = 0; k < 2; k++) { const e = envW(q.x, q.y, q.z); if (e < offW) { const n = envG(q); q.addScaledVector(n, offW - e); } }
          toHead(q.x, q.y, q.z, hl); // keep the face clear
          const zl = 0.005 - 0.03 * sstep(0.0, -0.1, hl[1]);
          if (hl[1] < 0.03 && hl[2] > zl) q.addScaledVector(hzW, -(hl[2] - zl) * HS);
          pts.push(q.clone()); nrm.push(envG(q));
          toC(q.x, q.y, q.z, tmp); if (tmp[1] < hairBottom(tmp[0]) - endJ) break;
        }
        if (pts.length < 6) continue;
        const N = pts.length - 1, NR = 4, ring = [];
        const w0 = lerp(0.008, 0.017, R()), t0 = lerp(0.0016, 0.0026, R());
        for (let i = 0; i <= N; i++) {
          const u = i / N, c = pts[i], t = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
          const b = t.clone().cross(nrm[i]).normalize(), n = b.clone().cross(t).normalize();
          const onScalp = 1 - sstep(ptsL.length - 3, ptsL.length + 2, i);
          const w = w0 * (0.45 + 0.55 * sstep(0, 0.1, u)) * (1 - 0.7 * sstep(0.72, 1, u)) * (1 + 0.35 * onScalp), th = t0 * (0.6 + 0.4 * sstep(0, 0.1, u)) * (1 - 0.5 * sstep(0.7, 1, u)) * (1 - 0.45 * onScalp);
          const row = [];
          for (let j = 0; j < NR; j++) { const a = j / NR * TAU; row.push(A3(c.clone().addScaledVector(b, Math.cos(a) * w * 0.5).addScaledVector(n, Math.sin(a) * th * 0.5 * (Math.sin(a) > 0 ? 1 : 0.5)))); }
          ring.push(row);
        }
        const lg = loft(ring, true, (i, j) => [j / NR * 0.25 + made * 0.17, i / N * 3.2]);
        const k = 0.75 + 0.45 * R(), col = R() < 0.3 ? HAIRF2 : HAIRF; vcol(lg, () => [col.r * k, col.g * k, col.b * k]);
        all.push(lg); made++;
      }
      const mg = mergeGeos(all); add(root, mg, M.hairS).name = 'hairLocks';
      DBG.her.locks = made;
    }
    root.userData.triangles = triCount;
    root.userData.focusLocal = { x: 0, y: 0.82, z: 0.08, r: 0.6 };
    return root;
  }

  // ================================================================== build
  function build(opts) {
    opts = opts || {};
    const root = new THREE.Group(); root.name = 'campers';
    const DBG = {};
    const t0 = performance.now();
    const himX = -0.35, herX = 0.35, herYaw = -0.35;
    const mkLog = (ox, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (x, y, z) => { const zb = -x * s + z * c; return Math.hypot(y - 0.2, zb) - 0.18; }; };
    let him = null, her = null;
    if (opts.only !== 'her') {
      him = buildHim({ dbg: DBG, logD: mkLog(himX, 0) });
      him.position.set(himX, 0, 0); root.add(him);
    }
    if (opts.only !== 'him') {
      // she watches his fretting hand / the guitar neck (build frame -> her local frame)
      const gazeB = V(-0.05, 0.86, 0.36);
      const c = Math.cos(herYaw), s = Math.sin(herYaw), dx = gazeB.x - herX, dz = gazeB.z;
      const gazeLoc = V(dx * c - dz * s, gazeB.y, dx * s + dz * c);
      her = buildHer({ dbg: DBG, logD: mkLog(herX, herYaw), herGaze: gazeLoc });
      her.position.set(herX, 0, 0); her.rotation.y = herYaw; root.add(her);
    }
    DBG.buildMs = Math.round(performance.now() - t0);
    const fl = (g, f) => { const p = V(f.x, f.y, f.z).applyAxisAngle(V(0, 1, 0), g.rotation.y).add(g.position); return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), r: f.r }; };
    root.userData.parts = [];
    if (him) { him.userData.name = 'me, with the guitar'; him.userData.focus = fl(him, him.userData.focusLocal); root.userData.parts.push({ name: 'me, with the guitar', group: him, focus: him.userData.focus }); }
    if (her) { her.userData.name = 'the girl beside me'; her.userData.focus = fl(her, her.userData.focusLocal); root.userData.parts.push({ name: 'the girl beside me', group: her, focus: her.userData.focus }); }
    root.userData.focus = { x: 0, y: 0.78, z: 0.12, r: 1.0 };
    root.userData.name = 'by the campfire';

    // ---------------- strumming ----------------
    const st = { amp: 0, target: 0, clock: 0, lastAuto: -10, lastManual: -100, s: 0, lift: 0, stroke: null, ring: 0 };
    const DOWN = 0.095, UP = 0.30, PERIOD = 0.7;
    const startStroke = () => { st.stroke = { t: 0, s0: st.s, l0: st.lift }; st.ring = 1; };
    root.userData.setStrum = (v) => { st.target = clamp(+v || 0, 0, 1); };
    root.userData.strumNow = () => { st.lastManual = st.clock; startStroke(); };
    root.userData.tick = (t, dt) => {
      dt = clamp(dt || 0, 0, 0.05);
      st.clock += dt;
      st.amp += (st.target - st.amp) * Math.min(1, dt * 3);
      if (st.target === 0 && st.amp < 0.002) st.amp = 0;
      const manual = st.clock - st.lastManual < 2;
      if (st.amp > 0.02 && !manual && st.clock - st.lastAuto >= PERIOD) { st.lastAuto = st.clock; startStroke(); }
      let s = 0, lift = 0;
      if (st.stroke) {
        const k = st.stroke; k.t += dt;
        if (k.t < DOWN) { const u = k.t / DOWN, e = u * u * (3 - 2 * u); s = lerp(k.s0, 1, e); lift = lerp(k.l0, 0, Math.min(1, u * 3)); }
        else if (k.t < DOWN + UP) { const u = (k.t - DOWN) / UP, e = u * u * (3 - 2 * u); s = 1 - e; lift = Math.sin(PI * Math.min(1, u * 1.1)) * 1.0; }
        else { st.stroke = null; s = 0; lift = 0; }
      }
      st.s = s; st.lift = lift;
      const A = st.amp > 0 ? Math.min(1, st.amp * 1.15) : 0;
      if (him) him.userData.poseRight(s * A, lift * A);
      // strings shimmer briefly after a stroke
      st.ring = Math.max(0, st.ring - dt * 1.6);
      if (him) { const amp = st.ring * A; him.userData.strings.forEach((m, i) => { const w = 1 + amp * (2.5 - i * 0.25) * (0.6 + 0.4 * Math.sin(st.clock * (90 + i * 23))); m.scale.set(w, 1, w); }); }
    };
    root.userData._pose = (s, lift) => { if (him) him.userData.poseRight(s, lift || 0); };
    let n = 0; root.traverse(o => { if (o.isMesh) n += tris(o.geometry); }); root.userData.triangles = n;
    root.userData._dbg = DBG;
    return root;
  }

  window.CAMPERS = { build };
})();
