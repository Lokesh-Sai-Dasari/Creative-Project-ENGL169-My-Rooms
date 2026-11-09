/* Bedroom — shared toolkit. Every builder uses these helpers so materials, colours and textures behave the same.
   Units: metres. y up. A builder returns a THREE.Group whose origin sits on the floor (or, for wall items, on the wall
   surface) and whose FRONT faces +z. The caller rotates and places it. */
(function () {
  'use strict';
  const L = window.LIB = {};
  const C = (hex) => new THREE.Color(hex);
  // colours are written in sRGB (as on a swatch); three r128 lights in linear space, so convert once here
  L.col = (hex) => C(hex).convertSRGBToLinear();
  L.rnd = function (seed) { let s = (Math.floor(seed * 9301 + 49297) % 233280 + 233280) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

  // ---------- textures ----------
  const loader = new THREE.TextureLoader();
  const cache = {};
  L.loadTex = function (name, srgb, rx, ry) {
    // a fresh texture per call (each can have its own repeat); THREE.Cache shares the decoded image
    THREE.Cache.enabled = true;
    const t = loader.load('assets/tex/' + name); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.encoding = THREE.sRGBEncoding; t.repeat.set(rx || 1, ry || 1); return t;
  };
  // canvas texture; `draw(ctx, w, h)`; srgb for colour maps, linear for bump/roughness/normal
  L.canvasTex = function (key, w, h, draw, srgb, rx, ry) {
    if (!cache[key]) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb !== false) t.encoding = THREE.sRGBEncoding;
      cache[key] = t;
    }
    if (rx == null && ry == null) return cache[key];
    const t = cache[key].clone(); t.needsUpdate = true; t.repeat.set(rx || 1, ry || 1); return t;
  };
  L.noiseTex = function (key, size, base, amp, grain, srgb) { // speckle noise, handy for bump/roughness
    return L.canvasTex(key, size, size, (g, w, h) => { const r = L.rnd(key.length * 13 + size); const img = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, base + (r() - 0.5) * amp)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); if (grain) { g.globalAlpha = 0.5; g.filter = 'blur(' + grain + 'px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none'; g.globalAlpha = 1; } }, !!srgb);
  };
  // fabric weave normal-ish bump (fine cross-hatch); use as bumpMap with bumpScale ~0.0015
  L.weaveBump = function () {
    return L.canvasTex('weave', 256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { for (let x = 0; x < w; x += 4) { const on = ((x + y) / 4) % 2; g.fillStyle = on ? '#9a9a9a' : '#6a6a6a'; g.fillRect(x, y, 4, 2); g.fillStyle = on ? '#6a6a6a' : '#9a9a9a'; g.fillRect(x, y + 2, 4, 2); } } }, false);
  };
  // text label texture (book spines, screens, stickers)
  L.textTex = function (key, w, h, bg, draw) { return L.canvasTex('txt_' + key, w, h, (g, W, H) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); draw(g, W, H); }, true); };

  // ---------- materials ----------
  // mat({ c, map, rough, metal, bump, bumpScale, normal, roughMap, emissive, emissiveIntensity, transparent, opacity, side, clearcoat, sheen, physical, env })
  L.mat = function (o) {
    o = o || {};
    const physical = o.physical || o.clearcoat != null || o.transmission != null;
    const p = { color: o.c ? L.col(o.c) : new THREE.Color(1, 1, 1), roughness: o.rough != null ? o.rough : 0.6, metalness: o.metal || 0 };
    if (o.map) p.map = o.map;
    if (o.bump) { p.bumpMap = o.bump; p.bumpScale = o.bumpScale != null ? o.bumpScale : 0.002; }
    if (o.normal) { p.normalMap = o.normal; if (o.normalScale) p.normalScale = new THREE.Vector2(o.normalScale, o.normalScale); }
    if (o.roughMap) p.roughnessMap = o.roughMap;
    if (o.alphaMap) { p.alphaMap = o.alphaMap; p.transparent = true; p.alphaTest = o.alphaTest != null ? o.alphaTest : 0.4; }
    if (o.emissive) { p.emissive = L.col(o.emissive); p.emissiveIntensity = o.emissiveIntensity != null ? o.emissiveIntensity : 1; }
    if (o.emissiveMap) p.emissiveMap = o.emissiveMap;
    if (o.transparent) { p.transparent = true; p.opacity = o.opacity != null ? o.opacity : 1; }
    if (o.side) p.side = o.side;
    if (o.env != null) p.envMapIntensity = o.env;
    if (physical) { if (o.clearcoat != null) { p.clearcoat = o.clearcoat; p.clearcoatRoughness = o.clearcoatRough != null ? o.clearcoatRough : 0.1; } if (o.transmission != null) p.transmission = o.transmission; }
    const m = physical ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
    m.name = o.name || '';
    return m;
  };

  // ---------- geometry ----------
  function place(m, x, y, z, o) { m.position.set(x || 0, y || 0, z || 0); if (o) { if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.order) m.rotation.order = o.order; } m.castShadow = !(o && o.shadow === false); m.receiveShadow = true; return m; }
  L.mesh = function (parent, geo, mat, x, y, z, o) { const m = place(new THREE.Mesh(geo, mat), x, y, z, o); parent.add(m); return m; };
  // rounded box; (w,h,d) centred at (x,y,z)
  L.rbox = function (parent, w, h, d, r, mat, x, y, z, o) { const seg = (o && o.seg) || 3; const g = THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d); return L.mesh(parent, g, mat, x, y, z, o); };
  L.box = function (parent, w, h, d, mat, x, y, z, o) { return L.mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, o); };
  L.cyl = function (parent, r1, r2, h, mat, x, y, z, o) { return L.mesh(parent, new THREE.CylinderGeometry(r1, r2, h, (o && o.seg) || 24, 1, !!(o && o.open)), mat, x, y, z, o); };
  L.sph = function (parent, r, mat, x, y, z, o) { return L.mesh(parent, new THREE.SphereGeometry(r, (o && o.ws) || 24, (o && o.hs) || 16), mat, x, y, z, o); };
  L.torus = function (parent, R, r, mat, x, y, z, o) { return L.mesh(parent, new THREE.TorusGeometry(R, r, (o && o.rs) || 12, (o && o.ts) || 32, (o && o.arc) || Math.PI * 2), mat, x, y, z, o); };
  L.plane = function (parent, w, h, mat, x, y, z, o) { const m = L.mesh(parent, new THREE.PlaneGeometry(w, h), mat, x, y, z, o); m.castShadow = !!(o && o.shadow); return m; };
  // lathe: profile [[r,y],...] revolved about y
  L.lathe = function (parent, pts, mat, x, y, z, o) { return L.mesh(parent, new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), (o && o.seg) || 32), mat, x, y, z, o); };
  // extrude a THREE.Shape (in the xy plane) by depth along z, centred on z
  L.extrude = function (parent, shape, depth, mat, x, y, z, o) { o = o || {}; const g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: o.bevel !== false, bevelThickness: o.bevelT != null ? o.bevelT : 0.004, bevelSize: o.bevelS != null ? o.bevelS : 0.004, bevelSegments: o.bevelSeg || 3, curveSegments: o.curve || 24 }); g.translate(0, 0, -depth / 2); return L.mesh(parent, g, mat, x, y, z, o); };
  L.tube = function (parent, pts, r, mat, o) { o = o || {}; const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed); return L.mesh(parent, new THREE.TubeGeometry(curve, o.segs || 48, r, o.radial || 10, !!o.closed), mat, 0, 0, 0, o); };
  L.roundRectShape = function (w, h, r) { const s = new THREE.Shape(); const x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
  // soft displaced slab (cushions, folded clothes, mattress tops): a subdivided rounded box pushed by noise
  L.puffy = function (parent, w, h, d, r, mat, x, y, z, o) {
    o = o || {}; const seg = o.seg || 5;
    const g = THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d, 8, 4, 8);
    const pos = g.attributes.position, rr = L.rnd(o.seed || (w * 100 + d * 37));
    const amp = o.amp != null ? o.amp : 0.008, bulge = o.bulge != null ? o.bulge : 0.25;
    const ph = [rr() * 6, rr() * 6, rr() * 6];
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const nx = px / (w / 2), nz = pz / (d / 2);
      const top = py > 0 ? 1 : -1;
      const b = (1 - nx * nx) * (1 - nz * nz) * bulge * h * 0.5 * top; // pillow bulge on top and bottom
      const n = Math.sin(px * 23 + ph[0]) * Math.cos(pz * 19 + ph[1]) + Math.sin((px + pz) * 41 + ph[2]) * 0.5;
      pos.setY(i, py + b + n * amp * (py > 0 ? 1 : 0.3));
    }
    g.computeVertexNormals();
    return L.mesh(parent, g, mat, x, y, z, o);
  };
  L.group = function (parent, x, y, z, ry) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (ry) g.rotation.y = ry; if (parent) parent.add(g); return g; };
  // merge every mesh's world transform into the group (keeps materials) — call for big static props to save draw calls
  L.finish = function (g, info) { g.userData = Object.assign(g.userData || {}, info || {}); g.traverse(o => { if (o.isMesh) { if (o.castShadow === undefined) o.castShadow = true; o.receiveShadow = true; } }); return g; };
})();
