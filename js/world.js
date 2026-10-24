// 3D-мир: дом, мебель, персонажи, освещение, выбор объектов лучом.
(function () {
  const H = 2.8;       // высота стен
  const T = 0.15;      // толщина стен
  const W = {};
  HW.World = W;

  let scene, camera, renderer, raycaster;
  const matCache = {};
  const furnGroups = {};       // id -> group
  const furnColliders = {};    // id -> [x0,z0,x1,z1]
  const baseColliders = [];    // стены и постоянная мебель
  let interactables = [];      // {iid, obj}
  const pickRoots = [];        // объекты, участвующие в raycast (включая стены)
  const dyn = {};              // динамические объекты
  let lights = {};

  // ---------- материалы и текстуры ----------
  function mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    }
    return matCache[key];
  }
  function canvasTex(size, draw, rx, ry) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    return t;
  }
  function rnd(seed) { // детерминированный генератор
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function woodTex(rx, ry, base) {
    return canvasTex(256, (g, s) => {
      const r = rnd(7);
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      const ph = s / 8;
      for (let i = 0; i < 8; i++) {
        const l = 0.85 + r() * 0.25;
        g.fillStyle = `rgba(${l > 1 ? 255 : 0},${l > 1 ? 240 : 0},${l > 1 ? 220 : 0},${Math.abs(1 - l) * 0.6})`;
        g.fillRect(0, i * ph, s, ph);
        g.fillStyle = 'rgba(60,35,15,0.35)';
        g.fillRect(0, i * ph, s, 2);
        const off = r() * s;
        g.fillRect(off, i * ph, 2, ph);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = 'rgba(80,50,20,0.08)';
          g.fillRect(0, i * ph + r() * ph, s, 1);
        }
      }
    }, rx, ry);
  }
  function tileTex(rx, ry, a, b) {
    return canvasTex(128, (g, s) => {
      g.fillStyle = a; g.fillRect(0, 0, s, s);
      g.fillStyle = b; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2;
      g.strokeRect(0, 0, s / 2, s / 2); g.strokeRect(s / 2, s / 2, s / 2, s / 2);
      g.strokeRect(s / 2, 0, s / 2, s / 2); g.strokeRect(0, s / 2, s / 2, s / 2);
    }, rx, ry);
  }
  function carpetTex(rx, ry, base) {
    return canvasTex(128, (g, s) => {
      const r = rnd(3);
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1500; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        g.fillRect(r() * s, r() * s, 2, 2);
      }
    }, rx, ry);
  }


  // ---------- примитивы (y — низ объекта) ----------
  function box(g, w, h, d, color, x, y, z, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat(color));
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  }
  function boxR(g, x0, y0, z0, x1, y1, z1, color, m) { // по границам
    return box(g, x1 - x0, y1 - y0, z1 - z0, color, (x0 + x1) / 2, y0, (z0 + z1) / 2, m);
  }
  function cyl(g, rt, rb, h, color, x, y, z, seg, m) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 16), m || mat(color));
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  }
  function sph(g, r, color, x, y, z, m) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m || mat(color));
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  }
  function tag(obj, iid) {
    obj.userData.iid = iid;
    interactables.push({ iid, obj });
    pickRoots.push(obj);
    return obj;
  }

  // ---------- стены ----------
  // Стена вдоль X (z = const) или вдоль Z (x = const) с проёмами [центр, ширина]
  // ---------- обои: текстура на 1×1 м по стилю ----------
  function wallpaperTex(st) {
    let seed = 0;
    for (const ch of st.base + st.pat) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return canvasTex(256, (g, s) => {
      const r = rnd(seed);
      const ink = st.ink || 'rgba(0,0,0,0.08)';
      g.fillStyle = st.base; g.fillRect(0, 0, s, s);
      // лёгкая фактура везде
      for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; g.fillRect(r() * s, r() * s, 2, 2); }
      g.fillStyle = ink; g.strokeStyle = ink;
      if (st.pat === 'stripes') for (let i = 0; i < 4; i++) g.fillRect(i * s / 4, 0, s / 14, s);
      if (st.pat === 'dots') for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { g.beginPath(); g.arc((x + (y % 2) * 0.5) * s / 5, y * s / 5 + s / 10, s / 34, 0, 7); g.fill(); }
      if (st.pat === 'tiles') { g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); } }
      if (st.pat === 'flowers') for (let i = 0; i < 7; i++) {
        const cx = r() * s, cy = r() * s;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 1.256) * 9, cy + Math.sin(k * 1.256) * 9, 6, 0, 7); g.fill(); }
        g.fillStyle = '#f6d36b'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill(); g.fillStyle = ink;
      }
      if (st.pat === 'clouds') for (let i = 0; i < 3; i++) {
        const cx = r() * s, cy = r() * s;
        [[0, 0, 22], [18, 4, 16], [-18, 5, 15], [8, -10, 15]].forEach(([dx, dy, rr]) => { g.beginPath(); g.arc(cx + dx, cy + dy, rr, 0, 7); g.fill(); });
      }
      if (st.pat === 'stars') for (let i = 0; i < 18; i++) { const sz = r() < 0.2 ? 4 : 2; g.fillRect(r() * s, r() * s, sz, sz); }
      if (st.pat === 'leaves') for (let i = 0; i < 9; i++) {
        g.save(); g.translate(r() * s, r() * s); g.rotate(r() * 6.28);
        g.beginPath(); g.ellipse(0, 0, 22, 9, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-20, 0); g.lineTo(20, 0); g.stroke(); g.restore();
      }
      if (st.pat === 'brick') {
        g.lineWidth = 4; const bh = s / 8;
        for (let y = 0; y < 8; y++) {
          g.beginPath(); g.moveTo(0, y * bh); g.lineTo(s, y * bh); g.stroke();
          for (let x = 0; x < 4; x++) { const bx = x * s / 4 + (y % 2) * s / 8; g.beginPath(); g.moveTo(bx, y * bh); g.lineTo(bx, (y + 1) * bh); g.stroke(); }
        }
      }
    }, 1, 1);
  }
  W.wallpaperTex = wallpaperTex;
  const wallMats = {};
  function roomSide(x, z) { return (x < 0 || x > 16 || z < 0 || z > 12) ? 'ext' : HW.roomAt(x, z); }
  function initWallMats() {
    wallMats.ext = new THREE.MeshLambertMaterial({ color: '#e9e2d6' });
    wallMats.cap = mat('#efe7da');
    HW.ROOM_IDS.forEach(id => { wallMats[id] = new THREE.MeshLambertMaterial({ map: wallpaperTex(HW.DEFAULT_WALLS[id]) }); });
  }
  // Применить обои: walls = {комната: id обоев}
  const appliedWalls = {};
  W.applyWalls = function (walls) {
    HW.ROOM_IDS.forEach(id => {
      const key = (walls && walls[id]) || 'default';
      if (appliedWalls[id] === key) return;
      appliedWalls[id] = key;
      const st = key === 'default' ? HW.DEFAULT_WALLS[id] : HW.wallpaperById[key];
      if (!st) return;
      const m = wallMats[id];
      if (m.map) m.map.dispose();
      m.map = wallpaperTex(st);
      m.needsUpdate = true;
    });
  };
  // Кусок стены: каждая сторона — материал своей комнаты, UV в метрах (узор не растягивается)
  function wallPiece(g, w, h, d, x, y, z, faceMats) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]);
    }
    const mesh = new THREE.Mesh(geo, faceMats);
    mesh.position.set(x, y + h / 2, z);
    g.add(mesh);
    return mesh;
  }
  function sideMats(axis, c, mid) {
    const cap = wallMats.cap;
    if (axis === 'x') return [cap, cap, cap, cap, wallMats[roomSide(mid, c + 0.3)], wallMats[roomSide(mid, c - 0.3)]];
    return [wallMats[roomSide(c + 0.3, mid)], wallMats[roomSide(c - 0.3, mid)], cap, cap, cap, cap];
  }

  // ---------- стены ----------
  // Стена вдоль X (z = const) или вдоль Z (x = const) с проёмами [центр, ширина]
  // куски стен для вида сверху: {mesh, axis, c, kind: 'full' | 'top'}
  const wallParts = [];
  function wall(axis, c, a, b, gaps, wallsGroup, doorH) {
    gaps = (gaps || []).slice().sort((p, q) => p[0] - q[0]);
    const reg = (mesh, kind) => wallParts.push({ mesh, axis, c, kind });
    let cur = a;
    const segs = [];
    gaps.forEach(([gc, gw]) => { segs.push([cur, gc - gw / 2]); cur = gc + gw / 2; });
    segs.push([cur, b]);
    // режем по границам комнат, чтобы у каждого куска с каждой стороны была одна комната
    const cuts = axis === 'x' ? [6, 9, 12] : [6, 9];
    const pieces = [];
    segs.forEach(([s0, e0]) => {
      let st = s0;
      cuts.filter(k => k > s0 + 0.01 && k < e0 - 0.01).forEach(k => { pieces.push([st, k]); st = k; });
      pieces.push([st, e0]);
    });
    pieces.forEach(([s, e]) => {
      if (e - s < 0.01) return;
      const mid = (s + e) / 2, mats = sideMats(axis, c, mid);
      reg(axis === 'x' ? wallPiece(wallsGroup, e - s, H, T, mid, 0, c, mats) : wallPiece(wallsGroup, T, H, e - s, c, 0, mid, mats), 'full');
    });
    segs.forEach(([s, e]) => {
      if (e - s < 0.01) return;
      if (axis === 'x') baseColliders.push([s, c - T / 2, e, c + T / 2]);
      else baseColliders.push([c - T / 2, s, c + T / 2, e]);
    });
    // перемычки над проёмами
    gaps.forEach(([gc, gw]) => {
      const dh = doorH || 2.15, mats = sideMats(axis, c, gc);
      reg(axis === 'x' ? wallPiece(wallsGroup, gw, H - dh, T, gc, dh, c, mats) : wallPiece(wallsGroup, T, H - dh, gw, c, dh, gc, mats), 'top');
      // наличник
      if (axis === 'x') {
        reg(box(wallsGroup, 0.06, dh, T + 0.04, '#ffffff', gc - gw / 2, 0, c), 'full');
        reg(box(wallsGroup, 0.06, dh, T + 0.04, '#ffffff', gc + gw / 2, 0, c), 'full');
      } else {
        reg(box(wallsGroup, T + 0.04, dh, 0.06, '#ffffff', c, 0, gc - gw / 2), 'full');
        reg(box(wallsGroup, T + 0.04, dh, 0.06, '#ffffff', c, 0, gc + gw / 2), 'full');
      }
    });
  }

  const WINDOWS = [];
  function windowAt(house, axis, c, center, inward) {
    const g = new THREE.Group();
    house.add(g);
    WINDOWS.push({ axis, c, center, inward, group: g });
    // окно — светящаяся панель с рамой, inward: +1/-1 смещение внутрь комнаты
    const wmat = new THREE.MeshBasicMaterial({ color: '#cfe8ff' });
    dyn.windowMats = dyn.windowMats || [];
    dyn.windowMats.push(wmat);
    const off = (T / 2 + 0.01) * inward;
    let pane;
    if (axis === 'x') {
      pane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), wmat);
      pane.position.set(center, 1.55, c + off);
      if (inward < 0) pane.rotation.y = Math.PI;
      g.add(pane);
      box(g, 1.75, 0.08, 0.12, '#ffffff', center, 0.86, c + off);
      box(g, 1.75, 0.08, 0.06, '#ffffff', center, 2.2, c + off);
      box(g, 0.05, 1.3, 0.05, '#ffffff', center, 0.9, c + off);
    } else {
      pane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), wmat);
      pane.position.set(c + off, 1.55, center);
      pane.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(pane);
      box(g, 0.12, 0.08, 1.75, '#ffffff', c + off, 0.86, center);
      box(g, 0.06, 0.08, 1.75, '#ffffff', c + off, 2.2, center);
      box(g, 0.05, 1.3, 0.05, '#ffffff', c + off, 0.9, center);
    }
    // шторы
    const cm = '#d9c7a7';
    if (axis === 'x') {
      box(g, 0.35, 1.6, 0.04, cm, center - 1.0, 0.6, c + off * 3);
      box(g, 0.35, 1.6, 0.04, cm, center + 1.0, 0.6, c + off * 3);
    } else {
      box(g, 0.04, 1.6, 0.35, cm, c + off * 3, 0.6, center - 1.0);
      box(g, 0.04, 1.6, 0.35, cm, c + off * 3, 0.6, center + 1.0);
    }
  }

  function buildHouse() {
    const house = new THREE.Group();
    scene.add(house);
    initWallMats();

    // полы
    const floors = {
      living:  new THREE.MeshLambertMaterial({ map: woodTex(3, 3, '#b07a4a') }),
      kids:    new THREE.MeshLambertMaterial({ map: woodTex(3, 3, '#c49a6c') }),
      bedroom: new THREE.MeshLambertMaterial({ map: woodTex(2, 3, '#a8764c') }),
      kitchen: new THREE.MeshLambertMaterial({ map: tileTex(7, 6, '#e9e3d6', '#cfc5b3') }),
      bath:    new THREE.MeshLambertMaterial({ map: tileTex(5, 5, '#d8ecf2', '#b6d6e0') }),
      hall:    new THREE.MeshLambertMaterial({ map: tileTex(3, 12, '#d6c8b4', '#bfae95') }),
    };
    const fl = (x0, z0, x1, z1, m) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      house.add(p);
    };
    fl(0, 0, 6, 6, floors.living);
    fl(0, 6, 6, 12, floors.kids);
    fl(9, 0, 16, 6, floors.kitchen);
    fl(9, 9, 12, 12, floors.bath);
    fl(12, 6, 16, 12, floors.bedroom);
    fl(6, 0, 9, 12, floors.hall);
    fl(9, 6, 12, 9, floors.hall);

    // потолок
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), mat('#f7f3ee'));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(8, H, 6);
    house.add(ceil);
    dyn.ceil = ceil;

    // улица за окнами — просто земля
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#7aa65a'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(8, -0.02, 6);
    house.add(ground);

    const walls = new THREE.Group();
    W._walls = walls;
    house.add(walls);
    pickRoots.push(walls);
    // внешние
    wall('x', 0, 0, 16, [[7.5, 1.2]], walls);
    wall('x', 12, 0, 16, [], walls);
    wall('z', 0, 0, 12, [], walls);
    wall('z', 16, 0, 12, [], walls);
    // внутренние
    wall('z', 6, 0, 12, [[3, 1.2], [9, 1.2]], walls);
    wall('z', 9, 0, 6, [[3, 1.2]], walls);
    wall('z', 9, 9, 12, [], walls);
    wall('x', 6, 0, 6, [], walls);
    wall('x', 6, 9, 16, [], walls);
    wall('x', 9, 9, 12, [[10.5, 1.0]], walls);
    wall('z', 12, 6, 12, [[7.5, 1.1]], walls);

    // окна
    windowAt(house, 'x', 0, 3, 1);
    windowAt(house, 'x', 0, 12.5, 1);
    windowAt(house, 'z', 0, 3.5, 1);
    windowAt(house, 'z', 0, 9, 1);
    windowAt(house, 'z', 16, 9.3, -1);
    windowAt(house, 'x', 12, 14.2, -1);
    windowAt(house, 'x', 12, 3, -1);

    // плинтусы
    const bb = '#e8e0d2';
    // (лёгкий вариант — только по периметру)
    boxR(house, 0, 0, 0.07, 16, 0.08, 0.1, bb);
    boxR(house, 0, 0, 11.9, 16, 0.08, 11.93, bb);

    // потолочные светильники
    dyn.lampMats = [];
    [[3, 3], [3, 9], [12.5, 3], [10.5, 10.5], [14, 9], [7.5, 3], [7.5, 9]].forEach(([x, z]) => {
      const lm = new THREE.MeshBasicMaterial({ color: '#fff6dd' });
      dyn.lampMats.push(lm);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.06, 20), lm);
      l.position.set(x, H - 0.03, z);
      house.add(l);
      (dyn.ceilLamps = dyn.ceilLamps || []).push(l);
    });

    // входная дверь
    const door = new THREE.Group();
    boxR(door, 6.92, 0, -0.03, 8.08, 2.12, 0.05, '#7a4a2a');
    boxR(door, 7.0, 0.3, 0.05, 8.0, 1.0, 0.07, '#6a3e22');
    boxR(door, 7.0, 1.2, 0.05, 8.0, 1.95, 0.07, '#6a3e22');
    sph(door, 0.05, '#d4af37', 7.85, 1.05, 0.1);
    boxR(door, 6.9, 0.005, 0.15, 8.1, 0.02, 0.8, '#5b4a3a'); // коврик
    house.add(door);
    tag(door, 'door');
    dyn.frontDoor = door;
    baseColliders.push([6.9, -0.1, 8.1, 0.1]);

    // ---------- постоянная мебель ----------
    // Кухня: холодильник, плита, мойка, столешницы
    const fridge = new THREE.Group();
    boxR(fridge, 15.25, 0, 5.1, 15.95, 1.9, 5.9, '#e9edf0');
    boxR(fridge, 15.22, 1.15, 5.15, 15.25, 1.17, 5.85, '#aab3ba');
    boxR(fridge, 15.18, 0.5, 5.75, 15.23, 1.05, 5.8, '#9aa3aa');
    boxR(fridge, 15.18, 1.3, 5.75, 15.23, 1.75, 5.8, '#9aa3aa');
    house.add(fridge); tag(fridge, 'fridge');

    const stove = new THREE.Group();
    boxR(stove, 15.3, 0, 4.3, 15.95, 0.88, 5.0, '#dadde0');
    boxR(stove, 15.3, 0.88, 4.3, 15.95, 0.9, 5.0, '#222');
    [[15.48, 4.47], [15.48, 4.83], [15.78, 4.47], [15.78, 4.83]].forEach(([x, z]) => cyl(stove, 0.1, 0.1, 0.01, '#444', x, 0.9, z));
    boxR(stove, 15.27, 0.15, 4.4, 15.3, 0.7, 4.9, '#333');
    // кастрюля (видна, если есть готовая еда)
    dyn.pot = new THREE.Group();
    cyl(dyn.pot, 0.16, 0.14, 0.2, '#b0b6bb', 15.48, 0.91, 4.65);
    cyl(dyn.pot, 0.17, 0.17, 0.02, '#8a9196', 15.48, 1.11, 4.65);
    stove.add(dyn.pot);
    house.add(stove); tag(stove, 'stove');

    const sink = new THREE.Group();
    boxR(sink, 15.3, 0, 3.3, 15.95, 0.86, 4.3, '#c9b49a');
    boxR(sink, 15.3, 0.86, 3.3, 15.95, 0.9, 4.3, '#f0eee9');
    boxR(sink, 15.4, 0.87, 3.6, 15.85, 0.905, 4.1, '#7d868c');
    cyl(sink, 0.02, 0.02, 0.3, '#c0c0c0', 15.88, 0.9, 3.85);
    boxR(sink, 15.72, 1.17, 3.83, 15.9, 1.2, 3.87, '#c0c0c0');
    dyn.dishes = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const plate = cyl(dyn.dishes, 0.12, 0.1, 0.02, i % 3 === 0 ? '#f4f4f4' : (i % 3 === 1 ? '#e6efe9' : '#f0e6d8'),
        15.62 + (i % 2) * 0.03 - 0.015, 0.91 + Math.floor(i / 2) * 0.025 + (i >= 6 ? 0 : 0), i >= 6 ? 3.45 : 3.42);
      if (i >= 6) plate.position.z = 3.42; // стопка
      plate.position.y = 0.91 + i * 0.024;
    }
    sink.add(dyn.dishes);
    house.add(sink); tag(sink, 'sink');

    // остальная столешница + место под посудомойку
    const counter = new THREE.Group();
    boxR(counter, 15.3, 0, 2.0, 15.95, 0.86, 3.3, '#c9b49a');
    boxR(counter, 15.3, 0.86, 1.3, 15.95, 0.9, 3.3, '#f0eee9');
    dyn.counterNoDW = boxR(counter, 15.3, 0, 1.3, 15.95, 0.86, 2.0, '#c9b49a');
    // навесные шкафы
    boxR(counter, 15.6, 1.5, 1.3, 15.95, 2.2, 4.3, '#bfa588');
    house.add(counter);
    baseColliders.push([15.2, 1.3, 16, 5.95]);

    // миска собаки
    const bowl = new THREE.Group();
    cyl(bowl, 0.17, 0.13, 0.08, '#d0463a', 9.6, 0, 5.5);
    dyn.kibble = cyl(bowl, 0.13, 0.13, 0.02, '#8a5a2a', 9.6, 0.065, 5.5);
    cyl(bowl, 0.15, 0.12, 0.07, '#3a7bd5', 10.0, 0, 5.55);
    house.add(bowl); tag(bowl, 'bowl');

    // ноутбук (на столешнице или на рабочем столе)
    dyn.laptop = new THREE.Group();
    boxR(dyn.laptop, -0.18, 0, -0.13, 0.18, 0.02, 0.13, '#2d2f33');
    const scr = boxR(dyn.laptop, -0.18, 0.02, 0.11, 0.18, 0.26, 0.13, '#2d2f33');
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshBasicMaterial({ color: '#5aa0e6' }));
    sc.position.set(0, 0.14, 0.105); sc.rotation.y = Math.PI;
    dyn.laptop.add(sc);
    house.add(dyn.laptop); tag(dyn.laptop, 'laptop');

    // Ванная: ванна, унитаз, раковина, корзина
    const tub = new THREE.Group();
    boxR(tub, 9.2, 0, 11.1, 10.9, 0.55, 11.9, '#f7f7f7');
    boxR(tub, 9.3, 0.3, 11.2, 10.8, 0.56, 11.8, '#bfe3f0');
    cyl(tub, 0.02, 0.02, 0.25, '#c0c0c0', 9.35, 0.55, 11.5);
    house.add(tub); tag(tub, 'tub');
    baseColliders.push([9.15, 11.05, 10.95, 11.95]);

    const toilet = new THREE.Group();
    cyl(toilet, 0.2, 0.17, 0.42, '#fafafa', 11.62, 0, 9.95);
    boxR(toilet, 11.4, 0.42, 9.5, 11.84, 0.8, 9.68, '#fafafa');
    house.add(toilet);
    baseColliders.push([11.35, 9.45, 11.95, 10.2]);

    const bsink = new THREE.Group();
    boxR(bsink, 9.05, 0, 9.8, 9.55, 0.8, 10.4, '#ffffff');
    boxR(bsink, 9.12, 0.8, 9.85, 9.5, 0.85, 10.35, '#e8eef0');
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ color: '#b9d6e0' }));
    mirror.position.set(9.09, 1.55, 10.1); mirror.rotation.y = Math.PI / 2;
    bsink.add(mirror);
    house.add(bsink);
    baseColliders.push([9.0, 9.75, 9.6, 10.45]);

    const basket = new THREE.Group();
    cyl(basket, 0.24, 0.2, 0.5, '#c8a26a', 11.6, 0, 10.75);
    dyn.laundryHeap = sph(basket, 0.22, '#8fa7c9', 11.6, 0.5, 10.75);
    house.add(basket); tag(basket, 'basket');

    // Спальня: матрас (пока нет кровати), тумба
    const mattress = new THREE.Group();
    boxR(mattress, 13.6, 0, 9.8, 15.4, 0.25, 11.8, '#ece6d8');
    boxR(mattress, 13.75, 0.25, 11.3, 14.45, 0.37, 11.7, '#ffffff');
    boxR(mattress, 14.55, 0.25, 11.3, 15.25, 0.37, 11.7, '#ffffff');
    boxR(mattress, 13.62, 0.25, 9.85, 15.38, 0.3, 11.0, '#9db5c9');
    house.add(mattress); tag(mattress, 'bed');
    dyn.mattress = mattress;

    const nstand = new THREE.Group();
    boxR(nstand, 12.9, 0, 11.3, 13.4, 0.5, 11.85, '#8b6a4a');
    cyl(nstand, 0.05, 0.08, 0.3, '#e0c080', 13.15, 0.5, 11.6);
    const shade = cyl(nstand, 0.1, 0.16, 0.18, null, 13.15, 0.78, 11.6, 16, new THREE.MeshBasicMaterial({ color: '#fff0c8' }));
    dyn.nightShade = shade;
    house.add(nstand);
    baseColliders.push([12.85, 11.25, 13.45, 11.9]);

    // Детская: матрасы
    const km = new THREE.Group();
    boxR(km, 0.3, 0, 9.4, 1.2, 0.22, 11.4, '#ece6d8');
    boxR(km, 0.32, 0.22, 9.45, 1.18, 0.26, 10.8, '#7fb3e6');
    boxR(km, 1.5, 0, 9.4, 2.4, 0.22, 11.4, '#ece6d8');
    boxR(km, 1.52, 0.22, 9.45, 2.38, 0.26, 10.8, '#f2a7c3');
    boxR(km, 0.45, 0.22, 10.95, 1.05, 0.32, 11.3, '#ffffff');
    boxR(km, 1.65, 0.22, 10.95, 2.25, 0.32, 11.3, '#ffffff');
    house.add(km); tag(km, 'kidsbed');
    dyn.kidsMattress = km;

    // постеры в детской
    const poster = (x, z, c) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), mat(c));
      p.position.set(x, 1.6, z); p.rotation.y = Math.PI;
      house.add(p);
    };
    poster(2.0, 11.9, '#ffd36b');
    poster(4.4, 11.9, '#8fd3a8');

    // Коробки после переезда
    dyn.boxes = [];
    [[4.6, 1.3, 0.6], [5.2, 1.4, 0.5], [4.9, 1.35, 0.45, 0.6], [1.4, 3.2, 0.55], [4.7, 8.0, 0.5], [13.2, 8.6, 0.6], [10.5, 5.2, 0.5], [7.5, 6.5, 0.45]]
      .forEach(([x, z, s, y]) => {
        const b = box(house, s, s * 0.8, s, '#c79b62', x, y || 0, z);
        const tape = box(house, s + 0.005, 0.02, 0.08, '#e8d7a8', x, (y || 0) + s * 0.8 - 0.01, z);
        dyn.boxes.push([b, tape]);
      });
  }

  // ---------- покупаемая мебель ----------
  const BUILD = {
    sofa(g) {
      const c = '#5b7db1';
      boxR(g, 1.9, 0, 5.0, 4.1, 0.45, 5.9, c);
      boxR(g, 1.9, 0.45, 5.7, 4.1, 0.95, 5.92, c);
      boxR(g, 1.9, 0.45, 5.0, 2.1, 0.65, 5.9, c);
      boxR(g, 3.9, 0.45, 5.0, 4.1, 0.65, 5.9, c);
      boxR(g, 2.15, 0.45, 5.1, 2.98, 0.55, 5.65, '#6a8cc2');
      boxR(g, 3.02, 0.45, 5.1, 3.85, 0.55, 5.65, '#6a8cc2');
      return [1.9, 5.0, 4.1, 5.95];
    },
    tv(g) {
      boxR(g, 2.1, 0, 0.12, 3.9, 0.5, 0.58, '#3b3b3b');
      boxR(g, 2.3, 0.5, 0.3, 3.7, 1.35, 0.36, '#111');
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.78), new THREE.MeshBasicMaterial({ color: '#1d2a3c' }));
      s.position.set(3, 0.925, 0.365);
      g.add(s); dyn.tvScreen = s;
      return [2.1, 0.1, 3.9, 0.6];
    },
    coffeeTable(g) {
      boxR(g, 2.4, 0.38, 3.1, 3.6, 0.43, 3.7, '#8b5a2b');
      [[2.45, 3.15], [3.5, 3.15], [2.45, 3.6], [3.5, 3.6]].forEach(([x, z]) => boxR(g, x, 0, z, x + 0.05, 0.38, z + 0.05, '#6b4421'));
      return [2.4, 3.1, 3.6, 3.7];
    },
    rugLiving(g) {
      const m = new THREE.MeshLambertMaterial({ map: carpetTex(2, 2, '#c46b5a') });
      boxR(g, 1.5, 0, 2.3, 4.5, 0.012, 4.8, null, m);
      return null;
    },
    bookshelf(g) {
      boxR(g, 0.08, 0, 0.8, 0.48, 2.0, 2.4, '#8b5a2b');
      const r = rnd(11);
      const cols = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400'];
      for (let s = 0; s < 4; s++) {
        const y = 0.1 + s * 0.48;
        boxR(g, 0.48, y - 0.03, 0.82, 0.5, y, 2.38, '#7a4e25');
        let z = 0.88;
        while (z < 2.3) {
          const w = 0.04 + r() * 0.05, h = 0.25 + r() * 0.13;
          boxR(g, 0.2, y, z, 0.47, y + h, z + w, cols[Math.floor(r() * cols.length)]);
          z += w + 0.01;
        }
      }
      return [0.05, 0.8, 0.5, 2.4];
    },
    plantLiving(g) {
      cyl(g, 0.2, 0.15, 0.4, '#b5651d', 5.5, 0, 0.5);
      sph(g, 0.35, '#2e8b57', 5.5, 0.85, 0.5);
      sph(g, 0.25, '#3cb371', 5.45, 1.15, 0.55);
      return [5.25, 0.25, 5.75, 0.75];
    },
    treadmill(g) {
      boxR(g, 0.5, 0, 3.9, 1.3, 0.18, 5.5, '#333');
      boxR(g, 0.6, 0.18, 4.0, 1.2, 0.19, 5.4, '#555');
      boxR(g, 0.5, 0, 3.9, 0.56, 1.2, 3.96, '#444');
      boxR(g, 1.24, 0, 3.9, 1.3, 1.2, 3.96, '#444');
      boxR(g, 0.5, 1.1, 3.85, 1.3, 1.3, 4.05, '#2c3e50');
      return [0.5, 3.85, 1.3, 5.5];
    },
    diningTable(g) {
      boxR(g, 11.5, 0.72, 2.55, 13.1, 0.77, 3.45, '#a0703c');
      [[11.55, 2.6], [13.0, 2.6], [11.55, 3.35], [13.0, 3.35]].forEach(([x, z]) => boxR(g, x, 0, z, x + 0.06, 0.72, z + 0.06, '#7a5228'));
      [[11.9, 2.15], [12.7, 2.15], [11.9, 3.85], [12.7, 3.85]].forEach(([x, z], i) => {
        boxR(g, x - 0.2, 0.42, z - 0.2, x + 0.2, 0.46, z + 0.2, '#c9a27a');
        const bz = i < 2 ? z - 0.2 : z + 0.17;
        boxR(g, x - 0.2, 0.46, bz, x + 0.2, 0.9, bz + 0.03, '#c9a27a');
        [[-0.18, -0.18], [0.15, -0.18], [-0.18, 0.15], [0.15, 0.15]].forEach(([dx, dz]) => boxR(g, x + dx, 0, z + dz, x + dx + 0.03, 0.42, z + dz + 0.03, '#8a6a4a'));
      });
      return [11.4, 1.9, 13.2, 4.1];
    },
    dishwasher(g) {
      boxR(g, 15.3, 0, 1.3, 15.95, 0.86, 2.0, '#e4e7ea');
      boxR(g, 15.27, 0.7, 1.4, 15.3, 0.75, 1.9, '#9aa3aa');
      return null;
    },
    multicooker(g) {
      cyl(g, 0.15, 0.15, 0.22, '#e8e8e8', 15.6, 0.9, 2.2);
      cyl(g, 0.14, 0.15, 0.05, '#444', 15.6, 1.12, 2.2);
      return null;
    },
    plantKitchen(g) {
      cyl(g, 0.15, 0.12, 0.3, '#e0e0e0', 9.5, 0, 0.5);
      sph(g, 0.15, '#e84a7f', 9.45, 0.45, 0.5);
      sph(g, 0.13, '#f7d046', 9.58, 0.5, 0.45);
      sph(g, 0.12, '#ff7f50', 9.5, 0.55, 0.58);
      return [9.3, 0.3, 9.7, 0.7];
    },
    washer(g) {
      boxR(g, 11.3, 0, 11.25, 11.92, 0.85, 11.88, '#f5f5f5');
      const d = cyl(g, 0.2, 0.2, 0.03, '#7aa0b8', 11.28, 0.4, 11.56);
      d.rotation.z = Math.PI / 2; d.position.y = 0.4;
      const lm = new THREE.MeshBasicMaterial({ color: '#555' });
      dyn.washerLight = sph(g, 0.025, null, 11.29, 0.75, 11.75, lm);
      return [11.25, 11.2, 11.95, 11.92];
    },
    vacuum(g) {
      boxR(g, 8.6, 0, 4.4, 8.9, 0.25, 4.65, '#c0392b');
      cyl(g, 0.015, 0.015, 0.9, '#888', 8.75, 0.25, 4.5);
      boxR(g, 8.7, 1.1, 4.45, 8.8, 1.15, 4.55, '#333');
      return null;
    },
    robot(g) {
      boxR(g, 6.2, 0, 11.5, 6.6, 0.12, 11.85, '#333');
      dyn.robotBot = cyl(g, 0.17, 0.17, 0.08, '#e0e0e0', 6.4, 0, 11.4, 24);
      return null;
    },
    coatRack(g) {
      boxR(g, 6.1, 0, 0.45, 6.45, 0.45, 1.65, '#8b6a4a');
      boxR(g, 6.08, 1.7, 0.45, 6.14, 1.76, 1.65, '#6b4a2a');
      [['#8e44ad', 0.7], ['#2c3e50', 1.05], ['#e67e22', 1.4]].forEach(([c, z]) => boxR(g, 6.1, 0.95, z - 0.15, 6.35, 1.72, z + 0.15, c));
      return [6.05, 0.45, 6.5, 1.65];
    },
    dogBed(g) {
      cyl(g, 0.5, 0.5, 0.12, '#8d6e63', 8.3, 0, 11.2, 24);
      cyl(g, 0.38, 0.38, 0.13, '#d7ccc8', 8.3, 0.01, 11.2, 24);
      return null;
    },
    bed(g) {
      boxR(g, 13.5, 0, 9.6, 15.5, 0.45, 11.85, '#6d4c41');
      boxR(g, 13.55, 0.45, 9.65, 15.45, 0.6, 11.75, '#f4efe6');
      boxR(g, 13.52, 0.6, 9.6, 15.48, 0.66, 11.0, '#7f6aa8');
      boxR(g, 13.5, 0.45, 11.8, 15.5, 1.25, 11.95, '#5d4037');
      boxR(g, 13.7, 0.6, 11.25, 14.45, 0.75, 11.7, '#ffffff');
      boxR(g, 14.55, 0.6, 11.25, 15.3, 0.75, 11.7, '#ffffff');
      return [13.45, 9.55, 15.55, 11.95];
    },
    wardrobe(g) {
      boxR(g, 15.35, 0, 6.3, 15.95, 2.25, 8.1, '#d7c4a8');
      boxR(g, 15.32, 0.05, 6.35, 15.35, 2.2, 7.18, '#cbb593');
      boxR(g, 15.32, 0.05, 7.22, 15.35, 2.2, 8.05, '#e8dccb');
      return [15.3, 6.25, 16, 8.15];
    },
    desk(g) {
      boxR(g, 13.6, 0.72, 6.1, 15.0, 0.76, 6.75, '#f0f0f0');
      boxR(g, 13.62, 0, 6.12, 13.67, 0.72, 6.7, '#999');
      boxR(g, 14.93, 0, 6.12, 14.98, 0.72, 6.7, '#999');
      boxR(g, 14.1, 0.42, 6.9, 14.5, 0.46, 7.3, '#333');
      boxR(g, 14.1, 0.46, 7.27, 14.5, 0.95, 7.32, '#333');
      cyl(g, 0.03, 0.03, 0.42, '#555', 14.3, 0, 7.1);
      return [13.55, 6.05, 15.05, 6.8];
    },
    bunkBed(g) {
      const c = '#e3c08d';
      [[0.2, 9.7], [1.25, 9.7], [0.2, 11.75], [1.25, 11.75]].forEach(([x, z]) => boxR(g, x, 0, z, x + 0.06, 1.95, z + 0.06, c));
      boxR(g, 0.2, 0.25, 9.7, 1.31, 0.4, 11.81, c);
      boxR(g, 0.25, 0.4, 9.75, 1.26, 0.52, 11.76, '#f4efe6');
      boxR(g, 0.25, 0.52, 9.75, 1.26, 0.56, 11.0, '#f2a7c3');
      boxR(g, 0.2, 1.25, 9.7, 1.31, 1.4, 11.81, c);
      boxR(g, 0.25, 1.4, 9.75, 1.26, 1.52, 11.76, '#f4efe6');
      boxR(g, 0.25, 1.52, 9.75, 1.26, 1.56, 11.0, '#7fb3e6');
      boxR(g, 0.2, 1.55, 9.7, 1.31, 1.75, 9.76, c);
      for (let i = 0; i < 5; i++) boxR(g, 1.3, 0.3 + i * 0.3, 10.0, 1.34, 0.33 + i * 0.3, 10.45, c);
      return [0.15, 9.65, 1.4, 11.85];
    },
    kidsDesk(g) {
      boxR(g, 2.6, 0.58, 11.3, 3.9, 0.62, 11.9, '#9fd3f0');
      [[2.62, 11.32], [3.84, 11.32], [2.62, 11.84], [3.84, 11.84]].forEach(([x, z]) => boxR(g, x, 0, z, x + 0.04, 0.58, z + 0.04, '#5aa9d6'));
      boxR(g, 2.8, 0.32, 10.85, 3.1, 0.35, 11.15, '#f39c12');
      boxR(g, 3.4, 0.32, 10.85, 3.7, 0.35, 11.15, '#e74c3c');
      boxR(g, 2.9, 0.62, 11.45, 3.2, 0.64, 11.7, '#ffffff');
      return [2.55, 11.25, 3.95, 11.95];
    },
    toyBox(g) {
      boxR(g, 4.95, 0, 11.2, 5.75, 0.45, 11.7, '#e74c3c');
      boxR(g, 4.95, 0.45, 11.2, 5.75, 0.5, 11.7, '#f1c40f');
      sph(g, 0.1, '#3498db', 5.2, 0.55, 11.4);
      return [4.9, 11.15, 5.8, 11.75];
    },
    armchair(g) {
      const c = '#b5654a';
      boxR(g, 4.65, 0, 4.25, 5.5, 0.42, 5.1, c);
      boxR(g, 5.3, 0.42, 4.25, 5.5, 1.0, 5.1, c);
      boxR(g, 4.65, 0.42, 4.25, 5.3, 0.62, 4.42, c);
      boxR(g, 4.65, 0.42, 4.93, 5.3, 0.62, 5.1, c);
      boxR(g, 4.7, 0.42, 4.45, 5.28, 0.5, 4.9, '#c97a5e');
      return [4.6, 4.2, 5.55, 5.15];
    },
    floorLamp(g) {
      cyl(g, 0.18, 0.2, 0.04, '#333', 1.6, 0, 5.65);
      cyl(g, 0.015, 0.015, 1.5, '#333', 1.6, 0.04, 5.65);
      cyl(g, 0.16, 0.24, 0.3, null, 1.6, 1.5, 5.65, 20, new THREE.MeshBasicMaterial({ color: '#fff0c8' }));
      return [1.42, 5.47, 1.78, 5.83];
    },
    fireplace(g) {
      // рамка с открытой топкой, чтобы огонь было видно
      const st = '#e8e1d6';
      boxR(g, 4.6, 0, 5.86, 5.85, 1.05, 5.94, st);
      boxR(g, 4.6, 0, 5.55, 4.85, 1.05, 5.86, st);
      boxR(g, 5.6, 0, 5.55, 5.85, 1.05, 5.86, st);
      boxR(g, 4.85, 0.78, 5.55, 5.6, 1.05, 5.86, st);
      boxR(g, 4.85, 0.12, 5.83, 5.6, 0.78, 5.86, '#1d1d1d');
      boxR(g, 4.85, 0, 5.55, 5.6, 0.12, 5.86, '#6d4c41');
      boxR(g, 4.5, 1.05, 5.48, 5.95, 1.12, 5.95, '#8b6a4a');
      boxR(g, 4.95, 0.12, 5.66, 5.5, 0.19, 5.8, '#5d4037');
      dyn.fire = [];
      [[5.03, '#ff7a1a'], [5.22, '#ffb02e'], [5.42, '#ff5a1a']].forEach(([x, c]) => {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), new THREE.MeshBasicMaterial({ color: c }));
        f.position.set(x, 0.35, 5.72);
        g.add(f); dyn.fire.push(f);
      });
      return [4.5, 5.45, 5.95, 5.95];
    },
    aquarium(g) {
      boxR(g, 4.15, 0, 0.1, 5.15, 0.6, 0.55, '#3b3b3b');
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.5, 0.4), new THREE.MeshLambertMaterial({ color: '#6fc3e8', transparent: true, opacity: 0.55 }));
      glass.position.set(4.65, 0.85, 0.32); g.add(glass);
      boxR(g, 4.17, 0.6, 0.12, 5.13, 0.66, 0.53, '#d8c48a');
      dyn.fish = [];
      ['#ff7f00', '#ffd400', '#e5398f', '#00c2c7'].forEach((c, i) => {
        const fsh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
        fsh.scale.set(1.6, 1, 0.6); fsh.position.set(4.4 + i * 0.15, 0.78 + (i % 2) * 0.12, 0.32);
        g.add(fsh); dyn.fish.push(fsh);
      });
      cyl(g, 0.01, 0.02, 0.25, '#2e7d32', 4.35, 0.66, 0.3);
      cyl(g, 0.01, 0.02, 0.18, '#43a047', 4.95, 0.66, 0.38);
      return [4.1, 0.08, 5.2, 0.6];
    },
    curtains(g) {
      const cols = ['#8e3b46', '#2f6f73', '#6d4c8f', '#b5654a', '#3f5f8f', '#8e3b46', '#2f6f73'];
      WINDOWS.forEach((w, i) => {
        const off = (T / 2 + 0.06) * w.inward, m = mat(cols[i % cols.length]);
        if (w.axis === 'x') {
          box(g, 2.7, 0.05, 0.05, '#c9a24a', w.center, 2.36, w.c + off);
          box(g, 0.5, 2.25, 0.05, null, w.center - 1.15, 0.1, w.c + off, m);
          box(g, 0.5, 2.25, 0.05, null, w.center + 1.15, 0.1, w.c + off, m);
          box(g, 2.6, 0.22, 0.06, null, w.center, 2.16, w.c + off, m);
        } else {
          box(g, 0.05, 0.05, 2.7, '#c9a24a', w.c + off, 2.36, w.center);
          box(g, 0.05, 2.25, 0.5, null, w.c + off, 0.1, w.center - 1.15, m);
          box(g, 0.05, 2.25, 0.5, null, w.c + off, 0.1, w.center + 1.15, m);
          box(g, 0.06, 0.22, 2.6, null, w.c + off, 2.16, w.center, m);
        }
      });
      return null;
    },
    coffeeMachine(g) {
      boxR(g, 15.42, 0.9, 1.4, 15.85, 1.3, 1.72, '#2b2b2b');
      boxR(g, 15.38, 1.0, 1.48, 15.42, 1.18, 1.64, '#b0b0b0');
      cyl(g, 0.04, 0.035, 0.08, '#ffffff', 15.35, 0.9, 1.56);
      return null;
    },
    microwave(g) {
      boxR(g, 15.3, 1.9, 5.2, 15.92, 2.25, 5.85, '#dcdcdc');
      boxR(g, 15.27, 1.95, 5.27, 15.3, 2.2, 5.65, '#222');
      boxR(g, 15.27, 1.95, 5.7, 15.3, 2.2, 5.8, '#888');
      return null;
    },
    playTent(g) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.6, 6, 1, true), new THREE.MeshLambertMaterial({ color: '#f3d7a2', side: THREE.DoubleSide }));
      cone.position.set(4.7, 0.8, 6.95); g.add(cone);
      [0, 1, 2, 3, 4, 5].forEach(i => { const a = i / 6 * Math.PI * 2; const st = cyl(g, 0.015, 0.015, 1.9, '#a1785b', 4.7 + Math.cos(a) * 0.32, -0.05, 6.95 + Math.sin(a) * 0.32); st.rotation.z = Math.cos(a) * 0.38; st.rotation.x = -Math.sin(a) * 0.38; });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), new THREE.MeshLambertMaterial({ color: '#e74c3c', side: THREE.DoubleSide }));
      flag.position.set(4.82, 1.72, 6.95); g.add(flag);
      return [4.15, 6.4, 5.25, 7.5];
    },
    nightLight(g) {
      cyl(g, 0.09, 0.11, 0.06, '#5c6bc0', 0.45, 0, 9.1);
      sph(g, 0.12, null, 0.45, 0.2, 9.1, new THREE.MeshBasicMaterial({ color: '#fff3a8' }));
      return null;
    },
    kidsShelf(g) {
      boxR(g, 0.05, 0, 6.3, 0.45, 1.4, 7.6, '#f2f2f2');
      const r2 = rnd(5), cols = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];
      [0.05, 0.5, 0.95].forEach(y => {
        boxR(g, 0.45, y, 6.32, 0.47, y + 0.03, 7.58, '#dddddd');
        for (let i = 0; i < 4; i++) box(g, 0.2, 0.18, 0.2, cols[Math.floor(r2() * cols.length)], 0.26, y + 0.03, 6.5 + i * 0.3);
      });
      return [0.03, 6.25, 0.5, 7.65];
    },
    vanity(g) {
      // у стены рядом с рабочим столом (на восточной стене окно)
      boxR(g, 12.2, 0, 6.08, 13.4, 0.75, 6.5, '#f0e6dc');
      boxR(g, 12.35, 0.86, 6.08, 13.25, 1.84, 6.11, '#d4af37');
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), new THREE.MeshBasicMaterial({ color: '#cfe3ec' }));
      mir.position.set(12.8, 1.35, 6.115); g.add(mir);
      boxR(g, 12.6, 0.42, 6.75, 12.95, 0.47, 7.05, '#e8b4c8');
      cyl(g, 0.025, 0.025, 0.42, '#c9a27a', 12.78, 0, 6.9);
      cyl(g, 0.03, 0.03, 0.12, '#e84a7f', 12.4, 0.75, 6.3);
      cyl(g, 0.04, 0.04, 0.08, '#b46be0', 13.15, 0.75, 6.25);
      return [12.15, 6.05, 13.42, 6.55];
    },
    bedroomRug(g) {
      const m = new THREE.MeshLambertMaterial({ map: carpetTex(2, 1, '#e8dfd2') });
      boxR(g, 13.4, 0, 7.95, 15.2, 0.015, 9.3, null, m);
      return null;
    },
    dryer(g) {
      boxR(g, 11.3, 0.86, 11.25, 11.92, 1.66, 11.88, '#f2f2f2');
      const d = cyl(g, 0.18, 0.18, 0.03, '#9aa7b0', 11.28, 1.22, 11.56); d.rotation.z = Math.PI / 2; d.position.y = 1.26;
      return null;
    },
    bathRug(g) {
      const m = new THREE.MeshLambertMaterial({ map: carpetTex(1, 1, '#7ec8e3') });
      boxR(g, 9.6, 0, 10.35, 10.6, 0.015, 10.95, null, m);
      return null;
    },
    hallMirror(g) {
      boxR(g, 8.88, 0.95, 1.15, 8.93, 2.15, 1.85, '#b08d57');
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), new THREE.MeshBasicMaterial({ color: '#cfe3ec' }));
      mir.position.set(8.875, 1.55, 1.5); mir.rotation.y = -Math.PI / 2; g.add(mir);
      return null;
    },
    rugKids(g) {
      const m = new THREE.MeshLambertMaterial({ map: carpetTex(2, 2, '#7ec8e3') });
      const r = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.012, 32), m);
      r.position.set(3, 0.006, 8.8);
      g.add(r);
      return null;
    },
  };

  function buildFurniture() {
    HW.FURNITURE.forEach(f => {
      const g = new THREE.Group();
      const col = BUILD[f.id](g);
      g.visible = false;
      scene.add(g);
      furnGroups[f.id] = g;
      furnColliders[f.id] = col;
      const iidMap = { fireplace: 'fireplace', aquarium: 'aquarium', vanity: 'vanity', hallMirror: 'hallMirror', coffeeMachine: 'fridge', sofa: 'sofa', tv: 'tv', bookshelf: 'bookshelf', treadmill: 'treadmill', diningTable: 'diningTable',
        dishwasher: 'dishwasher', multicooker: 'multicooker', washer: 'washer', bed: 'bed', bunkBed: 'kidsbed', kidsDesk: 'kidsDesk', desk: 'laptop' };
      if (iidMap[f.id]) tag(g, iidMap[f.id]);
      else pickRoots.push(g);
    });
  }

  // ---------- персонажи ----------
  function person(shirt, pants, hair, skin, girl) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    box(inner, 0.12, 0.45, 0.12, pants, -0.08, 0, 0);
    box(inner, 0.12, 0.45, 0.12, pants, 0.08, 0, 0);
    if (girl) cyl(inner, 0.14, 0.24, 0.45, shirt, 0, 0.4, 0);
    else box(inner, 0.34, 0.45, 0.2, shirt, 0, 0.45, 0);
    box(inner, 0.09, 0.4, 0.09, shirt, -0.23, 0.48, 0);
    box(inner, 0.09, 0.4, 0.09, shirt, 0.23, 0.48, 0);
    sph(inner, 0.15, skin, 0, 1.05, 0);
    const hairM = sph(inner, 0.155, hair, 0, 1.09, -0.02);
    hairM.scale.set(1, 0.85, 1);
    if (girl) {
      sph(inner, 0.07, hair, -0.15, 1.05, -0.05);
      sph(inner, 0.07, hair, 0.15, 1.05, -0.05);
    }
    // глаза (смотрят по +z)
    sph(inner, 0.022, '#222', -0.05, 1.07, 0.135);
    sph(inner, 0.022, '#222', 0.05, 1.07, 0.135);
    sph(inner, 0.02, '#e08080', 0, 0.99, 0.14).scale.set(1.6, 0.6, 1);
    g.userData.inner = inner;
    return g;
  }
  function dogMesh() {
    const g = new THREE.Group();
    const c = '#c8964b';
    box(g, 0.3, 0.25, 0.6, c, 0, 0.28, 0);
    [[-0.1, -0.22], [0.1, -0.22], [-0.1, 0.22], [0.1, 0.22]].forEach(([x, z]) => box(g, 0.08, 0.28, 0.08, c, x, 0, z));
    box(g, 0.24, 0.22, 0.24, c, 0, 0.5, 0.35);
    box(g, 0.14, 0.1, 0.12, '#a87a3b', 0, 0.52, 0.52);
    sph(g, 0.03, '#111', 0, 0.6, 0.58);
    sph(g, 0.025, '#111', -0.06, 0.66, 0.47);
    sph(g, 0.025, '#111', 0.06, 0.66, 0.47);
    box(g, 0.06, 0.14, 0.1, '#7a5528', -0.14, 0.55, 0.3);
    box(g, 0.06, 0.14, 0.1, '#7a5528', 0.14, 0.55, 0.3);
    const tail = box(g, 0.05, 0.05, 0.25, c, 0, 0.47, -0.4);
    tail.rotation.x = 0.6;
    g.userData.tail = tail;
    return g;
  }
  function buildCharacters() {
    dyn.misha = person('#3a7bd5', '#2c3e50', '#4a2f1b', '#f2c9a5', false);
    dyn.misha.scale.setScalar(1.15);
    dyn.sonya = person('#f06292', '#ffffff', '#c8963e', '#f5d0b0', true);
    dyn.sonya.scale.setScalar(0.85);
    dyn.dog = dogMesh();
    // сама Анна — видна только в виде сверху
    dyn.mom = person('#c0392b', '#34495e', '#5a3420', '#f1c6a2', true);
    dyn.mom.scale.setScalar(1.45);
    dyn.mom.visible = false;
    scene.add(dyn.mom);
    // если играем за мужа — он в синем
    dyn.dad = person('#2e6da4', '#2f3542', '#3a2a1a', '#f1c6a2', false);
    dyn.dad.scale.setScalar(1.5);
    dyn.dad.visible = false;
    scene.add(dyn.dad);
    // точка, куда идём
    dyn.dest = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: '#ffc56b', transparent: true, opacity: 0.85, depthWrite: false }));
    dyn.dest.rotation.x = -Math.PI / 2;
    dyn.dest.visible = false;
    scene.add(dyn.dest);
    [['misha', dyn.misha], ['sonya', dyn.sonya], ['dog', dyn.dog]].forEach(([id, o]) => { scene.add(o); tag(o, id); });
    dyn.dogPos = new THREE.Vector3(7.5, 0, 4);
    dyn.dogTarget = dyn.dogPos.clone();
    dyn.dogRoom = 'hall';
  }

  // ---------- игрушки и грязь ----------
  const TOY_COLORS = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];
  function toyMesh(t) {
    const g = new THREE.Group();
    const c = TOY_COLORS[t.c % TOY_COLORS.length];
    if (t.k === 0) box(g, 0.14, 0.14, 0.14, c, 0, 0, 0);
    else if (t.k === 1) sph(g, 0.09, c, 0, 0.09, 0);
    else { box(g, 0.25, 0.08, 0.12, c, 0, 0.04, 0); cyl(g, 0.04, 0.04, 0.03, '#222', -0.08, 0, 0.07).rotation.x = Math.PI / 2; }
    g.position.set(t.x, 0, t.z);
    g.rotation.y = t.r || 0;
    g.userData.toyId = t.id;
    return g;
  }
  function buildDirt() {
    dyn.dirt = {};
    const dm = new THREE.MeshBasicMaterial({ color: '#6b5a44', transparent: true, opacity: 0.35, depthWrite: false });
    HW.ROOM_IDS.forEach((rid, ri) => {
      const r = HW.ROOMS[rid];
      const R = rnd(100 + ri * 17);
      const list = [];
      for (let i = 0; i < 7; i++) {
        const s = 0.25 + R() * 0.35;
        const m = new THREE.Mesh(new THREE.CircleGeometry(s, 12), dm);
        m.rotation.x = -Math.PI / 2;
        let x, z;
        if (rid === 'hall') { x = 6.5 + R() * 2; z = 1 + R() * 10; }
        else { x = r.x0 + 0.8 + R() * (r.x1 - r.x0 - 1.6); z = r.z0 + 0.8 + R() * (r.z1 - r.z0 - 1.6); }
        m.position.set(x, 0.015 + i * 0.001, z);
        m.scale.set(1, 0.6 + R() * 0.6, 1);
        m.visible = false;
        scene.add(m);
        list.push(m);
      }
      dyn.dirt[rid] = list;
    });
    dyn.toyGroup = new THREE.Group();
    scene.add(dyn.toyGroup);
    pickRoots.push(dyn.toyGroup);
    dyn.toyMeshes = {};
  }

  // ---------- маркеры и значки ----------
  const texCache = {};
  function emojiTex(emoji, bg) {
    const key = emoji + bg;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
    g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.fillText(emoji, 64, 70);
    texCache[key] = new THREE.CanvasTexture(c);
    return texCache[key];
  }
  function buildIndicators() {
    // маркер «бегите сюда» виден сквозь стены
    dyn.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('!', '#e53935'), depthTest: false, transparent: true }));
    dyn.marker.scale.setScalar(0.5);
    dyn.marker.renderOrder = 999;
    dyn.marker.visible = false;
    scene.add(dyn.marker);
    dyn.wish = {};
    ['misha', 'sonya'].forEach(id => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🍽️', '#ffffff'), transparent: true }));
      sp.scale.setScalar(0.32);
      sp.visible = false;
      scene.add(sp);
      dyn.wish[id] = sp;
    });
  }
  const MARK_POS = { door: [7.5, 2.45, 0.4], tub: [10.05, 1.3, 11.5], stove: [15.5, 1.55, 4.65], washer: [11.6, 1.3, 11.55] };
  W.setMarker = function (iid) { dyn.markerIid = iid || null; };

  // ---------- навигация: точка цели и маршрут через двери ----------
  const TARGET_POS = {
    door: [7.5, 0.8], fridge: [14.7, 5.5], stove: [14.7, 4.65], sink: [14.7, 3.8], bowl: [10.0, 5.0],
    tub: [10.0, 10.5], washer: [10.9, 11.4], basket: [11.0, 10.75], bed: [14.5, 9.1], kidsbed: [2.9, 10.3],
    kidsDesk: [3.2, 10.7], multicooker: [14.7, 2.2], diningTable: [12.3, 1.7], dishwasher: [14.7, 1.65],
    sofa: [3, 4.5], tv: [3, 1.3], bookshelf: [1.1, 1.6], treadmill: [1.7, 4.7],
    flower: [13.0, 1.0], easel: [13.6, 9.0], guitar: [1.65, 4.9], herbs: [1.0, 8.6], photos: [7.6, 4.9], puzzleArt: [2.5, 7.3], fireplace: [5.2, 4.7], aquarium: [4.65, 1.2], vanity: [12.8, 7.4], hallMirror: [8.2, 1.5], painting0: [3, 4.4], painting1: [12.6, 8.1], painting2: [7.3, 6.0],
  };
  W.targetPos = function (iid) {
    if (!iid) return null;
    if (iid.startsWith('room:')) {
      const r = HW.ROOMS[iid.slice(5)];
      return iid === 'room:hall' ? [7.5, 6] : [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    }
    if (iid === 'misha' || iid === 'sonya' || iid === 'dog') {
      const o = dyn[iid];
      return o.visible ? [o.position.x, o.position.z] : null;
    }
    if (iid === 'laptop') return furnGroups.desk && furnGroups.desk.visible ? [14.3, 7.3] : [14.7, 2.7];
    return TARGET_POS[iid] || null;
  };
  const DOOR = { living: [6, 3], kids: [6, 9], kitchen: [9, 3], bath: [10.5, 9], bedroom: [12, 7.5] };
  // точки в коридоре по пути от центрального прохода к двери комнаты
  const HALLP = { living: [[7.3, 3]], kids: [[7.3, 9]], kitchen: [[7.7, 3]], bath: [[7.6, 7.6], [10.5, 8.2]], bedroom: [[7.6, 7.6], [11.2, 7.5]] };
  W.route = function (px, pz, tx, tz) {
    const a = HW.roomAt(px, pz), b = HW.roomAt(tx, tz);
    const pts = [];
    if (a !== b) {
      if (a !== 'hall') pts.push(DOOR[a], ...HALLP[a].slice().reverse());
      else if (px > 8.8 && b !== 'bath' && b !== 'bedroom') pts.push([7.6, 7.6]);   // из «кармана» коридора — сначала в проход
      if (b !== 'hall') pts.push(...HALLP[b], DOOR[b]);
      else if (tx > 8.8 && tz > 6) pts.push([7.6, 7.6]);
    } else if (a === 'hall' && !wallClear(px, pz, tx, tz)) {
      pts.push([7.6, 7.6]);   // коридор Г-образный: поворот за угол
    }
    pts.push([tx, tz]);
    // «натягиваем нитку»: идём к самой дальней точке, до которой нет стены
    let k = pts.length - 1;
    while (k > 0 && !wallClear(px, pz, pts[k][0], pts[k][1])) k--;
    let dist = Math.hypot(pts[k][0] - px, pts[k][1] - pz);
    for (let i = k + 1; i < pts.length; i++) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { next: pts[k], dist };
  };
  let wallsOnly = null;
  function wallClear(ax, az, bx, bz) {
    if (!wallsOnly) wallsOnly = baseColliders.filter(c => Math.min(c[2] - c[0], c[3] - c[1]) <= 0.25);
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08);
    for (let i = 1; i < n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      for (const c of wallsOnly) if (x > c[0] - 0.12 && x < c[2] + 0.12 && z > c[1] - 0.12 && z < c[3] + 0.12) return false;
    }
    return true;
  }

  // ---------- хобби: цветок, мольберт, картины, плед ----------
  function paintingTex(seed, progress) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 192;
    const g = c.getContext('2d'), r = rnd(seed);
    const kind = seed % 4;
    if (kind === 0) { // закат над морем
      const gr = g.createLinearGradient(0, 0, 0, 120); gr.addColorStop(0, '#ff9a5a'); gr.addColorStop(1, '#ffd36b');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 120);
      g.fillStyle = '#fff1a8'; g.beginPath(); g.arc(128 + (r() - 0.5) * 80, 110, 34, 0, 7); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#2f6fb3' : '#3d86c9'; g.fillRect(0, 120 + i * 12, 256, 12); }
    } else if (kind === 1) { // абстракция
      g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 256, 192);
      const cols = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6', '#ff7f50', '#222'];
      for (let i = 0; i < 14; i++) {
        g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.85;
        if (r() < 0.5) { g.beginPath(); g.arc(r() * 256, r() * 192, 10 + r() * 40, 0, 7); g.fill(); }
        else g.fillRect(r() * 220, r() * 160, 20 + r() * 60, 10 + r() * 50);
      }
      g.globalAlpha = 1;
    } else if (kind === 2) { // букет в вазе
      g.fillStyle = '#e8dcc8'; g.fillRect(0, 0, 256, 192);
      g.fillStyle = '#5b8fb9'; g.beginPath(); g.moveTo(100, 190); g.lineTo(156, 190); g.lineTo(166, 120); g.lineTo(90, 120); g.fill();
      g.strokeStyle = '#3d7a3a'; g.lineWidth = 4;
      for (let i = 0; i < 7; i++) {
        const x = 70 + r() * 116, y = 20 + r() * 70;
        g.beginPath(); g.moveTo(128, 122); g.lineTo(x, y); g.stroke();
        g.fillStyle = ['#e84a7f', '#f7d046', '#ff7f50', '#b46be0', '#ffffff'][i % 5];
        g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
      }
    } else { // портрет Бадди
      g.fillStyle = '#9fd3c7'; g.fillRect(0, 0, 256, 192);
      g.fillStyle = '#c8964b'; g.beginPath(); g.arc(128, 104, 62, 0, 7); g.fill();
      g.fillStyle = '#7a5528'; g.beginPath(); g.ellipse(72, 70, 20, 40, 0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(184, 70, 20, 40, -0.4, 0, 7); g.fill();
      g.fillStyle = '#111'; [[106, 92], [150, 92]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); });
      g.beginPath(); g.ellipse(128, 120, 14, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#e57373'; g.beginPath(); g.ellipse(128, 146, 10, 14, 0, 0, 7); g.fill();
    }
    if (progress < 1) { // недописанная часть — карандашный набросок по белому
      const w = Math.round(256 * (1 - Math.max(0.1, progress)));
      g.fillStyle = '#f7f5f0'; g.fillRect(256 - w, 0, w, 192);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(256 - w + r() * w, r() * 192); g.lineTo(256 - w + r() * w, r() * 192); g.stroke(); }
    }
    return new THREE.CanvasTexture(c);
  }
  function framedPicture(x, y, z, rotY, w, h) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.04), mat('#6b4a2a'));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    pic.position.z = 0.025;
    g.add(frame); g.add(pic);
    g.position.set(x, y, z); g.rotation.y = rotY;
    g.userData.pic = pic;
    g.visible = false;
    scene.add(g);
    return g;
  }
  function buildHobbies() {
    // цветок на подоконнике кухни
    const fp = new THREE.Group();
    cyl(fp, 0.09, 0.07, 0.14, '#c46a3a', 13.0, 0.94, 0.17);
    cyl(fp, 0.085, 0.085, 0.01, '#5a3d24', 13.0, 1.07, 0.17);
    const sprout = new THREE.Group();
    cyl(sprout, 0.008, 0.008, 0.12, '#4caf50', 13.0, 1.07, 0.17);
    sph(sprout, 0.025, '#66bb6a', 12.98, 1.18, 0.17).scale.set(1, 0.5, 1.5);
    const bush = new THREE.Group();
    cyl(bush, 0.012, 0.012, 0.22, '#3e8e41', 13.0, 1.07, 0.17);
    sph(bush, 0.11, '#43a047', 13.0, 1.32, 0.17);
    const bloom = new THREE.Group();
    [[0.07, 0.05, '#e84a7f'], [-0.06, 0.07, '#f7d046'], [0.0, 0.11, '#ff7f50'], [-0.05, -0.02, '#e84a7f'], [0.06, -0.03, '#b46be0']].forEach(([dx, dy, c]) => sph(bloom, 0.035, c, 13.0 + dx, 1.36 + dy, 0.2));
    const dead = new THREE.Group();
    const stem = cyl(dead, 0.01, 0.01, 0.18, '#7a5a33', 13.0, 1.07, 0.17); stem.rotation.z = 0.6;
    sph(dead, 0.05, '#8d6e46', 13.07, 1.18, 0.17);
    fp.add(sprout); fp.add(bush); fp.add(bloom); fp.add(dead);
    fp.visible = false;
    scene.add(fp); tag(fp, 'flower');
    dyn.flower = { g: fp, sprout, bush, bloom, dead };
    // мольберт в спальне
    const ea = new THREE.Group();
    const legM = mat('#8b6a4a');
    [[-0.22, -0.12], [0.22, -0.12]].forEach(([dz, dx]) => { const l = box(ea, 0.04, 1.6, 0.04, null, 12.75 + dx, 0, 9.0 + dz, legM); l.rotation.x = dz > 0 ? -0.08 : 0.08; });
    const back = box(ea, 0.04, 1.5, 0.04, null, 12.55, 0, 9.0, legM); back.rotation.z = 0.25;
    box(ea, 0.06, 0.04, 0.6, '#6b4a2a', 12.8, 0.78, 9.0);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    canvas.position.set(12.82, 1.07, 9.0); canvas.rotation.y = Math.PI / 2;
    ea.add(canvas);
    ea.visible = false;
    scene.add(ea); tag(ea, 'easel');
    dyn.easel = ea; dyn.easelCanvas = canvas;
    furnColliders._easel = [12.45, 8.7, 13.0, 9.3];
    // три места для картин
    dyn.paintSlots = [
      framedPicture(3, 1.65, 5.9, Math.PI, 1.1, 0.75),
      framedPicture(12.09, 1.85, 8.8, Math.PI / 2, 1.0, 0.65),   // спальня, над мольбертом у двери: к стене за кроватью не подойти
      framedPicture(6.09, 1.6, 6.0, Math.PI / 2, 0.9, 0.65),
    ];
    dyn.paintSlots.forEach((g, i) => tag(g, 'painting' + i));
    // плед
    const knitTex = canvasTex(64, (g2, sz) => {
      g2.fillStyle = '#c0392b'; g2.fillRect(0, 0, sz, sz);
      g2.fillStyle = '#f5e6c8'; for (let i = 0; i < 4; i++) { g2.fillRect(0, i * 16, sz, 5); g2.fillRect(i * 16, 0, 5, sz); }
    }, 6, 2);
    dyn.plaid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.6), new THREE.MeshLambertMaterial({ map: knitTex }));
    dyn.plaid.visible = false;
    scene.add(dyn.plaid);
  }
  function buildHobbies2() {
    // гитара на стойке
    const gt = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat('#c47a2c'));
    body.scale.set(1, 1.25, 0.35); body.position.set(0.45, 0.42, 5.75); gt.add(body);
    box(gt, 0.06, 0.6, 0.03, '#5d3a1a', 0.45, 0.62, 5.75);
    box(gt, 0.09, 0.12, 0.04, '#3e2510', 0.45, 1.2, 5.75);
    cyl(gt, 0.05, 0.05, 0.01, '#222', 0.45, 0.45, 5.82).rotation.x = Math.PI / 2;
    box(gt, 0.3, 0.03, 0.2, '#333', 0.45, 0, 5.75);
    gt.visible = false; scene.add(gt); tag(gt, 'guitar'); dyn.guitar = gt;
    // коврик для йоги
    dyn.yogaMat = boxR(new THREE.Group(), 4.45, 0, 1.7, 5.25, 0.012, 3.4, '#7e57c2');
    scene.add(dyn.yogaMat.parent); dyn.yogaMat.parent.visible = false; dyn.yogaGroup = dyn.yogaMat.parent;
    // зелень на окне детской
    const hb = new THREE.Group();
    boxR(hb, 0.1, 0.94, 8.7, 0.3, 1.08, 9.3, '#8d6e63');
    const herbsGreen = new THREE.Group();
    [8.78, 8.92, 9.06, 9.2].forEach((z, i) => sph(herbsGreen, 0.07 + (i % 2) * 0.02, i % 2 ? '#7cb342' : '#43a047', 0.2, 1.14, z));
    hb.add(herbsGreen);
    hb.visible = false; scene.add(hb); tag(hb, 'herbs'); dyn.herbs = hb; dyn.herbsGreen = herbsGreen;
    // фотостена в прихожей
    const ph = new THREE.Group();
    const photoCols = ['#f4c7a1', '#a1d4f4', '#f4a1c7', '#c7f4a1', '#f4e3a1', '#d1a1f4'];
    [[4.35, 1.75], [4.85, 1.85], [5.35, 1.7], [4.5, 1.35], [5.05, 1.4], [5.45, 1.3]].forEach(([z, y], i) => {
      box(ph, 0.03, 0.34, 0.4, '#3b3b3b', 8.9, y - 0.17, z);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28), mat(photoCols[i]));
      pic.position.set(8.88, y, z); pic.rotation.y = -Math.PI / 2; ph.add(pic);
      sph(ph, 0.05, '#ffffff', 8.875, y + 0.02, z).scale.set(0.2, 1, 1);
    });
    ph.visible = false; scene.add(ph); tag(ph, 'photos'); dyn.photos = ph;
    // пазл в детской
    const pz = framedPicture(2.5, 1.65, 6.1, 0, 1.2, 0.8);
    tag(pz, 'puzzleArt'); dyn.puzzleArt = pz;
    // медаль в спальне
    const md = new THREE.Group();
    box(md, 0.02, 0.35, 0.05, '#1e88e5', 12.09, 1.55, 10.4).rotation.x = 0.3;
    box(md, 0.02, 0.35, 0.05, '#e53935', 12.09, 1.55, 10.5).rotation.x = -0.3;
    const medal = cyl(md, 0.09, 0.09, 0.02, '#d4af37', 12.1, 1.45, 10.45); medal.rotation.z = Math.PI / 2;
    md.visible = false; scene.add(md); dyn.medal = md;
    // корона Сони
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 6, 1, true), new THREE.MeshLambertMaterial({ color: '#f5c518', side: THREE.DoubleSide }));
    crown.position.set(0, 1.27, 0);
    dyn.sonya.userData.inner.add(crown);
    crown.visible = false; dyn.crown = crown;
  }
  let paintKey = '', easelKey = '', puzzleKey = '';
  W.syncHobbies = function (st) {
    const proj = st.proj || {}, done = st.projDone || {};
    // цветок
    const fl = proj.flower, f = dyn.flower;
    f.g.visible = !!fl || !!done.flower;
    const n = fl ? fl.n : 5;
    f.dead.visible = !!(fl && fl.failed);
    f.sprout.visible = !!fl && !fl.failed && n >= 1 && n <= 2;
    f.bush.visible = (!!fl && !fl.failed && n >= 3) || (!fl && !!done.flower);
    f.bloom.visible = !fl && !!done.flower;
    // мольберт
    const pp = proj.paint;
    dyn.easel.visible = !!pp || !!done.paint;
    const ek = pp ? pp.start + ':' + pp.n : 'empty';
    if (ek !== easelKey) {
      easelKey = ek;
      const m = dyn.easelCanvas.material;
      if (m.map) m.map.dispose();
      m.map = pp && pp.n > 0 ? paintingTex(pp.start * 7919 + 13, pp.n / 4) : null;
      m.color.set(pp && pp.n > 0 ? '#ffffff' : '#f7f5f0');
      m.needsUpdate = true;
    }
    // картины на стенах
    const pk = (st.paintings || []).map(p => p.seed).join(',');
    if (pk !== paintKey) {
      paintKey = pk;
      dyn.paintSlots.forEach((g, i) => {
        const pt = (st.paintings || [])[i];
        g.visible = !!pt;
        const m = g.userData.pic.material;
        if (m.map) { m.map.dispose(); m.map = null; }
        if (pt) { m.map = paintingTex(pt.seed, 1); m.needsUpdate = true; }
      });
    }
    // новые хобби
    dyn.guitar.visible = !!proj.guitar || !!done.guitar;
    dyn.yogaGroup.visible = !!proj.yoga || !!done.yoga;
    dyn.herbs.visible = !!proj.herbs || !!done.herbs;
    const hn = proj.herbs ? proj.herbs.n : 4;
    dyn.herbsGreen.visible = hn >= 1;
    dyn.herbsGreen.scale.setScalar(0.4 + Math.min(hn, 4) * 0.15);
    dyn.photos.visible = !!done.album;
    dyn.puzzleArt.visible = !!done.puzzle;
    if (done.puzzle && !puzzleKey) { puzzleKey = 'set'; dyn.puzzleArt.userData.pic.material.map = paintingTex(2024, 1); dyn.puzzleArt.userData.pic.material.needsUpdate = true; }
    dyn.medal.visible = !!done.run;
    dyn.crown.visible = !!done.costume;
    // плед
    dyn.plaid.visible = !!done.knit;
    if (st.owned.bed) dyn.plaid.position.set(14.5, 0.68, 9.95); else dyn.plaid.position.set(14.5, 0.3, 10.1);
    W.applyWalls(st.walls || {});
  };

  // ---------- контуры предметов ----------
  function addOutlines() {
    const lineMat = new THREE.LineBasicMaterial({ color: '#2e2116', transparent: true, opacity: 0.55 });
    const skip = new Set([dyn.misha, dyn.sonya, dyn.dog, dyn.mom, dyn.dad, dyn.toyGroup, W._walls]);
    const meshes = [];
    (function walk(o) {
      if (skip.has(o)) return;
      if (o.isMesh && (o.geometry.type === 'BoxGeometry' || o.geometry.type === 'CylinderGeometry')) meshes.push(o);
      o.children.forEach(walk);
    })(scene);
    meshes.forEach(m => {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), lineMat);
      e.raycast = function () { };   // контуры не мешают выбору предметов
      m.add(e);
    });
  }

  // ---------- публичное API ----------
  W.init = function (canvas, quality) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality || 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#bfe3ff');
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);
    camera.rotation.order = 'YXZ';
    raycaster = new THREE.Raycaster();

    lights.hemi = new THREE.HemisphereLight('#ffffff', '#8a7660', 0.5);
    scene.add(lights.hemi);
    lights.amb = new THREE.AmbientLight('#ffffff', 0.1);
    scene.add(lights.amb);
    lights.dir = new THREE.DirectionalLight('#fff4e0', 0.6);
    lights.dir.position.set(-5, 10, -4);
    scene.add(lights.dir);
    lights.dir2 = new THREE.DirectionalLight('#dfe8ff', 0.18);
    lights.dir2.position.set(6, 6, 9);
    scene.add(lights.dir2);
    lights.points = [];
    [[3, 3], [3, 9], [12.5, 3], [10.5, 10.5], [14, 9], [7.5, 6]].forEach(([x, z]) => {
      const p = new THREE.PointLight('#ffe2b0', 0.0, 9, 1.5);
      p.position.set(x, 2.5, z);
      scene.add(p);
      lights.points.push(p);
    });

    buildHouse();
    buildFurniture();
    buildCharacters();
    buildDirt();
    addOutlines();
    buildIndicators();
    buildHobbies();
    buildHobbies2();
    registerDecor([...dyn.paintSlots, dyn.photos, dyn.puzzleArt, dyn.medal]);
    W.camera = camera;
    W.scene = scene;
    W.renderer = renderer;
  };

  W.setQuality = function (q) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q));
    W.resize();
  };

  W.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  W.colliders = function () {
    const list = baseColliders.slice();
    for (const id in furnGroups) {
      if (furnGroups[id].visible && furnColliders[id]) list.push(furnColliders[id]);
    }
    if (dyn.easel && dyn.easel.visible) list.push(furnColliders._easel);
    if (dyn.mattress.visible) list.push([13.55, 9.75, 15.45, 11.85]);
    if (dyn.kidsMattress.visible) list.push([0.25, 9.35, 2.45, 11.45]);
    return list;
  };

  function ghostChain(o) {
    while (o) { if (o.userData.ghost) return true; o = o.parent; }
    return false;
  }
  function visibleChain(o) {
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }

  // Луч из точки экрана (NDC). Возвращает {iid, dist, toyId}
  W.pick = function (nx, ny) {
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    raycaster.far = W.mode === 'top' ? 60 : 8;
    const hits = raycaster.intersectObjects(pickRoots, true);
    for (const h of hits) {
      if (!visibleChain(h.object) || ghostChain(h.object)) continue;   // полупрозрачный декор не ловит тап
      let o = h.object, iid = null, toyId = null;
      while (o) {
        if (o.userData.toyId !== undefined && toyId === null) toyId = o.userData.toyId;
        if (o.userData.iid) { iid = o.userData.iid; break; }
        o = o.parent;
      }
      if (toyId !== null) return { iid: 'toy', toyId, dist: h.distance, point: h.point };
      if (!iid) return null; // стена или неинтерактивная мебель закрывает
      return { iid, dist: h.distance, point: h.point };
    }
    return null;
  };

  // Синхронизация визуала с состоянием игры
  W.sync = function (st) {
    boxCache.clear();
    for (const id in furnGroups) furnGroups[id].visible = !!st.owned[id];
    dyn.mattress.visible = !st.owned.bed;
    dyn.kidsMattress.visible = !st.owned.bunkBed;
    dyn.counterNoDW.visible = !st.owned.dishwasher;
    // ноутбук
    if (furnGroups.dryer) furnGroups.dryer.position.y = st.owned.washer ? 0 : -0.86;
    if (st.owned.desk) { dyn.laptop.position.set(14.3, 0.76, 6.42); dyn.laptop.rotation.y = Math.PI; }
    else { dyn.laptop.position.set(15.6, 0.9, 2.7); dyn.laptop.rotation.y = Math.PI / 2; }
    // коробки исчезают по мере обустройства
    const ownedN = Object.keys(st.owned).filter(k => st.owned[k]).length;
    const boxesLeft = Math.max(0, dyn.boxes.length - Math.floor(ownedN / 2) - Math.min(st.day - 1, 3));
    dyn.boxes.forEach((b, i) => { b[0].visible = b[1].visible = i < boxesLeft; });
    // кастрюля, посуда, бельё, миска
    const h = st.house;
    const stv = h.stove ? h.stove.state : 'idle';
    dyn.pot.visible = h.portions > 0 || stv !== 'idle';
    // значки желаний детей
    ['misha', 'sonya'].forEach(id => {
      const k = st.kids[id], sp = dyn.wish[id];
      const icon = k.wish && HW.Game.WISH_ICONS ? HW.Game.WISH_ICONS[k.wish] : null;
      sp.visible = !!icon && k.at === 'home' && !k.asleep;
      if (icon && sp.userData.icon !== icon) { sp.material.map = emojiTex(icon, '#ffffff'); sp.material.needsUpdate = true; sp.userData.icon = icon; }
    });
    dyn.dishes.children.forEach((p, i) => p.visible = i < Math.min(12, h.dishes));
    dyn.laundryHeap.visible = h.laundryDirty > 0;
    dyn.laundryHeap.scale.setScalar(0.6 + Math.min(h.laundryDirty, 9) * 0.08);
    dyn.kibble.visible = st.dog.satiety > 70;
    if (dyn.washerLight) dyn.washerLight.material.color.set(h.washer.state === 'running' ? '#f1c40f' : (h.washer.state === 'done' ? '#2ecc71' : '#555'));
    // грязь
    HW.ROOM_IDS.forEach(rid => {
      const n = Math.max(0, Math.floor((80 - h.clean[rid]) / 11));
      dyn.dirt[rid].forEach((m, i) => m.visible = i < n);
    });
    // игрушки
    const alive = {};
    h.toys.forEach(t => {
      alive[t.id] = true;
      if (!dyn.toyMeshes[t.id]) {
        const m = toyMesh(t);
        dyn.toyMeshes[t.id] = m;
        dyn.toyGroup.add(m);
      }
    });
    for (const id in dyn.toyMeshes) {
      if (!alive[id]) { dyn.toyGroup.remove(dyn.toyMeshes[id]); delete dyn.toyMeshes[id]; }
    }
    W.syncHobbies(st);
    W.placeCharacters(st);
    W.setTimeOfDay(st.time);
  };

  const KID_SPOTS = {
    misha: [[3.3, 10.5], [4.3, 8.2], [3.6, 2.4], [2.2, 7.5]],
    sonya: [[2.2, 8.4], [4.6, 9.9], [2.6, 2.8], [3.8, 7.2]],
  };
  // Путь ребёнка между детской и гостиной через двери и коридор
  function kidRoute(x, z, spot) {
    const ra = HW.roomAt(x, z), rb = HW.roomAt(spot[0], spot[1]);
    if (ra === rb) return [spot];
    const viaHall = [[5.4, 9], [7.3, 9], [7.3, 3], [5.4, 3]];
    if (ra === 'kids' && rb === 'living') return viaHall.concat([spot]);
    if (ra === 'living' && rb === 'kids') return viaHall.slice().reverse().concat([spot]);
    return null; // из других мест — просто появиться
  }
  function freeAt(x, z) {
    const R = 0.35;
    for (const c of W._cols || []) if (x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R) return false;
    return true;
  }
  function clearPath(a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!freeAt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false;
    }
    return true;
  }

  const APART = 0.75;    // дети и Бадди не стоят ближе этого друг к другу
  // Место ребёнка: точка из списка, не в мебели и не впритык к уже занятым; иначе — ближайшая свободная рядом
  function kidSpot(spots, i, taken) {
    const ok = (x, z) => freeAt(x, z) && taken.every(p => Math.hypot(p[0] - x, p[1] - z) >= APART);
    for (let k = 0; k < spots.length; k++) {
      const sp = spots[(i + k) % spots.length];
      if (ok(sp[0], sp[1])) return sp;
    }
    const [cx, cz] = spots[i];
    for (let r = 0.3; r <= 3; r += 0.3) for (let a = 0; a < 12; a++) {
      const x = cx + Math.cos(a * Math.PI / 6) * r, z = cz + Math.sin(a * Math.PI / 6) * r;
      if (HW.roomAt(x, z) === HW.roomAt(cx, cz) && ok(x, z)) return [x, z];
    }
    return spots[i];
  }
  // Где стоят (или куда идут) дети — Бадди держится от этих точек в стороне
  function kidPoints() {
    const out = [];
    ['misha', 'sonya'].forEach(id => {
      const o = dyn[id];
      if (!o.visible || o.userData.lying) return;
      out.push([o.position.x, o.position.z]);
      if (o.userData.goal) out.push(o.userData.goal.split(',').map(Number));
    });
    return out;
  }
  function awayFromKids(x, z) { return kidPoints().every(p => Math.hypot(p[0] - x, p[1] - z) >= APART); }

  W.placeCharacters = function (st) {
    W._cols = W.colliders();
    const taken = [];
    ['misha', 'sonya'].forEach((id, idx) => {
      const k = st.kids[id], o = dyn[id];
      const inner = o.userData.inner, ud = o.userData;
      o.visible = k.at === 'home';
      if (!o.visible) { ud.wasVisible = false; ud.goal = null; ud.path = []; return; }
      if (k.asleep) {
        let x, y, z;
        if (st.owned.bunkBed) { x = 0.75; y = id === 'misha' ? 1.62 : 0.62; z = 10.6; }
        else { x = id === 'misha' ? 0.75 : 1.95; y = 0.33; z = 10.5; }
        o.position.set(x, y, z);
        inner.rotation.set(-Math.PI / 2, 0, 0);
        inner.position.set(0, 0.0, -0.15);
        o.rotation.set(0, Math.PI, 0);
        ud.lying = true; ud.goal = null; ud.path = [];
      } else {
        const hour = Math.floor(st.time / 60);
        const spots = KID_SPOTS[id];
        let i = (hour + st.day) % spots.length;
        if (k.sick) i = 0;
        const spot = kidSpot(spots, i, taken), key = spot.join(',');
        taken.push(spot);
        const route = ud.goal && !ud.lying && ud.wasVisible ? kidRoute(o.position.x, o.position.z, spot) : null;
        if (ud.goal !== key) {
          if (route) ud.path = route;            // дошагать до новой точки
          else { o.position.set(spot[0], 0, spot[1]); ud.path = []; }
        }
        ud.goal = key;
        inner.rotation.set(0, 0, 0);
        inner.position.set(0, 0, 0);
        ud.lying = false;
      }
      ud.wasVisible = true;
    });
    // собака
    const d = st.dog;
    if (d.out || (st.incident && st.incident.id === 'dogRun')) { dyn.dog.visible = false; return; }
    dyn.dog.visible = true;
    const hour = Math.floor(st.time / 60);
    const night = st.time < 7 * 60 || st.time >= 22 * 60;
    const rooms = ['hall', 'living', 'kitchen', 'hall', 'kids'];
    const room = night ? 'bed' : rooms[(hour + st.day * 3) % rooms.length];
    if (room !== dyn.dogRoom) {
      dyn.dogRoom = room;
      const p = W.dogPointIn(room);
      dyn.dogPos.copy(p); dyn.dogTarget.copy(p);
    } else if (room !== 'bed' && freeAt(dyn.dogPos.x, dyn.dogPos.z) && (!awayFromKids(dyn.dogPos.x, dyn.dogPos.z) || !awayFromKids(dyn.dogTarget.x, dyn.dogTarget.z))) {
      // рядом ребёнок — отойти в сторону (пешком, без телепорта)
      dyn.dogTarget.copy(W.dogPointIn(room, dyn.dogPos));
      if (dyn.dogTarget.distanceTo(dyn.dogPos) < 0.01) { const p = W.dogPointIn(room); dyn.dogPos.copy(p); dyn.dogTarget.copy(p); }
    } else if (!freeAt(dyn.dogPos.x, dyn.dogPos.z) && room !== 'bed') {
      // на месте собаки поставили мебель — переселяем
      const p = W.dogPointIn(room);
      dyn.dogPos.copy(p); dyn.dogTarget.copy(p);
    }
  };

  // Случайная свободная точка в комнате; с from — ещё и достижимая по прямой
  W.dogPointIn = function (room, from) {
    if (room === 'bed') return new THREE.Vector3(8.3, 0.05, 11.2);
    const r = HW.ROOMS[room];
    for (let tries = 0; tries < 25; tries++) {
      const p = room === 'hall'
        ? new THREE.Vector3(6.6 + Math.random() * 1.9, 0, 1.5 + Math.random() * 9)
        : new THREE.Vector3(r.x0 + 0.8 + Math.random() * (r.x1 - r.x0 - 1.6), 0, r.z0 + 0.8 + Math.random() * (r.z1 - r.z0 - 1.6));
      if (freeAt(p.x, p.z) && awayFromKids(p.x, p.z) && (!from || clearPath(from, p))) return p;
    }
    return from ? from.clone() : new THREE.Vector3(7.5, 0, 5);
  };

  // Освещение по времени суток
  W.setTimeOfDay = function (min) {
    const h = (min / 60) % 24;
    let day; // 0..1 освещённость улицы
    if (h < 6) day = 0; else if (h < 8) day = (h - 6) / 2; else if (h < 18) day = 1; else if (h < 21) day = 1 - (h - 18) / 3; else day = 0;
    const sky = new THREE.Color('#0d1530').lerp(new THREE.Color(h > 17 && h < 21 ? '#f2b28a' : '#bfe3ff'), day);
    scene.background = sky;
    (dyn.windowMats || []).forEach(m => m.color.copy(sky));
    lights.hemi.intensity = 0.25 + 0.3 * day;
    lights.dir.intensity = 0.12 + 0.5 * day;
    const lampOn = day < 0.7;
    lights.points.forEach(p => p.intensity = lampOn ? 0.55 * (1 - day * 0.6) : 0);
    (dyn.lampMats || []).forEach(m => m.color.set(lampOn ? '#fff1c4' : '#e9e6df'));
  };

  // Дети расходятся на ходу: не ближе KID_GAP. Соня уступает идущему Мише (отходит в сторону и ждёт),
  // Миша ждёт, пока она отойдёт; стоящего ребёнка идущий обходит. Через 3 с ожидания — идти как есть, чтобы не застрять.
  const KID_GAP = 0.55;
  function kidYields(id, o, ux, uz, step, dt) {
    const ud = o.userData, other = dyn[id === 'misha' ? 'sonya' : 'misha'], ou = other.userData;
    if (!other.visible || ou.lying) { ud.wait = 0; return false; }
    const ox = other.position.x, oz = other.position.z;
    const dNow = Math.hypot(ox - o.position.x, oz - o.position.z);
    const dNext = Math.hypot(ox - o.position.x - ux * step, oz - o.position.z - uz * step);
    if (dNext >= KID_GAP || dNext >= dNow) { ud.wait = 0; return false; }
    ud.wait = (ud.wait || 0) + dt;
    if (ud.wait > 3) return false;
    const otherWalking = !!(ou.path && ou.path.length) && !(ou.wait > 0);
    // Миша не уступает идущей Соне — ждёт; Соня, только что отошедшая в сторону, тоже ждёт
    if ((otherWalking && id === 'misha') || (ud.steppedAt && t - ud.steppedAt < 2.5)) return true;
    // шаг в сторону: от идущего — с его пути, от стоящего — в обход
    let px, pz, base;
    if (otherWalking) {
      const ol = ou.path[0], mx = ol[0] - ox, mz = ol[1] - oz, ml = Math.hypot(mx, mz) || 1;
      px = -mz / ml; pz = mx / ml; base = [o.position.x, o.position.z];
      // в ту сторону, где дальше от линии идущего
      if ((o.position.x - ox) * px + (o.position.z - oz) * pz < 0) { px = -px; pz = -pz; }
    } else {
      px = -uz; pz = ux; base = [ox, oz];
    }
    const cands = otherWalking
      ? [[base[0] + px * 0.8, base[1] + pz * 0.8], [base[0] - ux * 0.8, base[1] - uz * 0.8], [base[0] - px * 0.8, base[1] - pz * 0.8]]
      : [[base[0] + px * 0.85, base[1] + pz * 0.85], [base[0] - px * 0.85, base[1] - pz * 0.85]];
    const from = { x: o.position.x, z: o.position.z };
    for (const c of cands) {
      if (freeAt(c[0], c[1]) && clearPath(from, { x: c[0], z: c[1] })) {
        ud.path.unshift(c);
        if (otherWalking) ud.steppedAt = t;
        ud.wait = 0;
        return true;
      }
    }
    return true;   // отойти некуда — подождать
  }

  let t = 0;
  W.update = function (dt, st) {
    t += dt;
    // дети идут к своей точке, а стоя — поворачиваются к игроку
    ['misha', 'sonya'].forEach(id => {
      const o = dyn[id], ud = o.userData;
      if (!o.visible || ud.lying) return;
      if (ud.path && ud.path.length) {
        const [tx, tz] = ud.path[0];
        const dx = tx - o.position.x, dz = tz - o.position.z, len = Math.hypot(dx, dz);
        const step = Math.min(len, dt * 1.2);
        if (len < 0.03) { ud.path.shift(); return; }
        if (kidYields(id, o, dx / len, dz / len, step, dt)) { ud.inner.position.y = 0; return; }
        o.position.x += dx / len * step;
        o.position.z += dz / len * step;
        o.rotation.y = Math.atan2(dx, dz);
        ud.inner.position.y = Math.abs(Math.sin(t * 9)) * 0.05;
        return;
      }
      o.rotation.y = Math.atan2(W.player.x - o.position.x, W.player.z - o.position.z);
      ud.inner.position.y = Math.abs(Math.sin(t * 2 + (id === 'misha' ? 0 : 1))) * 0.02;
    });
    // собака бродит
    if (dyn.dog.visible) {
      const d = dyn.dog;
      if (dyn.dogRoom !== 'bed') {
        // иногда Бадди подходит к хозяйке, если она в той же комнате
        dyn.followT = (dyn.followT || 0) + dt;
        if (dyn.followT > 2.5) {
          dyn.followT = 0;
          const cam = W.player;
          const near = Math.hypot(cam.x - dyn.dogPos.x, cam.z - dyn.dogPos.z);
          if (near > 1.4 && HW.roomAt(cam.x, cam.z) === HW.roomAt(dyn.dogPos.x, dyn.dogPos.z) && Math.random() < 0.4) {
            const p = new THREE.Vector3(cam.x - dyn.dogPos.x, 0, cam.z - dyn.dogPos.z).normalize().multiplyScalar(-0.9).add(new THREE.Vector3(cam.x, 0, cam.z));
            if (freeAt(p.x, p.z) && awayFromKids(p.x, p.z) && clearPath(dyn.dogPos, p)) dyn.dogTarget.copy(p);
          }
        }
        const diff = dyn.dogTarget.clone().sub(dyn.dogPos);
        const len = diff.length();
        if (len < 0.05) {
          if (Math.random() < dt * 0.5) dyn.dogTarget.copy(W.dogPointIn(dyn.dogRoom, dyn.dogPos));
          d.userData.tail.rotation.y = Math.sin(t * 10) * 0.6;
        } else {
          const step = Math.min(len, dt * (dyn.followT < 1 ? 0.9 : 0.7));
          const nx = dyn.dogPos.x + diff.x / len * step, nz = dyn.dogPos.z + diff.z / len * step;
          const kidNear = kidPoints().some(p => { const dn = Math.hypot(p[0] - nx, p[1] - nz); return dn < APART && dn < Math.hypot(p[0] - dyn.dogPos.x, p[1] - dyn.dogPos.z); });
          if (!freeAt(nx, nz)) dyn.dogTarget.copy(dyn.dogPos); // упёрся — остановиться
          else if (kidNear) dyn.dogTarget.copy(W.dogPointIn(dyn.dogRoom, dyn.dogPos));   // не лезть в ребёнка — свернуть
          else {
            dyn.dogPos.add(diff.multiplyScalar(step / len));
            d.rotation.y = Math.atan2(dyn.dogTarget.x - dyn.dogPos.x, dyn.dogTarget.z - dyn.dogPos.z);
            d.userData.tail.rotation.y = Math.sin(t * 14) * 0.4;
          }
        }
      }
      d.position.copy(dyn.dogPos);
    }
    // маркер «бегите сюда» и значки над детьми
    const mk = dyn.markerIid;
    if (mk && mk !== 'phone') {
      let p = MARK_POS[mk];
      if (mk === 'dog') p = [dyn.dog.position.x, 1.0, dyn.dog.position.z];
      if (mk === 'misha' || mk === 'sonya') { const o = dyn[mk]; p = o.visible ? [o.position.x, mk === 'misha' ? 2.2 : 1.8, o.position.z] : null; }
      dyn.marker.visible = !!p;
      if (p) {
        dyn.marker.position.set(p[0], p[1] + Math.sin(t * 5) * 0.06, p[2]);
        dyn.marker.scale.setScalar(0.45 + Math.sin(t * 8) * 0.05);
      }
    } else dyn.marker.visible = false;
    ['misha', 'sonya'].forEach(id => {
      const sp = dyn.wish[id], o = dyn[id];
      if (!sp.visible || !o.visible) return;
      sp.position.set(o.position.x, (id === 'misha' ? 1.75 : 1.35) + Math.sin(t * 3) * 0.04, o.position.z);
    });
    // робот-пылесос катается по коридору днём
    if (dyn.robotBot && st.owned.robot) {
      const hr = st.time / 60;
      if (hr > 10 && hr < 16) {
        dyn.robotBot.position.set(7.5 + Math.sin(t * 0.3) * 0.9, 0.04, 6 + Math.sin(t * 0.13) * 4.5);
      } else dyn.robotBot.position.set(6.4, 0.04, 11.4);
    }
    // огонь в камине и рыбки
    if (dyn.fire && st.owned.fireplace) dyn.fire.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(t * 9 + i * 2) * 0.25; f.scale.x = 0.9 + Math.sin(t * 7 + i) * 0.1; });
    if (dyn.fish && st.owned.aquarium) dyn.fish.forEach((f, i) => { f.position.x = 4.65 + Math.sin(t * (0.5 + i * 0.13) + i * 2) * 0.38; f.rotation.y = Math.cos(t * (0.5 + i * 0.13) + i * 2) > 0 ? 0 : Math.PI; });
    // телевизор мерцает вечером
    if (dyn.tvScreen && st.owned.tv) {
      const on = st.time >= 17 * 60 && st.time < 21 * 60 && (st.kids.misha.at === 'home' || st.kids.sonya.at === 'home');
      dyn.tvScreen.material.color.setHSL(on ? (t * 0.05) % 1 : 0.6, on ? 0.6 : 0.3, on ? 0.45 + Math.sin(t * 3) * 0.05 : 0.15);
    }
    // Анна в виде сверху
    if (W.mode === 'top') {
      const husband = HW.S && HW.S.hero === 'husband';
      const m = husband ? dyn.dad : dyn.mom, inner = m.userData.inner, P = W.player;
      m.visible = true;
      (husband ? dyn.mom : dyn.dad).visible = false;
      m.position.set(P.x, 0, P.z);
      m.rotation.y = P.facing;
      if (P.lying) { inner.rotation.set(-Math.PI / 2, 0, 0); inner.position.set(0, 0.12, -0.5); }
      else {
        inner.rotation.set(0, 0, 0);
        inner.position.set(0, P.moving ? Math.abs(Math.sin(t * 10)) * 0.05 : 0, 0);
      }
      dyn.dest.visible = !!W.dest;
      if (W.dest) { dyn.dest.position.set(W.dest[0], 0.03, W.dest[1]); dyn.dest.scale.setScalar(1 + Math.sin(t * 6) * 0.12); }
    }
    renderer.render(scene, camera);
  };

  // ---------- вид сверху ----------
  W.mode = 'fp';
  W.player = { x: 7.5, z: 1.4, facing: 0, moving: false, lying: false };
  W.dest = null;
  const LOW = 0.32;   // высота «опущенных» стен
  let cutKey = null;
  W.setMode = function (mode) {
    W.mode = mode;
    const top = mode === 'top';
    camera.fov = top ? 42 : 70;
    camera.near = top ? 0.3 : 0.05;
    camera.updateProjectionMatrix();
    dyn.ceil.visible = !top;
    dyn.ceilLamps.forEach(l => l.visible = !top);
    dyn.mom.visible = top && !(HW.S && HW.S.hero === 'husband');
    dyn.dad.visible = top && !!(HW.S && HW.S.hero === 'husband');
    dyn.dest.visible = false;
    cutKey = null;
    if (!top) applyCut(() => false);
  };
  // Опустить стены: всё, кроме дальних внешних стен (с окнами) относительно взгляда камеры
  function applyCut(lowered) {
    wallParts.forEach(p => {
      const low = lowered(p.axis, p.c);
      if (p.kind === 'top') { p.mesh.visible = !low; return; }
      const h = p.mesh.geometry.parameters.height;
      const k = low ? Math.min(1, LOW / h) : 1;
      p.mesh.scale.y = k;
      p.mesh.position.y = h * k / 2;
    });
    WINDOWS.forEach(w => { w.group.visible = !lowered(w.axis, w.c); });
    // украшения на опущенной стене: видны полупрозрачно и пропускают тап к предметам за ними
    decor.forEach(d => {
      const low = lowered(d.axis, d.c);
      d.obj.userData.ghost = low;
      d.mats.forEach(m => { m.transparent = low; m.opacity = low ? 0.3 : 1; m.depthWrite = !low; m.needsUpdate = true; });
    });
    const dk = lowered('x', 0) ? LOW / 2.12 : 1;
    dyn.frontDoor.scale.y = dk;
  }
  // Настенный декор: к какой стене относится (по центру предмета), свои материалы для прозрачности
  const decor = [];
  function registerDecor(objs) {
    const b = new THREE.Box3(), c = new THREE.Vector3();
    objs.forEach(obj => {
      b.setFromObject(obj).getCenter(c);
      let best = null;
      [0, 6, 9, 12].forEach(z => { const d = Math.abs(c.z - z); if (d < 0.3 && (!best || d < best.d)) best = { axis: 'x', c: z, d }; });
      [0, 6, 9, 12, 16].forEach(x => { const d = Math.abs(c.x - x); if (d < 0.3 && (!best || d < best.d)) best = { axis: 'z', c: x, d }; });
      if (!best) return;
      const mats = [];
      obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
      decor.push({ obj, axis: best.axis, c: best.c, mats });
    });
  }
  W.updateCutaway = function (fx, fz) {
    // fx, fz — направление взгляда камеры по полу
    const far = { x0: fz < -0.3, x12: fz > 0.3, z0: fx < -0.3, z16: fx > 0.3 };
    const key = JSON.stringify(far);
    if (key === cutKey) return;
    cutKey = key;
    applyCut((axis, c) => !far[axis + c]);
  };
  // Точка на полу под пальцем
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  W.pickFloor = function (nx, ny) {
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(floorPlane, p) ? { x: p.x, z: p.z } : null;
  };
  // Нет ли стены между двумя точками (без запаса — для предметов у самой стены)
  W.noWallBetween = function (ax, az, bx, bz) {
    if (!wallsOnly) wallsOnly = baseColliders.filter(c => Math.min(c[2] - c[0], c[3] - c[1]) <= 0.25);
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.03);
    // последние 4 см не считаем: предметы чуть утоплены в стену (сама стена 15 см — сквозь неё всё равно не достать)
    for (let i = 1; i < n; i++) {
      if ((n - i) / n * len < 0.04) break;
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      for (const c of wallsOnly) if (x > c[0] && x < c[2] && z > c[1] && z < c[3]) return false;
    }
    return true;
  };
  // Ближайший к Анне предмет, с которым можно что-то сделать (для вида сверху)
  const boxCache = new Map();
  const tmpBox = new THREE.Box3();
  W.nearest = function (px, pz, facing, maxD, only) {
    let best = null, bestS = Infinity;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const consider = (iid, rect, toyId) => {
      const cx = HW.clamp(px, rect[0], rect[2]), cz = HW.clamp(pz, rect[1], rect[3]);
      const d = Math.hypot(cx - px, cz - pz);
      if (d > maxD) return;
      if (!W.noWallBetween(px, pz, cx, cz)) return;
      const ax = (rect[0] + rect[2]) / 2 - px, az = (rect[1] + rect[3]) / 2 - pz, al = Math.hypot(ax, az) || 1;
      const sc = d + (1 - (ax * fx + az * fz) / al) * 0.35;
      if (sc < bestS) { bestS = sc; best = { iid, dist: d, toyId, point: { x: cx, y: 0.5, z: cz } }; }
    };
    const seen = new Set();
    interactables.forEach(({ iid, obj }) => {
      if (!visibleChain(obj) || (only && !only.has(iid))) return;
      if (obj === dyn.misha || obj === dyn.sonya || obj === dyn.dog) {
        const r = 0.3;
        consider(iid, [obj.position.x - r, obj.position.z - r, obj.position.x + r, obj.position.z + r]);
        return;
      }
      let rect = boxCache.get(obj);
      if (!rect) {
        tmpBox.setFromObject(obj);
        if (tmpBox.isEmpty()) return;
        rect = [tmpBox.min.x, tmpBox.min.z, tmpBox.max.x, tmpBox.max.z];
        boxCache.set(obj, rect);
      }
      seen.add(iid);
      consider(iid, rect);
    });
    for (const id in dyn.toyMeshes) {
      if (only) break;
      const m = dyn.toyMeshes[id];
      consider('toy', [m.position.x - 0.15, m.position.z - 0.15, m.position.x + 0.15, m.position.z + 0.15], m.userData.toyId);
    }
    return best;
  };
  // Расстояние от Анны до конкретного предмета (по полу, сквозь стены — Infinity)
  W.reachDist = function (px, pz, iid, toyId, rects) {
    let best = Infinity;
    (rects || collectRects(iid, toyId)).forEach(rect => {
      const cx = HW.clamp(px, rect[0], rect[2]), cz = HW.clamp(pz, rect[1], rect[3]);
      const d = Math.hypot(cx - px, cz - pz);
      if (d < best && W.noWallBetween(px, pz, cx, cz)) best = d;
    });
    return best;
  };
  // Предметы, к которым вплотную не подойти (заставлены мебелью): нет свободного места на полу ближе near.
  // Пересчитывается только при смене мебели/хобби.
  let boxedKey = null, boxedSet = new Set();
  W.boxedIids = function (near) {
    const cols = W.colliders();
    const vis = interactables.filter(x => visibleChain(x.obj)).map(x => x.iid);
    const key = JSON.stringify(cols) + vis.join(',');
    if (key === boxedKey) return boxedSet;
    boxedKey = key;
    boxedSet = new Set();
    const R = 0.28;
    const free = (x, z) => !(x < R || x > 16 - R || z < R || z > 12 - R) && !cols.some(c => x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R);
    new Set(vis).forEach(iid => {
      if (iid === 'misha' || iid === 'sonya' || iid === 'dog') return;
      const rects = collectRects(iid);
      let ok = false;
      for (const r of rects) {
        for (let x = r[0] - near; x <= r[2] + near && !ok; x += 0.1) for (let z = r[1] - near; z <= r[3] + near && !ok; z += 0.1) {
          if (free(x, z) && W.reachDist(x, z, null, null, rects) <= near) ok = true;
        }
        if (ok) break;
      }
      if (!ok) boxedSet.add(iid);
    });
    return boxedSet;
  };
  // Прямоугольники предмета на полу [x0,z0,x1,z1] — чтобы искать, откуда до него дотянуться
  W.rectsOf = (iid, toyId) => collectRects(iid, toyId);
  function collectRects(iid, toyId) {
    const out = [];
    if (iid === 'toy') {
      for (const id in dyn.toyMeshes) {
        const m = dyn.toyMeshes[id];
        if (m.userData.toyId === toyId) out.push([m.position.x - 0.15, m.position.z - 0.15, m.position.x + 0.15, m.position.z + 0.15]);
      }
      return out;
    }
    interactables.forEach(({ iid: id, obj }) => {
      if (id !== iid || !visibleChain(obj)) return;
      if (obj === dyn.misha || obj === dyn.sonya || obj === dyn.dog) { out.push([obj.position.x - 0.3, obj.position.z - 0.3, obj.position.x + 0.3, obj.position.z + 0.3]); return; }
      let rect = boxCache.get(obj);
      if (!rect) {
        tmpBox.setFromObject(obj);
        if (tmpBox.isEmpty()) return;
        rect = [tmpBox.min.x, tmpBox.min.z, tmpBox.max.x, tmpBox.max.z];
        boxCache.set(obj, rect);
      }
      out.push(rect);
    });
    return out;
  }
})();
