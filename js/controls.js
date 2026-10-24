// Управление: виртуальный джойстик + обзор пальцем (мобильные), WASD + мышь (ПК).
// Два режима: вид сверху (основной, как в «Симс») и от первого лица (в настройках).
(function () {
  const C = {};
  HW.Controls = C;

  const move = { x: 0, y: 0 };      // -1..1
  const keys = {};
  let yaw = Math.PI, pitch = 0;
  // камера вида сверху: поворот вокруг Анны, наклон, отдаление
  const cam = { yaw: Math.PI + 0.55, pitch: 0.95, dist: 12 };
  let joyId = null, joyOrigin = null, joyMoved = 0, joyStartTime = 0;
  let lookId = null, lookLast = null, lookStart = null, lookStartTime = 0, lookMoved = 0;
  const pinch = {};                 // pointerId -> {x,y}
  let pinchDist = 0;
  let enabled = true;
  let joyEl, knobEl;
  let path = null;                  // маршрут по клику [[x,z], ...]
  let facing = 0;                   // куда смотрит Анна (вид сверху)

  C.onTap = null;        // (nx, ny) — тап по экрану без перетаскивания
  C.onInteractKey = null;
  C.onArrive = null;     // дошли до конца маршрута
  C.mode = 'top';
  const top = () => C.mode === 'top';

  function tapAt(e) {
    if (!C.onTap) return;
    C.onTap((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  C.init = function (canvas) {
    joyEl = document.getElementById('joy');
    knobEl = document.getElementById('joyKnob');

    canvas.addEventListener('pointerdown', e => {
      if (!enabled) return;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (isTouch) pinch[e.pointerId] = { x: e.clientX, y: e.clientY };
      const ids = Object.keys(pinch);
      if (top() && ids.length === 2) {
        // второй палец — щипок: отменяем джойстик и обзор
        const [a, b] = ids.map(i => pinch[i]);
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        joyId = lookId = null; move.x = move.y = 0;
        joyEl.style.display = 'none';
        return;
      }
      if (isTouch && e.clientX < window.innerWidth * 0.42 && joyId === null) {
        joyId = e.pointerId;
        joyOrigin = { x: e.clientX, y: e.clientY };
        joyMoved = 0; joyStartTime = performance.now();
        joyEl.style.display = 'block';
        joyEl.style.left = (e.clientX - 60) + 'px';
        joyEl.style.top = (e.clientY - 60) + 'px';
        knobEl.style.transform = 'translate(0px,0px)';
      } else if (lookId === null) {
        lookId = e.pointerId;
        lookLast = lookStart = { x: e.clientX, y: e.clientY };
        lookStartTime = performance.now();
        lookMoved = 0;
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (pinch[e.pointerId]) {
        pinch[e.pointerId] = { x: e.clientX, y: e.clientY };
        const ids = Object.keys(pinch);
        if (top() && ids.length === 2) {
          const [a, b] = ids.map(i => pinch[i]);
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDist > 0) C.zoom(pinchDist / d);
          pinchDist = d;
          return;
        }
      }
      if (e.pointerId === joyId) {
        let dx = e.clientX - joyOrigin.x, dy = e.clientY - joyOrigin.y;
        const len = Math.hypot(dx, dy), max = 50;
        joyMoved = Math.max(joyMoved, len);
        if (len > max) { dx = dx / len * max; dy = dy / len * max; }
        knobEl.style.transform = `translate(${dx}px,${dy}px)`;
        move.x = dx / max; move.y = -dy / max;
        if (len > 8) path = null;
      } else if (e.pointerId === lookId) {
        const dx = e.clientX - lookLast.x, dy = e.clientY - lookLast.y;
        lookLast = { x: e.clientX, y: e.clientY };
        lookMoved += Math.abs(dx) + Math.abs(dy);
        const s = 0.0045 * (HW.settings ? HW.settings.sens : 1);
        if (top()) {
          if (lookMoved < 8) return;      // не дёргать камеру от дрожания пальца при тапе
          cam.yaw -= dx * 0.006;
          cam.pitch = HW.clamp(cam.pitch + dy * 0.004, 0.55, 1.35);
          return;
        }
        yaw -= dx * s;
        pitch -= dy * s * (HW.settings && HW.settings.invert ? -1 : 1);
        pitch = HW.clamp(pitch, -1.2, 1.2);
      }
    });
    const end = e => {
      delete pinch[e.pointerId];
      if (Object.keys(pinch).length < 2) pinchDist = 0;
      if (e.pointerId === joyId) {
        joyId = null; move.x = move.y = 0;
        joyEl.style.display = 'none';
        // в виде сверху короткий тап слева — тоже «идти сюда»
        if (top() && joyMoved < 12 && performance.now() - joyStartTime < 350 && e.type === 'pointerup') tapAt(e);
      } else if (e.pointerId === lookId) {
        lookId = null;
        const dt = performance.now() - lookStartTime;
        if (lookMoved < 12 && dt < 350 && e.type === 'pointerup') tapAt(e);
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', e => {
      if (!top() || !enabled) return;
      e.preventDefault();
      C.zoom(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      keys[e.code] = true;
      if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && enabled && C.onInteractKey) {
        e.preventDefault();
        C.onInteractKey();
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  };

  C.setEnabled = function (v) {
    enabled = v;
    if (!v) {
      joyId = lookId = null; move.x = move.y = 0;
      for (const k in keys) keys[k] = false;
      for (const k in pinch) delete pinch[k];
      if (joyEl) joyEl.style.display = 'none';
    }
  };
  C.isEnabled = () => enabled;

  C.setView = function (y, p) { yaw = y; pitch = p || 0; };
  C.getView = () => ({ yaw, pitch });
  C.getCam = () => cam;
  C.setCam = function (c) { if (c) Object.assign(cam, c); };
  C.zoom = function (k) { cam.dist = HW.clamp(cam.dist * k, 5, 20); };
  C.getFacing = () => facing;
  C.setFacing = f => { facing = f; };
  C.isWalking = () => !!(path && path.length);
  C.stopPath = () => { path = null; };

  // ---------- поиск пути по сетке (вид сверху) ----------
  const R = 0.28, CELL = 0.15, GW = Math.ceil(16 / CELL), GH = Math.ceil(12 / CELL);
  function blocked(x, z, colliders) {
    if (x < R || x > 16 - R || z < R || z > 12 - R) return true;
    for (const c of colliders) {
      if (x > c[0] - R && x < c[2] + R && z > c[1] - R && z < c[3] + R) return true;
    }
    return false;
  }
  function lineFree(ax, az, bx, bz, colliders) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
    for (let i = 1; i <= n; i++) if (blocked(ax + (bx - ax) * i / n, az + (bz - az) * i / n, colliders)) return false;
    return true;
  }
  // Маршрут из (sx,sz) в (tx,tz); если цель занята — к ближайшей свободной клетке. null — не дойти.
  // isGoal(x, z) вместо точки — идти к ближайшей по пути клетке, где isGoal истинно.
  C.findPath = function (sx, sz, tx, tz, colliders, isGoal) {
    const free = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) free[j * GW + i] = blocked((i + 0.5) * CELL, (j + 0.5) * CELL, colliders) ? 0 : 1;
    const cellOf = (x, z) => [HW.clamp(Math.floor(x / CELL), 0, GW - 1), HW.clamp(Math.floor(z / CELL), 0, GH - 1)];
    // ближайшая свободная клетка (поиск в ширину)
    const nearestFree = (ci, cj) => {
      if (free[cj * GW + ci]) return cj * GW + ci;
      const seen = new Uint8Array(GW * GH), q = [cj * GW + ci];
      seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const k = q[h], i = k % GW, j = (k - i) / GW;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
          const nk = nj * GW + ni;
          if (seen[nk]) continue;
          if (free[nk]) return nk;
          seen[nk] = 1; q.push(nk);
        }
      }
      return -1;
    };
    const [si, sj] = cellOf(sx, sz);
    const s = nearestFree(si, sj);
    if (s < 0) return null;
    let g = -1, goalFree = false, goals = null;
    if (isGoal) {
      goals = new Uint8Array(GW * GH);
      let any = false;
      for (let k = 0; k < GW * GH; k++) if (free[k]) { const i = k % GW, j = (k - i) / GW; if (isGoal((i + 0.5) * CELL, (j + 0.5) * CELL)) { goals[k] = 1; any = true; } }
      if (!any) return null;
      if (!blocked(sx, sz, colliders) && isGoal(sx, sz)) return [];   // уже на месте
    } else {
      const [ti, tj] = cellOf(tx, tz);
      g = nearestFree(ti, tj);
      if (g < 0) return null;
      goalFree = free[tj * GW + ti] && !blocked(tx, tz, colliders);
    }
    // A* по 8 направлениям
    const gs = new Float32Array(GW * GH).fill(Infinity), from = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
    const gi = g % GW, gj = (g - gi) / GW;
    const hf = goals ? () => 0 : k => { const i = k % GW, j = (k - i) / GW; return Math.hypot(i - gi, j - gj); };
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
    gs[s] = 0; push(s, hf(s));
    let found = goals ? !!goals[s] : s === g;
    if (found) g = s;
    while (heap.length && !found) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (goals ? goals[k] : k === g) { g = k; found = true; break; }
      const i = k % GW, j = (k - i) / GW;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni;
        if (!free[nk] || closed[nk]) continue;
        if (di && dj && (!free[j * GW + ni] || !free[nj * GW + i])) continue;   // не срезать углы
        const ng = gs[k] + (di && dj ? 1.414 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; push(nk, ng + hf(nk)); }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let k = g; k !== s && k >= 0; k = from[k]) { const i = k % GW, j = (k - i) / GW; pts.push([(i + 0.5) * CELL, (j + 0.5) * CELL]); }
    pts.reverse();
    if (goalFree) pts.push([tx, tz]);
    // спрямляем: идём к самой дальней точке, видимой по прямой
    const out = [];
    let cx = sx, cz = sz, idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let k = pts.length - 1; k > idx; k--) if (lineFree(cx, cz, pts[k][0], pts[k][1], colliders)) { far = k; break; }
      out.push(pts[far]);
      cx = pts[far][0]; cz = pts[far][1];
      idx = far + 1;
    }
    return out;
  };
  C.walkPath = function (p) { path = p && p.length ? p.slice() : null; };
  C.pathEnd = () => (path && path.length ? path[path.length - 1] : null);

  // Перемещение игрока с учётом коллизий. pos: {x,z}. Возвращает true, если Анна шла.
  C.step = function (dt, pos, colliders) {
    if (!enabled) return false;
    let fx = move.y, sx = move.x;
    if (keys.KeyW || keys.ArrowUp) fx += 1;
    if (keys.KeyS || keys.ArrowDown) fx -= 1;
    if (keys.KeyD) sx += 1;
    if (keys.KeyA) sx -= 1;
    if (top()) {
      if (keys.ArrowLeft) sx -= 1;
      if (keys.ArrowRight) sx += 1;
      if (keys.KeyQ) cam.yaw += dt * 2;
      if (keys.KeyR) cam.yaw -= dt * 2;
    } else {
      if (keys.ArrowLeft) yaw += dt * 2.2;
      if (keys.ArrowRight) yaw -= dt * 2.2;
    }
    let len = Math.hypot(fx, sx);
    const hit = (x, z) => blocked(x, z, colliders);
    const sp = HW.CFG.SPEED * dt;
    if (len >= 0.05) {
      path = null;
      if (len > 1) { fx /= len; sx /= len; }
      const y = top() ? cam.yaw : yaw;
      const dx = (-Math.sin(y) * fx + Math.cos(y) * sx) * sp;
      const dz = (-Math.cos(y) * fx - Math.sin(y) * sx) * sp;
      if (!hit(pos.x + dx, pos.z)) pos.x += dx;
      if (!hit(pos.x, pos.z + dz)) pos.z += dz;
      facing = Math.atan2(dx, dz);
      return true;
    }
    if (!path || !path.length) return false;
    // идём по маршруту
    const [tx, tz] = path[0];
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    const stp = Math.min(d, sp);
    if (d > 0.001) {
      const nx = pos.x + dx / d * stp, nz = pos.z + dz / d * stp;
      if (!hit(nx, nz) || hit(pos.x, pos.z)) { pos.x = nx; pos.z = nz; }
      else {
        // задели угол — скользим вдоль препятствия, как при ручной ходьбе
        const ox = pos.x, oz = pos.z;
        if (!hit(nx, pos.z)) pos.x = nx;
        if (!hit(pos.x, nz)) pos.z = nz;
        if (Math.hypot(pos.x - ox, pos.z - oz) < stp * 0.2) {
          // упёрлись совсем — заканчиваем путь здесь (игра сама скажет, если не дотянуться)
          path = null;
          if (C.onArrive) C.onArrive();
          return false;
        }
      }
      facing = Math.atan2(dx, dz);
    }
    if (d - stp < 0.02) {
      path.shift();
      if (!path.length) { path = null; if (C.onArrive) C.onArrive(); }
    }
    return true;
  };
})();
