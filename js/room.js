/* My rooms — the bedroom and the kitchen; their light, layout, camera, controls, the slide between them,
   and the kitchen's motion. Each room is its own group with its own lights and reflection probe; only the
   active room is in the scene. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search), DBG = Q.has('dbg'), LITE = Q.has('lite');
  const PA = window.PROPS_A || {}, PB = window.PROPS_B || {}, KIT = window.KIT || {}, POOL = window.POOL || {};
  const GO_LABEL = { kitchen: 'kitchen', pool: 'pool room', campfire: 'campfire' };
  const CAMP = window.CAMP || {};
  const H = 2.7, T = 0.12; // ceiling height, wall thickness

  // ---------- renderer, scene, camera ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  // performance: a capped pixel ratio that steps down by itself if frames run slow; shadows drawn only when something casting them moves
  const PERF = { pr: LITE ? 1 : Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5), frame: 0, slow: 0, fast: 0, shadowFrames: 4, dirtyUntil: 0, camMoved: true };
  renderer.setPixelRatio(PERF.pr);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  if (THREE.RectAreaLightUniformsLib) THREE.RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene(); scene.background = LIB.col('#14110e');
  const camera = new THREE.PerspectiveCamera(62, 1, 0.02, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let neutralEnv = null;
  if (THREE.RoomEnvironment) { neutralEnv = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture; scene.environment = neutralEnv; }

  // light levels (tunable from the address bar while developing)
  const LV = { exp: 1.0, env: 0.55, sun: 1.6, bulb: 0.9, hemi: 0.12, area: 1.2 };
  Object.keys(LV).forEach(k => { if (Q.has(k)) LV[k] = parseFloat(Q.get(k)); });
  renderer.toneMappingExposure = LV.exp;

  // ---------- shared surfaces ----------
  const wallBump = LIB.noiseTex('orangepeel', 256, 128, 70, 1.4); wallBump.repeat.set(6, 3);
  const baseWallM = LIB.mat({ c: '#e9e3d8', rough: 0.88, bump: wallBump, bumpScale: 0.0006, env: 0.4 });
  const ceilM = LIB.mat({ c: '#f2efe9', rough: 0.95, env: 0.3 });
  const trimM = LIB.mat({ c: '#f3f1ec', rough: 0.38, env: 0.6 });
  const plateM = LIB.mat({ c: '#f4f2ee', rough: 0.3 });
  const TPX = 1024;

  // polished grey granite (bedroom), 600 mm tiles drawn 2 × 2 so the repeat is less obvious
  function granite(g, rough) {
    const r = LIB.rnd(rough ? 77 : 7);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const ox = tx * TPX, oy = ty * TPX, tone = 0.95 + r() * 0.1;
      if (rough) { g.fillStyle = 'rgb(38,38,38)'; g.fillRect(ox, oy, TPX, TPX); }
      else {
        const b1 = Math.round(176 * tone), b2 = Math.round(166 * tone);
        const base = g.createLinearGradient(ox, oy, ox + TPX * (0.5 + r()), oy + TPX); base.addColorStop(0, 'rgb(' + b1 + ',' + (b1 - 2) + ',' + (b1 - 6) + ')'); base.addColorStop(1, 'rgb(' + b2 + ',' + (b2 - 2) + ',' + (b2 - 5) + ')');
        g.fillStyle = base; g.fillRect(ox, oy, TPX, TPX);
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '225,222,215' : '95,93,90') + ',0.05)'; g.beginPath(); g.ellipse(ox + r() * TPX, oy + r() * TPX, 40 + r() * 200, 30 + r() * 140, r() * 3, 0, 6.3); g.fill(); }
      }
      const grains = rough ? 3000 : 22000;
      for (let i = 0; i < grains; i++) {
        const k = r(); let col, size;
        if (k < 0.30) { col = rough ? 'rgb(30,30,30)' : 'rgb(' + (28 + r() * 30 | 0) + ',' + (28 + r() * 28 | 0) + ',' + (30 + r() * 28 | 0) + ')'; size = 1 + r() * r() * 6; }
        else if (k < 0.58) { col = rough ? 'rgb(34,34,34)' : 'rgb(' + (214 + r() * 34 | 0) + ',' + (211 + r() * 34 | 0) + ',' + (204 + r() * 34 | 0) + ')'; size = 1.5 + r() * r() * 9; }
        else if (k < 0.64) { col = rough ? 'rgb(34,34,34)' : 'rgb(' + (190 + r() * 25 | 0) + ',' + (170 + r() * 20 | 0) + ',' + (160 + r() * 20 | 0) + ')'; size = 1.5 + r() * r() * 7; }
        else { col = rough ? 'rgb(44,44,44)' : 'rgba(' + (128 + r() * 40 | 0) + ',' + (128 + r() * 40 | 0) + ',' + (132 + r() * 40 | 0) + ',0.6)'; size = 1.5 + r() * r() * 8; }
        const x = ox + r() * TPX, y = oy + r() * TPX, n = 4 + (r() * 4 | 0), a0 = r() * 6.3;
        g.fillStyle = col; g.beginPath();
        for (let j = 0; j < n; j++) { const a = a0 + j / n * 6.283, rr = size * (0.55 + r() * 0.6); j ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (0.7 + r() * 0.5)) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.closePath(); g.fill();
      }
      g.fillStyle = rough ? 'rgb(230,230,230)' : 'rgb(128,123,115)'; const gw = 5;
      g.fillRect(ox, oy, TPX, gw / 2); g.fillRect(ox, oy + TPX - gw / 2, TPX, gw / 2); g.fillRect(ox, oy, gw / 2, TPX); g.fillRect(ox + TPX - gw / 2, oy, gw / 2, TPX);
    }
  }
  // clear white marble (kitchen), 600 mm tiles, each with its own soft grey veining
  function marble(g, rough) {
    const r = LIB.rnd(rough ? 91 : 19);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const ox = tx * TPX, oy = ty * TPX;
      g.save(); g.beginPath(); g.rect(ox, oy, TPX, TPX); g.clip();
      if (rough) { g.fillStyle = 'rgb(22,22,22)'; g.fillRect(ox, oy, TPX, TPX); }
      else {
        const warm = r() * 6;
        const base = g.createLinearGradient(ox, oy, ox + TPX, oy + TPX * r());
        base.addColorStop(0, 'rgb(' + (241 + warm | 0) + ',' + (240 + warm * 0.6 | 0) + ',236)'); base.addColorStop(1, 'rgb(' + (232 + warm | 0) + ',' + (231 + warm * 0.6 | 0) + ',228)');
        g.fillStyle = base; g.fillRect(ox, oy, TPX, TPX);
        // clouds
        for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(' + (r() > 0.6 ? '200,200,204' : '255,255,252') + ',' + (0.05 + r() * 0.07) + ')'; g.beginPath(); g.ellipse(ox + r() * TPX, oy + r() * TPX, 30 + r() * 220, 20 + r() * 90, r() * 3, 0, 6.3); g.fill(); }
      }
      // veins: wandering strokes in one dominant direction per tile, a few strong, many faint, softened by blur
      const dir = r() * Math.PI, nV = 3 + (r() * 4 | 0);
      for (let v = 0; v < nV; v++) {
        let x = ox + r() * TPX, y = oy + r() * TPX, a = dir + (r() - 0.5) * 0.8;
        const strong = v < 2, steps = 40 + (r() * 60 | 0);
        g.strokeStyle = rough ? 'rgb(40,40,40)' : 'rgba(' + (120 + r() * 40 | 0) + ',' + (122 + r() * 40 | 0) + ',' + (130 + r() * 40 | 0) + ',' + (strong ? 0.55 : 0.25) + ')';
        g.lineWidth = strong ? 1.5 + r() * 3.5 : 0.6 + r() * 1.4; g.lineCap = 'round';
        g.filter = rough ? 'none' : 'blur(' + (strong ? 1.2 : 0.6) + 'px)';
        g.beginPath(); g.moveTo(x - Math.cos(a) * TPX, y - Math.sin(a) * TPX);
        for (let s = 0; s < steps; s++) { a += (r() - 0.5) * 0.5; const L = 18 + r() * 30; x += Math.cos(a) * L; y += Math.sin(a) * L; g.lineTo(x, y); if (r() < 0.06) { g.stroke(); g.beginPath(); g.moveTo(x, y); g.lineWidth *= 0.8; } }
        g.stroke();
        g.filter = 'none';
      }
      g.restore();
      // grout, 2 mm, very light grey
      g.fillStyle = rough ? 'rgb(200,200,200)' : 'rgb(206,203,197)'; const gw = 4;
      g.fillRect(ox, oy, TPX, gw / 2); g.fillRect(ox, oy + TPX - gw / 2, TPX, gw / 2); g.fillRect(ox, oy, gw / 2, TPX); g.fillRect(ox + TPX - gw / 2, oy, gw / 2, TPX);
    }
  }
  function groutBump(key) { return (rx, ry) => LIB.canvasTex(key, 512, 512, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000000'; const s = 2; g.fillRect(0, 0, w, s); g.fillRect(0, 0, s, h); g.fillRect(0, h / 2 - s / 2, w, s); g.fillRect(w / 2 - s / 2, 0, s, h); }, false, rx, ry); }
  function floorMat(kind, W, D) {
    const TILE = 0.6, rx = W / (2 * TILE), ry = D / (2 * TILE);
    if (kind === 'wood') return LIB.mat({ c: '#86705c', map: LIB.loadTex('wood_diffuse.jpg', true, W / 2.4, D / 1.2), roughMap: LIB.loadTex('wood_roughness.jpg', false, W / 2.4, D / 1.2), rough: 0.85, bump: LIB.loadTex('wood_bump.jpg', false, W / 2.4, D / 1.2), bumpScale: 0.002, clearcoat: 0.45, clearcoatRough: 0.18, env: 1.0 });
    const draw = kind === 'marble' ? marble : granite;
    const map = LIB.canvasTex(kind, 2 * TPX, 2 * TPX, g => draw(g, false), true, rx, ry);
    const rough = LIB.canvasTex(kind + 'R', 2 * TPX, 2 * TPX, g => draw(g, true), false, rx, ry);
    const bump = groutBump('grout')(rx, ry);
    return LIB.mat({ map: map, roughMap: rough, rough: kind === 'marble' ? 0.6 : 1, bump: bump, bumpScale: 0.0015, clearcoat: kind === 'marble' ? 0.8 : 0.6, clearcoatRough: kind === 'marble' ? 0.04 : 0.06, env: kind === 'marble' ? 1.8 : 1.6 });
  }

  // ---------- a room ----------
  // spec: { key, title, W, D, floor, door:{x}, win:{z, w, y0, y1, blinds}, home, homeLook, ceilingLight:{x,z} }
  function makeRoom(spec) {
    const R = { key: spec.key, title: spec.title, spec: spec, root: new THREE.Group(), placed: [], tick: [], env: null, reflectors: [], hide: [] };
    const W = spec.W, D = spec.D, X0 = -W / 2, X1 = W / 2, Z0 = -D / 2, Z1 = D / 2;
    Object.assign(R, { W, D, X0, X1, Z0, Z1 });
    const root = R.root;
    const wallM = spec.wallColor ? LIB.mat({ c: spec.wallColor, rough: 0.9, bump: wallBump, bumpScale: 0.0006, env: 0.35 }) : baseWallM;
    const shell = LIB.group(root);
    LIB.plane(shell, W, D, floorMat(spec.floor, W, D), 0, 0, 0, { rx: -Math.PI / 2 });
    const ceiling = LIB.plane(shell, W, D, ceilM, 0, H, 0, { rx: Math.PI / 2 }); R.hide.push(ceiling);
    function wall(pieces, place) { const g = LIB.group(shell); pieces.forEach(p => { LIB.box(g, p[2], p[3], T, wallM, p[0] + p[2] / 2, p[1] + p[3] / 2, -T / 2); }); place(g); return g; }
    const DX = spec.door.x, DW = 0.90, DH = 2.05;
    wall([[X0 - T, 0, W + 2 * T, H]], g => { g.position.set(0, 0, Z0); });
    wall([[X0 - T, 0, (DX - DW / 2) - (X0 - T), H], [DX + DW / 2, 0, X1 + T - (DX + DW / 2), H], [DX - DW / 2, DH, DW, H - DH]], g => { g.position.set(0, 0, Z1); g.rotation.y = Math.PI; g.scale.x = -1; });
    wall([[-D / 2, 0, D, H]], g => { g.position.set(X0, 0, 0); g.rotation.y = Math.PI / 2; });
    const w = spec.win || null, WZ = w ? w.z : 0, WW = w ? w.w : 0, WY0 = w ? w.y0 : 0, WY1 = w ? w.y1 : 0;
    if (w) wall([[-D / 2, 0, (WZ - WW / 2) + D / 2, H], [WZ + WW / 2, 0, D / 2 - (WZ + WW / 2), H], [WZ - WW / 2, 0, WW, WY0], [WZ - WW / 2, WY1, WW, H - WY1]], g => { g.position.set(X1, 0, 0); g.rotation.y = -Math.PI / 2; });
    else wall([[-D / 2, 0, D, H]], g => { g.position.set(X1, 0, 0); g.rotation.y = -Math.PI / 2; });
    function baseboard(x0, z0, x1, z1) { const len = Math.hypot(x1 - x0, z1 - z0); const m = LIB.rbox(shell, len, 0.1, 0.014, 0.004, trimM, (x0 + x1) / 2, 0.05, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); return m; }
    (spec.baseboards || ['n', 'w', 'e', 's']).forEach(k => {
      if (k === 'n') baseboard(X0, Z0 + 0.007, X1, Z0 + 0.007);
      if (k === 'w') baseboard(X0 + 0.007, Z0, X0 + 0.007, Z1);
      if (k === 'e') baseboard(X1 - 0.007, spec.eastBaseFrom != null ? spec.eastBaseFrom : Z0, X1 - 0.007, Z1);
      if (k === 's') { baseboard(X0, Z1 - 0.007, DX - DW / 2 - 0.07, Z1 - 0.007); baseboard(DX + DW / 2 + 0.07, Z1 - 0.007, X1, Z1 - 0.007); }
    });
    // the window
    const win = w ? LIB.group(root, X1, 0, WZ, -Math.PI / 2) : null; if (win) { win.name = 'window'; R.win = win; }
    if (win) (function buildWindow() {
      const frameM = LIB.mat({ c: '#f6f5f2', rough: 0.35 });
      LIB.box(win, WW, 0.01, T, wallM, 0, WY1 - 0.005, -T / 2); LIB.box(win, 0.01, WY1 - WY0, T, wallM, -WW / 2 + 0.005, (WY0 + WY1) / 2, -T / 2); LIB.box(win, 0.01, WY1 - WY0, T, wallM, WW / 2 - 0.005, (WY0 + WY1) / 2, -T / 2);
      LIB.rbox(win, WW + 0.1, 0.025, T + 0.05, 0.006, LIB.mat({ c: '#ece8e0', rough: 0.3 }), 0, WY0 + 0.0125, -T / 2 + 0.025);
      const fz = -T + 0.03, fw = 0.05;
      LIB.rbox(win, WW, fw, 0.06, 0.006, frameM, 0, WY1 - fw / 2, fz); LIB.rbox(win, WW, fw, 0.06, 0.006, frameM, 0, WY0 + 0.025 + fw / 2, fz);
      LIB.rbox(win, fw, WY1 - WY0, 0.06, 0.006, frameM, -WW / 2 + fw / 2, (WY0 + WY1) / 2, fz); LIB.rbox(win, fw, WY1 - WY0, 0.06, 0.006, frameM, WW / 2 - fw / 2, (WY0 + WY1) / 2, fz);
      LIB.rbox(win, WW - 2 * fw, 0.045, 0.07, 0.006, frameM, 0, (WY0 + WY1) / 2 + 0.03, fz + 0.005);
      LIB.rbox(win, 0.07, 0.016, 0.02, 0.004, LIB.mat({ c: '#c9c6bf', rough: 0.3, metal: 0.7 }), 0, (WY0 + WY1) / 2 + 0.06, fz + 0.045);
      const glassM = LIB.mat({ c: '#cfe0e8', rough: 0.04, transparent: true, opacity: 0.18, env: 1.2 });
      LIB.plane(win, WW - 2 * fw, WY1 - WY0 - fw, glassM, 0, (WY0 + WY1) / 2, fz - 0.005).castShadow = false;
      const view = LIB.canvasTex('view', 1024, 768, (g, wd, ht) => {
        const sky = g.createLinearGradient(0, 0, 0, ht * 0.7); sky.addColorStop(0, '#8fb3d9'); sky.addColorStop(1, '#dfe9f1'); g.fillStyle = sky; g.fillRect(0, 0, wd, ht);
        const r = LIB.rnd(31);
        for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.3) + ')'; g.beginPath(); g.ellipse(r() * wd, 60 + r() * 140, 120 + r() * 160, 18 + r() * 24, 0, 0, 6.3); g.fill(); }
        for (let x = -20; x < wd; x += 70 + r() * 90) { const bh = 120 + r() * 180, bw = 70 + r() * 110; g.fillStyle = ['#b9a99a', '#a7948a', '#c5b9a8', '#8f8a86'][r() * 4 | 0]; g.fillRect(x, ht * 0.62 - bh, bw, bh + ht); g.fillStyle = 'rgba(60,70,85,0.55)'; for (let yy = ht * 0.62 - bh + 14; yy < ht * 0.6; yy += 26) for (let xx = x + 8; xx < x + bw - 12; xx += 20) g.fillRect(xx, yy, 10, 14); }
        for (let i = 0; i < 9; i++) { const tx = r() * wd, ty = ht * 0.72, s = 90 + r() * 120; g.fillStyle = '#4a3a2c'; g.fillRect(tx - 4, ty - s * 0.6, 8, s * 0.6 + 200); for (let k = 0; k < 60; k++) { g.fillStyle = ['#c9a227', '#d97b2b', '#b5651d', '#8a9a3a', '#e0b53a'][r() * 5 | 0]; g.globalAlpha = 0.85; g.beginPath(); g.arc(tx + (r() - 0.5) * s, ty - s * 0.55 + (r() - 0.5) * s * 0.7, 6 + r() * 16, 0, 6.3); g.fill(); } g.globalAlpha = 1; }
        g.fillStyle = '#6d6a66'; g.fillRect(0, ht * 0.8, wd, ht);
        g.filter = 'blur(2px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
      }, true);
      const viewM = new THREE.MeshBasicMaterial({ map: view }); viewM.color.setScalar(0.92);
      const vp = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.9), viewM); vp.position.set(0, (WY0 + WY1) / 2 + 0.2, -T - 1.6); win.add(vp); R.hide.push(vp);
      if (w.blinds !== false) {
        const slatM = LIB.mat({ c: '#f4f2ec', rough: 0.45, side: THREE.DoubleSide });
        const bw = WW - 0.04, top = WY1 - 0.02, n = Math.round((WY1 - WY0) * 18), step = 0.026, slatGeo = new THREE.BoxGeometry(bw, 0.0008, 0.025);
        LIB.rbox(win, bw + 0.02, 0.035, 0.04, 0.005, slatM, 0, top - 0.017, 0.04);
        for (let i = 0; i < n; i++) LIB.mesh(win, slatGeo, slatM, 0, top - 0.05 - i * step, 0.04, { rx: -0.55 });
        LIB.rbox(win, bw, 0.012, 0.03, 0.004, slatM, 0, top - 0.05 - n * step - 0.004, 0.04);
        [-bw * 0.28, bw * 0.28].forEach(x => LIB.cyl(win, 0.0008, 0.0008, n * step + 0.06, LIB.mat({ c: '#e8e4da' }), x, top - 0.03 - n * step / 2, 0.04, { seg: 4 }));
      }
    })();
    // ceiling light, smoke detector, switch, outlets
    const cl = spec.ceilingLight === false ? null : (spec.ceilingLight || { x: 0, z: 0.1 });
    if (cl) {
    const fixture = LIB.group(root, cl.x, H, cl.z);
    LIB.cyl(fixture, 0.19, 0.19, 0.012, LIB.mat({ c: '#d9d6cf', rough: 0.3, metal: 0.6 }), 0, -0.006, 0, { seg: 48 });
    LIB.lathe(fixture, [[0.001, -0.115], [0.06, -0.112], [0.12, -0.095], [0.16, -0.065], [0.178, -0.03], [0.18, -0.012]], LIB.mat({ c: '#fffaf0', rough: 0.6, emissive: '#fff1d8', emissiveIntensity: 1.6, transparent: true, opacity: 0.96 }), 0, 0, 0, { seg: 48 });
    fixture.traverse(o => { if (o.isMesh) o.castShadow = false; }); R.hide.push(fixture);
    }
    const detector = LIB.group(root, X0 + 0.9, H, Z1 - 1.1);
    LIB.cyl(detector, 0.065, 0.06, 0.035, LIB.mat({ c: '#f1efe9', rough: 0.5 }), 0, -0.018, 0, { seg: 32 });
    LIB.sph(detector, 0.003, LIB.mat({ c: '#40ff60', emissive: '#40ff60', emissiveIntensity: 2 }), 0.03, -0.036, 0, { ws: 6, hs: 4 });
    detector.traverse(o => { if (o.isMesh) o.castShadow = false; }); R.hide.push(detector);
    R.plate = function (x, y, z, ry, kind) {
      const g = LIB.group(root, x, y, z, ry);
      if (kind === 'switch') { LIB.rbox(g, 0.07, 0.115, 0.008, 0.003, plateM, 0, 0, 0.004); LIB.rbox(g, 0.022, 0.04, 0.012, 0.003, plateM, 0, 0, 0.01); }
      else { LIB.rbox(g, 0.07, 0.115, 0.008, 0.003, plateM, 0, 0, 0.004); [0.022, -0.022].forEach(dy => { LIB.rbox(g, 0.036, 0.03, 0.006, 0.008, plateM, 0, dy, 0.009); [-0.006, 0.006].forEach(dx => LIB.box(g, 0.0025, 0.009, 0.002, LIB.mat({ c: '#222' }), dx, dy + 0.003, 0.0125)); }); }
      return g;
    };
    R.plate(DX + (DX < 0 ? 1 : -1) * (DW / 2 + 0.16), 1.2, Z1 - 0.001, Math.PI, 'switch');
    // lights, all children of the room so they leave with it
    R.hemi = new THREE.HemisphereLight(0xf3efe8, 0x6b6156, LV.hemi * (spec.hemiK != null ? spec.hemiK : 1)); root.add(R.hemi);
    if (cl) { R.bulb = new THREE.PointLight(0xffe0bd, LV.bulb, 9, 1.6); R.bulb.position.set(cl.x, H - 0.16, cl.z);
    R.bulb.castShadow = true; R.bulb.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024); R.bulb.shadow.bias = -0.002; R.bulb.shadow.radius = 4; root.add(R.bulb); }
    if (w) {
    R.sun = new THREE.DirectionalLight(0xffe7c4, LV.sun * (spec.sunK || 1)); R.sun.position.set(X1 + 4.5, 4.3 + (WY0 - 0.95) * 2, WZ + 1.4); R.sun.target.position.set(-0.4, 0, WZ - 0.4);
    R.sun.castShadow = true; R.sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048); const sc = R.sun.shadow.camera; sc.left = -3.5; sc.right = 3.5; sc.top = 3.5; sc.bottom = -3.5; sc.near = 1; sc.far = 14; R.sun.shadow.bias = -0.0008; R.sun.shadow.normalBias = 0.02; R.sun.shadow.radius = 3;
    root.add(R.sun); root.add(R.sun.target);
    if (THREE.RectAreaLight) { R.area = new THREE.RectAreaLight(0xdbe8f5, LV.area * (WW * (WY1 - WY0)) / 1.32, WW - 0.1, WY1 - WY0 - 0.1); R.area.position.set(X1 - 0.02, (WY0 + WY1) / 2, WZ); R.area.lookAt(0, (WY0 + WY1) / 2, WZ); root.add(R.area); }
    }
    R.home = new THREE.Vector3().fromArray(spec.home); R.homeLook = new THREE.Vector3().fromArray(spec.homeLook);
    return R;
  }

  // ---------- placing things ----------
  const bbox = new THREE.Box3();
  function bounds(g) { g.updateMatrixWorld(true); bbox.setFromObject(g); return bbox.clone(); }
  function fallback(w, h, d, c) { const g = new THREE.Group(); LIB.rbox(g, w, h, d, 0.02, LIB.mat({ c: c || '#777', rough: 0.7 }), 0, h / 2, 0); g.userData.focus = { x: 0, y: h / 2, z: 0, r: Math.max(w, h, d) / 2 }; g.userData.fallback = true; return g; }
  function make(lib, fn, fb) { try { if (lib[fn]) { const g = lib[fn](); if (g) return g; } } catch (e) { console.error(fn + ': ' + e.message); } console.warn('fallback for ' + fn); return fb(); }
  function snap(R, g, o) {
    const b = bounds(g);
    if (o.west != null) g.position.x += (R.X0 + o.west) - b.min.x;
    if (o.east != null) g.position.x += (R.X1 - o.east) - b.max.x;
    if (o.north != null) g.position.z += (R.Z0 + o.north) - b.min.z;
    if (o.south != null) g.position.z += (R.Z1 - o.south) - b.max.z;
    g.updateMatrixWorld(true);
  }
  // focus: optional { x,y,z,r } in the group's local frame (or `world: true` in room coordinates)
  function addThing(R, name, g, view, opts) {
    opts = opts || {}; R.root.updateMatrixWorld(true);
    const f = opts.focus || g.userData.focus || {}; const b = bounds(g);
    let focus;
    if (f.x != null) focus = f.world ? new THREE.Vector3(f.x, f.y, f.z) : new THREE.Vector3(f.x, f.y, f.z).applyMatrix4(g.matrixWorld);
    else focus = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const item = { name: name, group: g, focus: focus, view: new THREE.Vector3(view[0], view[1], view[2]).normalize(), r: f.r || Math.max(size.x, size.y, size.z) / 2, near: opts.near, far: opts.far, go: opts.go };
    R.placed.push(item); return item;
  }
  function makeReflector(R, mirror) {
    if (!THREE.Reflector) return;
    let glass = null; mirror.traverse(o => { if (o.name === 'mirrorGlass') glass = o; });
    const gi = mirror.userData.glass || { w: 0.41, h: 1.36, x: 0, y: 1.05, z: 0.012 };
    let w, h, pos;
    if (glass) { glass.geometry.computeBoundingBox(); const s = glass.geometry.boundingBox.getSize(new THREE.Vector3()); w = s.x * glass.scale.x; h = s.y * glass.scale.y; pos = glass.position.clone(); glass.visible = false; }
    else { w = gi.w; h = gi.h; pos = new THREE.Vector3(gi.x, gi.y, gi.z); }
    const px = LITE ? 256 : 512;
    const rf = new THREE.Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: px, textureHeight: Math.round(px * h / w), color: 0xb9bcbc, clipBias: 0.003 });
    rf.position.copy(pos); rf.position.z += 0.001;
    if (glass) { rf.rotation.copy(glass.rotation); glass.parent.add(rf); } else mirror.add(rf);
    const before = rf.onBeforeRender;
    rf.onBeforeRender = function (r, s, c) { if (s.overrideMaterial || rf.userData.busy) return; if (rf.userData.f === PERF.frame || (!PERF.camMoved && !M.on && rf.userData.f != null && PERF.frame - rf.userData.f < 30)) return; rf.userData.f = PERF.frame; rf.userData.busy = true; before.call(this, r, s, c); rf.userData.busy = false; };
    R.reflectors.push(rf);
  }

  // ---------- the bedroom ----------
  function buildBedroom() {
    const R = makeRoom({ key: 'bedroom', title: 'my bedroom', W: 3.8, D: 4.2, floor: 'granite', door: { x: 1.33 }, win: { z: -0.9, w: 1.10, y0: 0.95, y1: 2.15 }, home: [1.28, 1.62, 1.62], homeLook: [-0.9, 0.85, -0.55], ceilingLight: { x: 0, z: 0.1 } });
    const root = R.root, X0 = R.X0, X1 = R.X1, Z0 = R.Z0, Z1 = R.Z1;
    R.plate(X0 + 0.001, 0.32, 1.95, Math.PI / 2, 'outlet'); R.plate(X0 + 0.001, 0.32, -0.25, Math.PI / 2, 'outlet'); R.plate(X1 - 0.001, 0.32, 0.2, -Math.PI / 2, 'outlet');
    (function vent() { const g = LIB.group(root, -0.2, 2.45, Z0); const m = LIB.mat({ c: '#efede8', rough: 0.4, metal: 0.2 }); LIB.rbox(g, 0.32, 0.16, 0.012, 0.003, m, 0, 0, 0.006); for (let i = 0; i < 7; i++) LIB.box(g, 0.28, 0.006, 0.014, m, 0, -0.06 + i * 0.02, 0.012, { rx: 0.5 }); })();
    const bed = make(PB, 'bed', () => fallback(1.05, 0.6, 2.1, '#d8d4cc')); root.add(bed); snap(R, bed, { west: 0.01, north: 0.01 });
    const desk = make(PA, 'desk', () => fallback(1.5, 0.75, 0.7, '#c9a678')); desk.rotation.y = Math.PI / 2; root.add(desk); snap(R, desk, { west: 0.005, south: 0.06 });
    const slots = desk.userData.slots || { controller: { x: -0.45, y: 0.755, z: 0.18 }, books: { x: 0.58, y: 0.755, z: 0.02 } };
    const pad = make(PA, 'controller', () => fallback(0.155, 0.06, 0.105, '#1a1a1a')); desk.add(pad); pad.position.set(slots.controller.x, slots.controller.y, slots.controller.z); pad.rotation.y = 0.35;
    const books = make(PA, 'books', () => fallback(0.3, 0.25, 0.28, '#5a3a3a')); desk.add(books); books.position.set(slots.books.x, slots.books.y, slots.books.z); books.rotation.y = -0.08;
    const fridge = make(PA, 'fridge', () => fallback(0.48, 0.85, 0.5, '#1c1c1c')); fridge.rotation.y = Math.PI / 2; root.add(fridge);
    { const bb = bounds(bed), db = bounds(desk); fridge.position.z = (bb.max.z + db.min.z) / 2; snap(R, fridge, { west: 0.03 }); }
    const chair = make(PA, 'chair', () => fallback(0.65, 1.3, 0.65, '#202020')); chair.rotation.y = -Math.PI / 2 + 0.35; root.add(chair);
    { const db = bounds(desk); chair.position.set(db.max.x + 0.42, 0, (db.min.z + db.max.z) / 2 + 0.05); }
    const shelf = make(PB, 'shelf', () => fallback(1.6, 0.3, 0.3, '#d9c4a0')); root.add(shelf); shelf.position.set(0.98, 0, Z0); if (shelf.userData.fallback) shelf.position.y = 0.8;
    const guitar = make(PB, 'guitar', () => fallback(0.4, 1.03, 0.1, '#b77a3a')); root.add(guitar); guitar.position.set(0.52, 0, Z0); if (guitar.userData.fallback) guitar.position.y = 1.3;
    const cue = make(PB, 'cue', () => fallback(0.03, 1.47, 0.03, '#5a3520')); root.add(cue); cue.position.set(1.42, 0, Z0); if (cue.userData.fallback) cue.position.y = 1.15;
    const door = make(PB, 'door', () => fallback(0.9, 2.05, 0.04, '#f0eee8')); door.rotation.y = Math.PI; root.add(door); door.position.set(R.spec.door.x, 0, Z1);
    const mirror = make(PB, 'mirror', () => { const g = fallback(0.45, 1.4, 0.02, '#333'); g.children[0].position.y = 1.05; g.userData.focus = { x: 0, y: 1.05, z: 0, r: 0.7 }; return g; });
    mirror.rotation.y = -Math.PI / 2; root.add(mirror); mirror.position.set(X1, 0, 1.38); makeReflector(R, mirror);
    addThing(R, 'the desk, and everything on it', desk, [1, 0.55, 0.15]);
    addThing(R, 'the controller', pad, [1, 1.1, 0.2], { near: 0.42 });
    addThing(R, 'the study books', books, [1, 0.7, -0.3], { near: 0.6 });
    addThing(R, 'the gaming chair', chair, [1, 0.6, -0.3]);
    addThing(R, 'the mini-fridge', fridge, [1, 0.45, 0.3], { go: 'kitchen' });
    addThing(R, 'the bed', bed, [0.75, 0.75, 0.9]);
    addThing(R, 'the window', R.win, [-1, 0.05, 0.35]);
    addThing(R, 'the guitar', guitar, [0.05, 0.12, 1], { go: 'campfire' });
    addThing(R, 'the shelf of clothes', shelf, [0.15, 0.35, 1]);
    addThing(R, 'the pool cue', cue, [-0.2, 0.05, 1], { go: 'pool' });
    addThing(R, 'the mirror', mirror, [-1, 0.05, -0.25]);
    addThing(R, 'the door', door, [-0.15, 0.08, -1]);
    R.fridgeIndex = R.placed.findIndex(p => p.go === 'kitchen');
    R.goIndex = {}; R.placed.forEach((p, i) => { if (p.go) R.goIndex[p.go] = i; });
    return R;
  }

  // ---------- the kitchen ----------
  // plan (from above): door bottom-left; the big fridge on the left wall facing right; a black stone counter in an L
  // from the top-left corner to the top-right corner and halfway down the right wall; the sink at the tip of the L;
  // a tabletop gas stove on the counter under a steel chimney hood; navy tiles along the whole counter.
  function buildKitchen() {
    const R = makeRoom({ key: 'kitchen', title: 'the kitchen', W: 4.4, D: 4.0, floor: 'marble', door: { x: -1.3 }, win: { z: -0.42, w: 0.80, y0: 1.52, y1: 2.32, blinds: false }, home: [-1.12, 1.62, 1.66], homeLook: [0.55, 0.95, -1.05], ceilingLight: { x: 0, z: -0.2 }, baseboards: ['w', 's', 'e'], eastBaseFrom: 0.0, sunK: 0.9 });
    const root = R.root, X0 = R.X0, X1 = R.X1, Z0 = R.Z0, Z1 = R.Z1;
    R.plate(X0 + 0.001, 0.32, 1.2, Math.PI / 2, 'outlet'); R.plate(X1 - 0.001, 0.32, 1.1, -Math.PI / 2, 'outlet');
    const STOVE_X = -0.35, TOP = 0.92;
    // the counter (built in room coordinates by its module)
    const counter = make(KIT, 'counter', () => { const g = new THREE.Group(); LIB.rbox(g, 4.4, 0.92, 0.62, 0.01, LIB.mat({ c: '#e8e6e0' }), 0, 0.46, Z0 + 0.31); LIB.rbox(g, 4.42, 0.03, 0.64, 0.006, LIB.mat({ c: '#111', rough: 0.2 }), 0, 0.935, Z0 + 0.31); LIB.rbox(g, 0.62, 0.92, 2.0, 0.01, LIB.mat({ c: '#e8e6e0' }), X1 - 0.31, 0.46, Z0 + 1); g.userData.fallback = true; return g; });
    root.add(counter);
    // the stove, on top of the counter (not built in)
    const stove = make(KIT, 'stove', () => fallback(0.7, 0.11, 0.42, '#2a2a2a')); root.add(stove); stove.position.set(STOVE_X, TOP, Z0 + 0.34);
    // the chimney hood above it
    const hood = make(KIT, 'hood', () => { const g = new THREE.Group(); const m = LIB.mat({ c: '#b9bcbe', metal: 0.9, rough: 0.35 }); LIB.rbox(g, 0.7, 0.18, 0.5, 0.01, m, 0, 1.71, 0.25); LIB.rbox(g, 0.26, 0.9, 0.22, 0.005, m, 0, 2.25, 0.12); return g; });
    root.add(hood); hood.position.set(STOVE_X, 0, Z0);
    // the very big fridge, left wall, facing right
    const fridge = make(KIT, 'fridge', () => fallback(0.9, 1.85, 0.78, '#e9e9e6')); fridge.rotation.y = Math.PI / 2; root.add(fridge); fridge.position.z = -0.8; snap(R, fridge, { west: 0.02 });
    const door = make(PB, 'door', () => fallback(0.9, 2.05, 0.04, '#f0eee8')); door.rotation.y = Math.PI; root.add(door); door.position.set(R.spec.door.x, 0, Z1);
    // my mom, next to the stove, facing the counter, cutting on a wooden board
    const MOMX = 0.42, COUNTER_FRONT = Z0 + 0.62;
    const mom = (window.MOM && window.MOM.build) ? (function () { try { return window.MOM.build(); } catch (e) { console.error('mom: ' + e.message); return null; } })() : null;
    if (mom) { mom.rotation.y = Math.PI; mom.position.set(MOMX, 0, COUNTER_FRONT + 0.33); root.add(mom); }
    // a hand towel on the oven-less wall and a clock above the door make it lived-in
    (function clock() { const g = LIB.group(root, X0 + 0.01, 2.2, 0.9, Math.PI / 2); const face = LIB.textTex('clockface', 256, 256, '#f7f5ef', (c, w, h) => { c.strokeStyle = '#222'; c.lineWidth = 6; c.beginPath(); c.arc(128, 128, 120, 0, 6.3); c.stroke(); c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; c.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 10, 6, 20); } c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 50, 128 - 30); c.stroke(); c.lineWidth = 5; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 - 20, 128 - 90); c.stroke(); }); LIB.cyl(g, 0.15, 0.15, 0.03, LIB.mat({ c: '#1e1e1e', rough: 0.4 }), 0, 0, 0.015, { rx: Math.PI / 2, seg: 48 }); LIB.cyl(g, 0.135, 0.135, 0.005, LIB.mat({ map: face, rough: 0.3 }), 0, 0, 0.032, { rx: Math.PI / 2, ry: Math.PI / 2, seg: 48 }); })();

    // things, left to right as seen from the door
    const fp = (fridge.userData.parts || []).find(p => /freezer/.test(p.name));
    addThing(R, 'the big fridge', fridge, [0.95, 0.22, 0.32]);
    if (fp) addThing(R, 'the freezer', fp.group, [0.95, 0.05, 0.3], { focus: fp.focus, near: 0.75 });
    const parts = counter.userData.parts || [];
    const cp = parts.find(p => /counter/.test(p.name)); const sp = parts.find(p => /sink/.test(p.name));
    addThing(R, 'the gas stove', stove, [0.1, 0.9, 1], { near: 0.75 });
    if (mom) addThing(R, 'my mom, cutting vegetables', mom, [0.55, 0.62, 0.75], { focus: { x: 0, y: 0.98, z: 0.42, r: 0.5 }, near: 0.95, far: 1.9 });
    addThing(R, 'the chimney hood', hood, [0.1, -0.35, 1], { near: 0.95 });
    if (sp) addThing(R, 'the sink', sp.group, [-1, 0.95, 0.35], { focus: Object.assign({ world: true }, sp.focus), near: 0.85 });

    // motion: drawers and doors, the tap, the flame, the freezer
    const ch = [];
    const movers = counter.userData.movers || [];
    // fronts that would open into mom are left shut (north run, from the stove's right edge to past where she stands)
    const clear = m => !(mom && m.run === 'N' && m.u1 > MOMX - 0.45 && m.u0 < MOMX + 0.45 && !(m.kind === 'door' && m.u1 <= 0.001));
    movers.filter(clear).forEach((m, i) => ch.push({ kind: m.kind || 'drawer', set: m.set, period: m.kind === 'door' ? 7.5 : 5.5, on: 0.42, ramp: m.kind === 'door' ? 0.16 : 0.12, phase: i * 1.37 }));
    if (counter.userData.setWater) ch.push({ kind: 'water', set: counter.userData.setWater, period: 9, on: 0.55, ramp: 0.05, phase: 2.2 });
    if (stove.userData.setFlame) ch.push({ kind: 'flame', set: stove.userData.setFlame, period: 10, on: 0.6, ramp: 0.06, phase: 0.6 });
    if (fridge.userData.setFreezer) ch.push({ kind: 'freezer', set: fridge.userData.setFreezer, period: 8.5, on: 0.45, ramp: 0.14, phase: 4.1 });
    if (mom && mom.userData.setCut) { ch.push({ kind: 'cut', set: mom.userData.setCut, always: true }); mom.userData.onChop = () => SFX.start('chop'); }
    ch.forEach(c => { c.v = 0; c.was = 0; });
    R.channels = ch;
    [counter, stove, fridge, hood, mom].forEach(g => { if (g && g.userData.tick) R.tick.push(g.userData.tick); });
    R.stoveLights = stove.userData.lights || []; R.fridgeLights = fridge.userData.lights || [];
    return R;
  }

  // ---------- the pool room ----------
  // a small, dim room: two round yellow lights at the two ends of the ceiling, the table in the middle,
  // a closed closet in the top-right corner, a boom box on a chair against the left wall, my friend taking a shot.
  function buildPool() {
    const R = makeRoom({ key: 'pool', title: 'the pool room', W: 5.4, D: 4.4, floor: 'wood', wallColor: '#7a7468', door: { x: 1.65 }, win: null, ceilingLight: false, hemiK: 0.55, home: [1.6, 1.62, 1.72], homeLook: [-0.7, 0.8, -0.2] });
    const root = R.root, X0 = R.X0, X1 = R.X1, Z0 = R.Z0, Z1 = R.Z1;
    R.plate(X0 + 0.001, 0.32, -1.2, Math.PI / 2, 'outlet'); R.plate(X1 - 0.001, 0.32, 0.6, -Math.PI / 2, 'outlet');
    // the two dim yellow round lights
    const lamps = [-1.85, 1.85].map(x => {
      const l = make(POOL, 'ceilingLight', () => { const g = new THREE.Group(); LIB.cyl(g, 0.19, 0.19, 0.03, LIB.mat({ c: '#ffd27a', emissive: '#ffc85a', emissiveIntensity: 1.2 }), 0, -0.02, 0, { seg: 48 }); const p = new THREE.PointLight(0xffc46b, 0.9, 7, 2); p.position.y = -0.1; p.castShadow = true; g.add(p); g.userData.light = p; return g; });
      l.position.set(x, H, 0); root.add(l); l.traverse(o => { if (o.isMesh && o.material && o.material.emissiveIntensity > 0.3) o.material.emissiveIntensity *= 0.6; }); /* dim */ const pl = l.userData.light; if (pl) { pl.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024); pl.shadow.bias = -0.002; pl.shadow.radius = 5; } return l; });
    // the table, dead centre
    const table = make(POOL, 'table', () => { const g = new THREE.Group(); LIB.rbox(g, 2.52, 0.24, 1.4, 0.03, LIB.mat({ c: '#4a2c1a', rough: 0.4 }), 0, 0.67, 0); LIB.box(g, 2.24, 0.01, 1.12, LIB.mat({ c: '#1f6b3a', rough: 0.95 }), 0, 0.765, 0); [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(p => LIB.rbox(g, 0.14, 0.55, 0.14, 0.02, LIB.mat({ c: '#4a2c1a' }), p[0], 0.275, p[1])); return g; });
    root.add(table);
    // my friend, taking practice strokes (built in table coordinates)
    const friend = (window.FRIEND && window.FRIEND.build && !Q.has('nofriend')) ? (function () { try { return window.FRIEND.build(); } catch (e) { console.error('friend: ' + e.message); return null; } })() : null;
    if (friend) root.add(friend);
    // the closet, closed, in the top-right corner
    const closet = make(POOL, 'closet', () => fallback(1.2, 2.4, 0.62, '#efece4')); root.add(closet); closet.position.set(X1 - 0.6, 0, Z0); if (closet.userData.fallback) closet.position.z = Z0 + 0.31;
    // a plain chair against the left wall with the boom box on it
    const chair = make(POOL, 'chair', () => fallback(0.44, 0.9, 0.46, '#8a6a48')); chair.rotation.y = Math.PI / 2; root.add(chair); chair.position.set(0, 0, 1.15); snap(R, chair, { west: 0.06 });
    const boom = make(POOL, 'boombox', () => fallback(0.5, 0.28, 0.15, '#1a1a1a')); boom.rotation.y = Math.PI / 2 + 0.25; root.add(boom);
    { const sy = chair.userData.seatY != null ? chair.userData.seatY : 0.46; const cb = bounds(chair); boom.position.set((cb.min.x + cb.max.x) / 2 + 0.02, sy, (cb.min.z + cb.max.z) / 2); }
    // a cue rack on the back wall, left of the closet's corner
    const rack = make(POOL, 'cueRack', () => fallback(0.6, 1.5, 0.12, '#5a3a22')); root.add(rack); rack.position.set(-0.9, 0, Z0); if (rack.userData.fallback) rack.position.set(-0.9, 0.6, Z0 + 0.06);
    const door = make(PB, 'door', () => fallback(0.9, 2.05, 0.04, '#f0eee8')); door.rotation.y = Math.PI; root.add(door); door.position.set(R.spec.door.x, 0, Z1);
    // things, left to right as seen from the door
    addThing(R, 'the boom box, on a chair', boom, [1, 0.35, -0.2], { near: 0.75 });
    if (friend) addThing(R, 'my friend, lining up a shot', friend, [0.75, 0.5, 0.75], { near: 1.25, far: 2.2 });
    addThing(R, 'the pool table', table, [0.35, 0.95, 0.85]);
    addThing(R, 'the lights', lamps[1], [-0.2, -0.75, 0.6], { focus: { x: 0, y: -0.05, z: 0, r: 0.3 }, near: 1.4 });
    // motion: his strokes, and the music
    const ch = [];
    if (friend && friend.userData.setStroke) ch.push({ kind: 'stroke', set: friend.userData.setStroke, always: true });
    ch.push({ kind: 'music', set: v => { if (boom.userData.setOn) boom.userData.setOn(v); }, always: true });
    ch.forEach(c => { c.v = 0; c.was = 0; });
    R.channels = ch; R.music = true;
    [table, friend, boom].forEach(g => { if (g && g.userData.tick) R.tick.push(g.userData.tick); });
    if (boom.userData.pulse) R.tick.push(() => boom.userData.pulse(SFX.beat()));
    return R;
  }

  // ---------- the campfire ----------
  // a round island of land in a void under a night sky: a fire, the log I sit on with my guitar, a girl beside me,
  // a few plants, marshmallows on sticks, a patch of fireflies.
  function buildCampfire() {
    const R = { key: 'campfire', title: 'the campfire', outdoor: true, root: new THREE.Group(), placed: [], tick: [], env: null, reflectors: [], hide: [],
      X0: -3.6, X1: 3.6, Z0: -3.6, Z1: 3.6, home: new THREE.Vector3(2.3, 1.45, 3.05), homeLook: new THREE.Vector3(-0.15, 0.55, -0.35), bg: '#020306' };
    const root = R.root;
    const LOG_Z = -0.6, FIRE_Z = 0.9;
    // the sky: a deep blue fading to black at the horizon, stars, a moon; below the horizon, nothing
    (function sky() {
      const sm = new THREE.ShaderMaterial({ uniforms: { enc: { value: composer ? 0 : 1 } }, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float enc; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.012,0.022,0.055); vec3 hor = vec3(0.03,0.04,0.075); vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) * smoothstep(-0.02, 0.12, h) : vec3(0.0); gl_FragColor = vec4(enc > 0.5 ? pow(c, vec3(1.0/2.2)) : c, 1.0); }' });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), sm); dome.renderOrder = -10; root.add(dome);
      const r = LIB.rnd(17), n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { let x, y, z; do { x = r() * 2 - 1; y = r(); z = r() * 2 - 1; } while (x * x + y * y + z * z > 1 || y < 0.12); const L = Math.hypot(x, y, z); pos[i * 3] = x / L * 42; pos[i * 3 + 1] = y / L * 42; pos[i * 3 + 2] = z / L * 42; const b = 0.35 + Math.pow(r(), 3) * 0.65, tint = r(); col[i * 3] = b * (tint > 0.85 ? 1 : 0.85); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (tint < 0.2 ? 0.8 : 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const dot = LIB.canvasTex('stardot', 32, 32, (c, w, h) => { const q = c.createRadialGradient(16, 16, 0, 16, 16, 16); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(0.35, 'rgba(255,255,255,0.6)'); q.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = q; c.fillRect(0, 0, w, h); }, true);
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })); root.add(stars);
      const moonTex = LIB.canvasTex('moon', 256, 256, (c, w, h) => { const q = c.createRadialGradient(128, 128, 30, 128, 128, 128); q.addColorStop(0, 'rgba(255,250,235,1)'); q.addColorStop(0.36, 'rgba(250,245,228,1)'); q.addColorStop(0.42, 'rgba(200,210,240,0.25)'); q.addColorStop(1, 'rgba(160,180,230,0)'); c.fillStyle = q; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(160,160,150,0.35)'; [[110, 110, 14], [150, 135, 10], [125, 150, 8], [140, 100, 6]].forEach(m => { c.beginPath(); c.arc(m[0], m[1], m[2], 0, 6.3); c.fill(); }); }, true);
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, toneMapped: false })); moon.position.set(-18, 21, -29); moon.scale.set(7.4, 7.4, 1); root.add(moon);
      R.sky = [dome, stars, moon];
    })();
    // light: the fire (from the fire pit module), cool moonlight, a faint sky fill
    R.hemi = new THREE.HemisphereLight(0x2a3a66, 0x120c08, 0.16); root.add(R.hemi);
    const moonL = new THREE.DirectionalLight(0x9db4ff, 0.22); moonL.position.set(-6, 9, -7); moonL.castShadow = true; moonL.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024); const mc = moonL.shadow.camera; mc.left = -5; mc.right = 5; mc.top = 5; mc.bottom = -5; mc.far = 30; moonL.shadow.bias = -0.001; root.add(moonL);
    const ground = make(CAMP, 'ground', () => { const g = new THREE.Group(); LIB.cyl(g, 4.2, 3.2, 0.6, LIB.mat({ c: '#3b2f22', rough: 1 }), 0, -0.3, 0, { seg: 48 }); return g; }); root.add(ground); ground.position.z = 0.2;
    const pit = make(CAMP, 'firepit', () => { const g = new THREE.Group(); LIB.cyl(g, 0.4, 0.45, 0.12, LIB.mat({ c: '#555' }), 0, 0.06, 0); LIB.mesh(g, new THREE.ConeGeometry(0.22, 0.6, 12), LIB.mat({ c: '#ff7a1a', emissive: '#ff6a10', emissiveIntensity: 2 }), 0, 0.4, 0); const l = new THREE.PointLight(0xff8a3a, 2.2, 9, 2); l.position.y = 0.45; l.castShadow = true; g.add(l); g.userData.light = l; return g; });
    root.add(pit); pit.position.set(0, 0, FIRE_Z);
    const fl = pit.userData.light; if (fl) { fl.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024); fl.shadow.bias = -0.002; fl.shadow.radius = 3; }
    const log = make(CAMP, 'log', () => { const g = new THREE.Group(); LIB.cyl(g, 0.18, 0.18, 2.0, LIB.mat({ c: '#5a3e2a', rough: 0.95 }), 0, 0.2, 0, { rz: Math.PI / 2 }); return g; }); root.add(log); log.position.z = LOG_Z;
    const plants = make(CAMP, 'plants', () => new THREE.Group()); root.add(plants); plants.position.z = LOG_Z;
    const mallows = make(CAMP, 'marshmallows', () => new THREE.Group()); root.add(mallows); mallows.position.z = FIRE_Z;
    const flies = make(CAMP, 'fireflies', () => new THREE.Group()); root.add(flies); flies.position.set(2.1, 0, -1.2);
    const campers = (window.CAMPERS && window.CAMPERS.build && !Q.has('nopeople')) ? (function () { try { return window.CAMPERS.build(); } catch (e) { console.error('campers: ' + e.message); return null; } })() : null;
    if (campers) { root.add(campers); campers.position.z = LOG_Z; }
    // things, left to right as seen from where you arrive
    const parts = campers ? (campers.userData.parts || []) : [];
    const me = parts.find(p => /me/.test(p.name)), her = parts.find(p => /girl/.test(p.name));
    if (me) addThing(R, me.name, me.group, [0.25, 0.45, 1], { focus: me.focus, near: 1.0 });
    if (her) addThing(R, her.name, her.group, [0.35, 0.4, 1], { focus: her.focus, near: 1.0 });
    addThing(R, 'the plants', plants, [0.3, 0.6, 1]);
    addThing(R, 'the fire', pit, [0.45, 0.75, 1], { near: 1.15 });
    addThing(R, 'marshmallows on sticks', mallows, [0.7, 0.75, 0.6], { near: 1.2 });
    addThing(R, 'the fireflies', flies, [0.2, 0.25, 1], { focus: { x: 0, y: 0.95, z: 0, r: 0.9 } });
    addThing(R, 'the night sky', R.sky[2], [0.45, -0.6, 0.75], { focus: { world: true, x: -1.4, y: 2.6, z: -2.2, r: 0.6 }, near: 0.6 });
    // motion: the fireflies wander, I strum, the fire crackles
    const ch = [];
    if (flies.userData.setWobble) ch.push({ kind: 'flies', set: flies.userData.setWobble, always: true });
    if (campers && campers.userData.setStrum) { ch.push({ kind: 'strum', set: campers.userData.setStrum, always: true }); R.strumNow = campers.userData.strumNow; }
    ch.forEach(c => { c.v = 0; c.was = 0; });
    R.channels = ch; R.campfire = true;
    [flies, campers, pit, ground].forEach(g => { if (g && g.userData.tick) R.tick.push(g.userData.tick); });
    // the firelight breathes a little (the flames themselves stay still)
    if (fl) { const base = fl.intensity; R.tick.push(t => { fl.intensity = base * (0.94 + 0.04 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1.3) + 0.02 * Math.sin(t * 2.1)); }); }
    return R;
  }

  // ---------- motion ----------
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function wave(c, t) { const u = ((t + c.phase) % c.period) / c.period; if (u < c.ramp) return smooth(u / c.ramp); if (u < c.on) return 1; if (u < c.on + c.ramp) return 1 - smooth((u - c.on) / c.ramp); return 0; }
  const M = { on: false, t: 0 };
  function runMotion(R, dt) {
    if (!R.channels) return;
    if (M.on) M.t += dt;
    R.channels.forEach(c => {
      const target = M.on ? (c.always ? 1 : wave(c, M.t)) : 0;
      c.v = c.always ? (target > c.v ? Math.min(1, c.v + dt * 2) : Math.max(0, c.v - dt * 2)) : (M.on ? target : Math.max(0, c.v - dt * 1.6));
      if (c.applied === undefined || Math.abs(c.v - c.applied) > 1e-4) { try { c.set(c.v); } catch (e) { /* a part that fails stays still */ } c.applied = c.v; }
      // sounds on the edges
      if (!c.always) { if (c.v > 0.02 && c.was <= 0.02) SFX.start(c.kind); if (c.v <= 0.02 && c.was > 0.02) SFX.stop(c.kind); }
      c.was = c.v;
    });
    SFX.level('water', chLevel(R, 'water')); SFX.level('flame', chLevel(R, 'flame'));
    if (R.music) SFX.jazz(M.on);
    if (R.campfire) SFX.camp(M.on, R.strumNow);
  }
  function chLevel(R, kind) { let m = 0; R.channels.forEach(c => { if (c.kind === kind) m = Math.max(m, c.v); }); return m; }

  // ---------- sound: synthesized, quiet, only for things in motion ----------
  const SFX = (function () {
    let ac = null, master = null, noise = null; const loops = {};
    function init() {
      if (ac) return true;
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      try { ac = new C(); } catch (e) { return false; }
      master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; noise = buf;
      return true;
    }
    function src() { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, Math.random() * 1.5); return s; }
    function loop(kind) {
      if (loops[kind]) return loops[kind];
      const g = ac.createGain(); g.gain.value = 0; g.connect(master);
      if (kind === 'water') { const s = src(), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.6; const f2 = ac.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 400; s.connect(f); f.connect(f2); f2.connect(g); const lfo = ac.createOscillator(); lfo.frequency.value = 7.3; const lg = ac.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); }
      if (kind === 'flame') { const s = src(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; s.connect(f); f.connect(g); const s2 = src(), f3 = ac.createBiquadFilter(); f3.type = 'highpass'; f3.frequency.value = 4200; const g3 = ac.createGain(); g3.gain.value = 0.25; s2.connect(f3); f3.connect(g3); g3.connect(g); }
      loops[kind] = g; return g;
    }
    function burst(freq, q, dur, gain, type, when) {
      const t0 = ac.currentTime + (when || 0); const s = ac.createBufferSource(); s.buffer = noise; const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = ac.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    }
    function thump(freq, dur, gain, when) { const t0 = ac.currentTime + (when || 0); const o = ac.createOscillator(); o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + dur); const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05); }
    // ---- a little jazz combo, played through a small speaker: walking bass, ride and hats, soft piano comping, vibes melody
    const J = { on: false, timer: null, next: 0, step: 0, out: null, lastBass: -10, bpm: 116 };
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    // ii–V–I–VI in F, one bar each: bass walk (quarters), chord voicing
    const BARS = [
      { bass: [43, 45, 46, 47], chord: [58, 62, 65, 69] },   // Gm9
      { bass: [48, 46, 43, 40], chord: [58, 64, 67, 74] },   // C9
      { bass: [41, 45, 48, 49], chord: [57, 60, 64, 67] },   // Fmaj9
      { bass: [50, 48, 45, 44], chord: [60, 66, 69, 72] }    // D7
    ];
    // melody on the eighth-note grid of the 4-bar loop: [eighth, midi, length in eighths]; a second, answering chorus every other time
    const MEL = [
      [[1, 70, 1], [2, 72, 1], [3, 74, 2], [6, 72, 1], [7, 70, 1], [8, 69, 2], [11, 67, 1], [12, 64, 3], [17, 65, 1], [18, 69, 1], [19, 72, 2], [22, 74, 1], [23, 72, 3], [27, 69, 1], [28, 66, 2], [30, 67, 2]],
      [[0, 74, 1], [1, 77, 2], [4, 76, 1], [5, 74, 1], [6, 72, 2], [9, 70, 1], [10, 72, 1], [11, 74, 3], [16, 72, 2], [19, 69, 1], [20, 67, 1], [21, 65, 3], [26, 66, 1], [27, 69, 1], [28, 72, 2], [31, 70, 1]]
    ];
    function jOut() {
      if (J.out) return J.out;
      // the boom box: a band-limited little speaker with a bit of body
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 900; pk.Q.value = 0.8; pk.gain.value = 3;
      const g = ac.createGain(); g.gain.value = 0;
      hp.connect(pk); pk.connect(lp); lp.connect(g); g.connect(master);
      J.out = { input: hp, gain: g }; return J.out;
    }
    function env(node, t0, a, peak, dec) { node.gain.setValueAtTime(0.0001, t0); node.gain.linearRampToValueAtTime(peak, t0 + a); node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
    function bass(m, t0, dur) { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 2; f.type = 'lowpass'; f.frequency.value = 700; const g2 = ac.createGain(); g2.gain.value = 0.25; o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(jOut().input); env(g, t0, 0.012, 0.32, dur * 0.95); o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1); J.lastBass = t0; }
    function tick(t0, freq, dur, gain) { const sN = ac.createBufferSource(); sN.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq; const g = ac.createGain(); sN.connect(f); f.connect(g); g.connect(jOut().input); env(g, t0, 0.002, gain, dur); sN.start(t0, Math.random()); sN.stop(t0 + dur + 0.05); }
    function ride(t0, accent) { tick(t0, 7000, 0.32, accent ? 0.05 : 0.032); const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 3170; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 3; o.connect(f); f.connect(g); g.connect(jOut().input); env(g, t0, 0.002, 0.008, 0.25); o.start(t0); o.stop(t0 + 0.3); }
    function keys(notes, t0, dur, gain) { notes.forEach((m, i) => { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o2.type = 'sine'; o.frequency.value = mtof(m) * (1 + (i - 1.5) * 0.0007); o2.frequency.value = mtof(m) * 2.001; const g2 = ac.createGain(); g2.gain.value = 0.18; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(jOut().input); env(g, t0 + i * 0.006, 0.006, gain, dur); o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.2); o2.stop(t0 + dur + 0.2); }); }
    function vibes(m, t0, dur) { const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), g2 = ac.createGain(), trem = ac.createOscillator(), tg = ac.createGain(); o.type = 'sine'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 4; g2.gain.value = 0.12; trem.frequency.value = 5.2; tg.gain.value = 0.25; const vca = ac.createGain(); vca.gain.value = 0.75; trem.connect(tg); tg.connect(vca.gain); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(vca); vca.connect(jOut().input); env(g, t0, 0.004, 0.2, Math.max(0.6, dur * 1.6)); o.start(t0); o2.start(t0); trem.start(t0); const end = t0 + Math.max(0.6, dur * 1.6) + 0.2; o.stop(end); o2.stop(end); trem.stop(end); }
    function schedule() {
      const beat = 60 / J.bpm, e8 = [0, beat * 0.66]; // swung eighths
      while (J.next < ac.currentTime + 0.15) {
        const st = J.step, bar = Math.floor(st / 8) % 4, inBar = st % 8, beatN = Math.floor(inBar / 2), off = inBar % 2;
        const t0 = J.next + (off ? e8[1] - beat * 0.5 : 0) + (Math.random() - 0.5) * 0.008;
        const B = BARS[bar];
        if (!off) {
          bass(B.bass[beatN], t0, beat * 0.92);
          ride(t0, beatN % 2 === 1);
          if (beatN % 2 === 1) tick(t0, 9000, 0.05, 0.03); // hi-hat foot on 2 and 4
        } else {
          if (beatN === 1 || beatN === 3) ride(t0, false); // the skip note of the ride
          if ((beatN === 1 && bar % 2 === 0) || (beatN === 3 && bar % 2 === 1) || (beatN === 0 && bar === 3)) keys(B.chord, t0, beat * 1.2, 0.05); // comping
        }
        const chorus = MEL[Math.floor(st / 32) % 2], idx = st % 32;
        chorus.forEach(n => { if (n[0] === idx) vibes(n[1], t0, n[2] * beat * 0.5); });
        J.step++; J.next += beat * 0.5;
      }
    }

    // ---- the campfire: a guitar strummed once per chord, the chords carrying a simple melody; the fire crackling
    const G = { on: false, timer: null, next: 0, step: 0, out: null, cache: {}, fire: null, strumCb: null, nextPop: 0 };
    // Karplus–Strong plucked string, rendered once per note into a buffer
    function pluckBuf(m) {
      if (G.cache[m]) return G.cache[m];
      const sr = ac.sampleRate, f = mtof(m), N = Math.max(2, Math.round(sr / f)), len = Math.round(sr * 3.2), buf = ac.createBuffer(1, len, sr), d = buf.getChannelData(0);
      const ring = new Float32Array(N); for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / N * Math.PI));
      let p = 0, prev = 0; const damp = 0.4985 + Math.min(0.0012, f / 900000);
      for (let i = 0; i < len; i++) { const cur2 = ring[p], nxt = ring[(p + 1) % N]; const v = damp * (cur2 + nxt); ring[p] = v; prev = v; d[i] = cur2; p = (p + 1) % N; }
      G.cache[m] = buf; return buf;
    }
    function gOut() {
      if (G.out) return G.out;
      const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1.2; body.gain.value = 5;
      const top = ac.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 4200;
      const g = ac.createGain(); g.gain.value = 0;
      const verb = ac.createConvolver(); { const L = Math.round(ac.sampleRate * 1.6), ir = ac.createBuffer(2, L, ac.sampleRate); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, 3.2) * 0.5; } verb.buffer = ir; }
      const wet = ac.createGain(); wet.gain.value = 0.22;
      body.connect(top); top.connect(g); g.connect(master); top.connect(verb); verb.connect(wet); wet.connect(g);
      G.out = { input: body, gain: g }; return G.out;
    }
    // G – Em – C – D, each bar a strum on beats 1, 2+ and 3 and 4; the top string of each voicing walks a little tune
    const CH = [
      { notes: [43, 47, 50, 55, 59], top: [67, 67, 69, 71] },  // G   (top melody notes per strum)
      { notes: [40, 47, 52, 55, 59], top: [71, 69, 67, 67] },  // Em
      { notes: [48, 52, 55, 60, 64], top: [64, 67, 69, 72] },  // C
      { notes: [50, 57, 62, 66], top: [69, 66, 69, 74] }       // D
    ];
    const RHY = [0, 1.5, 2, 3]; // beats within the bar for the four strums
    function strum(chord, topNote, t0, gain) {
      const notes = chord.notes.concat([topNote]); const o = gOut();
      notes.forEach((m, i) => { const s2 = ac.createBufferSource(); s2.buffer = pluckBuf(m); const g = ac.createGain(); g.gain.value = gain * (i === notes.length - 1 ? 1.25 : 0.62 + i * 0.04); s2.connect(g); g.connect(o.input); const ti = t0 + i * 0.014; s2.start(ti); s2.stop(ti + 3.2); });
      if (G.strumCb) { const delay = Math.max(0, (t0 - ac.currentTime) * 1000 - 40); setTimeout(() => { try { G.strumCb(); } catch (e) { /* the hand is cosmetic */ } }, delay); }
    }
    function crackle(t0) {
      // a pop: a very short bright click, sometimes a quick run of them
      const n = Math.random() < 0.25 ? 2 + (Math.random() * 4 | 0) : 1;
      for (let k = 0; k < n; k++) { const t = t0 + k * (0.01 + Math.random() * 0.05); const s2 = ac.createBufferSource(); s2.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 3500; f.Q.value = 1.5 + Math.random() * 3; const g = ac.createGain(); const a = 0.05 + Math.random() * 0.12; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.012 + Math.random() * 0.05); s2.connect(f); f.connect(g); g.connect(master); s2.start(t, Math.random()); s2.stop(t + 0.1); }
    }
    function fireBed() {
      if (G.fire) return G.fire;
      const s2 = src(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = ac.createGain(); g.gain.value = 0;
      const s3 = src(), f3 = ac.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 900; f3.Q.value = 0.5; const g3 = ac.createGain(); g3.gain.value = 0.18;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.31; const lg = ac.createGain(); lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g3.gain); lfo.start();
      s2.connect(f); f.connect(g); s3.connect(f3); f3.connect(g3); g3.connect(g); g.connect(master); G.fire = g; return g;
    }
    function campSchedule() {
      const beat = 60 / 84, bar = beat * 4;
      while (G.next < ac.currentTime + 0.2) {
        const st = G.step, b = Math.floor(st / 4) % 4, k = st % 4;
        const t0 = Math.floor(st / 4) * bar + RHY[k] * beat + G.start + (Math.random() - 0.5) * 0.012;
        strum(CH[b], CH[b].top[k], t0, k === 0 ? 0.17 : 0.13);
        G.step++; const nb = Math.floor(G.step / 4), nk = G.step % 4; G.next = nb * bar + RHY[nk] * beat + G.start;
      }
      while (G.nextPop < ac.currentTime + 0.2) { crackle(G.nextPop); G.nextPop += 0.06 + Math.random() * Math.random() * 0.7; }
    }


    // ---- my recorded voice, decoded once per line
    const voiceCache = {};
    function loadVoice(url) { if (!voiceCache[url]) voiceCache[url] = fetch(url).then(r => r.arrayBuffer()).then(a => new Promise((res, rej) => ac.decodeAudioData(a, res, rej))); return voiceCache[url]; }
    // ---- memory sounds: little foley for the onomatopoeia that fall down the screen
    let memBus = null;
    function bus() { if (!memBus) { memBus = ac.createGain(); memBus.gain.value = 1; memBus.connect(master); } return memBus; }
    function walk(n, base, amp, seed) { const a = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v += (Math.random() - 0.5) * amp; v *= 0.92; a[i] = Math.max(8, base[i] + v); } return a; }
    function creak(t0, pitch) {
      // a stick-slip creak: a buzzy low pulse, wandering in pitch, rung through the resonances of a plastic-and-metal chair
      const dur = 0.42 + Math.random() * 0.12, o = ac.createOscillator(); o.type = 'sawtooth';
      const n = 64, base = new Float32Array(n); for (let i = 0; i < n; i++) { const u = i / (n - 1); base[i] = pitch * (0.8 + 0.9 * Math.sin(u * Math.PI) + 0.3 * u); }
      o.frequency.setValueCurveAtTime(walk(n, base, pitch * 0.5), t0, dur);
      const out = ac.createGain(); out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(0.22, t0 + 0.05); out.gain.setValueAtTime(0.2, t0 + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260; o.connect(hp);
      [[820, 7, 1], [1650, 6, 0.7], [2900, 5, 0.35]].forEach(r => { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = r[0] * (0.95 + Math.random() * 0.1); f.Q.value = r[1]; const g = ac.createGain(); g.gain.value = r[2]; hp.connect(f); f.connect(g); g.connect(out); });
      out.connect(bus()); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function spin(t0) {
      // the swivel: a whirr that slows down, with the soft tick of the base each turn
      const dur = 2.4, n = 240, amp = new Float32Array(n), fq = new Float32Array(n); let ph = 0; const ticks = [];
      for (let i = 0; i < n; i++) { const u = i / (n - 1), rate = 2.6 - 1.9 * u; const prev = ph; ph += rate * dur / n * Math.PI * 2; if (Math.floor(prev / (Math.PI * 2)) !== Math.floor(ph / (Math.PI * 2))) ticks.push(u * dur); const env = Math.min(1, u * 8) * Math.pow(1 - u, 1.4); amp[i] = 0.0001 + env * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.cos(ph), 2)) * 0.16; fq[i] = 520 - 260 * u + 120 * Math.cos(ph); }
      const s = ac.createBufferSource(); s.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6; f.frequency.setValueCurveAtTime(fq, t0, dur);
      const g = ac.createGain(); g.gain.setValueCurveAtTime(amp, t0, dur); s.connect(f); f.connect(g); g.connect(bus()); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
      ticks.forEach(t => { const tt = t0 + t, b = ac.createBufferSource(); b.buffer = noise; const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2400 + Math.random() * 600; bf.Q.value = 5; const bg = ac.createGain(); bg.gain.setValueAtTime(0.0001, tt); bg.gain.linearRampToValueAtTime(0.05, tt + 0.003); bg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05); b.connect(bf); bf.connect(bg); bg.connect(bus()); b.start(tt, Math.random()); b.stop(tt + 0.08); });
      creak(t0 + dur - 0.35, 60);
    }
    function snore(t0) {
      // breathe in through a fluttering soft palate, breathe out with a soft puff
      const inD = 1.35, outD = 1.1;
      const s = ac.createBufferSource(); s.buffer = noise; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
      const flutter = ac.createGain(); flutter.gain.value = 0.5; const fo = ac.createOscillator(); fo.type = 'sawtooth'; fo.frequency.setValueAtTime(24, t0); fo.frequency.linearRampToValueAtTime(31, t0 + inD); const fd = ac.createGain(); fd.gain.value = 0.5; fo.connect(fd); fd.connect(flutter.gain);
      const tone = ac.createOscillator(); tone.type = 'sawtooth'; tone.frequency.setValueAtTime(78, t0); tone.frequency.linearRampToValueAtTime(92, t0 + inD); const tg = ac.createGain(); tg.gain.value = 0.05; const tl = ac.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 420; tone.connect(tl); tl.connect(tg); tg.connect(flutter);
      const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 300; body.Q.value = 1.2; body.gain.value = 8;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.5, t0 + inD * 0.55); g.gain.linearRampToValueAtTime(0.42, t0 + inD * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t0 + inD);
      s.connect(lp); lp.connect(flutter); flutter.connect(body); body.connect(g); g.connect(bus());
      s.start(t0, Math.random()); s.stop(t0 + inD + 0.05); fo.start(t0); fo.stop(t0 + inD + 0.05); tone.start(t0); tone.stop(t0 + inD + 0.05);
      const t1 = t0 + inD + 0.25, s2 = ac.createBufferSource(); s2.buffer = noise; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1100, t1); bp.frequency.linearRampToValueAtTime(700, t1 + outD); bp.Q.value = 0.8;
      const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, t1); g2.gain.linearRampToValueAtTime(0.09, t1 + 0.2); g2.gain.exponentialRampToValueAtTime(0.0001, t1 + outD); s2.connect(bp); bp.connect(g2); g2.connect(bus()); s2.start(t1, Math.random()); s2.stop(t1 + outD + 0.05);
    }

    // ---- more memory foley
    function hit(t0, partials, decay, gain, out) {
      // a struck thing: a few inharmonic sine partials with fast decays and a click of noise
      partials.forEach((p, i) => { const o = ac.createOscillator(); o.frequency.value = p[0]; const g = ac.createGain(); const d = decay * (p[2] || 1); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain * p[1], t0 + 0.0015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(out || bus()); o.start(t0); o.stop(t0 + d + 0.02); });
      const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000; const g = ac.createGain(); g.gain.setValueAtTime(gain * 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012); b.connect(f); f.connect(g); g.connect(out || bus()); b.start(t0, Math.random()); b.stop(t0 + 0.03);
    }
    function swish(t0, dur, freq, gain, q) {
      const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 0.9; f.frequency.setValueAtTime(freq * 0.7, t0); f.frequency.linearRampToValueAtTime(freq * 1.3, t0 + dur * 0.6); f.frequency.linearRampToValueAtTime(freq, t0 + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + dur + 0.05);
    }
    function knock(t0, freq, dur, gain) { const o = ac.createOscillator(); o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur); const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(bus()); o.start(t0); o.stop(t0 + dur + 0.02); }
    // pool: phenolic balls are hard and bright: an impulse rung through a few tight resonances, very short
    function res(t0, freqs, decay, gain, out) {
      const b = ac.createBufferSource(); b.buffer = noise; const env = ac.createGain();
      env.gain.setValueAtTime(1, t0); env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.004); b.connect(env);
      freqs.forEach(f => { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[0] * decay * 3.1; const g = ac.createGain(); g.gain.value = gain * f[1] * 9; env.connect(bp); bp.connect(g); g.connect(out || bus()); });
      b.start(t0, Math.random()); b.stop(t0 + 0.02);
    }
    function clack(t0, k) {
      k = k == null ? 1 : k; const v = 0.92 + Math.random() * 0.16;
      res(t0, [[2150 * v, 1], [3480 * v, 0.7], [5600 * v, 0.45], [7900 * v, 0.2]], 0.035, 0.6 * k);
      knock(t0, 260 * v, 0.03, 0.08 * k);
    }
    function cueTip(t0, k) { // leather tip on the cue ball: a dull "tock" with a crack on top when it is hard
      knock(t0, 520, 0.035, 0.12 * k); res(t0, [[1250, 1], [2300, 0.5]], 0.02, 0.06 * k);
      if (k > 1) { const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; const g = ac.createGain(); g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + 0.06); }
    }
    function roll(t0, dur, k) { // a ball rolling on cloth: a soft low rumble
      const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.09 * k, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + dur + 0.05);
    }
    function cushion(t0, k) { knock(t0, 105, 0.11, 0.2 * k); swish(t0, 0.06, 500, 0.05 * k, 0.7); }
    function pocket(t0, fast) {
      // a fast ball snaps against the jaw, drops, and rattles down the return channel
      if (fast) { res(t0, [[900, 1], [1650, 0.6]], 0.03, 0.08); knock(t0, 140, 0.08, 0.25); }
      knock(t0 + 0.06, 85, 0.16, 0.17);
      let t = t0 + 0.25, gap = 0.11;
      for (let i = 0; i < 9; i++) { res(t, [[700 + Math.random() * 300, 1], [1500 + Math.random() * 400, 0.5]], 0.02, 0.035 * (1 - i / 11)); t += gap; gap *= 0.86; }
      roll(t0 + 0.2, 1.4, 0.8);
      clack(t + 0.2, 0.45); // and knocks into the balls already in the tray
    }
    function poolShot(t0) { // lining up, a firm stroke, the cue ball into the object ball, and it drops fast into the pocket
      cueTip(t0, 1); roll(t0 + 0.02, 0.5, 1); clack(t0 + 0.42, 1); roll(t0 + 0.45, 0.55, 0.8); pocket(t0 + 0.92, true);
    }
    function poolBreak(t0) { // ramming the cue into the rack
      cueTip(t0, 1.6); roll(t0, 0.3, 1.2);
      clack(t0 + 0.25, 1.3);
      for (let i = 0; i < 14; i++) clack(t0 + 0.27 + Math.pow(Math.random(), 1.6) * 0.5, 0.35 + Math.random() * 0.6);
      for (let i = 0; i < 5; i++) cushion(t0 + 0.55 + Math.random() * 0.8, 0.5 + Math.random() * 0.5);
      roll(t0 + 0.3, 2.2, 1.3);
      for (let i = 0; i < 4; i++) clack(t0 + 1.2 + Math.random() * 1.0, 0.2 + Math.random() * 0.3);
      pocket(t0 + 1.0, true);
    }
    // fridge: the seal unsticks, the door creaks open; cutlery in a drawer
    function fridgeOpen(t0) {
      swish(t0, 0.18, 350, 0.12, 0.7); knock(t0, 70, 0.12, 0.1);             // the seal unsticks
      // a long, slow hinge creak that bends in pitch as the door swings
      const d = 2.3, o = ac.createOscillator(); o.type = 'sawtooth'; const n = 120, base = new Float32Array(n);
      for (let i = 0; i < n; i++) { const u = i / (n - 1); base[i] = 26 + 30 * Math.sin(u * Math.PI * 1.3) + 14 * u; }
      o.frequency.setValueCurveAtTime(walk(n, base, 22), t0 + 0.15, d);
      const out = ac.createGain(); out.gain.setValueAtTime(0.0001, t0 + 0.15); out.gain.linearRampToValueAtTime(0.55, t0 + 0.5); out.gain.setValueAtTime(0.48, t0 + d - 0.5); out.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15 + d);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; o.connect(hp);
      [[640, 9, 1], [1350, 7, 0.65], [2500, 6, 0.3]].forEach(r => { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = r[0]; f.Q.value = r[1]; const g = ac.createGain(); g.gain.value = r[2]; hp.connect(f); f.connect(g); g.connect(out); });
      out.connect(bus()); o.start(t0 + 0.15); o.stop(t0 + d + 0.25);
      hit(t0 + d + 0.1, [[2200, 0.3, 1], [3400, 0.2, 0.7]], 0.08, 0.04);       // bottles touching in the door
    }
    function rumble(t0) {
      // a stomach: low gurgles that slide in pitch, bubbling through a soft, wet resonance
      const d = 2.2, o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(48, t0); o.frequency.linearRampToValueAtTime(70, t0 + 0.6); o.frequency.linearRampToValueAtTime(38, t0 + 1.3); o.frequency.linearRampToValueAtTime(62, t0 + d);
      const am = ac.createGain(); am.gain.value = 0.5; const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(7, t0); lfo.frequency.linearRampToValueAtTime(13, t0 + d); const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(180, t0); f.frequency.linearRampToValueAtTime(320, t0 + 0.8); f.frequency.linearRampToValueAtTime(140, t0 + d);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.3); g.gain.setValueAtTime(0.45, t0 + d - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(am); am.connect(f); f.connect(lp); lp.connect(g); g.connect(bus());
      o.start(t0); o.stop(t0 + d + 0.05); lfo.start(t0); lfo.stop(t0 + d + 0.05);
      for (let i = 0; i < 6; i++) { const t = t0 + 0.2 + Math.random() * (d - 0.4); knock(t, 90 + Math.random() * 80, 0.05, 0.08); } // little bubbles
    }
    function sipAah(t0) {
      // a can opening, a quick slurp, a swallow, then a satisfied "ahh"
      swish(t0, 0.12, 3500, 0.12, 0.6); knock(t0, 900, 0.02, 0.05);
      const f0 = ac.createBufferSource(); f0.buffer = noise; const fz = ac.createBiquadFilter(); fz.type = 'highpass'; fz.frequency.value = 5000; const fg = ac.createGain(); fg.gain.setValueAtTime(0.03, t0 + 0.1); fg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9); f0.connect(fz); fz.connect(fg); fg.connect(bus()); f0.start(t0 + 0.1, Math.random()); f0.stop(t0 + 0.95);
      swish(t0 + 0.8, 0.35, 1800, 0.07, 2.5);                                                   // slurp
      knock(t0 + 1.25, 130, 0.12, 0.11); knock(t0 + 1.32, 220, 0.05, 0.06);                    // gulp
      const ta = t0 + 1.6, d = 1.05, o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(205, ta); o.frequency.linearRampToValueAtTime(175, ta + 0.4); o.frequency.exponentialRampToValueAtTime(120, ta + d);
      const out = ac.createGain(); out.gain.setValueAtTime(0.0001, ta); out.gain.linearRampToValueAtTime(0.14, ta + 0.08); out.gain.setValueAtTime(0.12, ta + 0.45); out.gain.exponentialRampToValueAtTime(0.0001, ta + d);
      [[820, 6, 1], [1250, 8, 0.6], [2700, 10, 0.18]].forEach(fm => { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fm[0]; f.Q.value = fm[1]; const g = ac.createGain(); g.gain.value = fm[2] * 2.4; o.connect(f); f.connect(g); g.connect(out); });
      const br = ac.createBufferSource(); br.buffer = noise; const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1300; bf.Q.value = 0.6; const bg = ac.createGain(); bg.gain.setValueAtTime(0.09, ta); bg.gain.exponentialRampToValueAtTime(0.0001, ta + d + 0.2); br.connect(bf); bf.connect(bg); bg.connect(out);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; out.connect(lp); lp.connect(bus());
      o.start(ta); o.stop(ta + d + 0.05); br.start(ta, Math.random()); br.stop(ta + d + 0.25);
    }
    function cutlery(t0) { for (let i = 0; i < 5; i++) { const t = t0 + i * (0.07 + Math.random() * 0.09), f = 2400 + Math.random() * 2200; hit(t, [[f, 1, 1], [f * 2.76, 0.5, 0.6], [f * 5.4, 0.25, 0.4], [f * 0.51, 0.3, 1.4]], 0.18 + Math.random() * 0.2, 0.06); } }
    // clothes: fabric rustles and a shake-out flap; the iron hisses steam and slides
    function fold(t0) { swish(t0, 0.32, 2600, 0.07); swish(t0 + 0.38, 0.26, 3200, 0.05); swish(t0 + 0.7, 0.4, 1800, 0.06); }
    function flap(t0) { swish(t0, 0.14, 900, 0.16, 0.6); knock(t0 + 0.08, 95, 0.09, 0.12); }
    function iron(t0) {
      const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; const g = ac.createGain();
      f.frequency.setValueAtTime(380, t0); for (let i = 0; i < 4; i++) { f.frequency.linearRampToValueAtTime(i % 2 ? 380 : 620, t0 + 0.5 + i * 0.55); }
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.07, t0 + 0.2); g.gain.setValueAtTime(0.07, t0 + 2.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
      b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + 2.7);
      const h = ac.createBufferSource(); h.buffer = noise; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800; const hg = ac.createGain(); const ts = t0 + 0.9;
      hg.gain.setValueAtTime(0.0001, ts); hg.gain.linearRampToValueAtTime(0.09, ts + 0.05); hg.gain.exponentialRampToValueAtTime(0.0001, ts + 1.0); h.connect(hp); hp.connect(hg); hg.connect(bus()); h.start(ts, Math.random()); h.stop(ts + 1.05);
      knock(t0 + 2.75, 140, 0.1, 0.14); hit(t0 + 2.75, [[1300, 0.4, 1]], 0.05, 0.05);
    }
    // the bed: a big sleepy yawn, a voice gliding up and down through "aah" to "oh"
    function yawn(t0) {
      const d = 2.1, o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(150, t0); o.frequency.linearRampToValueAtTime(235, t0 + d * 0.35); o.frequency.linearRampToValueAtTime(200, t0 + d * 0.6); o.frequency.exponentialRampToValueAtTime(105, t0 + d);
      const vib = ac.createOscillator(); vib.frequency.value = 5; const vg = ac.createGain(); vg.gain.value = 3; vib.connect(vg); vg.connect(o.frequency);
      const out = ac.createGain(); out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(0.16, t0 + 0.4); out.gain.setValueAtTime(0.14, t0 + d * 0.65); out.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      [[750, 520, 6, 1], [1150, 850, 8, 0.55], [2600, 2400, 10, 0.2]].forEach(fm => { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = fm[2]; f.frequency.setValueAtTime(fm[0] * 0.8, t0); f.frequency.linearRampToValueAtTime(fm[0], t0 + d * 0.3); f.frequency.linearRampToValueAtTime(fm[1], t0 + d); const g = ac.createGain(); g.gain.value = fm[3] * 2.2; o.connect(f); f.connect(g); g.connect(out); });
      const br = ac.createBufferSource(); br.buffer = noise; const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.7; const bg = ac.createGain(); bg.gain.value = 0.05; br.connect(bf); bf.connect(bg); bg.connect(out);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; out.connect(lp); lp.connect(bus());
      o.start(t0); o.stop(t0 + d + 0.05); vib.start(t0); vib.stop(t0 + d + 0.05); br.start(t0, Math.random()); br.stop(t0 + d + 0.05);
    }
    // the guitar: a random chord from a small bank, sometimes strummed, sometimes picked out one string at a time
    const RCH = [[48, 52, 55, 60, 64], [43, 47, 50, 55, 59, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60, 65], [40, 47, 52, 55, 59, 64], [50, 57, 62, 66], [40, 47, 52, 56, 59, 64], [41, 48, 53, 57, 60], [40, 47, 52, 55, 62, 64], [45, 52, 57, 61, 64]];
    function gtrOut() {
      const b = bus(); if (b.gtr) return b.gtr;
      const body = ac.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 220; body.Q.value = 1.2; body.gain.value = 5;
      const top = ac.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 4200; const g = ac.createGain(); g.gain.value = 0.55;
      body.connect(top); top.connect(g); g.connect(b); b.gtr = body; return body;
    }
    function chord(t0) {
      const c = RCH[Math.floor(Math.random() * RCH.length)], up = Math.random() < 0.3, pick = Math.random() < 0.35, out = gtrOut();
      const order = up ? c.slice().reverse() : c;
      order.forEach((m, i) => { const s2 = ac.createBufferSource(); s2.buffer = pluckBuf(m); const g = ac.createGain(); g.gain.value = pick ? 0.5 : 0.36; s2.connect(g); g.connect(out); const ti = t0 + i * (pick ? 0.16 : 0.016); s2.start(ti); s2.stop(ti + 3.2); });
    }

    // ---- the controller: chiptune zaps and button mashing
    function chip(t0, type, f0, f1, dur, gain) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.setValueAtTime(gain, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; o.connect(lp); lp.connect(g); g.connect(bus()); o.start(t0); o.stop(t0 + dur + 0.02); }
    function game(t0) {
      const r = Math.random();
      if (r < 0.35) { chip(t0, 'square', 1800, 180, 0.18, 0.05); chip(t0 + 0.22, 'square', 1500, 150, 0.16, 0.04); }          // zap zap
      else if (r < 0.55) { chip(t0, 'square', 988, 988, 0.08, 0.04); chip(t0 + 0.08, 'square', 1319, 1319, 0.3, 0.04); }      // coin
      else if (r < 0.75) { chip(t0, 'square', 300, 900, 0.22, 0.045); }                                                      // jump
      else { swish(t0, 0.5, 500, 0.12, 0.5); chip(t0, 'triangle', 160, 40, 0.45, 0.12); }                                    // K.O. boom
    }
    function mash(t0) { const n = 9 + (Math.random() * 6 | 0); let t = t0; for (let i = 0; i < n; i++) { hit(t, [[1900 + Math.random() * 500, 0.6, 1], [3400, 0.3, 0.5]], 0.025, 0.07); knock(t, 340 + Math.random() * 60, 0.025, 0.04); t += 0.07 + Math.random() * 0.06; } }
    // ---- the study books: pencil scribbling, pages turning, a tired sigh
    function scribble(t0) {
      const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3600; f.Q.value = 1.4; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = ac.createGain(), d = 2.2; g.gain.setValueAtTime(0.0001, t0);
      let t = t0; while (t < t0 + d) { const st = 0.06 + Math.random() * 0.11; g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + st * 0.3); g.gain.linearRampToValueAtTime(0.004, t + st); t += st + (Math.random() < 0.15 ? 0.15 : 0.01); }
      g.gain.linearRampToValueAtTime(0.0001, t + 0.05); b.connect(f); f.connect(hp); hp.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t + 0.1);
      knock(t + 0.05, 900, 0.03, 0.03); // the pencil tapping down at the end
    }
    function pageFlip(t0) { swish(t0, 0.35, 2200, 0.09, 0.7); for (let i = 0; i < 4; i++) hit(t0 + 0.05 + i * 0.06 + Math.random() * 0.03, [[2600 + Math.random() * 1500, 0.4, 1]], 0.02, 0.03); swish(t0 + 0.28, 0.2, 800, 0.05, 0.8); }
    function riffle(t0) { for (let i = 0; i < 7; i++) pageFlip(t0 + i * 0.13 + Math.random() * 0.03); }
    function sigh(t0) {
      const d = 1.7, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(1200, t0); f.frequency.exponentialRampToValueAtTime(450, t0 + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(125, t0 + 0.1); o.frequency.exponentialRampToValueAtTime(82, t0 + 1.0); const vf = ac.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 600; vf.Q.value = 4;
      const vg = ac.createGain(); vg.gain.setValueAtTime(0.0001, t0 + 0.1); vg.gain.linearRampToValueAtTime(0.07, t0 + 0.3); vg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0); o.connect(vf); vf.connect(vg); vg.connect(bus()); o.start(t0 + 0.1); o.stop(t0 + 1.05);
    }
    // ---- the door: a slow creak, the latch, a knock
    function doorOpen(t0) { hit(t0, [[1500, 0.5, 1], [2600, 0.3, 0.6]], 0.05, 0.08); knock(t0, 220, 0.04, 0.06); creak(t0 + 0.12, 34); creak(t0 + 0.55, 30); }
    function doorKnock(t0) { [0, 0.22, 0.75, 0.93].forEach(t => { knock(t0 + t, 160, 0.09, 0.2); hit(t0 + t, [[620, 0.4, 1], [1100, 0.2, 0.7]], 0.05, 0.05); }); }
    function doorShut(t0) { swish(t0, 0.25, 400, 0.05, 0.6); knock(t0 + 0.22, 75, 0.2, 0.22); hit(t0 + 0.24, [[1700, 0.4, 1]], 0.04, 0.06); }
    // ---- the window: rain on the glass, a gust of wind, a bird
    function rain(t0) {
      const d = 4.2, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 0.8); g.gain.setValueAtTime(0.035, t0 + d - 1); g.gain.linearRampToValueAtTime(0.0001, t0 + d); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05);
      for (let i = 0; i < 40; i++) { const t = t0 + 0.3 + Math.random() * (d - 0.8); hit(t, [[2500 + Math.random() * 3000, 1, 1]], 0.015 + Math.random() * 0.02, 0.012 + Math.random() * 0.025); }
    }
    function gust(t0) { swish(t0, 2.4, 420, 0.07, 0.6); swish(t0 + 0.6, 1.8, 900, 0.035, 1.2); }
    function bird(t0) { for (let i = 0; i < 3; i++) { const t = t0 + i * 0.18; chip(t, 'sine', 3400 + Math.random() * 400, 4600 + Math.random() * 500, 0.09, 0.03); } chip(t0 + 0.7, 'sine', 4800, 3300, 0.22, 0.03); }

    // ---- the pencil in the notebook: crisp graphite strokes on paper
    function pencilStroke(t0, dur, kind) {
      const out = ac.createGain(); out.gain.value = kind === 'title' ? 1.1 : 1; out.connect(master);
      const b = ac.createBufferSource(); b.buffer = noise;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const bp = ac.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 5600; bp.Q.value = 0.8; bp.gain.value = 7;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 11000;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0);
      if (kind === 'underline') {
        bp.frequency.setValueAtTime(4800, t0); bp.frequency.linearRampToValueAtTime(6200, t0 + dur);
        g.gain.linearRampToValueAtTime(0.075, t0 + 0.04); g.gain.setValueAtTime(0.07, t0 + dur - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);
      } else {
        // one stroke per bit of a letter: short scratches of uneven weight, tiny gaps where the pencil turns
        let t = t0; const slow = kind === 'title' ? 1.5 : 1;
        while (t < t0 + dur) {
          const st = (0.035 + Math.random() * 0.06) * slow, pk = 0.04 + Math.random() * 0.06;
          g.gain.linearRampToValueAtTime(pk, t + st * 0.25); g.gain.linearRampToValueAtTime(pk * 0.55, t + st * 0.8); g.gain.linearRampToValueAtTime(0.004, t + st);
          if (Math.random() < 0.3) hit(t + st * 0.2, [[6500 + Math.random() * 2500, 0.5, 1]], 0.008, 0.035, out);
          t += st + (Math.random() < 0.12 ? 0.05 * slow : 0.004);
        }
        g.gain.linearRampToValueAtTime(0.0001, t + 0.02);
        hit(t0, [[1500, 0.5, 1], [3200, 0.3, 0.6]], 0.02, 0.05, out); // the tip touching down
      }
      b.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(g); g.connect(out);
      b.start(t0, Math.random() * 1.5); b.stop(t0 + dur + 0.2);
      setTimeout(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, (t0 - ac.currentTime + dur + 1) * 1000);
    }

    // ---- kitchen memories
    function freezerOpen(t0) { swish(t0, 0.15, 400, 0.12, 0.7); knock(t0, 65, 0.1, 0.12); swish(t0 + 0.12, 1.6, 700, 0.05, 0.5); hit(t0 + 0.4, [[2600, 0.3, 1], [3900, 0.2, 0.6]], 0.06, 0.03); }
    function brrr(t0) { // a shiver through the lips: a buzzy voice trilling on and off
      const d = 1.3, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(150, t0); o.frequency.linearRampToValueAtTime(120, t0 + d);
      const am = ac.createGain(); am.gain.value = 0.5; const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 26; const lg = ac.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 2.5; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.4, t0 + 0.1); g.gain.setValueAtTime(0.35, t0 + d - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(am); am.connect(f); f.connect(g); g.connect(bus()); o.start(t0); o.stop(t0 + d + 0.05); lfo.start(t0); lfo.stop(t0 + d + 0.05);
    }
    function chatter(t0) { for (let i = 0; i < 10; i++) hit(t0 + i * 0.075 + Math.random() * 0.015, [[1700 + Math.random() * 300, 0.6, 1], [3300, 0.3, 0.6]], 0.025, 0.06); }
    function tap(t0) { // the tap running into a full sink, with drips and a few dishes
      const d = 3.2, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.09, t0 + 0.15); g.gain.setValueAtTime(0.09, t0 + d - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      const wob = ac.createOscillator(); wob.frequency.value = 9; const wg = ac.createGain(); wg.gain.value = 400; wob.connect(wg); wg.connect(f.frequency);
      b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05); wob.start(t0); wob.stop(t0 + d + 0.05);
      for (let i = 0; i < 14; i++) { const t = t0 + 0.2 + Math.random() * (d - 0.3); chip(t, 'sine', 700 + Math.random() * 700, 1400 + Math.random() * 900, 0.04, 0.03); }
    }
    function dishes(t0) { for (let i = 0; i < 4; i++) { const t = t0 + i * (0.18 + Math.random() * 0.2), f = 1600 + Math.random() * 900; hit(t, [[f, 1, 1], [f * 2.4, 0.5, 0.7], [f * 4.1, 0.25, 0.5]], 0.22, 0.07); } }
    function bubbles(t0) { for (let i = 0; i < 9; i++) { const t = t0 + i * 0.11 + Math.random() * 0.06, f = 350 + Math.random() * 450; chip(t, 'sine', f, f * 2.6, 0.07, 0.07); } }
    function hoodFan(t0) {
      const d = 4.0, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.8); g.gain.setValueAtTime(0.1, t0 + d - 0.6); g.gain.linearRampToValueAtTime(0.0001, t0 + d);
      b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05);
      const o = ac.createOscillator(); o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(118, t0 + 0.8); const og = ac.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.linearRampToValueAtTime(0.06, t0 + 0.8); og.gain.setValueAtTime(0.06, t0 + d - 0.6); og.gain.linearRampToValueAtTime(0.0001, t0 + d);
      o.connect(og); og.connect(bus()); o.start(t0); o.stop(t0 + d + 0.05);
      knock(t0, 300, 0.03, 0.08); hit(t0, [[2400, 0.4, 1]], 0.03, 0.05); // the switch
    }
    function sizzle(t0) { const d = 2.4, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05); for (let i = 0; i < 25; i++) hit(t0 + Math.random() * d * 0.8, [[4000 + Math.random() * 3000, 0.6, 1]], 0.01, 0.03); }
    function cough(t0) { [0, 0.42].forEach((dt, i) => { const t = t0 + dt; swish(t, 0.22, 900 - i * 150, 0.34, 0.8); const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(190 - i * 20, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.18); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(f); f.connect(g); g.connect(bus()); o.start(t); o.stop(t + 0.25); }); }

    // ---- pool room memories
    function kick(t0, k) { const o = ac.createOscillator(); o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.22); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.38 * k, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38); o.connect(g); g.connect(bus()); o.start(t0); o.stop(t0 + 0.42); hit(t0, [[1800, 0.3, 1]], 0.012, 0.05 * k); }
    function boom(t0) { [[0, 1], [0.26, 0.8], [0.62, 0.9], [0.88, 1]].forEach(b => kick(t0 + b[0], b[1])); }      // dum-dum ba dum
    function laughVoice(t0, f0, n, gain) { // "ha-ha-ha": voiced syllables through an open "ah" vowel, falling a little each time
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (0.17 + Math.random() * 0.04), d = 0.12, o = ac.createOscillator(); o.type = 'sawtooth';
        const f = f0 * (1.15 - i * 0.04) * (0.95 + Math.random() * 0.1); o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.86, t + d);
        const out = ac.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(gain, t + 0.015); out.gain.exponentialRampToValueAtTime(0.0001, t + d);
        [[760, 6, 1], [1220, 8, 0.6], [2600, 10, 0.2]].forEach(fm => { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0] * (f0 > 160 ? 1.12 : 1); bp.Q.value = fm[1]; const g = ac.createGain(); g.gain.value = fm[2] * 2.4; o.connect(bp); bp.connect(g); g.connect(out); });
        swish(t, 0.06, 1500, gain * 0.25, 0.7); // the breathy "h"
        out.connect(bus()); o.start(t); o.stop(t + d + 0.02);
      }
    }
    function backSlap(t0) { const b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.9; const g = ac.createGain(); g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + 0.1); knock(t0, 150, 0.08, 0.3); }
    function hugLaugh(t0) { laughVoice(t0, 125, 7, 0.25); laughVoice(t0 + 0.3, 185, 6, 0.2); [0.9, 1.25, 1.6, 1.95].forEach((t, i) => backSlap(t0 + t + (i % 2) * 0.03)); }
    function tableRoll(t0) { roll(t0, 1.6, 2.4); roll(t0 + 0.4, 1.4, 1.9); clack(t0 + 0.9, 0.5); pocket(t0 + 1.3, true); roll(t0 + 2.1, 1.0, 2.1); pocket(t0 + 2.7, true); }
    function ledHum(t0) { // a soft mains hum with its harmonics, swelling in and out
      const d = 4.5, g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 1.2); g.gain.setValueAtTime(0.05, t0 + d - 1.2); g.gain.linearRampToValueAtTime(0.0001, t0 + d); g.connect(bus());
      [[120, 1], [240, 0.55], [360, 0.3], [480, 0.15]].forEach(h => { const o = ac.createOscillator(); o.frequency.value = h[0]; const og = ac.createGain(); og.gain.value = h[1]; o.connect(og); og.connect(g); o.start(t0); o.stop(t0 + d + 0.05); });
      const w = ac.createOscillator(); w.frequency.value = 9600; const wg = ac.createGain(); wg.gain.value = 0.012; w.connect(wg); wg.connect(g); w.start(t0); w.stop(t0 + d + 0.05);
    }

    // ---- mom and the stove
    function chop(t0, n) { for (let i = 0; i < n; i++) { const t = t0 + i * (0.21 + Math.random() * 0.05); knock(t, 210 + Math.random() * 40, 0.06, 0.28); res(t, [[1350 + Math.random() * 300, 1], [2900, 0.5]], 0.02, 0.06); swish(t - 0.04, 0.05, 2600, 0.03, 1); } }
    function sighF(t0) { // a soft, warm sigh: breath with a gentle voice falling underneath
      const d = 1.6, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1; f.frequency.setValueAtTime(1600, t0); f.frequency.exponentialRampToValueAtTime(700, t0 + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.22, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(265, t0 + 0.08); o.frequency.exponentialRampToValueAtTime(175, t0 + 1.1);
      const out = ac.createGain(); out.gain.setValueAtTime(0.0001, t0 + 0.08); out.gain.linearRampToValueAtTime(0.15, t0 + 0.3); out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
      [[850, 5, 1], [1450, 7, 0.5], [2900, 9, 0.15]].forEach(fm => { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = fm[1]; const gg = ac.createGain(); gg.gain.value = fm[2] * 2.2; o.connect(bp); bp.connect(gg); gg.connect(out); });
      out.connect(bus()); o.start(t0 + 0.08); o.stop(t0 + 1.2);
    }
    function gasHiss(t0) { const d = 3.4, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2800; const p = ac.createBiquadFilter(); p.type = 'peaking'; p.frequency.value = 6000; p.gain.value = 6;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.04, t0 + 0.3); g.gain.setValueAtTime(0.04, t0 + d - 0.5); g.gain.linearRampToValueAtTime(0.0001, t0 + d);
      const fl = ac.createOscillator(); fl.frequency.value = 5.5; const fg = ac.createGain(); fg.gain.value = 0.012; fl.connect(fg); fg.connect(g.gain);
      b.connect(f); f.connect(p); p.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05); fl.start(t0); fl.stop(t0 + d + 0.05);
      const r = ac.createBufferSource(); r.buffer = noise; const rf = ac.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 300; const rg = ac.createGain(); rg.gain.setValueAtTime(0.0001, t0); rg.gain.linearRampToValueAtTime(0.06, t0 + 0.3); rg.gain.setValueAtTime(0.06, t0 + d - 0.5); rg.gain.linearRampToValueAtTime(0.0001, t0 + d); r.connect(rf); rf.connect(rg); rg.connect(bus()); r.start(t0, Math.random()); r.stop(t0 + d + 0.05); // the flame's low roar
    }
    function flameCrackle(t0) { const d = 3.0; for (let i = 0; i < 16; i++) { const t = t0 + Math.random() * d, f = 1200 + Math.random() * 3000; res(t, [[f, 1], [f * 1.7, 0.4]], 0.006, 0.13 + Math.random() * 0.18); if (Math.random() < 0.3) knock(t, 300 + Math.random() * 200, 0.02, 0.05); } }

    // ---- campfire memories
    function flyBuzz(t0) { // a low, wavering buzz, and little glassy twinkles as they light up
      const d = 3.2, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(118, t0); const w = ac.createOscillator(); w.frequency.value = 3.2; const wg = ac.createGain(); wg.gain.value = 9; w.connect(wg); wg.connect(o.frequency);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 340; f.Q.value = 2; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.6); g.gain.setValueAtTime(0.1, t0 + d - 0.8); g.gain.linearRampToValueAtTime(0.0001, t0 + d);
      const am = ac.createOscillator(); am.frequency.value = 0.7; const ag = ac.createGain(); ag.gain.value = 0.025; am.connect(ag); ag.connect(g.gain);
      o.connect(f); f.connect(g); g.connect(bus()); [o, w, am].forEach(x => { x.start(t0); x.stop(t0 + d + 0.05); });
      for (let i = 0; i < 7; i++) { const t = t0 + 0.3 + Math.random() * (d - 0.5), fr = 2600 + Math.random() * 2600; hit(t, [[fr, 1, 1], [fr * 2.01, 0.4, 0.7]], 0.5 + Math.random() * 0.4, 0.018); }
    }
    function practice(t0) { // practising: a note picked over and over, a short run, and one that buzzes or comes out muffled
      const out = gtrOut(), r = Math.random();
      const pl = (m, t, g, dead) => { g *= 0.42; const s2 = ac.createBufferSource(); s2.buffer = pluckBuf(m); const gg = ac.createGain(); gg.gain.setValueAtTime(g, t); if (dead) gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); else gg.gain.setTargetAtTime(0.0001, t + 0.9, 0.25); s2.connect(gg);
        if (dead) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; gg.connect(lp); lp.connect(out); } else gg.connect(out); s2.start(t); s2.stop(t + 2); };
      if (r < 0.5) { const m = [57, 59, 60, 62, 64][Math.floor(Math.random() * 5)]; for (let i = 0; i < 4; i++) pl(m, t0 + i * 0.42, 0.45); pl(m + 2, t0 + 1.7, 0.45); pl(m + 3, t0 + 2.0, 0.4, true); swish(t0 + 2.0, 0.06, 2400, 0.03, 2); } // the slip
      else { const run = [52, 55, 57, 59, 62, 64]; run.forEach((m, i) => pl(m, t0 + i * 0.22, 0.42, i === run.length - 1)); hit(t0 + run.length * 0.22 - 0.2, [[180, 0.6, 1], [260, 0.4, 0.7]], 0.04, 0.05); pl(64, t0 + 1.9, 0.45); pl(64, t0 + 2.3, 0.45); }
    }
    function heartbeat(t0) { // a quick, nervous lub-dub
      for (let i = 0; i < 6; i++) { const t = t0 + i * 0.58; knock(t, 62, 0.13, 0.32); knock(t + 0.17, 54, 0.12, 0.22); }
    }
    function campCrackle(t0) { const d = 3.5, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.1, t0 + 0.4); g.gain.setValueAtTime(0.1, t0 + d - 0.6); g.gain.linearRampToValueAtTime(0.0001, t0 + d); b.connect(f); f.connect(g); g.connect(bus()); b.start(t0, Math.random()); b.stop(t0 + d + 0.05);
      for (let i = 0; i < 22; i++) { const t = t0 + Math.random() * d, fr = 900 + Math.random() * 3200; res(t, [[fr, 1], [fr * 1.6, 0.4]], 0.006, 0.26 + Math.random() * 0.4); if (Math.random() < 0.25) knock(t, 180 + Math.random() * 160, 0.03, 0.1); } }
    function squish(t0) { // a toasted marshmallow squashed: a sticky, wet squelch that pulls apart
      [0, 0.55].forEach((dt, k) => { const t = t0 + dt, d = 0.42, b = ac.createBufferSource(); b.buffer = noise; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(900, t + d * 0.4); f.frequency.exponentialRampToValueAtTime(320, t + d);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.75, t + 0.03); g.gain.setValueAtTime(0.52, t + d * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        b.connect(f); f.connect(g); g.connect(bus()); b.start(t, Math.random()); b.stop(t + d + 0.05);
        for (let i = 0; i < 5; i++) chip(t + 0.08 + i * 0.05 + Math.random() * 0.03, 'sine', 500 + Math.random() * 300, 180, 0.04, 0.05); // little sticky pops
        if (k) { knock(t + 0.05, 140, 0.06, 0.12); swish(t + 0.2, 0.3, 1200, 0.05, 3); } });
    }
    return {
      camp(on, strumCb) {
        if (!this.enabled || !ac) return;
        if (strumCb) G.strumCb = strumCb;
        if (on && !G.on) { G.on = true; const o = gOut(); o.gain.gain.cancelScheduledValues(ac.currentTime); o.gain.gain.setTargetAtTime(0.9, ac.currentTime, 0.2); fireBed().gain.setTargetAtTime(0.09, ac.currentTime, 0.6); G.start = ac.currentTime + 0.15; G.next = G.start; G.step = 0; G.nextPop = ac.currentTime + 0.05; G.timer = setInterval(campSchedule, 25); }
        else if (!on && G.on) { G.on = false; clearInterval(G.timer); G.timer = null; G.out.gain.gain.setTargetAtTime(0, ac.currentTime, 0.35); if (G.fire) G.fire.gain.setTargetAtTime(0, ac.currentTime, 0.4); }
      },
      memory(kind) {
        if (!this.enabled || !ac) return; const t0 = ac.currentTime + 0.05;
        if (kind === 'creak') { creak(t0, 46); creak(t0 + 0.62, 54); }
        else if (kind === 'spin') spin(t0);
        else if (kind === 'snore') { snore(t0); snore(t0 + 3.0); }
        else if (kind === 'snore1') snore(t0);
        else if (kind === 'yawn') yawn(t0);
        else if (kind === 'chord') chord(t0);
        else if (kind === 'pool') poolShot(t0);
        else if (kind === 'clack') { clack(t0, 1); clack(t0 + 0.4, 0.6); }
        else if (kind === 'break') poolBreak(t0);
        else if (kind === 'fridge') fridgeOpen(t0);
        else if (kind === 'cutlery') cutlery(t0);
        else if (kind === 'rumble') rumble(t0);
        else if (kind === 'sip') sipAah(t0);
        else if (kind === 'fold') fold(t0);
        else if (kind === 'flap') flap(t0);
        else if (kind === 'iron') iron(t0);
        else if (kind === 'game') game(t0);
        else if (kind === 'buzz') flyBuzz(t0);
        else if (kind === 'practice') practice(t0);
        else if (kind === 'heart') heartbeat(t0);
        else if (kind === 'fire') campCrackle(t0);
        else if (kind === 'squish') squish(t0);
        else if (kind === 'chop') chop(t0, 6);
        else if (kind === 'sighF') sighF(t0);
        else if (kind === 'gas') gasHiss(t0);
        else if (kind === 'flame') flameCrackle(t0);
        else if (kind === 'boom') boom(t0);
        else if (kind === 'laugh') hugLaugh(t0);
        else if (kind === 'roll') tableRoll(t0);
        else if (kind === 'hum') ledHum(t0);
        else if (kind === 'freezer') freezerOpen(t0);
        else if (kind === 'brrr') brrr(t0);
        else if (kind === 'chatter') chatter(t0);
        else if (kind === 'tap') tap(t0);
        else if (kind === 'dishes') dishes(t0);
        else if (kind === 'bubbles') bubbles(t0);
        else if (kind === 'hood') hoodFan(t0);
        else if (kind === 'sizzle') sizzle(t0);
        else if (kind === 'cough') cough(t0);
        else if (kind === 'mash') mash(t0);
        else if (kind === 'scribble') scribble(t0);
        else if (kind === 'flip') pageFlip(t0);
        else if (kind === 'riffle') riffle(t0);
        else if (kind === 'sigh') sigh(t0);
        else if (kind === 'doorOpen') doorOpen(t0);
        else if (kind === 'knock') doorKnock(t0);
        else if (kind === 'doorShut') doorShut(t0);
        else if (kind === 'rain') rain(t0);
        else if (kind === 'gust') gust(t0);
        else if (kind === 'bird') bird(t0);
      },
      pencil(delay, dur, kind) { if (!this.enabled || !ac) return; pencilStroke(ac.currentTime + 0.03 + delay, dur, kind); },
      tap() { const an = ac.createAnalyser(); an.fftSize = 2048; master.connect(an); return an; },
      voice(url, onend) {
        if (!this.enabled || !ac) { if (onend) onend(); return; }
        loadVoice(url).then(buf => {
          const src = ac.createBufferSource(); src.buffer = buf; const g = ac.createGain(); g.gain.value = 0.8;
          src.connect(g); g.connect(bus()); src.onended = () => { if (onend) onend(); }; src.start();
        }).catch(() => { if (onend) onend(); });
      },
      preloadVoice(url) { if (ac) loadVoice(url).catch(() => {}); },
      memoryStop() { if (!ac || !memBus) return; const b = memBus; memBus = null; b.gain.setTargetAtTime(0, ac.currentTime, 0.15); setTimeout(() => { try { b.disconnect(); } catch (e) { /* gone */ } }, 1500); },
      jazz(on) {
        if (!this.enabled || !ac) return;
        if (on && !J.on) { J.on = true; const o = jOut(); o.gain.gain.cancelScheduledValues(ac.currentTime); o.gain.gain.setTargetAtTime(0.55, ac.currentTime, 0.4); J.next = ac.currentTime + 0.08; J.step = 0; J.timer = setInterval(schedule, 25); }
        else if (!on && J.on) { J.on = false; clearInterval(J.timer); J.timer = null; const o = jOut(); o.gain.gain.setTargetAtTime(0, ac.currentTime, 0.25); }
      },
      beat() { if (!ac || !J.on) return 0; return Math.exp(-Math.max(0, ac.currentTime - J.lastBass) * 9); },
      enabled: false,
      unlock() { if (!init()) return; if (ac.state === 'suspended') ac.resume(); this.enabled = true; },
      start(kind) {
        if (!this.enabled || !ac) return;
        if (kind === 'drawer') { burst(900 + Math.random() * 400, 0.8, 0.45, 0.05); thump(90, 0.12, 0.08, 0.38); }
        else if (kind === 'door') { burst(600, 1.5, 0.25, 0.03); }
        else if (kind === 'freezer') { burst(300, 0.7, 0.18, 0.06, 'lowpass'); }
        else if (kind === 'chop') { burst(1500 + Math.random() * 500, 2.5, 0.06, 0.07); thump(180 + Math.random() * 30, 0.05, 0.05); }
        else if (kind === 'flame') { for (let i = 0; i < 4; i++) burst(3500, 3, 0.03, 0.12, 'bandpass', i * 0.11); burst(250, 0.6, 0.6, 0.08, 'lowpass', 0.42); }
      },
      stop(kind) {
        if (!this.enabled || !ac) return;
        if (kind === 'drawer') thump(110, 0.1, 0.1); else if (kind === 'door') thump(130, 0.12, 0.08); else if (kind === 'freezer') { thump(80, 0.18, 0.12); burst(200, 0.7, 0.12, 0.04, 'lowpass'); }
      },
      level(kind, v) { if (!this.enabled || !ac) return; const g = loop(kind); g.gain.setTargetAtTime((kind === 'water' ? 0.11 : 0.07) * v, ac.currentTime, 0.12); },
      silence() { if (!ac) return; Object.keys(loops).forEach(k => loops[k].gain.setTargetAtTime(0, ac.currentTime, 0.1)); }
    };
  })();

  // ---------- post-processing: selection outline, antialiasing ----------
  let composer = null, outline = null, fxaa = null, dim = null, agePass = null;
  if (!LITE && THREE.EffectComposer && THREE.OutlinePass) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    outline = new THREE.OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    // the grey veil over everything but the chosen thing; it reads the outline pass's mask (one frame behind, which is invisible)
    dim = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, tMask: { value: null }, amount: { value: 0 }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tMask; uniform float amount; uniform vec2 texel; varying vec2 vUv;' +
        'float obj(vec2 uv){ vec4 m = texture2D(tMask, uv); return (1.0 - m.r) * (1.0 - m.g); }' +
        'void main(){ vec4 c = texture2D(tDiffuse, vUv); if (amount < 0.001) { gl_FragColor = c; return; }' +
        ' vec2 d = texel * 2.5; float o = obj(vUv) * 0.4 + (obj(vUv + vec2(d.x, 0.0)) + obj(vUv - vec2(d.x, 0.0)) + obj(vUv + vec2(0.0, d.y)) + obj(vUv - vec2(0.0, d.y))) * 0.15;' +
        ' float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); vec3 g = mix(c.rgb, vec3(l), 0.65) * 0.55 + vec3(0.03, 0.03, 0.032);' +
        ' gl_FragColor = vec4(mix(c.rgb, g, amount * (1.0 - clamp(o, 0.0, 1.0))), c.a); }'
    });
    dim.uniforms.tMask.value = outline.renderTargetMaskBuffer.texture;
    composer.addPass(dim);
    agePass = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float amount; uniform vec2 texel; varying vec2 vUv;' +
        'void main(){ vec4 c = texture2D(tDiffuse, vUv); if (amount < 0.001) { gl_FragColor = c; return; }' +
        ' vec2 d = texel * (0.5 + amount * 1.1); vec4 b = (texture2D(tDiffuse, vUv + vec2(d.x, 0.0)) + texture2D(tDiffuse, vUv - vec2(d.x, 0.0)) + texture2D(tDiffuse, vUv + vec2(0.0, d.y)) + texture2D(tDiffuse, vUv - vec2(0.0, d.y)) +' +
        ' texture2D(tDiffuse, vUv + d) + texture2D(tDiffuse, vUv - d) + texture2D(tDiffuse, vUv + vec2(d.x, -d.y)) + texture2D(tDiffuse, vUv + vec2(-d.x, d.y))) / 8.0;' +
        ' vec3 col = mix(c.rgb, b.rgb, amount * 0.7); float l = dot(col, vec3(0.2126, 0.7152, 0.0722));' +
        ' col = mix(col, vec3(l), amount * 0.2); col = mix(col, col * 0.86 + vec3(0.012), amount);' +
        ' gl_FragColor = vec4(col, c.a); }'
    });
    composer.addPass(agePass);
    outline.edgeStrength = 3.2; outline.edgeGlow = 0.35; outline.edgeThickness = 1.2; outline.pulsePeriod = 0;
    outline.visibleEdgeColor.set('#fff4dc'); outline.hiddenEdgeColor.set('#7a6a52');
    composer.addPass(outline);
    if (THREE.FXAAShader) { fxaa = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaa); }
    if (THREE.GammaCorrectionShader) composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  }
  function setEnv(R, k) { R.root.traverse(o => { if (o.isMesh && o.material) [].concat(o.material).forEach(m => { if (m.envMapIntensity !== undefined) { if (m.userData.envBase == null) m.userData.envBase = m.envMapIntensity; m.envMapIntensity = m.userData.envBase * k; } }); }); }
  function captureRoom(R) {
    // photograph the finished room from its centre with a cube camera (8-bit, tone mapped), then prefilter it for reflections
    R.reflectors.forEach(r => r.visible = false);
    const crt = new THREE.WebGLCubeRenderTarget(256, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, encoding: THREE.sRGBEncoding });
    const cc = new THREE.CubeCamera(0.05, 20, crt); cc.position.set(0, 1.3, 0); scene.add(cc);
    scene.environment = neutralEnv; setEnv(R, 0.25);
    renderer.shadowMap.needsUpdate = true; cc.update(renderer, scene); scene.remove(cc);
    try { R.env = pmrem.fromCubemap(crt.texture).texture; } catch (e) { R.env = neutralEnv; }
    R.reflectors.forEach(r => r.visible = true);
    setEnv(R, LV.env);
  }

  // ---------- rooms ----------
  const ROOMS = {};
  let cur = null;
  function activate(key) {
    if (cur) { scene.remove(cur.root); if (cur.music) SFX.jazz(false); if (cur.campfire) SFX.camp(false); }
    if (!ROOMS[key]) { ROOMS[key] = key === 'kitchen' ? buildKitchen() : key === 'pool' ? buildPool() : key === 'campfire' ? buildCampfire() : buildBedroom(); scene.add(ROOMS[key].root); if (ROOMS[key].outdoor) { ROOMS[key].env = neutralEnv; setEnv(ROOMS[key], 0.06); } else if (Q.has('noprobe')) { ROOMS[key].env = neutralEnv; setEnv(ROOMS[key], LV.env); } else captureRoom(ROOMS[key]); }
    else scene.add(ROOMS[key].root);
    cur = ROOMS[key]; PERF.shadowFrames = 4; PERF.dirtyUntil = performance.now() + 800; scene.environment = cur.env || neutralEnv; scene.background = LIB.col(cur.bg || '#14110e'); renderer.toneMappingExposure = LV.exp * (cur.outdoor ? 1.25 : 1);
    document.body.dataset.room = key;
    $('bAnim').hidden = !cur.channels; ageUI();
    if (!cur.channels && M.on) { M.on = false; SFX.silence(); }
  }

  // ---------- camera: the doorway, closer, closest, the room from above ----------
  const S = { sel: 0, level: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62, t: 0, busy: false };
  const curPos = new THREE.Vector3(), curLook = new THREE.Vector3(); let curFov = 62;
  function clampIn(v) { v.x = Math.max(cur.X0 + 0.25, Math.min(cur.X1 - 0.25, v.x)); v.z = Math.max(cur.Z0 + 0.25, Math.min(cur.Z1 - 0.25, v.z)); v.y = Math.max(0.35, Math.min(H - 0.15, v.y)); return v; }
  function target() {
    const it = cur.placed[S.sel];
    if (S.level <= -1) { if (cur.outdoor) { S.pos.set(5.2, 6.4, 7.2); S.look.set(0, -0.2, 0); S.fov = 42; } else { S.pos.set(0.15, 7.6, 2.6); S.look.set(0, 0, -0.25); S.fov = 46; } return; }
    if (!it) return;
    if (S.level === 0) {
      S.pos.copy(cur.home); S.fov = 62;
      const dir = it.focus.clone().sub(cur.home).normalize(), base = cur.homeLook.clone().sub(cur.home).normalize();
      S.look.copy(cur.home).add(base.multiplyScalar(0.38).add(dir.multiplyScalar(0.62)).normalize().multiplyScalar(3));
      return;
    }
    const d = S.level === 1 ? (it.far || it.r * 2.3 + 0.45) : (it.near || it.r * 1.15 + 0.18);
    S.pos.copy(it.focus).addScaledVector(it.view, d); clampIn(S.pos);
    S.look.copy(it.focus); S.fov = S.level === 1 ? 50 : 44;
  }
  function jump() { curPos.copy(S.pos); curLook.copy(S.look); curFov = S.fov; }

  // ---------- the slide between rooms ----------
  const shot = $('shot'); const SLIDE = Q.has('slide') ? parseFloat(Q.get('slide')) : 1.15;
  const frames2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  function goRoom(key, opts) {
    if (S.busy || !cur || cur.key === key) return;
    if (BOOK && NOTE.LISTS[key]) return goRoomBook(key, opts || {});
    S.busy = true; opts = opts || {};
    const dir = opts.dir || 1; // 1: the old room leaves to the left, the new arrives from the right
    // 1. push in: lean towards the object for a moment
    const lean = opts.lean;
    if (lean) { S.pos.lerp(lean, 0.55); S.fov = 30; }
    stopMemory();
    setTimeout(() => {
      // 2. photograph the current view and lay it over the canvas
      render(); shot.src = canvas.toDataURL('image/jpeg', 0.9);
      shot.style.transition = 'none'; shot.style.transform = 'translateX(0)'; shot.style.opacity = '1'; shot.hidden = false;
      canvas.style.transition = 'none'; canvas.style.transform = 'translateX(' + (dir * 100) + '%)';
      // 3. swap rooms behind it
      activate(key);
      S.sel = opts.sel != null ? opts.sel : 0; S.level = opts.level != null ? opts.level : 0; target(); jump(); updateUI();
      // 4. slide: the old room out, the new room in
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ease = 'transform ' + SLIDE + 's cubic-bezier(.7,0,.25,1)';
        shot.style.transition = ease + ', opacity ' + SLIDE + 's ease'; canvas.style.transition = ease;
        shot.style.transform = 'translateX(' + (-dir * 100) + '%) scale(0.94)'; shot.style.opacity = '0.6';
        canvas.style.transform = 'translateX(0)';
        setTimeout(() => { shot.hidden = true; canvas.style.transition = ''; canvas.style.transform = ''; S.busy = false; syncMemory(); }, SLIDE * 1000 + 60);
      }));
    }, lean ? 520 : 0);
  }

  // the first visit to a room: the notebook comes up, the pencil lists the room while it is built behind the page
  function goRoomBook(key, opts) {
    S.busy = true;
    if (opts.lean) { S.pos.lerp(opts.lean, 0.55); S.fov = 30; }
    stopMemory();
    setTimeout(async () => {
      const L = NOTE.LISTS[key];
      NOTE.open(L.items.length + 2);
      const w = NOTE.write(L.title, L.items, (d, dur, kind) => SFX.pencil(d, dur, kind));
      await new Promise(r => setTimeout(r, 420)); await frames2();
      activate(key);
      S.sel = opts.sel != null ? opts.sel : 0; S.level = opts.level != null ? opts.level : 0; target(); jump(); updateUI(); render();
      w.allowSkip();
      await w.done;
      await NOTE.close();
      S.busy = false; syncMemory();
    }, opts.lean ? 520 : 0);
  }

  // ---------- time passes (bedroom only) ----------
  // T starts a clock. As its hand goes once round, the bedroom slowly stops being seen: small things vanish, patterns blur
  // into flat colour (the spots on the sheets, the grain of the guitar, the pixels of the screen), colours drain, the view
  // softens. T again rewinds: the hand runs back counter-clockwise and everything returns.
  const AGE = { F: 0, dir: 0, patched: false, uni: { value: 0 }, bumps: [], vanish: [], FWD: 42, BACK: 7 };
  const AGE_MAP = '#ifdef USE_MAP\n  vec4 texelColor = texture2D( map, vUv, uAge * 7.0 );\n  texelColor = mapTexelToLinear( texelColor );\n  diffuseColor *= texelColor;\n#endif\n' +
    '{ float lAge = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lAge ) * 0.92 + 0.01, uAge * 0.68 ); }\n';
  const AGE_EMI = '#ifdef USE_EMISSIVEMAP\n  vec4 emissiveColor = texture2D( emissiveMap, vUv, uAge * 7.0 );\n  emissiveColor.rgb = emissiveMapTexelToLinear( emissiveColor ).rgb;\n  totalEmissiveRadiance *= emissiveColor.rgb;\n#endif\n' +
    'totalEmissiveRadiance = mix( totalEmissiveRadiance, vec3( dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uAge * 0.7 ) * ( 1.0 - uAge * 0.2 );\n';
  function agePatch(R) {
    if (AGE.patched) return; AGE.patched = true;
    const seen = new Set();
    R.root.traverse(o => {
      if (o.userData && o.userData.fadeAway != null) {
        const mats = [];
        o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; mats.push(m.material); } });
        AGE.vanish.push({ o, at: o.userData.fadeAway, mats });
      }
    });
    R.root.traverse(o => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m || seen.has(m) || !m.isMeshStandardMaterial) return; seen.add(m);
        if (m.bumpMap) AGE.bumps.push([m, 'bump', m.bumpScale]);
        if (m.normalMap) AGE.bumps.push([m, 'normal', m.normalScale.clone()]);
        m.onBeforeCompile = sh => {
          sh.uniforms.uAge = AGE.uni;
          sh.fragmentShader = 'uniform float uAge;\n' + sh.fragmentShader.replace('#include <map_fragment>', AGE_MAP).replace('#include <emissivemap_fragment>', AGE_EMI);
        };
        m.customProgramCacheKey = () => 'aged';
        m.needsUpdate = true;
      });
    });
  }
  const clockEl = $('clock'), handEl = $('clockHand'), capEl = $('clockCap');
  function ageCaption() {
    const F = AGE.F;
    if (AGE.dir < 0) return F <= 0 ? 'the first day again' : 'remembering it again…';
    if (AGE.dir === 0 && F >= 1) return 'ten years. The room is still here, but I have stopped seeing it.';
    if (AGE.dir === 0 && F <= 0) return 'the first day again';
    if (AGE.dir === 0) return 'time stopped';
    return F < 0.15 ? 'a week passes' : F < 0.35 ? 'a month passes' : F < 0.6 ? 'a year passes' : F < 0.85 ? 'five years pass' : 'ten years pass';
  }
  function ageUI() {
    const inBed = cur && cur.key === 'bedroom';
    $('bTime').hidden = !inBed;
    $('bTime').classList.toggle('on', AGE.dir !== 0);
    const show = inBed && (AGE.dir !== 0 || AGE.F > 0);
    if (clockEl.hidden === show) clockEl.hidden = !show;
    handEl.setAttribute('transform', 'rotate(' + (AGE.F * 360).toFixed(1) + ' 24 24)');
    const c = ageCaption(); if (capEl.textContent !== c) capEl.textContent = c;
  }
  function toggleTime() {
    if (!cur || cur.key !== 'bedroom' || S.busy) return;
    agePatch(cur);
    if (AGE.dir > 0) AGE.dir = -1; else if (AGE.dir < 0) AGE.dir = 1; else AGE.dir = AGE.F >= 0.5 ? -1 : 1;
    PERF.dirtyUntil = performance.now() + 1500;
    ageUI();
  }
  function ageTick(dt) {
    if (!cur || cur.key !== 'bedroom') { AGE.uni.value = 0; if (agePass) agePass.uniforms.amount.value = 0; return; }
    if (AGE.dir) {
      AGE.F += AGE.dir * dt / (AGE.dir > 0 ? AGE.FWD : AGE.BACK);
      if (AGE.F >= 1) { AGE.F = 1; AGE.dir = 0; PERF.shadowFrames = 2; } else if (AGE.F <= 0) { AGE.F = 0; AGE.dir = 0; PERF.shadowFrames = 2; setTimeout(ageUI, 0); }
      ageUI();
    }
    const F = AGE.F, e = F * F * (3 - 2 * F);
    AGE.uni.value = e;
    if (agePass) agePass.uniforms.amount.value = e;
    AGE.bumps.forEach(b => { if (b[1] === 'bump') b[0].bumpScale = b[2] * (1 - e); else b[0].normalScale.copy(b[2]).multiplyScalar(1 - e); });
    AGE.vanish.forEach(v => { const k = Math.max(0, Math.min(1, (F - v.at) / 0.1)); const op = 1 - k * k * (3 - 2 * k); v.o.visible = op > 0.01; v.mats.forEach(m => { m.opacity = op; m.depthWrite = op > 0.98; }); });
  }

  // ---------- ui ----------
  const nameEl = $('name'), hintEl = $('hint'), help = $('help');
  function updateUI() {
    const it = cur.placed[S.sel];
    nameEl.textContent = S.level <= -1 ? (cur.outdoor ? 'the clearing, from above' : 'the room, from above') : (it ? it.name : '');
    let hint;
    if (S.level <= -1) hint = cur.key === 'bedroom' ? 'press + to step back into the doorway' : (cur.outdoor ? 'press + to come back down' : 'press + to step back into the doorway') + ' · − to return to the bedroom';
    else if (S.level === 0) hint = '+ to look closer · ← → to choose' + (cur.channels ? ' · A to set it in motion' : '');
    else if (S.level === 1) hint = '+ to remember it · − to step back';
    else hint = it && it.go ? '+ to go through it, to the ' + (GO_LABEL[it.go] || it.go) + ' · − to step back' : '− to step back';
    hintEl.textContent = hint;
    if (outline) outline.selectedObjects = (it && S.level >= 0) ? [it.group] : [];
    $('room').textContent = cur.title;
    $('lvl').textContent = [cur.outdoor ? 'from high above' : 'from above', cur.outdoor ? 'where you arrive' : 'from the doorway', 'closer', 'closest'][S.level + 1];
    syncMemory();
  }

  // ---------- memories: zoom in once on a thing and its lines fall down the screen around it ----------
  const MEMS = window.MEMORIES || {}, memEl = $('mem'), veil = $('veil');
  // where the lines start (percent of the screen), kept clear of the middle where the thing sits, the top tags and the dock
  const SLOTS = [
    { x: 5, y: 13, a: 'left' }, { x: 95, y: 15, a: 'right' }, { x: 3, y: 40, a: 'left' }, { x: 97, y: 37, a: 'right' },
    { x: 34, y: 8, a: 'center' }, { x: 6, y: 62, a: 'left' }, { x: 94, y: 60, a: 'right' }, { x: 66, y: 9, a: 'center' }
  ];
  const MEM = { key: null, lines: null, sounds: null, i: 0, timer: null, sTimers: [], dim: 0, dimTo: 0 };
  const WORD = { every: 1540, life: 8400, pause: 4200 }; // the words: one every 1.54 s, each lives 8.4 s
  function memoriesFor(it) {
    const r = MEMS[cur.key], m0 = r && it ? r[it.name] : null; if (!m0) return null;
    const m = Array.isArray(m0) ? { lines: m0 } : m0;
    const qs = ((window.PEREC_Q || {})[cur.key] || {})[it.name];
    if (!qs || !qs.length) return m;
    // a question after the second line, another at the end
    const lines = m.lines.slice(), q = qs.map(t => ({ text: t, q: true }));
    lines.splice(Math.min(2, lines.length), 0, q[0]); if (q[1]) lines.push(q[1]);
    return Object.assign({}, m, { lines });
  }
  function describeFor(it) { const r = (window.DESCRIPTIONS || {})[cur.key], d = r && it ? r[it.name] : null; return d && d.length ? { lines: d } : null; }
  function syncMemory() {
    const it = cur.placed[S.sel];
    // 1st zoom: a plain description of the thing; 2nd zoom: the memories it holds
    const m = S.busy ? null : S.level === 1 ? describeFor(it) : S.level >= 2 ? memoriesFor(it) : null;
    const key = m ? cur.key + '|' + S.sel + '|' + (S.level === 1 ? 'd' : 'm') : null;
    if (key === MEM.key) return;
    stopMemory();
    if (!m || !m.lines || !m.lines.length) return;
    MEM.key = key; MEM.lines = m.lines; MEM.sounds = m.sounds || null; MEM.i = 0; MEM.dimTo = 1;
    const VO = window.VOICES || {}; m.lines.forEach(l => { const u = VO[typeof l === 'string' ? l : l.text]; if (u) SFX.preloadVoice(u); });
    if (veil && !composer) veil.classList.add('on');
    MEM.timer = setTimeout(dropNext, 700);
    if (MEM.sounds) soundCycle(key, 700);
  }
  // the sounds keep their own steady clock, independent of the words: a pattern of [sound, seconds] repeated every `cycle` seconds
  function soundCycle(key, delay) {
    const snd = MEM.sounds;
    MEM.sTimers.push(setTimeout(() => {
      if (MEM.key !== key) return;
      snd.pattern.forEach(p => MEM.sTimers.push(setTimeout(() => { if (MEM.key === key) SFX.memory(p[0]); }, p[1] * 1000)));
      soundCycle(key, snd.cycle * 1000);
    }, delay));
  }
  const VQ = { playing: false, pending: null, gen: 0 };
  function speak(url) {
    const gen = VQ.gen;
    if (VQ.playing) { VQ.pending = url; return; }
    VQ.playing = true;
    SFX.voice(url, () => {
      if (gen !== VQ.gen) return;
      VQ.playing = false;
      if (VQ.pending && MEM.lines) { const u = VQ.pending; VQ.pending = null; setTimeout(() => { if (gen === VQ.gen) speak(u); }, 220); }
    });
  }
  function stopMemory() {
    VQ.gen++; VQ.playing = false; VQ.pending = null;
    if (MEM.timer) clearTimeout(MEM.timer); MEM.timer = null; MEM.sTimers.forEach(clearTimeout); MEM.sTimers = [];
    MEM.key = null; MEM.lines = null; MEM.sounds = null; MEM.dimTo = 0;
    if (veil) veil.classList.remove('on');
    Array.from(memEl.children).forEach(el => { el.getAnimations().forEach(a => a.pause()); el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = () => el.remove(); });
    SFX.memoryStop();
  }
  function dropNext() {
    if (!MEM.lines) return;
    const n = MEM.lines.length, idx = MEM.i % n, raw = MEM.lines[idx], line = typeof raw === 'string' ? { text: raw } : raw, slot = SLOTS[idx % SLOTS.length];
    const el = document.createElement('div'); el.className = 'line' + (line.mono ? ' sound' : '') + ' ' + slot.a; el.textContent = line.text;
    el.style.left = slot.a === 'left' ? slot.x + '%' : slot.a === 'center' ? slot.x + '%' : 'auto';
    el.style.right = slot.a === 'right' ? (100 - slot.x) + '%' : 'auto';
    el.style.top = slot.y + '%';
    memEl.appendChild(el);
    const fall = Math.round(innerHeight * 0.16), tx = slot.a === 'center' ? 'translateX(-50%) ' : '';
    // falls the whole time; materialises (blur to sharp), holds, then fades away while still falling
    el.animate([
      { transform: tx + 'translateY(0)', opacity: 0, filter: 'blur(7px)', offset: 0 },
      { transform: tx + 'translateY(' + Math.round(fall * 0.35) + 'px)', opacity: 1, filter: 'blur(0px)', offset: 0.32 },
      { transform: tx + 'translateY(' + Math.round(fall * 0.62) + 'px)', opacity: 1, filter: 'blur(0px)', offset: 0.6 },
      { transform: tx + 'translateY(' + fall + 'px)', opacity: 0, filter: 'blur(3px)', offset: 1 }
    ], { duration: WORD.life, easing: 'linear', fill: 'forwards' }).onfinish = () => el.remove();
    const vurl = (window.VOICES || {})[line.text]; if (vurl) speak(vurl);
    MEM.i++;
    MEM.timer = setTimeout(dropNext, idx === n - 1 ? WORD.pause : WORD.every);
  }
  function choose(d) { if (S.busy || !cur.placed.length) return; S.sel = (S.sel + d + cur.placed.length) % cur.placed.length; if (S.level <= -1) S.level = 0; target(); updateUI(); }
  function zoom(d) {
    if (S.busy) return;
    const it = cur.placed[S.sel];
    if (d > 0 && S.level >= 2 && it && it.go) { goRoom(it.go, { dir: 1, lean: it.focus.clone() }); return; }
    if (d < 0 && S.level === -1 && cur.key !== 'bedroom') { const b = ROOMS.bedroom; goRoom('bedroom', { dir: -1, sel: b && b.goIndex ? b.goIndex[cur.key] : 0, level: 0 }); return; }
    S.level = Math.max(-1, Math.min(2, S.level + d)); target(); updateUI();
  }
  function toggleHelp(v) { help.hidden = v != null ? !v : !help.hidden; }
  function toggleMotion() {
    PERF.dirtyUntil = performance.now() + 4000; if (!cur.channels) return; SFX.unlock(); M.on = !M.on; if (!M.on) SFX.silence(); $('bAnim').classList.toggle('on', M.on); $('bAnim').setAttribute('aria-pressed', M.on); }
  const poke = () => { PERF.dirtyUntil = performance.now() + 900; };
  ['pointerdown', 'pointermove', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, poke, { passive: true }));
  window.addEventListener('keydown', e => {
    poke();
    SFX.unlock();
    if (window.NOTE && NOTE.isOpen()) return;
    const k = e.key;
    if (k === 'ArrowLeft') { choose(-1); e.preventDefault(); }
    else if (k === 'ArrowRight') { choose(1); e.preventDefault(); }
    else if (k === '+' || k === '=' || k === 'ArrowUp' || k === 'Enter') { zoom(1); e.preventDefault(); }
    else if (k === '-' || k === '_' || k === 'ArrowDown') { zoom(-1); e.preventDefault(); }
    else if (k === 'b' || k === 'B') toggleHelp();
    else if (k === 'a' || k === 'A') toggleMotion();
    else if (k === 't' || k === 'T') toggleTime();
    else if (k === 'Escape') toggleHelp(false);
  });
  $('bTime').onclick = () => toggleTime(); $('bPrev').onclick = () => choose(-1); $('bNext').onclick = () => choose(1);
  $('bIn').onclick = () => { SFX.unlock(); zoom(1); }; $('bOut').onclick = () => zoom(-1);
  $('bHelp').onclick = () => toggleHelp(); $('bClose').onclick = () => toggleHelp(false);
  $('bAnim').onclick = toggleMotion;
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  canvas.addEventListener('click', e => {
    SFX.unlock();
    if (!help.hidden) { toggleHelp(false); return; }
    if (S.busy) return;
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(cur.root.children, true); if (!hits.length) return;
    let o = hits[0].object; while (o) { const i = cur.placed.findIndex(p => p.group === o); if (i >= 0) { if (i === S.sel && S.level >= 0) zoom(1); else { S.sel = i; if (S.level < 0) S.level = 0; target(); updateUI(); } return; } o = o.parent; }
  });

  // ---------- loop ----------
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); if (dim) dim.uniforms.texel.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio())); if (agePass) agePass.uniforms.texel.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio())); if (fxaa) fxaa.uniforms.resolution.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio())); }
  }
  window.addEventListener('resize', () => { resize(); PERF.dirtyUntil = performance.now() + 900; });
  function render() {
    const show = S.level >= 0 || curPos.y < H - 0.1;
    cur.hide.forEach(o => o.visible = show);
    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  let last = performance.now();
  PERF.lastLook = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; S.t += dt;
    const k = 1 - Math.pow(0.0025, dt);
    curPos.lerp(S.pos, k); curLook.lerp(S.look, k); curFov += (S.fov - curFov) * k;
    const moved = camera.position.distanceToSquared(curPos) > 1e-10 || Math.abs(camera.fov - curFov) > 0.01 || PERF.lastLook.distanceToSquared(curLook) > 1e-10;
    PERF.camMoved = moved;
    camera.position.copy(curPos); PERF.lastLook.copy(curLook);
    camera.lookAt(curLook); if (Math.abs(camera.fov - curFov) > 0.01) { camera.fov = curFov; camera.updateProjectionMatrix(); }
    runMotion(cur, dt);
    ageTick(dt);
    MEM.dim += (MEM.dimTo - MEM.dim) * (1 - Math.pow(0.02, dt)); if (dim) dim.uniforms.amount.value = MEM.dim;
    cur.tick.forEach(f => { try { f(S.t, dt); } catch (e) { /* ignore */ } });
    // is there anything new to draw?
    const book = window.NOTE && NOTE.isOpen() && !S.busy;
    const live = PERF.camMoved || M.on || AGE.dir !== 0 || Math.abs(MEM.dim - MEM.dimTo) > 0.002 || now < PERF.dirtyUntil || PERF.shadowFrames > 0 || cur.outdoor || cur.alwaysLive;
    PERF.tick = (PERF.tick || 0) + 1;
    if (!live && PERF.tick % 20 !== 0) return;                      // a still scene: redraw only now and then
    if (book && PERF.shadowFrames === 0 && PERF.tick % 8 !== 0) return; // hidden behind the notebook
    PERF.frame++;
    // shadows: after building a room, while things move, and now and then while the room fades
    if (PERF.shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; PERF.shadowFrames--; }
    else if (M.on && PERF.frame % 2 === 0) renderer.shadowMap.needsUpdate = true;
    else if (AGE.dir !== 0 && PERF.frame % 12 === 0) renderer.shadowMap.needsUpdate = true;
    render();
    // adapt: if frames keep running long, drop the resolution a step (never below 1)
    if (!book && PERF.pr > 1 && live) {
      const ft = dt * 1000;
      if (ft > 26) PERF.slow++; else PERF.slow = Math.max(0, PERF.slow - 1);
      if (PERF.slow > 45) { PERF.pr = Math.max(1, Math.round((PERF.pr - 0.25) * 100) / 100); renderer.setPixelRatio(PERF.pr); resize(); PERF.slow = 0; }
    }
  }

  // ---------- start ----------
  // the notebook opens first: a click starts the sound, the pencil lists the bedroom, then the page lifts away
  const BOOK = !!window.NOTE && !Q.has('nobook') && (!DBG || Q.has('book'));
  async function boot() {
    resize();
    const startRoom = ['kitchen', 'pool', 'campfire'].indexOf(Q.get('room')) >= 0 ? Q.get('room') : 'bedroom';
    const L = BOOK ? NOTE.LISTS[startRoom] : null;
    let gateP = null;
    if (L) { NOTE.open(L.items.length + 2); gateP = NOTE.gate('click anywhere, or press any key, to open the notebook'); await frames2(); }
    activate(startRoom);
    S.sel = 0; S.level = 0; target(); curPos.copy(S.pos); curLook.copy(cur.homeLook);
    updateUI();
    requestAnimationFrame(frame);
    if (DBG) window.__dbg = { PERF, AGE, toggleTime, SFX, SFXbeat: () => SFX.beat(), S, M, ROOMS, cur: () => cur, scene, camera, renderer, goRoom, activate, setLevel: l => { S.level = l; target(); updateUI(); }, select: i => { S.sel = i; target(); updateUI(); }, jump, motion: on => { if (!!on !== M.on) toggleMotion(); }, setMotionTime: t => { M.t = t; } };
    if (L) {
      window.__gate = true;
      await gateP;
      SFX.unlock();
      if (document.fonts && document.fonts.load) { try { await Promise.race([document.fonts.load('40px "Pencil"'), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* fall back */ } }
      S.busy = true;
      const w = NOTE.write(L.title, L.items, (d, dur, kind) => SFX.pencil(d, dur, kind));
      w.allowSkip();
      await w.done;
      await NOTE.close();
      S.busy = false;
    }
    window.__ready = true;
  }
  boot();
})();
