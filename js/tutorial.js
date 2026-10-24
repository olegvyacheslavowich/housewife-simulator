// Обучение в первый день: пошаговые задания с подсказкой и стрелкой-навигатором.
(function () {
  const T = {};
  HW.Tutorial = T;
  const $ = id => document.getElementById(id);
  const ev = {};          // события интерфейса: открыли телефон, вкладку «Хобби»
  let shownStep = -1;

  const STEPS = [
    { title: 'Осмотритесь',
      text: () => HW.settings.view === 'fp'
        ? 'Это вы — Анна, а это ваш новый дом. Смотреть: ведите пальцем по правой половине экрана. Ходить: джойстик на левой половине (на компьютере — WASD и мышь).'
        : 'Это вы — Анна (в {красном|синем}), а это ваш новый дом. Ходить: тапните по полу — Анна {пойдёт сама|пойдёт сам}. Повернуть камеру — тянуть пальцем, приблизить — щипок или колесо мыши.',
      goal: 'Дойдите до кухни', target: 'room:kitchen', done: () => HW.roomAt(HW.Main.playerPos().x, HW.Main.playerPos().z) === 'kitchen' },
    { title: 'Ваша панель',
      text: 'Вверху слева — часы, деньги и три полоски: ⚡ энергия, 🙂 настроение, 🍽️ сытость. Если энергия кончится — свалитесь спать прямо на пол, а день закончится досрочно.',
      next: true },
    { title: 'Еда',
      text: 'Голодная семья — несчастная семья. Подойдите к плите и нажмите «Поставить вариться». Действия с предметами: тап по предмету или кнопка «Действие» справа внизу.',
      goal: 'Поставьте еду вариться', target: 'stove', done: s => s.house.stove.state !== 'idle' || s.house.portions > 0 },
    { title: 'Пока варится',
      text: 'Кастрюля варится сама — стоять у плиты не нужно. Покормите Бадди: его миска у двери кухни.',
      goal: 'Покормите Бадди', target: 'bowl', done: s => s.flags.dogFed >= 1 },
    { title: 'Прогулка',
      text: 'Бадди нужно гулять дважды в день, иначе в прихожей будет «сюрприз». Через входную дверь также ездят в школу, садик и магазин.',
      goal: 'Выгуляйте Бадди через входную дверь', target: 'door', done: s => s.flags.dogWalks >= 1 },
    { title: 'Обед',
      text: 'Готовую кастрюлю снимите с плиты в течение 30 минут — иначе подгорит. Потом нажмите «Накормить семью».',
      goal: 'Накормите семью', target: 'stove', done: s => !!s.flags.fed, wait: true },
    { title: 'Телефон',
      text: '📱 Телефон вверху справа — главное меню: задачи дня, семья, дом, хобби, мебель. Откройте его.',
      goal: 'Откройте телефон', done: () => !!ev.phone },
    { title: 'Что будет, если не успеть',
      text: 'Во вкладке «Сегодня» — что нужно сделать и до скольки. Не успели — штрафы к настроению и оценкам, день получит меньше звёзд. А если 3 дня подряд всё на нуле (дети голодные и несчастные, дом в руинах) — Андрей сорвётся с вахты, и игра проиграна.',
      next: true },
    { title: 'Уборка',
      text: 'Дом пачкается сам — особенно от детей и Бадди. Кнопка 📍 внизу экрана — уборка той комнаты, где вы стоите. Игрушки на полу собираются тапом.',
      goal: 'Уберитесь в любой комнате', target: 'room:kids', done: s => !!s.flags.cleaned },
    { title: 'Хобби — для души',
      text: 'Кроме забот есть хобби: цветок, картины, обои, гитара, йога, блог… Они необязательные, делаются по сеансу в день и дают настроение, уют и награды — деньги, урожай, картины на стенах. Откройте 📱 → «Хобби».',
      goal: 'Откройте вкладку «Хобби»', done: () => !!ev.hobbyTab },
    { title: 'Вы готовы!',
      text: 'Стрелка внизу всегда подскажет следующее дело, а когда всё сделано — идею, чем заняться. Вечером уложите детей в детской и ложитесь спать в спальне. Завтра понедельник: собрать детей и отвезти в школу к 8:30! Теперь часы пойдут сами: 1 секунда — 1 игровая минута.',
      next: true, last: true },
  ];

  T.event = function (name) {
    if (!HW.Game.tutorialActive()) return;
    ev[name] = true;
    T.check();
  };
  const step = () => STEPS[Math.min(HW.S.tut.step, STEPS.length - 1)];

  // Цель для стрелки, пока идёт обучение
  T.guide = function () {
    if (!HW.Game.tutorialActive()) return null;
    const st = step();
    if (!st.target) return null;
    return { iid: st.target, why: '🎓 ' + st.goal };
  };

  function advance() {
    const s = HW.S;
    if (step().last) {
      HW.Game.finishTutorial();
      T.render();
      HW.UI.toast('🎓 Обучение пройдено! Часы пошли. Удачи — и берегите нервы.', 'good', 'ach');
      HW.UI.updateHUD();
      return;
    }
    s.tut.step++;
    HW.Audio.play('done');
    HW.Game.save();
    T.render();
    HW.UI.updateHUD();
  }

  T.check = function () {
    if (!HW.S || !HW.Game.tutorialActive()) return;
    const st = step();
    if (!st.next && st.done && st.done(HW.S)) advance();
    else if (shownStep !== HW.S.tut.step) T.render();
    else updateWait();
  };

  function updateWait() {
    const st = step(), s = HW.S, b = $('tWait');
    const cooking = st.wait && s.house.stove.state === 'cooking';
    b.hidden = !cooking;
    if (cooking) b.textContent = `⏩ Подождать, пока сварится (${Math.max(1, Math.ceil(s.house.stove.doneAt - (s.day * 1440 + s.time)))} мин)`;
  }

  let collapseTimer = null;
  T.render = function () {
    const box = $('tut');
    clearTimeout(collapseTimer);
    if (!HW.S || !HW.Game.tutorialActive()) { box.classList.add('hidden'); HW.UI.layoutTop && HW.UI.layoutTop(); return; }
    const st = step();
    shownStep = HW.S.tut.step;
    box.classList.remove('hidden');
    box.classList.remove('collapsed');
    // шаг с заданием через 12 секунд сворачивается до одной цели, чтобы не закрывать обзор
    if (st.goal) collapseTimer = setTimeout(() => { box.classList.add('collapsed'); HW.UI.layoutTop(); }, 12000);
    $('tStep').textContent = `🎓 ${HW.S.tut.step + 1} из ${STEPS.length} · ${st.title}  ▾`;
    $('tText').textContent = typeof st.text === 'function' ? st.text() : st.text;
    $('tGoal').textContent = st.goal ? '🎯 ' + st.goal : '';
    $('tGoal').hidden = !st.goal;
    $('tNext').hidden = !st.next;
    $('tNext').textContent = st.last ? 'Начать игру!' : 'Понятно →';
    updateWait();
    HW.fixDom(box);                          // выбранные имена и род героя
    HW.UI.layoutTop && HW.UI.layoutTop();
  };

  T.init = function () {
    $('tStep').onclick = () => { clearTimeout(collapseTimer); $('tut').classList.toggle('collapsed'); HW.UI.layoutTop(); };
    $('tNext').onclick = advance;
    $('tSkip').onclick = () => {
      HW.Game.finishTutorial();
      T.render();
      HW.UI.toast('Обучение пропущено. Подсказки — в 📱 → Опции → «Как играть».', 'info');
      HW.UI.updateHUD();
    };
    $('tWait').onclick = () => {
      const s = HW.S, left = Math.ceil(s.house.stove.doneAt - (s.day * 1440 + s.time));
      if (left > 0) HW.UI.handleResult(HW.Game.liveTick(left));
      T.check();
    };
  };
})();
