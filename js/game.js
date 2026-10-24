// Игровая логика: состояние, время, действия, события, итоги дня, сохранение.
(function () {
  const G = {};
  HW.Game = G;
  const CFG = HW.CFG;
  const clamp = HW.clamp;
  let S = null;
  let msgs = [];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const note = (text, type, snd) => {
    if (msgs.some(m => m.text === text)) return; // одно и то же сообщение — один раз за действие
    msgs.push({ text, type: type || 'info', snd });
  };
  G.note = note;
  // Фраза из HW.TEXTS без повтора последних вариантов; {room}, {n} — подстановки
  const recent = {};
  function say(key, vars) {
    const arr = (HW.TEXTS && HW.TEXTS[key]) || [''];
    const last = recent[key] || [];
    const pool = arr.map((_, i) => i).filter(i => !last.includes(i));
    const idx = pick(pool.length ? pool : arr.map((_, i) => i));
    recent[key] = last.concat(idx).slice(-Math.min(3, arr.length - 1));
    let t = arr[idx];
    if (vars) for (const k in vars) t = t.split('{' + k + '}').join(vars[k]);
    return t;
  }
  G.say = say;

  // ---------- состояние ----------
  const diffK = () => (HW.DIFF[S && S.diff] || HW.DIFF.normal);
  function freshState(diff) {
    const D = HW.DIFF[diff] || HW.DIFF.normal;
    const clean = {};
    HW.ROOM_IDS.forEach(r => clean[r] = 55);
    return {
      v: 1, diff: diff || 'normal', shift: 1, day: 1, time: 9 * 60, money: D.money,
      mom: { energy: 85, mood: 65, satiety: 70, fitness: 30, knowledge: 20 },
      kids: {
        misha: { name: 'Миша', at: 'home', asleep: false, ready: false, satiety: 70, mood: 70, hygiene: 70, grades: 60, sick: false, wish: null, wishAt: 0 },
        sonya: { name: 'Соня', at: 'home', asleep: false, ready: false, satiety: 70, mood: 75, hygiene: 70, dev: 30, sick: false, wish: null, wishAt: 0 },
      },
      dog: { satiety: 60, mood: 70, need: 35, out: false },
      house: {
        clean, dishes: 3, laundryDirty: 4, laundryClean: 5, groceries: 6, portions: 0,
        dogFood: 4, chem: 3, sweets: 0, cookedDay: 1, washer: { state: 'idle', doneAt: 0, sets: 0, moldAt: 0 }, toys: [],
        stove: { state: 'idle', doneAt: 0, burnAt: 0 }, mc: { state: 'idle', doneAt: 0 }, cake: 0, decor: 0,
      },
      owned: {},
      flags: {},
      today: { event: null, sale: false, craft: false, boss: null },
      incident: null,
      streak: 0, bestStreak: 0,
      crisis: 0, failed: false,
      proj: {}, projDone: {}, paintings: [], walls: {},
      tut: { step: 0, done: false },
      hero: 'wife',                                   // за кого играем: 'wife' | 'husband'
      names: Object.assign({}, HW.NAME_DEFAULTS.wife),
      pending: [],
      nextId: 1,
      stats: { days: 0, clean: 0, kidsMood: 0, momMood: 0, dogMood: 0, late: 0, missed: 0, accidents: 0, homework: 0 },
      log: [],
      life: { walks: 0, earned: 0, faints: 0, accidents: 0 },
      ach: {},
      player: { x: 7.5, z: 1.4, yaw: Math.PI, pitch: 0 },
      ended: false,
    };
  }
  function resetFlags() {
    S.flags = { gathered: false, delivered: false, mishaPicked: false, sonyaPicked: false, homework: false,
      kidsBed: false, kidsBedLate: false, breakfast: false, lunch: false, dinner: false, dogFed: 0, dogWalks: 0,
      called: false, accident: false, nagAt: 0, earned: 0, spent: 0, clean0: S ? cleanAvg() : 55,
      rests: 0, naps: 0, series: 0, incOk: 0, incFailed: 0, green: 0, cake: false, decorated: false, meeting: false, bossDone: false };
  }

  G.state = () => S;
  G.dogAway = () => !!(S && S.incident && S.incident.id === 'dogRun');
  G.tutorialActive = () => !!(S && S.tut && !S.tut.done);
  G.finishTutorial = function () { if (S.tut) S.tut.done = true; G.save(); };

  // opts: {hero: 'wife'|'husband', names: {me, spouse, son, daughter, dog}}
  G.newGame = function (diff, opts) {
    S = freshState(diff);
    if (opts && opts.hero) S.hero = opts.hero === 'husband' ? 'husband' : 'wife';
    S.names = Object.assign({}, HW.NAME_DEFAULTS[S.hero], (opts && opts.names) || {});
    resetFlags();
    HW.S = S;
    addLog(`Переезд! Коробки, эхо в пустых комнатах и ${CFG.SHIFT_DAYS} дней до возвращения Андрея.`);
    G.save();
  };
  G.demoState = function () {
    const s = freshState();
    s.owned = { sofa: true, rugLiving: true, coffeeTable: true, plantLiving: true, tv: true, bookshelf: true, treadmill: true };
    s.time = 12 * 60;
    HW.ROOM_IDS.forEach(r => s.house.clean[r] = 100);
    return s;
  };
  G.hasSave = function () {
    try { return !!localStorage.getItem(CFG.SAVE_KEY); } catch (e) { return false; }
  };
  G.load = function () {
    try {
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return false;
      S = Object.assign(freshState(data.diff), data);
      migrate(data);
      HW.S = S;
      return true;
    } catch (e) { return false; }
  };
  // старые сохранения: дополнить вложенные поля
  function migrate(data) {
    const f = freshState(S.diff);
    for (const k in f.house) if (S.house[k] === undefined) S.house[k] = f.house[k];
    if (S.house.washer.moldAt === undefined) S.house.washer.moldAt = 0;
    ['misha', 'sonya'].forEach(id => { if (S.kids[id].wish === undefined) { S.kids[id].wish = null; S.kids[id].wishAt = 0; } });
    if (!S.today.boss) S.today.boss = null;
    for (const k in f.life) if (S.life[k] === undefined) S.life[k] = f.life[k];
    ['proj', 'projDone', 'walls'].forEach(k => { if (!S[k]) S[k] = {}; });
    if (!data.tut) S.tut = { step: 0, done: true };
    if (!data.hero) S.hero = 'wife';
    if (!data.names) S.names = Object.assign({}, HW.NAME_DEFAULTS[S.hero]);   // в старых сохранениях обучение уже не нужно
    if (!S.paintings) S.paintings = [];
    S.house.chem = Math.round(S.house.chem || 0);   // в старых сохранениях химия бывала дробной
  }

  G.save = function () {
    if (!S) return;
    try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ }
  };
  G.wipe = function () { try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) { } };

  function addLog(t) {
    S.log.unshift('Д' + S.day + ' ' + HW.fmtTime(S.time) + ' — ' + t);
    if (S.log.length > 80) S.log.length = 80;
  }
  G.addLog = addLog;

  // ---------- календарь ----------
  const wd = d => (d - 1 + 6) % 7;            // день 1 — воскресенье
  const schoolDay = d => wd(d) < 5;
  G.weekday = () => wd(S.day);
  G.isSchoolDay = () => schoolDay(S.day);
  // карантин (ветрянка): Миша дома, уроков не задают — ни в эти дни, ни накануне
  const quarantine = d => BOSS[d] === 'pox';
  G.quarantine = () => quarantine(S.day);
  // больному (ветрянка или простуда) уроков не задают; проверка в момент вызова — видит и утреннюю болезнь
  G.homeworkDue = () => schoolDay(S.day + 1) && !quarantine(S.day) && !quarantine(S.day + 1) && !S.kids.misha.sick;
  const abs = () => S.day * 1440 + S.time;

  const kidsHome = () => ['misha', 'sonya'].filter(k => S.kids[k].at === 'home');
  const kidsAwakeHome = () => kidsHome().filter(k => !S.kids[k].asleep);
  const ownedCount = () => Object.keys(S.owned).filter(k => S.owned[k]).length;
  // уют: мебель + картины + обои + цветок + плед
  const comfortScore = () => ownedCount() + (S.paintings || []).length + Object.keys(S.walls || {}).length
    + ['flower', 'knit', 'album', 'puzzle', 'herbs'].filter(k => (S.projDone || {})[k]).length;
  G.comfort = comfortScore;
  const cleanAvg = () => HW.ROOM_IDS.reduce((a, r) => a + S.house.clean[r], 0) / HW.ROOM_IDS.length;
  G.cleanAvg = cleanAvg;
  G.furnishedPct = () => Math.round(ownedCount() / HW.FURNITURE.length * 100);
  G.price = id => Math.round(HW.furnById[id].price * (S.today.sale ? 0.8 : 1));

  // каждая неделя немного сложнее: быстрее голод/грязь, чаще события
  const week = () => Math.floor((S.day - 1) / 7);
  const ramp = () => 1 + week() * 0.06;
  G.week = () => week() + 1;

  // ---------- течение времени ----------
  function crossed(prev, now, mark) { return prev < mark && now >= mark; }

  function tick(dt) {
    const h = dt / 60, m = S.mom, H = S.house, d = S.dog;
    const k = diffK().decay * ramp(), hk = h * k;
    const prev = S.time;
    S.time += dt;
    const now = S.time;

    m.energy -= 2.2 * hk;
    m.satiety -= 5 * hk;
    const comfort = comfortScore();
    let target = 45 + comfort * 1.3 + (cleanAvg() - 50) * 0.5;
    if (m.energy < 25) target -= 15;
    if (m.satiety < 25) target -= 10;
    m.mood += (target - m.mood) * 0.07 * h;

    ['misha', 'sonya'].forEach(id => {
      const k = S.kids[id];
      if (k.at !== 'home') { k.satiety -= 1.5 * h; return; }
      if (k.asleep) { k.satiety -= 1 * h; return; }
      k.satiety -= 6 * hk;
      k.hygiene -= 2.5 * hk;
      let kt = 55 + comfort * 0.8;
      if (k.satiety < 30) kt -= 20;
      if (k.hygiene < 30) kt -= 10;
      if (k.sick) kt -= 10;
      if (S.owned.aquarium) kt += 5;           // рыбки!
      if (S.owned.playTent) kt += 4;           // вигвам
      if (cleanAvg() < 35) kt -= 10;           // в грязи детям тоскливо
      if (k.wish && abs() - k.wishAt > 60) kt -= 8;
      k.mood += (kt - k.mood) * 0.06 * h;
      // дети мусорят
      H.clean.kids -= 1.2 * h;
      H.clean.living -= 0.8 * h;
    });
    HW.ROOM_IDS.forEach(r => H.clean[r] -= 0.25 * hk);

    if (!d.out) {
      d.satiety -= 3.5 * hk;
      d.need += 7 * hk;
      let dt2 = 60 + (S.owned.dogBed ? 10 : 0);
      if (d.need > 70) dt2 -= 20;
      if (d.satiety < 30) dt2 -= 20;
      d.mood += (dt2 - d.mood) * 0.1 * h;
      if (d.need >= 100) {
        d.need = 30;
        H.clean.hall -= 35;
        d.mood -= 5;
        m.mood -= 8;
        S.flags.accident = true;
        S.stats.accidents++;
        S.life.accidents++;
        note(pick([
          '🐕💩 Бадди не дождался прогулки и навалил кучу в прихожей. Сегодня ночует в приюте! (Шутка. Но он этого не знает.)',
          '🐕💦 Бадди сделал лужу в прихожей и смотрит так, будто это вы.',
          '🐕💩 В прихожей сюрприз от Бадди. Ароматный. Тёплый. Ваш.',
        ]), 'bad', 'bark');
        addLog('Бадди нагадил дома');
      }
    }

    // ежечасные события
    if (Math.floor(prev / 60) !== Math.floor(now / 60)) hourly();

    // утро: дети встают сами
    const wakeMark = schoolDay(S.day) ? 9 * 60 + 30 : 8 * 60 + 30;
    if (crossed(prev, now, wakeMark)) {
      kidsHome().forEach(id => {
        if (S.kids[id].asleep) { S.kids[id].asleep = false; }
      });
      if (!schoolDay(S.day)) dressKids(false);
    }
    // школа/сад: прогул
    if (schoolDay(S.day) && crossed(prev, now, 10 * 60) && !S.flags.delivered) {
      const missed = ['misha', 'sonya'].filter(id => S.kids[id].at === 'home' && !S.kids[id].sick);
      if (missed.length) {
        S.flags.delivered = true;
        S.flags.missedSchool = true;
        S.stats.missed++;
        if (missed.includes('misha')) S.kids.misha.grades -= 5;
        if (missed.includes('sonya')) S.kids.sonya.dev -= 2;
        note('🏫 Дети прогуляли школу и сад. Миша счастлив, Соня тоже, классная руководительница пишет вам в мессенджер капслоком.', 'bad');
        addLog('Прогул школы и сада');
      }
    }
    if (crossed(prev, now, 15 * 60) && S.kids.misha.at === 'school') {
      S.kids.misha.at = 'home';
      S.kids.misha.mood -= 15;
      S.flags.mishaPicked = true;
      m.mood -= 5;
      note('👩‍🏫 Мишу привела учительница. Сказала «мы вас ждали» таким тоном, что захотелось сдать ЕГЭ повторно.', 'bad');
      addLog('Мишу не забрали вовремя');
    }
    if (crossed(prev, now, 18 * 60 + 30) && S.kids.sonya.at === 'garden') {
      S.kids.sonya.at = 'home';
      S.kids.sonya.mood -= 20;
      S.flags.sonyaPicked = true;
      m.mood -= 5;
      note('🧸 Соню привела воспитательница. Соня рада, воспитательница — нет. Минус в карму.', 'bad');
      addLog('Соню не забрали вовремя');
    }
    // дети засыпают сами
    if (crossed(prev, now, 22 * 60 + 30)) {
      const awake = kidsAwakeHome();
      if (awake.length) {
        awake.forEach(id => { S.kids[id].asleep = true; });
        S.flags.kidsBedLate = true;
        note('😴 Дети уснули сами: Миша — на полу, Соня — в обнимку с собакой. Режим дня? Не, не слышали.', 'bad');
      }
    }
    // стиралка
    if (H.washer.state === 'running' && abs() >= H.washer.doneAt) {
      if (S.owned.dryer) {
        H.laundryClean += H.washer.sets; H.washer.state = 'idle'; H.washer.sets = 0; H.washer.moldAt = 0;
        note('♨️ Стирка и сушка закончились — бельё сухое и тёплое. Развешивать не нужно. Технологии!', 'good', 'beep');
      } else {
        H.washer.state = 'done';
        H.washer.moldAt = abs() + 120;
        note('🧺 Стирка закончилась. Развесьте в течение 2 часов, иначе бельё затхнет.', 'warn', 'beep');
      }
    }
    // плита: снять вовремя
    const st = H.stove;
    if (st.state === 'cooking' && abs() >= st.doneAt) {
      st.state = 'ready';
      note('🍲 Еда готова! Снимите кастрюлю с плиты в течение 30 минут, иначе подгорит.', 'warn', 'beep');
    }
    if (st.state === 'ready' && abs() >= st.burnAt) {
      st.state = 'idle';
      H.clean.kitchen -= 20; m.mood -= 8; S.flags.burned = true;
      note('🔥 Подгорело! Кухня пахнет как шашлык, забытый в 2007 году. Ужин отменяется, продукты — в мусорку.', 'bad', 'bad');
      addLog('Еда подгорела');
    }
    if (H.mc.state === 'cooking' && abs() >= H.mc.doneAt) {
      H.mc.state = 'idle'; H.portions += H.mc.yield || 6; H.mc.yield = 0; H.cookedDay = S.day;
      note('🍲 Мультиварка: готово! Она держит тепло и никогда не подгорает. Лучшая подруга.', 'good', 'beep');
    }
    // стиралка: развесить вовремя, иначе затхнет
    const w = H.washer;
    if (w.state === 'done' && w.moldAt && abs() >= w.moldAt) {
      H.laundryDirty += w.sets; w.state = 'idle'; w.sets = 0; w.moldAt = 0;
      note('🦠 Бельё в стиралке затхло и пахнет болотом. Всё в перестирку! Лягушки одобряют.', 'bad', 'bad');
    }
    // Бадди разносит грязь, если в прихожей грязно
    if (!d.out && H.clean.hall < 50) {
      const r = pick(['living', 'kitchen', 'kids']);
      H.clean[r] -= 2 * hk;
    }
    // особые дни
    bossTick(prev, now);
    // происшествия
    incidentTick(dt);

    // доставки
    S.pending = S.pending.filter(p => {
      if (abs() >= p.at) {
        for (const k in p.items) H[k] = (H[k] || 0) + p.items[k];
        note('📦 Курьер привёз заказ. Оставил у двери и убежал — видимо, услышал детей.', 'good');
        return false;
      }
      return true;
    });

    clampAll();
  }

  function hourly() {
    const H = S.house;
    // игрушки
    if (kidsAwakeHome().length && H.toys.length < 10 && Math.random() < (S.owned.toyBox ? 0.25 : 0.5) * (S.owned.kidsShelf ? 0.6 : 1)) spawnToy();
    // нытьё голодных
    const hungry = kidsAwakeHome().filter(id => S.kids[id].satiety < 25);
    if (hungry.length && S.time - (S.flags.nagAt || 0) > 150) {
      S.flags.nagAt = S.time;
      note(pick([
        '🍽️ Миша: «{Мам|Пап}, я так есть хочу, что посмотрел на Бадди как на шаурму».',
        '🍽️ Соня: «{Мама|Папа}, у меня в животике кит поёт». Кит голодный.',
        '🍽️ Дети голодны и начинают жевать мебель. Ту, которой нет.',
      ]), 'warn');
    }
    wishesHourly();
    if ((kidsAwakeHome().length || !S.dog.out) && (S.flags.flavor || 0) < 2 && Math.random() < 0.12) {
      S.flags.flavor = (S.flags.flavor || 0) + 1;
      note(say('flavor'), 'info');
    }
    if (S.mom.energy < 15 && Math.random() < 0.5) note('🥱 Вы зеваете так, что собака думает, будто вы хотите её съесть. Пора отдохнуть.', 'warn');
  }

  const WISH_ICONS = { eat: '🍽️', play: '🎲', story: '📖', hug: '🤗', sweet: '🍬' };
  const WISH_TEXT = { eat: 'хочет есть', play: 'хочет поиграть', story: 'хочет сказку', hug: 'хочет обниматься', sweet: 'хочет конфетку' };
  G.WISH_ICONS = WISH_ICONS;
  function wishesHourly() {
    ['misha', 'sonya'].forEach(id => {
      const k = S.kids[id];
      if (k.at !== 'home' || k.asleep) { k.wish = null; return; }
      if (!k.wish) {
        if (Math.random() < 0.3 * ramp()) {
          k.wish = k.satiety < 55 ? 'eat' : pick(id === 'sonya' ? ['play', 'story', 'hug', 'sweet'] : ['play', 'hug', 'sweet']);
          k.wishAt = abs();
          note(`${WISH_ICONS[k.wish]} ${k.name} ${WISH_TEXT[k.wish]}.`, 'quiet');
        }
      } else if (abs() - k.wishAt >= 60) {
        k.mood -= 5; S.mom.mood -= 1;
        k.wishAt = abs();                       // следующий каприз — не раньше чем через час
        k.whines = (k.whines || 0) + 1;
        if (k.whines >= 2) {                    // поныл дважды — обиделся и забыл
          k.wish = null; k.whines = 0; k.mood -= 3;
          note(`😒 ${k.name} обиделся(ась) и ушёл(ла) дуться в угол. Желание отменено, осадочек остался.`, 'bad');
          return;
        }
        note(id === 'sonya'
          ? pick(['😭 Соня капризничает: «Ты со мной не игра-а-аешь!» Громкость: 90 дБ.', '😭 Соня легла на пол в позе морской звезды и протестует.'])
          : pick(['😤 Миша ноет: «Ну ма-а-ам!» уже в пятый раз. Это тоже дедлайн.', '😤 Миша объявил забастовку и ушёл жить под стол.']), 'bad', id === 'sonya' ? 'cry' : 'bad');
      }
    });
  }
  // Исполнить желание ребёнка; возвращает приписку к тексту
  function fulfill(id, type) {
    const k = S.kids[id];
    if (k.wish !== type) return '';
    k.wish = null; k.whines = 0; k.mood += 8;
    return ' ✨ Желание исполнено!';
  }
  G.wishes = () => ['misha', 'sonya'].map(id => ({ id, icon: S.kids[id].wish ? WISH_ICONS[S.kids[id].wish] : null }));

  function spawnToy() {
    const zones = [[2.4, 6.6, 5.5, 10.6], [1.5, 1.0, 5.0, 4.7], [6.4, 1.8, 8.6, 10.5]];
    const z = Math.random() < 0.55 ? zones[0] : (Math.random() < 0.75 ? zones[1] : zones[2]);
    S.house.toys.push({
      id: S.nextId++, x: z[0] + Math.random() * (z[2] - z[0]), z: z[1] + Math.random() * (z[3] - z[1]),
      k: Math.floor(Math.random() * 3), c: Math.floor(Math.random() * 6), r: Math.random() * 6,
    });
  }

  const awakeKid = id => S.kids[id].at === 'home' && !S.kids[id].asleep;
  const INCIDENTS = [
    { id: 'markers', iid: 'sonya', kid: 'sonya',
      failAway() { S.money -= 500; S.mom.mood -= 6; return '🖍️ Соня унесла фломастер в садик и разрисовала там стену. Звонила воспитательница: −500 ₽ на краску и строгий голос.'; }, mins: 15, need: () => awakeKid('sonya'), title: '🖍️ Соня рисует фломастером на обоях!', label: 'Отобрать фломастер', act: 5,
      ok() { S.kids.sonya.mood -= 3; return 'Фломастер изъят. На обоях успел появиться только кот. Довольно милый кот.'; },
      fail() { S.house.clean.kids -= 25; S.mom.mood -= 8; return '🖍️ Обои теперь в стиле «наскальная живопись». Соня гордится, вы — нет. Детская −25% чистоты.'; } },
    { id: 'dogRun', iid: 'door', mins: 15, need: () => !S.dog.out, title: '🐕 Бадди сбежал во двор!', label: 'Поймать Бадди', act: 10,
      ok() { S.dog.mood += 5; S.mom.fitness += 1; return 'Бадди пойман у соседской помойки. Он уверен, что это была прогулка.'; },
      fail() { S.house.clean.hall -= 30; S.house.clean.living -= 15; S.mom.mood -= 8; return '🐕 Бадди вернулся сам — в грязи по уши и очень счастливый. Прихожая и гостиная — нет.'; } },
    { id: 'fight', iid: 'misha', kid: 'misha',
      failAway() { S.kids.misha.grades -= 3; S.kids.misha.mood -= 8; S.kids.sonya.mood -= 8; return '🥊 Ссору никто не разнял — Миша довёл её до школы и подрался уже там. Учительница пишет: «зайдите». Оценки −3.'; }, mins: 10, need: () => awakeKid('misha') && awakeKid('sonya') && !(S.owned.playTent && Math.random() < 0.5), title: '🥊 Дети дерутся!', label: 'Разнять драку', act: 5,
      ok() { return 'Драка остановлена. Причина: Миша посмотрел на Соню. Соня посмотрела в ответ.'; },
      fail() { S.kids.misha.mood -= 15; S.kids.sonya.mood -= 15; spawnToy(); spawnToy(); return '🥊 Драка закончилась сама: у Сони машинка Миши, у Миши бант Сони, у обоих — обида на весь мир.'; } },
    { id: 'school', iid: 'phone', remote: true, mins: 10, need: () => S.kids.misha.at === 'school', title: '📞 Звонят из школы!', label: 'Ответить на звонок', act: 10,
      ok(c) { return SCHOOL_CALLS[(c && c.variant) || 0].ok(); },
      fail(c) { return SCHOOL_CALLS[(c && c.variant) || 0].fail(); } },
    { id: 'courier', iid: 'door', mins: 12, need: () => S.time > 9 * 60 && S.time < 20 * 60, title: '📦 Курьер звонит в дверь!', label: 'Забрать посылку', act: 3,
      ok() {
        if (Math.random() < 0.5) { S.house.sweets += 3; return '📦 Андрей {прислал|прислала} коробку: сладости детям и носки себе. Почему себе — загадка.'; }
        S.house.chem += 3; return '📦 Посылка от {свекрови|тёщи}: бытовая химия и записка «намёк». Намёк понят.';
      },
      fail() { S.mom.mood -= 5; return '📦 Курьер постоял 4 секунды и уехал. Посылка теперь едет в Подольск.'; } },
    { id: 'tap', iid: 'tub', mins: 12, need: () => awakeKid('misha'), title: '🚿 Миша не закрыл кран в ванной!', label: 'Закрыть кран', act: 3,
      ok() { return '🚿 Кран закрыт. Миша сказал, что «проверял, как работает море».'; },
      fail() { S.house.clean.bath -= 40; S.house.clean.hall -= 10; S.money -= 1500; return '🌊 Потоп! Пришлось вызвать сантехника (−1 500 ₽). Бадди теперь водоплавающий.'; } },
    { id: 'cry', iid: 'sonya', kid: 'sonya',
      failAway() { S.kids.sonya.mood -= 12; S.mom.mood -= 5; return '😢 Соню так никто и не пожалел — она всхлипывала до самого садика. Воспитательница передаёт: «ребёнок грустный».'; }, mins: 10, snd: 'cry', need: () => awakeKid('sonya'), title: '😭 Соня ударилась и плачет!', label: 'Пожалеть и подуть', act: 5,
      ok() { S.kids.sonya.mood += 5; return 'Подули, поцеловали, наклеили пластырь с единорогом. Боль прошла мгновенно. Магия.'; },
      fail() { S.kids.sonya.mood -= 20; S.mom.mood -= 8; return '😭 Соня плакала 15 минут, потом пожаловалась Бадди. Бадди на её стороне.'; } },
    { id: 'trash', iid: 'dog', mins: 12, need: () => !S.dog.out && !S.projDone.dog, title: '🗑️ Бадди роется в мусорке!', label: 'Отогнать Бадди', act: 3,
      ok() { return 'Бадди отогнан. Он сделал вид, что просто проходил мимо мусорки. Восемь раз.'; },
      fail() { S.house.clean.kitchen -= 30; return '🗑️ Бадди разнёс мусор по всей кухне. Нашёл косточку, потерял совесть.'; } },
  ];
  // Поводы звонка из школы: ответить всегда выгоднее, чем пропустить
  const SCHOOL_CALLS = [
    { ok() { S.money -= 500; return '📞 Сбор на новые шторы в класс. Перевели 500 ₽ сразу — учительница назвала вас «{самой ответственной мамой|самым ответственным папой}».'; },
      fail() { S.money -= 800; S.mom.mood -= 5; return '📞 Пропустили звонок про сбор денег. Теперь в чате класса вы «та, которая не сдала»: доплатили 800 ₽ за «срочность».'; } },
    { ok() { S.kids.misha.grades += 2; S.kids.misha.mood -= 3; return '📞 Учительница жалуется: Миша болтает на уроках. Серьёзно поговорили с Мишей — обещал исправиться (оценки +2).'; },
      fail() { S.kids.misha.grades -= 4; S.mom.mood -= 5; return '📞 Не ответили на жалобу учительницы. Мишу пересадили за первую парту «до разговора с родителями». Оценки −4.'; } },
    { ok() { S.mom.mood += 10; S.kids.misha.mood += 6; return '📞 Учительница хвалит Мишу: лучше всех прочитал стих! Вы растаяли и сказали Мише вечером. Он сделал вид, что ему всё равно (нет).'; },
      fail() { S.mom.mood -= 3; return '📞 Пропустили звонок, а это была похвала! Миша пересказал её так, что вы поняли только слово «стих».'; } },
    { ok() { S.kids.misha.mood += 5; return '📞 Миша забыл сменку. Договорились, что ему дадут запасную. Кризис обуви предотвращён.'; },
      fail() { S.kids.misha.mood -= 10; return '📞 Миша забыл сменку, а вы не ответили. Весь день он ходил в бахилах и обиделся на весь мир.'; } },
  ];
  const incDef = () => S.incident && INCIDENTS.find(x => x.id === S.incident.id);
  function incidentTick(dt) {
    const inc = incDef();
    // ребёнок, с которым случилось происшествие, уехал из дома — провал сразу, но уже «на выезде»
    if (inc && inc.kid && S.kids[inc.kid].at !== 'home') {
      S.incident = null;
      S.flags.incFailed = (S.flags.incFailed || 0) + 1;
      note(inc.failAway(), 'bad', 'bad');
      addLog('Не успели: ' + inc.title);
      return;
    }
    if (inc && abs() >= S.incident.at) {
      const cur = S.incident;
      S.incident = null;
      S.flags.incFailed = (S.flags.incFailed || 0) + 1;
      note(inc.fail(cur), 'bad', 'bad');
      addLog('Не успели: ' + inc.title);
      return;
    }
    if (inc || S._away || G.tutorialActive()) return;
    if (S.time < 7.5 * 60 || S.time > 21.5 * 60) return;
    const rate = (0.16 + week() * 0.03) * (diffK().inc || 1);   // происшествий в час
    if (Math.random() > rate * dt / 60) return;
    const pool = INCIDENTS.filter(x => x.need());
    if (!pool.length) return;
    const def = pick(pool);
    S.incident = { id: def.id, at: abs() + def.mins, start: abs(), variant: def.id === 'school' ? Math.floor(Math.random() * SCHOOL_CALLS.length) : 0 };
    if (S._inAction) S._interrupt = true;
    note(`🚨 ${def.title} У вас ${def.mins} мин — ${incHint(def)}.`, 'bad', def.snd || 'alarm');
  }
  function incHint(def) {
    const where = { door: 'бегите к входной двери', tub: 'бегите в ванную', phone: 'нажмите на тревогу вверху', dog: 'найдите Бадди', misha: 'найдите Мишу', sonya: 'найдите Соню' };
    return where[def.iid] || 'бегите';
  }
  G.incident = function () {
    const def = incDef();
    if (!def) return null;
    return { title: def.title, left: S.incident.at - abs(), iid: def.iid, hint: incHint(def), remote: !!def.remote };
  };
  function incidentAction(def) {
    return A('🚨 ' + def.label, def.act, null, () => {
      const cur = S.incident;
      S.incident = null;
      S.flags.incOk = (S.flags.incOk || 0) + 1;
      return { text: '✅ ' + def.ok(cur), type: 'good' };
    });
  }
  G.incidentSheet = function () {
    const def = incDef();
    if (!def) return null;
    const a = incidentAction(def);
    a.reason = null; a.mins = def.act;
    return { title: def.title, info: ['Осталось ' + Math.max(0, Math.ceil(S.incident.at - abs())) + ' мин'], actions: def.remote ? [a] : [] };
  };

  // ---------- особые дни («боссы») ----------
  // особые дни за месяц вахты: свекровь (чт), собрание (вт), ДР Сони (сб), ветрянка, свекровь снова
  const BOSS = { 5: 'mil', 10: 'meeting', 14: 'bday', 17: 'pox', 18: 'pox', 19: 'pox', 26: 'mil2' };
  const BOSS_INTRO = {
    mil: { title: '👵 {Свекровь|Тёща} едет с инспекцией!', text: 'Будет в 18:00. Нужна средняя чистота дома не ниже 70% и почти пустая раковина (не больше 4 тарелок). Она проведёт пальцем по полке. Она всегда проводит.' },
    mil2: { title: '👵 {Свекровь|Тёща} — возвращение', text: 'Снова в 18:00, и на этот раз планка выше: чистота 80%+, раковина почти пустая. Она запомнила ту пылинку.' },
    meeting: { title: '🏫 Родительское собрание', text: 'Сегодня с 18:00 до 19:15 надо выехать на собрание (90 минут, дети едут с вами). Не придёте — выберут в родительский комитет заочно.' },
    bday: { title: '🎂 День рождения Сони!', text: 'Гости придут в 16:00. Нужно: торт (испечь на плите или купить), украсить гостиную (шарики из магазина) и чистая гостиная — 60%+. Соня ждёт этот день с прошлого дня рождения.' },
    pox: { title: '🟢 У Миши ветрянка!', text: 'Три дня карантина: Миша дома, в школу нельзя. Мазать зелёнкой дважды в день, иначе расчешет. Соня пока держится. Пока.' },
  };
  G.bossIntro = id => BOSS_INTRO[id];
  function bossTick(prev, now) {
    const b = S.today.boss, F = S.flags;
    if (!b || F.bossDone) return;
    if ((b === 'mil' || b === 'mil2') && crossed(prev, now, 18 * 60)) {
      F.bossDone = true;
      const need = b === 'mil' ? 70 : 80;
      if (cleanAvg() >= need && S.house.dishes <= 4) {
        S.money += 5000; S.mom.mood += 15; F.bossOk = true; S.ach._mil = true;
        note('👵 {Свекровь|Тёща} провела пальцем по полке, посмотрела на палец… и скупо похвалила! Сунула конверт с 5 000 ₽ «на хозяйство». ПОБЕДА!', 'good', 'ach');
        addLog('{Свекровь|Тёща} довольна');
      } else {
        S.mom.mood -= 20; S.kids.misha.mood -= 5; S.kids.sonya.mood -= 5;
        note(`👵 {Свекровь|Тёща} провела пальцем по полке, посмотрела на палец, потом на вас. Вздохнула. Этот вздох вы будете слышать во сне. (Чистота ${Math.round(cleanAvg())}% из ${need}%)`, 'bad', 'bad');
        addLog('{Свекровь|Тёща} недовольна');
      }
    }
    if (b === 'meeting' && crossed(prev, now, 19.5 * 60)) {
      F.bossDone = true;
      if (!F.meeting) {
        S.kids.misha.grades -= 6; S.mom.mood -= 10;
        note('🏫 Вас заочно выбрали в родительский комитет. Теперь вы собираете деньги на шторы. Навсегда.', 'bad', 'bad');
      }
    }
    if (b === 'bday' && crossed(prev, now, 16 * 60)) {
      F.bossDone = true;
      const cake = F.cake || S.house.cake > 0;
      if (!F.cake && S.house.cake > 0) S.house.cake--;
      const score = (cake ? 1 : 0) + (F.decorated ? 1 : 0) + (S.house.clean.living >= 60 ? 1 : 0);
      if (score === 3) {
        S.kids.sonya.mood = 100; S.kids.misha.mood += 15; S.mom.mood += 20; F.bossOk = true;
        note('🎉 Праздник удался! Соня задула свечи, гости объелись, Бадди съел праздничный колпак. Идеально.', 'good', 'ach');
      } else if (score === 2) {
        S.kids.sonya.mood += 10; S.mom.mood += 5;
        note('🎈 Праздник получился неплохим. Соня счастлива, гости вежливо не заметили, чего не хватало.', 'good');
      } else {
        S.kids.sonya.mood -= 30; S.mom.mood -= 15;
        note('🎂 Праздник вышел… концептуальным. Без торта, без шариков, среди пыли. Соня запомнит это. Психолог тоже.', 'bad', 'cry');
      }
      S.house.clean.living -= 25; S.house.dishes += 8;
      addLog('День рождения Сони: ' + score + '/3');
    }
  }

  function clampAll() {
    const m = S.mom;
    ['energy', 'mood', 'satiety', 'fitness', 'knowledge'].forEach(k => m[k] = clamp(m[k], 0, 100));
    ['misha', 'sonya'].forEach(id => {
      const k = S.kids[id];
      ['satiety', 'mood', 'hygiene', 'grades', 'dev'].forEach(f => { if (k[f] !== undefined) k[f] = clamp(k[f], 0, 100); });
    });
    ['satiety', 'mood', 'need'].forEach(f => S.dog[f] = clamp(S.dog[f], 0, 100));
    HW.ROOM_IDS.forEach(r => S.house.clean[r] = clamp(S.house.clean[r], 0, 100));
    S.house.dishes = Math.max(0, S.house.dishes);
  }

  function advance(total) {
    let passed = 0;
    while (total > 0) {
      const d = Math.min(5, total);   // шаг 5 минут: точнее прерывания и события
      tick(d);
      total -= d; passed += d;
      if (S.mom.energy <= 0 || S.time >= CFG.FORCE_SLEEP || S._interrupt) break;
    }
    return passed;
  }

  // ---------- снимки чисел: убывающая польза и частичная награда ----------
  const STAT_PATHS = [['mom', 'energy'], ['mom', 'mood'], ['mom', 'satiety'], ['mom', 'fitness'], ['mom', 'knowledge'],
    ['kids', 'misha', 'mood'], ['kids', 'misha', 'satiety'], ['kids', 'misha', 'hygiene'], ['kids', 'misha', 'grades'],
    ['kids', 'sonya', 'mood'], ['kids', 'sonya', 'satiety'], ['kids', 'sonya', 'hygiene'], ['kids', 'sonya', 'dev'],
    ['dog', 'mood'], ['dog', 'satiety'], ['dog', 'need']];
  const RES_INT = ['groceries', 'chem', 'portions', 'dogFood', 'sweets', 'laundryDirty', 'laundryClean', 'dishes', 'cake', 'decor'];
  const getP = p => p.reduce((o, k) => o[k], S);
  const setP = (p, v) => { const o = p.slice(0, -1).reduce((x, k) => x[k], S); o[p[p.length - 1]] = v; };
  function snapNums() {
    const o = { stats: STAT_PATHS.map(getP), money: S.money, res: RES_INT.map(k => S.house[k] || 0), chem: S.house.chem, clean: Object.assign({}, S.house.clean) };
    return o;
  }
  // Оставить только долю f от изменений между before и after (gainsOnly — урезать только прибавки к состояниям)
  function scaleDelta(before, after, f, gainsOnly) {
    STAT_PATHS.forEach((p, i) => {
      const d = after.stats[i] - before.stats[i];
      if (gainsOnly && d <= 0) return;
      setP(p, getP(p) - d * (1 - f));
    });
    if (gainsOnly) return;
    // симметричное округление: парные запасы (грязное ↔ чистое бельё) сходятся без потерь
    const keep = (d) => Math.sign(d) * Math.round(Math.abs(d) * f);
    S.money += keep(after.money - before.money) - (after.money - before.money);
    RES_INT.forEach((k, i) => {
      const d = after.res[i] - before.res[i];
      const kept = (k === 'groceries' || k === 'chem') && d < 0 ? -Math.max(1, Math.ceil(-d * f)) : keep(d);
      S.house[k] = (S.house[k] || 0) - d + kept;
    });
    for (const r in S.house.clean) S.house.clean[r] -= (after.clean[r] - before.clean[r]) * (1 - f);
  }
  // Убывающая польза одинаковых приятностей за день: 100% → 50% → 25% → 0
  const DIM = [1, 0.5, 0.25, 0];
  const DIM_RULES = [['Поиграть с мячиком', 'ball'], ['Погладить', 'pet'], ['Обнять', 'hug'], ['«Бадди, дай лапу!»', 'paw'],
    ['Принять ванну', 'bath'], ['Включить детям мультики', 'tv'], ['Посмотреть в зеркало', 'mirror'], ['Почитать книгу', 'read'],
    ['Почитать перед сном', 'read'], ['Поиграть', 'play'], ['Дать конфету', 'sweet'], ['Почитать сказку', 'story'],
    ['Позаниматься', 'lessons'], ['Тренировка дома', 'treadmill'], ['🏋️‍♀️ Фитнес-клуб', 'gym'], ['Посмотреть в окно', 'window'], ['Понюхать', 'sniff'], ['Полечить', 'heal']];
  function markDim(actions, iid) {
    actions.forEach(a => {
      if (a.dim) return;
      const rule = DIM_RULES.find(([pref]) => a.label.startsWith(pref));
      if (!rule) return;
      a.dim = rule[1] + (['hug', 'play', 'sweet'].includes(rule[1]) ? '_' + iid : '');
      const n = ((S.flags.dim || {})[a.dim]) || 0;
      if (n > 0) a.label += ` · польза ${Math.round(DIM[Math.min(n, 3)] * 100)}%`;
    });
  }

  // одеть детей (тратит чистое бельё)
  function dressKids(manual) {
    const H = S.house;
    const kids = kidsHome();
    let dirty = false;
    kids.forEach(id => {
      if (H.laundryClean > 0) { H.laundryClean--; H.laundryDirty++; }
      else { dirty = true; S.kids[id].mood -= 8; }
    });
    if (dirty) note('👕 Чистой одежды не хватило. Дети пошли в том, в чём спали. Тренд сезона «пижамный шик».', 'bad');
    return dirty;
  }

  // ---------- выполнение действия ----------
  // a: {label, min, run}. Возвращает {msgs, report}
  G.perform = function (a) {
    msgs = [];
    const t0 = S.time;
    const mins = typeof a.min === 'function' ? a.min() : (a.min || 0);
    const e0 = S.mom.energy, m0 = S.money;
    const before = snapNums(), flags0 = Object.assign({}, S.flags);
    const proc0 = { stove: S.house.stove.state, mc: S.house.mc.state, washer: S.house.washer.state };
    const proj0 = JSON.stringify([S.proj, S.projDone, S.paintings, S.walls]);
    const r = a.run ? a.run(t0, mins) : null;
    // чем лучше форма, тем меньше устаёте от дел
    if (S.mom.energy < e0) S.mom.energy = e0 - (e0 - S.mom.energy) * (0.75 - S.mom.fitness / 400);
    // повтор той же приятности за день — польза меньше
    if (a.dim) {
      S.flags.dim = S.flags.dim || {};
      const n = S.flags.dim[a.dim] || 0;
      S.flags.dim[a.dim] = n + 1;
      if (n > 0) scaleDelta(before, snapNums(), DIM[Math.min(n, 3)], true);
      if (n >= 3) note('😐 Это уже не радует. Попробуйте что-нибудь другое.', 'info');
    }
    const after = snapNums(), flags1 = Object.assign({}, S.flags);
    const runMsgs = r ? (Array.isArray(r) ? r : [r]) : [];
    S._inAction = true; S._away = !!a.away; S._interrupt = false;
    const passed = advance(mins);
    if (S._interrupt && mins > 0 && passed < mins) {
      // прервали — награда и затраты по доле выполненного времени
      const f = passed / mins;
      scaleDelta(before, after, f, false);
      // фоновые процессы, запущенные этим действием, дают столько, сколько реально потрачено
      const H = S.house, gi = RES_INT.indexOf('groceries'), di = RES_INT.indexOf('laundryDirty');
      const spentGro = before.res[gi] - H.groceries;
      [['stove', 4], ['mc', 4]].forEach(([k, need]) => {
        if (proc0[k] === 'idle' && H[k].state !== 'idle') {
          if (spentGro <= 0) { H[k].state = 'idle'; H[k].yield = 0; }
          else H[k].yield = Math.max(1, Math.round(6 * spentGro / need));
        }
      });
      if (proc0.washer === 'idle' && H.washer.state !== 'idle') {
        const sets = before.res[di] - H.laundryDirty;
        if (sets <= 0) { H.washer.state = 'idle'; H.washer.sets = 0; } else H.washer.sets = sets;
      }
      let undone = false;
      if (f < 0.5 || a.allOrNothing) {
        for (const k in flags1) if (flags1[k] !== flags0[k] && k !== 'dim') { S.flags[k] = flags0[k]; undone = true; }
        if (JSON.stringify([S.proj, S.projDone, S.paintings, S.walls]) !== proj0) {
          [S.proj, S.projDone, S.paintings, S.walls] = JSON.parse(proj0); undone = true;
        }
      }
      // вместо текста успеха — шутка про брошенное дело
      const L = a.label || '';
      const key = /уроки|поделку/i.test(L) ? 'intHomework' : /торт/i.test(L) ? 'intCake' : /вариться|мультиварк|пирог/i.test(L) ? 'intCook'
        : /Подработка/.test(L) ? 'intFreelance' : /Помыть пол/.test(L) ? 'intMop' : /Подмести|Пропылесосить/.test(L) ? 'intClean'
        : /руками/.test(L) ? 'intWash' : /ванну/i.test(L) ? 'intBath' : /Почитать|Читать/.test(L) ? 'intRead'
        : /^\S+ .*\(\d+\/\d+\)/.test(L) ? 'intHobby' : 'intGeneric';
      note(`${say(key + (f < 0.5 ? 'Low' : 'High'))} Сделано ${Math.round(f * 100)}%` + (undone ? ' — не засчитано, вернитесь к делу позже.' : ' — польза и затраты по доле.'), 'warn');
      // засчитано — важные итоги (например, завершённое хобби) всё равно показать
      if (!undone) runMsgs.forEach(x => { if (x && x.snd === 'ach') note(x.text, x.type, x.snd); });
    } else {
      runMsgs.forEach(x => typeof x === 'string' ? note(x, 'good') : note(x.text, x.type, x.snd));
    }
    trackMoney(m0);
    S._inAction = false; S._away = false; S._interrupt = false;
    clampAll();
    let report = null;
    if (S._sleepNow) {
      S._sleepNow = false;
      report = endDay('sleep');
    } else if (S.mom.energy <= 0) {
      report = endDay('faint');
    } else if (S.time >= CFG.FORCE_SLEEP) {
      report = endDay('late');
    }
    checkAch();
    G.save();
    const out = { msgs, report };
    msgs = [];
    return out;
  };

  // Живые часы: время идёт, пока героиня ходит по дому
  G.liveTick = function (mins) {
    msgs = [];
    S._inAction = false; S._away = false; S._interrupt = false;
    advance(mins);
    clampAll();
    let report = null;
    if (S.mom.energy <= 0) report = endDay('faint');
    else if (S.time >= CFG.FORCE_SLEEP) report = endDay('late');
    checkAch();
    if (report) G.save();
    const out = { msgs, report };
    msgs = [];
    return out;
  };

  // Ближайший «горящий» дедлайн для спешки: {min, text}
  G.urgency = function () {
    const c = [];
    const inc = G.incident();
    if (inc) c.push({ min: inc.left, text: inc.title });
    const st = S.house.stove;
    if (st.state === 'ready') c.push({ min: st.burnAt - abs(), text: '🍲 Снять с плиты' });
    const w = S.house.washer;
    if (w.state === 'done' && w.moldAt) c.push({ min: w.moldAt - abs(), text: '🧺 Развесить бельё' });
    const toMin = d => { const [h, m] = d.split(':').map(Number); return h * 60 + m; };
    G.tasks().list.forEach(t => { if (!t.done && t.deadline && toMin(t.deadline) >= S.time) c.push({ min: toMin(t.deadline) - S.time, text: t.text }); });
    c.sort((a, b) => a.min - b.min);
    return c[0] || null;
  };
  // Фоновые таймеры для HUD
  G.timers = function () {
    const out = [], H = S.house;
    if (H.stove.state === 'cooking') out.push({ icon: '🍲', text: 'варится до ' + HW.fmtTime(H.stove.doneAt % 1440) });
    if (H.stove.state === 'ready') out.push({ icon: '🔥', text: 'снять до ' + HW.fmtTime(H.stove.burnAt % 1440), hot: true });
    if (H.mc.state === 'cooking') out.push({ icon: '🍲', text: 'мультиварка до ' + HW.fmtTime(H.mc.doneAt % 1440) });
    if (H.washer.state === 'running') out.push({ icon: '🌀', text: 'стирка до ' + HW.fmtTime(H.washer.doneAt % 1440) });
    if (H.washer.state === 'done') out.push({ icon: '🧺', text: 'развесить до ' + HW.fmtTime(H.washer.moldAt % 1440), hot: true });
    return out;
  };

  function trackMoney(m0) {
    const dm = S.money - m0;
    if (dm > 0) S.flags.earned = (S.flags.earned || 0) + dm;
    else if (dm < 0) S.flags.spent = (S.flags.spent || 0) - dm;
  }

  // ---------- достижения ----------
  const ACH = [
    { id: 'move', icon: '📦', name: 'Новоселье', desc: 'Купить первую мебель', test: () => ownedCount() >= 1 },
    { id: 'week', icon: '📅', name: 'Неделя выжита', desc: 'Продержаться 7 дней', test: () => S.day >= 8 || S.shift > 1 },
    { id: 'poop', icon: '💩', name: 'Сюрприз в прихожей', desc: 'Бадди нагадил дома (поздравляем?)', test: () => S.life.accidents > 0 },
    { id: 'faint', icon: '😵', name: 'Лицом в салат', desc: 'Упасть от усталости', test: () => S.life.faints > 0 },
    { id: 'walker', icon: '🐕', name: 'Собачник', desc: 'Выгулять Бадди 30 раз', test: () => S.life.walks >= 30 },
    { id: 'money', icon: '💼', name: 'Фрилансер года', desc: 'Заработать 50 000 ₽ подработкой', test: () => S.life.earned >= 50000 },
    { id: 'clean', icon: '✨', name: 'Чистюля', desc: 'Средняя чистота дома 90%+', test: () => cleanAvg() >= 90 },
    { id: 'nerd', icon: '🤓', name: 'Отличник растёт', desc: 'Оценки Миши 90+', test: () => S.kids.misha.grades >= 90 },
    { id: 'fit', icon: '💪', name: '{Фитоняша|Качок}', desc: 'Форма 70+', test: () => S.mom.fitness >= 70 },
    { id: 'zen', icon: '🧘‍♀️', name: 'Дзен', desc: 'Настроение 95+', test: () => S.mom.mood >= 95 },
    { id: 'star3', icon: '⭐', name: 'Идеальный день', desc: 'Получить 3 звезды за день', test: () => (S.bestStreak || 0) >= 1 },
    { id: 'streak7', icon: '🔥', name: 'Неделя без косяков', desc: 'Серия из 7 идеальных дней', test: () => (S.bestStreak || 0) >= 7 },
    { id: 'mil', icon: '👵', name: '{Свекровь|Тёща} одобряет', desc: 'Пройти инспекцию {свекрови|тёщи}', test: () => !!(S.ach && S.ach._mil) },
    { id: 'green', icon: '🌸', name: 'Зелёные руки', desc: 'Вырастить цветок', test: () => !!S.projDone.flower },
    { id: 'artist', icon: '🎨', name: '{Художница|Художник}', desc: 'Нарисовать картину', test: () => !!S.projDone.paint },
    { id: 'designer', icon: '🖼️', name: 'Дизайнер интерьеров', desc: 'Поклеить обои', test: () => !!S.projDone.wallpaper },
    { id: 'reader', icon: '📖', name: '{Осилила|Осилил} Толстого', desc: 'Дочитать «Войну и мир»', test: () => !!S.projDone.book },
    { id: 'trainer', icon: '🐾', name: 'Кинолог', desc: 'Научить Бадди давать лапу', test: () => !!S.projDone.dog },
    { id: 'knitter', icon: '🧶', name: 'Бабушкин стиль', desc: 'Связать плед', test: () => !!S.projDone.knit },
    { id: 'baker', icon: '🥧', name: 'Пекарь от бога', desc: 'Освоить фирменный пирог', test: () => !!S.projDone.pie },
    { id: 'yogi', icon: '🧘‍♀️', name: '{Йогиня|Йог}', desc: 'Освоить утреннюю йогу', test: () => !!S.projDone.yoga },
    { id: 'rock', icon: '🎸', name: '{Рок-мама|Рок-папа}', desc: 'Научиться играть на гитаре', test: () => !!S.projDone.guitar },
    { id: 'runner', icon: '🏅', name: '{Марафонка|Марафонец}', desc: 'Пробежать 5 км', test: () => !!S.projDone.run },
    { id: 'blogger', icon: '📱', name: '{Блогерша|Блогер}', desc: 'Раскрутить блог', test: () => !!S.projDone.blog },
    { id: 'puzzler', icon: '🧩', name: 'Пазл сошёлся', desc: 'Собрать пазл с детьми', test: () => !!S.projDone.puzzle },
    { id: 'tailor', icon: '👑', name: '{Швея|Портной}', desc: 'Сшить Соне костюм принцессы', test: () => !!S.projDone.costume },
    { id: 'farmer', icon: '🌿', name: 'Фермер на подоконнике', desc: 'Вырастить свою зелень', test: () => !!S.projDone.herbs },
    { id: 'album', icon: '📷', name: '{Хранительница|Хранитель} памяти', desc: 'Собрать фотоальбом', test: () => !!S.projDone.album },
    { id: 'full', icon: '🏡', name: 'Дом — полная чаша', desc: 'Купить всю мебель', test: () => ownedCount() >= HW.FURNITURE.length },
    { id: 'shift', icon: '🎉', name: '{Дождалась!|Дождался!}', desc: 'Дожить до возвращения Андрея', test: () => S.shift > 1 || S.day > CFG.SHIFT_DAYS },
  ];
  function checkAch() {
    S.ach = S.ach || {};
    ACH.forEach(a => {
      if (!S.ach[a.id] && a.test()) {
        S.ach[a.id] = true;
        note(`🏆 Достижение: «${a.name}» — ${a.desc}`, 'good', 'ach');
        addLog('Достижение: ' + a.name);
      }
    });
  }
  G.achievements = () => ACH.map(a => ({ icon: a.icon, name: a.name, desc: a.desc, got: !!(S.ach && S.ach[a.id]) }));

  // Мгновенная мелочь (поднять игрушку)
  G.pickToy = function (toyId) {
    const H = S.house;
    const i = H.toys.findIndex(t => t.id === toyId);
    if (i < 0) return null;
    const t = H.toys[i];
    H.toys.splice(i, 1);
    const room = HW.roomAt(t.x, t.z);
    H.clean[room] = clamp(H.clean[room] + 3, 0, 100);
    S.flags.cleaned = true;
    return G.perform({
      min: 1, run: () => (H.toys.length === 0 ? '🧸 Последняя игрушка убрана! Наступить ночью на лего теперь невозможно. Пока.' : null),
    });
  };

  // ---------- конец дня ----------
  function endDay(reason) {
    const lines = [];
    const H = S.house, F = S.flags, m = S.mom, d = S.dog;
    if (reason === 'faint') lines.push({ t: '😵 Вы уснули лицом в салате. Дети выключили свет и ушли смотреть мультики.', c: 'bad' });
    if (reason === 'late') lines.push({ t: '🌙 В час ночи организм объявил забастовку и отключился прямо в процессе.', c: 'bad' });
    const cleanEnd = cleanAvg();
    // оценка дня
    const tl = G.tasks().list;
    const ratio = tl.length ? tl.filter(x => x.done).length / tl.length : 1;
    const failed = F.incFailed || 0;
    let stars = ratio >= 0.9 && !failed && reason === 'sleep' ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
    if (S.today.boss && F.bossDone && !F.bossOk && S.today.boss !== 'pox') stars = Math.min(stars, 1);
    S.streak = stars === 3 ? (S.streak || 0) + 1 : 0;
    S.bestStreak = Math.max(S.bestStreak || 0, S.streak);
    if (reason !== 'sleep') {
      // дети остались без присмотра и легли как попало
      const awake = kidsAwakeHome();
      if (awake.length) { awake.forEach(id => { S.kids[id].asleep = true; }); F.kidsBedLate = true; }
      m.mood -= 10;
      if (reason === 'faint') S.life.faints++;
    }
    if (!F.dinner && kidsHome().length) {
      ['misha', 'sonya'].forEach(id => { S.kids[id].mood -= 6; S.kids[id].satiety -= 15; });
      lines.push({ t: '🍽️ Ужина не было. Дети поужинали печеньками из тайника. Тайник опустел, совесть — нет.', c: 'bad' });
    }

    // уроки
    if (quarantine(S.day)) lines.push({ t: pick(['📚 Уроки отменены по болезни. Миша счастлив, зелёнка — тоже.', '📚 Карантин: вместо домашки — мультики и зелёнка. Миша считает ветрянку лучшей болезнью.', '📚 Уроков нет — Миша на больничном. Учебник отдыхает вместе с ним.']), c: 'info' });
    else if (S.kids.misha.sick && schoolDay(S.day + 1)) lines.push({ t: pick(['📚 Миша на больничном — уроков нет. Он лечится мультиками и чаем с малиной.', '📚 Больничный: вместо домашки — градусник и плед. Миша не возражает.']), c: 'info' });
    if (G.homeworkDue()) {
      if (F.homework) { lines.push({ t: say('nightHomeworkOk'), c: 'good' }); S.stats.homework++; }
      else { S.kids.misha.grades -= 6; lines.push({ t: say('nightHomeworkNo'), c: 'bad' }); }
    }
    // цветок: один пропуск прощается, второй подряд — засыхает (день посадки считается политым)
    const fl = S.proj.flower;
    if (fl && !fl.failed) {
      if (fl.lastDay >= S.day) fl.missed = false;
      else if (fl.missed) { fl.failed = true; lines.push({ t: '🥀 Цветок засох. Даже кактус бы не выжил в таком графике полива. Можно посадить заново.', c: 'bad' }); }
      else { fl.missed = true; lines.push({ t: '🌱 Цветок сегодня не поливали. Он поник, но держится. Завтра — обязательно воды!', c: 'warn' }); }
    }
    if (S.today.boss === 'pox') {
      if ((F.green || 0) >= 2) lines.push({ t: '🟢 Миша намазан зелёнкой как положено. Похож на леопарда-инопланетянина.', c: 'good' });
      else { S.kids.misha.mood -= 15; lines.push({ t: '🟢 Зелёнки было мало — Миша расчесал ветрянку и теперь грустный и пятнистый.', c: 'bad' }); }
    }
    if (failed) lines.push({ t: `🚨 Провалено происшествий: ${failed}. Дом помнит каждое.`, c: 'bad' });
    else if (F.incOk) lines.push({ t: `🚨 Все происшествия (${F.incOk}) разрулены. Вы — МЧС в халате.`, c: 'good' });
    if (cleanEnd < 35) { m.mood -= 6; lines.push({ t: '🦠 В грязном доме заводятся микробы. Дети рискуют заболеть.', c: 'bad' }); }
    if (S.today.craft && S.kids.misha.sick) lines.push({ t: '🌰 Поделку отложили — Миша болеет. Шишки подождут, они терпеливые.', c: 'info' });
    else if (S.today.craft) {
      if (F.craft) { S.kids.misha.grades += 5; lines.push({ t: '🌰 Поделка из шишек готова. Учительница будет в восторге (или в шоке).', c: 'good' }); }
      else { S.kids.misha.grades -= 5; lines.push({ t: '🌰 Поделку не сделали. Миша принесёт в школу шишку и скажет «это концепт».', c: 'bad' }); }
    }
    // собака
    if (F.dogWalks >= 2) lines.push({ t: say('nightDogOk'), c: 'good' });
    else {
      d.mood -= 15;
      lines.push({ t: `🐕 Бадди гулял ${F.dogWalks} раз из 2. Он запомнил. Он всё запомнил.`, c: 'bad' });
    }
    if (F.dogFed === 0) { d.mood -= 20; lines.push({ t: '🦴 Бадди не кормили. Всю ночь он смотрел на вас с укором и вздыхал как пенсионер.', c: 'bad' }); }
    // дети
    if (F.kidsBed && !F.kidsBedLate) lines.push({ t: say('nightBedOk'), c: 'good' });
    else if (F.kidsBedLate) { S.kids.misha.mood -= 8; S.kids.sonya.mood -= 8; lines.push({ t: say('nightBedLate'), c: 'bad' }); }
    ['misha', 'sonya'].forEach(id => {
      const k = S.kids[id];
      if (k.satiety < 30) { k.mood -= 10; lines.push({ t: `🍽️ ${k.name} лёг(ла) спать голодным(ой). Ночью был слышен шорох у холодильника.`, c: 'bad' }); }
      if (k.hygiene < 30) { k.mood -= 5; lines.push({ t: `🛁 ${k.name} пахнет как маленький бомж. Нужна ванна.`, c: 'warn' }); }
    });
    if (m.satiety < 25) { m.mood -= 8; lines.push({ t: '🍞 Вы сами за день толком не поели. Кофе — не еда, даже если очень хочется.', c: 'bad' }); }
    // хозяйство за ночь
    H.laundryDirty += 1;           // ваша одежда
    if (H.laundryClean > 0) H.laundryClean--;
    HW.ROOM_IDS.forEach(r => H.clean[r] -= 4);
    if (S.owned.robot) {
      HW.ROOM_IDS.forEach(r => H.clean[r] += 12);
      lines.push({ t: '🤖 Робот-пылесос ночью убрался и застрял под диваном. Как обычно.', c: 'good' });
    }
    m.fitness -= 1;
    if (H.portions > 0 && S.day - (H.cookedDay || S.day) >= (S.owned.microwave ? 2 : 1)) {
      H.portions = 0;
      lines.push({ t: '🤢 Еда в кастрюле испортилась. Пахнет как носки Андрея. Вылили, Бадди в трауре.', c: 'bad' });
    }
    if (H.dishes >= 10) { m.mood -= 5; lines.push({ t: '🍽️ В раковине гора посуды. Там уже зарождается новая цивилизация.', c: 'warn' }); }
    if (cleanAvg() < 35) lines.push({ t: '🧹 В доме бардак. Пыль уже регистрируется как жилец.', c: 'warn' });

    // сон
    let slept = (24 * 60 + CFG.WAKE - S.time) / 60;
    if (reason !== 'sleep') slept = Math.max(4, Math.min(slept, 7));
    const rate = (S.owned.bed ? 13.5 : 11) * (1 + m.fitness / 400) * (S.projDone.knit ? 1.06 : 1);
    // за ночь сохраняется лишь треть вечерней бодрости, остальное даёт сон
    m.energy = clamp(m.energy * 0.3 + slept * rate, 0, 100);
    if (reason === 'sleep' && S.time > 24 * 60) {
      m.energy = Math.min(m.energy, 80);
      lines.push({ t: '🌙 Легли после полуночи. Утром вы будете как Wi-Fi в метро — вроде есть, но не работаете.', c: 'warn' });
    }
    // обморок и засыпание «в процессе» — плохой сон, утром вы разбиты
    // после обморока или засыпания в час ночи утром не больше 80% (раньше 65/70 — спираль обмороков)
    if (reason === 'faint' || reason === 'late') m.energy = Math.min(m.energy, 80);
    if (reason !== 'sleep') lines.push({ t: `💤 Спали ${slept.toFixed(1)} ч в одежде и в неудобной позе. Утром вы разбиты, как Бадди после грозы.`, c: 'bad' });
    else lines.push({ t: `💤 Сон: ${slept.toFixed(1)} ч. ${slept < 6 ? 'Маловато. Кофеварка, выручай!' : 'Почти как человек!'}`, c: slept < 6 ? 'warn' : 'info' });

    // звёзды и цифры дня передаются отдельно (report.stars, report.numbers) — экран итогов рисует их сам
    const sickNext = cleanEnd < 35 && Math.random() < 0.45 ? pick(['misha', 'sonya']) : null;
    const earned = F.earned || 0, spent = F.spent || 0, c0 = F.clean0 === undefined ? cleanEnd : F.clean0;
    const numbers = { earned, spent, clean0: Math.round(c0), clean1: Math.round(cleanEnd) };

    // кризис: 3 таких дня подряд — Андрей срывается с вахты (плохая концовка)
    clampAll();
    const kidsSat = (S.kids.misha.satiety + S.kids.sonya.satiety) / 2, kidsMood = (S.kids.misha.mood + S.kids.sonya.mood) / 2;
    const crisisList = [
      kidsSat < 25 && '🍽️ дети голодают',
      kidsMood < 10 && '😭 дети несчастны',
      m.mood < 10 && '🫠 вы на нуле',
      cleanEnd < 15 && '🦠 дом в руинах',
      S.money < 0 && '💸 долги',
    ].filter(Boolean);
    const crisisDay = crisisList.length >= 3;
    let gameOver = false;
    if (crisisDay) {
      S.crisis = (S.crisis || 0) + 1;
      const why = ' Причины: ' + crisisList.join(', ') + '.';
      if (S.crisis === 1) lines.push({ t: '📞 Андрей что-то {почувствовал|почувствовала} и {звонил|звонила} с вахты 6 раз: «Всё хорошо?» — «Ага…». Кризис 1/3.' + why, c: 'bad' });
      else if (S.crisis === 2) lines.push({ t: '🚨 Андрей не спит и смотрит билеты домой. Ещё один такой день — и он сорвётся с вахты! Кризис 2/3.' + why, c: 'bad' });
      else { gameOver = true; S.failed = true; S.failedReasons = crisisList; }
    } else if (S.crisis > 0) {
      S.crisis = 0;
      lines.push({ t: '😮‍💨 Кризис миновал. Андрей {выдохнул|выдохнула} и {вернулся|вернулась} к работе.', c: 'good' });
    }

    // статистика
    const st = S.stats;
    st.days++;
    st.clean += cleanAvg();
    st.kidsMood += (S.kids.misha.mood + S.kids.sonya.mood) / 2;
    st.momMood += m.mood;
    st.dogMood += d.mood;

    // новый день
    S.day++;
    S.time = CFG.WAKE;
    resetFlags();
    S.today = { event: null, sale: false, craft: false, boss: BOSS[S.day] || null };
    ['misha', 'sonya'].forEach(id => {
      const k = S.kids[id];
      k.at = 'home'; k.asleep = true; k.ready = false; k.sick = false;
    });
    d.out = false;
    d.need = Math.min(d.need + 25, 85);
    S.player = { x: 14.2, z: 8.6, yaw: Math.PI / 2, pitch: 0 };

    // деньги
    let money = [];
    if (S.day % CFG.SALARY_EVERY === 2) {
      S.money += diffK().salary;
      money.push({ t: `💸 Андрей {перевёл|перевела} зарплату: +${HW.fmtMoney(diffK().salary)}. Срочно потратить на что-то ненужное!`, c: 'good' });
    }
    if (S.day % CFG.SALARY_EVERY === 15) {
      S.money -= CFG.BILLS;
      money.push({ t: `🧾 Пришла коммуналка: −${HW.fmtMoney(CFG.BILLS)}. Свет, вода и интернет нынче — предметы роскоши.`, c: 'bad' });
    }
    // утро нового дня: болезнь от грязи, бонус за серию, анонс завтрашнего босса
    if (sickNext) {
      S.kids[sickNext].sick = true;
      money.push({ t: `🤒 ${S.kids[sickNext].name} заболел(а) — в грязном доме микробы устроили вечеринку. Сегодня ребёнок дома.`, c: 'bad' });
    }
    if (S.today.boss === 'pox') S.kids.misha.sick = true;
    if (S.projDone.herbs) { S.house.groceries += 1; money.push({ t: '🌿 С подоконника собрали зелень: +1 продукт. Соня гордо несёт укроп на кухню.', c: 'good' }); }
    if (S.projDone.blog) {
      const don = 600 + Math.round(Math.random() * 12) * 50;
      S.money += don;
      money.push({ t: `📱 Подписчики блога задонатили ${HW.fmtMoney(don)}. Пишут: «Держитесь, мы с вами».`, c: 'good' });
    }
    if (S.streak >= 2) { m.mood += 4 * Math.min(S.streak, 5); money.push({ t: `🔥 Серия идеальных дней: ${S.streak}! Настроение +${4 * Math.min(S.streak, 5)}.`, c: 'good' }); }
    if (S.day % 7 === 1 && S.day > 1) money.push({ t: `📈 Началась неделя ${G.week()}. Дети растут, аппетиты и бардак — тоже.`, c: 'warn' });
    if (BOSS[S.day + 1] && BOSS[S.day + 1] !== BOSS[S.day]) money.push({ t: '📅 Завтра: ' + BOSS_INTRO[BOSS[S.day + 1] === 'mil2' ? 'mil2' : BOSS[S.day + 1]].title, c: 'warn' });
    clampAll();
    const report = { reason, day: S.day - 1, stars, streak: S.streak, numbers, weekday: wd(S.day), lines: lines.concat(money), ended: S.day > CFG.SHIFT_DAYS || gameOver, failed: gameOver, crisis: S.crisis || 0, event: null };
    if (!report.ended) report.event = S.today.boss && BOSS[S.day - 1] !== S.today.boss ? BOSS_INTRO[S.today.boss] : morningEvent();
    addLog('Начался день ' + S.day);
    return report;
  }

  // ---------- утренние события ----------
  const EVENTS = [
    { id: 'sick', cond: () => schoolDay(S.day), run() {
      S.kids.sonya.sick = true;
      return { title: 'Соня заболела 🤧', text: 'Соня проснулась с соплями до колен. Садик отменяется, мультики — нет. Сегодня она дома, оставлять её одну нельзя.' };
    } },
    { id: 'call', run() { S.mom.mood += 10; return { title: 'Звонок с вахты 📞', text: 'Андрей {позвонил|позвонила} в 5 утра. {Сказал|Сказала}, что скучает и что там −40. Вам сразу стало теплее (и не выспались).' }; } },
    { id: 'sale', run() { S.today.sale = true; return { title: 'Распродажа! 🏷️', text: 'Мебельный объявил −20% на всё, только сегодня. Кошелёк нервно закурил в сторонке.' }; } },
    { id: 'grandma', run() { S.money += 5000; return { title: 'Перевод от бабушки 👵', text: 'Бабушка прислала 5 000 ₽ с припиской «на витамины детям». Витамины будут шоколадными.' }; } },
    { id: 'pie', run() { S.house.portions += 4; S.house.cookedDay = S.day; return { title: 'Соседка с пирогом 🥧', text: 'Соседка принесла пирог «познакомиться». Пирог съедобен, соседка подозрительна. +4 порции.' }; } },
    { id: 'slippers', cond: () => !S.projDone.dog, run() { S.mom.mood -= 8; return { title: 'Тапочный геноцид 🐕', text: 'Бадди сгрыз ваш левый тапок. Правый он, видимо, оставил на десерт.' }; } },
    { id: 'tooth', run() { const k = pick(['misha', 'sonya']); S.money -= 100; S.kids[k].mood += 10;
      return { title: 'Выпал зуб! 🦷', text: (k === 'misha' ? 'У Миши' : 'У Сони') + ' выпал зуб. Зубная фея (вы) оставила под подушкой 100 ₽. Курс на зубы растёт.' }; } },
    { id: 'portrait', run() { S.mom.mood += 6; return { title: 'Портрет семьи 🖍️', text: 'Соня нарисовала портрет семьи. Вы — с короной, Андрей — в каске, Бадди — самый большой. Всё правильно.' }; } },
    { id: 'grade5', cond: () => schoolDay(S.day), run() { S.kids.misha.grades += 3; S.kids.misha.mood += 8; return { title: 'Пятёрка! ⭐', text: 'Миша вспомнил, что вчера получил пятёрку по чтению. Сообщил это за завтраком с набитым ртом. Гордимся!' }; } },
    { id: 'rain', run() { S.house.clean.hall -= 10; return { title: 'Ливень 🌧️', text: 'За окном льёт. Прогулка с Бадди будет мокрой, а прихожая — грязной. Сапоги наготове.' }; } },
    { id: 'discount', run() { S.house.groceries += 4; S.money -= 600; return { title: 'Скидки в магазине 🥕', text: 'Соседка взяла вам продукты по акции «два по цене одного». Отдали 600 ₽, получили запас на день. Выгода!' }; } },
    { id: 'friend', run() { S.mom.mood += 10; S.mom.energy -= 3; return { title: 'Звонок подруги ☎️', text: 'Позвонила подруга Лена. Проболтали 40 минут о всём на свете, пока дети спали. Энергии чуть меньше, души — больше.' }; } },
    { id: 'question', run() { S.mom.mood -= 2; return { title: 'Неудобный вопрос 🤔', text: 'Миша за завтраком спросил, откуда берутся дети. Вы сказали «из магазина». Соня теперь хочет купить сестрёнку.' }; } },
    { id: 'neighbor2', run() { S.dog.mood -= 5; return { title: 'Соседский пёс 🐶', text: 'Соседский пёс лаял всю ночь. Бадди отвечал. Теперь у них дружба, а у вас мешки под глазами.' }; } },
    { id: 'parcel', run() { S.mom.mood += 8; S.mom.energy += 5; return { title: 'Посылка от {мужа|жены} 📦', text: 'Андрей {прислал|прислала} кофе и записку «держись». Держимся. Кофе — особенно.' }; } },
    { id: 'craft', cond: () => wd(S.day) < 4 && !quarantine(S.day) && !quarantine(S.day + 1), run() {
      S.today.craft = true;
      return { title: 'Поделка к завтра 🌰', text: 'Мише задали поделку из природных материалов. Сдавать завтра. Природа, держись! (Сделать можно у Миши или за детской партой.)' };
    } },
    { id: 'leak', run() {
      return { title: 'Потёк кран 🚰', text: 'В ванной потёк кран. Капает громче, чем {храпел|храпела} Андрей. Что делаем?',
        choices: [
          { label: 'Вызвать сантехника (2 500 ₽)', run: () => { S.money -= 2500; return 'Сантехник пришёл, вздохнул, взял деньги. Кран больше не капает.'; } },
          { label: 'Починить самой (1 ч)', run: () => {
            const r = G.perform({ min: 60, run: () => {
              S.mom.energy -= 10;
              if (Math.random() < 0.7) { S.mom.mood += 10; return 'Кран побеждён! Вы чувствуете себя Андреем, только лучше.'; }
              S.house.clean.bath -= 20; return { text: 'Кран победил. Ванная немного затоплена, зато вы помыли пол. Нечаянно.', type: 'bad' };
            } });
            return r;
          } },
        ] };
    } },
  ];
  function morningEvent() {
    if (Math.random() > 0.45 + week() * 0.04) return null;
    const pool = EVENTS.filter(e => !e.cond || e.cond());
    const e = pick(pool);
    S.today.event = e.id;
    const r = e.run();
    clampAll();
    addLog(r.title);
    return r;
  }
  G.firstEvent = function () {
    return { title: 'Добро пожаловать домой! 🏡', text:
      'Вы — Анна. Вы с Андреем купили дом, и Андрей тут же {уехал|уехала} на вахту на ' + CFG.SHIFT_DAYS + ' дней. На вас остались Миша (8 лет, школа), Соня (4 года, садик) и пёс Бадди (возраст неизвестен, интеллект тоже).\n\n' +
      'Задача: продержаться до возвращения {мужа|жены}, обставить дом, не потерять детей и не сойти с ума.\n\n' +
      'Сегодня воскресенье — день распаковки и короткого обучения: подсказка вверху покажет, что делать, а стрелка внизу — куда идти. С понедельника начинается настоящий хардкор.' };
  };

  // ---------- конец вахты ----------
  G.finalScore = function () {
    const st = S.stats, n = Math.max(1, st.days);
    const parts = [
      { name: 'Уют дома', v: Math.min(100, Math.round(comfortScore() / 15 * 100)) },
      { name: 'Чистота', v: Math.round(st.clean / n) },
      { name: 'Оценки Миши', v: Math.round(S.kids.misha.grades) },
      { name: 'Развитие Сони', v: Math.round(S.kids.sonya.dev) },
      { name: 'Настроение детей', v: Math.round(st.kidsMood / n) },
      { name: 'Ваше настроение', v: Math.round(st.momMood / n) },
      { name: 'Ваша форма', v: Math.round(S.mom.fitness) },
      { name: 'Счастье Бадди', v: Math.round(st.dogMood / n) },
    ];
    const total = Math.round(parts.reduce((a, p) => a + p.v, 0) / parts.length);
    let rank, text;
    if (total >= 80) { rank = 'Легенда домоводства 👑'; text = 'Андрей {зашёл|зашла} в дом, {увидел|увидела} чистоту, сытых детей и довольную собаку — и {попросился|попросилась} обратно на вахту, отдохнуть от вашего совершенства.'; }
    else if (total >= 65) { rank = '{Супермама 🦸‍♀️|Суперпапа 🦸‍♂️}'; text = 'Андрей {вернулся|вернулась} в уютный дом. Вы молодец! {Он даже предложил сам|Она даже предложила сама} помыть посуду. Один раз.'; }
    else if (total >= 50) { rank = 'Крепкий середнячок 💪'; text = 'Дом стоит, дети живы, собака на месте. Андрей {наступил|наступила} на лего, но {сделал|сделала} вид, что так и надо.'; }
    else if (total >= 35) { rank = '{Выжившая 🧟‍♀️|Выживший 🧟‍♂️}'; text = 'Андрей {открыл|открыла} дверь, {посмотрел|посмотрела} на всё это и тихо {спросил|спросила}: «А можно я ещё на полгодика?»'; }
    else { rank = 'Хаос-менеджер 🔥'; text = 'Андрей {вернулся|вернулась} и долго {искал|искала} дом. {Нашёл|Нашла} по запаху. Но вы все живы — это главное!'; }
    return { parts, total, rank, text };
  };
  G.failInfo = function () {
    return { days: S.day - 1, reasons: S.failedReasons || [] };
  };
  // Новая вахта: дом и вещи сохраняются, календарь начинается заново.
  // Зарплата придёт на 2-й день, как в первой вахте (здесь не начисляем).
  G.newShift = function () {
    const dd = S.day - 1;                 // на сколько дней сдвигаем календарь
    const dm = dd * 1440;                 // то же в минутах для абсолютных отметок
    const H = S.house;
    // абсолютные отметки времени (день*1440+минуты)
    ['doneAt', 'moldAt'].forEach(k => { if (H.washer[k]) H.washer[k] -= dm; });
    ['doneAt', 'burnAt'].forEach(k => { if (H.stove[k]) H.stove[k] -= dm; });
    if (H.mc.doneAt) H.mc.doneAt -= dm;
    S.pending.forEach(p => { p.at -= dm; });
    ['misha', 'sonya'].forEach(id => { if (S.kids[id].wishAt) S.kids[id].wishAt -= dm; });
    S.incident = null;
    // номера дней
    if (H.cookedDay) H.cookedDay = Math.max(1, H.cookedDay - dd);
    for (const id in S.proj) {
      const p = S.proj[id];
      ['start', 'lastDay', 'todayDay'].forEach(k => { if (p[k]) p[k] = Math.max(0, p[k] - dd); });
    }
    S.shift++;
    S.day = 1;
    S.today = { event: null, sale: false, craft: false, boss: BOSS[1] || null };
    S.stats = { days: 0, clean: 0, kidsMood: 0, momMood: 0, dogMood: 0, late: 0, missed: 0, accidents: 0, homework: 0 };
    S.crisis = 0; S.failed = false; S.streak = 0;
    resetFlags();
    addLog('Андрей {отдохнул|отдохнула} месяц и снова {уехал|уехала}. Вахта №' + S.shift);
    G.save();
  };

  // ---------- проверки ----------
  // takeKids — дети, которые не спят, едут с вами; quick — короткая отлучка, пока дети спят
  function canLeave(opts) {
    opts = opts || {};
    const awake = kidsAwakeHome();
    const asleep = kidsHome().filter(id => S.kids[id].asleep);
    if (asleep.length && !opts.quick) return 'Дети спят. Уйти из дома ночью — сюжет для криминальной хроники.';
    if (awake.length && !opts.takeKids) {
      return awake.includes('sonya') ? 'Соню (4 года) одну не оставишь. Хотя она уверена, что справится.' : 'Мишу не с кем оставить, а туда его не возьмёшь. Бадди как няня не сертифицирован.';
    }
    return null;
  }
  const withKidsNote = () => {
    const a = kidsAwakeHome();
    if (!a.length) return '';
    if (a.length === 2) return ' Дети поехали с вами и всю дорогу спорили, кто главный.';
    return a[0] === 'sonya' ? (S.kids.sonya.sick ? ' Соня каталась с вами в пижаме и с соплями.' : ' Соня ехала с вами и пела про жирафа.') : ' Миша ехал с вами и рассказывал про Майнкрафт.';
  };

  // ---------- действия по объектам ----------
  function A(label, min, can, run, extra) { return Object.assign({ label, min, can, run }, extra || {}); }
  const check = c => (typeof c === 'function' ? c() : c) || null;

  function mealFlag(kidsFed) {
    if (!kidsFed) return;
    const t = S.time;
    if (t < 10.5 * 60) S.flags.breakfast = true;
    else if (t >= 12 * 60 && t < 16.5 * 60) S.flags.lunch = true;
    else if (t >= 17 * 60) S.flags.dinner = true;
  }
  function quickBreakfast() {
    return A('Бутерброды на скорую руку', 15, () => {
      if (S.house.groceries < 1) return 'Нет продуктов даже на бутерброд.';
      if (S.time > 11 * 60) return 'Бутерброды на обед? Андрей бы {одобрил|одобрила}, но вы — нет.';
      return null;
    }, () => {
      const H = S.house, eaters = kidsAwakeHome();
      H.groceries -= Math.max(1, Math.ceil((eaters.length + 1) / 2));
      eaters.forEach(id => { S.kids[id].satiety = Math.min(100, S.kids[id].satiety + 60); });
      S.mom.satiety = Math.min(100, S.mom.satiety + 50);
      H.dishes += 1;
      mealFlag(eaters.length > 0);
      S.flags.fed = true;
      eaters.forEach(id => fulfill(id, 'eat'));
      return '🥪 Бутерброды! Соня съела только сыр, Миша — только колбасу, хлеб достался Бадди.';
    });
  }
  function feedFamily() {
    return A('Накормить семью', 20, () => {
      const eaters = kidsAwakeHome().length + 1;
      if (S.house.portions < 1) return 'Нет готовой еды. Сначала приготовьте.';
      if (S.house.dishes + eaters > 16) return 'Чистые тарелки кончились. Есть из кастрюли — не наш метод.';
      return null;
    }, () => {
      const H = S.house;
      const eaters = kidsAwakeHome();
      let fed = 0;
      eaters.forEach(id => { if (H.portions > 0) { H.portions--; S.kids[id].satiety = 100; S.kids[id].mood += S.owned.diningTable ? 8 : 4; fed++; } });
      let momAte = false;
      if (H.portions > 0) { H.portions--; S.mom.satiety = 100; momAte = true; fed++; }
      H.dishes += fed;
      H.clean.kitchen -= 3;
      if (S.owned.diningTable) S.mom.mood += 5;
      mealFlag(eaters.length > 0);
      S.flags.fed = true;
      const wishNote = eaters.map(id => fulfill(id, 'eat')).join('');
      if (!eaters.length) return momAte ? 'Поели в тишине. Без детей. Это было почти как в ресторане.' : 'Еды не хватило даже вам.';
      return (momAte ? '' : 'Вам не досталось — героизм засчитан. ') + say('fed') + wishNote;
    });
  }

  const ACT = {
    door() {
      const school = schoolDay(S.day);
      const F = S.flags;
      const list = [];
      const wm = (S.kids.misha.at === 'school') && (S.kids.sonya.at === 'garden');
      // выехать можно рано, но школа открывается в 8:00 — ждём у ворот
      list.push(A('🚗 Отвезти детей в школу и сад', () => (S.time + 20 < 8 * 60 ? 8 * 60 - S.time + 25 : 45), () => {
        if (!school) return 'Сегодня выходной. Дети будут против.';
        if (F.delivered) return 'Уже отвезли (или поздно).';
        if (S.time > 10 * 60) return 'Слишком поздно, школа уже идёт.';
        const k = ['misha', 'sonya'].filter(id => S.kids[id].at === 'home' && !S.kids[id].sick);
        if (!k.length) return 'Некого везти.';
        if (k.some(id => !S.kids[id].ready)) return 'Дети не собраны. В пижамах в школу? Смело, но нет.';
        return null;
      }, (t0) => {
        const out = [];
        F.delivered = true;
        const early = t0 + 20 < 8 * 60;
        const arrive = Math.max(t0 + 20, 8 * 60);
        if (early) out.push(pick([
          `🏫 Приехали к школе в ${HW.fmtTime(t0 + 20)}. Ворота закрыты. Ждали до 8:00 вместе с другими «ранними пташками» — обсудили цены на сменку.`,
          `🏫 Были у школы в ${HW.fmtTime(t0 + 20)}. Охранник посмотрел на часы, потом на вас, и открыл ровно в 8:00. Ни минутой раньше.`,
          `🏫 Слишком рано! До 8:00 сидели в машине: Соня успела поспать, Миша — доесть бутерброд, вы — постареть на полчаса.`,
        ]));
        const sickRide = S.kids.sonya.sick && S.kids.sonya.at === 'home';
        if (!S.kids.misha.sick) { S.kids.misha.at = 'school'; }
        if (!S.kids.sonya.sick) { S.kids.sonya.at = 'garden'; }
        if (sickRide) out.push('🤧 Больная Соня каталась с вами в машине, закутанная в плед как шаурма.');
        if (arrive > 8 * 60 + 30 && S.kids.misha.at === 'school') {
          S.kids.misha.grades -= 2; S.stats.late++;
          out.push({ text: say('late'), type: 'bad' });
        } else out.push(say('deliver'));
        return out;
      }));
      list.push(A('🏫 Забрать Мишу из школы', 40, () => {
        if (S.kids.misha.at !== 'school') return 'Миши в школе нет.';
        if (S.time < 13 * 60 + 30) return 'Уроки до 13:30. Подождите.';
        return canLeave({ takeKids: true });
      }, () => { const n = withKidsNote(); S.kids.misha.at = 'home'; S.flags.mishaPicked = true; S.kids.misha.mood += 5; return say('pickMisha') + n; }));
      list.push(A('🧸 Забрать Соню из садика', 40, () => {
        if (S.kids.sonya.at !== 'garden') return 'Сони в садике нет.';
        if (S.time < 12 * 60) return 'Рано, у них сейчас сончас и бунт против манки.';
        return canLeave({ takeKids: true });
      }, () => { const n = withKidsNote(); S.kids.sonya.at = 'home'; S.flags.sonyaPicked = true; S.kids.sonya.mood += 5; return say('pickSonya') + n; }));
      if (wm || (S.kids.misha.at === 'school' && S.kids.sonya.at === 'garden')) {
        list.push(A('🚗 Забрать обоих по пути', 55, () => {
          if (S.time < 13 * 60 + 30) return 'Миша учится до 13:30.';
          return canLeave({ takeKids: true });
        }, () => {
          S.kids.misha.at = 'home'; S.kids.sonya.at = 'home';
          S.flags.mishaPicked = S.flags.sonyaPicked = true;
          return say('pickBoth');
        }));
      }
      list.push(A('🐕 Выгулять Бадди', 30, () => (G.dogAway() ? 'Бадди сбежал! Сначала поймайте его — гулять не с кем.' : canLeave({ takeKids: true, quick: true })), () => {
        const n = kidsAwakeHome().length ? ' Дети гуляли с вами и пытались оседлать Бадди.' : '';
        S.dog.need = 0; S.dog.mood += 20; S.mom.fitness += 1; S.mom.energy -= 5; S.mom.mood += 3;
        S.flags.dogWalks++; S.life.walks++;
        S.house.clean.hall -= 4;
        return say('dogWalk') + n;
      }));
      list.push(A('🛒 Съездить в магазин', () => (kidsAwakeHome().length ? 110 : 80), () => canLeave({ takeKids: true }), null, { shop: 'store' }));
      if (S.today.boss === 'meeting') list.unshift(A('🏫 Поехать на родительское собрание', 90, () => {
        if (S.flags.meeting) return 'Уже были. Повторно слушать про шторы — выше человеческих сил.';
        if (S.time < 18 * 60 || S.time > 19.25 * 60) return 'Собрание с 18:00. Выехать можно до 19:15.';
        return canLeave({ takeKids: true });
      }, () => {
        S.flags.meeting = true; S.kids.misha.grades += 3; S.mom.energy -= 6;
        return '🏫 Отсидели собрание. Узнали, что Миша «способный, но болтает». Новость года. Дети всё это время рисовали на доске.';
      }, { away: true }));
      list.push(A('🏋️‍♀️ Фитнес-клуб (600 ₽)', 100, () => {
        if (S.money < 600) return 'Не хватает денег. Можно бегать от проблем бесплатно.';
        if (S.mom.energy < 20) return 'Сил нет даже дойти до машины.';
        return canLeave({});
      }, () => {
        S.money -= 600; S.mom.fitness += 5; S.mom.mood += 12; S.mom.energy -= 12; S.mom.satiety -= 10;
        return pick(['🏋️‍♀️ Фитнес! Тренер сказал «ещё разок» 14 раз. Вы его почти простили.',
          '🏋️‍♀️ Позанимались. В раздевалке узнали все сплетни района — это тоже кардио.']);
      }));
      list.forEach(a => { if (!a.shop) a.away = true; }); // выезды: дома без вас происшествия не начинаются
      return { title: '🚪 Входная дверь', info: [school ? 'Школа с 8:30 до 13:30, садик до 18:30' : 'Выходной: школа и сад отдыхают'], actions: list };
    },

    fridge() {
      const H = S.house;
      return { title: '🧊 Холодильник', info: [`Продукты: ${H.groceries} шт. · Готовая еда: ${H.portions} порц.`, `Корм Бадди: ${H.dogFood} · Сладости: ${H.sweets}`],
        actions: [
          A('Перекусить', 5, () => H.groceries < 1 ? 'В холодильнике только свет и одинокий лимон.' : null,
            () => { H.groceries--; S.mom.satiety += 30; return say('snack'); }),
          quickBreakfast(),
          A(S.owned.coffeeMachine ? 'Капучино из кофемашины' : 'Выпить кофе', 5, () => (S.flags.coffee || 0) >= (S.owned.coffeeMachine ? 4 : 3) ? 'Хватит кофе. Сердце уже стучит в ритме техно.' : null,
            () => { S.flags.coffee = (S.flags.coffee || 0) + 1; S.mom.energy += S.owned.coffeeMachine ? 18 : 12; if (S.owned.coffeeMachine) S.mom.mood += 2;
              return S.owned.coffeeMachine ? '☕ Капучино с пенкой! Кофемашина — единственная в доме, кто делает всё с первого раза.' : say('coffee'); }),
          A('Посмотреть внутрь с надеждой', 2, null, () => (H.groceries < 4 ? 'Вы смотрели в холодильник, холодильник — в вас. Еды не прибавилось. Пора в магазин.' : 'Еда есть. Чувство защищённости +1.')),
        ] };
    },

    stove() {
      const H = S.house;
      const stTxt = { idle: 'свободна', cooking: 'варится до ' + HW.fmtTime(H.stove.doneAt % 1440), ready: '⚠️ ГОТОВО — снимите до ' + HW.fmtTime(H.stove.burnAt % 1440) }[H.stove.state];
      return { title: '🔥 Плита', info: [`Продукты: ${H.groceries} шт. · Готово: ${H.portions} порц.`, 'Плита: ' + stTxt],
        actions: [
          A('Поставить вариться (4 продукта → 6 порций)', 15, () => H.groceries < 4 ? 'Нужно 4 продукта. Из воздуха пока не умеем.' : (H.stove.state !== 'idle' ? 'Плита занята. Две кастрюли — это уже ресторан.' : null), (t0, mins) => {
            H.groceries -= 4; H.dishes += 2; H.clean.kitchen -= 6; S.mom.energy -= 4;
            H.stove.state = 'cooking'; H.stove.yield = 6; H.stove.doneAt = abs() + mins + 45; H.stove.burnAt = H.stove.doneAt + 30;
            return '🍲 Кастрюля на плите. Готово через 45 минут — снимите вовремя, иначе будет «блюдо от шефа: уголь».';
          }),
          A('Снять с плиты', 2, () => H.stove.state === 'ready' ? null : (H.stove.state === 'cooking' ? 'Ещё варится, готово в ' + HW.fmtTime(H.stove.doneAt % 1440) + '.' : 'На плите пусто. Только пятно от прошлого борща.'), () => {
            H.stove.state = 'idle'; H.portions += H.stove.yield || 6; H.stove.yield = 0; H.cookedDay = S.day;
            return say('cooked');
          }),
          Object.assign(A('🎂 Испечь торт для Сони (6 продуктов)', 90, () => S.today.boss !== 'bday' ? 'Торт — только по праздникам. Иначе это не праздник, а вторник.' : (S.flags.cake ? 'Торт уже есть. Второй съест Бадди.' : (H.groceries < 6 ? 'Нужно 6 продуктов.' : null)), () => {
            H.groceries -= 6; S.flags.cake = true; H.dishes += 3; H.clean.kitchen -= 10; S.mom.energy -= 8;
            return '🎂 Торт испечён! Кривоватый, но с душой. Соня уже облизала половину крема «на пробу».';
          }), { allOrNothing: true }),   // полторта не бывает
          feedFamily(),
        ] };
    },
    multicooker() {
      const H = S.house;
      return { title: '🍲 Мультиварка', info: [`Продукты: ${H.groceries} шт.`], actions: [
        A('Загрузить мультиварку', 5, () => H.groceries < 4 ? 'Нужно 4 продукта.' : (H.mc.state !== 'idle' ? 'Уже готовит. Терпение.' : null), (t0, mins) => {
          H.groceries -= 4; H.dishes += 1; S.mom.energy -= 2;
          H.mc.state = 'cooking'; H.mc.yield = 6; H.mc.doneAt = abs() + mins + 30;
          return '🍲 Мультиварка запущена. Через 30 минут еда будет готова и не подгорит — вы просто нажали кнопку и почувствовали себя шеф-поваром.';
        }),
      ] };
    },
    diningTable() { return { title: '🍽️ Обеденный стол', info: [`Готовая еда: ${S.house.portions} порц.`], actions: [feedFamily()] }; },

    sink() {
      const H = S.house;
      const mins = () => 5 + H.dishes * 3;
      return { title: '🚰 Мойка', info: [`Грязной посуды: ${H.dishes} · Бытовая химия: ${H.chem}`], actions: [
        A('Помыть посуду', mins, () => H.dishes < 1 ? 'Посуда чистая. Сфотографируйте, это редкость.' : (H.chem < 1 ? 'Закончилось моющее. Тереть пальцем — не вариант.' : null), () => {
          H.dishes = 0; H.chem--; S.mom.energy -= 5; S.mom.mood -= 2;
          return say('dishes');
        }),
      ] };
    },
    dishwasher() {
      const H = S.house;
      return { title: '🫧 Посудомойка', info: [`Грязной посуды: ${H.dishes}`], actions: [
        A('Загрузить и запустить', 10, () => H.dishes < 1 ? 'Нечего мыть.' : (H.chem < 1 ? 'Нет таблеток для посудомойки.' : null), () => {
          H.dishes = 0; H.chem--;
          return say('dishwasher');
        }),
      ] };
    },

    bowl() {
      const H = S.house;
      return { title: '🥣 Миска Бадди', info: [`Корм: ${H.dogFood} порц. · Сытость Бадди: ${Math.round(S.dog.satiety)}%`], actions: [
        A('Покормить Бадди', 3, () => (G.dogAway() ? 'Бадди сбежал — миска подождёт. Сначала поймайте его у входной двери.' : (H.dogFood < 1 ? 'Корм закончился. Бадди смотрит на ваш бутерброд.' : null)), () => {
          H.dogFood--; S.dog.satiety = 100; S.dog.mood += 8; S.flags.dogFed++;
          return say('dogFeed');
        }),
      ] };
    },

    laptop() {
      const pay = () => Math.round((1800 + S.mom.knowledge * 25) * (S.owned.desk ? 1.3 : 1) / 50) * 50;
      return { title: '💻 Ноутбук', info: [`Подработка: ~${HW.fmtMoney(pay())} за 2 часа`], actions: [
        A('Подработка (фриланс)', 120, () => {
          if (S.mom.energy < 15) return 'Глаза слипаются. Напишете заказчику «ывапролд».';
          if (S.time < 7 * 60) return 'Слишком рано даже для фриланса.';
          return null;
        }, () => {
          const p = pay(); S.money += p; S.life.earned += p; S.mom.energy -= 12; S.mom.mood -= 3; S.mom.knowledge += 0.5;
          return `💼 +${HW.fmtMoney(p)}. ` + say('freelance');
        }),
        A('Заказать доставку продуктов', 5, null, null, { shop: 'delivery' }),
        A('Видеозвонок Андрею', 20, () => S.flags.called ? 'Уже звонили сегодня. {Он на смене, не надо его|Она на смене, не надо её} отвлекать фотками кота соседей.' : null, () => {
          S.flags.called = true; S.mom.mood += 12;
          kidsAwakeHome().forEach(id => S.kids[id].mood += 8);
          return say('callAndrey');
        }),
      ] };
    },

    bed() {
      const night = S.time >= 20 * 60;
      return { title: S.owned.bed ? '🛏️ Кровать' : '🛏️ Матрас на полу', info: [S.owned.bed ? 'Настоящая кровать!' : 'Спина говорит: «Купи кровать»'], actions: [
        A('Лечь спать (до утра)', 0, () => {
          if (!night) return 'Ещё рано. Солнце светит, совесть не спит.';
          return null;
        }, () => {
          if (kidsAwakeHome().length) { S.flags.kidsBedLate = true; kidsAwakeHome().forEach(id => S.kids[id].asleep = true); }
          S._sleepNow = true;
          return null;
        }),
        A('Вздремнуть 1 час', 60, () => (kidsAwakeHome().includes('sonya') ? 'Соня не спит — значит, и вы не спите. Закон природы.' : ((S.flags.naps || 0) >= 1 ? 'Уже дремали. Второй раз — это уже не дрёма, а побег.' : null)), () => {
          S.flags.naps = (S.flags.naps || 0) + 1;
          S.mom.energy += S.owned.bed ? 22 : 15;
          return pick(['😴 Вздремнули. Проснулись от того, что Бадди лизнул вас в ухо.', '😴 Поспали час. Приснилось, что вы в отпуске. Жестоко.']);
        }),
        A('Почитать перед сном', 30, () => (S.owned.bookshelf ? 'Есть книжный шкаф — читать лучше там.' : null), () => {
          S.mom.knowledge += 1; S.mom.mood += 4;
          return '📖 Прочитали 3 страницы и уснули на 4-й. Книга упала на лицо — это массаж.';
        }),
      ] };
    },
    bookshelf() {
      return { title: '📚 Книжный шкаф', info: [`Знания: ${Math.round(S.mom.knowledge)} (влияют на заработок)`], actions: [
        A('Почитать книгу', 60, () => S.mom.energy < 10 ? 'Буквы расплываются. Даже в заголовке.' : null, () => {
          S.mom.knowledge += 3; S.mom.mood += 8; S.mom.energy -= 2;
          return pick(['📖 Прочитали главу. Героиня книги тоже страдает, но у неё хотя бы нет собаки.', '📖 Читали про тайм-менеджмент. Посмеялись.']);
        }),
      ] };
    },
    sofa() {
      return { title: '🛋️ Диван', info: ['Лучшее место в доме'], actions: [
        A(`Отдохнуть 30 минут (${2 - Math.min(2, S.flags.rests || 0)}/2)`, 30, () => (S.flags.rests || 0) >= 2 ? 'Хватит лежать — диван уже принял вашу форму. На сегодня отдых исчерпан.' : null, () => {
          const n = S.flags.rests = (S.flags.rests || 0) + 1;
          const k = n === 1 ? 1 : 0.5;
          S.mom.energy += 8 * k; S.mom.mood += 5 * k;
          return n === 1 ? '🛋️ Полежали. Диван принял вас как родную. Он вообще единственный, кто ничего не просит.' : '🛋️ Второй заход на диван. Уже не так сладко: в голове крутится список дел.';
        }),
      ] };
    },
    tv() {
      const kids = kidsAwakeHome();
      return { title: '📺 Телевизор', info: [kids.length ? 'Дети рядом и жаждут мультиков' : 'Тихо и спокойно'], actions: [
        A('Включить детям мультики', 30, () => !kids.length ? 'Детей нет дома. Смотреть «Фиксиков» в одиночку — это уже диагноз.' : null, () => {
          kids.forEach(id => S.kids[id].mood += 10); S.mom.energy += 4;
          return '📺 Мультики! 30 минут тишины по цене одной совести.' + kids.map(id => fulfill(id, 'play')).join('');
        }),
        A('Посмотреть сериал', 60, () => kids.length ? 'При детях? Там же сцены с поцелуями! И налоговой.' : ((S.flags.series || 0) >= 1 ? 'Одна серия в день. Иначе это уже не сериал, а образ жизни.' : null), () => {
          S.flags.series = 1;
          S.mom.mood += 12; S.mom.energy += 5;
          return '📺 Одна серия превратилась в одну серию. Чудо самоконтроля!';
        }),
      ] };
    },
    treadmill() {
      return { title: '🏃‍♀️ Беговая дорожка', info: [`Форма: ${Math.round(S.mom.fitness)}`], actions: [
        A('Тренировка дома', 45, () => S.mom.energy < 20 ? 'Сил нет. Дорожка подождёт, она терпеливая.' : null, () => {
          S.mom.fitness += 3; S.mom.mood += 6; S.mom.energy -= 10;
          return '🏃‍♀️ Пробежали 3 км и никуда не убежали. Философично.';
        }),
        A('Повесить на дорожку бельё', 5, () => S.house.laundryClean < 1 ? 'Нечего вешать. Даже дорожка удивлена.' : null, () => '👕 Беговая дорожка выполняет своё истинное предназначение — сушилки.'),
      ] };
    },

    tub() {
      const H = S.house;
      const kids = kidsAwakeHome();
      const list = [
        A('Принять ванну', 40, () => (kids.includes('sonya') ? 'Соня не спит. Она будет стучать в дверь каждые 40 секунд.' : null), () => {
          S.mom.mood += 15; S.mom.energy += 6;
          return say('bathMom');
        }),
        A('Искупать детей', 35, () => !kids.length ? 'Детей нет дома.' : null, () => {
          kids.forEach(id => { S.kids[id].hygiene = 100; S.kids[id].mood += 3; });
          H.clean.bath -= 10;
          return say('bathKids');
        }),
      ];
      if (!S.owned.washer) list.push(A('Постирать руками', 80, () => H.laundryDirty < 1 ? 'Грязного белья нет. Вот это да!' : (H.chem < 1 ? 'Нет порошка.' : null), () => {
        const n = Math.min(4, H.laundryDirty);
        H.laundryDirty -= n; H.laundryClean += n; H.chem--; S.mom.energy -= 14; S.mom.mood -= 5;
        return `🧼 Постирали руками ${n} компл. Руки теперь как у прабабушки, зато бельё чистое. Купите стиралку!`;
      }));
      return { title: '🛁 Ванна', info: [], actions: list };
    },
    washer() {
      const H = S.house, w = H.washer;
      const list = [];
      if (w.state === 'idle') list.push(A('Загрузить стирку', 10, () => H.laundryDirty < 1 ? 'Грязного белья нет.' : (H.chem < 1 ? 'Нет порошка.' : null), () => {
        const n = Math.min(6, H.laundryDirty);
        H.laundryDirty -= n; H.chem--;
        w.state = 'running'; w.sets = n; w.doneAt = abs() + 10 + 90; w.moldAt = 0;
        return say('washLoad', { n });
      }));
      if (w.state === 'running') list.push(A('Смотреть, как крутится', 5, null, () => 'Медитативно. Вы почти достигли просветления, но запищал телефон.'));
      if (w.state === 'done') list.push(A('Развесить бельё', 20, null, () => {
        H.laundryClean += w.sets; w.state = 'idle'; w.sets = 0; w.moldAt = 0; S.mom.energy -= 3;
        return say('hang');
      }));
      const st = { idle: 'свободна', running: 'стирает…', done: 'готово!' }[w.state];
      return { title: '🧺 Стиральная машина', info: [`Состояние: ${st}`, `Грязное: ${H.laundryDirty} · Чистое: ${H.laundryClean} компл.`], actions: list };
    },
    basket() {
      const H = S.house;
      return { title: '🧺 Корзина для белья', info: [`Грязное бельё: ${H.laundryDirty} компл.`, `Чистое в шкафу: ${H.laundryClean} компл.`, S.owned.washer ? 'Стирайте в машинке' : 'Стиралки нет — стирать в ванне'], actions: [
        A('Понюхать (зачем?)', 1, null, () => 'Зачем вы это сделали? Ну, теперь вы знаете. Пора стирать.'),
      ] };
    },

    kidsbed() {
      const kids = kidsAwakeHome();
      const school = schoolDay(S.day);
      const list = [];
      list.push(A('Разбудить и собрать в школу и сад', () => (S.owned.coatRack ? 20 : 30), () => {
        if (!school) return 'Выходной! Будить детей в выходной — преступление против человечности.';
        if (S.flags.gathered) return 'Уже собраны.';
        if (S.time > 9 * 60 + 30) return 'Уже поздно куда-то собираться.';
        if (!kidsHome().length) return 'Детей нет дома.';
        return null;
      }, () => {
        kidsHome().forEach(id => { const k = S.kids[id]; k.asleep = false; if (!k.sick) k.ready = true; });
        S.flags.gathered = true; S.mom.energy -= 6;
        dressKids(true);
        return say('gather');
      }));
      list.push(A('Уложить детей спать', () => (S.owned.bunkBed ? 20 : 35) - (S.owned.nightLight ? 10 : 0), () => {
        if (!kids.length) return 'Некого укладывать.';
        if (S.time < 19 * 60 + 30) return 'Ещё рано. Дети подняли бунт от одного предложения.';
        return null;
      }, () => {
        kids.forEach(id => S.kids[id].asleep = true);
        S.flags.kidsBed = true;
        if (S.time > 21.5 * 60) S.flags.kidsBedLate = true;
        S.mom.energy -= 4;
        return say('kidsBed');
      }));
      return { title: S.owned.bunkBed ? '🛌 Двухъярусная кровать' : '🛌 Детские матрасы', info: [], actions: list };
    },

    kidsDesk() {
      return { title: '✏️ Детская парта', info: ['Уроки за партой эффективнее'], actions: kidActionsMisha().filter(a => a.desk) };
    },

    misha() {
      const k = S.kids.misha;
      return { title: '👦 Миша, 8 лет', info: kidInfo(k).concat([`Оценки: ${Math.round(k.grades)}`]), actions: kidActionsMisha() };
    },
    sonya() {
      const k = S.kids.sonya;
      const list = [
        A('Почитать сказку', 20, () => k.asleep ? 'Спит. Не будите лихо.' : null, () => {
          k.mood += 10; k.dev += 2; S.mom.mood += 3;
          return say('story') + fulfill('sonya', 'story');
        }),
        A('Позаниматься (буквы, цвета)', 30, () => k.asleep ? 'Спит.' : null, () => {
          k.dev += 5; k.mood -= 2; S.mom.energy -= 4;
          return say('lessons');
        }),
        A('Поиграть', 30, () => k.asleep ? 'Спит.' : null, () => {
          k.mood += 15; S.mom.mood += 4; S.mom.energy -= 5;
          return say('playSonya') + fulfill('sonya', 'play');
        }),
        hugAction('sonya'),
        sweetsAction('sonya'),
      ];
      if (k.sick) list.unshift(A('Полечить (чай, обнимашки)', 20, null, () => { k.mood += 12; return '🍵 Чай с малиной, обнимашки и мультик. Соня объявила, что почти выздоровела, но мультик ещё нужен.'; }));
      return { title: '👧 Соня, 4 года' + (k.sick ? ' 🤧' : ''), info: kidInfo(k).concat([`Развитие: ${Math.round(k.dev)}`]), actions: list };
    },
    dog() {
      const d = S.dog;
      return { title: '🐕 Бадди', info: [`Сытость ${Math.round(d.satiety)}% · Хочет гулять ${Math.round(d.need)}% · Настроение ${Math.round(d.mood)}%`], actions: [
        A('Погладить', 2, null, () => { d.mood += 5; S.mom.mood += 3; return { text: say('petDog'), type: 'good', snd: 'bark' }; }),
        A('Поиграть с мячиком', 20, null, () => { d.mood += 15; d.need += 5; S.mom.mood += 4; S.mom.energy -= 3; return { text: '🎾 Кинули мяч 47 раз. Бадди готов ещё 470.', type: 'good', snd: 'bark' }; }),
        A('Отчитать за тапок', 2, null, () => { d.mood -= 3; return '🐕 Бадди выслушал, кивнул и пошёл к правому тапку.'; }),
      ] };
    },
  };

  function kidInfo(k) {
    return [`Сытость ${Math.round(k.satiety)}% · Настроение ${Math.round(k.mood)}% · Чистота ${Math.round(k.hygiene)}%`];
  }
  function sweetsAction(id) {
    const k = S.kids[id];
    return A('Дать конфету', 2, () => S.house.sweets < 1 ? 'Конфет нет. Их {съела мама|съел папа}. Ой.' : (k.asleep ? 'Спит.' : null), () => {
      S.house.sweets--; k.mood += 10; k.satiety += 5;
      return '🍬 Конфета выдана. Через 10 минут — сахарный вихрь по всему дому.' + fulfill(id, 'sweet');
    });
  }
  function hugAction(id) {
    const k = S.kids[id];
    return A('Обнять', 1, () => (k.asleep ? 'Спит. Обнимите подушку.' : null), () => {
      k.mood += 4; S.mom.mood += 3;
      return pick(['🤗 Обнимашки! Заряд любви +100, заряд телефона −0.', '🤗 Обняли. На секунду мир стал тише. Потом Бадди залаял.']) + fulfill(id, 'hug');
    });
  }
  function kidActionsMisha() {
    const k = S.kids.misha;
    const desk = !!S.owned.kidsDesk;
    const list = [
      A('Делать уроки' + (desk ? ' (за партой)' : ''), () => (desk ? 45 : 60), () => {
        if (k.at !== 'home') return 'Миши нет дома. Делать уроки по телефону — это уже дистанционка.';
        if (k.asleep) return 'Спит. Уроки во сне не засчитываются.';
        if (quarantine(S.day) || quarantine(S.day + 1)) return 'Карантин — уроков не задают. Зелёнка вместо домашки.';
        if (k.sick) return 'Миша болеет — уроков не задают. Чай с малиной вместо домашки.';
        if (!G.homeworkDue()) return 'Завтра выходной! Уроки — в воскресенье вечером, как у всех нормальных людей.';
        if (S.flags.homework) return 'Уже сделали. Больше ни-ни.';
        if (S.time < 13 * 60 + 30 && schoolDay(S.day)) return 'Сначала школа, потом уроки.';
        return null;
      }, () => {
        k.grades += desk ? 7 : 5; k.mood -= 4; S.mom.energy -= 8; S.mom.mood -= 2;
        S.flags.homework = true;
        return say('homework');
      }, { desk: true }),
    ];
    if (S.today.craft) list.push(A('Сделать поделку из шишек', 60, () => S.flags.craft ? 'Уже сделали. Ёжик из шишек смотрит на вас с полки.' : (k.sick ? 'Миша болеет — поделка подождёт.' : (k.at !== 'home' ? 'Миши нет дома.' : (k.asleep ? 'Спит.' : null))), () => {
      S.flags.craft = true; S.mom.energy -= 6; S.house.clean.kids -= 10;
      return '🦔 Сделали ёжика из шишек и пластилина. Клей теперь на всём, включая Бадди.';
    }, { desk: true }));
    list.push(A('Поиграть', 30, () => k.asleep ? 'Спит.' : null, () => {
      k.mood += 15; S.mom.mood += 4; S.mom.energy -= 5;
      return say('playMisha') + fulfill('misha', 'play');
    }));
    list.push(hugAction('misha'));
    list.push(sweetsAction('misha'));
    if (S.today.boss === 'pox') list.unshift(A(`🟢 Помазать зелёнкой (${Math.min(2, S.flags.green || 0)}/2)`, 10, () => (S.flags.green || 0) >= 2 ? 'Хватит. Миша и так уже зеленее Шрека.' : null, () => {
      S.flags.green = (S.flags.green || 0) + 1; k.mood += 3;
      return '🟢 Помазали. Миша теперь в горошек и требует называть его «Мухомор-младший».';
    }));
    return list;
  }

  // ---------- хобби и проекты «для души» ----------
  const PAINT_TITLES = ['«Бадди на закате»', '«Утро без детей» (фантастика)', '«Гора посуды. Натюрморт»', '«Андрей на вахте» (по памяти)',
    '«Котик, которого у нас нет»', '«Абстракция №5: лего на полу»', '«Портрет {свекрови|тёщи}» (льстивый)', '«Тишина» (чистый холст, концептуально)'];
  const PROJECTS = [
    { id: 'yoga', cat: 'self', icon: '🧘‍♀️', name: 'Утренняя йога', cost: 1500, need: 7, perDay: 1, mins: 20, step: 'Йога на коврике', where: 'room:living',
      can: () => (S.time > 11 * 60 ? 'Йога — утром. Вечером это уже «полежать на коврике».' : null),
      desc: 'Коврик в гостиной, 7 утренних занятий — по одному в день, до 11:00.',
      reward: 'Форма +10 и утренняя йога, которая бодрит лучше кофе',
      texts: ['🧘‍♀️ Поза собаки мордой вниз. Бадди решил, что вы играете, и лёг сверху.', '🧘‍♀️ Поза дерева. Соня тоже дерево. Миша — дровосек.', '🧘‍♀️ Дышим глубоко. Пахнет подгоревшей кашей. Дышим неглубоко.', '🧘‍♀️ Шавасана. Вы уснули на 2 минуты. Это засчитывается.', '🧘‍♀️ Спина больше не хрустит. Ну, почти.', '🧘‍♀️ Вы {гибкая|гибкий}, как ваш график.'] },
    { id: 'guitar', cat: 'self', icon: '🎸', name: 'Научиться играть на гитаре', cost: 6000, need: 6, perDay: 2, mins: 30, step: 'Учить аккорды', where: 'guitar',
      desc: 'Гитара в углу гостиной. Шесть уроков по видео, по полчаса.',
      reward: 'Сможете петь детям песни — их настроение взлетает',
      texts: ['🎸 Аккорд Am. Пальцы болят, соседи насторожились.', '🎸 Аккорд Dm. Бадди подвывает — это успех или критика?', '🎸 Сыграли «В траве сидел кузнечик». Кузнечик бы одобрил.', '🎸 Освоили бой «шестёрку». Соня танцует.', '🎸 Почти «Группа крови». Миша говорит, что вы крутая. Запомните этот момент.'] },
    { id: 'run', cat: 'self', icon: '🏃‍♀️', name: 'Подготовиться к забегу 5 км', cost: 3500, need: 6, perDay: 1, mins: 40, step: 'Пробежка вокруг квартала', where: 'door', away: true,
      can: () => canLeave({}),
      desc: 'Новые кроссовки и шесть пробежек — по одной в день. Детей одних не оставишь, так что бегать, пока они в школе и саду.',
      reward: 'Форма +15 и медаль в спальне',
      texts: ['🏃‍♀️ Пробежали 1 км. Остальные 4 — в следующий раз. Возможно, в следующей жизни.', '🏃‍♀️ 2 км! Соседская бабушка обогнала на самокате, но это не считается.', '🏃‍♀️ 3 км. Вы почувствовали «второе дыхание». Это было первое, просто отдышались.', '🏃‍♀️ 4 км. Наушники играют «Eye of the Tiger». Вы — тигр. Уставший тигр.', '🏃‍♀️ Почти 5! Ноги уже не спорят.'] },
    { id: 'blog', cat: 'self', icon: '📱', name: 'Вести блог «{Мама|Папа} на вахте»', cost: 0, need: 6, perDay: 1, mins: 30, step: 'Написать пост в блог', where: 'laptop',
      desc: 'Шесть постов про жизнь с двумя детьми и собакой — по одному в день. Контент сам себя не напишет. Хотя дома его полно.',
      reward: 'Подписчики каждый день донатят 600–1200 ₽',
      texts: ['📱 Пост «Как я {нашла|нашёл} носок в холодильнике». 3 лайка (мама, {свекровь|тёща} и бот).', '📱 Пост «Бадди против пылесоса». 47 лайков! Бадди — звезда.', '📱 Видео «Утро с детьми за 60 секунд». Кто-то написал «это я».', '📱 Пост «Рецепт ужина из того, что осталось». Его сохранили 200 человек.', '📱 Вас процитировал паблик «{Мамы|Папы}, держитесь». Вы держитесь.'] },
    { id: 'puzzle', cat: 'kids', icon: '🧩', name: 'Пазл на 1000 деталей с детьми', cost: 1200, need: 5, perDay: 1, mins: 40, step: 'Собирать пазл с детьми', where: 'room:kids',
      can: () => (kidsAwakeHome().length ? null : 'Без детей неинтересно — и детали некому терять.'),
      desc: 'Пять вечеров на ковре в детской. Нужны дети (и терпение).',
      reward: 'Картина-пазл на стене детской, дети счастливы',
      texts: ['🧩 Собрали рамку. Соня съела одну деталь. Шутка. Наверное.', '🧩 Небо — всё синее и одинаковое. Миша сдался, вы — нет.', '🧩 Нашли деталь под Бадди. Он её охранял.', '🧩 Осталось 50 деталей. Вся семья лежит на полу и спорит. Идиллия.'] },
    { id: 'costume', cat: 'kids', icon: '👑', name: 'Сшить Соне костюм принцессы', cost: 2000, need: 4, perDay: 1, mins: 45, step: 'Шить костюм принцессы', where: 'room:bedroom',
      desc: 'Ткань, блёстки и четыре вечера за шитьём в спальне. Для утренника и на каждый день.',
      reward: 'Соня в короне и счастлива, развитие +5',
      texts: ['👑 Выкройка готова. Соня уже заказала второй — для Бадди.', '👑 Юбка сшита. Блёстки теперь везде, включая суп.', '👑 Примерка! Соня кружится и отказывается снимать.'] },
    { id: 'herbs', cat: 'home', icon: '🌿', name: 'Зелень на подоконнике', cost: 800, need: 4, perDay: 1, mins: 10, step: 'Ухаживать за зеленью', where: 'herbs',
      desc: 'Ящик с укропом, петрушкой и базиликом на окне детской. Четыре дня ухода.',
      reward: 'Каждое утро +1 продукт — своя зелень!',
      texts: ['🌿 Посеяли. Соня поливает из кружки. Слишком усердно.', '🌿 Взошёл укроп! Миша называет его «маленький лес».', '🌿 Базилик пахнет Италией. Вы закрыли глаза на секунду. Хорошая секунда.'] },
    { id: 'album', cat: 'home', icon: '📷', name: 'Собрать семейный фотоальбом', cost: 1500, need: 5, perDay: 2, mins: 30, step: 'Разбирать фотографии', where: 'laptop',
      desc: 'Пять сеансов: выбрать лучшие фото из 14 000 в телефоне и напечатать.',
      reward: 'Фотостена в прихожей — поднимает настроение всем',
      texts: ['📷 Удалили 3000 размытых фото пальца. Осталось 11 000.', '📷 Нашли фото свадьбы. Андрей там с волосами!', '📷 Фото «Соня впервые ест лимон» — шедевр.', '📷 Печать заказана. Принтер в салоне вздохнул.'] },
    { id: 'flower', cat: 'home', icon: '🌱', name: 'Вырастить цветок', cost: 600, need: 5, perDay: 1, mins: 5, step: 'Полить цветок', where: 'flower',
      desc: 'Горшок на подоконнике кухни. Поливать раз в день: 5 поливов — и он зацветёт. Два дня без воды — засохнет.',
      reward: 'Цветок на окне, +уют и +настроение',
      texts: ['🌱 Полили. Из земли показался росток. Вы гордитесь им больше, чем пятёрками Миши.', '🌱 Полили. Росток подрос и, кажется, улыбается.', '🌿 Полили. Уже кустик! Бадди его нюхает с подозрением.', '🌿 Полили. Появился бутон. Соня назвала его Гоша.'] },
    { id: 'paint', cat: 'self', icon: '🎨', name: 'Нарисовать картину', cost: () => (S.projDone.paint ? 500 : 2500), need: 4, perDay: 2, mins: 60, step: 'Рисовать картину', where: 'easel', repeat: true,
      desc: 'Мольберт в спальне. Четыре сеанса по часу. Готовую картину повесим на стену, а потом можно продать на Авито.',
      reward: 'Картина на стене (+уют) или деньги',
      texts: ['🎨 Набросок готов. Пока похоже на всё сразу.', '🎨 Добавили цвета. Соня сказала «красиво», Миша — «это что, собака?». Это закат.', '🎨 Почти готово. Вы впервые за месяц час ни о чём не думали.'] },
    { id: 'wallpaper', cat: 'home', icon: '🖼️', name: 'Поклеить обои', cost: 0, need: 3, perDay: 2, mins: 60, step: 'Клеить обои', repeat: true,
      where: () => 'room:' + ((S.proj.wallpaper || {}).room || 'living'),
      desc: 'Выберите комнату и обои. Три сеанса по часу в этой комнате — и её не узнать.',
      reward: 'Новый вид комнаты, +уют',
      texts: ['🖼️ Содрали старые обои. Под ними нашли газету 1998 года и чей-то номер телефона.', '🖼️ Половина стены готова. Бадди приклеился к рулону. Отклеили. Почти.'] },
    { id: 'knit', cat: 'self', icon: '🧶', name: 'Связать плед', cost: 1200, need: 5, perDay: 2, mins: 40, step: 'Вязать плед', where: () => (S.owned.sofa ? 'sofa' : 'bed'),
      desc: 'Пряжа и спицы. Пять сеансов на диване или в кровати. Медитация с практической пользой.',
      reward: 'Плед на кровати — сон восстанавливает больше',
      texts: ['🧶 Связали первый ряд. Распустили. Связали снова.', '🧶 Плед растёт. Бадди считает, что клубок — его.', '🧶 Половина готова. Соня уже требует такой же, но розовый.', '🧶 Почти всё! Петли считаете даже во сне.'] },
    { id: 'book', cat: 'self', icon: '📚', name: 'Дочитать «Войну и мир»', cost: 0, need: 6, perDay: 2, mins: 45, step: 'Читать «Войну и мир»', where: () => (S.owned.bookshelf ? 'bookshelf' : 'bed'),
      desc: 'Четыре тома, шесть сеансов. Читать у книжного шкафа или в кровати. Пьер Безухов ждёт.',
      reward: '+10 к знаниям — подработка платит больше',
      texts: ['📖 Том первый. Сто страниц на французском. Вы киваете, будто всё поняли.', '📖 Наташа Ростова на балу. Вы на кухне. Почти одно и то же.', '📖 Аустерлиц. Князь Андрей смотрит в небо. Вы смотрите в потолок — там паутина.', '📖 Пьер в плену. Вы его понимаете как никто.', '📖 Последние главы. Эпилог про семью и детей. Ну-ну.'] },
    { id: 'dog', cat: 'home', icon: '🐾', name: 'Научить Бадди давать лапу', cost: 300, need: 5, perDay: 1, mins: 15, step: 'Тренировать Бадди', where: 'dog',
      desc: 'Пакет вкусняшек и пять тренировок — по одной в день.',
      reward: 'Бадди даёт лапу, перестаёт грызть тапки и рыться в мусорке',
      texts: ['🐾 Бадди съел все вкусняшки и сел. Случайно.', '🐾 Бадди дал лапу! Правда, вам в лицо.', '🐾 Получается через раз. Второй раз Бадди даёт другую лапу — креативит.', '🐾 Почти идеально. Бадди уже сам протягивает лапу, когда видит пакет.'] },
    { id: 'pie', cat: 'home', icon: '🥧', name: 'Освоить фирменный пирог', cost: 0, need: 3, perDay: 1, mins: 60, step: 'Учиться печь пирог (3 продукта)', where: 'stove',
      desc: 'Три попытки у плиты, по одной в день. Каждая — 3 продукта. Две первые… будут опытом.',
      reward: 'Новый рецепт: пирог радует всю семью',
      texts: ['🥧 Попытка №1: пирог получился плоским, как шутки Андрея. Бадди доволен.', '🥧 Попытка №2: снаружи горелый, внутри сырой. Зато ровно посередине — идеально!'] },
  ];
  const projDef = id => PROJECTS.find(d => d.id === id);
  const projWhere = d => (typeof d.where === 'function' ? d.where() : d.where);
  const projCost = d => (typeof d.cost === 'function' ? d.cost() : d.cost);
  function projToday(id) {
    const p = S.proj[id];
    if (!p) return 0;
    if (p.todayDay !== S.day) { p.todayDay = S.day; p.today = 0; }
    return p.today;
  }
  G.PROJECTS = PROJECTS;
  G.projects = function () {
    return PROJECTS.map(d => {
      const p = S.proj[d.id];
      const state = p ? (p.failed ? 'failed' : 'active') : (S.projDone[d.id] && !d.repeat ? 'done' : 'idle');
      return { id: d.id, cat: d.cat, icon: d.icon, name: d.name, desc: d.desc, reward: d.reward, cost: projCost(d), state, n: p ? p.n : 0, need: d.need,
        todayLeft: p ? Math.max(0, d.perDay - projToday(d.id)) : d.perDay, perDay: d.perDay, done: S.projDone[d.id] || 0, repeat: !!d.repeat,
        where: p ? projWhere(d) : null, room: p && p.room, style: p && p.style };
    });
  };
  // Начать проект. opts для обоев: {room, style}
  G.startProject = function (id, opts) {
    const d = projDef(id);
    if (!d || S.proj[id]) return { ok: false, msg: 'Этот проект уже идёт.' };
    let cost = projCost(d);
    if (id === 'wallpaper') {
      const st = HW.wallpaperById[opts && opts.style];
      if (!st || !opts.room) return { ok: false, msg: 'Выберите комнату и обои.' };
      cost = st.price;
    }
    if (S.money < cost) return { ok: false, msg: 'Не хватает денег на материалы. Хобби — удовольствие не бесплатное.' };
    S.money -= cost;
    S.flags.spent = (S.flags.spent || 0) + cost;
    S.proj[id] = { n: 0, start: S.day, lastDay: S.day, todayDay: S.day, today: 0, room: opts && opts.room, style: opts && opts.style };
    addLog('Новое хобби: ' + d.name);
    G.save();
    const msg = { flower: '🌱 Семена посажены! Горшок стоит на подоконнике кухни. Не забывайте поливать каждый день.',
      paint: '🎨 Мольберт и краски — в спальне. Вдохновение прилагается (нет).',
      wallpaper: '🖼️ Рулоны куплены! Идите в комнату и клейте. Бадди уже нюхает клей.',
      knit: '🧶 Пряжа куплена. Бадди уже присмотрел клубок.',
      book: '📚 «Война и мир» снята с полки. Четыре тома. Вы справитесь. Наверное.',
      dog: '🐾 Вкусняшки куплены. Бадди уже сидит и смотрит на пакет с обожанием.',
      pie: '🥧 Рецепт бабушки найден. Мука на полу уже есть.' }[id];
    return { ok: true, msg };
  };
  G.removeProject = function (id) { delete S.proj[id]; G.save(); };

  function finishProject(d) {
    const p = S.proj[d.id];
    delete S.proj[d.id];
    S.projDone[d.id] = (S.projDone[d.id] || 0) + 1;
    S.mom.mood += 15;
    addLog('Хобби завершено: ' + d.name);
    switch (d.id) {
      case 'flower': return '🌸 ЦВЕТОК ЗАЦВЁЛ! Вы вырастили что-то живое, и оно не просит есть каждые три часа. Уют +1.';
      case 'paint': {
        const title = PAINT_TITLES[Math.floor(Math.random() * PAINT_TITLES.length)];
        if (S.paintings.length < 3) {
          S.paintings.push({ seed: Math.floor(Math.random() * 1e9), title });
          return `🖼️ Картина ${title} готова и висит на стене! Подойдите полюбоваться. Можно продать, если найдётся ценитель.`;
        }
        const price = 1500 + Math.round(Math.random() * 6) * 250;
        S.money += price;
        return `🖼️ Картина ${title} готова, но стены уже заняты — продали на Авито за ${HW.fmtMoney(price)}. Покупатель сказал «чувствуется боль».`;
      }
      case 'wallpaper': {
        S.walls[p.room] = p.style;
        S.house.clean[p.room] = clamp(S.house.clean[p.room] - 10, 0, 100);
        return `🖼️ Обои поклеены! ${HW.ROOMS[p.room].name} теперь как из журнала. Ну, почти: один пузырь остался — это авторский стиль.`;
      }
      case 'knit': return '🧶 Плед готов! Он лежит на кровати и греет лучше, чем звонки Андрея. Сон восстанавливает больше.';
      case 'book': S.mom.knowledge += 10; return '📚 Вы дочитали «Войну и мир»! Все 1300 страниц. Теперь можно небрежно упоминать это в разговоре. Знания +10.';
      case 'dog': S.dog.mood += 20; return '🐾 Бадди официально даёт лапу! И, кажется, понял, что тапки — не еда. Ну, почти.';
      case 'yoga': S.mom.fitness += 10; return '🧘‍♀️ Семь утр йоги! Вы {гибкая, спокойная|гибкий, спокойный} и почти не кричите. Теперь в гостиной можно делать утреннюю йогу.';
      case 'guitar': return '🎸 Вы играете на гитаре! Три аккорда, но с душой. Теперь можно петь детям песни у гитары в гостиной.';
      case 'run': S.mom.fitness += 15; return '🏅 ЗАБЕГ 5 КМ ПРОЙДЕН! Медаль висит в спальне. Андрей {прислал|прислала} «🔥🔥🔥» и смайлик с бицепсом.';
      case 'blog': return '📱 У блога «{Мама|Папа} на вахте» тысяча подписчиков! Теперь каждый день приходят донаты. Мир вас понимает.';
      case 'puzzle': kidsAwakeHome().forEach(id => S.kids[id].mood += 20); return '🧩 ПАЗЛ СОБРАН! Вся семья орёт от счастья. Картину повесили в детской. Последнюю деталь нашли у Бадди в миске.';
      case 'costume': S.kids.sonya.mood += 25; S.kids.sonya.dev += 5; return '👑 Костюм готов! Соня — настоящая принцесса, в короне и с волшебной палочкой. Требует обращаться «Ваше Высочество».';
      case 'herbs': return '🌿 Зелень выросла! Теперь каждое утро у вас свой продукт с подоконника. Соня гордо называет это «наша ферма».';
      case 'album': return '📷 Фотоальбом готов, а лучшие фото — на стене в прихожей. Андрей по видеосвязи {прослезился|прослезилась}. {Сказал|Сказала}, что это пыль.';
      case 'pie': kidsAwakeHome().forEach(id => S.kids[id].mood += 10); S.house.portions += 4; S.house.cookedDay = S.day;
        return '🥧 Попытка №3: ИДЕАЛЬНО! Пирог румяный, дети просят добавки. У вас теперь фирменный рецепт.';
    }
    return '';
  }

  function projectAction(d) {
    const p = S.proj[d.id];
    return Object.assign(A(`${d.icon} ${d.step} (${p.n}/${d.need})`, d.mins, () => {
      if (projToday(d.id) >= d.perDay) return d.perDay === 1 ? 'На сегодня хватит — завтра продолжим.' : 'Сегодня уже ' + d.perDay + ' сеанса. Хобби тоже нужен отдых.';
      if (d.id === 'pie' && S.house.groceries < 3) return 'Нужно 3 продукта.';
      if (d.id === 'pie' && S.house.stove.state !== 'idle') return 'Плита занята.';
      if (S.mom.energy < 8 && d.mins > 10) return 'Сил нет даже на любимое дело.';
      return d.can ? d.can() : null;
    }, () => {
      p.today = projToday(d.id) + 1;
      p.n++; p.lastDay = S.day; p.missed = false;
      if (d.id === 'pie') S.house.groceries -= 3;
      if (d.id === 'wallpaper') S.house.clean[p.room] -= 8;
      S.mom.mood += d.id === 'flower' ? 2 : 5;
      S.mom.energy -= d.mins >= 40 ? 3 : 1;
      if (d.id === 'book') S.mom.knowledge += 1;
      if (d.id === 'run') { S.mom.fitness += 1; S.mom.energy -= 4; }
      if (d.id === 'puzzle') kidsAwakeHome().forEach(id => { S.kids[id].mood += 6; fulfill(id, 'play'); });
      if (p.n >= d.need) return { text: finishProject(d), type: 'good', snd: 'ach' };
      return d.texts[Math.min(p.n - 1, d.texts.length - 1)];
    }), { away: !!d.away });
  }
  // Действия хобби для объекта (или 'room:<id>')
  function projectActions(iid) {
    const out = [];
    PROJECTS.forEach(d => {
      const p = S.proj[d.id];
      if (p && !p.failed && projWhere(d) === iid) out.push(projectAction(d));
    });
    // плоды завершённых проектов
    if (iid === 'stove' && S.projDone.pie) out.push(A('🥧 Испечь фирменный пирог (3 продукта)', 60, () => (S.house.groceries < 3 ? 'Нужно 3 продукта.' : null), () => {
      S.house.groceries -= 3; S.house.portions += 4; S.house.cookedDay = S.day; S.house.dishes += 2;
      kidsAwakeHome().forEach(id => S.kids[id].mood += 10); S.mom.mood += 6;
      return '🥧 Фирменный пирог! Дом пахнет как в детстве. Даже Бадди сел ровно.';
    }));
    if (iid === 'room:living' && S.projDone.yoga) out.push(A('🧘‍♀️ Утренняя йога', 20, () => (S.time > 11 * 60 ? 'Йога — утром.' : (S.flags.yogaDone ? 'Уже позанимались сегодня. Намасте.' : null)), () => {
      S.flags.yogaDone = true; S.mom.energy += 8; S.mom.mood += 6; S.mom.fitness += 0.5;
      return '🧘‍♀️ Двадцать минут йоги. Дети смотрят мультики, Бадди лёг рядом в позу «бревно». Вы — дзен.';
    }));
    if (iid === 'guitar' && S.projDone.guitar) out.push(A('🎸 Спеть детям песню', 15, () => (!kidsAwakeHome().length ? 'Детей нет. Петь Бадди? Он не оценит. Хотя…' : (S.flags.sang ? 'Сегодня уже пели. Соседи тоже люди.' : null)), () => {
      S.flags.sang = true; S.mom.mood += 6;
      kidsAwakeHome().forEach(id => { S.kids[id].mood += 15; fulfill(id, 'play'); });
      return '🎸 Спели «Голубой вагон». Дети подпевали, Бадди подвывал. Лучший концерт года.';
    }));
    if (iid === 'dog' && S.projDone.dog) out.push(A('🐾 «Бадди, дай лапу!»', 1, null, () => {
      S.dog.mood += 5; S.mom.mood += 4;
      return { text: '🐾 Бадди торжественно подал лапу. Вы пожали её как деловому партнёру.', type: 'good', snd: 'bark' };
    }));
    return out;
  }

  // Объекты хобби в доме
  ACT.flower = function () {
    const p = S.proj.flower;
    if (p && p.failed) return { title: '🥀 Засохший цветок', info: ['Он сделал всё, что мог.'], actions: [
      A('Выбросить и начать заново', 2, null, () => { delete S.proj.flower; return '🥀 Цветок похоронен с почестями. Можно посадить новый во вкладке «Хобби».'; })] };
    if (p) return { title: '🌱 Цветок', info: [`Полито ${p.n} из 5 · ${p.lastDay < S.day ? 'сегодня ещё не поливали!' : 'сегодня полито'}`], actions: [] };
    return { title: '🌸 Цветок', info: ['Цветёт и пахнет. Вы молодец.'], actions: [
      A('Понюхать', 1, null, () => { S.mom.mood += 2; return '🌸 Пахнет весной. И немного удобрением.'; })] };
  };
  ACT.guitar = function () {
    return { title: '🎸 Гитара', info: [S.projDone.guitar ? 'Вы умеете играть!' : (S.proj.guitar ? `Уроков: ${S.proj.guitar.n} из 6` : 'Красивая. Пока просто стоит.')], actions: [] };
  };
  ACT.herbs = function () {
    return { title: '🌿 Зелень на подоконнике', info: [S.projDone.herbs ? 'Растёт и кормит: +1 продукт каждое утро' : (S.proj.herbs ? `Ухаживали: ${S.proj.herbs.n} из 4` : '')], actions: [] };
  };
  ACT.photos = function () {
    return { title: '📷 Фотостена', info: ['Лучшие моменты семьи'], actions: [
      A('Посмотреть фотографии', 10, () => (S.flags.photosSeen ? 'Сегодня уже смотрели. Не плачьте.' : null), () => {
        S.flags.photosSeen = true; S.mom.mood += 8; kidsAwakeHome().forEach(id => S.kids[id].mood += 4);
        return '📷 Полистали фото. Вот Миша в год, вот Соня с тортом на лице, вот Андрей спит на диване. Ностальгия +100.';
      })] };
  };
  ACT.puzzleArt = function () { return { title: '🧩 Пазл на стене', info: ['1000 деталей. Одна, кажется, всё-таки у Бадди.'], actions: [] }; };
  ACT.fireplace = function () {
    return { title: '🔥 Электрокамин', info: ['Огонь ненастоящий, уют — настоящий'], actions: [
      A('Посидеть у камина', 30, () => (S.time < 17 * 60 ? 'У камина сидят вечером. Днём это просто тёплая стена.' : (S.flags.fireplace ? 'Сегодня уже грелись.' : null)), () => {
        S.flags.fireplace = true; S.mom.mood += 10; S.mom.energy += 6;
        kidsAwakeHome().forEach(id => S.kids[id].mood += 5);
        return '🔥 Посидели у камина с какао. Дети рядом, Бадди греет ноги. Вот ради этого всё и было.';
      })] };
  };
  ACT.aquarium = function () {
    return { title: '🐠 Аквариум', info: ['Четыре рыбки: Немо, Дори, Гоша и Пятница'], actions: [
      A('Покормить рыбок', 2, () => (S.flags.fish ? 'Рыбки уже поели. Перекормленная рыбка — грустная рыбка.' : null), () => {
        S.flags.fish = true; S.mom.mood += 3; kidsAwakeHome().forEach(id => S.kids[id].mood += 5);
        return '🐠 Рыбки поели. Дети прилипли к стеклу. Бадди тоже. Рыбки нервничают.';
      })] };
  };
  ACT.vanity = function () {
    return { title: '💄 Туалетный столик', info: ['Ваш уголок красоты'], actions: [
      A('Навести красоту', 15, () => (S.flags.beauty ? 'Вы и так прекрасны. Сегодня уже.' : null), () => {
        S.flags.beauty = true; S.mom.mood += 8;
        return '💄 {Макияж, причёска, духи|Бритьё, причёска, парфюм}. Вы вышли в магазин как на подиум. Кассирша сделала комплимент.';
      })] };
  };
  ACT.hallMirror = function () {
    return { title: '🪞 Зеркало', info: [], actions: [
      A('Посмотреть в зеркало', 1, null, () => { S.mom.mood += 1; return pick(['🪞 В зеркале — {уставшая, но очень красивая женщина|уставший, но очень красивый мужчина}. Это вы.', '🪞 Обнаружили у себя на плече наклейку с единорогом. Оставили. Стиль.', '🪞 Зеркало говорит: «Ты справляешься». Ну, или это вы сами сказали.']); })] };
  };
  ACT.easel = function () {
    const p = S.proj.paint;
    return { title: '🎨 Мольберт', info: [p ? `Сеансов: ${p.n} из 4` : 'Начните картину во вкладке «Хобби»'], actions: [] };
  };
  [0, 1, 2].forEach(i => {
    ACT['painting' + i] = function () {
      const pt = S.paintings[i];
      if (!pt) return { title: 'Пустая стена', info: [], actions: [] };
      return { title: '🖼️ ' + pt.title, info: ['Ваша работа. Шедевр, конечно.'], actions: [
        A('Полюбоваться', 3, () => (S.flags['admire' + i] ? 'Сегодня уже любовались. Не зазнавайтесь.' : null), () => { S.flags['admire' + i] = true; S.mom.mood += 4; return '🖼️ Полюбовались. Да, вы талант. Почему никто раньше не замечал?'; }),
        A('Продать на Авито', 10, null, () => {
          const price = 1500 + Math.round(Math.random() * 6) * 250;
          S.money += price; S.paintings.splice(i, 1);
          return { text: `💸 Продали картину ${pt.title} за ${HW.fmtMoney(price)}. Покупатель спросил, рисуете ли вы котов на заказ.`, type: 'good', snd: 'coin' };
        }),
      ] };
    };
  });

  G.objectSheet = function (iid) {
    const f = ACT[iid];
    if (!f) return null;
    const sheet = f();
    projectActions(iid).reverse().forEach(a => sheet.actions.unshift(a));
    markDim(sheet.actions, iid);
    const def = incDef();
    if (def && def.iid === iid) sheet.actions.unshift(incidentAction(def));
    sheet.actions.forEach(a => {
      a.reason = check(a.can);
      a.mins = typeof a.min === 'function' ? a.min() : a.min;
    });
    return sheet;
  };

  // ---------- действия комнаты ----------
  G.roomSheet = function (rid) {
    const H = S.house;
    const R = HW.ROOMS[rid];
    const vac = !!S.owned.vacuum;
    const toys = H.toys.filter(t => HW.roomAt(t.x, t.z) === rid);
    const list = [
      A(vac ? 'Пропылесосить' : 'Подмести веником', vac ? 25 : 40, () => (H.clean[rid] > 92 ? 'Тут и так чисто. Можно есть с пола (но не надо).' : (S.mom.energy < 8 ? 'Нет сил держать веник.' : null)), () => {
        H.clean[rid] += vac ? 40 : 28; S.mom.energy -= vac ? 6 : 9; S.flags.cleaned = true;
        return say('sweep', { room: R.name });
      }),
      A('Помыть пол', 30, () => (H.chem < 1 && !H.chemOpen ? 'Нет средства для пола.' : (H.clean[rid] > 95 ? 'Пол и так блестит.' : null)), () => {
        // одной бутылки хватает на два мытья: открытая бутылка — отдельный счётчик
        if (H.chemOpen) H.chemOpen = 0; else { H.chem--; H.chemOpen = 1; }
        H.clean[rid] += 30; S.mom.energy -= 8; S.flags.cleaned = true;
        return say('mop');
      }),
    ];
    if (toys.length) list.unshift(A(`Собрать игрушки (${toys.length})`, Math.max(3, toys.length * 2), null, () => {
      const ids = toys.map(t => t.id);
      H.toys = H.toys.filter(t => !ids.includes(t.id));
      H.clean[rid] += toys.length * 3; S.flags.cleaned = true;
      return '🧸 Игрушки собраны. Шанс наступить на лего ночью снижен до 97%.';
    }));
    if (rid === 'bath') list.push(A('Отмыть сантехнику', 30, () => H.chem < 1 ? 'Нет химии.' : null, () => {
      H.clean.bath += 35; H.chem--; S.mom.energy -= 8; S.flags.cleaned = true;
      return '🚽 Всё сияет. Даже унитаз посмотрел на вас с уважением.';
    }));
    if (rid === 'living' && S.today.boss === 'bday') list.unshift(A('🎈 Украсить к празднику', 30, () => S.flags.decorated ? 'Уже красиво. Ещё шарик — и гостиная взлетит.' : (H.decor < 1 ? 'Нет шариков и гирлянд. Купите в магазине.' : null), () => {
      H.decor--; S.flags.decorated = true; S.mom.energy -= 5;
      return '🎈 Гостиная украшена! Бадди уже лопнул один шарик и теперь боится остальных.';
    }));
    list.push(A('Посмотреть в окно', 10, null, () => {
      S.mom.mood += 2;
      return say('window');
    }));
    projectActions('room:' + rid).reverse().forEach(a => list.unshift(a));
    markDim(list, 'room');
    list.forEach(a => { a.reason = check(a.can); a.mins = typeof a.min === 'function' ? a.min() : a.min; });
    return { title: '📍 ' + R.name, info: [`Чистота: ${Math.round(H.clean[rid])}%` + (toys.length ? ` · Игрушек на полу: ${toys.length}` : '')], actions: list };
  };

  // ---------- магазин ----------
  G.cartTotal = function (cart, mode) {
    let total = mode === 'delivery' ? 400 : 0;
    HW.SHOP.forEach(it => total += (cart[it.id] || 0) * it.price);
    return total;
  };
  G.buyGoods = function (cart, mode) {
    let total = 0;
    HW.SHOP.forEach(it => total += (cart[it.id] || 0) * it.price);
    if (mode === 'delivery') total += 400;
    if (total > S.money) return { msgs: [{ text: 'Не хватает денег. Карта сказала «ой».', type: 'bad' }] };
    const items = {};
    HW.SHOP.forEach(it => { if (cart[it.id]) items[it.id] = cart[it.id] * it.qty; });
    S.money -= total;
    S.flags.spent = (S.flags.spent || 0) + total;
    if (mode === 'delivery') {
      S.pending.push({ at: abs() + 120, items });
      return G.perform({ min: 5, run: () => `📱 Заказ оформлен (−${HW.fmtMoney(total)}). Курьер будет через 2 часа. Или через 4. Это же доставка.` });
    }
    const withKids = kidsAwakeHome().length > 0;
    return G.perform({ min: withKids ? 110 : 80, away: true, run: () => {
      for (const k in items) S.house[k] = (S.house[k] || 0) + items[k];
      S.mom.energy -= 8;
      if (withKids) {
        kidsAwakeHome().forEach(id => S.kids[id].mood += 5);
        return `🛒 Закупились (−${HW.fmtMoney(total)}). Дети по пути выпросили жвачку, машинку и смысл жизни на кассе.`;
      }
      return `🛒 Закупились (−${HW.fmtMoney(total)}). Без детей! Вы даже постояли у полки с кремами. Просто так.`;
    } });
  };

  G.buyFurniture = function (id) {
    const f = HW.furnById[id];
    if (!f || S.owned[id]) return null;
    const p = G.price(id);
    if (S.money < p) return { msgs: [{ text: 'Денег не хватает. Можно подработать или продать почку Бадди (шутка!).', type: 'bad' }] };
    S.money -= p;
    S.flags.spent = (S.flags.spent || 0) + p;
    S.owned[id] = true;
    S.mom.mood += 6;
    addLog('Куплено: ' + f.name);
    msgs = [{ text: `${f.icon} ${f.name} доставлен и собран! Курьер управился за 5 минут — в реальной жизни так не бывает.`, type: 'good' }];
    checkAch();
    G.save();
    const out = { msgs };
    msgs = [];
    return out;
  };

  // ---------- задачи на день ----------
  G.tasks = function () {
    const F = S.flags, list = [];
    const t = S.time;
    const school = schoolDay(S.day);
    // go — куда идти (для стрелки-навигатора), ready — можно ли делать прямо сейчас
    // why — подпись для стрелки, если идти надо не туда, куда подсказывает название задачи
    const add = (text, done, deadline, urgent, go, ready, why) => list.push({ text, done: !!done, deadline, urgent: !!urgent && !done, go: go || null, ready: ready === undefined ? true : !!ready, why: why || null });
    const mealWhy = label => {
      if (meal === 'door') return `${label}: продуктов нет — съездите в магазин`;
      if (meal === 'fridge') return `${label}: сделайте бутерброды (холодильник)`;
      if (S.house.portions > 0) return `${label}: накормите семью у плиты`;
      if (S.house.stove.state === 'cooking') return `${label}: еда варится — дождитесь и снимите`;
      return `${label}: сначала приготовьте еду`;
    };
    const kidsUp = kidsAwakeHome().length > 0;
    const meal = mealGo();
    if (school) {
      const sonyaSick = S.kids.sonya.sick, mishaSick = S.kids.misha.sick;
      // задачи только про тех, кто сегодня реально едет в школу/сад
      if (!mishaSick || !sonyaSick) {
        add('Разбудить и собрать детей', F.gathered, '8:00', t > 7.5 * 60 && t < 9.5 * 60, 'kidsbed', t < 9.5 * 60);
        const deliverText = !mishaSick && !sonyaSick ? 'Отвезти в школу (8:30) и сад' : (!mishaSick ? 'Отвезти Мишу в школу (8:30)' : 'Отвезти Соню в сад (до 9:00)');
        add(deliverText, F.delivered && !F.missedSchool, mishaSick ? '9:00' : '8:30', t > 7.75 * 60 && t < 10 * 60, 'door', F.gathered && t < 10 * 60);
      }
      if (!mishaSick) add('Забрать Мишу (13:30–15:00)', F.mishaPicked, '15:00', t > 13.5 * 60 && t < 15 * 60 && S.kids.misha.at === 'school', 'door', t >= 13.5 * 60 && S.kids.misha.at === 'school');
      if (!sonyaSick) add('Забрать Соню (до 18:30)', F.sonyaPicked, '18:30', t > 16.5 * 60 && t < 18.5 * 60 && S.kids.sonya.at === 'garden', 'door', t >= 15 * 60 && S.kids.sonya.at === 'garden');
    }
    const b = S.today.boss;
    if (b === 'mil' || b === 'mil2') {
      const dirty = HW.ROOM_IDS.slice().sort((x, y) => S.house.clean[x] - S.house.clean[y])[0];
      add(`Чистота ${b === 'mil' ? 70 : 80}%+ и пустая раковина к 18:00 ({свекровь|тёща})`, F.bossOk, '18:00', t > 15 * 60, S.house.dishes > 4 ? 'sink' : 'room:' + dirty, t < 18 * 60);
    }
    if (b === 'meeting') add('Родительское собрание (18:00–19:15)', F.meeting, '19:15', t > 17.5 * 60, 'door', t >= 18 * 60);
    if (b === 'bday') {
      add('Торт для Сони (испечь или купить)', F.cake || S.house.cake > 0 || F.bossOk, '16:00', t > 13 * 60, S.house.groceries >= 6 ? 'stove' : 'door', t < 16 * 60, S.house.groceries >= 6 ? '🎂 Испечь торт у плиты' : '🛒 Купить торт или продукты — в магазин');
      add('Украсить гостиную', F.decorated, '16:00', t > 13 * 60, S.house.decor > 0 ? 'room:living' : 'door', t < 16 * 60, S.house.decor > 0 ? '🎈 Украсить гостиную' : '🛒 Купить шарики — в магазин');
    }
    const mishaHome = S.kids.misha.at === 'home' && !S.kids.misha.asleep;
    if (b === 'pox') add(`Помазать Мишу зелёнкой (${Math.min(2, F.green || 0)}/2)`, (F.green || 0) >= 2, '21:00', t > 19 * 60, 'misha', mishaHome);
    if (G.homeworkDue() && b !== 'pox') add('Сделать уроки с Мишей', F.homework, '21:00', t > 18 * 60, S.owned.kidsDesk ? 'kidsDesk' : 'misha', mishaHome && (t >= 13.5 * 60 || !school));
    if (S.today.craft && !S.kids.misha.sick) add('Поделка из шишек', F.craft, '21:00', t > 18 * 60, 'misha', mishaHome);
    add('Завтрак детям', F.breakfast, '10:30', t > 7 * 60 && t < 10.5 * 60 && kidsUp, meal, kidsUp && t < 10.5 * 60, mealWhy('Завтрак'));
    if (!school || S.kids.sonya.sick || S.kids.misha.sick) add('Обед', F.lunch, '16:30', false, meal, kidsUp && t >= 12 * 60 && t < 16.5 * 60, mealWhy('Обед'));
    else add('Обед Мише после школы', F.lunch, '16:30', false, meal, kidsUp && t >= 12 * 60 && t < 16.5 * 60, mealWhy('Обед'));
    add('Ужин', F.dinner, '21:00', t > 18.5 * 60, meal, kidsUp && t >= 17 * 60, mealWhy('Ужин'));
    const dogBack = !G.dogAway();
    add(`Покормить Бадди (${Math.min(F.dogFed, 2)}/2)`, F.dogFed >= 2, null, false, S.house.dogFood > 0 ? 'bowl' : 'door', dogBack && ((F.dogFed < 1 && t >= 6 * 60) || t >= 17 * 60), S.house.dogFood > 0 ? null : '🛒 Корм кончился — купите в магазине');
    add(`Выгулять Бадди (${Math.min(F.dogWalks, 2)}/2)`, F.dogWalks >= 2, null, S.dog.need > 75, 'door', dogBack && S.dog.need > 50);
    add('Уложить детей до 21:30', F.kidsBed && !F.kidsBedLate, '21:30', t > 20.5 * 60, 'kidsbed', kidsUp && t >= 19.5 * 60);
    const H = S.house, hints = [];
    if (S.proj.flower && !S.proj.flower.failed && S.proj.flower.lastDay < S.day) hints.push('🌱 Полить цветок на кухне — иначе засохнет');
    if (S.crisis > 0) hints.push(`🚨 Кризис ${S.crisis}/3 — накормите детей, поднимите им настроение, приберитесь. Иначе Андрей сорвётся с вахты!`);
    if (H.groceries < 4 && H.portions < 3) hints.push('🥕 Продукты заканчиваются');
    if (H.dogFood < 2) hints.push('🦴 Корм для Бадди на исходе');
    if (H.chem < 1) hints.push('🧴 Закончилась бытовая химия');
    if (H.laundryClean < 2) hints.push('👕 Мало чистой одежды — пора стирать');
    if (H.dishes > 8) hints.push('🍽️ Гора посуды');
    if (H.washer.state === 'done') hints.push('🧺 Стирка готова — развесить');
    if (cleanAvg() < 40) hints.push('🧹 В доме грязно');
    if (H.toys.length > 5) hints.push('🧸 Игрушки по всему полу');
    return { list, hints };
  };

  // Ближайшая горящая задача для бегущей строки
  // Куда идти, чтобы поесть: готовая еда — плита, продукты — плита/холодильник, ничего — в магазин
  function mealGo() {
    const H = S.house;
    if (H.portions > 0 || H.stove.state !== 'idle') return 'stove';
    if (H.groceries >= 4) return S.owned.multicooker && H.mc.state === 'idle' ? 'multicooker' : 'stove';
    if (H.groceries > 0) return 'fridge';
    return 'door';
  }
  // Цель для стрелки-навигатора: {iid, why}
  G.guide = function () {
    const inc = G.incident();
    if (inc && !inc.remote) return { iid: inc.iid, why: inc.title, hot: true };
    const H = S.house;
    if (H.stove.state === 'ready') return { iid: 'stove', why: '🍲 Снять кастрюлю с плиты', hot: true };
    if (H.washer.state === 'done') return { iid: 'washer', why: '🧺 Развесить бельё', hot: true };
    const toMin = d => { if (!d) return 9999; const [h, m] = d.split(':').map(Number); return h * 60 + m; };
    const list = G.tasks().list.filter(x => !x.done && x.go && x.ready)
      .sort((a, b) => (b.urgent - a.urgent) || (toMin(a.deadline) - toMin(b.deadline)));
    if (list[0] && list[0].urgent) return { iid: list[0].go, why: list[0].why || list[0].text, hot: true };
    for (const id of ['sonya', 'misha']) {
      const k = S.kids[id];
      if (k.wish && k.at === 'home' && !k.asleep) return { iid: k.wish === 'eat' ? mealGo() : id, why: `${WISH_ICONS[k.wish]} ${k.name} ${WISH_TEXT[k.wish]}` };
    }
    if (list[0]) return { iid: list[0].go, why: list[0].why || list[0].text };
    const hobby = PROJECTS.find(d => S.proj[d.id] && !S.proj[d.id].failed && projToday(d.id) < d.perDay && (d.id !== 'pie' || S.house.groceries >= 3));
    if (hobby) return { iid: projWhere(hobby), why: hobby.icon + ' ' + hobby.step + ' (для души)' };
    const idea = G.ideas()[0];
    if (idea) return { iid: idea.iid || null, phone: idea.phone || null, why: '💡 ' + idea.text, idea: true };
    return null;
  };

  // Чем заняться, когда обязательное сделано (по убыванию пользы)
  G.ideas = function () {
    const out = [], H = S.house, t = S.time;
    const add = (text, iid, phone) => out.push({ text, iid, phone });
    if (t >= 21.5 * 60) add('Поздно — пора спать, завтра новый день', 'bed');
    if (S.mom.energy < 30) add(`Вы устали (${Math.round(S.mom.energy)}% сил) — отдохните или выпейте кофе`, S.owned.sofa && (S.flags.rests || 0) < 2 ? 'sofa' : 'fridge');
    if (S.mom.satiety < 35) add('Вы сами голодны — поешьте', H.portions > 0 ? 'stove' : 'fridge');
    const hobby = PROJECTS.find(d => S.proj[d.id] && !S.proj[d.id].failed && projToday(d.id) < d.perDay);
    if (hobby) add(`Продолжите хобби: ${hobby.icon} ${hobby.name}`, projWhere(hobby));
    if (!Object.keys(S.proj).length) add('Начните хобби — для настроения, уюта и наград (📱 → Хобби)', null, 'hobby');
    kidsAwakeHome().forEach(id => { const k = S.kids[id]; if (k.mood < 80) add(`Поиграйте с ${id === 'misha' ? 'Мишей' : 'Соней'} — настроение ${Math.round(k.mood)}%`, id); });
    if (H.toys.length) add(`Соберите игрушки с пола (${H.toys.length})`, 'room:' + HW.roomAt(H.toys[0].x, H.toys[0].z));
    const dirty = HW.ROOM_IDS.slice().sort((a, b) => H.clean[a] - H.clean[b])[0];
    if (H.clean[dirty] < 70) add(`Приберитесь: ${HW.ROOMS[dirty].name} — чистота ${Math.round(H.clean[dirty])}%`, 'room:' + dirty);
    if (H.dishes > 3) add(`Помойте посуду (${H.dishes} шт.)`, S.owned.dishwasher ? 'dishwasher' : 'sink');
    if (H.laundryDirty >= 3) add(`Постирайте бельё (${H.laundryDirty} компл.)`, S.owned.washer ? 'washer' : 'tub');
    if (H.groceries < 6 && t > 8 * 60 && t < 20 * 60) add('Купите продукты впрок', 'door');
    if (S.dog.mood < 80) add('Поиграйте с Бадди — он заскучал', 'dog');
    const dream = ['sofa', 'washer', 'bed', 'tv', 'fireplace', 'dishwasher', 'aquarium', 'bunkBed', 'coffeeMachine', 'dryer'].find(id => !S.owned[id] && S.money >= G.price(id) + 15000);
    if (dream) add(`Хватает денег на «${HW.furnById[dream].name}» — купите (📱 → Мебель)`, null, 'shop');
    if (S.money < 20000 && t > 8 * 60 && t < 20 * 60) add('Подработайте на ноутбуке — денег маловато', 'laptop');
    if (!S.flags.called && t > 9 * 60 && t < 22 * 60) add('Позвоните Андрею по видео', 'laptop');
    if (S.owned.fireplace && t >= 17 * 60 && !S.flags.fireplace) add('Посидите у камина', 'fireplace');
    if (!out.length) add('Всё идеально! Полюбуйтесь домом или посмотрите в окно', 'room:' + HW.roomAt(7.5, 6));
    return out;
  };

  G.nextTask = function () {
    const toMin = d => { const [h, m] = d.split(':').map(Number); return h * 60 + m; };
    const { list } = G.tasks();
    const open = list.filter(x => !x.done && x.deadline && toMin(x.deadline) >= S.time)
      .sort((a, b) => toMin(a.deadline) - toMin(b.deadline));
    return open[0] || null;
  };
  G.urgent = function () {
    const { list } = G.tasks();
    const u = list.find(x => x.urgent);
    return u ? u.text : null;
  };
})();
