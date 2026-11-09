/* Bedroom props B — bed, pool cue, guitar, wall shelf with folded clothes, mirror, door.
   three.js r128, global THREE + LIB. Every builder returns a THREE.Group; front faces +z.
   Floor items: origin on the floor at the footprint centre. Wall items: origin on the wall surface at floor level. */
(function () {
  'use strict';
  const L = window.LIB;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- geometry helpers
  // average normals of coincident vertices (RoundedBoxGeometry is non-indexed, so LIB.puffy comes out faceted)
  function smoothNormals(g) {
    const pos = g.attributes.position, n = pos.count, map = new Map(), ids = new Int32Array(n), acc = [];
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 2e4) + ',' + Math.round(pos.getY(i) * 2e4) + ',' + Math.round(pos.getZ(i) * 2e4);
      let id = map.get(k); if (id === undefined) { id = acc.length / 3; map.set(k, id); acc.push(0, 0, 0); } ids[i] = id;
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const idx = g.index ? g.index.array : null, tri = idx ? idx.length / 3 : n / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx[3 * t] : 3 * t, i1 = idx ? idx[3 * t + 1] : 3 * t + 1, i2 = idx ? idx[3 * t + 2] : 3 * t + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      e1.subVectors(c, b); e2.subVectors(a, b); e1.cross(e2);
      for (const i of [i0, i1, i2]) { const j = ids[i] * 3; acc[j] += e1.x; acc[j + 1] += e1.y; acc[j + 2] += e1.z; }
    }
    const nr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const j = ids[i] * 3; const l = Math.hypot(acc[j], acc[j + 1], acc[j + 2]) || 1; nr[3 * i] = acc[j] / l; nr[3 * i + 1] = acc[j + 1] / l; nr[3 * i + 2] = acc[j + 2] / l; }
    g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    return g;
  }
  // box-projected UVs in metres (per triangle, by face normal) — keeps textures at true scale on any slab
  function boxUV(g) {
    const pos = g.attributes.position, n = pos.count, uv = new Float32Array(n * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let t = 0; t < n / 3; t++) {
      a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); c.fromBufferAttribute(pos, 3 * t + 2);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
      const ax = Math.abs(e1.x), ay = Math.abs(e1.y), az = Math.abs(e1.z);
      for (let k = 0; k < 3; k++) {
        const i = 3 * t + k, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (ay >= ax && ay >= az) { uv[2 * i] = x; uv[2 * i + 1] = z; }
        else if (ax >= az) { uv[2 * i] = z; uv[2 * i + 1] = y; }
        else { uv[2 * i] = x; uv[2 * i + 1] = y; }
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  // soft slab = LIB.puffy + smooth normals + metric UVs
  function soft(p, w, h, d, r, mat, x, y, z, o) { const m = L.puffy(p, w, h, d, r, mat, x, y, z, o); boxUV(m.geometry); smoothNormals(m.geometry); return m; }
  // indexed grid; f(i,j) -> [x,y,z,u,v]
  function gridGeo(nu, nv, f) {
    const P = new Float32Array((nu + 1) * (nv + 1) * 3), U = new Float32Array((nu + 1) * (nv + 1) * 2), I = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const k = j * (nu + 1) + i, r = f(i, j); P[3 * k] = r[0]; P[3 * k + 1] = r[1]; P[3 * k + 2] = r[2]; U[2 * k] = r[3]; U[2 * k + 1] = r[4]; }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    return g;
  }
  // cylinder between two points
  function rod(p, a, b, r, mat, seg) {
    const A = V3(a[0], a[1], a[2]), B = V3(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length();
    const m = L.cyl(p, r, r, len, mat, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, { seg: seg || 8 });
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return m;
  }
  // phillips screw head facing +z
  let _slotMat = null;
  function screw(p, x, y, z, r, mat) {
    _slotMat = _slotMat || L.mat({ c: '#2a2926', rough: 0.7, metal: 0.5 });
    const g = L.group(p, x, y, z);
    const h = L.sph(g, r, mat, 0, 0, 0, { ws: 14, hs: 7 }); h.scale.set(1, 1, 0.38);
    L.box(g, r * 1.25, r * 0.2, r * 0.3, _slotMat, 0, 0, r * 0.24, { shadow: false });
    L.box(g, r * 0.2, r * 1.25, r * 0.3, _slotMat, 0, 0, r * 0.24, { shadow: false });
    return g;
  }

  // ---------------------------------------------------------------- textures
  function wrapDraw(W, H, x, y, pad, fn) { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) { const X = x + ox, Y = y + oy; if (X < -pad || X > W + pad || Y < -pad || Y > H + pad) continue; fn(X, Y); } }
  // off-white cotton with irregular soft dark spots; one tile = 1 m
  function spotTex(rx, ry) {
    return L.canvasTex('b_spots', 2048, 2048, (g, W, H) => {
      g.fillStyle = '#e2ded6'; g.fillRect(0, 0, W, H);
      const r = L.rnd(11);
      for (let k = 0; k < 90; k++) { // gentle tonal mottling of the cloth
        const x = r() * W, y = r() * H, rad = 60 + r() * 200, c = r() < 0.5 ? '255,255,252' : '140,132,120', a = 0.03 + r() * 0.03;
        wrapDraw(W, H, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, 'rgba(' + c + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); });
      }
      const blob = (cx, cy, rad, el, rot, seed, col) => {
        const q = L.rnd(seed), ph = [q() * 6, q() * 6, q() * 6, q() * 6];
        const pts = [];
        for (let k = 0; k < 40; k++) {
          const a = k / 40 * TAU;
          const rr = rad * (1 + 0.17 * Math.sin(2 * a + ph[0]) + 0.10 * Math.sin(3 * a + ph[1]) + 0.06 * Math.sin(5 * a + ph[2]) + 0.035 * Math.sin(9 * a + ph[3]) + (q() - 0.5) * 0.05);
          const x = Math.cos(a) * rr * (1 + el), y = Math.sin(a) * rr * (1 - el * 0.4);
          pts.push([x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
        }
        g.fillStyle = col;
        wrapDraw(W, H, cx, cy, rad * 2.2, (X, Y) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X + p[0], Y + p[1]) : g.moveTo(X + p[0], Y + p[1])); g.closePath(); g.fill(); });
      };
      g.filter = 'blur(1.4px)';
      const N = 15, cell = W / N; let s = 100;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (r() < 0.07) continue;
        const cx = (i + 0.5 + (r() - 0.5) * 0.9) * cell, cy = (j + 0.5 + (r() - 0.5) * 0.9) * cell;
        const rad = cell * (0.075 + Math.pow(r(), 1.8) * 0.19);
        const tone = r(); const col = tone < 0.15 ? '#4b4844' : tone < 0.3 ? '#3a3734' : '#272523';
        blob(cx, cy, rad, (r() - 0.3) * 0.35, r() * PI, s++, col);
        if (r() < 0.4) { const a = r() * TAU, d = rad * (1.5 + r() * 0.8); blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rad * (0.18 + r() * 0.15), 0.2, r() * 3, s++, col); }
      }
      g.filter = 'none';
    }, true, rx, ry);
  }
  // fabric bump (linear), one tile = 1 m: fine thread noise + soft creases
  function fabBump(rx, ry) {
    return L.canvasTex('b_fabbump', 1024, 1024, (g, W, H) => {
      const img = g.createImageData(W, H), r = L.rnd(5);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const v = 128 + (r() - 0.5) * 34 + (x % 2 ? 6 : -6) + (y % 2 ? -5 : 5); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
      g.filter = 'blur(4px)'; g.lineCap = 'round';
      for (let k = 0; k < 70; k++) {
        const x = r() * W, y = r() * H, a = r() * PI, len = 40 + r() * 160, bend = (r() - 0.5) * 60, w = 3 + r() * 7;
        const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
        wrapDraw(W, H, x, y, len + 20, (X, Y) => {
          for (const [off, col] of [[-w * 0.6, 'rgba(0,0,0,0.22)'], [w * 0.6, 'rgba(255,255,255,0.22)']]) {
            g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(X - dx / 2 + off * Math.sin(a), Y - dy / 2 - off * Math.cos(a));
            g.quadraticCurveTo(X + bend * Math.sin(a) + off * Math.sin(a), Y - bend * Math.cos(a) - off * Math.cos(a), X + dx / 2 + off * Math.sin(a), Y + dy / 2 - off * Math.cos(a)); g.stroke();
          }
        });
      }
      g.filter = 'none';
    }, false, rx, ry);
  }
  // wood grain; lines run along canvas X (or Y when o.vertical). Tiles in both directions.
  function grainTex(key, W, H, o) {
    return L.canvasTex(key, W, H, (g, w, h) => {
      const r = L.rnd(o.seed || 3);
      g.fillStyle = o.base; g.fillRect(0, 0, w, h);
      g.save(); if (o.vertical) { g.translate(w, 0); g.rotate(PI / 2); }
      const AL = o.vertical ? h : w, AC = o.vertical ? w : h; // along / across
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
      if (o.flecks) { for (let k = 0; k < o.flecks; k++) { g.fillStyle = (r() < 0.5 ? o.light : o.dark) + '30'; g.fillRect(r() * AL, r() * AC, 1.5 + r() * 3, 4 + r() * 10); } }
      g.restore();
    }, true, o.rx, o.ry);
  }
  function knitTex(rx, ry) { // greyscale knit (stockinette Vs), one tile = 5 cm
    return L.canvasTex('b_knit', 256, 256, (g, W, H) => {
      g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, W, H);
      const cw = 16, ch = 14, r = L.rnd(9);
      for (let y = -ch; y < H + ch; y += ch) for (let x = 0; x < W; x += cw) for (const sgn of [-1, 1]) {
        g.save(); g.translate(x + cw / 2 + sgn * cw * 0.22, y + ch / 2); g.rotate(sgn * 0.5);
        const gr = g.createLinearGradient(-cw * 0.25, 0, cw * 0.25, 0); const v = 205 + Math.floor((r() - 0.5) * 24);
        gr.addColorStop(0, 'rgb(150,150,150)'); gr.addColorStop(0.5, 'rgb(' + v + ',' + v + ',' + v + ')'); gr.addColorStop(1, 'rgb(140,140,140)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, cw * 0.26, ch * 0.62, 0, 0, TAU); g.fill(); g.restore();
      }
    }, true, rx, ry);
  }
  function denimTex(key, base, rx, ry) { // twill, one tile = 4 cm
    return L.canvasTex('b_denim_' + key, 256, 256, (g, W, H) => {
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      const r = L.rnd(key.length * 7 + 3);
      g.lineWidth = 2;
      for (let k = -H; k < W + H; k += 4) { g.strokeStyle = 'rgba(255,255,255,' + (0.04 + r() * 0.06) + ')'; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H * 0.6, H); g.stroke(); }
      for (let k = 0; k < 900; k++) { g.fillStyle = 'rgba(235,240,250,' + (r() * 0.16) + ')'; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1); }
      for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,30') + ',0.06)'; g.fillRect(r() * W, 0, 2 + r() * 8, H); }
    }, true, rx, ry);
  }
  function heatherTex(key, base, fleck, rx, ry) { // heathered jersey, one tile = 6 cm
    return L.canvasTex('b_heather_' + key, 256, 256, (g, W, H) => {
      g.fillStyle = base; g.fillRect(0, 0, W, H); const r = L.rnd(key.length * 5 + 1);
      for (let k = 0; k < 2600; k++) { g.fillStyle = (r() < 0.5 ? fleck : '#000000') + (r() < 0.5 ? '30' : '18'); const x = r() * W, y = r() * H; g.fillRect(x, y, 2 + r() * 7, 1); }
      for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, W, 1); }
    }, true, rx, ry);
  }
  function plainFabric(c, rough) { return L.mat({ c: c, rough: rough || 0.92, bump: L.weaveBump(), bumpScale: 0.0012 }); }

  // ================================================================ 1. BED
  const BED = { A: 0.515, Zf: 1.035, Rc: 0.11, re: 0.06, Ytop: 0.63 };
  function ridge(x, z, x1, z1, x2, z2, h, w) { const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz; let t = ((x - x1) * dx + (z - z1) * dz) / l2; const fade = Math.sin(clamp(t, 0, 1) * PI); t = clamp(t, 0, 1); const ex = x - (x1 + dx * t), ez = z - (z1 + dz * t); return h * fade * Math.exp(-(ex * ex + ez * ez) / (w * w)); }
  function bedR(x, z) { // soft rumples on top of the mattress
    return 0.007 * Math.sin(x * 5.3 + 1.1) * Math.sin(z * 3.9 + 0.3) + 0.004 * Math.sin(x * 9.7 + z * 6.1 + 2.0) + 0.0025 * Math.sin(x * 17 - z * 13 + 0.7)
      + 0.010 * Math.max(0, 1 - (x / 0.52) * (x / 0.52))
      + ridge(x, z, -0.35, -0.05, 0.15, 0.45, 0.012, 0.035) + ridge(x, z, 0.05, 0.62, 0.42, 0.25, 0.009, 0.03) + ridge(x, z, -0.42, 0.55, -0.12, 0.85, 0.008, 0.03)
      - ridge(x, z, 0.12, -0.2, 0.40, 0.05, 0.006, 0.05);
  }
  // fabric draped over the mattress: flat sheet (s across, t along) -> 3D. o: {W, t0, t1, z0, rf, fold, off, res}
  function drape(o) {
    const S = BED, cxM = S.A - S.Rc, czM = S.Zf - S.Rc, Rc = S.Rc, re = S.re;
    const nu = Math.round(o.W / o.res), nv = Math.round((o.t1 - o.t0) / o.res);
    const P = [];
    const geo = gridGeo(nu, nv, (i, j) => {
      const t = o.t0 + (o.t1 - o.t0) * j / nv, s = -o.W / 2 + o.W * i / nu;
      let zf, lift = 0;
      const rf = o.rf || 0.02, z0 = o.z0 || 0;
      if (!o.fold || t >= 0) zf = z0 + t;
      else if (t >= -PI * rf) { const ph = -t / rf; zf = z0 - rf * Math.sin(ph); lift = rf * (1 - Math.cos(ph)); }
      else { zf = z0 + (-t - PI * rf); lift = 2 * rf; }
      const x = s, z = zf;
      const cx = clamp(x, -cxM, cxM), cz = Math.min(z, czM), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), e = d - (Rc - re);
      let px, py, pz, nx, ny, nz;
      if (e <= 0) { px = x; pz = z; py = S.Ytop + bedR(x, z); nx = 0; ny = 1; nz = 0; }
      else {
        const ux = dx / d, uz = dz / d; let rh;
        if (e < re * PI / 2) {
          const th = e / re; rh = (Rc - re) + re * Math.sin(th);
          py = S.Ytop - re * (1 - Math.cos(th)) + bedR(cx + ux * (Rc - re), cz + uz * (Rc - re)) * Math.cos(th);
          nx = ux * Math.sin(th); ny = Math.cos(th); nz = uz * Math.sin(th);
        } else {
          let h = e - re * PI / 2;
          // perimeter coordinate for vertical folds
          let u, psi = -1;
          const onCornerR = cz >= czM - 1e-9 && cx >= cxM - 1e-9 && dz > 0 && dx > 0, onCornerL = cz >= czM - 1e-9 && cx <= -cxM + 1e-9 && dz > 0 && dx < 0;
          const phi = Math.atan2(dz, dx);
          if (onCornerR) { psi = phi; u = czM + Rc * phi; }
          else if (onCornerL) { psi = phi - PI / 2; u = czM + Rc * PI / 2 + 2 * cxM + Rc * psi; }
          else if (dz > 0) u = czM + Rc * PI / 2 + (cxM - cx);
          else if (dx > 0) u = cz;
          else u = czM + Rc * PI + 2 * cxM + (czM - cz);
          if (psi >= 0) h *= 1 - 0.26 * Math.sin(2 * psi); // corners drop a little lower, not a full dog-ear
          const hf = sstep(0, 0.2, h);
          let dl = 0.026 * sstep(0, 0.3, h) + 0.012 * Math.sin(clamp(h / 0.1, 0, 1) * PI / 2) + hf * (0.6 + 0.4 * Math.sin(u * 2.3 + 1)) * (0.026 * Math.sin(u * 12.5 + 0.7) + 0.010 * Math.sin(u * 29 + 2.1) + 0.004 * Math.sin(u * 61 + 0.3));
          if (psi >= 0) dl += hf * 0.034 * Math.sin(2 * psi) * (0.55 + 0.45 * Math.sin(psi * 9 + 1.3));
          rh = Rc + dl;
          py = S.Ytop - re - h + hf * 0.012 * Math.sin(u * 12.5 + 2.2);
          nx = ux; ny = 0; nz = uz;
        }
        px = cx + ux * rh; pz = cz + uz * rh;
      }
      const k = lift + (o.off || 0);
      px += nx * k; py += ny * k; pz += nz * k;
      P.push([px, py, pz]);
      return [px, py, pz, s, t];
    });
    return { geo, P, nu, nv };
  }
  function hem(parent, D, r, mat, which, inset) {
    const nr = D.geo.attributes.normal, k0 = inset == null ? r * 0.55 : inset;
    const at = (i, j) => { const k = j * (D.nu + 1) + i, p = D.P[k]; return [p[0] - nr.getX(k) * k0, p[1] - nr.getY(k) * k0, p[2] - nr.getZ(k) * k0]; };
    const lines = [];
    if (which.left) { const a = []; for (let j = 0; j <= D.nv; j += 2) a.push(at(0, j)); lines.push(a); }
    if (which.right) { const a = []; for (let j = 0; j <= D.nv; j += 2) a.push(at(D.nu, j)); lines.push(a); }
    if (which.end) { const a = []; for (let i = 0; i <= D.nu; i += 2) a.push(at(i, D.nv)); lines.push(a); }
    if (which.start) { const a = []; for (let i = 0; i <= D.nu; i += 2) a.push(at(i, 0)); lines.push(a); }
    lines.forEach(a => L.tube(parent, a, r, mat, { segs: a.length * 2, radial: 8 }));
  }

  // a real pillow: lens-shaped with a sewn seam, pinched corners and soft wrinkles near the edge
  function pillow(parent, W, D, Tt, Tb, mat, seed) {
    const g = L.group(parent), r = L.rnd(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6, r() * 6];
    const n = 30, m = 24;
    const pt = (s, t, sgn, k) => {
      const u = Math.sin(s * PI / 2), v = Math.sin(t * PI / 2);
      const xx = u * W / 2 * (1 - 0.05 * (1 - v * v)), zz = v * D / 2 * (1 - 0.045 * (1 - u * u));
      const f = Math.pow(Math.max(0, 1 - u * u), 0.5) * Math.pow(Math.max(0, 1 - v * v), 0.45);
      const wr = (0.006 * Math.sin(u * 9 + ph[0]) * Math.sin(v * 7 + ph[1]) + 0.004 * Math.sin(u * 21 + v * 15 + ph[2]) + 0.0025 * Math.sin(u * 37 - v * 29 + ph[3])) * Math.sqrt(f) * (1 - f) * 2.5 * Math.min(1, (Tt + Tb) / 0.13);
      const dent = sgn > 0 ? -0.018 * Math.exp(-((u + 0.15) * (u + 0.15) * 6 + (v - 0.05) * (v - 0.05) * 9)) * f : 0;
      return [xx, sgn * (k * f + wr) + dent, zz, xx + 0.5, zz + 0.5];
    };
    const top = gridGeo(n, m, (i, j) => pt(-(-1 + 2 * i / n), -1 + 2 * j / m, 1, Tt));
    const bot = gridGeo(n, m, (i, j) => pt(-1 + 2 * i / n, -1 + 2 * j / m, -1, Tb));
    L.mesh(g, top, mat, 0, 0, 0); L.mesh(g, bot, mat, 0, 0, 0);
    const seam = []; for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, c = Math.cos(a), sn = Math.sin(a); const s = clamp(c * 1.5, -1, 1), t = clamp(sn * 1.5, -1, 1); const p = pt(s, t, 1, 0); seam.push([p[0], 0, p[2]]); }
    L.tube(g, seam, 0.0045, mat, { closed: true, segs: 128, radial: 6 });
    return g;
  }

  function bed() {
    const g = new THREE.Group();
    const metal = L.mat({ c: '#1f1f20', rough: 0.5, metal: 0.65 }); const F1 = { seg: 1 };
    const capM = L.mat({ c: '#111111', rough: 0.8 });
    // ---- frame: square-tube platform with slats, 6 legs, spindle headboard
    for (const sx of [-1, 1]) {
      L.rbox(g, 0.03, 0.05, 2.06, 0.004, metal, sx * 0.475, 0.325, 0, F1);
      for (const z of [0, 1.0]) { L.rbox(g, 0.032, 0.30, 0.032, 0.004, metal, sx * 0.475, 0.15, z, F1); L.cyl(g, 0.02, 0.02, 0.012, capM, sx * 0.475, 0.006, z, { seg: 16 }); }
      L.rbox(g, 0.035, 1.0, 0.035, 0.004, metal, sx * 0.48, 0.50, -1.04, F1); // headboard posts reach the floor
      L.cyl(g, 0.021, 0.021, 0.012, capM, sx * 0.48, 0.006, -1.04, { seg: 16 });
      L.rbox(g, 0.035, 0.01, 0.035, 0.004, metal, sx * 0.48, 1.004, -1.04, F1);
    }
    L.rbox(g, 0.98, 0.05, 0.03, 0.004, metal, 0, 0.325, 1.02, F1);
    L.rbox(g, 0.03, 0.04, 2.0, 0.004, metal, 0, 0.32, 0, F1); L.rbox(g, 0.03, 0.30, 0.03, 0.004, metal, 0, 0.15, 0, F1); L.cyl(g, 0.018, 0.018, 0.012, capM, 0, 0.006, 0, { seg: 16 });
    for (let z = -0.94; z <= 0.95; z += 0.17) L.rbox(g, 0.93, 0.008, 0.06, 0.004, metal, 0, 0.346, z, F1);
    L.rbox(g, 0.96, 0.035, 0.035, 0.004, metal, 0, 0.975, -1.04, F1);
    L.rbox(g, 0.96, 0.025, 0.025, 0.004, metal, 0, 0.655, -1.04, F1);
    for (let k = -3; k <= 3; k++) L.rbox(g, 0.016, 0.31, 0.016, 0.004, metal, k * 0.12, 0.81, -1.04, F1);

    // ---- bedding materials
    const spotMat = (rx, ry) => L.mat({ c: '#ffffff', map: spotTex(rx, ry), bump: fabBump(rx, ry), bumpScale: 0.0035, rough: 0.9, side: THREE.DoubleSide });
    const sheetM = spotMat(1, 1);
    // ---- mattress dressed in the fitted sheet
    const mat = soft(g, 0.99, 0.23, 2.03, 0.055, sheetM, 0, 0.465, 0, { seg: 6, amp: 0.002, bulge: 0.06, seed: 3 });
    // elastic gather of the fitted sheet under the mattress edge
    L.rbox(g, 0.97, 0.01, 2.01, 0.005, sheetM, 0, 0.352, 0);

    // ---- duvet folded back at the head
    const duvet = L.group(g); duvet.userData = { name: 'the duvet', focus: { x: 0, y: 0.6, z: 0.35, r: 0.9 } };
    const z0 = -0.40, rf = 0.028, flap = 0.30;
    const Lmain = (BED.Zf - BED.re) - z0 + BED.re * PI / 2 + 0.30;
    const D = drape({ W: 1.73, t0: -(PI * rf + flap), t1: Lmain, z0, rf, fold: true, off: 0, res: 0.02 });
    L.mesh(duvet, D.geo, sheetM, 0, 0, 0);
    const hemM = L.mat({ c: '#d0cbc2', rough: 0.92, bump: L.weaveBump(), bumpScale: 0.001 });
    hem(duvet, D, 0.021, hemM, { left: 1, right: 1, end: 1, start: 1 }, 0.02);

    // ---- charcoal knit throw folded across the foot
    const knitC = knitTex(13, 13);
    const throwM = L.mat({ c: '#625e59', map: knitC, bump: knitC, bumpScale: 0.004, rough: 0.95, side: THREE.DoubleSide });
    const T = drape({ W: 1.22, t0: 0.42, t1: 0.86, fold: false, off: 0.024, res: 0.02 });
    L.mesh(duvet, T.geo, throwM, 0, 0, 0);
    hem(duvet, T, 0.016, L.mat({ c: '#3d3a37', rough: 0.95 }), { left: 1, right: 1, end: 1, start: 1 }, 0.015);

    // ---- two pillows in spotted cases
    const pil = L.group(g); pil.userData = { name: 'the pillows', focus: { x: 0, y: 0.75, z: -0.78, r: 0.45 } };
    const pm = spotMat(1, 1);
    const p1 = pillow(pil, 0.66, 0.46, 0.09, 0.045, pm, 21); p1.position.set(0.02, 0.632, -0.76); p1.rotation.set(0.0, 0.03, -0.012);
    const p2 = pillow(pil, 0.65, 0.45, 0.085, 0.05, pm, 33); p2.position.set(-0.03, 0.735, -0.83); p2.rotation.set(0.30, -0.07, 0.025);

    g.userData.focus = { x: 0, y: 0.6, z: 0, r: 1.2 };
    g.userData.parts = [pil, duvet];
    return g;
  }

  // ================================================================ 2. POOL CUE
  const CUE = (() => { // radius along the cue (m from butt)
    const k = [[0, 0.0145], [0.165, 0.0142], [0.42, 0.0134], [0.72, 0.0110], [0.745, 0.0107], [0.9, 0.0094], [1.05, 0.0081], [1.15, 0.0073], [1.30, 0.0068], [1.462, 0.0066]];
    return { r(a) { for (let i = 1; i < k.length; i++) if (a <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (a - k[i - 1][0]) / (k[i][0] - k[i - 1][0])); return 0.0066; } };
  })();
  function cue(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const lean = opts.flip ? -1 : 1, tilt = 15 * PI / 180;
    const xb = lean * 0.735 * Math.sin(tilt), yb = 1.15, zc = 0.035;
    const C = L.group(g, xb, yb, zc); C.rotation.z = lean * tilt;
    const seg = 40;
    const sect = (a0, a1, mat, n) => { const pts = []; n = n || 2; for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / (n - 1)); pts.push([CUE.r(a), a]); } return L.lathe(C, pts, mat, 0, 0, 0, { seg }); };
    const rosewood = grainTex('b_rosewood', 256, 1024, { base: '#4a2418', dark: '#1e0d07', light: '#7a3c22', vertical: true, lines: 140, wave: 0.02, pores: 300, seed: 4 });
    const woodM = L.mat({ c: '#ffffff', map: rosewood, rough: 0.25, clearcoat: 1, clearcoatRough: 0.08 });
    const rubber = L.mat({ c: '#121212', rough: 0.85 });
    const ivory = L.mat({ c: '#efe9da', rough: 0.3, clearcoat: 0.8 });
    const silver = L.mat({ c: '#cfd0d2', rough: 0.22, metal: 1 });
    const ebonyBand = L.mat({ c: '#0e0d0c', rough: 0.3, clearcoat: 0.8 });
    // bumper + butt cap
    L.lathe(C, [[0, 0], [0.0105, 0], [0.0128, 0.002], [0.0139, 0.006], [0.0141, 0.012]], rubber, 0, 0, 0, { seg });
    L.cyl(C, 0.01445, 0.01445, 0.004, ivory, 0, 0.014, 0, { seg });
    sect(0.016, 0.165, woodM);
    const rings = (a) => { L.cyl(C, CUE.r(a) + 0.00005, CUE.r(a) + 0.00005, 0.0016, silver, 0, a + 0.0008, 0, { seg }); L.cyl(C, CUE.r(a) + 0.00005, CUE.r(a) + 0.00005, 0.002, ebonyBand, 0, a + 0.0026, 0, { seg }); L.cyl(C, CUE.r(a) + 0.00005, CUE.r(a) + 0.00005, 0.0016, ivory, 0, a + 0.0044, 0, { seg }); };
    rings(0.03); rings(0.160);
    // Irish-linen wrap
    const linen = L.canvasTex('b_linen', 256, 512, (q, W, H) => { q.fillStyle = '#1b1b1c'; q.fillRect(0, 0, W, H); const r = L.rnd(4); for (let y = 0; y < H; y += 3) { q.fillStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.07) + ')'; q.fillRect(0, y + (r() - 0.5), W, 1.4); q.fillStyle = 'rgba(0,0,0,0.5)'; q.fillRect(0, y + 2, W, 0.8); } for (let k = 0; k < 500; k++) { q.fillStyle = 'rgba(255,255,255,0.06)'; q.fillRect(r() * W, r() * H, 3 + r() * 10, 1); } }, true, 3, 6);
    sect(0.166, 0.42, L.mat({ c: '#ffffff', map: linen, bump: linen, bumpScale: 0.0006, rough: 0.85 }), 6);
    rings(0.418);
    // forearm: ebony with four maple points
    const points = L.canvasTex('b_cuepoints', 512, 1024, (q, W, H) => {
      q.fillStyle = '#141110'; q.fillRect(0, 0, W, H); const r = L.rnd(8);
      for (let k = 0; k < 120; k++) { q.strokeStyle = 'rgba(70,50,35,' + (0.15 + r() * 0.2) + ')'; q.lineWidth = 1 + r() * 2; const x = r() * W; q.beginPath(); q.moveTo(x, 0); q.lineTo(x + (r() - 0.5) * 20, H); q.stroke(); }
      for (let i = 0; i < 4; i++) {
        const cx = (i + 0.5) * W / 4, tri = (hw, top, col) => { q.fillStyle = col; q.beginPath(); q.moveTo(cx - hw, H); q.lineTo(cx, top); q.lineTo(cx + hw, H); q.closePath(); q.fill(); };
        tri(W / 8 * 0.86, H * 0.12, '#c0392b'); tri(W / 8 * 0.80, H * 0.15, '#f1ece0'); tri(W / 8 * 0.74, H * 0.18, '#111'); tri(W / 8 * 0.68, H * 0.21, '#e3c48f');
        q.fillStyle = 'rgba(160,110,60,0.25)'; for (let k = 0; k < 20; k++) { const y = H * (0.25 + r() * 0.75); q.fillRect(cx - 4 + (r() - 0.5) * 30 * (y / H), y, 1, 6); }
      }
    }, true);
    sect(0.4245, 0.72, L.mat({ c: '#ffffff', map: points, rough: 0.22, clearcoat: 1, clearcoatRough: 0.06 }), 2);
    // joint collar
    L.lathe(C, [[0.0110, 0.72], [0.0111, 0.722], [0.0111, 0.741], [0.0108, 0.745]], silver, 0, 0, 0, { seg });
    L.cyl(C, 0.01115, 0.01115, 0.002, ebonyBand, 0, 0.731, 0, { seg });
    // maple shaft (glossy), ferrule, chalked blue tip
    const maple = grainTex('b_maple', 128, 1024, { base: '#d9bb88', dark: '#a8824c', light: '#efdcb4', vertical: true, lines: 90, wave: 0.01, alpha: '50', seed: 6 });
    const shaftPts = []; for (let a = 0.745; a <= 1.4451; a += 0.05) shaftPts.push([CUE.r(Math.min(a, 1.445)), Math.min(a, 1.445)]);
    L.lathe(C, shaftPts, L.mat({ c: '#ffffff', map: maple, rough: 0.3, clearcoat: 0.8, clearcoatRough: 0.15 }), 0, 0, 0, { seg });
    L.cyl(C, 0.00662, 0.00662, 0.017, ivory, 0, 1.4535, 0, { seg });
    const tipM = L.mat({ c: '#3f6db0', rough: 1, bump: L.noiseTex('b_chalknoise', 64, 128, 120, 0.5), bumpScale: 0.0004 });
    L.lathe(C, [[0.0064, 1.462], [0.0064, 1.4665], [0.0056, 1.4688], [0.0040, 1.4700], [0, 1.4705]], tipM, 0, 0, 0, { seg });

    // ---- hardware
    const blackM = L.mat({ c: '#1a1a1a', rough: 0.5, metal: 0.3 });
    const zinc = L.mat({ c: '#b4b4b0', rough: 0.35, metal: 1 });
    // upper C-clip on the shaft
    const aC = 1.0, rC = CUE.r(aC);
    L.rbox(C, 0.024, 0.06, 0.006, 0.002, blackM, 0, aC, -zc + 0.003);
    L.rbox(C, 0.016, 0.016, zc - rC - 0.006, 0.002, blackM, 0, aC, -zc + 0.006 + (zc - rC - 0.006) / 2);
    const gap = 1.25, clipM = L.mat({ c: '#1a1a1a', rough: 0.45, metal: 0.3, side: THREE.DoubleSide });
    for (const rr of [rC + 0.0006, rC + 0.0024]) L.mesh(C, new THREE.CylinderGeometry(rr, rr, 0.016, 28, 1, true, gap / 2, TAU - gap), clipM, 0, aC, 0);
    for (const sd of [-1, 1]) { const a = sd * gap / 2; L.cyl(C, 0.0016, 0.0016, 0.016, clipM, Math.sin(a) * (rC + 0.0019), aC, Math.cos(a) * (rC + 0.0019), { seg: 10 }); }
    L.torus(C, rC + 0.0015, 0.0009, clipM, 0, aC + 0.008, 0, { rx: PI / 2, ts: 32, rs: 6, arc: TAU - gap }).rotation.set(PI / 2, 0, PI / 2 + gap / 2);
    screw(C, 0, aC + 0.022, -zc + 0.006, 0.0032, zinc); screw(C, 0, aC - 0.022, -zc + 0.006, 0.0032, zinc);
    // lower holder: a small wall ledge with a rubber cup for the butt, and a cube of chalk
    const ys = yb - 0.0045, lx = xb + lean * 0.02;
    L.rbox(g, 0.10, 0.045, 0.006, 0.002, blackM, lx, ys - 0.012, 0.003);
    L.rbox(g, 0.10, 0.010, 0.064, 0.003, blackM, lx, ys - 0.005, 0.038);
    screw(g, lx - 0.04, ys - 0.022, 0.006, 0.0032, zinc); screw(g, lx + 0.04, ys - 0.022, 0.006, 0.0032, zinc);
    const cupM = L.mat({ c: '#151515', rough: 0.8, side: THREE.DoubleSide });
    L.cyl(C, 0.0175, 0.0175, 0.022, cupM, 0, 0.007, 0, { seg: 32, open: true });
    L.torus(C, 0.0175, 0.0018, cupM, 0, 0.018, 0, { rx: PI / 2, ts: 32 });
    const wrap = L.textTex('b_chalkwrap', 256, 256, '#2d5da6', (q, W, H) => { q.fillStyle = '#f4f1e8'; q.fillRect(0, H * 0.34, W, H * 0.32); q.fillStyle = '#1d3f78'; q.font = 'bold 54px sans-serif'; q.textAlign = 'center'; q.fillText('CHALK', W / 2, H * 0.58); q.fillStyle = '#e8c33c'; for (let i = 0; i < 5; i++) q.fillRect(30 + i * 45, H * 0.16, 16, 16); });
    const ch = L.group(g, xb + lean * 0.048, ys + 0.011, 0.04, 0.35);
    L.rbox(ch, 0.022, 0.022, 0.022, 0.0015, L.mat({ c: '#ffffff', map: wrap, rough: 0.7 }), 0, 0, 0);
    const chalkTop = L.canvasTex('b_chalktop', 128, 128, (q, W, H) => { q.fillStyle = '#4877be'; q.fillRect(0, 0, W, H); const gr = q.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.36); gr.addColorStop(0, '#24467f'); gr.addColorStop(1, 'rgba(36,70,127,0)'); q.fillStyle = gr; q.fillRect(0, 0, W, H); });
    L.plane(ch, 0.0195, 0.0195, L.mat({ c: '#ffffff', map: chalkTop, rough: 1 }), 0, 0.01105, 0, { rx: -PI / 2 });

    g.userData.focus = { x: 0, y: 1.85, z: 0.04, r: 0.78 };
    return g;
  }

  // ================================================================ 3. GUITAR
  function guitar() {
    const g = new THREE.Group();
    // body outline (right half, tail y=0 to neck y=0.513), dreadnought proportions
    const half = [[0, 0], [0.06, 0.003], [0.115, 0.014], [0.158, 0.036], [0.186, 0.068], [0.199, 0.108], [0.2005, 0.15], [0.193, 0.19], [0.173, 0.232], [0.147, 0.268], [0.127, 0.298], [0.1225, 0.322], [0.128, 0.35], [0.139, 0.385], [0.1448, 0.42], [0.1435, 0.458], [0.132, 0.488], [0.105, 0.506], [0.055, 0.5115], [0, 0.513]];
    const loop = []; for (let i = half.length - 1; i >= 1; i--) loop.push(new THREE.Vector2(-half[i][0], half[i][1])); for (let i = 0; i < half.length - 1; i++) loop.push(new THREE.Vector2(half[i][0], half[i][1]));
    const curve = new THREE.SplineCurve(loop.concat([loop[0].clone()]));
    const OUT = curve.getSpacedPoints(240); OUT.pop();
    const HOLE = { x: 0, y: 0.37, r: 0.0505 };
    const mkShape = (hole) => { const s = new THREE.Shape(OUT); if (hole) { const h = new THREE.Path(); for (let k = 0; k <= 72; k++) { const a = -k / 72 * TAU; k ? h.lineTo(HOLE.x + Math.cos(a) * HOLE.r, HOLE.y + Math.sin(a) * HOLE.r) : h.moveTo(HOLE.x + HOLE.r, HOLE.y); } s.holes.push(h); } return s; };

    // materials
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

    // spruce top texture, mapped in shape coords: x in [-0.21,0.21], y in [0,0.525]
    const topTex = L.canvasTex('b_sprucetop', 1024, 1280, (q, W, H) => {
      const X = x => (x / 0.42 + 0.5) * W, Y = y => (1 - y / 0.525) * H, S = W / 0.42;
      q.fillStyle = '#d7ad72'; q.fillRect(0, 0, W, H);
      const r = L.rnd(17);
      const gr = q.createRadialGradient(X(0), Y(0.2), 30, X(0), Y(0.25), W * 0.7); gr.addColorStop(0, 'rgba(240,200,140,0.25)'); gr.addColorStop(1, 'rgba(150,95,40,0.25)'); q.fillStyle = gr; q.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 2 + r() * 5) { q.strokeStyle = 'rgba(140,90,40,' + (0.15 + r() * 0.3) + ')'; q.lineWidth = 0.8 + r() * 1.8; q.beginPath(); q.moveTo(x, 0); q.lineTo(x + (r() - 0.5) * 6, H); q.stroke(); }
      for (let k = 0; k < 900; k++) { q.fillStyle = 'rgba(255,235,200,0.10)'; q.fillRect(r() * W, r() * H, 6 + r() * 20, 1.5); } // silking
      // rosette
      const cx = X(HOLE.x), cy = Y(HOLE.y), rr = m => m * S;
      const ring = (r0, r1, col) => { q.beginPath(); q.arc(cx, cy, rr(r1), 0, TAU); q.arc(cx, cy, rr(r0), 0, TAU, true); q.fillStyle = col; q.fill(); };
      ring(0.0505, 0.0525, '#111'); ring(0.0525, 0.0532, '#eee'); ring(0.0532, 0.0545, '#111');
      for (let k = 0; k < 220; k++) { const a = k / 220 * TAU; q.save(); q.translate(cx + Math.cos(a) * rr(0.0553), cy + Math.sin(a) * rr(0.0553)); q.rotate(a + (k % 2 ? 0.7 : -0.7)); q.fillStyle = k % 2 ? '#1a1a1a' : '#f2eee4'; q.fillRect(-1.2, -rr(0.0008) * 2, 2.4, rr(0.0016) * 2); q.restore(); }
      ring(0.0562, 0.0575, '#111'); ring(0.0575, 0.0582, '#eee'); ring(0.0582, 0.0595, '#111'); ring(0.0615, 0.0622, '#111');
      // purfling + binding near the edge
      q.beginPath(); OUT.forEach((p, i) => i ? q.lineTo(X(p.x), Y(p.y)) : q.moveTo(X(p.x), Y(p.y))); q.closePath();
      q.strokeStyle = '#f0ebe0'; q.lineWidth = rr(0.0042) * 2; q.stroke();
      q.strokeStyle = '#141414'; q.lineWidth = rr(0.0033) * 2; q.stroke();
    }, true, 1 / 0.42, 1 / 0.525);
    topTex.offset.set(0.5, 0);
    const topM = L.mat({ c: '#ffffff', map: topTex, rough: 0.22, clearcoat: 1, clearcoatRough: 0.05 });

    const G = L.group(g); // the guitar itself, tail at local origin, back on z=0
    // ---- body
    const bodyGeo = new THREE.ExtrudeGeometry(mkShape(true), { depth: 0.092, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 12 });
    bodyGeo.translate(0, 0, 0.004);
    { // the sound-hole wall is the last run of side faces: give it its own dark material
      const pos = bodyGeo.attributes.position, g1 = bodyGeo.groups[1], end = g1.start + g1.count; let k = end;
      for (let i = g1.start; i < end; i += 3) if (Math.hypot(pos.getX(i) - HOLE.x, pos.getY(i) - HOLE.y) < HOLE.r + 0.002) { k = i; break; }
      g1.count = k - g1.start; bodyGeo.addGroup(k, end - k, 2);
    }
    const body = L.mesh(G, bodyGeo, [backM, sideM, L.mat({ c: '#2a1c10', rough: 0.9, env: 0.15 })], 0, 0, 0);
    const top = L.mesh(G, new THREE.ShapeGeometry(mkShape(true)), topM, 0, 0, 0.1002);
    const bpts = OUT.map(p => { const n = Math.hypot(p.x, p.y - 0.25) || 1; return p; });
    const bind3 = (z) => new THREE.CatmullRomCurve3(OUT.map((p, i) => { const a = OUT[(i + OUT.length - 1) % OUT.length], b = OUT[(i + 1) % OUT.length]; const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty); return V3(p.x + ty / l * 0.0016, p.y - tx / l * 0.0016, z); }), true);
    L.mesh(G, new THREE.TubeGeometry(bind3(0.0982), 480, 0.0034, 8, true), binding, 0, 0, 0);
    L.mesh(G, new THREE.TubeGeometry(bind3(0.0018), 480, 0.0034, 8, true), binding, 0, 0, 0);
    // dark interior through the sound hole (with the maker's label just visible)
    const inner = L.mat({ c: '#140b06', rough: 0.95, env: 0.08, side: THREE.BackSide });
    L.cyl(G, 0.0468, 0.0468, 0.088, inner, HOLE.x, HOLE.y, 0.0555, { rx: PI / 2, open: true, seg: 48 });
    const label = L.canvasTex('b_label', 256, 256, (q, W, H) => { q.fillStyle = '#1c120b'; q.fillRect(0, 0, W, H); q.fillStyle = '#4a2f1a'; q.fillRect(0, H * 0.42, W, H * 0.16); q.fillStyle = '#7a6a50'; q.fillRect(W * 0.28, H * 0.05, W * 0.44, H * 0.3); q.fillStyle = '#3a3020'; q.font = '20px serif'; q.textAlign = 'center'; q.fillText('No. 1124', W / 2, H * 0.22); });
    L.mesh(G, new THREE.CircleGeometry(0.047, 40), L.mat({ c: '#6a6a6a', map: label, rough: 1, env: 0.08 }), HOLE.x, HOLE.y, 0.0115);
    // pickguard (tortoiseshell) hugging the rosette on the treble side
    const pgS = new THREE.Shape(); const a0 = -62 * PI / 180, a1 = 48 * PI / 180, pr = 0.0655;
    pgS.moveTo(HOLE.x + Math.cos(a0) * pr, HOLE.y + Math.sin(a0) * pr);
    pgS.absarc(HOLE.x, HOLE.y, pr, a0, a1, false);
    pgS.quadraticCurveTo(0.068, 0.448, 0.092, 0.441);
    pgS.bezierCurveTo(0.114, 0.433, 0.117, 0.365, 0.106, 0.318);
    pgS.bezierCurveTo(0.096, 0.276, 0.058, 0.268, HOLE.x + Math.cos(a0) * pr, HOLE.y + Math.sin(a0) * pr);
    const tort = L.canvasTex('b_tort', 512, 512, (q, W, H) => { q.fillStyle = '#2a1006'; q.fillRect(0, 0, W, H); const r = L.rnd(23); q.filter = 'blur(3px)'; for (let k = 0; k < 420; k++) { q.fillStyle = ['rgba(150,70,20,0.45)', 'rgba(190,105,40,0.3)', 'rgba(10,4,2,0.55)', 'rgba(90,30,10,0.5)'][k % 4]; q.beginPath(); q.ellipse(r() * W, r() * H, 4 + r() * 18, 2 + r() * 7, 0.5 + (r() - 0.5) * 0.6, 0, TAU); q.fill(); } q.filter = 'none'; }, true, 9, 9);
    L.mesh(G, new THREE.ShapeGeometry(pgS, 24), L.mat({ c: '#ffffff', map: tort, rough: 0.18, clearcoat: 1 }), 0, 0, 0.1007);
    // bridge, saddle, pins
    const yS = 0.225;
    const bridgeM = L.mat({ c: '#ffffff', map: grainTex('b_bridgewood', 256, 128, { base: '#24120a', dark: '#0d0603', light: '#4a2615', lines: 50, seed: 15 }), rough: 0.45 });
    L.rbox(G, 0.115, 0.03, 0.009, 0.0035, bridgeM, 0, yS - 0.008, 0.1002 + 0.0045);
    for (const sx of [-1, 1]) { const w = L.rbox(G, 0.034, 0.024, 0.006, 0.003, bridgeM, sx * 0.06, yS - 0.008, 0.1002 + 0.003); w.rotation.z = sx * 0.04; }
    const sad = L.rbox(G, 0.074, 0.0028, 0.006, 0.001, bone, 0, yS, 0.1092); sad.rotation.z = -0.05;
    const pinM = L.mat({ c: '#ece4d0', rough: 0.3 }), dotM = L.mat({ c: '#1a1a1a', rough: 0.4 });
    const sx0 = -0.0272, sdx = 0.01088;
    const pinY = i => yS - 0.0135 - Math.abs(i - 2.5) * 0.0006;
    for (let i = 0; i < 6; i++) { const x = (sx0 + i * sdx) * 0.98; L.lathe(G, [[0, 0], [0.0029, 0], [0.0028, 0.0012], [0.0018, 0.0022], [0, 0.0025]], pinM, x, pinY(i), 0.1092, { rx: PI / 2, seg: 12 }); L.cyl(G, 0.0007, 0.0007, 0.0004, dotM, x, pinY(i), 0.1117, { rx: PI / 2, seg: 8 }); }
    // ---- neck
    const yN = 0.513 + 0.645 * (1 - Math.pow(2, -14 / 12)), SCALE = 0.645;
    const wN = y => 0.044 + (yN - y) * 0.0322;
    const neckGeo = gridGeo(18, 46, (i, j) => {
      const y = lerp(0.506, yN + 0.012, j / 46), a = i / 18 * PI;
      let d = 0.021 + 0.0035 * (1 - clamp((y - 0.513) / (yN - 0.513), 0, 1));
      const heel = sstep(0.585, 0.508, y); d = Math.max(d, 0.024 + 0.074 * heel);
      if (y > yN - 0.004) d = lerp(d, 0.017, sstep(yN - 0.004, yN + 0.012, y));
      const w = wN(Math.max(y, 0.513)) * (1 - 0.12 * heel * Math.sin(a));
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = (w / 2) * Math.sign(ca) * Math.pow(Math.abs(ca), 0.85), z = 0.1001 - d * Math.pow(sa, 0.75 - 0.35 * heel);
      return [x, y, z, a * 0.02, y];
    });
    L.mesh(G, neckGeo, neckM, 0, 0, 0);
    // heel cap and strap button
    const ebony = L.mat({ c: '#121010', rough: 0.3, clearcoat: 0.8 });
    L.cyl(G, 0.005, 0.0045, 0.006, ebony, 0, -0.006, 0.05, { seg: 16 });
    L.sph(G, 0.005, ebony, 0, -0.0095, 0.05, { ws: 12, hs: 8 });
    // fretboard, frets, inlays, nut
    const fbS = new THREE.Shape(); const yE = 0.428;
    fbS.moveTo(-wN(yE) / 2, yE); fbS.lineTo(wN(yE) / 2, yE); fbS.lineTo(wN(yN) / 2, yN); fbS.lineTo(-wN(yN) / 2, yN); fbS.closePath();
    const fbG = new THREE.ExtrudeGeometry(fbS, { depth: 0.0052, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1 }); fbG.translate(0, 0, 0.1006);
    L.mesh(G, fbG, fbM, 0, 0, 0);
    const fbTop = 0.1062;
    const fretY = n => yN - SCALE * (1 - Math.pow(2, -n / 12));
    for (let n = 1; n <= 20; n++) { const y = fretY(n); L.cyl(G, 0.0011, 0.0011, wN(y) - 0.0004, nickel, 0, y, fbTop, { rz: PI / 2, seg: 6 }); }
    const pearl = L.mat({ c: '#f4f1ea', rough: 0.25, clearcoat: 1 });
    for (const n of [3, 5, 7, 9, 12, 15, 17]) { const y = (fretY(n) + fretY(n - 1)) / 2; for (const dx of (n === 12 ? [-0.009, 0.009] : [0])) L.cyl(G, 0.003, 0.003, 0.0004, pearl, dx, y, fbTop - 0.00005, { rx: PI / 2, seg: 16 }); }
    L.rbox(G, wN(yN) + 0.0004, 0.005, 0.0086, 0.0012, bone, 0, yN + 0.0025, 0.1002 + 0.0043);
    // ---- headstock, angled back 14°
    const ha = -14 * PI / 180, HO = { y: yN + 0.005, z: 0.1 };
    const hsPt = (x, y, z) => [x, HO.y + y * Math.cos(ha) - z * Math.sin(ha), HO.z + y * Math.sin(ha) + z * Math.cos(ha)];
    const HS = L.group(G, 0, HO.y, HO.z); HS.rotation.x = ha;
    const hw = y => 0.027 + 0.0105 * (y / 0.165);
    const hsS = new THREE.Shape(); hsS.moveTo(-0.027, 0); hsS.lineTo(0.027, 0); hsS.lineTo(0.0375, 0.160); hsS.quadraticCurveTo(0.038, 0.168, 0.030, 0.169); hsS.quadraticCurveTo(0, 0.175, -0.030, 0.169); hsS.quadraticCurveTo(-0.038, 0.168, -0.0375, 0.160); hsS.closePath();
    const hsG = new THREE.ExtrudeGeometry(hsS, { depth: 0.0115, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 8 }); hsG.translate(0, 0, -0.0135);
    const veneer = L.mat({ c: '#0d0c0b', rough: 0.15, clearcoat: 1, clearcoatRough: 0.04 });
    L.mesh(HS, hsG, [veneer, neckM], 0, 0, 0);
    const posts = [0.035, 0.08, 0.125];
    const blackHw = L.mat({ c: '#2a2a2a', rough: 0.4, metal: 0.8 });
    for (const sd of [-1, 1]) for (const yk of posts) {
      const xp = sd * 0.0205;
      L.cyl(HS, 0.0052, 0.0052, 0.0022, nickel, xp, yk, 0.0008, { rx: PI / 2, seg: 16 });
      L.cyl(HS, 0.0029, 0.0029, 0.013, nickel, xp, yk, 0.0065, { rx: PI / 2, seg: 12 });
      L.cyl(HS, 0.0039, 0.0039, 0.0035, bronze, xp, yk, 0.0055, { rx: PI / 2, seg: 12 }); // string winding
      const xh = sd * (hw(yk) - 0.0095);
      L.rbox(HS, 0.017, 0.022, 0.010, 0.002, nickel, xh, yk, -0.0145 - 0.0045);
      L.cyl(HS, 0.0018, 0.0018, 0.016, nickel, sd * (hw(yk) + 0.006), yk, -0.0185, { rz: PI / 2, seg: 8 });
      const btn = L.sph(HS, 1, nickel, sd * (hw(yk) + 0.019), yk, -0.0185, { ws: 18, hs: 12 }); btn.scale.set(0.0075, 0.0105, 0.0032);
      screw(HS, xh + sd * 0.0, yk + 0.013, -0.024, 0.0011, nickel).rotation.y = PI;
    }
    // ---- strings
    for (let i = 0; i < 6; i++) {
      const wound = i < 4, r = [0.00062, 0.00055, 0.00048, 0.0004, 0.0003, 0.00026][i] + 0.0001, m = wound ? bronze : steel;
      const xs = sx0 + i * sdx, xn = -0.0178 + i * 0.00712, sd = i < 3 ? -1 : 1, k = i < 3 ? i : 5 - i;
      const pPin = [xs * 0.98, pinY(i) + 0.0015, 0.1112], pSad = [xs, yS + 0.0003 * (i - 2.5), 0.1123 + r], pNut = [xn, yN + 0.0025, 0.1088 + r];
      const pPost = hsPt(sd * (0.0205 - 0.0032), posts[k], 0.006);
      rod(G, pPin, pSad, r, m, 5); rod(G, pSad, pNut, r, m, 5); rod(G, pNut, pPost, r, m, 5);
    }
    // ---- position: hung by the headstock on a wall hanger, leaning 3° so the lower bout touches the wall
    const tilt = 3 * PI / 180, yP = 2.17, rub = 0.0055;
    const pc = hsPt(0, 0, -0.007);
    const Y0 = yP + rub + 0.0008 - (pc[1] * Math.cos(tilt) - pc[2] * Math.sin(tilt));
    G.position.set(0, Y0, 0.0035); G.rotation.x = tilt;
    const zN = 0.0035 + pc[1] * Math.sin(tilt) + pc[2] * Math.cos(tilt);
    // hanger: walnut base plate, steel arm, rubber-sleeved yoke
    const walnut = L.mat({ c: '#ffffff', map: grainTex('b_walnut', 256, 512, { base: '#4b2f1e', dark: '#24150c', light: '#7a5236', vertical: true, lines: 60, seed: 19 }), rough: 0.45, clearcoat: 0.5 });
    L.rbox(g, 0.06, 0.11, 0.018, 0.004, walnut, 0, yP + 0.01, 0.009);
    const zinc = L.mat({ c: '#b8b7b2', rough: 0.35, metal: 1 });
    screw(g, 0, yP + 0.05, 0.018, 0.0035, zinc); screw(g, 0, yP - 0.03, 0.018, 0.0035, zinc);
    const armM = L.mat({ c: '#1c1c1c', rough: 0.45, metal: 0.7 }), rubM = L.mat({ c: '#121212', rough: 0.8 });
    L.cyl(g, 0.009, 0.009, 0.006, armM, 0, yP, 0.021, { rx: PI / 2, seg: 20 });
    rod(g, [0, yP, 0.018], [0, yP, zN - 0.05], 0.0045, armM, 12);
    L.sph(g, 0.0065, armM, 0, yP, zN - 0.05, { ws: 12, hs: 8 });
    for (const sd of [-1, 1]) L.tube(g, [[0, yP, zN - 0.05], [sd * 0.018, yP, zN - 0.043], [sd * 0.029, yP, zN - 0.03], [sd * 0.029, yP, zN + 0.01], [sd * 0.029, yP + 0.004, zN + 0.03], [sd * 0.029, yP + 0.014, zN + 0.038]], rub, rubM, { segs: 40, radial: 10 });
    g.userData.focus = { x: 0, y: Y0 + 0.5, z: 0.1, r: 0.6 };
    g.userData.hangerY = yP;
    return g;
  }

  // ================================================================ 4. WALL SHELF + FOLDED CLOTHES
  function shelf() {
    const g = new THREE.Group();
    const oak = grainTex('b_whiteoak', 2048, 512, { base: '#bf9f74', dark: '#7d5c38', light: '#dcc29c', lines: 260, wave: 0.03, lw: 3, alpha: '60', pores: 3000, flecks: 400, seed: 31, bands: 22 });
    const oakM = L.mat({ c: '#ffffff', map: oak, rough: 0.5, clearcoat: 0.25, clearcoatRough: 0.4 });
    const board = L.rbox(g, 1.60, 0.035, 0.30, 0.004, oakM, 0, 0.95 - 0.0175, 0.15, { seg: 2 });
    const brM = L.mat({ c: '#1b1b1b', rough: 0.5, metal: 0.5 }), zinc = L.mat({ c: '#2b2b2b', rough: 0.4, metal: 0.8 });
    for (const x of [-0.56, 0.56]) {
      L.rbox(g, 0.025, 0.13, 0.004, 0.001, brM, x, 0.915 - 0.065, 0.002);
      L.rbox(g, 0.025, 0.004, 0.23, 0.001, brM, x, 0.913, 0.115);
      L.rbox(g, 0.025, 0.016, 0.004, 0.001, brM, x, 0.905, 0.004); // bend
      screw(g, x, 0.89, 0.004, 0.0035, zinc); screw(g, x, 0.815, 0.004, 0.0035, zinc);
    }
    // ---- garments
    const R = L.rnd(77);
    const mats = {};
    const fab = (key) => {
      if (mats[key]) return mats[key];
      let m;
      switch (key) {
        case 'heather': { const t = heatherTex('grey', '#9a9a98', '#e8e8e6', 1 / 0.06, 1 / 0.06); m = L.mat({ c: '#ffffff', map: t, bump: t, bumpScale: 0.001, rough: 0.95 }); break; }
        case 'heatherD': { const t = heatherTex('dgrey', '#5c5d60', '#a8a9ab', 1 / 0.06, 1 / 0.06); m = L.mat({ c: '#ffffff', map: t, bump: t, bumpScale: 0.001, rough: 0.95 }); break; }
        case 'black': m = plainFabric('#1d1d1f'); break;
        case 'white': m = plainFabric('#eeedea', 0.9); break;
        case 'navy': m = plainFabric('#1f2a44'); break;
        case 'olive': m = plainFabric('#5b5e3c'); break;
        case 'maroon': m = plainFabric('#5e1f26'); break;
        case 'denimD': case 'denimM': case 'denimL': case 'denimB': {
          const base = { denimD: '#1f3150', denimM: '#3b5a85', denimL: '#6e8db3', denimB: '#25262a' }[key];
          const t = denimTex(key, base, 25, 25); m = L.mat({ c: '#ffffff', map: t, bump: t, bumpScale: 0.0008, rough: 0.9 }); m.vertexColors = true; break;
        }
        case 'knitO': case 'knitC': case 'knitN': {
          const c = { knitO: '#6b6a45', knitC: '#e6dccb', knitN: '#2b3550' }[key], t = knitTex(11, 11);
          m = L.mat({ c: c, map: t, bump: t, bumpScale: 0.0018, rough: 0.97 }); break;
        }
      }
      return (mats[key] = m);
    };
    const shade = (mesh, lo) => { // lighter, worn fold edges for denim
      const geo = mesh.geometry, nr = geo.attributes.normal, n = nr.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const v = lerp(lo, 1.0, 1 - Math.abs(nr.getY(i))); col[3 * i] = col[3 * i + 1] = col[3 * i + 2] = v; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    };
    const stitchTex = L.canvasTex('b_stitch', 256, 16, (q, W, H) => { q.clearRect(0, 0, W, H); q.fillStyle = '#ffffff'; for (let x = 0; x < W; x += 16) q.fillRect(x + 2, 5, 10, 6); }, false, 1, 1);
    const stitchM = L.mat({ c: '#c99a3e', alphaMap: stitchTex, rough: 0.8, side: THREE.DoubleSide });
    const collarRib = L.canvasTex('b_rib', 64, 64, (q, W, H) => { q.fillStyle = '#777'; q.fillRect(0, 0, W, H); for (let x = 0; x < W; x += 4) { q.fillStyle = '#aaa'; q.fillRect(x, 0, 2, H); } }, false, 1, 1);

    const garment = (parent, type, key, w, d, t, x, y, z, ry, top) => {
      const gg = L.group(parent, x, y, z, ry);
      const m = fab(key);
      const bulge = type === 'tee' ? 0.05 : type === 'jeans' ? 0.06 : 0.09;
      // a folded garment is two folded layers: the lower one a touch wider, the upper one set back a few mm
      const t1 = t * 0.54, t2 = t * 0.5, sd = 50 + R() * 900;
      const amp = type === 'jeans' ? 0.0012 : 0.0028;
      const s1 = soft(gg, w, t1, d, t1 * 0.48, m, 0, t1 / 2, 0, { seg: 3, amp, bulge, seed: sd });
      const s2 = soft(gg, w * (0.965 + R() * 0.02), t2, d * 0.985, t2 * 0.48, m, (R() - 0.5) * 0.008, t1 * 0.96 + t2 / 2, -0.003 - R() * 0.004, { seg: 3, amp, bulge, seed: sd + 7 });
      const H = t1 * 0.96 + t2 * (1 + bulge * 0.5);
      if (type === 'jeans') {
        shade(s1, 0.72); shade(s2, 0.72);
        L.plane(gg, w * 0.9, 0.0035, stitchM, 0, t1 * 0.62, d / 2 + 0.0002, { rx: -0.35 });
        L.plane(gg, w * 0.86, 0.0035, stitchM, 0, t1 * 0.96 + t2 * 0.62, d * 0.4925 - 0.003, { rx: -0.35 });
        if (top) { // back pocket stitching on the top fold, and a copper rivet
          const pk = L.group(gg, -0.06, H + 0.0006, -0.02);
          const pts = [[-0.07, -0.07], [0.07, -0.07], [0.07, 0.05], [0, 0.075], [-0.07, 0.05]];
          for (let k = 0; k < 5; k++) { const a = pts[k], b = pts[(k + 1) % 5]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const tt = stitchTex.clone(); tt.needsUpdate = true; tt.repeat.set(len / 0.04, 1); const p = L.plane(pk, len, 0.003, L.mat({ c: '#c99a3e', alphaMap: tt, rough: 0.8 }), (a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2, { rx: -PI / 2 }); p.rotation.order = 'YXZ'; p.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); }
          L.cyl(gg, 0.0035, 0.0035, 0.002, L.mat({ c: '#b08a4a', metal: 1, rough: 0.35 }), w / 2 - 0.03, t1 * 0.62, d / 2 + 0.001, { rx: PI / 2, seg: 12 });
        }
      }
      if (type === 'tee' && top) { // ribbed collar showing at the back of the top tee
        const cm = m.clone(); cm.bumpMap = collarRib; cm.bumpScale = 0.002;
        const col = L.torus(gg, 0.07, 0.005, cm, 0, H - 0.0015, -d / 2 + 0.06, { rx: PI / 2, arc: PI, ts: 24, rs: 8 });
        col.scale.set(1, 0.55, 0.45); col.rotation.z = PI;
      }
      if (type === 'hoodie' && top) { // hood folded flat on top, drawstrings over the front fold
        const hood = pillow(gg, w * 0.52, d * 0.46, 0.014, 0.003, m, 9); hood.position.set(0, H + 0.002, -d * 0.18); hood.rotation.y = 0.04;
        const cord = L.mat({ c: '#e9e6df', rough: 0.85 }), aglet = L.mat({ c: '#c0c0c0', metal: 1, rough: 0.3 });
        const rr = t2 * 0.48, zf = d * 0.4925 - 0.003, yc = t1 * 0.96 + t2 / 2;
        for (const sx of [-1, 1]) {
          const x0 = sx * 0.028, pts = [[x0, H + 0.013, -d * 0.02], [x0 + sx * 0.003, H + 0.004, d * 0.2], [x0 + sx * 0.008, H + 0.0025, zf - rr], [x0 + sx * 0.011, yc + rr * 0.7 + 0.002, zf - rr * 0.3 + 0.002], [x0 + sx * 0.013, yc, zf + 0.0035], [x0 + sx * 0.012, yc - 0.03, zf + 0.004], [x0 + sx * 0.011, yc - 0.065 - sx * 0.008, d / 2 + 0.006]];
          L.tube(gg, pts, 0.0024, cord, { segs: 40, radial: 6 });
          const e = pts[6]; L.cyl(gg, 0.0027, 0.0027, 0.016, aglet, e[0], e[1] - 0.008, e[2], { seg: 8 });
        }
      }
      return H * 0.95; // stacked height (a little compression)
    };
    const stacks = [
      { type: 'tee', w: 0.29, d: 0.22, items: [['black', 0.020], ['white', 0.022], ['navy', 0.021], ['olive', 0.022], ['heatherD', 0.020], ['heather', 0.023]] },
      { type: 'hoodie', w: 0.33, d: 0.25, items: [['black', 0.052], ['heather', 0.055], ['maroon', 0.056]] },
      { type: 'jeans', w: 0.30, d: 0.235, items: [['denimD', 0.036], ['denimB', 0.034], ['denimM', 0.037], ['denimL', 0.035]] },
      { type: 'sweater', w: 0.31, d: 0.24, items: [['knitN', 0.046], ['knitC', 0.048], ['knitO', 0.05]] },
      { type: 'tee', w: 0.28, d: 0.22, messy: true, items: [['white', 0.021], ['maroon', 0.022], ['black', 0.02], ['heather', 0.022], ['navy', 0.021]] },
    ];
    const gap = 0.016, total = stacks.reduce((a, s) => a + s.w, 0) + gap * (stacks.length - 1);
    let x = -total / 2;
    stacks.forEach((st, si) => {
      const cx = x + st.w / 2; x += st.w + gap;
      let y = 0.95;
      st.items.forEach((it, k) => {
        const top = k === st.items.length - 1;
        const jit = st.messy ? 1.9 : 0.35;
        const dx = (R() - 0.5) * 0.02 * jit * 2, dz = (R() - 0.5) * 0.02 * jit, ry = (R() - 0.5) * (st.messy ? 0.22 : 0.05);
        const w = st.w * (0.97 + R() * 0.05), d = st.d * (0.96 + R() * 0.06);
        y += garment(g, st.type, it[0], w, d, it[1], cx + dx, y, 0.142 + dz, ry, top);
      });
    });
    g.userData.focus = { x: 0, y: 1.06, z: 0.15, r: 0.85 };
    return g;
  }

  // ================================================================ 5. MIRROR
  function mirror() {
    const g = new THREE.Group();
    const W = 0.45, H = 1.40, F = 0.025, y0 = 0.35, yc = y0 + H / 2;
    const frameM = L.mat({ c: '#161616', rough: 0.42, metal: 0.75 });
    const ring = L.roundRectShape(W - 0.003, H - 0.003, 0.004);
    const hole = L.roundRectShape(W - 2 * F + 0.003, H - 2 * F + 0.003, 0.0015); ring.holes.push(hole);
    L.extrude(g, ring, 0.017, frameM, 0, yc, 0.0115, { bevelT: 0.0015, bevelS: 0.0015, bevelSeg: 2, curve: 6 });
    L.rbox(g, W - 0.01, H - 0.01, 0.008, 0.002, L.mat({ c: '#3a3027', rough: 0.9 }), 0, yc, 0.006); // backing board
    const gw = W - 2 * F + 0.004, gh = H - 2 * F + 0.004, gz = 0.013;
    const glass = L.plane(g, gw, gh, L.mat({ c: '#2c3238', rough: 0.06, metal: 0.9, name: 'mirrorGlass' }), 0, yc, gz);
    glass.name = 'mirrorGlass'; glass.castShadow = false;
    g.userData.glass = { w: gw, h: gh, x: 0, y: yc, z: gz };
    // lived-in: a photo-booth strip, a ticket stub, a sticky note
    const strip = L.canvasTex('b_photostrip', 160, 520, (q, Wd, Hd) => {
      q.fillStyle = '#f7f5f0'; q.fillRect(0, 0, Wd, Hd); const r = L.rnd(44);
      const skins = ['#d9a888', '#8d5a3b', '#e3b896', '#b07a55'], hair = ['#2a1a10', '#111', '#5a3a20', '#1e1410'];
      for (let k = 0; k < 4; k++) {
        const x = 12, y = 12 + k * 124, w = Wd - 24, h = 112;
        const bg = q.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, ['#7a8fb0', '#b0645a', '#6a9a80', '#c9a25a'][k]); bg.addColorStop(1, '#2a2a30'); q.fillStyle = bg; q.fillRect(x, y, w, h);
        for (let p = 0; p < 2; p++) {
          const fx = x + w * (0.32 + p * 0.38) + (r() - 0.5) * 8, fy = y + h * 0.48 + (r() - 0.5) * 10;
          q.fillStyle = ['#38404a', '#e8e0d0', '#5a2a2a', '#2a3a2a'][(k + p) % 4]; q.beginPath(); q.ellipse(fx, y + h + 8, 30, 40, 0, PI, TAU); q.fill();
          q.fillStyle = skins[(k + p * 2) % 4]; q.beginPath(); q.ellipse(fx, fy, 15, 19, 0, 0, TAU); q.fill();
          q.fillStyle = hair[(k + p) % 4]; q.beginPath(); q.ellipse(fx, fy - 9, 16, 12, 0, PI, TAU); q.fill();
          q.fillStyle = 'rgba(0,0,0,0.5)'; q.fillRect(fx - 7, fy - 2, 4, 3); q.fillRect(fx + 3, fy - 2, 4, 3); q.fillRect(fx - 5, fy + 8, 10, 2);
        }
      }
    });
    const ps = L.plane(g, 0.05, 0.162, L.mat({ c: '#ffffff', map: strip, rough: 0.35, side: THREE.DoubleSide }), -W / 2 + F + 0.012, yc + 0.43, gz + 0.0016, { rz: 0.07 });
    const ticket = L.canvasTex('b_ticket', 400, 180, (q, Wd, Hd) => {
      q.fillStyle = '#efe3c4'; q.fillRect(0, 0, Wd, Hd); q.fillStyle = '#b8462e'; q.fillRect(0, 0, Wd, 34); q.fillRect(0, Hd - 14, Wd, 14);
      q.fillStyle = '#f7efdc'; q.font = 'bold 24px sans-serif'; q.fillText('ADMIT ONE', 16, 26);
      q.fillStyle = '#3a2a1a'; q.font = 'bold 30px serif'; q.fillText('ORPHEUM', 16, 78); q.font = '20px sans-serif'; q.fillText('SAT  OCT 18  8:00 PM', 16, 110); q.fillText('ROW F   SEAT 12', 16, 140);
      q.strokeStyle = '#8a7a5a'; q.setLineDash([4, 5]); q.beginPath(); q.moveTo(300, 0); q.lineTo(300, Hd); q.stroke(); q.save(); q.translate(350, 90); q.rotate(-PI / 2); q.font = '18px monospace'; q.fillText('No 004812', -50, 6); q.restore();
    });
    L.plane(g, 0.105, 0.047, L.mat({ c: '#ffffff', map: ticket, rough: 0.6, side: THREE.DoubleSide }), -W / 2 + F + 0.04, y0 + F + 0.018, gz + 0.0012, { rz: 0.42 });
    const note = L.canvasTex('b_sticky', 256, 256, (q, Wd, Hd) => {
      q.fillStyle = '#f6e27a'; q.fillRect(0, 0, Wd, Hd); const gr = q.createLinearGradient(0, 0, 0, Hd); gr.addColorStop(0, 'rgba(200,170,40,0.25)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, Wd, Hd);
      q.fillStyle = '#1f2a6a'; q.font = 'italic 38px serif'; q.save(); q.rotate(-0.04); q.fillText('dentist', 26, 82); q.fillText('thurs 4:15', 26, 132); q.restore(); q.strokeStyle = '#1f2a6a'; q.lineWidth = 3; q.beginPath(); q.moveTo(30, 160); q.quadraticCurveTo(120, 150, 210, 162); q.stroke();
    });
    const ng = new THREE.PlaneGeometry(0.076, 0.076, 1, 8); const np = ng.attributes.position;
    for (let i = 0; i < np.count; i++) { const v = (0.038 - np.getY(i)) / 0.076; np.setZ(i, v > 0.25 ? Math.pow((v - 0.25) / 0.75, 2) * 0.012 : 0); }
    ng.computeVertexNormals();
    const nm = L.mesh(g, ng, L.mat({ c: '#ffffff', map: note, rough: 0.75, side: THREE.DoubleSide }), W / 2 - F - 0.06, y0 + 0.56, gz + 0.0008, { rz: -0.05 });
    g.userData.focus = { x: 0, y: yc, z: 0.02, r: 0.78 };
    return g;
  }

  // ================================================================ 6. DOOR
  function door() {
    const g = new THREE.Group();
    const OW = 0.90, OH = 2.05, DW = 0.894, DH = 2.035, DB = 0.012, zF = 0.002, T = 0.040;
    const paint = L.mat({ c: '#f1efe9', rough: 0.32, bump: L.noiseTex('b_orangepeel', 256, 128, 50, 2), bumpScale: 0.0003, side: THREE.DoubleSide });
    // jambs + stops (inside the wall opening)
    for (const sx of [-1, 1]) { L.box(g, 0.018, OH + 0.018, 0.14, paint, sx * (OW / 2 + 0.009), (OH + 0.018) / 2, -0.07); L.rbox(g, 0.012, OH, 0.032, 0.002, paint, sx * (OW / 2 - 0.006), OH / 2, -0.056); }
    L.box(g, OW + 0.036, 0.018, 0.14, paint, 0, OH + 0.009, -0.07); L.rbox(g, OW, 0.012, 0.032, 0.002, paint, 0, OH - 0.006, -0.056);
    // ---- the slab: 6-panel, stiles/rails/mullion modelled with raised panels
    const D = L.group(g, 0, DB, 0);
    L.rbox(D, DW, DH, 0.026, 0.002, paint, 0, DH / 2, zF - T + 0.013);
    const fz = zF - 0.007, ft = 0.014;
    const st = 0.112, mul = 0.10, rails = [[0, 0.20], [0.79, 0.97], [1.57, 1.67], [DH - 0.112, DH]];
    for (const sx of [-1, 1]) L.rbox(D, st, DH, ft, 0.003, paint, sx * (DW / 2 - st / 2), DH / 2, fz);
    rails.forEach(r => L.rbox(D, DW - 2 * st + 0.004, r[1] - r[0], ft, 0.003, paint, 0, (r[0] + r[1]) / 2, fz));
    const rows = [[0.20, 0.79], [0.97, 1.57], [1.67, DH - 0.112]];
    rows.forEach(r => L.rbox(D, mul, r[1] - r[0] + 0.004, ft, 0.003, paint, 0, (r[0] + r[1]) / 2, fz));
    const pw = (DW - 2 * st - mul) / 2;
    rows.forEach(r => {
      const ph = r[1] - r[0], cy = (r[0] + r[1]) / 2;
      for (const sx of [-1, 1]) {
        const cx = sx * (mul / 2 + pw / 2), bs = 0.026;
        // raised field with a bevelled margin
        L.extrude(D, L.roundRectShape(pw - 2 * bs - 0.004, ph - 2 * bs - 0.004, 0.002), 0.002, paint, cx, cy, zF - 0.0145, { bevelT: 0.0055, bevelS: bs, bevelSeg: 2, curve: 2 });
        // sticking (moulding) around the inside of the frame
        const mr = L.roundRectShape(pw + 0.002, ph + 0.002, 0.001); mr.holes.push(L.roundRectShape(pw - 0.016, ph - 0.016, 0.001));
        L.extrude(D, mr, 0.004, paint, cx, cy, zF - 0.0095, { bevelT: 0.0025, bevelS: 0.003, bevelSeg: 3, curve: 2 });
      }
    });
    // hinges (left), satin nickel
    const sn = L.mat({ c: '#bdbab2', rough: 0.3, metal: 1 });
    for (const yc of [0.32, 1.07, 1.82]) {
      const hx = -DW / 2 - 0.0015, hz = zF + 0.0035;
      for (let k = 0; k < 5; k++) L.cyl(g, 0.0062, 0.0062, 0.0889 / 5 - 0.0007, sn, hx, yc - 0.0445 + (k + 0.5) * 0.0889 / 5, hz, { seg: 18 });
      for (const s of [-1, 1]) { L.sph(g, 0.0058, sn, hx, yc + s * 0.0455, hz, { ws: 14, hs: 8 }).scale.set(1, 0.55, 1); L.cyl(g, 0.0015, 0.0015, 0.004, sn, hx, yc + s * 0.0495, hz, { seg: 8 }); }
      L.box(g, 0.004, 0.0889, 0.0025, sn, hx + 0.0025, yc, zF - 0.002);
    }
    // lever handle with rosette on the right, latch side
    const hxL = DW / 2 - 0.060, hy = 0.90 + 0.0;
    const H = L.group(g, hxL, hy, zF);
    L.lathe(H, [[0, 0.0105], [0.0105, 0.0105], [0.0275, 0.0095], [0.0305, 0.006], [0.031, 0.0015], [0.0305, 0]], sn, 0, 0, 0, { rx: PI / 2, seg: 40 }).rotation.x = PI / 2;
    L.lathe(H, [[0.0105, 0], [0.0098, 0.02], [0.0094, 0.040], [0.0105, 0.048], [0.0108, 0.052], [0, 0.053]], sn, 0, 0, 0, { seg: 28 }).rotation.x = PI / 2;
    const lev = L.tube(H, [[0.002, 0, 0.050], [-0.04, 0, 0.0525], [-0.085, -0.001, 0.0535], [-0.112, -0.004, 0.052], [-0.124, -0.006, 0.047]], 0.0082, sn, { segs: 40, radial: 14 });
    lev.scale.set(1, 1.08, 0.8); lev.position.z = 0.0105;
    L.sph(H, 0.0082, sn, -0.124, -0.006, 0.047 * 0.8 + 0.0105, { ws: 16, hs: 10 }).scale.set(1, 1.08, 0.8);
    // casing: 70 mm profiled, mitred at the head
    const prof = [[[0, 0], [0, 0.009]], [[0, 0.009], [0.0012, 0.0106], [0.0035, 0.0114], [0.02, 0.0119], [0.04, 0.0124], [0.048, 0.0128], [0.0505, 0.0136], [0.0518, 0.0152], [0.0538, 0.0166], [0.057, 0.0174], [0.063, 0.0175], [0.0668, 0.0167], [0.0692, 0.0152], [0.070, 0.0132]], [[0.070, 0.0132], [0.070, 0]]];
    const casingGeo = (len, mA, mB) => {
      const pos = [], uv = [], idx = [];
      prof.forEach(run => { const base = pos.length / 3; run.forEach(([p, q]) => { const y0 = mA ? -p : 0, y1 = len + (mB ? p : 0); pos.push(p, y0, q, p, y1, q); uv.push(p * 4, y0, p * 4, y1); }); for (let k = 0; k < run.length - 1; k++) { const a = base + 2 * k; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    };
    const rv = 0.003, xi = OW / 2 + rv, yi = OH + rv;
    const cl = L.mesh(g, casingGeo(yi, false, true), paint, -xi, 0, 0); cl.scale.x = -1;
    L.mesh(g, casingGeo(yi, false, true), paint, xi, 0, 0);
    L.mesh(g, casingGeo(2 * xi, true, true), paint, xi, yi, 0, { rz: PI / 2 });
    // floor dome door stop
    L.lathe(g, [[0, 0], [0.022, 0], [0.021, 0.006], [0.016, 0.014], [0.009, 0.019], [0, 0.021]], L.mat({ c: '#b9b6ae', rough: 0.3, metal: 1 }), -DW / 2 + 0.07, 0, 0.72, { seg: 28 });
    L.cyl(g, 0.012, 0.012, 0.006, L.mat({ c: '#222', rough: 0.9 }), -DW / 2 + 0.07, 0.024, 0.72, { seg: 20 });
    // calendar pinned to the door
    const cal = L.canvasTex('b_calendar', 600, 900, (q, Wd, Hd) => {
      q.fillStyle = '#fbfaf6'; q.fillRect(0, 0, Wd, Hd);
      const sk = q.createLinearGradient(0, 30, 0, 420); sk.addColorStop(0, '#8fb3d6'); sk.addColorStop(0.55, '#e9d3b4'); sk.addColorStop(1, '#5c6e74'); q.fillStyle = sk; q.fillRect(24, 30, Wd - 48, 390);
      q.fillStyle = '#4f5d6e'; q.beginPath(); q.moveTo(24, 300); q.lineTo(150, 170); q.lineTo(230, 250); q.lineTo(330, 140); q.lineTo(470, 280); q.lineTo(Wd - 24, 230); q.lineTo(Wd - 24, 420); q.lineTo(24, 420); q.fill();
      q.fillStyle = '#eef2f4'; q.beginPath(); q.moveTo(310, 160); q.lineTo(330, 140); q.lineTo(355, 165); q.lineTo(340, 172); q.fill();
      q.fillStyle = '#2e4a3a'; q.fillRect(24, 340, Wd - 48, 80); q.fillStyle = 'rgba(160,190,210,0.6)'; q.fillRect(24, 372, Wd - 48, 48);
      q.fillStyle = '#9a9a9a'; for (let x = 40; x < Wd - 30; x += 22) { q.beginPath(); q.arc(x, 12, 5, 0, TAU); q.fill(); }
      q.fillStyle = '#222'; q.font = 'bold 40px sans-serif'; q.textAlign = 'center'; q.fillText('NOVEMBER 2026', Wd / 2, 482);
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], cw = (Wd - 48) / 7; q.font = 'bold 20px sans-serif'; days.forEach((d, i) => q.fillText(d, 24 + cw * (i + 0.5), 516));
      q.strokeStyle = '#c8c8c8'; q.lineWidth = 1; q.font = '20px sans-serif'; q.textAlign = 'left';
      for (let k = 0; k < 35; k++) { const col = k % 7, row = Math.floor(k / 7), x = 24 + col * cw, y = 528 + row * 70; q.strokeRect(x, y, cw, 70); const d = k + 1; if (d <= 30) { q.fillStyle = col === 0 ? '#b03030' : '#333'; q.fillText(String(d), x + 6, y + 22); } }
      q.strokeStyle = '#c0392b'; q.lineWidth = 3; q.beginPath(); q.arc(24 + 3 * cw + cw / 2, 528 + 2 * 70 + 38, 28, 0, TAU); q.stroke();
      q.fillStyle = '#1f3a8a'; q.font = 'italic 17px serif'; q.fillText('essay due', 24 + 3 * cw + 4, 528 + 2 * 70 + 62); q.fillText('mom bday', 24 + 6 * cw + 2, 528 + 3 * 70 + 50);
    });
    const cg = new THREE.PlaneGeometry(0.28, 0.42, 1, 10); const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) { const v = (0.21 - cp.getY(i)) / 0.42; cp.setZ(i, 0.0012 + Math.pow(v, 3) * 0.006); }
    cg.computeVertexNormals();
    L.mesh(g, cg, L.mat({ c: '#ffffff', map: cal, rough: 0.6, side: THREE.DoubleSide }), 0, DB + 1.40, zF + 0.0002);
    L.sph(g, 0.005, L.mat({ c: '#c0392b', rough: 0.3, clearcoat: 1 }), 0, DB + 1.40 + 0.2, zF + 0.009, { ws: 14, hs: 10 });
    L.cyl(g, 0.0035, 0.002, 0.007, L.mat({ c: '#c0392b', rough: 0.3 }), 0, DB + 1.40 + 0.2, zF + 0.0035, { rx: PI / 2, seg: 10 });
    g.userData.focus = { x: 0, y: 1.05, z: 0.02, r: 1.15 };
    return g;
  }

  window.PROPS_B = { bed, cue, guitar, shelf, mirror, door };
})();
