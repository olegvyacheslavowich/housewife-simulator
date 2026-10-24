// Точка входа: титульный экран, игровой цикл, взаимодействие.
(function () {
  const M = {};
  HW.Main = M;
  const $ = id => document.getElementById(id);
  const pos = { x: 7.5, z: 1.4 };
  let target = null, lastPick = 0, lastRoom = null, running = false, lastT = 0, saveTimer = 0;
  let clockAcc = 0, lastMinute = -1, tickAcc = 0;
  let pending = null;           // вид сверху: предмет, к которому идём, чтобы открыть его
  const camTarget = { x: 7.5, z: 1.4 };
  const TOP_REACH = 1.0;        // вид сверху: насколько близко подойти к предмету (по полу)

  HW.settings = { sens: 1, quality: 1.5, invert: false, sound: true, clock: 1, guide: true, view: 'top' };
  try {
    const raw = localStorage.getItem(HW.CFG.SETTINGS_KEY);
    if (raw) Object.assign(HW.settings, JSON.parse(raw));
  } catch (e) { }
  M.saveSettings = function () {
    try { localStorage.setItem(HW.CFG.SETTINGS_KEY, JSON.stringify(HW.settings)); } catch (e) { }
  };

  M.playerPos = () => pos;
  // Падение при обмороке: камера заваливается на пол
  let fallStart = null;
  M.fall = function (on) { fallStart = on === false ? null : performance.now(); };

  const isTop = () => HW.settings.view !== 'fp';
  M.applyPlayer = function () {
    const p = HW.S.player;
    pos.x = p.x; pos.z = p.z;
    camTarget.x = p.x; camTarget.z = p.z;
    HW.Controls.setView(p.yaw, p.pitch);
    HW.Controls.setFacing(p.yaw - Math.PI);   // Анна смотрит туда же, куда смотрела камера от первого лица
    HW.Controls.setCam(p.cam);
    HW.Controls.stopPath();
    pending = null;
  };
  M.storePlayer = function () {
    if (!HW.S) return;
    const v = HW.Controls.getView();
    const yaw = isTop() ? HW.Controls.getFacing() + Math.PI : v.yaw;
    const c = HW.Controls.getCam();
    HW.S.player = { x: pos.x, z: pos.z, yaw, pitch: isTop() ? 0 : v.pitch, cam: { yaw: c.yaw, pitch: c.pitch, dist: c.dist } };
  };
  // Переключение вида: сверху (основной) / от первого лица
  M.setView = function (mode) {
    const was = HW.Controls.mode;
    HW.settings.view = mode;
    HW.Controls.mode = mode;
    if (was === 'top' && mode === 'fp') HW.Controls.setView(HW.Controls.getFacing() + Math.PI, 0);
    if (was === 'fp' && mode === 'top') HW.Controls.setFacing(HW.Controls.getView().yaw - Math.PI);
    HW.Controls.stopPath();
    pending = null;
    HW.World.dest = null;
    HW.World.setMode(mode);
    document.body.classList.toggle('topview', mode === 'top');
    $('hintTitle').textContent = mode === 'top'
      ? 'Тап по полу — идти, тап по предмету — подойти и действовать. Тянуть — повернуть камеру, щипок или колесо — приблизить.'
      : 'Левая часть экрана — ходьба, правая — обзор. Тап по предмету — действие.';
  };

  function openTarget(t) {
    if (!t) return;
    if (t.iid === 'toy') {
      HW.UI.handleResult(HW.Game.pickToy(t.toyId));
      return;
    }
    HW.UI.openSheet(HW.Game.objectSheet(t.iid));
  }
  M.interact = function () {
    if (HW.UI.isBusy()) return;
    if (isTop()) { if (target) { HW.Controls.stopPath(); HW.World.dest = null; pending = null; faceTo(target.point); openTarget(target); } return; }
    if (target && target.dist <= HW.CFG.REACH) openTarget(target);
  };

  // вид сверху: можно ли уже дотянуться до предмета
  function topReach(t, reach) {
    return HW.World.reachDist(pos.x, pos.z, t.iid, t.toyId) <= (reach || TOP_REACH) + 0.3;
  }
  function walkTo(x, z, isGoal) {
    const p = HW.Controls.findPath(pos.x, pos.z, x, z, M.colliders, isGoal);
    if (!p) { if (!isGoal) HW.UI.toast('Туда не пройти.', 'warn'); return false; }
    HW.Controls.walkPath(p);
    const e = HW.Controls.pathEnd();
    HW.World.dest = e ? [e[0], e[1]] : null;
    return true;
  }
  // Подойти к предмету: ближайшая по пути точка, откуда до него дотянуться (без стены между)
  // Если предмет заставлен мебелью вплотную — тянемся дальше, максимум как от первого лица (REACH). Возвращает дальность или 0.
  function approach(t) {
    const rects = HW.World.rectsOf(t.iid, t.toyId);
    if (!rects.length) return 0;
    for (const R of [TOP_REACH - 0.1, 1.6, 2.2, HW.CFG.REACH]) {
      const goal = (x, z) => {
        let near = false;
        for (const r of rects) if (Math.hypot(x - HW.clamp(x, r[0], r[2]), z - HW.clamp(z, r[1], r[3])) <= R) { near = true; break; }
        return near && HW.World.reachDist(x, z, null, null, rects) <= R;
      };
      if (walkTo(0, 0, goal)) return R;
    }
    HW.UI.toast('К этому не подойти — всё заставлено.', 'warn');
    return 0;
  }
  function tapTop(nx, ny) {
    const t = HW.World.pick(nx, ny);
    pending = null;
    if (t) {
      if (topReach(t)) { HW.Controls.stopPath(); HW.World.dest = null; faceTo(t.point); openTarget(t); return; }
      const reach = approach(t);
      if (reach) {
        pending = { t, tries: 0, reach };
        if (!HW.Controls.isWalking()) onArrive();   // уже стоим там, откуда достать
      }
      return;
    }
    const f = HW.World.pickFloor(nx, ny);
    if (f) walkTo(HW.clamp(f.x, 0.3, 15.7), HW.clamp(f.z, 0.3, 11.7));
  }
  function faceTo(p) { if (p) HW.Controls.setFacing(Math.atan2(p.x - pos.x, p.z - pos.z)); }
  function onArrive() {
    HW.World.dest = null;
    if (!pending) return;
    const pd = pending;
    pending = null;
    let t = pd.t;
    // дети и собака могли отойти — обновить точку
    if (t.iid === 'misha' || t.iid === 'sonya' || t.iid === 'dog') {
      const tp = HW.World.targetPos(t.iid);
      if (!tp) return;
      t = Object.assign({}, t, { point: { x: tp[0], y: 0.5, z: tp[1] } });
    }
    if (HW.UI.isBusy()) return;
    if (t.iid === 'toy' && !HW.S.house.toys.some(x => x.id === t.toyId)) return;   // игрушку уже убрали
    if (topReach(t, pd.reach)) { faceTo(t.point); openTarget(t); return; }
    const reach = pd.tries < 1 && (t.iid === 'misha' || t.iid === 'sonya' || t.iid === 'dog') ? approach(t) : 0;
    if (reach) {
      pending = { t, tries: pd.tries + 1, reach };
      if (!HW.Controls.isWalking()) onArrive();
      return;
    }
    HW.UI.toast('Не дотянуться — подойдите с другой стороны.', 'warn');
  }

  function onTap(nx, ny) {
    if (HW.UI.isBusy()) return;
    if (isTop()) { tapTop(nx, ny); return; }
    const t = HW.World.pick(nx, ny);
    if (!t) return;
    if (t.dist > HW.CFG.REACH) { HW.UI.toast('Слишком далеко. Руки у вас, конечно, золотые, но не телескопические.', 'warn'); return; }
    openTarget(t);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const rawDt = Math.min(1, (now - lastT) / 1000 || 0);   // реальное время для часов (на медленном устройстве кадры реже)
    const dt = Math.min(0.05, rawDt);
    lastT = now;
    if (!running) return;
    const S = HW.S;
    const walking = HW.Controls.step(dt, pos, M.colliders);
    const cam = HW.World.camera;
    const v = HW.Controls.getView();
    const top = isTop();
    const P = HW.World.player;
    P.x = pos.x; P.z = pos.z; P.facing = HW.Controls.getFacing(); P.moving = walking; P.lying = fallStart !== null;
    if (top) {
      const c = HW.Controls.getCam();
      const k = Math.min(1, dt * 6);
      camTarget.x += (pos.x - camTarget.x) * k;
      camTarget.z += (pos.z - camTarget.z) * k;
      placeTopCam(camTarget.x, camTarget.z, c);
    } else {
      cam.position.set(pos.x, HW.CFG.EYE, pos.z);
      cam.rotation.set(v.pitch, v.yaw, 0);
    }
    if (fallStart !== null && !top) {
      const k = Math.min(1, (now - fallStart) / 900), e = k * k;
      cam.position.y = HW.CFG.EYE - 1.3 * e;
      cam.rotation.set(v.pitch * (1 - e) - 0.25 * e, v.yaw, 1.25 * e);
    }

    if (!HW.UI.isBusy()) HW.UI.updateGuide(pos.x, pos.z, top ? HW.Controls.getCam().yaw : v.yaw);
    if (now - lastPick > 120) {
      lastPick = now;
      if (top) {
        // ближайший предмет рядом с Анной (пока идёт к цели — подсказка про цель)
        target = HW.Controls.isWalking() ? null : HW.World.nearest(pos.x, pos.z, HW.Controls.getFacing(), TOP_REACH);
        // рядом ничего нет — предложить заставленный мебелью предмет (картину за диваном, гитару) с дальностью как от первого лица
        if (!target && !HW.Controls.isWalking()) {
          const boxed = HW.World.boxedIids(TOP_REACH - 0.1);
          if (boxed.size) target = HW.World.nearest(pos.x, pos.z, HW.Controls.getFacing(), HW.CFG.REACH, boxed);
        }
        if (pending) HW.UI.setPrompt(pending.t, false, true);
        else HW.UI.setPrompt(target, !!target);
      } else {
        const t = HW.World.pick(0, 0);
        target = t && t.dist <= HW.CFG.REACH + 1.5 ? t : null;
        HW.UI.setPrompt(target, target && target.dist <= HW.CFG.REACH);
      }
      const room = HW.roomAt(pos.x, pos.z);
      if (room !== lastRoom) { lastRoom = room; HW.UI.setRoom(room); HW.Tutorial.check(); }
    }
    // живые часы: идут, пока игрок ходит; в меню и при свёрнутом приложении — стоят
    if (HW.Controls.isEnabled() && !HW.UI.isBusy() && !document.hidden && !HW.Game.tutorialActive()) {
      // остановить часы можно только на «Лёгкой»: иначе пропадает вся суета (минимум — ½)
      let clk = HW.settings.clock === undefined ? 1 : HW.settings.clock;
      if (clk === 0 && S.diff !== 'easy') clk = 0.5;
      const sp = clk * ((HW.DIFF[S.diff] || HW.DIFF.normal).clock || 1);
      if (sp > 0) {
        clockAcc += rawDt * sp;
        if (clockAcc >= 0.25) {
          const res = HW.Game.liveTick(clockAcc);
          clockAcc = 0;
          if (res.msgs.length || res.report) HW.UI.handleResult(res);
          const mm = Math.floor(S.time);
          if (mm !== lastMinute) { lastMinute = mm; HW.World.sync(S); HW.UI.updateHUD(); }
        }
        if (HW.UI.hurry) { tickAcc += rawDt; if (tickAcc >= 1) { tickAcc = 0; HW.Audio.play('tick'); } }
      }
    }
    saveTimer += dt;
    if (saveTimer > 10) { saveTimer = 0; M.storePlayer(); HW.Game.save(); }
    HW.World.update(dt, S);
  }

  function enterGame(isNew) {
    $('title').classList.add('hidden');
    $('hud').classList.remove('hidden');
    M.applyPlayer();
    HW.World.sync(HW.S);
    M.colliders = HW.World.colliders();
    HW.UI.updateHUD();
    running = true;
    HW.Controls.setEnabled(true);
    HW.Tutorial.render();
    if (isNew) {
      const ev = HW.Game.firstEvent();
      HW.UI.modal({ title: ev.title, text: ev.text, buttons: [
        { label: 'Как играть?', cb: () => HW.UI.showHelp(false) },
        { label: 'Поехали!', cls: 'primary' },
      ] });
    } else {
      if (HW.S.failed) HW.UI.showFailEnding();
      else HW.UI.toast(`С возвращением! День ${HW.S.day}, ${HW.fmtTime(HW.S.time)}. Дом стоит, дети на месте. Наверное.`, 'info');
    }
  }

  // камера вида сверху: смотрит на (x,z) под наклоном, с поворотом вокруг
  function placeTopCam(x, z, c) {
    const cam = HW.World.camera;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const hd = c.dist * Math.cos(c.pitch);
    cam.position.set(x - fx * hd, 0.6 + c.dist * Math.sin(c.pitch), z - fz * hd);
    cam.lookAt(x, 0.6, z);
    HW.World.updateCutaway(fx, fz);
  }

  M.isRunning = () => running;
  M.startNew = function (diff, opts) {
    HW.Game.wipe();
    HW.Game.newGame(diff || 'normal', opts);
    enterGame(true);
  };

  function showTitle() {
    const has = HW.Game.hasSave();
    $('btnContinue').style.display = has ? '' : 'none';
    $('title').classList.remove('hidden');
  }

  M.boot = function () {
    const canvas = $('c');
    HW.World.init(canvas, HW.settings.quality);
    HW.Controls.init(canvas);
    HW.Controls.onTap = onTap;
    HW.Controls.onInteractKey = M.interact;
    HW.Controls.onArrive = onArrive;
    HW.UI.init();
    HW.Tutorial.init();
    HW.Controls.setEnabled(false);
    M.setView(HW.settings.view === 'fp' ? 'fp' : 'top');

    // пересчёт коллизий после изменения мебели
    const sync = HW.World.sync;
    HW.World.sync = function (st) { sync(st); M.colliders = HW.World.colliders(); };
    M.colliders = HW.World.colliders();

    $('btnNew').onclick = () => {
      if (HW.Game.hasSave()) {
        HW.UI.modal({ title: 'Новая игра?', text: 'Текущее сохранение будет удалено.', buttons: [
          { label: 'Да', cls: 'danger', cb: () => HW.UI.chooseDifficulty() }, { label: 'Отмена', cb: () => HW.Controls.setEnabled(false) }] });
      } else HW.UI.chooseDifficulty();
    };
    $('btnContinue').onclick = () => {
      if (HW.Game.load()) enterGame(false);
      else { HW.UI.toast('Сохранение повреждено. Бадди его сгрыз.', 'bad'); HW.UI.chooseDifficulty(); }
    };

    window.addEventListener('resize', () => HW.World.resize());
    // звук: разблокировка после первого касания и щелчок на кнопках
    document.addEventListener('pointerdown', e => {
      HW.Audio.unlock();
      if (e.target.closest && e.target.closest('button')) HW.Audio.play('click');
    }, true);
    const persist = () => { if (running) { M.storePlayer(); HW.Game.save(); } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
    window.addEventListener('pagehide', persist);

    // фон титульника — дом за спиной меню
    const demo = HW.Game.demoState();
    HW.World.sync(demo);
    HW.World.camera.position.set(5.3, 1.6, 0.8);
    showTitle();
    requestAnimationFrame(loop);
    // демо-рендер титульника
    (function titleSpin(t) {
      if (running) return;
      if (isTop()) placeTopCam(8, 6, { yaw: Math.PI + 0.6 + t / 30000, pitch: 0.9, dist: 17 });
      else {
        HW.World.camera.position.set(5.3, 1.6, 0.8);
        HW.World.camera.rotation.set(-0.12, 2.3 + Math.sin(t / 4000) * 0.4, 0);
      }
      HW.World.update(0.016, demo);
      requestAnimationFrame(titleSpin);
    })(0);
  };

  window.addEventListener('load', M.boot);
})();
