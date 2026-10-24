// Имена героев и выбор, за кого играть (жена или муж).
// Тексты игры написаны с именами по умолчанию (Анна — игрок, Андрей — супруг на вахте,
// Миша, Соня, Бадди) и метками рода вида {вариант-за-жену|вариант-за-мужа}.
// HW.fix(текст) подставляет выбранные имена в нужном падеже и нужный род.
window.HW = window.HW || {};

(function () {
  const RU = 'А-Яа-яЁё';

  HW.NAME_DEFAULTS = {
    wife: { me: 'Анна', spouse: 'Андрей', son: 'Миша', daughter: 'Соня', dog: 'Бадди' },
    husband: { me: 'Андрей', spouse: 'Анна', son: 'Миша', daughter: 'Соня', dog: 'Бадди' },
  };
  HW.NAME_POOL = {
    f: ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Ирина', 'Светлана', 'Татьяна', 'Юлия', 'Екатерина', 'Дарья', 'Виктория'],
    m: ['Андрей', 'Сергей', 'Дмитрий', 'Алексей', 'Иван', 'Максим', 'Олег', 'Павел', 'Николай', 'Игорь', 'Артём', 'Роман'],
    son: ['Миша', 'Саша', 'Ваня', 'Петя', 'Дима', 'Тёма', 'Коля', 'Егор', 'Лёва', 'Гоша', 'Тимур', 'Федя'],
    daughter: ['Соня', 'Маша', 'Аня', 'Лиза', 'Даша', 'Варя', 'Катя', 'Алиса', 'Полина', 'Ева', 'Злата', 'Вера'],
    dog: ['Бадди', 'Рекс', 'Граф', 'Тузик', 'Шарик', 'Лаки', 'Бобик', 'Чарли', 'Джек', 'Барон', 'Пират', 'Ричи'],
  };

  // Склонение имени: {n, g, d, a, i, p}. sex: 'm' | 'f'
  HW.decline = function (name, sex) {
    const n = String(name).trim();
    const low = n.toLowerCase(), last = low.slice(-1), prev = low.slice(-2, -1), stem = n.slice(0, -1);
    if (last === 'а') {
      const g = 'гкхжшщч'.includes(prev) ? 'и' : 'ы';
      const i = 'жшщчц'.includes(prev) ? 'ей' : 'ой';
      return { n, g: stem + g, d: stem + 'е', a: stem + 'у', i: stem + i, p: stem + 'е' };
    }
    if (last === 'я') {
      if (prev === 'и') return { n, g: stem + 'и', d: stem + 'и', a: stem + 'ю', i: stem + 'ей', p: stem + 'и' };
      return { n, g: stem + 'и', d: stem + 'е', a: stem + 'ю', i: stem + 'ей', p: stem + 'е' };
    }
    if (sex === 'm') {
      if (last === 'й' || last === 'ь') return { n, g: stem + 'я', d: stem + 'ю', a: stem + 'я', i: stem + 'ем', p: stem + 'е' };
      if (/[бвгджзклмнпрстфхцчшщ]/.test(last)) {
        const i = 'жшщчц'.includes(last) ? 'ем' : 'ом';
        return { n, g: n + 'а', d: n + 'у', a: n + 'а', i: n + i, p: n + 'е' };
      }
    }
    return { n, g: n, d: n, a: n, i: n, p: n };   // не склоняется: Бадди, Мари, Любовь…
  };

  // Формы имён по умолчанию в текстах → кто это и какой падеж
  const FORMS = {
    'Анна': ['me', 'n'], 'Анны': ['me', 'g'], 'Анне': ['me', 'd'], 'Анну': ['me', 'a'], 'Анной': ['me', 'i'],
    'Андрей': ['spouse', 'n'], 'Андрея': ['spouse', 'g'], 'Андрею': ['spouse', 'd'], 'Андреем': ['spouse', 'i'], 'Андрее': ['spouse', 'p'],
    'Миша': ['son', 'n'], 'Миши': ['son', 'g'], 'Мише': ['son', 'd'], 'Мишу': ['son', 'a'], 'Мишей': ['son', 'i'],
    'Соня': ['daughter', 'n'], 'Сони': ['daughter', 'g'], 'Соне': ['daughter', 'd'], 'Соню': ['daughter', 'a'], 'Соней': ['daughter', 'i'],
    'Бадди': ['dog', '?'],
  };
  const words = Object.keys(FORMS).sort((a, b) => b.length - a.length);
  const NAME_RE = new RegExp(`(^|[^${RU}])(${words.join('|')})(?![${RU}])`, 'g');
  const TOKEN_RE = /\{([^{}|]*)\|([^{}]*)\}/g;

  // Падеж по предыдущему слову (для несклоняемого «Бадди» и «Андрея» = кого/чего)
  const PREV = {
    g: ['у', 'для', 'без', 'от', 'до', 'из', 'около', 'возле', 'кроме', 'после', 'нет', 'миска', 'миску', 'миски', 'корм', 'корма', 'сытость',
      'счастье', 'настроение', 'лежанка', 'лежанку', 'хвост', 'лапа', 'лапу', 'косичку', 'глаза', 'шерсть', 'мяч', 'игрушка', 'портрет', 'громче', 'носки', 'футболку', 'шутки', 'звонки', 'возвращения'],
    d: ['к', 'ко', 'пожаловалась', 'пожаловался', 'досталась', 'достался', 'достанется', 'отдали', 'дали', 'дать', 'по'],
    a: ['покормить', 'покормили', 'покормите', 'выгулять', 'выгуляли', 'выгуляйте', 'поймать', 'поймали', 'поймайте', 'погладить', 'погладили',
      'отогнать', 'отогнали', 'тренировать', 'научить', 'отчитать', 'обняли', 'обнять', 'на', 'про', 'через', 'найдите', 'найти', 'разбудить',
      'позвать', 'видеть', 'встретить', 'встретили', 'ждать', 'ждите', 'любит'],
    i: ['с', 'со', 'над', 'перед', 'между', 'за'],
    p: ['о', 'об', 'при'],
  };
  const prevCase = word => { for (const c in PREV) if (PREV[c].includes(word)) return c; return null; };

  let cacheKey = '', cache = null;
  function nameForms(S) {
    const key = S.hero + JSON.stringify(S.names);
    if (key === cacheKey) return cache;
    const male = S.hero === 'husband', N = S.names;
    cache = {
      me: HW.decline(N.me, male ? 'm' : 'f'),
      spouse: HW.decline(N.spouse, male ? 'f' : 'm'),
      son: HW.decline(N.son, 'm'),
      daughter: HW.decline(N.daughter, 'f'),
      dog: HW.decline(N.dog, 'm'),
    };
    cacheKey = key;
    return cache;
  }

  HW.fix = function (text) {
    if (text === null || text === undefined) return text;
    let t = String(text);
    const S = HW.S;
    const male = !!(S && S.hero === 'husband');
    if (t.indexOf('|') >= 0) t = t.replace(TOKEN_RE, (m, a, b) => (male ? b : a));
    if (!S || !S.names) return t;
    const D = HW.NAME_DEFAULTS.wife;
    if (!male && S.names.me === D.me && S.names.spouse === D.spouse && S.names.son === D.son && S.names.daughter === D.daughter && S.names.dog === D.dog) return t;
    const F = nameForms(S);
    return t.replace(NAME_RE, (m, pre, word, off, str) => {
      const before = str.slice(Math.max(0, off - 24), off + pre.length);
      if (/Князь\s*$/.test(before)) return m;                 // Князь Андрей из «Войны и мира»
      // предыдущее слово считаем, только если между ним и именем лишь пробел (без точек, тире, кавычек)
      const prevWord = ((before.match(/([А-Яа-яЁё]+)\s+$/) || [])[1] || '').toLowerCase();
      let [who, c] = FORMS[word];
      if (c === '?') c = prevCase(prevWord) || 'n';
      else if (c === 'g' && who === 'spouse' && PREV.a.includes(prevWord)) c = 'a';
      else if (c === 'd' && PREV.p.includes(prevWord)) c = 'p';
      return pre + F[who][c];
    });
  };

  // Заменить текст во всех текстовых узлах элемента (обработчики событий сохраняются)
  HW.fixDom = function (el) {
    if (!el || !HW.S) return;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = w.nextNode())) {
      const v = node.nodeValue, f = HW.fix(v);
      if (f !== v) node.nodeValue = f;
    }
  };

  HW.cleanName = function (s, fallback) {
    s = String(s || '').replace(/[^А-Яа-яЁёA-Za-z\- ]/g, '').trim().slice(0, 14);
    if (!s) return fallback;
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
})();
