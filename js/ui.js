// Интерфейс: HUD, карточка действий, телефон, модальные окна, тосты.
(function () {
  const U = {};
  HW.UI = U;
  const $ = id => document.getElementById(id);
  const G = () => HW.Game;
  const S = () => HW.S;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  U.NAMES = {
    door: '🚪 Входная дверь', fridge: '🧊 Холодильник', stove: '🔥 Плита', sink: '🚰 Мойка', bowl: '🥣 Миска Бадди',
    laptop: '💻 Ноутбук', tub: '🛁 Ванна', basket: '🧺 Корзина для белья', bed: '🛏️ Кровать', kidsbed: '🛌 Детская кровать',
    misha: '👦 Миша', sonya: '👧 Соня', dog: '🐕 Бадди', sofa: '🛋️ Диван', tv: '📺 Телевизор', bookshelf: '📚 Книжный шкаф',
    treadmill: '🏃‍♀️ Беговая дорожка', diningTable: '🍽️ Обеденный стол', dishwasher: '🫧 Посудомойка', multicooker: '🍲 Мультиварка',
    washer: '🧺 Стиралка', kidsDesk: '✏️ Детская парта', toy: '🧸 Игрушка',
    flower: '🌱 Цветок', easel: '🎨 Мольберт', guitar: '🎸 Гитара', herbs: '🌿 Зелень', photos: '📷 Фотостена', puzzleArt: '🧩 Пазл',
    fireplace: '🔥 Камин', aquarium: '🐠 Аквариум', vanity: '💄 Туалетный столик', hallMirror: '🪞 Зеркало', painting0: '🖼️ Картина', painting1: '🖼️ Картина', painting2: '🖼️ Картина',
  };

  U.modalOpen = false;
  U.isBusy = () => U.modalOpen || !$('sheet').classList.contains('hidden') || !$('phone').classList.contains('hidden') || !$('progress').classList.contains('hidden');

  // ---------- тосты ----------
  // Не больше двух сообщений на экране; все сообщения пишутся в журнал
  U.toast = function (text, type, snd) {
    if (snd) HW.Audio.play(snd);
    else if (type === 'bad') HW.Audio.play('bad');
    if (type === 'quiet') return;
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    const life = Math.min(type === 'bad' || type === 'warn' ? 7000 : 5000, (type === 'info' ? 2200 : 3000) + text.length * 30);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, life);
    el.onclick = () => el.remove();
  };

  // ---------- HUD ----------
  U.updateHUD = function () {
    const s = S();
    if (!s) return;
    $('hDay').textContent = `День ${s.day}/${HW.CFG.SHIFT_DAYS} · ${HW.WD_SHORT[G().weekday()]}`;
    $('hTime').textContent = HW.fmtTime(s.time);
    $('hMoney').textContent = HW.fmtMoney(s.money);
    $('hMoney').classList.toggle('neg', s.money < 0);
    const bar = (id, v) => { const el = $(id); el.style.width = Math.round(v) + '%'; el.className = 'fill ' + (v < 25 ? 'low' : v < 50 ? 'mid' : 'ok'); };
    bar('bEnergy', s.mom.energy);
    bar('bMood', s.mom.mood);
    bar('bFood', s.mom.satiety);
    const nx = G().nextTask();
    const nEl = $('hNext');
    if (nx) { nEl.textContent = `Далее: ${nx.text.replace(/\s*\(.*\)$/, '')} · до ${nx.deadline}`; nEl.classList.remove('hidden'); }
    else nEl.classList.add('hidden');
    const inc = G().incident();
    const ib = $('incident');
    if (inc) {
      ib.classList.remove('hidden');
      $('incText').textContent = inc.title + ' — ' + inc.hint;
      $('incTime').textContent = '⏱ ' + Math.max(0, Math.ceil(inc.left)) + ' мин';
    } else ib.classList.add('hidden');
    $('hTimers').innerHTML = G().timers().map(x => `<span class="${x.hot ? 'hot' : ''}">${x.icon} ${esc(x.text)}</span>`).join('');
    const ur = G().urgency();
    U.hurry = !!(ur && ur.min < 30);
    $('vignette').classList.toggle('on', U.hurry);
    HW.World.setMarker(inc ? inc.iid : (s.house.stove.state === 'ready' ? 'stove' : (s.house.washer.state === 'done' ? 'washer' : null)));
    setTimeout(U.layoutTop, 0);
    U.guide = (HW.Tutorial && HW.Tutorial.guide()) || (HW.settings.guide === false ? null : G().guide());
    // все дела сделаны — один раз за день поздравить и подсказать идею
    const tl = G().tasks().list;
    if (!G().tutorialActive() && tl.length && tl.every(x => x.done) && !s.flags.allDone) {
      s.flags.allDone = true;
      const idea = G().ideas()[0];
      U.toast('✅ Все дела на сегодня сделаны! ' + (idea ? '💡 Идея: ' + idea.text : ''), 'good', 'ach');
    }
    document.documentElement.style.setProperty('--hudBottom', Math.round(document.querySelector('#topbar .info').getBoundingClientRect().bottom) + 'px');
    // плашка срочного дела показывает то же, что стрелка (иначе подсказки спорят друг с другом)
    const el = $('urgent');
    const hotGuide = U.guide && U.guide.hot && !inc && !G().tutorialActive();
    if (hotGuide) { el.textContent = '⏰ ' + U.guide.why; el.classList.remove('hidden'); } else el.classList.add('hidden');
    const { list, hints } = G().tasks();
    const left = list.filter(t => !t.done).length;
    $('phoneBadge').textContent = left;
    $('phoneBadge').style.display = left ? 'block' : 'none';
    void hints;
  };
  // Стрелка-навигатор: вызывается каждый кадр из игрового цикла
  const GUIDE_NAMES = { 'room:living': '📍 Гостиная', 'room:kids': '📍 Детская', 'room:kitchen': '📍 Кухня', 'room:bath': '📍 Ванная', 'room:bedroom': '📍 Спальня', 'room:hall': '📍 Прихожая' };
  U.updateGuide = function (px, pz, yaw) {
    const el = $('guide');
    const g = U.guide;
    const tp = g && g.iid && HW.World.targetPos(g.iid);
    if (!g || (!tp && !g.phone)) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('hot', !!g.hot);
    el.classList.toggle('idea', !!g.idea);
    if (!tp) {   // идея без места — по нажатию открыть телефон
      $('gArrow').style.transform = 'none';
      $('gArrow').querySelector('path').setAttribute('d', 'M24 9 a9 9 0 0 1 5 16.5 V30 h-10 v-4.5 A9 9 0 0 1 24 9 Z M20 33 h8 v3 h-8 Z');
      el.classList.remove('here');
      el.dataset.bulb = '1';
      $('gWhat').textContent = g.why;
      $('gWhere').textContent = '📱 нажмите, чтобы открыть';
      el.onclick = () => U.openPhone(g.phone);
      return;
    }
    el.onclick = null;
    const r = HW.World.route(px, pz, tp[0], tp[1]);
    const here = r.dist < 1.8;
    if (el.classList.contains('here') !== here || el.dataset.bulb === '1') {
      el.dataset.bulb = '0';
      el.classList.toggle('here', here);
      // стрелка ↔ галочка «вы на месте» (через атрибут — работает и в Safari)
      $('gArrow').querySelector('path').setAttribute('d', here ? 'M14 24 L21 31 L35 16 L31 13 L21 24 L18 20 Z' : 'M24 8 L35 30 L24 25 L13 30 Z');
    }
    const dx = r.next[0] - px, dz = r.next[1] - pz;
    // проекция на «вперёд» и «вправо» камеры → угол стрелки по часовой от верха
    const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    $('gArrow').style.transform = here ? 'none' : `rotate(${Math.atan2(right, fwd)}rad)`;
    $('gWhat').textContent = g.why;
    $('gWhere').textContent = (U.NAMES[g.iid] || GUIDE_NAMES[g.iid] || g.iid) + (here ? ' · вы на месте' : ` · ${Math.round(r.dist)} м`);
  };

  U.setRoom = function (rid) {
    $('roomBtn').textContent = '📍 ' + HW.ROOMS[rid].name + ' ▾';
    $('roomBtn').dataset.room = rid;
  };
  U.setPrompt = function (target, inReach, walking) {
    const p = $('prompt');
    if (!target) { p.classList.add('hidden'); $('cross').classList.remove('active'); return; }
    p.classList.remove('hidden');
    const name = U.NAMES[target.iid] || target.iid;
    $('promptText').textContent = walking ? '🚶 Идём: ' + name : name + (inReach ? '' : ' — подойдите ближе');
    $('promptBtn').disabled = !inReach;
    $('cross').classList.toggle('active', inReach);
  };

  // ---------- карточка действий ----------
  U.openSheet = function (sheet) {
    if (!sheet) return;
    HW.Controls.setEnabled(false);
    $('sheetTitle').textContent = sheet.title;
    $('sheetInfo').innerHTML = (sheet.info || []).map(l => `<div>${esc(l)}</div>`).join('');
    const list = $('sheetList');
    list.innerHTML = '';
    if (!sheet.actions.length) list.innerHTML = '<div class="empty">Здесь пока нечего делать. Наслаждайтесь моментом.</div>';
    const acts = sheet.actions.filter(a => !a.reason).concat(sheet.actions.filter(a => a.reason));
    acts.forEach(a => {
      const b = document.createElement('button');
      b.className = 'act' + (a.reason ? ' off' : '');
      b.innerHTML = `<span class="al">${esc(a.label)}</span><span class="at">${a.mins ? '⏱ ' + HW.fmtDur(a.mins) : (a.shop ? '🛒' : '')}</span>` +
        (a.reason ? `<span class="ar">${esc(a.reason)}</span>` : '');
      b.onclick = () => {
        if (a.reason) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        U.closeSheet();
        if (a.shop) U.openShop(a.shop);
        else U.runAction(a);
      };
      list.appendChild(b);
    });
    $('sheet').classList.remove('hidden');
  };
  U.closeSheet = function () {
    $('sheet').classList.add('hidden');
    if (!U.isBusy()) HW.Controls.setEnabled(true);
  };

  // ---------- выполнение действия с анимацией часов ----------
  U.runAction = function (a) {
    const mins = a.mins || 0;
    if (mins <= 0) { U.handleResult(G().perform(a)); return; }
    const pr = $('progress');
    HW.Controls.setEnabled(false);
    pr.classList.remove('hidden');
    $('progLabel').textContent = a.label.replace(/^[^\wА-Яа-яЁё]+/, '');
    const t0 = S().time;
    const dur = Math.max(450, Math.min(1400, 350 + mins * 7));
    const start = performance.now();
    const step = now => {
      const k = Math.min(1, (now - start) / dur);
      $('progClock').textContent = HW.fmtTime(t0 + mins * k);
      $('progBar').style.width = (k * 100) + '%';
      if (k < 1) requestAnimationFrame(step);
      else {
        pr.classList.add('hidden');
        HW.Audio.play('done');
        U.handleResult(G().perform(a));
      }
    };
    requestAnimationFrame(step);
  };

  U.handleResult = function (res) {
    if (!res) return;
    (res.msgs || []).forEach(m => { U.toast(m.text, m.type, m.snd); G().addLog(m.text.slice(0, 140)); });
    HW.World.sync(S());
    U.updateHUD();
    if (HW.Tutorial) HW.Tutorial.check();
    if (res.report) U.fallAsleep(res.report, () => U.showNight(res.report));
    else if (!U.isBusy()) HW.Controls.setEnabled(true);
  };

  // Засыпание: веки закрываются; без сил или в час ночи — ещё и падение
  U.fallAsleep = function (rep, done) {
    const faint = rep.reason && rep.reason !== 'sleep';
    U.modalOpen = true;
    HW.Controls.setEnabled(false);
    const eyes = $('eyes');
    $('eyesText').textContent = rep.reason === 'faint' ? '😵 Силы кончились… Вы свалились прямо на пол' : rep.reason === 'late' ? '🌙 Час ночи. Организм выключился сам' : '😴 Спокойной ночи…';
    eyes.classList.remove('hidden');
    if (faint) { HW.Main.fall(true); HW.Audio.play('bad'); }
    $('hud').style.visibility = 'hidden';            // не показывать раньше времени HUD следующего дня
    $('toasts').style.visibility = 'hidden';
    setTimeout(() => eyes.classList.add('closed'), 30);
    setTimeout(() => {
      U.modalOpen = false;
      $('hud').style.visibility = '';
      $('toasts').style.visibility = '';
      done();
      setTimeout(() => { eyes.classList.remove('closed'); eyes.classList.add('hidden'); HW.Main.fall(false); }, 400);
    }, faint ? 2600 : 1500);
  };

  // Плашки сверху (панель, срочная задача, происшествие, обучение) — сообщения ставим под ними
  U.layoutTop = function () {
    let bottom = 0;
    ['#topbar .info', '#urgent', '#incident', '#tut'].forEach(sel => {
      const el = document.querySelector(sel);
      if (el && !el.classList.contains('hidden') && el.getClientRects().length) bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
    });
    document.documentElement.style.setProperty('--toastTop', Math.round(bottom + 8) + 'px');
  };

  // ---------- модальные окна ----------
  U.modal = function (opts) {
    U.modalOpen = true;
    HW.Controls.setEnabled(false);
    $('modalTitle').textContent = opts.title || '';
    const body = $('modalBody');
    if (opts.html) body.innerHTML = opts.html; else body.textContent = opts.text || '';
    const btns = $('modalBtns');
    btns.innerHTML = '';
    (opts.buttons || [{ label: 'Ок' }]).forEach(b => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.label;
      el.onclick = () => {
        if (!b.keep) U.closeModal();
        if (b.cb) b.cb();
      };
      btns.appendChild(el);
    });
    $('modal').classList.remove('hidden');
    body.scrollTop = 0;
  };
  U.closeModal = function () {
    U.modalOpen = false;
    $('modal').classList.add('hidden');
    if (!U.isBusy()) HW.Controls.setEnabled(true);
  };

  // ---------- итоги дня: полноэкранные слайды ----------
  const STAR_TITLES = ['День, который лучше забыть', 'Выжили — уже победа', 'Крепкий день', 'Идеальный день!'];
  const STAR_SUBS = [
    'Завтра будет лучше. Хуже уже сложно.',
    'Дети живы, дом стоит. Этого достаточно. Почти.',
    'Почти всё успели. Остальное — проблема завтрашней вас.',
    'Вы — машина. Андрей бы так не {смог|смогла}.',
  ];
  const TAG = { good: 'Хорошо', bad: 'Плохо', warn: 'Внимание', info: 'К сведению' };
  const EMOJI_RE = /^((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}))*)\s*/u;
  function splitEmoji(t) {
    const m = t.match(EMOJI_RE);
    return m ? [m[1], t.slice(m[0].length)] : ['📝', t];
  }
  let nightState = null;

  U.showNight = function (rep) {
    HW.Audio.play('night');
    U.modalOpen = true;
    HW.Controls.setEnabled(false);
    const order = { good: 0, bad: 1, warn: 2, info: 3 };
    const lines = rep.lines.slice().sort((a, b) => order[a.c] - order[b.c]);
    const goodN = rep.lines.filter(l => l.c === 'good').length, badN = rep.lines.filter(l => l.c === 'bad').length;
    const stars = rep.stars || 0, n = rep.numbers || { earned: 0, spent: 0, clean0: 0, clean1: 0 };
    const slides = [];
    // 1. оценка дня
    const cl = n.clean1 - n.clean0;
    slides.push(`<div class="nbox">
      <div class="nday">🌙 День ${rep.day} позади</div>
      <div class="nstars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.3}s">★</span>`).join('')}</div>
      <h2>${esc(STAR_TITLES[stars])}</h2>
      <p class="nsub">${esc(STAR_SUBS[stars])}</p>
      ${rep.streak > 1 ? `<div class="nstreak">🔥 Серия идеальных дней: ${rep.streak}</div>` : ''}
      ${rep.crisis > 0 && !rep.failed ? `<div class="nstreak ncrisis">🚨 Кризис ${rep.crisis}/3 — Андрей нервничает</div>` : ''}
      <div class="ntiles">
        <div class="ntile"><div class="ti">💰</div><div class="tv up">+${HW.fmtMoney(n.earned)}</div><div class="tl">заработано</div></div>
        <div class="ntile"><div class="ti">💸</div><div class="tv ${n.spent ? 'down' : ''}">−${HW.fmtMoney(n.spent)}</div><div class="tl">потрачено</div></div>
        <div class="ntile"><div class="ti">🧹</div><div class="tv ${cl >= 0 ? 'up' : 'down'}">${n.clean0}% → ${n.clean1}%</div><div class="tl">чистота</div></div>
        <div class="ntile"><div class="ti">⚖️</div><div class="tv"><span class="up">${goodN}</span> / <span class="down">${badN}</span></div><div class="tl">хорошего / плохого</div></div>
      </div></div>`);
    // 2. по одному итогу на экран
    lines.forEach((l, i) => {
      const [emo, text] = splitEmoji(l.t);
      slides.push(`<div class="nbox"><div class="ncard t-${l.c}">
        <div class="nemoji">${emo}</div><div class="ntag">${TAG[l.c] || ''}</div>
        <div class="ntext">${esc(text)}</div><div class="ncount">${i + 1} из ${lines.length}</div></div></div>`);
    });
    // 3. утро
    if (rep.failed) {
      slides.push(`<div class="nbox nmorning"><div class="ncard t-bad"><div class="nemoji">🚨</div>
        <div class="ntext">Утром в дверь звонят. На пороге — Андрей с рюкзаком и очень странным лицом.</div></div></div>`);
    } else if (rep.ended) {
      slides.push(`<div class="nbox nmorning"><div class="ncard t-good"><div class="nemoji">🚪</div>
        <div class="ntext">Слышите ключ в замке? Это Андрей! Вахта окончена.</div></div></div>`);
    } else {
      slides.push(`<div class="nbox nmorning"><div class="ncard t-info"><div class="nemoji">☀️</div>
        <div class="nday">${HW.WEEKDAYS[rep.weekday]} · день ${rep.day + 1} из ${HW.CFG.SHIFT_DAYS}</div>
        <div class="ntext" style="margin-top:10px">${rep.weekday < 5 ? 'Школьный день. Будильник уже орёт, дети ещё спят.' : 'Выходной! Дети встанут сами. Наверное.'}</div></div></div>`);
    }
    const track = $('nTrack');
    track.innerHTML = slides.map(h => `<section class="nslide">${h}</section>`).join('');
    $('nDots').innerHTML = slides.map(() => '<i></i>').join('');
    nightState = { rep, count: slides.length, idx: -1 };
    $('night').classList.remove('hidden');
    track.scrollLeft = 0;   // только после показа: у скрытого элемента прокрутка не меняется
    nightUpdate();
    if (stars === 3) setTimeout(() => HW.Audio.play('ach'), 900);
    else for (let i = 0; i < stars; i++) setTimeout(() => HW.Audio.play('coin'), 300 + i * 300);
  };

  function nightIdx() { const t = $('nTrack'); return Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); }
  function nightUpdate() {
    if (!nightState) return;
    const i = Math.min(nightState.count - 1, Math.max(0, nightIdx()));
    if (i === nightState.idx) return;
    nightState.idx = i;
    $('nDots').querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
    const last = i === nightState.count - 1;
    $('nNext').textContent = last ? (nightState.rep.failed ? '😬 Открыть дверь' : nightState.rep.ended ? HW.fix('🚪 Встретить Андрея') : '☀️ Начать день') : 'Далее →';
    $('nSkip').style.visibility = last ? 'hidden' : 'visible';
  }
  function nightGo(i) {
    const t = $('nTrack');
    t.scrollTo({ left: i * t.clientWidth, behavior: 'smooth' });
  }
  function nightFinish() {
    const rep = nightState.rep;
    nightState = null;
    $('night').classList.add('hidden');
    U.modalOpen = false;
    HW.Main.applyPlayer();
    HW.World.sync(S());
    U.updateHUD();
    if (rep.failed) U.showFailEnding();
    else if (rep.ended) U.showEnding();
    else if (rep.event) U.showEvent(rep.event);
    else {
      U.toast(`☀️ ${HW.WEEKDAYS[G().weekday()]}, ${HW.fmtTime(S().time)}. ` + G().say(G().isSchoolDay() ? 'morningSchool' : 'morningWeekend'), 'info');
      if (!U.isBusy()) HW.Controls.setEnabled(true);
    }
  }
  function nightNext() {
    if (!nightState) return;
    const i = nightIdx();
    if (i >= nightState.count - 1) nightFinish();
    else nightGo(i + 1);
  }

  U.showEvent = function (ev) {
    HW.Audio.play('chime');
    const buttons = ev.choices ? ev.choices.map(c => ({ label: c.label, cb: () => {
      const r = c.run();
      if (typeof r === 'string') U.toast(r, 'info');
      else U.handleResult(r);
      HW.World.sync(S()); U.updateHUD(); G().save();
    } })) : [{ label: 'Понятно', cls: 'primary', cb: () => { HW.World.sync(S()); U.updateHUD(); } }];
    U.modal({ title: ev.title, text: ev.text, buttons });
  };

  U.showEnding = function () {
    const r = G().finalScore();
    const rows = r.parts.map(p => `<div class="srow"><span>${esc(p.name)}</span><div class="sbar"><div style="width:${p.v}%"></div></div><b>${p.v}</b></div>`).join('');
    U.modal({
      title: '🚪 Андрей {вернулся|вернулась}!',
      html: `<div class="rank">${esc(r.rank)}</div><div class="total">${r.total} / 100</div><p>${esc(r.text)}</p>${rows}`,
      buttons: [
        { label: 'Новая вахта (дом сохранится)', cls: 'primary', cb: () => { G().newShift(); HW.World.sync(S()); U.updateHUD(); U.toast('Андрей снова {уехал|уехала}. Поехали по новой!', 'info'); } },
        { label: 'Начать с нуля', cb: () => U.chooseDifficulty() },
      ],
    });
  };

  // Плохая концовка: Андрей сорвался с вахты
  U.showFailEnding = function () {
    const f = G().failInfo();
    HW.Audio.play('cry');
    U.modal({
      title: '🚨 Андрей {сорвался|сорвалась} с вахты!',
      html: `<div class="rank">Экстренное возвращение</div>
        <p>Три дня подряд дома творился ад. Андрей {бросил|бросила} вахту, {взял|взяла} три билета с пересадками и {приехал|приехала} на ${Math.max(1, HW.CFG.SHIFT_DAYS - f.days)} дн. раньше.</p>
        <p>{Открыл|Открыла} дверь. {Посмотрел|Посмотрела}. Молча {снял|сняла} куртку и {пошёл|пошла} варить суп. Бадди впервые за неделю поел нормально. Дети теперь говорят «{папа нас спас|мама нас спасла}».</p>
        <p><b>Вы продержались ${f.days} дн.</b> из ${HW.CFG.SHIFT_DAYS}.</p>
        ${f.reasons.length ? '<div class="line bad">В последний день: ' + f.reasons.map(esc).join(', ') + '</div>' : ''}
        <p class="sub">Совет: кормите детей хотя бы бутербродами, деньги берите подработкой на ноутбуке, а грязь не запускайте ниже 15%.</p>`.replace(/\n\s*/g, ''),
      buttons: [{ label: '🔄 Начать заново', cls: 'primary', cb: () => U.chooseDifficulty() }],
    });
  };

  // ---------- магазин ----------
  U.openShop = function (mode) {
    const cart = {};
    const render = () => {
      let total = mode === 'delivery' ? 400 : 0;
      HW.SHOP.forEach(it => total += (cart[it.id] || 0) * it.price);
      const h = S().house;

      const rows = HW.SHOP.map(it => `<div class="shoprow">
          <div class="si">${it.icon}</div>
          <div class="sn"><b>${esc(it.name)}</b> <small>${esc(it.unit)} · ${HW.fmtMoney(it.price)}</small><small>${esc(it.desc)} · дома: ${Math.floor(h[it.id] || 0)}</small></div>
          <div class="sq"><button data-id="${it.id}" data-d="-1">−</button><span>${cart[it.id] || 0}</span><button data-id="${it.id}" data-d="1">+</button></div>
        </div>`).join('');
      $('modalBody').innerHTML = rows + `<div class="shoptotal">Итого: <b>${HW.fmtMoney(total)}</b>${mode === 'delivery' ? ' (вкл. доставку 400 ₽)' : ''}<br><small>На счету: ${HW.fmtMoney(S().money)}</small></div>`;
      $('modalBody').querySelectorAll('.sq button').forEach(b => b.onclick = () => {
        const id = b.dataset.id;
        cart[id] = Math.max(0, Math.min(9, (cart[id] || 0) + Number(b.dataset.d)));
        render();
      });
    };
    U.modal({
      title: mode === 'delivery' ? '📱 Доставка продуктов' : '🛒 Супермаркет «У дома»',
      html: '',
      buttons: [
        { label: mode === 'delivery' ? 'Заказать' : 'Купить и вернуться', cls: 'primary', keep: true, cb: () => {
          const any = Object.values(cart).some(v => v > 0);
          if (!any) { U.toast('Корзина пуста. Добавьте хоть что-нибудь — хоть конфетку.', 'warn'); return; }
          if (G().cartTotal(cart, mode) > S().money) { U.toast('Не хватает денег. Карта сказала «ой». Уберите что-нибудь из корзины.', 'bad'); return; }
          U.closeModal();
          HW.Audio.play('coin');
          U.handleResult(G().buyGoods(cart, mode));
        } },
        { label: 'Отмена' },
      ],
    });
    render();
  };

  // ---------- телефон ----------
  let phoneTab = 'today';
  U.openPhone = function (tab) {
    if (tab) phoneTab = tab;
    if (HW.Tutorial) HW.Tutorial.event('phone');
    HW.Controls.setEnabled(false);
    $('phone').classList.remove('hidden');
    U.renderPhone();
  };
  U.closePhone = function () {
    $('phone').classList.add('hidden');
    if (!U.isBusy()) HW.Controls.setEnabled(true);
  };
  U.renderPhone = function () {
    document.querySelectorAll('#phoneTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === phoneTab));
    const c = $('phoneBody');
    const s = S();
    const bar = (label, v, extra) => `<div class="pbar"><span>${label}</span><div class="sbar"><div class="${v < 25 ? 'low' : v < 50 ? 'mid' : 'ok'}" style="width:${Math.round(v)}%"></div></div><b>${Math.round(v)}</b>${extra || ''}</div>`;
    if (phoneTab === 'today') {
      const { list, hints } = G().tasks();
      c.innerHTML = `<h3>${HW.WEEKDAYS[G().weekday()]}, ${HW.fmtTime(s.time)}</h3>` +
        `<div class="sub">${G().isSchoolDay() ? 'Школьный день' : 'Выходной'} · до возвращения Андрея ${Math.max(0, HW.CFG.SHIFT_DAYS - s.day + 1)} дн.</div>` +
        list.map(t => `<div class="task ${t.done ? 'done' : ''} ${t.urgent ? 'urgent' : ''}">${t.done ? '✅' : (t.urgent ? '🔥' : '⬜')} ${esc(t.text)}</div>`).join('') +
        (hints.length ? '<h4>Хозяйство</h4>' + hints.map(h => `<div class="hint">${esc(h)}</div>`).join('') : '<div class="hint ok">✨ По хозяйству всё под контролем. Подозрительно.</div>') +
        (list.every(t => t.done) ? '<div class="alldone">✅ Все обязательные дела на сегодня сделаны!</div>' : '') +
        '<h4>💡 Чем ещё заняться</h4><div class="ideas">' + G().ideas().slice(0, 5).map(i => `<div class="idea">${esc(i.text)}</div>`).join('') + '</div>';
    } else if (phoneTab === 'family') {
      const m = s.mom, mi = s.kids.misha, so = s.kids.sonya, d = s.dog;
      const where = k => k.at === 'school' ? '🏫 в школе' : k.at === 'garden' ? '🧸 в садике' : (k.asleep ? '😴 спит' : '🏠 дома');
      c.innerHTML = `<h3>{👩|👨} Анна (вы)</h3>` + bar('⚡ Энергия', m.energy) + bar('🙂 Настроение', m.mood) + bar('🍽️ Сытость', m.satiety) + bar('💪 Форма', m.fitness) + bar('🧠 Знания', m.knowledge) +
        `<h3>👦 Миша, 8 · ${where(mi)}</h3>` + bar('🍽️ Сытость', mi.satiety) + bar('🙂 Настроение', mi.mood) + bar('🛁 Чистота', mi.hygiene) + bar('📚 Оценки', mi.grades) +
        `<h3>👧 Соня, 4 · ${where(so)}${so.sick ? ' 🤧' : ''}</h3>` + bar('🍽️ Сытость', so.satiety) + bar('🙂 Настроение', so.mood) + bar('🛁 Чистота', so.hygiene) + bar('🧩 Развитие', so.dev) +
        `<h3>🐕 Бадди</h3>` + bar('🍽️ Сытость', d.satiety) + bar('🙂 Настроение', d.mood) + bar('🚽 Хочет гулять', d.need);
    } else if (phoneTab === 'house') {
      const h = s.house;
      c.innerHTML = `<h3>🧹 Чистота — ${Math.round(G().cleanAvg())}%</h3>` +
        HW.ROOM_IDS.map(r => bar(HW.ROOMS[r].name, h.clean[r])).join('') +
        `<h3>📦 Запасы</h3>
        <div class="kv"><span>🥕 Продукты</span><b>${Math.floor(h.groceries)}</b></div>
        <div class="kv"><span>🍲 Готовая еда</span><b>${h.portions} порц.</b></div>
        <div class="kv"><span>🦴 Корм Бадди</span><b>${Math.floor(h.dogFood)}</b></div>
        <div class="kv"><span>🧴 Бытовая химия</span><b>${Math.floor(h.chem)}</b></div>
        <div class="kv"><span>🍬 Сладости</span><b>${h.sweets}</b></div>
        <div class="kv"><span>👕 Чистая одежда</span><b>${h.laundryClean} компл.</b></div>
        <div class="kv"><span>🧺 Грязное бельё</span><b>${h.laundryDirty} компл.</b></div>
        <div class="kv"><span>🍽️ Грязная посуда</span><b>${h.dishes}</b></div>
        <div class="kv"><span>🏠 Обставлено</span><b>${G().furnishedPct()}%</b></div>`;
    } else if (phoneTab === 'shop') {
      const sale = s.today.sale;
      let html = `<h3>🛋️ МебельМаркет${sale ? ' <span class="sale">−20%</span>' : ''}</h3><div class="sub">На счету: ${HW.fmtMoney(s.money)}. Доставка и сборка — мгновенно (это же игра).</div>`;
      Object.keys(HW.ROOMS).forEach(rid => {
        const items = HW.FURNITURE.filter(f => f.room === rid);
        if (!items.length) return;
        html += `<h4>${HW.ROOMS[rid].name}</h4>`;
        items.forEach(f => {
          const own = s.owned[f.id];
          const p = G().price(f.id);
          html += `<div class="fcard ${own ? 'own' : ''}"><div class="fi">${f.icon}</div><div class="fn"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div>` +
            (own ? '<div class="fp owned">✓ Есть</div>' : `<button class="fp" data-buy="${f.id}" ${s.money < p ? 'data-poor="1"' : ''}>${HW.fmtMoney(p)}</button>`) + '</div>';
        });
      });
      c.innerHTML = html;
      c.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        const f = HW.furnById[b.dataset.buy];
        U.modal({ title: 'Купить?', text: `${f.icon} ${f.name} за ${HW.fmtMoney(G().price(f.id))}?`, buttons: [
          { label: 'Купить', cls: 'primary', cb: () => {
            const r = G().buyFurniture(f.id);
            HW.Audio.play('coin');
            if (r) r.msgs.forEach(m => U.toast(m.text, m.type, m.snd));
            HW.World.sync(S()); U.updateHUD(); U.renderPhone();
            HW.Controls.setEnabled(false);
          } },
          { label: 'Не сейчас', cb: () => HW.Controls.setEnabled(false) },
        ] });
      });
    } else if (phoneTab === 'hobby') {
      if (HW.Tutorial) HW.Tutorial.event('hobbyTab');
      const list = G().projects();
      let html = '<h3>🎨 Хобби и проекты</h3><div class="sub">Не только посуда и уроки! Проекты делаются по сеансу-два в день и дают настроение, уют и награды. Стрелка-навигатор подскажет, куда идти, когда дел нет.</div>';
      const CATS = { self: '💆‍♀️ Для себя', kids: '👧 С детьми', home: '🏡 Для дома' };
      list.sort((a, b) => Object.keys(CATS).indexOf(a.cat) - Object.keys(CATS).indexOf(b.cat) || (b.state === 'active') - (a.state === 'active'));
      let lastCat = null;
      list.forEach(p => {
        if (p.cat !== lastCat) { lastCat = p.cat; html += `<h4>${CATS[p.cat] || ''}</h4>`; }
        const prog = Array.from({ length: p.need }, (_, i) => `<i class="${i < p.n ? 'on' : ''}"></i>`).join('');
        let body = '';
        if (p.state === 'active') {
          const where = p.id === 'wallpaper' ? `${HW.ROOMS[p.room].name} · «${HW.wallpaperById[p.style].name}»` : (U.NAMES[p.where] || '');
          body = `<div class="hprog">${prog}</div><div class="hst">${p.n}/${p.need} · сегодня можно ещё ${p.todayLeft} · где: ${esc(where)}</div>`;
        } else if (p.state === 'failed') {
          body = '<div class="hst">🥀 Засох. Подойдите к горшку на кухне, чтобы выбросить и начать заново.</div>';
        } else if (p.state === 'done') {
          body = '<div class="hst">✅ Готово!</div>';
        } else {
          const priceTxt = p.id === 'wallpaper' ? 'от 3 000 ₽' : (p.cost ? HW.fmtMoney(p.cost) : 'бесплатно');
          body = `${p.done ? `<div class="hst">Сделано раз: ${p.done}</div>` : ''}<button class="btn primary" data-start="${p.id}">Начать · ${priceTxt}</button>`;
        }
        html += `<div class="hcard ${p.state}"><div class="hhead"><span class="hi">${p.icon}</span><b>${esc(p.name)}</b></div>
          <p>${esc(p.desc)}</p><div class="hrw">🎁 ${esc(p.reward)}</div>${body}</div>`;
      });
      // мечты: крупные покупки
      const dreams = ['sofa', 'washer', 'bed', 'tv', 'fireplace', 'aquarium', 'dishwasher', 'dryer', 'coffeeMachine', 'bunkBed', 'robot'].filter(id => !s.owned[id]).slice(0, 4);
      if (dreams.length) {
        html += '<h3>✨ Мечты</h3><div class="sub">Копилка на большие покупки. Подработка на ноутбуке приближает мечту.</div>';
        dreams.forEach(id => {
          const f = HW.furnById[id], price = G().price(id), pct = Math.min(100, Math.round(Math.max(0, s.money) / price * 100));
          html += `<div class="dream"><div class="di">${f.icon}</div><div><b>${esc(f.name)}</b><small>${esc(f.desc)}</small>
            <div class="sbar" style="margin-top:5px"><div class="${pct >= 100 ? 'ok' : 'mid'}" style="width:${pct}%"></div></div><small>${HW.fmtMoney(Math.max(0, s.money))} из ${HW.fmtMoney(price)}</small></div>
            ${pct >= 100 ? `<button class="fp" data-dream="${id}">Купить</button>` : '<span></span>'}</div>`;
        });
      }
      c.innerHTML = html.replace(/\n\s*/g, '');
      c.querySelectorAll('[data-start]').forEach(b => b.onclick = () => {
        const id = b.dataset.start;
        if (id === 'wallpaper') return U.chooseWallpaper();
        const p = list.find(x => x.id === id);
        U.modal({ title: p.icon + ' ' + p.name, text: p.desc + '\n\nМатериалы: ' + (p.cost ? HW.fmtMoney(p.cost) : 'бесплатно'), buttons: [
          { label: 'Начать', cls: 'primary', cb: () => { const r = G().startProject(id); U.toast(r.msg, r.ok ? 'good' : 'bad', r.ok ? 'coin' : null); HW.World.sync(S()); U.updateHUD(); U.renderPhone(); HW.Controls.setEnabled(false); } },
          { label: 'Потом', cb: () => HW.Controls.setEnabled(false) },
        ] });
      });
      c.querySelectorAll('[data-dream]').forEach(b => b.onclick = () => {
        const r = G().buyFurniture(b.dataset.dream);
        HW.Audio.play('coin');
        if (r) r.msgs.forEach(m => U.toast(m.text, m.type, m.snd));
        HW.World.sync(S()); U.updateHUD(); U.renderPhone();
      });
    } else if (phoneTab === 'log') {
      const ach = G().achievements();
      c.innerHTML = `<h3>🏆 Достижения (${ach.filter(a => a.got).length}/${ach.length})</h3>` +
        ach.map(a => `<div class="ach ${a.got ? 'got' : ''}"><span>${a.got ? a.icon : '🔒'}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`).join('') +
        '<h3>📜 Журнал</h3>' + s.log.map(l => `<div class="log">${esc(l)}</div>`).join('');
    } else if (phoneTab === 'settings') {
      const st = HW.settings;
      c.innerHTML = `<h3>⚙️ Настройки</h3>
        <label class="set chk"><input type="checkbox" id="sFP" ${st.view === 'fp' ? 'checked' : ''}> Вид от первого лица (вместо вида сверху)</label>
        <label class="set">Чувствительность обзора <input type="range" id="sSens" min="0.4" max="2.5" step="0.1" value="${st.sens}"></label>
        <label class="set">Качество графики <select id="sQual"><option value="1">Экономное</option><option value="1.5">Среднее</option><option value="2">Высокое</option></select></label>
        <label class="set chk"><input type="checkbox" id="sInv" ${st.invert ? 'checked' : ''}> Инвертировать вертикаль (от первого лица)</label>
        <label class="set chk"><input type="checkbox" id="sSnd" ${st.sound ? 'checked' : ''}> Звуки</label>
        <label class="set chk"><input type="checkbox" id="sGuide" ${st.guide !== false ? 'checked' : ''}> Стрелка-навигатор к задачам</label>
        <label class="set">Скорость часов <select id="sClock"><option value="0" ${s.diff === 'easy' ? '' : 'disabled'}>Стоят (только на «Лёгкой»)</option><option value="0.5">Медленно (½ мин/сек)</option><option value="1">Обычно (1 мин/сек)</option><option value="2">Быстро (2 мин/сек)</option></select></label>
        <div class="sub">Сложность: ${(HW.DIFF[s.diff] || HW.DIFF.normal).icon} ${(HW.DIFF[s.diff] || HW.DIFF.normal).name} (меняется только в новой игре)</div>
        <button class="btn wide" id="sHelp">❓ Как играть</button>
        <button class="btn wide" id="sSave">💾 Сохранить сейчас</button>
        <button class="btn wide danger" id="sNew">🗑️ Начать заново</button>
        <div class="sub">Игра сохраняется автоматически после каждого действия.</div>`;
      $('sQual').value = String(st.quality);
      $('sClock').value = String(st.clock === undefined ? 1 : (st.clock === 0 && s.diff !== 'easy' ? 0.5 : st.clock));
      $('sClock').onchange = e => { st.clock = Number(e.target.value); HW.Main.saveSettings(); };
      $('sSens').oninput = e => { st.sens = Number(e.target.value); HW.Main.saveSettings(); };
      $('sQual').onchange = e => { st.quality = Number(e.target.value); HW.Main.saveSettings(); HW.World.setQuality(st.quality); };
      $('sFP').onchange = e => { HW.Main.setView(e.target.checked ? 'fp' : 'top'); HW.Main.saveSettings(); U.renderPhone(); };
      $('sInv').onchange = e => { st.invert = e.target.checked; HW.Main.saveSettings(); };
      $('sGuide').onchange = e => { st.guide = e.target.checked; HW.Main.saveSettings(); U.updateHUD(); };
      $('sSnd').onchange = e => { st.sound = e.target.checked; HW.Main.saveSettings(); if (st.sound) { HW.Audio.unlock(); HW.Audio.play('chime'); } };
      $('sHelp').onclick = () => U.showHelp(true);
      $('sSave').onclick = () => { HW.Main.storePlayer(); G().save(); U.toast('💾 Сохранено. Ваши страдания задокументированы.', 'good'); };
      $('sNew').onclick = () => U.modal({ title: 'Начать заново?', text: 'Весь прогресс будет удалён. Андрей не узнает.', buttons: [
        { label: 'Да, заново', cls: 'danger', cb: () => { U.closePhone(); U.chooseDifficulty(); } },
        { label: 'Отмена', cb: () => HW.Controls.setEnabled(false) },
      ] });
    }
  };

  // Выбор комнаты и обоев для проекта «Поклеить обои»
  U.chooseWallpaper = function () {
    const rooms = HW.ROOM_IDS;
    U.modal({ title: '🖼️ Какую комнату обновим?', html: '<div class="roomgrid">' + rooms.map(r => `<button class="btn" data-room="${r}">${esc(HW.ROOMS[r].name)}${S().walls[r] ? ' ✓' : ''}</button>`).join('') + '</div>',
      buttons: [{ label: 'Отмена', cb: () => HW.Controls.setEnabled(false) }] });
    $('modalBody').querySelectorAll('[data-room]').forEach(b => b.onclick = () => {
      const room = b.dataset.room;
      U.closeModal();
      const imgs = {};
      HW.WALLPAPERS.forEach(w => { const t = HW.World.wallpaperTex(w); imgs[w.id] = t.image.toDataURL(); t.dispose(); });
      U.modal({ title: '🖼️ Обои для: ' + HW.ROOMS[room].name, html: '<div class="wpgrid">' + HW.WALLPAPERS.map(w =>
        `<button class="wpopt ${S().money < w.price ? 'poor' : ''}" data-wp="${w.id}"><img src="${imgs[w.id]}" alt=""><span>${esc(w.name)}<small>${HW.fmtMoney(w.price)}</small></span></button>`).join('') + '</div>',
        buttons: [{ label: 'Отмена', cb: () => HW.Controls.setEnabled(false) }] });
      $('modalBody').querySelectorAll('[data-wp]').forEach(btn => btn.onclick = () => {
        const r = G().startProject('wallpaper', { room, style: btn.dataset.wp });
        if (!r.ok) { U.toast(r.msg, 'bad'); return; }
        U.closeModal();
        U.toast(r.msg, 'good', 'coin');
        HW.World.sync(S()); U.updateHUD(); U.renderPhone(); HW.Controls.setEnabled(false);
      });
    });
  };

  U.showHelp = function (fromPhone) {
    U.modal({ title: '❓ Как играть', html: `
      ${HW.settings.view === 'fp' ? `
      <p><b>Ходить:</b> левая половина экрана — джойстик. На ПК — WASD или стрелки вверх/вниз (стрелки влево/вправо поворачивают).</p>
      <p><b>Смотреть:</b> водите пальцем по правой части экрана (мышью — зажать и тянуть).</p>
      <p><b>Действовать:</b> наведите прицел на предмет и нажмите кнопку справа внизу или просто тапните по предмету. На ПК — E/пробел.</p>` : `
      <p><b>Ходить:</b> тап (клик) по полу — Анна {пойдёт туда сама|пойдёт туда сам}. Ещё можно джойстиком на левой половине экрана или WASD/стрелками.</p>
      <p><b>Камера:</b> тяните пальцем (мышью) — поворот и наклон, щипок или колесо мыши — приблизить. На ПК поворот ещё клавишами Q/R.</p>
      <p><b>Действовать:</b> тапните по предмету, человеку или игрушке — Анна подойдёт и откроет действия. Рядом с предметом есть кнопка «Действие» справа внизу (на ПК — E/пробел).</p>`}
      <p><b>👁 Вид от первого лица</b> включается в 📱 → Опции.</p>
      <p><b>📍 Кнопка комнаты</b> внизу — уборка той комнаты, где вы стоите.</p>
      <p><b>📱 Телефон</b> — задачи на день, состояние семьи, запасы и магазин мебели.</p>
      <p><b>🚪 Входная дверь</b> — школа, садик, магазин, фитнес и прогулки с Бадди.</p>
      <p><b>⏱ Время</b> идёт само (1 сек = 1 игровая минута), пока вы ходите, и перематывается, когда вы что-то делаете. В меню часы стоят. Скорость меняется в настройках.</p>
      <p><b>🚨 Происшествия</b> случаются днём: у вас 10–15 минут, красный «!» показывает, куда бежать. <b>Плита и стиралка</b> работают в фоне — снимайте и развешивайте вовремя. Значки над детьми — их желания.</p>
      <p><b>🎨 Хобби</b> (📱 → Хобби): 15 проектов — йога, гитара, забег, блог, картины, плед, книга; пазл и костюм принцессы с детьми; цветок, зелень, обои, фотоальбом, дрессировка Бадди, фирменный пирог. По сеансу-два в день — для души, уюта и наград. Там же «Мечты» — копилка на большие покупки.</p>
      <p><b>⭐ Оценка дня</b> — до 3 звёзд. Серия идеальных дней даёт бонус к настроению. Особые дни: {свекровь|тёща}, собрание, день рождения Сони…</p>
      <p><b>Расписание:</b> школа 8:30–13:30 (забрать до 15:00), садик до 18:30 (привезти к 9:00). Детей уложить до 21:30. Бадди гулять 2 раза в день.</p>
      <p><b>Цель:</b> продержаться ${HW.CFG.SHIFT_DAYS} дней до возвращения Андрея, обставить дом и сохранить рассудок.</p>`,
      buttons: [{ label: 'Понятно!', cls: 'primary', cb: () => { if (fromPhone) HW.Controls.setEnabled(false); } }] });
  };

  U.chooseDifficulty = function () {
    U.modal({
      title: 'Выберите сложность',
      html: Object.keys(HW.DIFF).map(k => { const d = HW.DIFF[k]; return `<div class="line info"><b>${d.icon} ${esc(d.name)}</b> — ${esc(d.desc)}. Зарплата супруга ${HW.fmtMoney(d.salary)}.</div>`; }).join(''),
      buttons: Object.keys(HW.DIFF).map(k => ({ label: HW.DIFF[k].icon + ' ' + HW.DIFF[k].name, cls: k === 'normal' ? 'primary' : '', cb: () => U.chooseHeroes(k) }))
        .concat([{ label: 'Отмена', cb: () => { if (!HW.Main.isRunning()) HW.Controls.setEnabled(false); } }]),
    });
  };

  // ---------- новая игра: за кого играть и как всех зовут ----------
  U.chooseHeroes = function (diff) {
    let hero = 'wife';
    const fields = [['me', 'Ваше имя'], ['spouse', ''], ['son', 'Сын (8 лет, школа)'], ['daughter', 'Дочь (4 года, садик)'], ['dog', 'Собака']];
    const html = `<div class="heroPick">
        <button class="btn heroBtn on" data-hero="wife">👩 Играю за жену<small>муж уехал на вахту</small></button>
        <button class="btn heroBtn" data-hero="husband">👨 Играю за мужа<small>жена уехала на вахту</small></button>
      </div>
      <div class="nameGrid">${fields.map(([k, l]) => `<label class="nameRow"><span id="lbl_${k}">${l}</span><input id="nm_${k}" maxlength="14" autocomplete="off"></label>`).join('')}</div>
      <button class="btn wide" id="nmRandom">🎲 Случайные имена</button>`;
    const fill = (names) => fields.forEach(([k]) => { $('nm_' + k).value = names[k]; });
    const setHero = (h) => {
      const prev = HW.NAME_DEFAULTS[hero], cur = {};
      fields.forEach(([k]) => { cur[k] = $('nm_' + k).value.trim(); });
      hero = h;
      document.querySelectorAll('.heroBtn').forEach(b => b.classList.toggle('on', b.dataset.hero === h));
      $('lbl_spouse').textContent = h === 'wife' ? 'Муж (на вахте)' : 'Жена (на вахте)';
      // имена, которые игрок не менял, подставляем под новую роль
      const def = HW.NAME_DEFAULTS[h];
      fields.forEach(([k]) => { if (!cur[k] || cur[k] === prev[k]) $('nm_' + k).value = def[k]; });
      if (cur.me === prev.me && cur.spouse === prev.spouse) { $('nm_me').value = def.me; $('nm_spouse').value = def.spouse; }
    };
    U.modal({
      title: 'Кто вы и как зовут семью?', html,
      buttons: [
        { label: 'Начать игру', cls: 'primary', keep: true, cb: () => {
          const def = HW.NAME_DEFAULTS[hero], names = {};
          fields.forEach(([k]) => { names[k] = HW.cleanName($('nm_' + k).value, def[k]); });
          U.closeModal();
          HW.Main.startNew(diff, { hero, names });
        } },
        { label: 'Назад', cb: () => U.chooseDifficulty() },
      ],
    });
    fill(HW.NAME_DEFAULTS.wife);
    $('lbl_spouse').textContent = 'Муж (на вахте)';
    document.querySelectorAll('.heroBtn').forEach(b => b.onclick = () => setHero(b.dataset.hero));
    $('nmRandom').onclick = () => {
      const P = HW.NAME_POOL, r = a => a[Math.floor(Math.random() * a.length)];
      fill({ me: r(hero === 'wife' ? P.f : P.m), spouse: r(hero === 'wife' ? P.m : P.f), son: r(P.son), daughter: r(P.daughter), dog: r(P.dog) });
    };
  };

  U.init = function () {
    $('sheetClose').onclick = U.closeSheet;
    $('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') U.closeSheet(); });
    $('phoneBtn').onclick = () => U.openPhone();
    $('phoneClose').onclick = U.closePhone;
    document.querySelectorAll('#phoneTabs button').forEach(b => b.onclick = () => { phoneTab = b.dataset.tab; U.renderPhone(); });
    $('roomBtn').onclick = () => U.openSheet(G().roomSheet($('roomBtn').dataset.room || 'hall'));
    $('promptBtn').onclick = () => HW.Main.interact();
    $('nNext').onclick = nightNext;
    $('nSkip').onclick = () => nightState && nightGo(nightState.count - 1);
    $('nTrack').addEventListener('scroll', nightUpdate, { passive: true });
    window.addEventListener('keydown', e => {
      if (!nightState) return;
      if (e.code === 'ArrowRight' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); nightNext(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); nightGo(Math.max(0, nightIdx() - 1)); }
    });
    window.addEventListener('resize', () => { if (nightState) nightGo(nightState.idx); });
    $('incident').onclick = () => {
      const inc = G().incident();
      if (!inc) return;
      if (inc.remote) U.openSheet(G().incidentSheet());
      else U.toast('🚨 ' + inc.title + ' Красный «!» показывает, куда бежать — он виден сквозь стены.', 'warn');
    };
  };

  // ---------- выбранные имена и род героя во всём, что видит игрок ----------
  (function wrapFix() {
    const wrap = (name, after) => { const f = U[name]; U[name] = function () { const r = f.apply(this, arguments); after.apply(this, arguments); return r; }; };
    const t0 = U.toast;
    U.toast = function (text, type, snd) { return t0.call(this, HW.fix(text), type, snd); };
    wrap('openSheet', () => HW.fixDom($('sheet')));
    wrap('modal', () => HW.fixDom($('modal')));
    wrap('showNight', () => HW.fixDom($('night')));
    wrap('renderPhone', () => HW.fixDom($('phoneBody')));
    wrap('updateHUD', () => { HW.fixDom($('hud')); });
    wrap('setPrompt', () => HW.fixDom($('prompt')));
    let lastWhat = '', lastWhere = '';
    wrap('updateGuide', () => {
      const w = $('gWhat'), h = $('gWhere');
      if (w.textContent !== lastWhat) { w.textContent = HW.fix(w.textContent); lastWhat = w.textContent; }
      if (h.textContent !== lastWhere) { h.textContent = HW.fix(h.textContent); lastWhere = h.textContent; }
    });
  })();
})();
