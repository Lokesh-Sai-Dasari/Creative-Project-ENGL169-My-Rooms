/* Kitchen — "my mom": an Indian woman in a pink kurti standing at the counter, slicing a carrot on a wooden board.
   MOM.build() -> THREE.Group. Origin on the floor between her feet; she faces +z. The counter itself is NOT built here:
   its worktop is at y = 0.92, its front edge at z = +0.33. Only the forearms / hands move:
     userData.setCut(v)   amplitude 0..1 (0 = completely still rest pose)
     userData.tick(t, dt) advance the chopping (~2.2 Hz) when amplitude > 0
     userData.onChop      optional callback, called when the knife meets the board
   The body is built from signed-distance fields polygonised with surface nets (skin, kurti, churidar, hair), lofted
   cloth for the kurti skirt panels and sleeve ends, and a three-strand lofted braid. */
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
  function sdCap(px, py, pz, a, b, ra, rb) { // tapered capsule a->b
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], pax = px - a[0], pay = py - a[1], paz = pz - a[2];
    const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
    return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - (ra + (rb - ra) * t);
  }
  function sdEll(px, py, pz, c, r) { // ellipsoid (approximate distance, exact sign)
    const x = px - c[0], y = py - c[1], z = pz - c[2], rx = r[0], ry = r[1], rz = r[2];
    const k0 = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz));
    const k1 = Math.sqrt(x * x / (rx * rx * rx * rx) + y * y / (ry * ry * ry * ry) + z * z / (rz * rz * rz * rz));
    return k1 < 1e-12 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  }
  function sdRBox(px, py, pz, hx, hy, hz, r) {
    const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }
  // cubic-hermite table: rows [[y, v1, v2, ...]] -> f(y) returning a shared Float64Array of v's
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

  // ------------------------------------------------------------------ meshing helpers (from props_a / kitchen_props)
  // naive surface nets: polygonise the zero set of f (negative inside) on a grid of cell cs; normals from the SDF gradient
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
    const uv = []; for (let v = 0; v < pos.length; v += 3) uv.push((pos[v] + pos[v + 2]) * 20, pos[v + 1] * 20); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
  }
  // loft through rows of points; closed = rows are rings (seam welded)
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
  // per-vertex colours from fn(x,y,z,i) -> [r,g,b] (linear)
  function vcol(geo, fn) {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
  }
  function tris(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }

  // ------------------------------------------------------------------ materials / textures
  let MS = null;
  function mats() {
    if (MS) return MS;
    const hairTex = LIB.canvasTex('mom_hair', 256, 512, (g, w, h) => {
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h); const r = LIB.rnd(11);
      for (let i = 0; i < 2200; i++) { const x = r() * w, v = 120 + Math.floor(r() * 135); g.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.25 + r() * 0.5) + ')'; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); const y0 = r() * h, L = 80 + r() * 300; g.moveTo(x, y0 - L); g.bezierCurveTo(x + (r() - 0.5) * 3, y0 - L / 3, x + (r() - 0.5) * 3, y0 + L / 3, x + (r() - 0.5) * 2, y0 + L); g.stroke(); }
    }, true);
    const hairBump = LIB.canvasTex('mom_hairb', 256, 512, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); const r = LIB.rnd(12);
      for (let i = 0; i < 1600; i++) { const x = r() * w; g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'; g.lineWidth = 0.8 + r(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 4, h); g.stroke(); }
    }, false);
    const weave = LIB.weaveBump();
    const skin = LIB.mat({ c: '#b98158', rough: 0.55, emissive: '#7a3018', emissiveIntensity: 0.05 }); skin.vertexColors = true;
    const hair = LIB.mat({ c: '#ffffff', map: hairTex, rough: 0.4, bump: hairBump, bumpScale: 0.0007 }); hair.vertexColors = true;
    const braid = LIB.mat({ c: '#17110e', map: hairTex, rough: 0.42, bump: hairBump, bumpScale: 0.0007 });
    const kurti = LIB.mat({ c: '#d95890', rough: 0.86, bump: weave, bumpScale: 0.0007 });
    const kurti2 = LIB.mat({ c: '#d95890', rough: 0.86, bump: weave, bumpScale: 0.0007, side: THREE.DoubleSide });
    const chur = LIB.mat({ c: '#e888ad', rough: 0.82, bump: weave, bumpScale: 0.0006 });
    const slipper = LIB.mat({ c: '#2a2421', rough: 0.72 });
    const slipper2 = LIB.mat({ c: '#2a2421', rough: 0.72, side: THREE.DoubleSide });
    const sole = LIB.mat({ c: '#3a302b', rough: 0.85 });
    const steel = LIB.mat({ c: '#cdd1d5', rough: 0.2, metal: 1 });
    const steelB = LIB.mat({ c: '#c4c8cc', rough: 0.14, metal: 1 });
    const handle = LIB.mat({ c: '#1c1816', rough: 0.45 });
    const rivet = LIB.mat({ c: '#d8dadc', rough: 0.25, metal: 1 });
    // edge-grain board: glued strips along x, fine grain, knife marks
    const boardTex = LIB.canvasTex('mom_board', 1024, 720, (g, w, h) => {
      const r = LIB.rnd(31), tones = ['#c39462', '#b4844f', '#cda06c', '#bb8a56', '#a97a48', '#c79a66'];
      let y = 0; while (y < h) { const sh = 34 + r() * 26; g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(0, y, w, sh + 1);
        for (let i = 0; i < 22; i++) { const yy = y + r() * sh, a = 0.05 + r() * 0.12; g.strokeStyle = r() < 0.6 ? 'rgba(90,55,25,' + a + ')' : 'rgba(255,230,190,' + a * 0.8 + ')'; g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); g.moveTo(0, yy); for (let x = 0; x <= w; x += 64) g.lineTo(x, yy + Math.sin(x * 0.01 + i) * 2 + (r() - 0.5) * 1.5); g.stroke(); }
        g.fillStyle = 'rgba(60,35,15,0.35)'; g.fillRect(0, y, w, 1.2); y += sh; }
      // knife marks: mostly front-back (along v), concentrated around the cutting area
      for (let i = 0; i < 260; i++) { const cx = w * (0.32 + (r() - 0.5) * 0.5), cy = h * (0.5 + (r() - 0.5) * 0.6), L = 10 + r() * 50, a = (r() - 0.5) * 0.5 + PI / 2;
        g.strokeStyle = r() < 0.5 ? 'rgba(255,240,215,' + (0.12 + r() * 0.2) + ')' : 'rgba(70,40,20,' + (0.1 + r() * 0.15) + ')'; g.lineWidth = 0.5 + r() * 0.7; g.beginPath(); g.moveTo(cx - Math.cos(a) * L / 2, cy - Math.sin(a) * L / 2); g.lineTo(cx + Math.cos(a) * L / 2, cy + Math.sin(a) * L / 2); g.stroke(); }
      // faint water-darkened patch where the work happens
      const gr = g.createRadialGradient(w * 0.42, h * 0.5, 10, w * 0.42, h * 0.5, w * 0.3); gr.addColorStop(0, 'rgba(110,60,20,0.10)'); gr.addColorStop(1, 'rgba(110,60,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, true);
    const wood = LIB.mat({ c: '#ffffff', map: boardTex, rough: 0.62, bump: boardTex, bumpScale: 0.0004 });
    const carrotTex = LIB.canvasTex('mom_carrot', 64, 512, (g, w, h) => {
      g.fillStyle = '#e8751f'; g.fillRect(0, 0, w, h); const r = LIB.rnd(5);
      for (let i = 0; i < 70; i++) { const y = r() * h; g.strokeStyle = 'rgba(150,60,10,' + (0.15 + r() * 0.3) + ')'; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 6); g.stroke(); }
      for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,190,120,' + r() * 0.15 + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
    }, true);
    const capTex = LIB.canvasTex('mom_carrotcap', 128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, '#f6b25c'); gr.addColorStop(0.42, '#f2a24a'); gr.addColorStop(0.5, '#e98a2e'); gr.addColorStop(0.56, '#f39237'); gr.addColorStop(0.92, '#f07e26'); gr.addColorStop(1, '#d9661a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); const r = LIB.rnd(9);
      for (let i = 0; i < 40; i++) { const a = r() * TAU; g.strokeStyle = 'rgba(255,210,140,0.18)'; g.beginPath(); g.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8); g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke(); }
    }, true);
    const carrot = LIB.mat({ c: '#ffffff', map: carrotTex, rough: 0.5, bump: carrotTex, bumpScale: 0.0005 });
    const carrotCap = LIB.mat({ c: '#ffffff', map: capTex, rough: 0.35 });
    const leafy = LIB.mat({ c: '#3f7a24', rough: 0.45 });
    const tomato = LIB.mat({ c: '#c4301c', rough: 0.28, physical: true, clearcoat: 0.4, clearcoatRough: 0.25 });
    MS = { hair, braid, skin, kurti, kurti2, chur, slipper, slipper2, sole, steel, steelB, handle, rivet, wood, carrot, carrotCap, leafy, tomato };
    return MS;
  }

  // ------------------------------------------------------------------ body pose
  const BEND = 0.15, PIV = 0.86; // forward lean of the upper body (rad) about a pivot at hip height
  const bendA = (y) => BEND * sstep(0.80, 1.03, y);
  function toUp(x, y, z, o) { const a = bendA(y), c = Math.cos(a), s = Math.sin(a), yy = y - PIV; o[0] = x; o[1] = PIV + yy * c + z * s; o[2] = -yy * s + z * c; return o; }
  function fromUp(x, y, z) { const a = bendA(y), c = Math.cos(a), s = Math.sin(a), yy = y - PIV; return V(x, PIV + yy * c - z * s, yy * s + z * c); }
  // torso outer shape (kurti incl. ease) in the upright frame: y, half-width, front depth, back depth, centre x, centre z
  const TT = table([
    [0.64, 0.140, 0.068, 0.080, -0.012, 0.000],
    [0.70, 0.160, 0.082, 0.100, -0.012, 0.000],
    [0.76, 0.175, 0.091, 0.114, -0.012, 0.000],
    [0.82, 0.179, 0.095, 0.116, -0.011, 0.000],
    [0.88, 0.169, 0.093, 0.106, -0.008, 0.000],
    [0.94, 0.150, 0.087, 0.093, -0.005, 0.000],
    [1.00, 0.141, 0.086, 0.086, -0.002, 0.000],
    [1.06, 0.145, 0.090, 0.089, 0.000, 0.000],
    [1.12, 0.156, 0.096, 0.097, 0.000, -0.002],
    [1.18, 0.159, 0.092, 0.099, 0.000, -0.006],
    [1.23, 0.158, 0.082, 0.095, 0.000, -0.010],
    [1.27, 0.146, 0.070, 0.085, 0.000, -0.013],
    [1.30, 0.112, 0.058, 0.070, 0.000, -0.016],
    [1.335, 0.060, 0.045, 0.055, 0.000, -0.018],
  ]);
  function torsoBase(x, y, z) {
    const r = TT(y), W = r[0], F = r[1], B = r[2], dx = x - r[3], dz = z - r[4], D = dz > 0 ? F : B;
    return (Math.sqrt(dx * dx / (W * W) + dz * dz / (D * D)) - 1) * Math.min(W, D);
  }
  function torsoK(x, y, z) { // upright frame
    let d = smax(torsoBase(x, y, z), y - 1.335, 0.03);
    if (y > 0.95 && y < 1.32 && z > -0.06) d = smin(d, Math.min(sdEll(x, y, z, [0.073, 1.128, 0.046], [0.064, 0.058, 0.056]), sdEll(x, y, z, [-0.073, 1.128, 0.046], [0.064, 0.058, 0.056])), 0.05);
    if (y > 1.08) {
      const ax = Math.abs(x);
      d = smin(d, sdCap(ax, y, z, [0.03, 1.322, -0.02], [0.142, 1.274, -0.012], 0.035, 0.036), 0.045);
      d = smin(d, sdEll(ax, y, z, [0.152, 1.236, -0.004], [0.04, 0.056, 0.046]), 0.03);
    }
    return d;
  }
  // legs (world): hip, knee, ankle, calf centre
  function legDef(H, K, A) { return { H: A3(H), K: A3(K), A: A3(A), C: A3(K.clone().lerp(A, 0.3).add(V(0, 0, -0.014))) }; }
  const LR = legDef(V(-0.088, 0.80, -0.005), V(-0.086, 0.455, 0.004), V(-0.082, 0.097, -0.022)); // weight-bearing (her right)
  const LL = legDef(V(0.086, 0.79, 0.0), V(0.099, 0.455, 0.044), V(0.118, 0.097, 0.012));      // relaxed, knee forward
  function legD(x, y, z, L) {
    let d = sdCap(x, y, z, L.H, L.K, 0.081, 0.052);
    d = smin(d, sdCap(x, y, z, L.K, L.A, 0.049, 0.033), 0.02);
    d = smin(d, sdEll(x, y, z, L.C, [0.049, 0.10, 0.048]), 0.03);
    return d;
  }

  // hands: right-hand local frame X = towards the fingers, Y = back of the hand, Z = thumb side (Z = Y x X)
  const FING = [
    { base: [0.089, 0.000, 0.025], len: [0.040, 0.024, 0.019], rad: [0.0080, 0.0072, 0.0065, 0.0058] },
    { base: [0.093, 0.000, 0.007], len: [0.045, 0.028, 0.020], rad: [0.0082, 0.0074, 0.0067, 0.0059] },
    { base: [0.089, -0.001, -0.011], len: [0.042, 0.026, 0.019], rad: [0.0077, 0.0070, 0.0063, 0.0056] },
    { base: [0.080, -0.003, -0.027], len: [0.033, 0.019, 0.017], rad: [0.0069, 0.0062, 0.0056, 0.0050] },
  ];
  const THUMB = { base: [0.014, -0.010, 0.019], len: [0.040, 0.031, 0.025], rad: [0.0118, 0.0097, 0.0088, 0.0079] };
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
    return function (x, y, z) {
      const bx = x - 0.06, by = y + 0.012, bz = z - 0.01, br = Math.sqrt(bx * bx + by * by + bz * bz);
      if (br > 0.15) return br - 0.13;
      let d = sdRBox(x - 0.048, y + 0.001, z - 0.002, 0.035, 0.0072, 0.029, 0.0105);
      d = smin(d, sdEll(x, y, z, [-0.008, 0, 0.0], [0.032, 0.0165, 0.0255]), 0.016);
      d = smin(d, sdEll(x, y, z, [0.03, -0.009, 0.022], [0.03, 0.0135, 0.017]), 0.012);
      d = smin(d, sdEll(x, y, z, [0.04, -0.007, -0.025], [0.034, 0.012, 0.012]), 0.01);
      let fd = 1e9, cur = 1e9, last = -1;
      for (let i = 0; i < caps.length; i++) { const c = caps[i], e = sdCap(x, y, z, c[0], c[1], c[2], c[3]); if (c[4] !== last) { fd = Math.min(fd, cur); cur = e; last = c[4]; } else cur = smin(cur, e, 0.003); }
      fd = Math.min(fd, cur);
      d = smin(d, fd, 0.0075);
      let td = 1e9; for (let i = 0; i < 3; i++) { const c = tc[i]; td = smin(td, sdCap(x, y, z, c[0], c[1], c[2], c[3]), 0.003); }
      d = smin(d, td, 0.013);
      return d;
    };
  }
  // 2-bone IK: elbow from shoulder S and wrist W, bent towards `pole`
  function ik(S, W, L1, L2, pole) {
    const d = W.clone().sub(S); let dl = d.length(); const u = d.clone().divideScalar(dl); dl = Math.min(dl, L1 + L2 - 1e-4);
    const a = (L1 * L1 - L2 * L2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    return S.clone().addScaledVector(u, a).addScaledVector(v, h);
  }

  // ------------------------------------------------------------------ head (local frame: centre of the cranium, +z = face)
  function headSDF(x, y, z) {
    const ax = Math.abs(x);
    let d = sdEll(x, y, z, [0, 0.012, -0.012], [0.071, 0.084, 0.094]);
    d = smin(d, sdEll(x, y, z, [0, -0.04, 0.02], [0.058, 0.07, 0.066]), 0.03);
    d = smin(d, sdCap(ax, y, z, [0.055, -0.03, -0.026], [0.022, -0.09, 0.048], 0.014, 0.012), 0.03);
    d = smin(d, sdEll(x, y, z, [0, -0.095, 0.06], [0.019, 0.016, 0.017]), 0.018);
    if (z > 0.0) {
      d = smin(d, sdEll(ax, y, z, [0.041, -0.024, 0.052], [0.025, 0.024, 0.024]), 0.03);
      d = smin(d, sdCap(x, y, z, [-0.036, 0.02, 0.076], [0.036, 0.02, 0.076], 0.010, 0.010), 0.02);
      d = smax(d, -sdEll(ax, y, z, [0.031, 0.002, 0.092], [0.017, 0.013, 0.014]), 0.008);
      d = smin(d, sdEll(ax, y, z, [0.031, 0.0, 0.072], [0.0135, 0.0115, 0.0125]), 0.004);
      d = smin(d, sdCap(x, y, z, [0, 0.012, 0.083], [0, -0.03, 0.106], 0.0075, 0.0105), 0.01);
      d = smin(d, sdEll(ax, y, z, [0.0125, -0.033, 0.094], [0.009, 0.0075, 0.009]), 0.006);
      d = smin(d, sdEll(x, y, z, [0, -0.0545, 0.084], [0.02, 0.006, 0.010]), 0.008);
      d = smin(d, sdEll(x, y, z, [0, -0.066, 0.082], [0.018, 0.0065, 0.0105]), 0.008);
      d = smax(d, -sdEll(x, y, z, [0, -0.0605, 0.094], [0.019, 0.0016, 0.012]), 0.002);
    }
    if (ax > 0.05) { // ears, tilted back
      const ex = ax - 0.077, ey = y + 0.006, ez = z + 0.014, c = Math.cos(0.25), s = Math.sin(0.25), ry = ey * c - ez * s, rz = ey * s + ez * c;
      let e = sdEll(ex, ry, rz, [0, 0, 0], [0.0105, 0.028, 0.0175]);
      e = smax(e, -sdEll(ex, ry, rz, [0.007, 0.002, 0.003], [0.006, 0.017, 0.010]), 0.004);
      d = smin(d, e, 0.006);
    }
    return d;
  }
  const SKULL = [[0, 0.012, -0.012], [0.071, 0.084, 0.094]];
  function hairMask(x, y, z) { // < 0 where hair grows
    const face = sdEll(x, y, z, [0, -0.052, 0.075], [0.064, 0.112, 0.080]);
    const gz = z > -0.022 ? 0.012 : Math.max(-0.074, 0.012 + 3.4 * (z + 0.022));
    return Math.max(-face, (gz - y) * 0.7);
  }
  function hairSDF(x, y, z, nb, nt) {
    const sk = smin(smin(sdEll(x, y, z, SKULL[0], SKULL[1]), sdEll(x, y, z, [0, -0.04, 0.02], [0.058, 0.07, 0.066]), 0.03), sdCap(x, y, z, nb, nt, 0.054, 0.049), 0.025);
    const A = hairMask(x, y, z), s1 = sstep(0.0, -0.01, A), s2 = sstep(-0.003, -0.034, A);
    const th = 0.0075 + 0.004 * sstep(0.0, 0.08, y) + 0.003 * sstep(0.0, -0.08, z);
    let d = sk - (lerp(-0.0022, 0.0016, s1) + th * s2);
    d = smin(d, sdEll(x, y, z, [0, -0.057, -0.084], [0.028, 0.025, 0.021]), 0.022);
    const pg = sstep(-0.03, 0.03, z) * sstep(0.03, 0.07, y);
    if (pg > 0) d += 0.0032 * pg * Math.max(0, 1 - Math.abs(x) / 0.0065);
    return Math.max(d, A - 0.012);
  }
  function footSDF(x, y, z) { // right foot, origin under the heel, +z = toes, +x = big-toe side
    let d = sdEll(x, y, z, [0, 0.033, 0.038], [0.030, 0.034, 0.042]);
    d = smin(d, sdCap(x, y, z, [0, 0.055, 0.05], [0, 0.135, 0.045], 0.031, 0.029), 0.02);
    d = smin(d, sdEll(x, y, z, [0.004, 0.03, 0.105], [0.037, 0.031, 0.07]), 0.03);
    d = smin(d, sdEll(x, y, z, [0.004, 0.02, 0.163], [0.043, 0.021, 0.032]), 0.02);
    d = smin(d, Math.min(sdEll(x, y, z, [0.026, 0.075, 0.047], [0.011, 0.012, 0.011]), sdEll(x, y, z, [-0.026, 0.068, 0.04], [0.011, 0.012, 0.011])), 0.01);
    const T = [[0.022, 0.0115, 0.192, 0.212, 0.0102], [0.004, 0.0088, 0.19, 0.212, 0.0074], [-0.01, 0.0085, 0.185, 0.205, 0.007], [-0.022, 0.0082, 0.178, 0.195, 0.0066], [-0.032, 0.008, 0.168, 0.182, 0.0062]];
    let t = 1e9; for (const q of T) t = Math.min(t, sdCap(x, y, z, [q[0], q[1], q[2]], [q[0] * 1.03, q[1] - 0.001, q[3]], q[4], q[4] * 0.92));
    d = smin(d, t, 0.008);
    return smax(d, -y, 0.003);
  }

  // ------------------------------------------------------------------ build
  function build() {
    const M = mats();
    const root = new THREE.Group(); root.name = 'mom';
    const R = LIB.rnd(17);
    const tmp = [0, 0, 0];
    let triCount = 0; const add = (parent, geo, mat, x, y, z, o) => { triCount += tris(geo); return LIB.mesh(parent, geo, mat, x || 0, y || 0, z || 0, o); };

    // ---------------- counter-top setting (local numbers) ----------------
    const CY = 0.942;            // top of the board
    const BZ = 0.56;             // board centre z
    const X0 = -0.03;            // carrot cut plane (the knife's left face)
    const SLT = 0.0045, NS = 10; // slice thickness, slices per cycle
    const CAR_R = (s) => 0.0148 * (1 - 0.78 * Math.pow(clamp(s, 0, 1), 1.6)); // carrot radius along its length (s 0..1)
    const CAR_L = 0.17, CAR_Z = BZ, CAR_Y = CY + CAR_R(0);

    // ---------------- knife pose and right arm ----------------
    const kx = V(1, 0, 0), ky = V(0, 1, 0), kz = V(0, 0, 1);
    const KO = V(X0 - 0.0013, CY + 0.0004, 0.462);             // heel of the edge
    const G = KO.clone().addScaledVector(ky, 0.034).addScaledVector(kz, -0.044); // grip point (middle finger)
    const AL = 0.82;                                          // handle angle across the palm
    const HX = kz.clone().multiplyScalar(Math.cos(AL)).addScaledVector(ky, -Math.sin(AL));
    const HY = kx.clone().negate();
    const HZ = kz.clone().multiplyScalar(Math.sin(AL)).addScaledVector(ky, Math.cos(AL));
    const HL = [0.094, -0.029, 0.008];                        // grip point in hand-local coordinates
    const WR = G.clone().addScaledVector(HX, -HL[0]).addScaledVector(HY, -HL[1]).addScaledVector(HZ, -HL[2]);
    // fingers wrap the handle: solve each joint so the next phalanx touches the handle
    const cotA = Math.cos(AL) / Math.sin(AL), RH = 0.0112;
    const rChains = FING.map((F, i) => {
      const C = [HL[0] + (F.base[2] - HL[2]) * cotA, HL[1]]; const ang = []; let px = F.base[0], py = F.base[1], a = 0;
      for (let j = 0; j < 3; j++) { const L = F.len[j], Rr = RH + F.rad[j + 1] + 0.0006; let best = a + 1.0, bestE = 1e9;
        for (let b = a; b < a + 2.4; b += 0.005) { const nx = px + L * Math.cos(b), ny = py - L * Math.sin(b), e = Math.hypot(nx - C[0], ny - C[1]) - Rr; if (e <= 0) { best = b; break; } if (Math.abs(e) < bestE) { bestE = Math.abs(e); best = b; } }
        ang.push(best - a); px += L * Math.cos(best); py -= L * Math.sin(best); a = best; }
      ang.push([0.05, 0, -0.04, -0.09][i]);
      return fingerChain(F, ang);
    });
    const tT = 0.026, rThumbT = [HL[0] + tT * Math.cos(AL), HL[1] - RH - 0.0085, HL[2] + tT * Math.sin(AL)];
    const rThumb = thumbChain(rThumbT, [0.0, 0.01, -0.012]);
    const rHand = handSDF(rChains, rThumb);

    // shoulders (joint centres) and elbows by IK
    const SR = fromUp(-0.147, 1.232, -0.006), SL = fromUp(0.147, 1.232, -0.006);
    const L1 = 0.27, L2 = 0.245;
    const ER = ik(SR, WR, L1, L2, V(-0.55, -0.6, -0.55));

    // ---------------- left hand (claw on the carrot) ----------------
    const lAng = [[0.72, 1.42, 0.55, 0.07], [0.66, 1.5, 0.55, 0.0], [0.7, 1.45, 0.5, -0.06], [0.8, 1.38, 0.45, -0.13]];
    const lChains = FING.map((F, i) => fingerChain(F, lAng[i]));
    const lThumb = thumbChain([0.066, -0.038, 0.036], [0.0, 0.0, 0.01]);
    const lHand = handSDF(lChains, lThumb);
    const XL = V(-0.40, -0.16, 0.90).normalize();
    const YL = V(0.12, 1, 0); YL.addScaledVector(XL, -YL.dot(XL)).normalize();
    const ZL = YL.clone().cross(XL); // right-hand convention; the left hand evaluates with z mirrored
    const tipL = lChains[1][3];
    const tipDir = V(0, 0.82, -0.57).normalize();
    const TM = V(X0 + 0.041, CAR_Y, CAR_Z).addScaledVector(tipDir, CAR_R(0.24) + 0.0068);
    const WL = TM.clone().addScaledVector(XL, -tipL[0]).addScaledVector(YL, -tipL[1]).addScaledVector(ZL, tipL[2]);
    const EL = ik(SL, WL, L1, L2, V(0.55, -0.6, -0.55));

    // ---------------- kurti (upper body + upper sleeves) ----------------
    const SRa = A3(SR), SLa = A3(SL), ERa = A3(ER), ELa = A3(EL);
    function kurtiD(x, y, z) {
      toUp(x, y, z, tmp);
      const qx = tmp[0], qy = tmp[1], qz = tmp[2];
      let d = torsoK(qx, qy, qz);
      d = smin(d, sdCap(x, y, z, SRa, ERa, 0.046, 0.045), 0.014);
      d = smin(d, sdCap(x, y, z, SLa, ELa, 0.046, 0.045), 0.014);
      d = smax(d, -sdEll(qx, qy, qz, [0, 1.372, 0.026], [0.077, 0.118, 0.092]), 0.012);
      d += 0.0014 * Math.sin(x * 57 + y * 11) * Math.sin(z * 43 - y * 23) + (0.0024 * Math.sin(x * 48 + 2.5 * Math.sin(y * 9)) + 0.0012 * Math.sin(x * 97 + 1.3)) * sstep(1.2, 0.98, qy) * sstep(0.0, -0.06, qz)
        + 0.0018 * Math.sin(qy * 140 + x * 8) * sstep(0.12, 0.0, Math.abs(qy - 1.0)) * sstep(-0.02, -0.07, qz); // fabric gathering at the small of the back
      return smax(d, 0.835 - y, 0.004);
    }
    const kGeo = surfaceNets(kurtiD, [-0.27, 0.82, -0.17], [0.27, 1.36, 0.27], 0.0098);
    add(root, kGeo, M.kurti).name = 'kurti';

    // ---------------- kurti skirt panels (lofted, draped over hips and legs) ----------------
    function envD(x, y, z) {
      toUp(x, y, z, tmp); let d = smax(torsoBase(tmp[0], tmp[1], tmp[2]), 0.68 - y, 0.04);
      d = smin(d, legD(x, y, z, LR), 0.04); return smin(d, legD(x, y, z, LL), 0.04);
    }
    const SCX = -0.008, SCZ = 0.006, YT = 0.93, YSLIT = 0.775;
    function rayR(phi, y) {
      const dx = Math.cos(phi), dz = Math.sin(phi); let r = 0.36;
      for (let i = 0; i < 80; i++) { const d = envD(SCX + dx * r, y, SCZ + dz * r); if (d < 0.0004) break; r -= Math.max(d * 0.85, 0.0008); if (r <= 0) return 0; }
      return r;
    }
    const NC = 50, YS = []; for (let y = YT; y >= 0.34; y -= 0.01) YS.push(y);
    const env = []; // env[col][k] running max radius
    for (let c = 0; c <= NC * 2; c++) { const phi = c / (NC * 2) * TAU; let m = 0; const col = []; for (const y of YS) { const ease = lerp(-0.0025, 0.0025, sstep(0.915, 0.84, y)); const r = rayR(phi, y) + ease; m = Math.max(m, r); col.push(m); } env.push(col); }
    const envAt = (c, y) => { const col = env[c], f = clamp((YT - y) / 0.01, 0, YS.length - 1.001), i = Math.floor(f), t = f - i; return lerp(col[i], col[i + 1], t); };
    const hemY = (phi) => 0.405 + 0.009 * Math.sin(2 * phi + 0.5) + 0.005 * Math.sin(5 * phi + 1.7) + 0.003 * Math.sin(11 * phi) - 0.007 * sstep(0, -1, Math.sin(phi));
    const drapes = []; for (let i = 0; i < 14; i++) drapes.push([R() * TAU, 0.05 + R() * 0.08, (R() < 0.6 ? 1 : -0.7) * (0.004 + R() * 0.006)]);
    function fold(phi, y) {
      const A = sstep(0.875, 0.78, y) * (0.0015 + 0.0105 * Math.pow(clamp((0.80 - y) / 0.4, 0, 1), 1.2));
      let f = 0.5 * Math.sin(5 * phi + 1.3 + 3 * y) + 0.35 * Math.sin(9 * phi + 0.4 - 6 * y) + 0.25 * Math.sin(14 * phi + 2.1 - 4 * y);
      let dr = 0; const g = clamp((0.82 - y) / 0.42, 0, 1);
      for (const q of drapes) { let dp = Math.abs(((phi - q[0]) % TAU + TAU + PI) % TAU - PI); dr += q[2] * g * Math.exp(-(dp * dp) / (q[1] * q[1] * (0.4 + g))); }
      return A * f + dr;
    }
    function panel(front) {
      const rows = [], NR = 40;
      for (let i = 0; i <= NR + 2; i++) {
        const row = [], s = Math.min(i, NR) / NR;
        for (let j = 0; j <= NC; j++) {
          const u = j / NC;
          // nominal angle range then the slit gap
          const yN = lerp(YT, 0.40, s);
          const gap = yN < YSLIT ? 0.19 * Math.pow((YSLIT - yN) / (YSLIT - 0.40), 0.8) : 0;
          const a0 = front ? gap : PI + gap, a1 = front ? PI - gap : TAU - gap, phi = lerp(a0, a1, u);
          const y = lerp(YT, hemY(phi), s);
          const c = clamp(Math.round(phi / TAU * NC * 2), 0, NC * 2);
          const flare = 0.011 * Math.pow(clamp((0.79 - y) / 0.39, 0, 1), 1.25);
          let r = envAt(c, y) + flare + fold(phi, y);
          let yy = y;
          if (i === NR + 1) { r -= 0.0035; yy = y + 0.002; } else if (i === NR + 2) { r -= 0.004; yy = y + 0.016; }
          row.push([SCX + Math.cos(phi) * r, yy, SCZ + Math.sin(phi) * r]);
        }
        rows.push(row);
      }
      return loft(rows, false, (i, j, p) => [(p[0] + p[2]) * 20, p[1] * 20]);
    }
    add(root, panel(true), M.kurti2); add(root, panel(false), M.kurti2);

    // ---------------- churidar (legs) ----------------
    function churD(x, y, z) {
      let d = 1e9;
      if (y > 0.55) { toUp(x, y, z, tmp); d = torsoBase(tmp[0], tmp[1], tmp[2]) + 0.006; d = smax(d, 0.68 - y, 0.04); d = smax(d, y - 0.90, 0.01); }
      d = smin(d, legD(x, y, z, LR), 0.04); d = smin(d, legD(x, y, z, LL), 0.04);
      const g = sstep(0.25, 0.12, y);
      if (g > 0) d += g * (0.0017 * Math.sin(y * 410 + 2.2 * Math.sin(x * 37 + z * 53) + 0.9 * Math.sin(y * 90 + x * 20)) * (0.7 + 0.3 * Math.sin(y * 150 + z * 60)) - 0.0045);
      return smax(d, 0.074 - y, 0.004);
    }
    add(root, surfaceNets(churD, [-0.24, 0.06, -0.15], [0.24, 0.47, 0.16], 0.0067), M.chur);
    add(root, surfaceNets((x, y, z) => smax(churD(x, y, z), 0.445 - y, 0.002), [-0.24, 0.43, -0.15], [0.24, 0.91, 0.16], 0.019), M.chur);

    // ---------------- feet + slippers ----------------
    const footOutline = [[0, -0.012], [0.03, -0.002], [0.04, 0.05], [0.047, 0.12], [0.052, 0.17], [0.045, 0.212], [0.025, 0.232], [0.0, 0.236], [-0.022, 0.228], [-0.04, 0.205], [-0.046, 0.16], [-0.04, 0.1], [-0.036, 0.04], [-0.028, 0.0]];
    function foot(L, mirror, yaw) {
      const g = new THREE.Group(); g.position.set(L.A[0], 0, L.A[2] - 0.045 * Math.cos(yaw)); g.rotation.y = yaw; root.add(g);
      g.position.x -= 0.045 * Math.sin(yaw);
      const s = mirror ? -1 : 1;
      const fgeo = surfaceNets((x, y, z) => footSDF(x * s, y - 0.012, z), [-0.06, 0.0, -0.02], [0.06, 0.15, 0.25], 0.007);
      vcol(fgeo, (x, y, z) => { const n = 0.97 + 0.04 * Math.sin(x * 300 + z * 200); return [n, n * 0.98, n * 0.97]; });
      add(g, fgeo, M.skin);
      // sole
      const pts = footOutline.map(p => [p[0] * s * 1.04, p[1] * 1.0]);
      const c = new THREE.CatmullRomCurve3(pts.map(p => V(p[0], p[1], 0)), true, 'centripetal'); const sp = c.getSpacedPoints(64); sp.pop();
      const shp = new THREE.Shape(sp.map(v => new THREE.Vector2(v.x, v.y)));
      const sg = new THREE.ExtrudeGeometry(shp, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0025, bevelSegments: 2, curveSegments: 8 });
      sg.rotateX(PI / 2); sg.translate(0, 0.010, 0); sg.computeVertexNormals();
      add(g, sg, M.sole);
      // wide band over the forefoot
      const rows = [];
      for (let i = 0; i <= 4; i++) {
        const zz = 0.112 + i * 0.012, row = [];
        for (let j = 0; j <= 24; j++) {
          const a = PI * j / 24, dx = Math.cos(a), dy = Math.sin(a); let r = 0.09;
          for (let k = 0; k < 80; k++) { const d = footSDF(0.003 + dx * r, 0.004 + dy * r, zz); if (d < 0.0003) break; r = Math.max(0.01, r - Math.max(d * 0.85, 0.0006)); }
          r += 0.0032; row.push([(0.003 + dx * r) * s, Math.max(0.0135, 0.016 + dy * r), zz]);
        }
        rows.push(row);
      }
      add(g, loft(rows, false), M.slipper2);
      return g;
    }
    foot(LR, false, -0.10); foot(LL, true, 0.24);

    // ---------------- head, neck, hair ----------------
    const PA = V(0, 1.398, -0.026), PITCH = 0.36;
    const MH = new THREE.Matrix4()
      .multiply(new THREE.Matrix4().makeTranslation(0, PIV, 0)).multiply(new THREE.Matrix4().makeRotationX(BEND)).multiply(new THREE.Matrix4().makeTranslation(0, -PIV, 0))
      .multiply(new THREE.Matrix4().makeTranslation(PA.x, PA.y, PA.z)).multiply(new THREE.Matrix4().makeRotationX(PITCH)).multiply(new THREE.Matrix4().makeTranslation(0, 0.066, 0.026))
      .multiply(new THREE.Matrix4().makeRotationY(0.06)); // a slight turn towards her right hand
    const MHi = MH.clone().invert(), me = MHi.elements;
    const toHead = (x, y, z, o) => { o[0] = me[0] * x + me[4] * y + me[8] * z + me[12]; o[1] = me[1] * x + me[5] * y + me[9] * z + me[13]; o[2] = me[2] * x + me[6] * y + me[10] * z + me[14]; return o; };
    const SKIN = LIB.col('#ffffff');
    const hGeo = surfaceNets(headSDF, [-0.105, -0.13, -0.12], [0.105, 0.112, 0.128], 0.006);
    vcol(hGeo, (x, y, z) => {
      const ax = Math.abs(x); let r = 1, g = 1, b = 1;
      const n = 1 + 0.025 * Math.sin(x * 210 + y * 170) * Math.sin(z * 190);
      r *= n; g *= n; b *= n;
      // eyebrows
      const by = 0.0135 + 0.0045 * (1 - Math.pow((ax - 0.031) / 0.021, 2));
      if (z > 0.06 && ax > 0.011 && ax < 0.052 && Math.abs(y - by) < 0.0026 * (1 - Math.abs(ax - 0.028) / 0.03)) { r = 0.06; g = 0.045; b = 0.04; }
      // lash line on the lowered lids
      if (z > 0.074 && ax > 0.019 && ax < 0.044 && Math.abs(y + 0.0035 + 0.003 * Math.pow((ax - 0.031) / 0.013, 2)) < 0.0012) { r = 0.1; g = 0.07; b = 0.06; }
      // lips
      const lp = Math.pow(x / 0.02, 2) + Math.pow((y + 0.06) / 0.011, 2);
      if (z > 0.08 && lp < 1) { const k = Math.sqrt(1 - lp); r *= 1 - 0.12 * k; g *= 1 - 0.24 * k; b *= 1 - 0.2 * k; }
      // warmer cheeks / nose
      if (z > 0.06) { const ck = Math.exp(-(Math.pow(ax - 0.042, 2) + Math.pow(y + 0.022, 2)) / 0.0004); r *= 1 + 0.04 * ck; g *= 1 - 0.03 * ck; b *= 1 - 0.04 * ck; }
      return [r, g, b];
    });
    hGeo.applyMatrix4(MH); add(root, hGeo, M.skin).name = 'head';
    // neck + skin of the upper chest inside the neckline (world grid); blends into a shrunk head
    const NB = A3(fromUp(0, 1.22, -0.018)), NT = A3(V(0, -0.046, -0.03).applyMatrix4(MH));
    const nGeo = surfaceNets((x, y, z) => {
      let d = sdCap(x, y, z, NB, NT, 0.054, 0.049);
      toHead(x, y, z, tmp);
      const h0 = Math.min(sdEll(tmp[0], tmp[1], tmp[2], SKULL[0], SKULL[1]), sdEll(tmp[0], tmp[1], tmp[2], [0, -0.04, 0.02], [0.058, 0.07, 0.066]));
      d = smin(d, h0 + 0.004, 0.025); d = Math.max(d, -(h0 + 0.002));
      toUp(x, y, z, tmp); let c = torsoK(tmp[0], tmp[1], tmp[2]) + 0.0065; c = smax(c, 1.20 - tmp[1], 0.01);
      c = smax(c, sdEll(tmp[0], tmp[1], tmp[2], [0, 1.372, 0.026], [0.088, 0.128, 0.102]), 0.01);
      d = smin(d, c, 0.012);
      return d;
    }, [-0.13, 1.17, -0.1], [0.13, 1.5, 0.2], 0.0065);
    vcol(nGeo, () => [0.97, 0.96, 0.95]);
    add(root, nGeo, M.skin).name = 'neck';
    // hair (head-local grid), strands follow meridians from the front of the parting to the nape
    const P1 = V(0, 0.08, 0.066), P2 = V(0, -0.058, -0.086), HC = P1.clone().add(P2).multiplyScalar(0.5), HA = P1.clone().sub(P2).normalize();
    const HE1 = V(0, 1, 0).addScaledVector(HA, -HA.y).normalize(), HE2 = HA.clone().cross(HE1);
    const NBl = A3(V(NB[0], NB[1], NB[2]).applyMatrix4(MHi)), NTl = [0, -0.046, -0.03];
    const hrGeo = surfaceNets((x, y, z) => hairSDF(x, y, z, NBl, NTl), [-0.105, -0.11, -0.13], [0.105, 0.115, 0.12], 0.006);
    { const p = hrGeo.attributes.position, uv = hrGeo.attributes.uv, q = V(0, 0, 0);
      for (let i = 0; i < p.count; i++) { q.set(p.getX(i), p.getY(i), p.getZ(i)).sub(HC); const a = Math.atan2(q.dot(HE2), q.dot(HE1)), v = Math.acos(clamp(q.clone().normalize().dot(HA), -1, 1)) / PI; uv.setXY(i, a / TAU * 9, v * 1.6); } }
    const HAIRC = LIB.col('#15100d'), SCALP = LIB.col('#8a5a3c');
    vcol(hrGeo, (x, y, z) => { const pg = sstep(-0.02, 0.03, z) * sstep(0.035, 0.07, y) * Math.max(0, 1 - Math.abs(x) / 0.0028); const n = 1 + 0.15 * Math.sin(x * 400 + z * 90); return [lerp(HAIRC.r * n, SCALP.r, pg), lerp(HAIRC.g * n, SCALP.g, pg), lerp(HAIRC.b * n, SCALP.b, pg)]; });
    hrGeo.applyMatrix4(MH); add(root, hrGeo, M.hair).name = 'hair';

    // ---------------- braid down her back ----------------
    {
      const start = V(0.0, -0.062, -0.09).applyMatrix4(MH);
      const surf = (x, y, z) => { let d = kurtiD(x, y, z); d = Math.min(d, sdCap(x, y, z, NB, NT, 0.054, 0.049)); return d; };
      const ctr = [start.clone()];
      const BR = 0.0155;
      for (let y = start.y - 0.03; y > 0.955; y -= 0.02) {
        const x = 0.004 + (start.y - y) * 0.02;
        let z = -0.35; for (let k = 0; k < 200; k++) { const d = surf(x, y, z + BR); if (d < 0.0005) break; z += Math.max(d * 0.8, 0.0008); }
        z = Math.min(z, start.z - 0.004);
        ctr.push(V(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(ctr, false, 'centripetal');
      const N = 124, Lc = curve.getLength(), om = TAU / 0.052;
      const P = curve.getSpacedPoints(N), Tn = P.map((p, i) => curve.getTangentAt(i / N));
      const side = V(1, 0, 0);
      for (let k = 0; k < 3; k++) {
        const path = [];
        for (let i = 0; i <= N; i++) {
          const s = i / N * Lc, T = Tn[i], B = side.clone().addScaledVector(T, -side.dot(T)).normalize(), Nn = B.clone().cross(T);
          const sc = lerp(1.15, 0.72, Math.pow(i / N, 1.2)) * sstep(0, 0.06, s / 1 + 0.02);
          const ph = om * s + k * TAU / 3;
          path.push(P[i].clone().addScaledVector(B, 0.0105 * sc * Math.sin(ph)).addScaledVector(Nn, 0.005 * sc * Math.sin(2 * ph)));
        }
        const rows = [];
        for (let i = 0; i <= N; i++) {
          const p = path[i], T = path[Math.min(N, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
          const B = side.clone().addScaledVector(T, -side.dot(T)).normalize(), Nn = B.clone().cross(T);
          const sc = lerp(1.15, 0.72, Math.pow(i / N, 1.2));
          const ph = om * (i / N * Lc) + k * TAU / 3, bulge = 0.85 + 0.25 * Math.max(0, Math.sin(2 * ph));
          const ra = 0.0106 * sc * bulge, rb = 0.0074 * sc * bulge, row = [];
          for (let j = 0; j < 10; j++) { const a = j / 10 * TAU; row.push(A3(p.clone().addScaledVector(B, Math.cos(a) * ra).addScaledVector(Nn, Math.sin(a) * rb))); }
          rows.push(row);
        }
        add(root, loft(rows, true, (i, j) => [j / 10, i / N * 14]), M.braid);
      }
      // loose tuft below the last twist
      const e = P[N], T = Tn[N], rows = [];
      for (let i = 0; i <= 12; i++) { const s = i / 12, c = e.clone().addScaledVector(T, s * 0.065).add(V(0.003 * Math.sin(s * 3), 0, -0.004 * s)); const r = 0.0105 * (1 - s * 0.85) * (1 + 0.15 * Math.sin(s * 9)), row = []; for (let j = 0; j < 12; j++) { const a = j / 12 * TAU; row.push([c.x + Math.cos(a) * r * (1 + 0.12 * Math.sin(a * 5 + s * 8)), c.y, c.z + Math.sin(a) * r * 0.75]); } rows.push(row); }
      add(root, loft(rows, true, (i, j) => [j / 12, i / 12 * 2]), M.braid);
    }

    // ---------------- forearms + hands (moving parts) ----------------
    function armD(E, W, X, Y, Z, hand, mirror) {
      const u = W.clone().sub(E), L = u.length(); u.divideScalar(L);
      const Yf = Y.clone().addScaledVector(u, -Y.dot(u)).normalize(), Zf = u.clone().cross(Yf);
      const e = A3(E), w = A3(W), ua = A3(u), ya = A3(Yf), za = A3(Zf), Xa = A3(X), Ya = A3(Y), Za = A3(Z), s = mirror ? -1 : 1;
      return function (x, y, z) {
        const px = x - e[0], py = y - e[1], pz = z - e[2], tt = px * ua[0] + py * ua[1] + pz * ua[2], t = clamp(tt / L, 0, 1);
        const cx = px - ua[0] * t * L, cy = py - ua[1] * t * L, cz = pz - ua[2] * t * L, a = cx * ya[0] + cy * ya[1] + cz * ya[2], b = cx * za[0] + cy * za[1] + cz * za[2];
        const k = sstep(0.12, 0.9, t), ry = lerp(0.034, 0.0172, k), rz = lerp(0.039, 0.0262, k);
        let d = (Math.sqrt(a * a / (ry * ry) + b * b / (rz * rz)) - 1) * Math.min(ry, rz);
        d = smax(d, tt - L - 0.004, 0.01);
        const hx = x - w[0], hy = y - w[1], hz = z - w[2];
        d = smin(d, hand(hx * Xa[0] + hy * Xa[1] + hz * Xa[2], hx * Ya[0] + hy * Ya[1] + hz * Ya[2], s * (hx * Za[0] + hy * Za[1] + hz * Za[2])), 0.012);
        return smax(d, 0.072 - tt, 0.004);
      };
    }
    function armBox(E, W, X, Y, Z) {
      const b0 = [1, 1, 1], b1 = [-1, -1, -1], u = W.clone().sub(E).normalize();
      const pts = [E.clone().addScaledVector(u, 0.06), W.clone()];
      for (const hx of [-0.04, 0.16]) for (const hy of [-0.075, 0.04]) for (const hz of [-0.06, 0.08]) pts.push(W.clone().addScaledVector(X, hx).addScaledVector(Y, hy).addScaledVector(Z, hz));
      pts.forEach(p => { for (let i = 0; i < 3; i++) { const v = A3(p)[i]; b0[i] = Math.min(b0[i], v - 0.045); b1[i] = Math.max(b1[i], v + 0.045); } });
      return [b0, b1];
    }
    function handColours(W, X, Y, Z, mirror) {
      return (x, y, z) => { const hx = x - W.x, hy = y - W.y, hz = z - W.z, lx = hx * X.x + hy * X.y + hz * X.z, ly = hx * Y.x + hy * Y.y + hz * Y.z;
        let c = 1 + 0.02 * Math.sin(x * 300) * Math.sin(z * 260 + y * 100);
        const palm = sstep(-0.006, -0.016, ly) * sstep(-0.01, 0.01, lx); // lighter, pinker palms
        const tip = sstep(0.11, 0.15, lx + Math.max(0, -ly) * 0.5);
        return [c * (1 + 0.1 * palm + 0.05 * tip), c * (1 + 0.06 * palm), c * (1 + 0.05 * palm)]; };
    }
    const groups = {};
    // right
    {
      const g = new THREE.Group(); g.position.copy(ER); root.add(g); groups.rE = g;
      const f = armD(ER, WR, HX, HY, HZ, rHand, false), bb = armBox(ER, WR, HX, HY, HZ);
      const geo = surfaceNets(f, bb[0], bb[1], 0.0044);
      vcol(geo, handColours(WR, HX, HY, HZ, false));
      geo.translate(-ER.x, -ER.y, -ER.z);
      const m = add(g, geo, M.skin); m.frustumCulled = false; groups.rArm = m;
      const wg = new THREE.Group(); wg.position.copy(WR).sub(ER); g.add(wg); groups.rW = wg;
    }
    // left
    {
      const g = new THREE.Group(); g.position.copy(EL); root.add(g); groups.lE = g;
      const f = armD(EL, WL, XL, YL, ZL, lHand, true), bb = armBox(EL, WL, XL, YL, ZL.clone().negate());
      const geo = surfaceNets(f, bb[0], bb[1], 0.0044);
      vcol(geo, handColours(WL, XL, YL, ZL, true));
      geo.translate(-EL.x, -EL.y, -EL.z);
      add(g, geo, M.skin);
    }
    // sleeve ends (3/4 sleeves) on the forearms: open tube with a turned hem
    function sleeve(parent, E, W, seed) {
      const u = W.clone().sub(E).normalize(), n1 = V(0, 1, 0).addScaledVector(u, -u.y).normalize(), n2 = u.clone().cross(n1), rows = [];
      const NRw = 9, segs = 30;
      for (let i = 0; i <= NRw + 2; i++) {
        const s = Math.min(i, NRw) / NRw, row = [];
        for (let j = 0; j < segs; j++) {
          const a = j / segs * TAU;
          const endW = 0.004 * Math.sin(2 * a + seed) + 0.002 * Math.sin(5 * a + seed * 2);
          let dist = lerp(-0.028, 0.112 + endW, s), r = lerp(0.0445, 0.0478, sstep(-0.028, 0.005, dist)) - 0.0035 * sstep(0.02, 0.11, dist);
          r += 0.0018 * Math.sin(3 * a + seed + dist * 30) * sstep(0, 0.06, dist);
          if (i === NRw + 1) { r -= 0.0032; dist -= 0.0015; } else if (i === NRw + 2) { r -= 0.0036; dist -= 0.014; }
          const p = E.clone().addScaledVector(u, dist).addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r).sub(E);
          row.push(A3(p));
        }
        rows.push(row);
      }
      return add(parent, loft(rows, true, (i, j, p) => [(p[0] + p[2]) * 20, p[1] * 20]), M.kurti2);
    }
    sleeve(groups.rE, ER, WR, 0.7); sleeve(groups.lE, EL, WL, 2.1);

    // ---------------- knife ----------------
    {
      const kg = new THREE.Group(); kg.position.copy(KO).sub(WR); groups.rW.add(kg);
      const bs = new THREE.Shape();
      bs.moveTo(0, 0.0); bs.lineTo(0.125, 0.0); bs.quadraticCurveTo(0.175, 0.002, 0.204, 0.018);
      bs.quadraticCurveTo(0.17, 0.034, 0.12, 0.0445); bs.lineTo(0.004, 0.047); bs.quadraticCurveTo(0, 0.047, 0, 0.043); bs.lineTo(0, 0.0);
      const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0002, bevelSegments: 1, curveSegments: 16 });
      bg.translate(0, 0, -0.0008);
      { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); const edgeY = x < 0.125 ? 0 : 0.02 * Math.pow((x - 0.125) / 0.08, 2); const k = clamp((y - edgeY) / 0.009, 0.12, 1); p.setZ(i, p.getZ(i) * k); } bg.computeVertexNormals(); }
      bg.rotateY(-PI / 2);
      add(kg, bg, M.steel).receiveShadow = false;
      // bolster
      LIB.rbox(kg, 0.006, 0.026, 0.012, 0.0025, M.steelB, 0, 0.034, -0.006); triCount += 200;
      // handle: rounded profile extruded across, with rivets
      const hs = new THREE.Shape();
      hs.moveTo(-0.012, 0.0215); hs.quadraticCurveTo(-0.07, 0.017, -0.118, 0.0205); hs.quadraticCurveTo(-0.13, 0.022, -0.129, 0.034); hs.quadraticCurveTo(-0.128, 0.0475, -0.115, 0.0478);
      hs.lineTo(-0.012, 0.0472); hs.lineTo(-0.012, 0.0215);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.0028, bevelSize: 0.0026, bevelSegments: 3, curveSegments: 12 });
      hg.translate(0, 0, -0.006); hg.rotateY(-PI / 2); hg.computeVertexNormals();
      add(kg, hg, M.handle);
      for (const zz of [-0.03, -0.065, -0.1]) for (const sx of [-1, 1]) { LIB.cyl(kg, 0.0028, 0.0028, 0.002, M.rivet, sx * 0.0087, 0.034, zz, { rz: PI / 2, seg: 12 }); triCount += 48; }
    }

    // ---------------- cutting board ----------------
    {
      const sh = LIB.roundRectShape(0.40, 0.28, 0.018);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
      g.rotateX(-PI / 2); g.translate(0, 0.003, 0);
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, (x + 0.2) / 0.4, (z + 0.14) / 0.28); else if (Math.abs(n.getX(i)) > Math.abs(n.getZ(i))) uv.setXY(i, (z + 0.14) / 0.28, y * 2); else uv.setXY(i, (x + 0.2) / 0.4, (z + 0.14) / 0.28 + y * 0.4); }
      add(root, g, M.wood, 0, 0.92, BZ);
    }
    // ---------------- carrot (fed into the knife) ----------------
    const carG = new THREE.Group(); root.add(carG); groups.car = carG;
    const discs = [];
    const capMats = [M.carrot, M.carrotCap, M.carrotCap];
    for (let j = 0; j < NS; j++) {
      const ra = CAR_R(j * SLT / CAR_L), rb = CAR_R((j + 1) * SLT / CAR_L);
      const g = new THREE.CylinderGeometry(rb, ra, SLT, 24, 1);
      const m = add(carG, g, capMats, X0 + (j + 0.5) * SLT, CAR_Y, CAR_Z, { rz: -PI / 2 });
      discs.push(m);
    }
    {
      const prof = []; const x1 = NS * SLT;
      for (let i = 0; i <= 26; i++) { const s = x1 / CAR_L + (1 - x1 / CAR_L) * i / 26; const ss = Math.min(s, 0.985); let r = CAR_R(ss) * (1 + 0.04 * Math.sin(i * 2.1)); if (i === 26) r = 0.0006; prof.push(new THREE.Vector2(r, s * CAR_L)); }
      const lg = new THREE.LatheGeometry(prof, 24); lg.rotateZ(-PI / 2); lg.translate(X0, 0, 0);
      add(carG, lg, M.carrot, 0, CAR_Y, CAR_Z);
      const cg = new THREE.CircleGeometry(CAR_R(x1 / CAR_L), 24); cg.rotateY(-PI / 2);
      add(carG, cg, M.carrotCap, X0 + x1 + 0.0002, CAR_Y, CAR_Z);
      // tiny root hairs / ring marks are in the texture; a slight bend
      carG.rotation.y = 0.0;
    }
    // ---------------- slices: a pile already cut + the ones that appear while she chops ----------------
    const sliceG = new THREE.Group(); root.add(sliceG);
    const sliceGeo = (r) => new THREE.CylinderGeometry(r, r, SLT, 22, 1);
    for (let i = 0; i < 9; i++) {
      const r = CAR_R(0) * (1.02 + R() * 0.12), a = R() * TAU, d = 0.012 + R() * 0.026;
      const m = add(sliceG, sliceGeo(r), capMats, -0.085 + Math.cos(a) * d * 1.3, CY + SLT / 2 + (i > 5 ? SLT * 0.8 : 0), CAR_Z + Math.sin(a) * d, { rx: (R() - 0.5) * 0.25, rz: (R() - 0.5) * 0.25 });
      m.rotation.y = R() * TAU;
    }
    const live = [];
    for (let j = 0; j < NS; j++) {
      const r = CAR_R((j + 0.5) * SLT / CAR_L), m = add(sliceG, sliceGeo(r), capMats, 0, 0, 0);
      const a = R() * TAU, d = 0.006 + R() * 0.022;
      m.visible = false;
      live.push({ m, t: -1, from: V(X0 - SLT / 2 - 0.0026, CAR_Y, CAR_Z), to: V(-0.062 + Math.cos(a) * d * 1.4 - j * 0.0012, CY + SLT * (1.4 + (j % 3) * 0.7), CAR_Z + Math.sin(a) * d), tilt: [(R() - 0.5) * 0.35, R() * TAU, (R() - 0.5) * 0.35] });
    }
    // ---------------- steel bowl with more vegetables ----------------
    {
      const bowl = new THREE.Group(); bowl.position.set(0.33, 0.92, 0.63); root.add(bowl);
      add(bowl, new THREE.LatheGeometry([[0, 0], [0.042, 0], [0.047, 0.003], [0.066, 0.026], [0.075, 0.046], [0.077, 0.052], [0.0765, 0.0545], [0.074, 0.053], [0.072, 0.047], [0.063, 0.027], [0.045, 0.006], [0, 0.005]].map(p => new THREE.Vector2(p[0], p[1])), 40), M.steelB);
      const carrotLathe = (L, r0) => { const pr = []; for (let i = 0; i <= 20; i++) { const s = i / 20; pr.push(new THREE.Vector2(i === 20 ? 0.0005 : r0 * (1 - 0.8 * Math.pow(s, 1.6)) * (i === 0 ? 0.6 : 1), s * L)); } return new THREE.LatheGeometry(pr, 18); };
      const c1 = add(bowl, carrotLathe(0.17, 0.0155), M.carrot, -0.03, 0.035, -0.01, { rz: -1.25, ry: 0.3 });
      const c2 = add(bowl, carrotLathe(0.16, 0.014), M.carrot, 0.02, 0.03, 0.025, { rz: 1.32, ry: -0.5 });
      LIB.cyl(c1, 0.006, 0.007, 0.006, M.leafy, 0, -0.002, 0, { seg: 10 }); LIB.cyl(c2, 0.005, 0.006, 0.006, M.leafy, 0, -0.002, 0, { seg: 10 });
      const tg = new THREE.SphereGeometry(0.027, 24, 16); tg.scale(1, 0.86, 1); add(bowl, tg, M.tomato, 0.02, 0.045, -0.03);
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; LIB.box(bowl, 0.012, 0.0012, 0.003, M.leafy, 0.02 + Math.cos(a) * 0.006, 0.068, -0.03 + Math.sin(a) * 0.006, { ry: -a }); }
      LIB.cyl(bowl, 0.0012, 0.0015, 0.008, M.leafy, 0.02, 0.072, -0.03, { seg: 6 });
      for (let i = 0; i < 2; i++) { const c = LIB.tube(bowl, [[-0.04 + i * 0.012, 0.03, 0.02], [-0.01 + i * 0.01, 0.04 + i * 0.006, 0.03], [0.03, 0.05 - i * 0.004, 0.022 - i * 0.01]], 0.005, M.leafy, { segs: 16, radial: 8 }); triCount += 256; }
    }

    // ---------------- animation ----------------
    const rArm = groups.rArm, rgeo = rArm.geometry, P0 = rgeo.attributes.position.array.slice(), N0 = rgeo.attributes.normal.array.slice();
    const WRl = WR.clone().sub(ER), uF = WR.clone().sub(ER).normalize(), sk = [];
    for (let i = 0; i < P0.length / 3; i++) { const t = (P0[i * 3] - WRl.x) * uF.x + (P0[i * 3 + 1] - WRl.y) * uF.y + (P0[i * 3 + 2] - WRl.z) * uF.z, w = sstep(-0.024, 0.016, t); if (w > 0) sk.push(i, w); }
    const wAxis = HY.clone();               // wrist: radial deviation lifts the blade tip
    { const test = V(0, 0, 0.15).applyAxisAngle(wAxis, 0.1); if (test.y < 0) wAxis.negate(); }
    const eAxis = SR.clone().sub(ER).cross(WR.clone().sub(ER)).normalize();
    { const test = WR.clone().sub(ER).applyAxisAngle(eAxis, 0.1); if (test.y < WR.y - ER.y) eAxis.negate(); }
    const qW = new THREE.Quaternion(), qE = new THREE.Quaternion(), qL = new THREE.Quaternion(), tv = V(0, 0, 0), tn = V(0, 0, 0);
    let lastW = 0;
    function skin(angle) {
      if (Math.abs(angle - lastW) < 1e-5) return; lastW = angle;
      const pa = rgeo.attributes.position.array, na = rgeo.attributes.normal.array;
      for (let k = 0; k < sk.length; k += 2) {
        const i = sk[k], w = sk[k + 1], o = i * 3;
        tv.set(P0[o] - WRl.x, P0[o + 1] - WRl.y, P0[o + 2] - WRl.z).applyAxisAngle(wAxis, angle * w);
        pa[o] = tv.x + WRl.x; pa[o + 1] = tv.y + WRl.y; pa[o + 2] = tv.z + WRl.z;
        tn.set(N0[o], N0[o + 1], N0[o + 2]).applyAxisAngle(wAxis, angle * w); na[o] = tn.x; na[o + 1] = tn.y; na[o + 2] = tn.z;
      }
      rgeo.attributes.position.needsUpdate = true; rgeo.attributes.normal.needsUpdate = true;
    }
    const lReach = Math.hypot(WL.x - EL.x, WL.z - EL.z) + 0.05;
    const st = { amp: 0, target: 0, phase: 0, cut: 0, cutting: false, reset: false, feed: 0 };
    function stroke(f) { // 0 = blade on the board, 1 = top of the lift
      if (f < 0.1) return 0;
      if (f < 0.55) return sstep(0.1, 0.55, f) * 0.92;
      if (f < 0.70) return 0.92 + 0.08 * sstep(0.55, 0.70, f);
      const u = (f - 0.70) / 0.30; return 1 - u * u;
    }
    function pose(lift, feed) {
      skin(lift * 0.20);
      qW.setFromAxisAngle(wAxis, lift * 0.20); groups.rW.quaternion.copy(qW);
      qE.setFromAxisAngle(eAxis, lift * 0.055); groups.rE.quaternion.copy(qE);
      qL.setFromAxisAngle(V(0, 1, 0), -feed / lReach); groups.lE.quaternion.copy(qL);
      carG.position.x = -feed;
    }
    function showDiscs(n) { for (let j = 0; j < NS; j++) discs[j].visible = j >= n; }
    function placeSlice(s, k) {
      const m = s.m; m.visible = true;
      const e = k * k * (3 - 2 * k);
      m.position.copy(s.from).lerp(s.to, e); m.position.y += Math.sin(k * PI) * 0.008;
      m.rotation.set(s.tilt[0] * e, s.tilt[1] * e, -PI / 2 * (1 - e) + s.tilt[2] * e);
    }
    root.userData.setCut = (v) => { st.target = clamp(+v || 0, 0, 1); };
    root.userData.tick = (t, dt) => {
      dt = clamp(dt || 0, 0, 0.05);
      st.amp += (st.target - st.amp) * Math.min(1, dt * 3.5);
      if (st.target === 0 && st.amp < 0.003) st.amp = 0;
      // falling slices finish even when stopping
      for (const s of live) if (s.t >= 0 && s.t < 1) { s.t = Math.min(1, s.t + dt / 0.17); placeSlice(s, s.t); }
      if (st.amp === 0 && !st.reset) { pose(0, st.feed); return; }
      const prev = st.phase; st.phase += dt * 2.2;
      const f = st.phase % 1, wrapped = Math.floor(st.phase) !== Math.floor(prev);
      if (wrapped) { // the knife meets the board
        if (st.cutting) {
          const s = live[st.cut]; s.t = 0; placeSlice(s, 0); st.cut++; showDiscs(st.cut);
          if (typeof root.userData.onChop === 'function') { try { root.userData.onChop(); } catch (e) { /* ignore */ } }
          if (st.cut >= NS) st.reset = true;
        }
        st.cutting = !st.reset && st.target > 0 && st.amp > 0.35;
      }
      if (st.reset) { // quietly: slices shrink away, the carrot slides back out of the blade
        const k = sstep(0.12, 0.6, f);
        for (const s of live) if (s.m.visible) s.m.scale.setScalar(Math.max(0.001, 1 - sstep(0.05, 0.35, f)));
        st.feed = NS * SLT * (1 - k);
        const back = Math.ceil(st.feed / SLT - 1e-6); showDiscs(Math.min(st.cut, back));
        if (f > 0.62) { st.reset = false; st.cut = 0; st.feed = 0; showDiscs(0); for (const s of live) { s.m.visible = false; s.m.scale.setScalar(1); s.t = -1; } st.cutting = false; }
      } else if (st.cutting) st.feed = (st.cut + sstep(0.15, 0.55, f)) * SLT;
      pose(stroke(f) * Math.min(1, st.amp), st.feed);
    };
    root.userData.focus = { x: 0, y: 1.08, z: 0.3, r: 0.55 };
    root.userData.name = 'my mom';
    root.userData.triangles = triCount;
    return root;
  }

  window.MOM = { build };
})();
