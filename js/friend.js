/* Pool room — "my friend": a young man leaning over the pool table, lining up a shot and taking practice strokes.
   FRIEND.build() -> THREE.Group in TABLE coordinates: origin = centre of the pool table on the floor, long axis x,
   cloth at y = 0.76, end rail outer edge at x = -1.26. He stands at the west (-x) end shooting toward +x along z = +0.08.
   The table itself is NOT built here; the cue ball and his cue are.
     userData.setStroke(v)  amplitude 0..1 (0 = perfectly still address, tip 3 cm behind the cue ball)
     userData.tick(t, dt)   pendulum practice strokes (~0.7 Hz: draw back ~14.5 cm, forward to 1 cm from the ball, a short
                            hold at the back, a longer pause every 4 strokes) while amplitude > 0; eases back to address at 0
   Only the right forearm, hand and the cue move.
   Body: signed-distance fields polygonised with surface nets. The torso is swept along a bent spine curve (canonical
   upright torso -> world via a frame field), limbs are world-space capsules solved with 2-bone IK, hands are posed
   finger chains, the face is meshed at a finer resolution than the rest of the head, eyes are separate glossy balls,
   brows and lashes are individual hair strands, and the hair is a flowing shell with clumps and a soft hairline. */
(function () {
  'use strict';
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
  function vnoise(x, y, z) { // smooth value noise, roughly -1..1
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash(a * 157 + b * 113 + c * 271);
    const l = (a, b, t) => a + (b - a) * t;
    return 2 * l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), ux), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux), uy),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux), uy), uz) - 1;
  }

  // ------------------------------------------------------------------ meshing helpers
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
  // keep only triangles whose centroid passes keep(x,y,z) (used for the open fine patches, so they have no cap faces)
  function clipGeo(g, keep) {
    const p = g.attributes.position, ix = g.index.array, out = [];
    for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (keep((p.getX(a) + p.getX(b) + p.getX(c)) / 3, (p.getY(a) + p.getY(b) + p.getY(c)) / 3, (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3)) out.push(a, b, c); }
    g.setIndex(out); return g;
  }
  function tris(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
  // strands: thin ribbons from polylines; each strand = list of points + width, ribbon faces `nrm`
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
  function gradAt(f, x, y, z, h) { const gx = f(x + h, y, z) - f(x - h, y, z), gy = f(x, y + h, z) - f(x, y - h, z), gz = f(x, y, z + h) - f(x, y, z - h), l = Math.hypot(gx, gy, gz) || 1; return [gx / l, gy / l, gz / l]; }
  function project(f, p, off) { // move p onto the surface f = off
    let x = p[0], y = p[1], z = p[2];
    for (let i = 0; i < 6; i++) { const d = f(x, y, z) - (off || 0), g = gradAt(f, x, y, z, 0.0008); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; }
    return [x, y, z];
  }
  // 2-bone IK
  function ik(S, W, L1, L2, pole) {
    const d = W.clone().sub(S); let dl = d.length(); const u = d.clone().divideScalar(dl); dl = Math.min(dl, L1 + L2 - 1e-4);
    const a = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    return S.clone().addScaledVector(u, a).addScaledVector(v, h);
  }

  // ------------------------------------------------------------------ materials / textures
  let MS = null;
  function mats() {
    if (MS) return MS;
    const hairTex = LIB.canvasTex('fr_hair', 256, 512, (g, w, h) => {
      g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, w, h); const r = LIB.rnd(23);
      for (let i = 0; i < 3200; i++) { const x = r() * w, v = 90 + Math.floor(r() * 165); g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + r() * 0.5) + ')'; g.lineWidth = 0.5 + r() * 1.1; g.beginPath(); const y0 = r() * h, L = 60 + r() * 260; g.moveTo(x, y0 - L); g.bezierCurveTo(x + (r() - 0.5) * 4, y0 - L / 3, x + (r() - 0.5) * 4, y0 + L / 3, x + (r() - 0.5) * 3, y0 + L); g.stroke(); }
    }, true);
    const hairBump = LIB.canvasTex('fr_hairb', 256, 512, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(29);
      for (let i = 0; i < 2000; i++) { const x = r() * w; g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'; g.lineWidth = 0.7 + r(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 5, h); g.stroke(); }
    }, false);
    const pore = LIB.canvasTex('fr_pore', 256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(41);
      for (let i = 0; i < 5000; i++) { const v = r() < 0.5 ? 70 : 150; g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    }, false);
    const weave = LIB.weaveBump();
    const twill = LIB.canvasTex('fr_twill', 256, 256, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let k = -h; k < w; k += 5) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(k + 2.5, h); g.lineTo(k + 2.5 + h, 0); g.stroke(); }
    }, false);
    const skin = LIB.mat({ c: '#83533a', rough: 0.55, bump: pore, bumpScale: 0.00025, emissive: '#4a1608', emissiveIntensity: 0.035 }); skin.vertexColors = true;
    const skinFar = LIB.mat({ c: '#83533a', rough: 0.55, bump: pore, bumpScale: 0.00025, emissive: '#4a1608', emissiveIntensity: 0.035 }); skinFar.vertexColors = true;
    skinFar.polygonOffset = true; skinFar.polygonOffsetFactor = 1; skinFar.polygonOffsetUnits = 2;
    const hair = LIB.mat({ c: '#ffffff', map: hairTex, rough: 0.52, bump: hairBump, bumpScale: 0.0005, env: 0.3 }); hair.vertexColors = true;
    const strand = LIB.mat({ c: '#ffffff', rough: 0.45, side: THREE.DoubleSide }); strand.vertexColors = true;
    const eyeTex = LIB.canvasTex('fr_eye', 512, 256, (g, w, h) => {
      const sc = g.createLinearGradient(0, 0, w, 0); sc.addColorStop(0, '#b9ab9c'); sc.addColorStop(0.25, '#d8cfc3'); sc.addColorStop(0.5, '#b9ab9c'); sc.addColorStop(1, '#b9ab9c');
      g.fillStyle = sc; g.fillRect(0, 0, w, h);
      const r = LIB.rnd(7); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(170,60,50,' + (0.08 + r() * 0.12) + ')'; g.lineWidth = 0.6; g.beginPath(); let x = w * 0.25 + (r() < 0.5 ? -1 : 1) * (60 + r() * 40), y = h * 0.5 + (r() - 0.5) * 60; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 20; y += (r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
      const cx = w * 0.25, cy = h * 0.5, R = 0.55 / TAU * w;
      const ir = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R); ir.addColorStop(0, '#2a170c'); ir.addColorStop(0.45, '#4a2a14'); ir.addColorStop(0.8, '#3a2210'); ir.addColorStop(0.93, '#1e130b'); ir.addColorStop(1, 'rgba(40,25,15,0)');
      g.fillStyle = ir; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      for (let i = 0; i < 90; i++) { const a = r() * TAU; g.strokeStyle = 'rgba(' + (r() < 0.5 ? '120,80,40' : '20,10,5') + ',0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.35, cy + Math.sin(a) * R * 0.35); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke(); }
      g.fillStyle = '#050403'; g.beginPath(); g.arc(cx, cy, R * 0.36, 0, TAU); g.fill();
    }, true);
    const eye = LIB.mat({ c: '#ffffff', map: eyeTex, rough: 0.3, clearcoat: 1, clearcoatRough: 0.03 });
    const shirt = LIB.mat({ c: '#3d6fb6', rough: 0.86, bump: weave, bumpScale: 0.0008 });
    const shirt2 = LIB.mat({ c: '#3d6fb6', rough: 0.86, bump: weave, bumpScale: 0.0008, side: THREE.DoubleSide });
    const pants = LIB.mat({ c: '#6b4a2f', rough: 0.84, bump: twill, bumpScale: 0.0009 });
    const leather = LIB.mat({ c: '#151414', rough: 0.4, bump: pore, bumpScale: 0.0003, physical: true, clearcoat: 0.25, clearcoatRough: 0.4 }); leather.vertexColors = true;
    const sole = LIB.mat({ c: '#1c1b1a', rough: 0.82 });
    const lace = LIB.mat({ c: '#121212', rough: 0.9 });
    // cue
    const maple = LIB.canvasTex('fr_maple', 128, 1024, (g, w, h) => {
      g.fillStyle = '#e6cf9f'; g.fillRect(0, 0, w, h); const r = LIB.rnd(51);
      for (let i = 0; i < 160; i++) { const x = r() * w, a = 0.04 + r() * 0.08; g.strokeStyle = r() < 0.7 ? 'rgba(150,105,55,' + a + ')' : 'rgba(255,240,210,' + a + ')'; g.lineWidth = 0.5 + r() * 1.5; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 64) g.lineTo(x + Math.sin(y * 0.01 + i) * 2, y); g.stroke(); }
    }, true);
    const darkwood = LIB.canvasTex('fr_dwood', 128, 1024, (g, w, h) => {
      g.fillStyle = '#3e2416'; g.fillRect(0, 0, w, h); const r = LIB.rnd(53);
      for (let i = 0; i < 120; i++) { const x = r() * w, a = 0.1 + r() * 0.2; g.strokeStyle = r() < 0.6 ? 'rgba(15,6,2,' + a + ')' : 'rgba(120,70,40,' + a * 0.6 + ')'; g.lineWidth = 0.6 + r() * 2; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 64) g.lineTo(x + Math.sin(y * 0.008 + i * 1.7) * 4, y); g.stroke(); }
    }, true);
    const wrapTex = LIB.canvasTex('fr_wrap', 64, 64, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y + 2, w, 1); }
    }, false, 8, 60);
    const shaft = LIB.mat({ c: '#ffffff', map: maple, rough: 0.28, physical: true, clearcoat: 0.6, clearcoatRough: 0.15 });
    const ferrule = LIB.mat({ c: '#f1eee6', rough: 0.28 });
    const tip = LIB.mat({ c: '#3a64b4', rough: 0.85 });
    const chalk = LIB.mat({ c: '#6e93d6', rough: 0.95 });
    const collar = LIB.mat({ c: '#151515', rough: 0.3 });
    const butt = LIB.mat({ c: '#ffffff', map: darkwood, rough: 0.25, physical: true, clearcoat: 0.8, clearcoatRough: 0.08 });
    const wrap = LIB.mat({ c: '#1e1e1f', rough: 0.75, bump: wrapTex, bumpScale: 0.0008 });
    const ring = LIB.mat({ c: '#d8d4cc', rough: 0.3 });
    const bumper = LIB.mat({ c: '#0e0e0e', rough: 0.8 });
    const ball = LIB.mat({ c: '#f4f2ea', rough: 0.1, clearcoat: 1, clearcoatRough: 0.03 });
    MS = { skin, skinFar, hair, strand, eye, shirt, shirt2, pants, leather, sole, lace, shaft, ferrule, tip, chalk, collar, butt, wrap, ring, bumper, ball };
    return MS;
  }

  // ------------------------------------------------------------------ table-frame constants
  const CLOTH = 0.76;
  const BALL = V(-0.62, 0.7885, 0.08), BALL_R = 0.0285;
  const ELEV = 8.5 * PI / 180;
  const CUE_D = V(Math.cos(ELEV), -Math.sin(ELEV), 0);         // butt -> tip
  const TIP0 = BALL.clone().addScaledVector(CUE_D, -(BALL_R + 0.03)); // tip face at address
  const CUE_LEN = 1.47;
  const cueAt = (s) => TIP0.clone().addScaledVector(CUE_D, -s);  // axis point s metres back from the tip
  // cue radius profile (s from the tip)
  const CUE_PROF = [[0, 0.0058], [0.004, 0.0064], [0.011, 0.0064], [0.035, 0.0065], [0.32, 0.0068], [0.74, 0.0106], [0.765, 0.0108], [0.99, 0.0139], [1.29, 0.0147], [1.455, 0.0156], [1.47, 0.0150]];
  const cueR = (s) => { for (let i = 0; i < CUE_PROF.length - 1; i++) { const a = CUE_PROF[i], b = CUE_PROF[i + 1]; if (s <= b[0]) return lerp(a[1], b[1], clamp((s - a[0]) / (b[0] - a[0]), 0, 1)); } return 0.015; };

  // ------------------------------------------------------------------ pose parameters
  const POSE = {
    Sm: V(-1.31, 1.06, -0.04),  // spine point at shoulder-joint level (canonical y = 1.415)
    phiP: 1.05, phiC: 1.30,         // forward flexion of pelvis / chest (rad from vertical)
    etaP: 0.50, etaC: 0.30,         // heading of the bend (toward +z) at pelvis / chest
    Lc: V(0.52, -0.20, -0.83),      // shoulder line (person's left) at the chest
    bridgeX: -0.84,
    gripTilt: -0.04,                 // forward tilt of the right forearm at address (rad)
  };
  const SY0 = 0.50, SY1 = 1.56, SDY = 0.01, SN = Math.round((SY1 - SY0) / SDY), SYA = 1.415;
  const SP = new Float64Array((SN + 1) * 3), ST = new Float64Array((SN + 1) * 3), SL = new Float64Array((SN + 1) * 3), SF = new Float64Array((SN + 1) * 3);
  function spineFrame(y) {
    const phi = lerp(POSE.phiP, POSE.phiC, sstep(0.93, 1.26, y));
    const eta = lerp(POSE.etaP, POSE.etaC, sstep(0.95, 1.35, y));
    const T = V(Math.sin(phi) * Math.cos(eta), Math.cos(phi), Math.sin(phi) * Math.sin(eta));
    const Lp = V(Math.sin(eta), 0, -Math.cos(eta)); // horizontal, perpendicular to the heading
    const L = Lp.clone().lerp(POSE.Lc.clone().normalize(), sstep(1.0, 1.40, y));
    L.addScaledVector(T, -L.dot(T)).normalize();
    const F = L.clone().cross(T);
    return { T, L, F };
  }
  function buildSpine() {
    const fr = []; for (let i = 0; i <= SN; i++) fr.push(spineFrame(SY0 + i * SDY));
    const ia = Math.round((SYA - SY0) / SDY), P = []; P[ia] = POSE.Sm.clone();
    for (let i = ia + 1; i <= SN; i++) P[i] = P[i - 1].clone().addScaledVector(fr[i - 1].T.clone().add(fr[i].T).normalize(), SDY);
    for (let i = ia - 1; i >= 0; i--) P[i] = P[i + 1].clone().addScaledVector(fr[i + 1].T.clone().add(fr[i].T).normalize(), -SDY);
    for (let i = 0; i <= SN; i++) { const k = i * 3, f = fr[i]; SP[k] = P[i].x; SP[k + 1] = P[i].y; SP[k + 2] = P[i].z; ST[k] = f.T.x; ST[k + 1] = f.T.y; ST[k + 2] = f.T.z; SL[k] = f.L.x; SL[k + 1] = f.L.y; SL[k + 2] = f.L.z; SF[k] = f.F.x; SF[k + 1] = f.F.y; SF[k + 2] = f.F.z; }
  }
  // world -> canonical upright body (a = toward his left, y = height, b = toward his front)
  let lastBi = 0;
  const sd2 = (i, x, y, z) => { const k = i * 3, dx = x - SP[k], dy = y - SP[k + 1], dz = z - SP[k + 2]; return dx * dx + dy * dy + dz * dz; };
  function toC(x, y, z, o) {
    // hill-climb from the previous answer (grid evaluation is spatially coherent)
    let bi = 0, bd = 1e9; for (let i = 0; i <= SN; i++) { const d = sd2(i, x, y, z); if (d < bd) { bd = d; bi = i; } }
    for (;;) { if (bi < SN) { const d = sd2(bi + 1, x, y, z); if (d < bd) { bd = d; bi++; continue; } } if (bi > 0) { const d = sd2(bi - 1, x, y, z); if (d < bd) { bd = d; bi--; continue; } } break; }
    lastBi = bi;
    const k = bi * 3, dx = x - SP[k], dy = y - SP[k + 1], dz = z - SP[k + 2];
    o[0] = dx * SL[k] + dy * SL[k + 1] + dz * SL[k + 2];
    o[1] = SY0 + bi * SDY + dx * ST[k] + dy * ST[k + 1] + dz * ST[k + 2];
    o[2] = dx * SF[k] + dy * SF[k + 1] + dz * SF[k + 2];
    return o;
  }
  function toW(a, yc, b) {
    const f = clamp((yc - SY0) / SDY, 0, SN), i = Math.min(SN - 1, Math.floor(f)), t = f - i, k = i * 3, k2 = k + 3;
    const L = (arr, j) => lerp(arr[k + j], arr[k2 + j], t);
    const ext = yc - (SY0 + f * SDY);
    return V(L(SP, 0) + a * L(SL, 0) + b * L(SF, 0) + ext * L(ST, 0), L(SP, 1) + a * L(SL, 1) + b * L(SF, 1) + ext * L(ST, 1), L(SP, 2) + a * L(SL, 2) + b * L(SF, 2) + ext * L(ST, 2));
  }

  // ------------------------------------------------------------------ canonical male torso (skin), upright
  // y, half-width, front depth, back depth, centre x, centre z
  const TT = table([
    [0.74, 0.150, 0.070, 0.092, 0, 0.000],
    [0.80, 0.162, 0.076, 0.106, 0, -0.004],
    [0.86, 0.168, 0.082, 0.114, 0, -0.008],
    [0.92, 0.169, 0.087, 0.108, 0, -0.006],
    [0.98, 0.159, 0.090, 0.093, 0, -0.002],
    [1.04, 0.147, 0.092, 0.087, 0, 0.000],
    [1.10, 0.149, 0.097, 0.089, 0, 0.000],
    [1.17, 0.156, 0.103, 0.095, 0, -0.004],
    [1.24, 0.163, 0.107, 0.100, 0, -0.008],
    [1.30, 0.167, 0.104, 0.103, 0, -0.012],
    [1.36, 0.169, 0.092, 0.099, 0, -0.016],
    [1.41, 0.158, 0.074, 0.088, 0, -0.020],
    [1.45, 0.122, 0.060, 0.072, 0, -0.022],
    [1.49, 0.066, 0.049, 0.058, 0, -0.024],
  ]);
  function torsoBase(a, y, b) {
    const r = TT(y), W = r[0], dx = a - r[3], dz = b - r[4], D = dz > 0 ? r[1] : r[2];
    const ux = Math.abs(dx) / W, uz = Math.abs(dz) / D, n = 2.35;
    return (Math.pow(Math.pow(ux, n) + Math.pow(uz, n), 1 / n) - 1) * Math.min(W, D);
  }
  const SHJ = [0.176, 1.415, -0.014]; // canonical shoulder joint (left = +a)
  function torsoC(a, y, b) {
    let d = smax(torsoBase(a, y, b), y - 1.505, 0.03);
    if (y > 1.05) {
      const aa = Math.abs(a);
      d = smin(d, sdCap(aa, y, b, [0.03, 1.488, -0.03], [0.158, 1.442, -0.02], 0.042, 0.04), 0.05);  // trapezius / shoulder top
      d = smin(d, sdEll(aa, y, b, [0.178, 1.405, -0.006], [0.046, 0.055, 0.05]), 0.03);              // shoulder cap
      if (b > -0.02) d = smin(d, sdEll(aa, y, b, [0.072, 1.30, 0.062], [0.07, 0.055, 0.05]), 0.05);  // pectorals
      if (b < 0.0) d = smin(d, sdEll(aa, y, b, [0.085, 1.31, -0.07], [0.065, 0.085, 0.04]), 0.05);   // scapulae
    }
    return d;
  }

  // ------------------------------------------------------------------ hands (mom's chain model, scaled for a man)
  const HSC = 1.03;
  const FING = [
    { base: [0.089, 0.000, 0.025], len: [0.042, 0.025, 0.019], rad: [0.0082, 0.0074, 0.0067, 0.0059] },
    { base: [0.093, 0.000, 0.007], len: [0.047, 0.029, 0.020], rad: [0.0084, 0.0076, 0.0069, 0.0061] },
    { base: [0.089, -0.001, -0.011], len: [0.044, 0.027, 0.019], rad: [0.0079, 0.0072, 0.0065, 0.0058] },
    { base: [0.080, -0.003, -0.027], len: [0.034, 0.020, 0.017], rad: [0.0071, 0.0064, 0.0058, 0.0052] },
  ];
  const THUMB = { base: [0.014, -0.010, 0.019], len: [0.040, 0.031, 0.025], rad: [0.0122, 0.0101, 0.0091, 0.0081] };
  function fingerChain(F, ang) {
    const pts = [F.base.slice()]; let a = 0, p = F.base; const sp = ang[3] || 0;
    for (let j = 0; j < 3; j++) { a += ang[j]; const L = F.len[j]; p = [p[0] + L * Math.cos(a) * Math.cos(sp), p[1] - L * Math.sin(a), p[2] + L * Math.cos(a) * Math.sin(sp)]; pts.push(p); }
    return pts;
  }
  function thumbChain(T, bow) {
    const J = [THUMB.base.slice()]; let p = THUMB.base;
    for (let j = 0; j < 3; j++) { const L = THUMB.len[j], b = j === 0 ? bow : j === 1 ? bow.map(v => v * 0.35) : [0, 0, 0]; let dx = T[0] - p[0] + b[0], dy = T[1] - p[1] + b[1], dz = T[2] - p[2] + b[2]; const l = Math.hypot(dx, dy, dz) || 1; p = [p[0] + dx / l * L, p[1] + dy / l * L, p[2] + dz / l * L]; J.push(p); }
    return J;
  }
  function handSDF(chains, thumb) {
    const caps = [];
    chains.forEach((pts, i) => { for (let j = 0; j < 3; j++) caps.push([pts[j], pts[j + 1], FING[i].rad[j], FING[i].rad[j + 1], i]); });
    const tc = []; for (let j = 0; j < 3; j++) tc.push([thumb[j], thumb[j + 1], THUMB.rad[j], THUMB.rad[j + 1]]);
    const kn = chains.map((pts, i) => [pts[0][0] - 0.002, pts[0][1] + 0.0055, pts[0][2]]);
    return function (x, y, z) {
      const bx = x - 0.06, by = y + 0.012, bz = z - 0.01, br = Math.sqrt(bx * bx + by * by + bz * bz);
      if (br > 0.16) return br - 0.14;
      let d = sdRBox(x - 0.048, y + 0.003, z - 0.002, 0.032, 0.003, 0.026, 0.0125);
      d = smin(d, sdEll(x, y, z, [0.052, 0.002, 0.0], [0.042, 0.0125, 0.034]), 0.01); // metacarpal arch (rounded back of the hand)
      d = smin(d, sdEll(x, y, z, [-0.008, 0, 0.0], [0.032, 0.0165, 0.0255]), 0.016);
      d = smin(d, sdEll(x, y, z, [0.03, -0.009, 0.022], [0.03, 0.0135, 0.017]), 0.012);  // thenar
      d = smin(d, sdEll(x, y, z, [0.04, -0.007, -0.025], [0.034, 0.012, 0.012]), 0.01);  // hypothenar
      for (let i = 0; i < 4; i++) d = smin(d, sdEll(x, y, z, kn[i], [0.0085, 0.0078, 0.0076]), 0.006); // knuckles
      let fd = 1e9, cur = 1e9, last = -1;
      for (let i = 0; i < caps.length; i++) { const c = caps[i], e = sdCap(x, y, z, c[0], c[1], c[2], c[3]); if (c[4] !== last) { fd = Math.min(fd, cur); cur = e; last = c[4]; } else cur = smin(cur, e, 0.0028); }
      fd = Math.min(fd, cur);
      d = smin(d, fd, 0.007);
      let td = 1e9; for (let i = 0; i < 3; i++) { const c = tc[i]; td = smin(td, sdCap(x, y, z, c[0], c[1], c[2], c[3]), 0.003); }
      d = smin(d, td, 0.013);
      return d;
    };
  }

  // ------------------------------------------------------------------ head (local frame: cranium centre, +z = face, +y = up, +x = his left)
  const EYE = [0.0315, 0.003, 0.070], EYE_R = 0.0122;
  let LID = { e0: 0.1, h: 0.36 };
  function headSDF(x, y, z) {
    const ax = Math.abs(x);
    let d = sdEll(x, y, z, [0, 0.016, -0.014], [0.075, 0.088, 0.099]);
    d = smin(d, sdEll(x, y, z, [0, -0.03, 0.018], [0.058, 0.06, 0.064]), 0.03);
    d = smin(d, sdEll(x, y, z, [0, -0.052, 0.045], [0.04, 0.035, 0.037]), 0.025);  // dental arch
    d = smin(d, sdCap(ax, y, z, [0.056, -0.03, -0.024], [0.031, -0.093, 0.049], 0.015, 0.013), 0.03); // jaw
    d = smin(d, sdEll(x, y, z, [0, -0.096, 0.07], [0.025, 0.018, 0.02]), 0.02);                       // chin
    d = smin(d, sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);                       // occipital/nape
    if (z > -0.01) {
      d = smin(d, sdEll(ax, y, z, [0.047, -0.018, 0.049], [0.024, 0.02, 0.026]), 0.026);              // cheekbones
      d = smin(d, sdEll(ax, y, z, [0.038, -0.045, 0.045], [0.018, 0.02, 0.02]), 0.02);                // cheeks
      d = smin(d, sdCap(x, y, z, [-0.041, 0.026, 0.077], [0.041, 0.026, 0.077], 0.0115, 0.0115), 0.02); // brow ridge
      d = smax(d, -sdEll(ax, y, z, [0.0315, 0.002, 0.095], [0.019, 0.0145, 0.017]), 0.007);          // eye socket
      // eyelids: a shell around the eyeball, open in an almond
      if (ax > 0.012 && ax < 0.052 && y > -0.016 && y < 0.02) {
        const qx = ax - EYE[0], qy = y - EYE[1], qz = z - EYE[2], ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
        let sh = Math.abs(ql - (EYE_R + 0.0017)) - 0.0017;
        const az = Math.atan2(qx, qz), el = Math.atan2(qy, Math.hypot(qx, qz));
        const amax = 1.05, hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / amax, 2)) - 0.03;
        const up = el - LID.e0 - 0.025 * Math.sin(az * 2.0), open = (hh - Math.abs(up)) * EYE_R; // >0 inside the opening
        sh = smax(sh, open, 0.0012);
        sh = smax(sh, -qz - 0.004, 0.003);
        d = smin(d, sh, 0.0025);
      }
      d = smin(d, sdCap(x, y, z, [0, 0.013, 0.085], [0, -0.03, 0.1075], 0.0078, 0.011), 0.01);       // nose bridge
      d = smin(d, sdEll(x, y, z, [0, -0.0322, 0.1025], [0.0088, 0.0088, 0.0094]), 0.006);            // tip
      d = smin(d, sdEll(ax, y, z, [0.0118, -0.0362, 0.0965], [0.0068, 0.0062, 0.0074]), 0.007);      // alae
      d = smax(d, -sdEll(ax, y, z, [0.0078, -0.0442, 0.1015], [0.0042, 0.0027, 0.0058]), 0.0016);    // nostrils
      d = smin(d, sdEll(x, y, z, [0, -0.0565, 0.0825], [0.0185, 0.0047, 0.0084]), 0.009);            // upper lip
      d = smin(d, sdEll(x, y, z, [0, -0.0672, 0.0805], [0.0165, 0.0051, 0.0082]), 0.009);            // lower lip
      d = smax(d, -sdEll(x, y, z, [0, -0.0617, 0.0915], [0.0185, 0.0011, 0.012]), 0.0012);           // mouth line
      d = smax(d, -sdEll(x, y, z, [0, -0.077, 0.09], [0.016, 0.004, 0.006]), 0.004);                 // mentolabial fold
    }
    if (ax > 0.05) { // ears
      const ex = ax - 0.0765, ey = y + 0.004, ez = z + 0.016, c = Math.cos(0.22), s = Math.sin(0.22), ry = ey * c - ez * s, rz = ey * s + ez * c;
      let e = sdEll(ex, ry, rz, [0, 0, 0], [0.0098, 0.0275, 0.0168]);
      e = smax(e, -sdEll(ex, ry, rz, [0.0068, 0.003, 0.003], [0.0056, 0.0172, 0.0098]), 0.004);
      e = smin(e, sdEll(ex, ry, rz, [0.0, -0.003, 0.011], [0.007, 0.007, 0.006]), 0.004); // tragus
      d = smin(d, e, 0.006);
    }
    return d;
  }
  const SKULL = [[0, 0.016, -0.014], [0.075, 0.088, 0.099]];
  // hairline in terms of (azimuth around the head from the face, elevation): table over |azimuth|
  const HL_T = table([[0.0, 0.565], [0.25, 0.575], [0.45, 0.62], [0.62, 0.58], [0.82, 0.35], [0.98, 0.0], [1.07, -0.33], [1.16, -0.30], [1.24, 0.12], [1.45, 0.20], [1.7, 0.16], [1.9, -0.05], [2.1, -0.45], [2.5, -0.68], [3.15, -0.74]]);
  const HCEN = [0, 0.016, -0.012];
  function hairCoords(x, y, z) { const dx = x, dy = y - HCEN[1], dz = z - HCEN[2]; return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; }
  function hairEdge(x, y, z) { // >0 where hair grows (radians past the hairline)
    const c = hairCoords(x, y, z), az = Math.abs(c[0]);
    return c[1] - HL_T(az)[0] + 0.022 * vnoise(c[0] * 9, c[1] * 9, 3.1) + 0.012 * vnoise(c[0] * 30, c[1] * 30, 7.7);
  }

  // ------------------------------------------------------------------ build
  function build() {
    const M = mats();
    const root = new THREE.Group(); root.name = 'friend';
    let triCount = 0; const add = (parent, geo, mat, x, y, z, o) => { triCount += tris(geo); return LIB.mesh(parent, geo, mat, x || 0, y || 0, z || 0, o); };
    const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
    buildSpine();
    const DBG = {};

    // ---------------- key joints ----------------
    const SJL = toW(SHJ[0], SHJ[1], SHJ[2]), SJR = toW(-SHJ[0], SHJ[1], SHJ[2]);
    const HJL = toW(0.091, 0.905, 0.008), HJR = toW(-0.091, 0.905, 0.008);
    const L1 = 0.30, L2 = 0.265;
    DBG.SJL = SJL; DBG.SJR = SJR; DBG.HJL = HJL; DBG.HJR = HJR;

    // ---------------- right hand on the cue (grip) ----------------
    const RH = 0.0146 / HSC, AL = 1.30, HLg = [0.098, -0.033, 0.004];
    function gripFrame(s) {
      const kz = CUE_D.clone(), ky = V(0, 1, 0).addScaledVector(kz, -kz.y).normalize(), kx = ky.clone().cross(kz);
      const HX = kz.clone().multiplyScalar(Math.cos(AL)).addScaledVector(ky, -Math.sin(AL));
      const HY = kx.clone().negate();
      const HZ = kz.clone().multiplyScalar(Math.sin(AL)).addScaledVector(ky, Math.cos(AL));
      const G = cueAt(s);
      const W = G.clone().addScaledVector(HX, -HLg[0] * HSC).addScaledVector(HY, -HLg[1] * HSC).addScaledVector(HZ, -HLg[2] * HSC);
      return { HX, HY, HZ, G, W };
    }
    // choose the grip position so the forearm hangs with the wanted forward tilt
    let gs = 1.05, RG = null, ER = null;
    for (let it = 0; it < 40; it++) {
      RG = gripFrame(gs); ER = ik(SJR, RG.W, L1, L2, V(-0.4, 1, 0.25));
      const tilt = Math.atan2(RG.W.x - ER.x, ER.y - RG.W.y);
      gs += (tilt - POSE.gripTilt) * 0.25; gs = clamp(gs, 0.85, 1.3);
    }
    const WR = RG.W, HXr = RG.HX, HYr = RG.HY, HZr = RG.HZ;
    DBG.grip = gs; DBG.ER = ER; DBG.WR = WR; DBG.rReach = SJR.distanceTo(WR);
    const cotA = Math.cos(AL) / Math.sin(AL);
    const rChains = FING.map((F, i) => {
      const C = [HLg[0] + (F.base[2] - HLg[2]) * cotA, HLg[1]]; const ang = []; let px = F.base[0], py = F.base[1], a = 0;
      const slack = [0.001, 0.0015, 0.003, 0.0045][i];
      for (let j = 0; j < 3; j++) { const L = F.len[j], Rr = RH + F.rad[j + 1] + slack; let best = a + 1.0, bestE = 1e9;
        for (let b = a; b < a + 2.4; b += 0.005) { const nx = px + L * Math.cos(b), ny = py - L * Math.sin(b), e = Math.hypot(nx - C[0], ny - C[1]) - Rr; if (e <= 0) { best = b; break; } if (Math.abs(e) < bestE) { bestE = Math.abs(e); best = b; } }
        ang.push(best - a); px += L * Math.cos(best); py -= L * Math.sin(best); a = best; }
      ang.push([0.06, 0.0, -0.05, -0.11][i]);
      return fingerChain(F, ang);
    });
    const rThumbT = [HLg[0] + 0.028 * Math.cos(AL) - 0.012, HLg[1] - RH - 0.008, HLg[2] + 0.028 * Math.sin(AL)];
    const rThumb = thumbChain(rThumbT, [0.0, 0.012, -0.01]);
    const rHand = handSDF(rChains, rThumb);

    // ---------------- left hand: open bridge on the cloth ----------------
    const gam = 0.36; // fingers point forward-left
    let bet = 0.17;   // hand pitch (knuckles raised)
    const lThumbT = [0.079, 0.031, 0.036];
    const lThumb = thumbChain(lThumbT, [0.0, 0.014, 0.008]);
    const SPR = [0.25, 0.05, -0.17, -0.37];
    let lChains = FING.map((F, i) => fingerChain(F, [0.5, 0.25, 0.1, SPR[i]]));
    let lHand = handSDF(lChains, lThumb);
    const BRIDGE = cueAt(TIP0.x - POSE.bridgeX);          // cue axis point over the bridge
    const lFrame = (b) => {
      const hd = V(Math.cos(gam), 0, -Math.sin(gam));
      const X = hd.clone().multiplyScalar(Math.cos(b)).add(V(0, Math.sin(b), 0));
      const Y = hd.clone().multiplyScalar(-Math.sin(b)).add(V(0, Math.cos(b), 0));
      const Z = Y.clone().cross(X);
      return { X, Y, Z };
    };
    // local (mirrored) hand point -> world for a wrist W
    const lw = (fr, W, p) => W.clone().addScaledVector(fr.X, p[0] * HSC).addScaledVector(fr.Y, p[1] * HSC).addScaledVector(fr.Z, -p[2] * HSC);
    // find where the cue rests on the hand (the V between thumb and index knuckle), in hand-local coordinates
    function restPoint(fr, hand) {
      const dw = CUE_D.clone(), cl = [dw.dot(fr.X), dw.dot(fr.Y), -dw.dot(fr.Z)];
      const up = V(0, 1, 0), ul = [up.dot(fr.X), up.dot(fr.Y), -up.dot(fr.Z)];
      const sd = V(0, 0, 1), sl = [sd.dot(fr.X), sd.dot(fr.Y), -sd.dot(fr.Z)];
      const r = 0.0066 / HSC, ref = [0.084, 0.02, 0.032];
      const H = [], U = [];
      for (let u = -0.02; u <= 0.0201; u += 0.001) {
        // lower a cylinder from above until it touches the hand
        let h = 0.06;
        for (let k = 0; k < 160; k++) {
          let m = 1e9;
          for (let t = -0.007; t <= 0.007; t += 0.0035) { const px = ref[0] + sl[0] * u + ul[0] * h + cl[0] * t, py = ref[1] + sl[1] * u + ul[1] * h + cl[1] * t, pz = ref[2] + sl[2] * u + ul[2] * h + cl[2] * t; m = Math.min(m, hand(px, py, pz)); }
          if (m - r < 0.0002) break; h -= Math.max((m - r) * 0.8, 0.0002);
          if (h < -0.05) break;
        }
        H.push(h); U.push(u);
      }
      // the cue settles in a supported valley: a local minimum of the drop height with higher ground both sides
      let bi = -1;
      for (let i = 1; i < H.length - 1; i++) {
        if (H[i] < -0.04) continue;
        let l = -1, rr = -1; for (let j = i - 1; j >= 0; j--) { if (H[j] < -0.04) break; l = Math.max(l, H[j]); } for (let j = i + 1; j < H.length; j++) { if (H[j] < -0.04) break; rr = Math.max(rr, H[j]); }
        if (l > H[i] + 0.0015 && rr > H[i] + 0.0015 && (bi < 0 || H[i] < H[bi])) bi = i;
      }
      if (bi < 0) { // no valley: sit on the knuckle against the thumb wall (biggest rise toward the thumb side)
        let mj = 0; for (let i = 1; i < H.length; i++) { if (H[i - 1] < -0.04) continue; const j = H[i] - H[i - 1]; if (j > mj) { mj = j; bi = i - 1; } }
        if (mj < 0.003) bi = -1;
      }
      const ok = bi >= 0;
      if (bi < 0) { let mx = -1; for (let i = 0; i < H.length; i++) if (H[i] > mx) { mx = H[i]; bi = i; } }
      restPoint.ok = ok;
      DBG.restH = H.map(v => +v.toFixed(3)).join(',');
      return [ref[0] + sl[0] * U[bi] + ul[0] * H[bi], ref[1] + sl[1] * U[bi] + ul[1] * H[bi], ref[2] + sl[2] * U[bi] + ul[2] * H[bi]];
    }
    let WL = null, LF = null, VL = null;
    const heelY = (fr) => { let m = 1e9; for (let x = -0.01; x <= 0.05; x += 0.005) for (let z = -0.025; z <= 0.03; z += 0.005) m = Math.min(m, lw(fr, V(0, 0, 0), [x, -0.0215, z]).y); return m; };
    const need = BRIDGE.y - (CLOTH + 0.0006);
    for (let it = 0; it < 2; it++) {
      // cupping (knuckle lift) such that the cue sits in the thumb/knuckle V and the heel of the palm is on the cloth
      let best = null;
      for (let b = 0.0; b <= 0.62; b += 0.02) {
        const fr = lFrame(b), v = restPoint(fr, lHand), ok = restPoint.ok;
        const err = Math.abs(lw(fr, V(0, 0, 0), v).y - heelY(fr) - need) + (ok ? 0 : 0.02);
        if (!best || err < best.err) best = { b, err, ok };
      }
      bet = best.b; DBG.bridgeOk = best.ok; DBG.bridgeErr = best.err;
      LF = lFrame(bet); VL = restPoint(LF, lHand);
      WL = BRIDGE.clone().sub(lw(LF, V(0, 0, 0), VL));
      DBG.VL = VL.map(v => +v.toFixed(4)).join(',');
      // fingers spread and arched down onto the cloth
      lChains = FING.map((F, i) => {
        const sp = SPR[i]; let lo = -0.3, hi = 1.6;
        for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, ch = fingerChain(F, [m, m * 0.35, m * 0.12, sp]), tp = lw(LF, WL, ch[3]); if (tp.y - F.rad[3] * HSC > CLOTH + 0.0004) lo = m; else hi = m; }
        const m = (lo + hi) / 2; return fingerChain(F, [m, m * 0.35, m * 0.12, sp]);
      });
      lHand = handSDF(lChains, lThumb);
    }
    LF = lFrame(bet); VL = restPoint(LF, lHand); WL = BRIDGE.clone().sub(lw(LF, V(0, 0, 0), VL));
    DBG.bet = bet; DBG.WL = WL; DBG.lReach = SJL.distanceTo(WL);
    const EL = ik(SJL, WL, L1, L2, V(0.1, -0.6, -1));
    DBG.EL = EL;

    // ---------------- head placement ----------------
    const hp = 0.62, hyaw = -0.08, hroll = 0.05;
    const hz = V(Math.cos(hp), -Math.sin(hp), 0).applyAxisAngle(V(0, 1, 0), hyaw);
    let hy = V(Math.sin(hp), Math.cos(hp), 0).applyAxisAngle(V(0, 1, 0), hyaw);
    hy.applyAxisAngle(hz, hroll);
    const hx = hy.clone().cross(hz);
    const chinL = V(0, -0.113, 0.07);
    const xc = -1.12, chinW = V(xc, cueAt(TIP0.x - xc).y + 0.165, 0.078);
    const HC = chinW.clone().sub(hx.clone().multiplyScalar(chinL.x).addScaledVector(hy, chinL.y).addScaledVector(hz, chinL.z));
    const MH = new THREE.Matrix4().makeBasis(hx, hy, hz).setPosition(HC);
    const MHi = MH.clone().invert(), me = MHi.elements;
    const toHead = (x, y, z, o) => { o[0] = me[0] * x + me[4] * y + me[8] * z + me[12]; o[1] = me[1] * x + me[5] * y + me[9] * z + me[13]; o[2] = me[2] * x + me[6] * y + me[10] * z + me[14]; return o; };
    // gaze -> lids
    const eyeW = [V(EYE[0], EYE[1], EYE[2]).applyMatrix4(MH), V(-EYE[0], EYE[1], EYE[2]).applyMatrix4(MH)];
    const gazeL = BALL.clone().add(V(-0.02, 0, 0)).sub(eyeW[0].clone().add(eyeW[1]).multiplyScalar(0.5)).normalize().transformDirection(MHi);
    LID = { e0: clamp(Math.atan2(gazeL.y, Math.hypot(gazeL.x, gazeL.z)) * 0.55, -0.1, 0.32) - 0.03, h: 0.31 };
    DBG.HC = HC; DBG.gaze = gazeL; DBG.lid = LID;
    const NTv = V(0, -0.05, -0.035).applyMatrix4(MH), NB0 = toW(0, 1.43, -0.012);
    const NBv = NB0.clone().lerp(NTv, 0.12), NB = A3(NBv), NT = A3(NTv);
    const NMv = toW(0, 1.505, -0.004).lerp(NTv, 0.3), NM = A3(NMv);
    const nU = NTv.clone().sub(NBv).normalize(), nF = hz.clone().addScaledVector(nU, -hz.dot(nU)).normalize();
    const ADAM = A3(NMv.clone().lerp(NTv, 0.35).addScaledVector(nF, 0.046));
    const neckD = (x, y, z) => smin(sdCap(x, y, z, NB, NM, 0.056, 0.053), sdCap(x, y, z, NM, NT, 0.053, 0.05), 0.02);

    // ---------------- canonical shirt / pants / neck fields ----------------
    const NECKC = [0, 1.482, 0.018], NECKR = [0.066, 0.082, 0.08];
    const hemY = (a, b) => 0.888 + 0.032 * sstep(0.05, -0.07, b) + 0.003 * Math.sin(a * 22 + 1.3) + 0.002 * Math.sin(b * 30);
    function shirtC(a, y, b, legD, nkd, noHem) {
      let d = torsoC(a, y, b);
      // ease; the front panel hangs a little away from the stomach (he is bent over)
      const hang = 0.007 * sstep(0.0, 0.08, b) * sstep(1.24, 1.02, y) * sstep(0.80, 0.9, y);
      d -= lerp(0.003, 0.011, sstep(0.0, 0.06, nkd)) + hang;
      // the hem drapes over the seat of the trousers
      // soft compression folds across the stomach, pull folds at the sides
      const fr = sstep(0.02, 0.07, b) * sstep(1.2, 1.05, y) * sstep(0.86, 0.95, y);
      d += fr * (0.003 * Math.sin(y * 95 + 1.5 * Math.sin(a * 16)) + 0.001 * Math.sin(y * 190 + a * 25));
      const sd = sstep(0.11, 0.155, Math.abs(a)) * sstep(1.3, 1.1, y);
      d += sd * 0.002 * Math.sin(y * 60 + Math.abs(a) * 35 + b * 40);
      d += 0.0006 * Math.sin(a * 47 + y * 17) * Math.sin(b * 41 - y * 29);
      // hem roll and neckline
      const hy0 = hemY(a, b);
      d -= 0.0012 * sstep(hy0 + 0.02, hy0 + 0.006, y);
      if (!noHem) d = smax(d, hy0 + 0.012 - y, 0.004);
      d = smax(d, 0.007 - nkd, 0.005);                                   // crew neck hugging the neck
      d -= 0.0016 * sstep(0.011, 0.0, Math.abs(nkd - 0.014));            // collar rib
      return d;
    }
    function pantsC(a, y, b) {
      let d = torsoC(a, y, b) - 0.006;
      d = smax(d, y - 1.0, 0.006);
      d -= 0.0025 * sstep(0.955, 0.965, y) * sstep(1.0, 0.99, y); // waistband
      d += 0.0025 * Math.exp(-a * a / 0.00012) * sstep(-0.03, -0.07, b) * sstep(0.97, 0.9, y); // centre seam over the seat
      return smax(d, 0.79 - y, 0.03);
    }

    // ---------------- legs ----------------
    const AKL = V(-1.50, 0.085, -0.28), AKR = V(-1.99, 0.085, 0.10);
    const KL = ik(HJL, AKL, 0.43, 0.425, V(0.9, 0.0, 0.25)), KR = ik(HJR, AKR, 0.43, 0.425, V(0.75, 0.0, 0.55));
    DBG.KL = KL; DBG.KR = KR; DBG.lLeg = HJL.distanceTo(AKL); DBG.rLeg = HJR.distanceTo(AKR);
    const legs = [[A3(HJL.clone().lerp(KL, 0.2)), A3(KL), A3(AKL)], [A3(HJR.clone().lerp(KR, 0.2)), A3(KR), A3(AKR)]];
    function pantLegD(x, y, z, L) {
      let d = sdCap(x, y, z, L[0], L[1], 0.09, 0.075);
      d = smin(d, sdCap(x, y, z, L[1], [L[2][0], L[2][1] - 0.02, L[2][2]], 0.074, 0.064), 0.03);
      return d;
    }
    function pantsW(x, y, z) {
      let d = 1e9;
      if (y > 0.6) { toC(x, y, z, tmp); d = pantsC(tmp[0], tmp[1], tmp[2]); }
      for (let i = 0; i < 2; i++) {
        const L = legs[i]; let e = pantLegD(x, y, z, L);
        // folds: behind the knee, the break over the shoe and soft vertical drape
        const kd = Math.hypot(x - L[1][0], y - L[1][1], z - L[1][2]);
        e += sstep(0.13, 0.04, kd) * 0.0035 * Math.sin(y * 75 + x * 30 + i);
        e += sstep(0.24, 0.1, y) * 0.004 * Math.sin(y * 95 + 2.0 * Math.sin(x * 40 + z * 50) + i * 2);
        e += 0.0016 * Math.sin(Math.atan2(z - L[1][2], x - L[1][0]) * 5 + y * 9 + i) * sstep(0.75, 0.3, y);
        d = smin(d, e, 0.035);
      }
      return smax(d, 0.052 - y + 0.012 * sstep(0, 1, 1), 0.004);
    }

    // ---------------- shirt (world) ----------------
    const armU = (S, E) => E.clone().sub(S).normalize();
    const uL = armU(SJL, EL), uR = armU(SJR, ER);
    const SLv = A3(SJL), SRv = A3(SJR), SLe = A3(SJL.clone().addScaledVector(uL, 0.17)), SRe = A3(SJR.clone().addScaledVector(uR, 0.17));
    function shirtW(x, y, z, noHem) {
      toC(x, y, z, tmp);
      let d = shirtC(tmp[0], tmp[1], tmp[2], 1, neckD(x, y, z), noHem);
      // sleeves (to ~half the upper arm)
      for (let i = 0; i < 2; i++) {
        const S = i ? SRv : SLv, Se = i ? SRe : SLe, u = i ? uR : uL;
        let e = sdCap(x, y, z, S, Se, 0.064, 0.058);
        const t = (x - S[0]) * u.x + (y - S[1]) * u.y + (z - S[2]) * u.z;
        e += 0.002 * Math.sin(t * 90 + Math.atan2(y - S[1], x - S[0]) * 3) * sstep(0.04, 0.1, t);
        e = smax(e, t - 0.150, 0.004);
        d = smin(d, e, 0.035);
      }
      return d;
    }
    {
      const g = surfaceNets(shirtW, [-1.98, 0.68, -0.48], [-0.98, 1.32, 0.34], 0.0124);
      add(root, g, M.shirt).name = 'shirt';
    }
    // sleeve openings: short open tubes with a turned hem
    function sleeveHem(S, u, seed) {
      const n1 = V(0, 1, 0).addScaledVector(u, -u.y).normalize(), n2 = u.clone().cross(n1), rows = [];
      for (let i = 0; i <= 6; i++) {
        const s = i / 6, row = [];
        for (let j = 0; j < 32; j++) {
          const a = j / 32 * TAU; let dist = lerp(0.115, 0.152, s) + 0.003 * Math.sin(2 * a + seed), r = 0.0592 + 0.0016 * Math.sin(3 * a + seed);
          if (i === 6) { dist += 0.0; r -= 0.0; }
          row.push(A3(S.clone().addScaledVector(u, dist).addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r)));
        }
        rows.push(row);
      }
      // inner turned hem
      const r2 = []; for (let j = 0; j < 32; j++) { const a = j / 32 * TAU, p = rows[6][j]; r2.push([p[0] - u.x * 0.016 - (Math.cos(a) * n1.x + Math.sin(a) * n2.x) * 0.003, p[1] - u.y * 0.016 - (Math.cos(a) * n1.y + Math.sin(a) * n2.y) * 0.003, p[2] - u.z * 0.016 - (Math.cos(a) * n1.z + Math.sin(a) * n2.z) * 0.003]); }
      rows.push(r2);
      return add(root, loft(rows, true, (i, j, p) => [(p[0] + p[2]) * 20, p[1] * 20]), M.shirt2);
    }
    sleeveHem(SJL, uL, 0.4); sleeveHem(SJR, uR, 2.2);
    // tee hem band: lofted from the shirt surface just above the hem down to a turned edge
    {
      const NA = 72, rows = [], shW = (x, y, z) => shirtW(x, y, z, true);
      const surfR = (phi, y) => { // canonical radius of the shirt (without hem cut) at angle phi, height y
        const ca = Math.cos(phi), sb = Math.sin(phi); let r = 0.3;
        for (let it = 0; it < 60; it++) { const dd = shirtC(ca * r, y, sb * r, 1, 10, true); if (Math.abs(dd) < 0.0002) break; r -= dd * 0.9; }
        return r;
      };
      const hemAt = []; for (let j = 0; j < NA; j++) { const phi = j / NA * TAU; let y = 0.85; for (let it = 0; it < 3; it++) { const r = surfR(phi, y); y = hemY(Math.cos(phi) * r, Math.sin(phi) * r); } hemAt.push(y); }
      const fr = [0.018, 0.012, 0.007, 0.003, 0.0, 0.0];
      for (let i = 0; i < fr.length; i++) {
        const row = [];
        for (let j = 0; j < NA; j++) {
          const phi = j / NA * TAU, y = hemAt[j] + fr[i], r = surfR(phi, y) + (i < 5 ? 0.0012 : -0.0025) + 0.0006 * Math.sin(i * 2.0);
          const q = project(shW, A3(toW(Math.cos(phi) * r, y, Math.sin(phi) * r)), 0), gq = gradAt(shW, q[0], q[1], q[2], 0.001);
          const off = i < 5 ? 0.0012 : -0.0035, up = i === 5 ? 0.012 : 0;
          row.push([q[0] + gq[0] * off, q[1] + gq[1] * off, q[2] + gq[2] * off]);
          if (up) { const T = toW(Math.cos(phi) * r, y + 0.01, Math.sin(phi) * r).sub(toW(Math.cos(phi) * r, y, Math.sin(phi) * r)).normalize(); const L = row[row.length - 1]; L[0] += T.x * up; L[1] += T.y * up; L[2] += T.z * up; }
        }
        rows.push(row);
      }
      { let mx = 0, mj = -1; for (let j = 0; j < NA; j++) { const q = rows[0][j], e = Math.abs(shirtW(q[0], q[1], q[2])); if (e > mx) { mx = e; mj = j; } } DBG.hemMis = mx; DBG.hemMisJ = mj; DBG.hemMisP = rows[0][mj].map(v => +v.toFixed(3)).join(','); DBG.hemMisC = A3(V(...rows[0][mj])).join(','); }
      add(root, loft(rows, true, (i, j, p) => [(p[0] + p[2]) * 20, p[1] * 20]), M.shirt2).name = 'hem';
    }

    // ---------------- pants ----------------
    {
      const g = surfaceNets(pantsW, [-2.2, 0.03, -0.46], [-1.36, 1.02, 0.3], 0.0142);
      add(root, g, M.pants).name = 'pants';
    }

    // ---------------- shoes ----------------
    function shoeSDF(x, y, z) { // right shoe, origin on the floor under the heel, +z toes, +x big-toe side
      let d = sdEll(x, y, z, [0.0, 0.05, 0.045], [0.041, 0.048, 0.06]);
      d = smin(d, sdEll(x, y, z, [0.004, 0.046, 0.135], [0.047, 0.044, 0.085]), 0.04);
      d = smin(d, sdEll(x, y, z, [0.008, 0.033, 0.215], [0.05, 0.031, 0.062]), 0.03);
      d = smin(d, sdCap(x, y, z, [0, 0.07, 0.07], [0, 0.11, 0.065], 0.037, 0.035), 0.03);
      d -= 0.0008 * sstep(0.004, 0.0, Math.abs(z - 0.112 - 0.08 * (y - 0.06))); // vamp seam
      return smax(d, 0.022 - y, 0.004);
    }
    function shoe(A, dir, mirror) {
      const g = new THREE.Group(); const yaw = Math.atan2(dir.x, dir.z);
      g.position.set(A.x - dir.x * 0.07, 0, A.z - dir.z * 0.07); g.rotation.y = yaw; root.add(g);
      const s = mirror ? -1 : 1;
      const f = (x, y, z) => shoeSDF(x * s, y, z);
      const geo = surfaceNets(f, [-0.065, 0.0, -0.03], [0.065, 0.14, 0.29], 0.0084);
      vcol(geo, (x, y, z) => { const tn = Math.exp(-Math.pow(x * s - 0.002, 2) / 0.00022) * sstep(0.1, 0.12, z) * sstep(0.18, 0.165, z) * sstep(0.06, 0.08, y); const c = 1 - 0.35 * tn + 0.04 * Math.sin(x * 400 + z * 300); return [c, c, c]; });
      add(g, geo, M.leather);
      // sole: outline from a slice of the upper, extruded with rounded edges
      const pts = [];
      for (let k = 0; k < 48; k++) { const a = k / 48 * TAU, dx = Math.cos(a), dz = Math.sin(a); let r = 0.2; const cz = 0.13; for (let it = 0; it < 80; it++) { const dd = f(dx * r, 0.03, cz + dz * r); if (Math.abs(dd) < 0.0003) break; r -= dd * 0.8; } pts.push(new THREE.Vector2(dx * (r + 0.004), cz + dz * (r + 0.004))); }
      const shp = new THREE.Shape(pts);
      const sg = new THREE.ExtrudeGeometry(shp, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
      sg.rotateX(PI / 2); sg.translate(0, 0.0215, 0); sg.computeVertexNormals();
      add(g, sg, M.sole);
      // laces across the instep
      for (let k = 0; k < 5; k++) {
        const zz = 0.105 + k * 0.016; let yy = 0.12; for (let it = 0; it < 60; it++) { const dd = f(0.002 * s, yy, zz); if (Math.abs(dd) < 0.0002) break; yy -= dd * 0.8; }
        const gr = gradAt(f, 0.002 * s, yy, zz, 0.001), tilt = Math.atan2(gr[2], gr[1]);
        const m = LIB.rbox(g, 0.03, 0.0028, 0.0045, 0.0013, M.lace, 0.002 * s, yy + 0.0012, zz, { rx: tilt, seg: 1 }); triCount += 108;
        m.rotation.y = (k % 2 ? 0.12 : -0.12);
      }
      return g;
    }
    shoe(AKL, V(0.95, 0, 0.30).normalize(), true);
    shoe(AKR, V(0.62, 0, 0.78).normalize(), false);

    // ---------------- head ----------------
    const fmask = (x, y, z) => sstep(0.064, 0.056, Math.abs(x)) * sstep(-0.126, -0.118, y) * sstep(0.05, 0.042, y) * sstep(0.03, 0.038, z);
    const SKC = LIB.col('#ffffff');
    function headCol(x, y, z) {
      const ax = Math.abs(x); let r = 1, g = 1, b = 1;
      const n = 1 + 0.025 * vnoise(x * 120, y * 120, z * 120);
      r *= n; g *= n; b *= n;
      // slightly darker around the eyes, warmer nose/cheeks, darker lips
      if (z > 0.04) {
        const eo = Math.exp(-(Math.pow(ax - 0.032, 2) / 0.00035 + Math.pow(y - 0.002, 2) / 0.00012)); r *= 1 - 0.06 * eo; g *= 1 - 0.07 * eo; b *= 1 - 0.06 * eo;
        const ck = Math.exp(-(Math.pow(ax - 0.044, 2) + Math.pow(y + 0.024, 2)) / 0.0004); r *= 1 + 0.05 * ck; g *= 1 - 0.01 * ck;
        const lp = Math.pow(x / 0.0195, 2) + Math.pow((y + 0.0617) / 0.0105, 2);
        if (lp < 1.6) { const k = sstep(1.6, 0.6, lp); r *= 1 - 0.13 * k; g *= 1 - 0.24 * k; b *= 1 - 0.18 * k; }
        // eyebrows: sparse soft shading under the strands
        const by = 0.0255 + 0.0035 * (1 - Math.pow((ax - 0.036) / 0.022, 2)) - 0.0035 * sstep(0.045, 0.058, ax);
        const bw = lerp(0.0048, 0.0018, sstep(0.015, 0.057, ax));
        const bm = sstep(1.4, 0.3, Math.abs(y - by) / bw) * sstep(0.009, 0.014, ax) * sstep(0.06, 0.05, ax);
        const bk = bm * (0.3 + 0.15 * vnoise(x * 700, y * 1800, z * 300));
        r *= 1 - 0.5 * bk; g *= 1 - 0.52 * bk; b *= 1 - 0.52 * bk;
        // beard shadow: upper lip, chin, jaw (a young man's light stubble)
        const st = (sstep(-0.05, -0.058, y) * sstep(0.03, 0.01, Math.abs(x)) * sstep(-0.044, -0.05, y)) + sstep(-0.075, -0.09, y) * sstep(0.04, 0.03, Math.abs(x) - 0.0);
        const stb = Math.min(1, st) * (0.7 + 0.3 * vnoise(x * 300, y * 300, z * 300));
        r *= 1 - 0.05 * stb; g *= 1 - 0.05 * stb; b *= 1 - 0.035 * stb;
      }
      // jaw underside / neck shadow
      const jw = sstep(-0.06, -0.09, y) * sstep(0.03, 0.06, ax) * 0.06; r *= 1 - jw; g *= 1 - jw; b *= 1 - jw;
      // scalp under the hair: dark, stippled near the hairline
      const he = hairEdge(x, y, z), hcov = sstep(-0.05, 0.06, he);
      const hs = hcov * (0.75 + 0.25 * vnoise(x * 1200, y * 1200, z * 1200));
      r = lerp(r, 0.12, hs); g = lerp(g, 0.1, hs); b = lerp(b, 0.09, hs);
      return [r, g, b];
    }
    {
      const coarse = clipGeo(surfaceNets((x, y, z) => headSDF(x, y, z) + 0.0006 * fmask(x, y, z), [-0.11, -0.135, -0.13], [0.11, 0.12, 0.13], 0.0062), (x, y, z) => sdRBox(x, y + 0.038, z - 0.08, 0.066, 0.09, 0.052, 0.0) > -0.01);
      vcol(coarse, headCol); coarse.applyMatrix4(MH); add(root, coarse, M.skinFar).name = 'head';
      const fine = clipGeo(surfaceNets(headSDF, [-0.07, -0.13, 0.025], [0.07, 0.054, 0.135], 0.0033), (x, y, z) => sdRBox(x, y + 0.038, z - 0.08, 0.066, 0.09, 0.052, 0.0) < 0);
      vcol(fine, headCol); fine.applyMatrix4(MH); const fm = add(root, fine, M.skin); fm.name = 'face'; fm.castShadow = false;
    }
    // eyes
    for (let i = 0; i < 2; i++) {
      const eg = new THREE.SphereGeometry(EYE_R, 24, 14); triCount += tris(eg);
      const m = LIB.mesh(root, eg, M.eye, eyeW[i].x, eyeW[i].y, eyeW[i].z);
      const tgt = BALL.clone().add(V(-0.02, 0, 0)).sub(eyeW[i]).normalize();
      m.quaternion.setFromUnitVectors(V(0, 0, 1), tgt);
    }
    // brows + lashes as strands (head-local, then transformed)
    {
      const strands = [], R = LIB.rnd(5), BRC = [0.03, 0.022, 0.018];
      const f = headSDF;
      for (const sgn of [1, -1]) {
        for (let k = 0; k < 270; k++) {
          const t = Math.pow(R(), 1.15), ax = lerp(0.010, 0.057, t);
          const by = 0.0255 + 0.0035 * (1 - Math.pow((ax - 0.036) / 0.022, 2)) - 0.0035 * sstep(0.045, 0.058, ax);
          const bw = lerp(0.0048, 0.0018, sstep(0.015, 0.057, ax));
          if (R() > 1 - 0.55 * sstep(0.048, 0.058, ax)) continue; // sparse tail
          const p0 = project(f, [sgn * ax, by + (R() - 0.5) * 2 * bw, 0.12], 0.0001);
          const nrm = gradAt(f, p0[0], p0[1], p0[2], 0.0008);
          const up = 1 - sstep(0.012, 0.024, ax);
          let dir = V(sgn * (0.3 + 0.7 * (1 - up)), 0.9 * up + 0.18 - 0.35 * sstep(0.042, 0.056, ax) + (R() - 0.5) * 0.35, 0).normalize();
          const nn = V(nrm[0], nrm[1], nrm[2]); dir.addScaledVector(nn, -dir.dot(nn)).normalize();
          const Ls = lerp(0.0038, 0.0062, R()), pts = [];
          for (let j = 0; j <= 2; j++) { const s = j / 2 * Ls, l = 0.00015 + 0.00035 * j / 2; pts.push([p0[0] + dir.x * s + nn.x * l, p0[1] + dir.y * s + nn.y * l, p0[2] + dir.z * s + nn.z * l]); }
          const c = 0.55 + R() * 0.6;
          strands.push({ pts, w: 0.00034, nrm, c: [0.045 * c, 0.033 * c, 0.026 * c] });
        }
        // upper lashes along the lid margin (short and sparse, as on most men)
        for (let k = 0; k < 26; k++) {
          const az = lerp(-0.8, 0.9, k / 25 + (R() - 0.5) * 0.03), hh = LID.h * Math.max(0, 1 - Math.pow((az + 0.05) / 1.05, 2)) - 0.03;
          const el = LID.e0 + 0.025 * Math.sin(az * 2) + hh + 0.015, rr = EYE_R + 0.0028;
          const q = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
          const p0 = [sgn * (EYE[0] + q.x * rr), EYE[1] + q.y * rr, EYE[2] + q.z * rr];
          const out = V(sgn * q.x, q.y, q.z), upv = V(0, 1, 0); const Ls = 0.0045 + 0.0015 * Math.sin(k / 25 * PI), pts = [];
          for (let j = 0; j <= 2; j++) { const s = j / 2; const d = out.clone().multiplyScalar(s * Ls).addScaledVector(upv, s * s * Ls * 0.5); pts.push([p0[0] + d.x, p0[1] + d.y, p0[2] + d.z]); }
          const nrm = A3(upv.clone().cross(V(sgn, 0, 0)).normalize());
          strands.push({ pts, w: 0.00028, nrm, c: [0.03, 0.022, 0.018] });
        }
      }
      const sg = strandGeo(strands); sg.applyMatrix4(MH); const bm = add(root, sg, M.strand); bm.name = 'brows'; bm.castShadow = false;
    }
    // ---------------- hair: a short tapered base layer + straight locks on top ----------------
    const CROWN = V(-0.012, 0.074, -0.052).normalize();
    const skD = (x, y, z) => smin(sdEll(x, y, z, SKULL[0], SKULL[1]), sdEll(x, y, z, [0, -0.06, -0.075], [0.04, 0.03, 0.022]), 0.03);
    const topW = (az, el) => sstep(0.3, 0.75, el) * sstep(1.7, 1.05, Math.abs(az));
    function shellTh(x, y, z) {
      const c = hairCoords(x, y, z), az = c[0], el = c[1];
      const back = sstep(1.6, 2.4, Math.abs(az));
      let th = lerp(0.004, 0.0095, topW(az, el)) + 0.0025 * sstep(0.2, 0.6, el) * back - 0.0022 * sstep(-0.1, -0.5, el);
      return Math.max(0.0012, th);
    }
    function hairSDF(x, y, z) {
      const sk = skD(x, y, z), he = hairEdge(x, y, z);
      let th = shellTh(x, y, z);
      const c = hairCoords(x, y, z);
      th += 0.0007 * vnoise(c[0] * 7, c[1] * 3, 1.3) + 0.0004 * vnoise(c[0] * 19, c[1] * 6, 4.1); // soft unevenness, no ridges
      const s1 = sstep(-0.01, 0.10, he);
      let d = sk - lerp(-0.0025, th, s1);
      d = smax(d, -sdEll(Math.abs(x), y, z, [0.082, -0.004, -0.016], [0.02, 0.036, 0.026]), 0.004); // clear of the ears
      return smax(d, -he * 0.05 - 0.0006, 0.002);
    }
    const HAIRC = LIB.col('#100c0a'), SCALP = LIB.col('#5a3a28');
    {
      const hg = surfaceNets(hairSDF, [-0.105, -0.11, -0.13], [0.105, 0.125, 0.125], 0.0056);
      const p = hg.attributes.position, uv = hg.attributes.uv, q = V(0, 0, 0);
      const ref = V(1, 0, 0).addScaledVector(CROWN, -CROWN.x).normalize(), ref2 = CROWN.clone().cross(ref);
      for (let i = 0; i < p.count; i++) { q.set(p.getX(i) - HCEN[0], p.getY(i) - HCEN[1], p.getZ(i) - HCEN[2]).normalize(); const dc = Math.acos(clamp(q.dot(CROWN), -1, 1)); const a = Math.atan2(q.dot(ref2), q.dot(ref)); uv.setXY(i, a / TAU * 14, dc * 2.2); }
      vcol(hg, (x, y, z) => { const he = hairEdge(x, y, z), k = sstep(-0.02, 0.07, he); const n = 1 + 0.12 * vnoise(x * 200, y * 200, z * 200); return [lerp(SCALP.r * 0.55, HAIRC.r * n, k), lerp(SCALP.g * 0.55, HAIRC.g * n, k), lerp(SCALP.b * 0.55, HAIRC.b * n, k)]; });
      hg.applyMatrix4(MH); add(root, hg, M.hair).name = 'hair';
    }
    {
      // locks: traced from the crown region forward over the top, swept to his right, the fringe falling forward
      const CP = V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(CROWN, 0.096);
      const gH = V(0, -1, 0).transformDirection(MHi);
      const flow = (p, n) => {
        const d = p.clone().sub(CP); d.addScaledVector(n, -d.dot(n)); if (d.lengthSq() < 1e-8) d.set(0, 0, 1); d.normalize();
        const c = hairCoords(p.x, p.y, p.z), side = n.clone().cross(d);
        return d.addScaledVector(side, -1.0 * topW(c[0], c[1])).normalize();
      };
      const R = LIB.rnd(77), rows = [], NR = 6, NS = 12, all = [];
      let made = 0;
      for (let tries = 0; tries < 1200 && made < 76; tries++) {
        const az0 = (R() * 2 - 1) * 1.5, el0 = lerp(0.6, 1.75, R());
        const dir0 = V(Math.sin(az0) * Math.cos(el0), Math.sin(el0), Math.cos(az0) * Math.cos(el0));
        let p = V(...project(skD, A3(V(HCEN[0], HCEN[1], HCEN[2]).addScaledVector(dir0, 0.11)), 0));
        if (hairEdge(p.x, p.y, p.z) < 0.14) continue;
        const L = lerp(0.045, 0.085, R()), step = L / NS, w0 = lerp(0.007, 0.012, R()), t0 = lerp(0.0022, 0.0034, R()), lift = lerp(0.0006, 0.0028, R());
        const ctr = [], nrm = []; let free = false, dir = null, hFree = 0, freeAt = NS;
        for (let i = 0; i <= NS; i++) {
          const g = gradAt(skD, p.x, p.y, p.z, 0.001), n = V(g[0], g[1], g[2]), u = i / NS;
          let c;
          if (!free) {
            const h = shellTh(p.x, p.y, p.z) * lerp(0.55, 1, sstep(0, 0.25, u)) + lift + t0 * 0.5;
            c = p.clone().addScaledVector(n, h); hFree = h;
            dir = flow(p, n);
            p = V(...project(skD, A3(p.clone().addScaledVector(dir, step)), 0));
            if (hairEdge(p.x, p.y, p.z) < 0.035) { free = true; p = c.clone(); freeAt = i; }
          } else {
            dir = dir.clone().addScaledVector(gH, 0.12).normalize();
            p = p.clone().addScaledVector(dir, (i - freeAt) * step > 0.011 ? step * 0.2 : step); c = p.clone();
            const hd = headSDF(c.x, c.y, c.z); if (hd < 0.004) { const gg = gradAt(headSDF, c.x, c.y, c.z, 0.001); c.addScaledVector(V(gg[0], gg[1], gg[2]), 0.004 - hd); p = c.clone(); }
          }
          ctr.push(c); nrm.push(n);
        }
        const ring = [];
        for (let i = 0; i <= NS; i++) {
          const u = i / NS, c = ctr[i], t = ctr[Math.min(NS, i + 1)].clone().sub(ctr[Math.max(0, i - 1)]).normalize();
          const b = t.clone().cross(nrm[i]).normalize(), n = b.clone().cross(t).normalize();
          const w = w0 * (0.45 + 0.55 * sstep(0, 0.2, u)) * (1 - 0.55 * sstep(0.6, 1, u)), th = t0 * (0.5 + 0.5 * sstep(0, 0.2, u)) * (1 - 0.6 * sstep(0.55, 1, u));
          const row = [];
          for (let j = 0; j < NR; j++) { const a = j / NR * TAU; row.push(A3(c.clone().addScaledVector(b, Math.cos(a) * w * 0.5).addScaledVector(n, Math.sin(a) * th * 0.5 * (Math.sin(a) > 0 ? 1 : 0.6)))); }
          ring.push(row);
        }
        const lg = loft(ring, true, (i, j) => [j / NR * 0.35 + made * 0.13, i / NS * L * 30]);
        const k = 0.85 + 0.3 * R(); vcol(lg, () => [HAIRC.r * k, HAIRC.g * k, HAIRC.b * k]);
        all.push(lg); made++;
      }
      // merge the locks into one mesh
      let nv = 0, ni = 0; all.forEach(g => { nv += g.attributes.position.count; ni += g.index.count; });
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = []; let o = 0;
      all.forEach(g => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); U.set(g.attributes.uv.array, o * 2); for (const v of g.index.array) I.push(v + o); o += g.attributes.position.count; });
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); mg.setAttribute('color', new THREE.BufferAttribute(C, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(U, 2)); mg.setIndex(I);
      mg.applyMatrix4(MH); add(root, mg, M.hair).name = 'locks';
      DBG.locks = made;
    }

    // ---------------- neck (+ skin inside the collar) ----------------
    DBG.neckLen = Math.hypot(NB[0] - NT[0], NB[1] - NT[1], NB[2] - NT[2]);
    {
      const ng = surfaceNets((x, y, z) => {
        let d = neckD(x, y, z);
        d = smin(d, sdEll(x, y, z, ADAM, [0.009, 0.012, 0.009]), 0.012);
        toHead(x, y, z, tmp2);
        const h0 = Math.min(sdEll(tmp2[0], tmp2[1], tmp2[2], SKULL[0], SKULL[1]), sdEll(tmp2[0], tmp2[1], tmp2[2], [0, -0.036, 0.022], [0.061, 0.07, 0.068]));
        d = smin(d, h0 + 0.005, 0.016); d = Math.max(d, -(h0 + 0.003));
        toC(x, y, z, tmp); const c = smax(torsoC(tmp[0], tmp[1], tmp[2]) + 0.004, d - 0.022, 0.008);
        return smin(d, c, 0.02);
      }, [Math.min(NB[0], NT[0]) - 0.11, Math.min(NB[1], NT[1]) - 0.1, Math.min(NB[2], NT[2]) - 0.11], [Math.max(NB[0], NT[0]) + 0.1, Math.max(NB[1], NT[1]) + 0.08, Math.max(NB[2], NT[2]) + 0.11], 0.0072);
      vcol(ng, (x, y, z) => { const n = 1 + 0.025 * vnoise(x * 150, y * 150, z * 150); return [0.97 * n, 0.96 * n, 0.95 * n]; });
      add(root, ng, M.skin).name = 'neck';
    }

    // ---------------- arms (upper arm below the sleeve, forearm, hand) ----------------
    function armSDF(S, E, W, X, Y, Z, hand, mirror) {
      const uu = E.clone().sub(S).normalize(), Lu = S.distanceTo(E);
      const u = W.clone().sub(E), L = u.length(); u.divideScalar(L);
      const Yf = Y.clone().addScaledVector(u, -Y.dot(u)).normalize(), Zf = u.clone().cross(Yf);
      const s = A3(S), e = A3(E), w = A3(W), ua = A3(u), ya = A3(Yf), za = A3(Zf), Xa = A3(X), Ya = A3(Y), Za = A3(Z), sg = mirror ? -1 : 1;
      const bic = A3(S.clone().addScaledVector(uu, Lu * 0.55));
      const olec = A3(E.clone().addScaledVector(uu, 0.012));
      return function (x, y, z) {
        // upper arm
        let d = sdCap(x, y, z, s, e, 0.046, 0.037);
        d = smin(d, sdEll(x, y, z, bic, [0.04, 0.04, 0.04]), 0.03);
        d = smin(d, sdEll(x, y, z, olec, [0.02, 0.02, 0.02]), 0.012);
        // forearm (elliptical, flattening toward the wrist)
        const px = x - e[0], py = y - e[1], pz = z - e[2], tt = px * ua[0] + py * ua[1] + pz * ua[2], t = clamp(tt / L, 0, 1);
        const cx = px - ua[0] * t * L, cy = py - ua[1] * t * L, cz = pz - ua[2] * t * L, a = cx * ya[0] + cy * ya[1] + cz * ya[2], b = cx * za[0] + cy * za[1] + cz * za[2];
        const k = sstep(0.1, 0.92, t), m = Math.exp(-Math.pow((t - 0.22) / 0.2, 2));
        const ry = lerp(0.036, 0.0185, k) + 0.006 * m, rz = lerp(0.04, 0.0285, k) + 0.007 * m;
        let f = (Math.sqrt(a * a / (ry * ry) + b * b / (rz * rz)) - 1) * Math.min(ry, rz);
        f = smax(f, tt - L - 0.004, 0.01); f = smax(f, -tt - 0.01, 0.01);
        d = smin(d, f, 0.022);
        const hx = (x - w[0]) / HSC, hy = (y - w[1]) / HSC, hz = (z - w[2]) / HSC;
        d = smin(d, hand(hx * Xa[0] + hy * Xa[1] + hz * Xa[2], hx * Ya[0] + hy * Ya[1] + hz * Ya[2], sg * (hx * Za[0] + hy * Za[1] + hz * Za[2])) * HSC, 0.012);
        // start inside the sleeve
        const ts = (x - s[0]) * uu.x + (y - s[1]) * uu.y + (z - s[2]) * uu.z;
        return smax(d, 0.075 - ts, 0.006);
      };
    }
    function armBox(S, E, W, X, Y, Z) {
      const b0 = [9, 9, 9], b1 = [-9, -9, -9], uu = E.clone().sub(S).normalize();
      const pts = [S.clone().addScaledVector(uu, 0.06), E, W];
      for (const hx of [-0.03, 0.2]) for (const hy of [-0.08, 0.05]) for (const hz of [-0.07, 0.09]) pts.push(W.clone().addScaledVector(X, hx).addScaledVector(Y, hy).addScaledVector(Z, hz));
      pts.forEach(p => { const v = A3(p); for (let i = 0; i < 3; i++) { b0[i] = Math.min(b0[i], v[i] - 0.06); b1[i] = Math.max(b1[i], v[i] + 0.06); } });
      return [b0, b1];
    }
    function armColours(W, X, Y, Z, chains, mirror) {
      const sg = mirror ? -1 : 1;
      return (x, y, z) => {
        const hx = (x - W.x) / HSC, hy = (y - W.y) / HSC, hz = (z - W.z) / HSC, lx = hx * X.x + hy * X.y + hz * X.z, ly = hx * Y.x + hy * Y.y + hz * Y.z, lz = sg * (hx * Z.x + hy * Z.y + hz * Z.z);
        let c = 1 + 0.025 * vnoise(x * 200, y * 200, z * 200);
        const palm = sstep(-0.006, -0.016, ly) * sstep(-0.01, 0.01, lx);
        let r = c * (1 + 0.16 * palm), g = c * (1 + 0.13 * palm), b = c * (1 + 0.12 * palm);
        // nails on the distal phalanges (back side)
        for (const pts of chains) {
          const a = pts[2], e = pts[3], dx = e[0] - a[0], dy = e[1] - a[1], dz = e[2] - a[2], ll = dx * dx + dy * dy + dz * dz;
          const t = ((lx - a[0]) * dx + (ly - a[1]) * dy + (lz - a[2]) * dz) / ll; if (t < 0.25 || t > 1.15) continue;
          const qx = lx - a[0] - dx * t, qy = ly - a[1] - dy * t, qz = lz - a[2] - dz * t, ql = Math.hypot(qx, qy, qz);
          if (ql > 0.012) continue;
          const l = Math.sqrt(ll), bn = [dy / l, -dx / l, 0]; // back-of-finger direction in the bend plane (approx.)
          const dorsal = (qx * bn[0] + qy * bn[1]) / (ql || 1);
          const lat = Math.abs(qz) / (ql || 1);
          const nk = sstep(0.55, 0.8, dorsal) * sstep(0.75, 0.5, lat) * sstep(0.25, 0.4, t);
          r = lerp(r, 1.32, nk * 0.85); g = lerp(g, 1.12, nk * 0.85); b = lerp(b, 1.05, nk * 0.85);
        }
        // creases between the fingers
        let f1 = 1e9, f2 = 1e9;
        for (let fi = 0; fi < chains.length; fi++) { const pts = chains[fi]; let fd = 1e9; for (let j = 0; j < 3; j++) fd = Math.min(fd, sdCap(lx, ly, lz, pts[j], pts[j + 1], FING[fi].rad[j], FING[fi].rad[j + 1])); if (fd < f1) { f2 = f1; f1 = fd; } else if (fd < f2) f2 = fd; }
        const cr = sstep(0.0035, 0.0005, f2) * sstep(0.004, 0.0, Math.abs(f1 - f2));
        r *= 1 - 0.28 * cr; g *= 1 - 0.3 * cr; b *= 1 - 0.3 * cr;
        return [r, g, b];
      };
    }
    // two resolutions: the arm coarse, the hand + wrist fine (the coarse skin sinks a hair under the fine patch)
    function armMeshes(f, bb, W, X, Y, Z, mirror, chains, name, hcs) {
      const sg = mirror ? -1 : 1, XX = A3(X), YY = A3(Y), ZZ = A3(Z);
      const loc = (x, y, z, o) => { const hx = (x - W.x) / HSC, hy = (y - W.y) / HSC, hz = (z - W.z) / HSC; o[0] = hx * XX[0] + hy * XX[1] + hz * XX[2]; o[1] = hx * YY[0] + hy * YY[1] + hz * YY[2]; o[2] = sg * (hx * ZZ[0] + hy * ZZ[1] + hz * ZZ[2]); return o; };
      const q = [0, 0, 0];
      const box = (x, y, z) => { loc(x, y, z, q); return sdRBox(q[0] - 0.085, q[1] + 0.005, q[2] - 0.008, 0.125, 0.065, 0.075, 0) * HSC; };
      const cg = clipGeo(surfaceNets((x, y, z) => f(x, y, z) + 0.0007 * sstep(0.0, -0.008, box(x, y, z)), bb[0], bb[1], 0.0062), (x, y, z) => box(x, y, z) > -0.012);
      // fine region bounds: corners of the hand box
      const b0 = [9, 9, 9], b1 = [-9, -9, -9];
      for (const lx of [-0.04, 0.21]) for (const ly of [-0.07, 0.06]) for (const lz of [-0.067, 0.083]) { const p = W.clone().addScaledVector(X, lx * HSC).addScaledVector(Y, ly * HSC).addScaledVector(Z, sg * lz * HSC); const v = A3(p); for (let i = 0; i < 3; i++) { b0[i] = Math.min(b0[i], v[i] - 0.004); b1[i] = Math.max(b1[i], v[i] + 0.004); } }
      const fg = clipGeo(surfaceNets(f, b0, b1, hcs), (x, y, z) => box(x, y, z) < 0);
      const colf = armColours(W, X, Y, Z, chains, mirror);
      vcol(cg, colf); vcol(fg, colf);
      const cm = add(root, cg, M.skinFar); cm.name = name + 'Arm';
      const fm = add(root, fg, M.skin); fm.name = name + 'Hand'; fm.castShadow = false;
      return [cm, fm];
    }
    // right arm (animated)
    const rArmF = armSDF(SJR, ER, WR, HXr, HYr, HZr, rHand, false), rb = armBox(SJR, ER, WR, HXr, HYr, HZr);
    const rMeshes = armMeshes(rArmF, rb, WR, HXr, HYr, HZr, false, rChains, 'right', 0.0032);
    rMeshes.forEach(m => { m.frustumCulled = false; });
    // left arm (static bridge)
    const lArmF = armSDF(SJL, EL, WL, LF.X, LF.Y, LF.Z, lHand, true), lb = armBox(SJL, EL, WL, LF.X, LF.Y, LF.Z.clone().negate());
    armMeshes(lArmF, lb, WL, LF.X, LF.Y, LF.Z, true, lChains, 'left', 0.0041);
    { let m = 1e9; for (let t = -0.04; t <= 0.04; t += 0.002) { const p = BRIDGE.clone().addScaledVector(CUE_D, t); m = Math.min(m, lArmF(p.x, p.y, p.z) - cueR(TIP0.x - p.x)); } DBG.cueGap = m; }

    // ---------------- cue ----------------
    const cueG = new THREE.Group(); root.add(cueG);
    {
      const sect = (s0, s1, mat, n, capFront, capBack) => {
        const pr = [];
        if (capFront) pr.push(new THREE.Vector2(0.0001, s0));
        for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); pr.push(new THREE.Vector2(cueR(s), s)); }
        if (capBack) pr.push(new THREE.Vector2(0.0001, s1));
        const g = new THREE.LatheGeometry(pr, 28); return add(cueG, g, mat);
      };
      // tip with a domed face and a little chalk
      { const pr = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * PI / 2; pr.push(new THREE.Vector2(Math.sin(a) * 0.0062, 0.0035 * (1 - Math.cos(a)))); } const g = new THREE.LatheGeometry(pr, 28); add(cueG, g, M.chalk); }
      sect(0.0035, 0.011, M.tip, 2);
      sect(0.011, 0.034, M.ferrule, 2);
      sect(0.034, 0.74, M.shaft, 24);
      sect(0.74, 0.752, M.ring, 1); sect(0.752, 0.766, M.collar, 1);
      sect(0.766, 0.99, M.butt, 8);
      sect(0.99, 0.996, M.ring, 1);
      sect(0.996, 1.29, M.wrap, 6);
      sect(1.29, 1.296, M.ring, 1);
      sect(1.296, 1.452, M.butt, 6);
      sect(1.452, 1.47, M.bumper, 2, false, true);
      cueG.children.forEach(m => { m.geometry.rotateX(0); });
    }
    // cue local frame: +y along the cue from the tip toward the butt
    const setCue = (tipPos, dir) => { cueG.position.copy(tipPos); cueG.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().negate()); };
    setCue(TIP0, CUE_D);
    { let m = 1e9, at = 0; for (let q = 0.3; q <= 1.47; q += 0.01) { const c = cueAt(q); const e = Math.min(pantsW(c.x, c.y, c.z), shirtW(c.x, c.y, c.z)) - cueR(q); if (e < m) { m = e; at = q; } } DBG.cueBodyClear = m; DBG.cueBodyAt = at; }

    // ---------------- cue ball ----------------
    add(root, new THREE.SphereGeometry(BALL_R, 32, 22), M.ball, BALL.x, BALL.y, BALL.z);

    // ---------------- animation: forearm swings from the elbow, wrist stays supple, cue slides through the bridge ----------------
    const uU = ER.clone().sub(SJR).normalize(), uF = WR.clone().sub(ER).normalize();
    const nb = uU.clone().add(uF).normalize();
    const eAxis = CUE_D.clone().cross(uF).normalize();   // swing plane contains the cue
    const SK = rMeshes.map(m => {
      const g = m.geometry, P0 = g.attributes.position.array.slice(), N0 = g.attributes.normal.array.slice(), n = P0.length / 3;
      const wE = new Float32Array(n), wW = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const dx = P0[i * 3] - ER.x, dy = P0[i * 3 + 1] - ER.y, dz = P0[i * 3 + 2] - ER.z;
        wE[i] = sstep(-0.03, 0.035, dx * nb.x + dy * nb.y + dz * nb.z);
        const tw = (P0[i * 3] - WR.x) * uF.x + (P0[i * 3 + 1] - WR.y) * uF.y + (P0[i * 3 + 2] - WR.z) * uF.z;
        wW[i] = sstep(-0.03, 0.01, tw);
      }
      return { g, P0, N0, wE, wW };
    });
    const KW = 0.65; // fraction of the swing the wrist gives back (hand stays more upright)
    const GL = cueAt(gs), BR = BRIDGE.clone(); const gripLen = gs;
    const qE = new THREE.Quaternion(), qW = new THREE.Quaternion(), tv = V(0, 0, 0), tn = V(0, 0, 0);
    function gripAt(al) { // grip point after swinging the forearm by al (and the wrist by -KW*al)
      const w = WR.clone().sub(ER).applyAxisAngle(eAxis, al).add(ER);
      const g = GL.clone().sub(WR).applyAxisAngle(eAxis, al * (1 - KW)).add(w);
      return g;
    }
    function cueFor(al) { const g = gripAt(al), dir = BR.clone().sub(g).normalize(); return { tip: g.clone().addScaledVector(dir, gripLen), dir }; }
    // table: swing angle -> how far the tip moves along the shot line
    const AL_T = []; for (let i = -60; i <= 60; i++) { const al = i * 0.01, c = cueFor(al); AL_T.push([al, (c.tip.x - TIP0.x) / CUE_D.x]); }
    const alFor = (s) => { for (let i = 0; i < AL_T.length - 1; i++) { const a = AL_T[i], b = AL_T[i + 1]; if ((s - a[1]) * (s - b[1]) <= 0) return lerp(a[0], b[0], (s - a[1]) / ((b[1] - a[1]) || 1e-9)); } return s > 0 === AL_T[AL_T.length - 1][1] > 0 ? AL_T[AL_T.length - 1][0] : AL_T[0][0]; };
    let lastAl = 0;
    function pose(al) {
      if (Math.abs(al - lastAl) < 1e-6) return; lastAl = al;
      for (const k of SK) {
        const pa = k.g.attributes.position.array, na = k.g.attributes.normal.array, P0 = k.P0, N0 = k.N0, wE = k.wE, wW = k.wW;
        for (let i = 0; i < wE.length; i++) {
          const we = wE[i]; if (we < 1e-4) continue; const o = i * 3;
          tv.set(P0[o], P0[o + 1], P0[o + 2]); tn.set(N0[o], N0[o + 1], N0[o + 2]);
          const ww = wW[i];
          if (ww > 0) { qW.setFromAxisAngle(eAxis, -KW * al * ww); tv.sub(WR).applyQuaternion(qW).add(WR); tn.applyQuaternion(qW); }
          qE.setFromAxisAngle(eAxis, al * we); tv.sub(ER).applyQuaternion(qE).add(ER); tn.applyQuaternion(qE);
          pa[o] = tv.x; pa[o + 1] = tv.y; pa[o + 2] = tv.z; na[o] = tn.x; na[o + 1] = tn.y; na[o + 2] = tn.z;
        }
        k.g.attributes.position.needsUpdate = true; k.g.attributes.normal.needsUpdate = true;
      }
      const c = cueFor(al); setCue(c.tip, c.dir);
    }
    // stroke programme: 4 practice strokes then a longer pause at address
    const BACK = -0.145, FRONT = 0.02; // the bridge is ~16 cm behind the tip, so a longer draw would pull the tip off the bridge
    const KEYS = []; { const st = (d, v) => KEYS.push([d, v]); for (let i = 0; i < 4; i++) { st(0.62, BACK); st(0.12, BACK); st(0.5, FRONT); st(0.16, FRONT); } st(0.35, 0); st(1.15, 0); }
    const KT = KEYS.reduce((s, k) => s + k[0], 0);
    function programme(t) {
      t = ((t % KT) + KT) % KT; let prev = 0;
      for (const k of KEYS) { if (t <= k[0]) { const u = t / k[0], e = u * u * (3 - 2 * u); return lerp(prev, k[1], e); } t -= k[0]; prev = k[1]; }
      return 0;
    }
    const st = { amp: 0, target: 0, clock: 0, s: 0 };
    root.userData.setStroke = (v) => { st.target = clamp(+v || 0, 0, 1); };
    root.userData.tick = (t, dt) => {
      dt = clamp(dt || 0, 0, 0.05);
      st.amp += (st.target - st.amp) * Math.min(1, dt * 2.5);
      if (st.target === 0 && st.amp < 0.002) st.amp = 0;
      if (st.amp > 0) st.clock += dt; else st.clock = 0;
      const want = st.amp > 0 ? programme(st.clock) * Math.min(1, st.amp * 1.2) : 0;
      st.s += (want - st.s) * Math.min(1, dt * 14);
      if (st.amp === 0 && Math.abs(st.s) < 1e-4) st.s = 0;
      pose(alFor(clamp(st.s, BACK - 0.01, FRONT)));
    };
    root.userData._poseS = (s) => { st.s = s; pose(alFor(s)); };

    root.userData.focus = { x: -1.15, y: 0.95, z: -0.02, r: 0.85 };
    root.userData.name = 'my friend';
    { let n = 0; root.traverse(o => { if (o.isMesh) n += tris(o.geometry); }); root.userData.triangles = n; }
    root.userData._dbg = DBG;
    return root;
  }

  window.FRIEND = { build };
})();
