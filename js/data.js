// Статические данные игры: константы, комнаты, каталог мебели, магазин.
window.HW = window.HW || {};

HW.CFG = {
  SHIFT_DAYS: 30,          // сколько дней длится вахта мужа
  START_MONEY: 50000,
  SALARY: 120000,          // перевод от мужа
  SALARY_EVERY: 30,
  BILLS: 9000,             // коммуналка
  WAKE: 6 * 60,            // подъём
  FORCE_SLEEP: 25 * 60,    // в 01:00 героиня засыпает сама
  SAVE_KEY: 'hw_save_v1',
  SETTINGS_KEY: 'hw_settings_v1',
  EYE: 1.6,
  SPEED: 2.3,
  REACH: 2.7,
};

// Уровни сложности: decay — скорость голода, усталости, грязи; salary — перевод мужа
HW.DIFF = {
  easy:   { name: 'Лёгкая',   icon: '🌸', desc: 'Муж щедрый, дети спокойные, пыль ленивая', decay: 0.8,  salary: 150000, money: 70000, inc: 0.7, clock: 0.75 },
  normal: { name: 'Обычная',  icon: '🏠', desc: 'Как в жизни. То есть сложно',              decay: 1,    salary: 120000, money: 50000, inc: 1,   clock: 1 },
  hard:   { name: 'Хардкор',  icon: '🔥', desc: 'Денег мало, все голодные, Бадди злой',      decay: 1.25, salary: 95000,  money: 30000, inc: 1.4, clock: 1.25 },
};

// Стены по умолчанию — у каждой комнаты свой цвет
HW.DEFAULT_WALLS = {
  living:  { base: '#e3cba6', pat: 'plain' },
  kids:    { base: '#bfdcec', pat: 'plain' },
  kitchen: { base: '#f7edc4', ink: '#ffffff', pat: 'tiles' },
  bath:    { base: '#c4e2ec', ink: '#ffffff', pat: 'tiles' },
  bedroom: { base: '#d6c6e4', pat: 'plain' },
  hall:    { base: '#e0d6c8', pat: 'plain' },
};
// Обои для проекта «Поклеить обои»
HW.WALLPAPERS = [
  { id: 'cream',    name: 'Кремовая полоска',   base: '#f0e2c6', ink: '#dcc497', pat: 'stripes', price: 3500 },
  { id: 'mint',     name: 'Мятный горошек',     base: '#c8ebdb', ink: '#94cfb4', pat: 'dots',    price: 3500 },
  { id: 'lavender', name: 'Лавандовые цветы',   base: '#e4d8f0', ink: '#a98ad1', pat: 'flowers', price: 4500 },
  { id: 'sky',      name: 'Небо с облаками',    base: '#b9dcf5', ink: '#ffffff', pat: 'clouds',  price: 4500 },
  { id: 'terra',    name: 'Тёплая терракота',   base: '#e2ad8c', ink: '#cf9472', pat: 'plain',   price: 3000 },
  { id: 'stars',    name: 'Звёздная ночь',      base: '#3c4a7c', ink: '#ffe7a3', pat: 'stars',   price: 5000 },
  { id: 'sunny',    name: 'Солнечная полоска',  base: '#f8e39c', ink: '#efc95c', pat: 'stripes', price: 3000 },
  { id: 'leaves',   name: 'Тропические листья', base: '#d8ebd0', ink: '#6fae6a', pat: 'leaves',  price: 5500 },
  { id: 'brick',    name: 'Лофт-кирпич',        base: '#c4866a', ink: '#e6c9b6', pat: 'brick',   price: 5000 },
];
HW.wallpaperById = {};
HW.WALLPAPERS.forEach(w => HW.wallpaperById[w.id] = w);

HW.WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
HW.WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

HW.ROOMS = {
  living:  { name: 'Гостиная', x0: 0,  x1: 6,  z0: 0, z1: 6 },
  kids:    { name: 'Детская',  x0: 0,  x1: 6,  z0: 6, z1: 12 },
  kitchen: { name: 'Кухня',    x0: 9,  x1: 16, z0: 0, z1: 6 },
  bath:    { name: 'Ванная',   x0: 9,  x1: 12, z0: 9, z1: 12 },
  bedroom: { name: 'Спальня',  x0: 12, x1: 16, z0: 6, z1: 12 },
  hall:    { name: 'Прихожая', x0: 6,  x1: 9,  z0: 0, z1: 12 },
};
HW.ROOM_IDS = ['living', 'kids', 'kitchen', 'bath', 'bedroom', 'hall'];

HW.roomAt = function (x, z) {
  for (const id of ['living', 'kids', 'kitchen', 'bath', 'bedroom']) {
    const r = HW.ROOMS[id];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  }
  return 'hall';
};

// Каталог мебели и техники. Позиции и геометрия — в world.js по id.
HW.FURNITURE = [
  { id: 'sofa',        name: 'Диван',                room: 'living',  price: 24000, icon: '🛋️', desc: 'Можно отдохнуть. +уют' },
  { id: 'tv',          name: 'Телевизор',            room: 'living',  price: 28000, icon: '📺', desc: 'Мультики детям, сериал вечером' },
  { id: 'coffeeTable', name: 'Журнальный столик',    room: 'living',  price: 6000,  icon: '🪵', desc: '+уют' },
  { id: 'rugLiving',   name: 'Ковёр',                room: 'living',  price: 5000,  icon: '🟥', desc: '+уют' },
  { id: 'bookshelf',   name: 'Книжный шкаф',         room: 'living',  price: 11000, icon: '📚', desc: 'Чтение полезнее и приятнее' },
  { id: 'plantLiving', name: 'Фикус',                room: 'living',  price: 2500,  icon: '🪴', desc: '+уют' },
  { id: 'treadmill',   name: 'Беговая дорожка',      room: 'living',  price: 38000, icon: '🏃‍♀️', desc: 'Тренировки дома, без фитнес-клуба' },
  { id: 'diningTable', name: 'Обеденный стол',       room: 'kitchen', price: 16000, icon: '🍽️', desc: 'Семейные обеды поднимают настроение' },
  { id: 'dishwasher',  name: 'Посудомойка',          room: 'kitchen', price: 27000, icon: '🫧', desc: 'Посуда за 10 минут' },
  { id: 'multicooker', name: 'Мультиварка',          room: 'kitchen', price: 7000,  icon: '🍲', desc: 'Готовка вдвое быстрее' },
  { id: 'plantKitchen',name: 'Цветы на кухню',       room: 'kitchen', price: 2000,  icon: '🌷', desc: '+уют' },
  { id: 'washer',      name: 'Стиральная машина',    room: 'bath',    price: 30000, icon: '🧺', desc: 'Больше не стирать руками' },
  { id: 'vacuum',      name: 'Пылесос',              room: 'hall',    price: 11000, icon: '🧹', desc: 'Уборка быстрее и чище' },
  { id: 'robot',       name: 'Робот-пылесос',        room: 'hall',    price: 24000, icon: '🤖', desc: 'Каждую ночь сам убирает дом' },
  { id: 'coatRack',    name: 'Вешалка с обувницей',  room: 'hall',    price: 4000,  icon: '🧥', desc: 'Утренние сборы быстрее' },
  { id: 'dogBed',      name: 'Лежанка для собаки',   room: 'hall',    price: 3000,  icon: '🐕', desc: 'Бадди спокойнее' },
  { id: 'bed',         name: 'Двуспальная кровать',  room: 'bedroom', price: 34000, icon: '🛏️', desc: 'Сон восстанавливает больше сил' },
  { id: 'wardrobe',    name: 'Шкаф-купе',            room: 'bedroom', price: 19000, icon: '🚪', desc: '+уют' },
  { id: 'desk',        name: 'Рабочий стол',         room: 'bedroom', price: 9000,  icon: '💻', desc: 'Подработка оплачивается на 30% лучше' },
  { id: 'bunkBed',     name: 'Двухъярусная кровать', room: 'kids',    price: 26000, icon: '🛌', desc: 'Детей легче уложить, они бодрее' },
  { id: 'kidsDesk',    name: 'Детская парта',        room: 'kids',    price: 9000,  icon: '✏️', desc: 'Уроки эффективнее и быстрее' },
  { id: 'toyBox',      name: 'Ящик для игрушек',     room: 'kids',    price: 3500,  icon: '🧸', desc: 'Меньше разбросанных игрушек' },
  { id: 'rugKids',     name: 'Детский коврик',       room: 'kids',    price: 4000,  icon: '🟦', desc: '+уют' },
  { id: 'armchair',    name: 'Уютное кресло',        room: 'living',  price: 16000, icon: '💺', desc: 'Кресло у камина. +уют' },
  { id: 'floorLamp',   name: 'Торшер',               room: 'living',  price: 5000,  icon: '🛋️', desc: 'Тёплый свет вечером. +уют' },
  { id: 'fireplace',   name: 'Электрокамин',         room: 'living',  price: 22000, icon: '🔥', desc: 'Вечером посидеть у огня: +настроение, +силы' },
  { id: 'aquarium',    name: 'Аквариум с рыбками',   room: 'living',  price: 12000, icon: '🐠', desc: 'Дети в восторге: их настроение выше' },
  { id: 'curtains',    name: 'Гардины во все комнаты', room: 'living', price: 7000, icon: '🪟', desc: 'Красивые шторы. +уют' },
  { id: 'coffeeMachine', name: 'Кофемашина',         room: 'kitchen', price: 15000, icon: '☕', desc: 'Кофе бодрит сильнее, чашек в день больше' },
  { id: 'microwave',   name: 'Микроволновка',        room: 'kitchen', price: 6000,  icon: '📟', desc: 'Еда хранится на день дольше' },
  { id: 'playTent',    name: 'Детская палатка-вигвам', room: 'kids',  price: 8000,  icon: '⛺', desc: 'Детям веселее, дерутся реже' },
  { id: 'nightLight',  name: 'Ночник «Звёздное небо»', room: 'kids',  price: 3000,  icon: '🌟', desc: 'Дети засыпают быстрее' },
  { id: 'kidsShelf',   name: 'Стеллаж для игрушек',  room: 'kids',    price: 6000,  icon: '🗄️', desc: 'Игрушек на полу ещё меньше' },
  { id: 'vanity',      name: 'Туалетный столик',     room: 'bedroom', price: 12000, icon: '💄', desc: 'Утром навести красоту: +настроение' },
  { id: 'bedroomRug',  name: 'Пушистый ковёр',       room: 'bedroom', price: 6000,  icon: '🧶', desc: 'Тёплый пол. +уют' },
  { id: 'dryer',       name: 'Сушильная машина',     room: 'bath',    price: 25000, icon: '♨️', desc: 'Бельё сохнет само — не нужно развешивать' },
  { id: 'bathRug',     name: 'Коврик для ванной',    room: 'bath',    price: 1500,  icon: '🛁', desc: '+уют' },
  { id: 'hallMirror',  name: 'Зеркало в прихожей',   room: 'hall',    price: 4000,  icon: '🪞', desc: 'Последний взгляд перед выходом. +уют' },
];
HW.furnById = {};
HW.FURNITURE.forEach(f => HW.furnById[f.id] = f);

// Товары в магазине
HW.SHOP = [
  { id: 'groceries', name: 'Продукты', unit: '8 шт.', qty: 8, price: 1900, icon: '🥕', desc: 'Из 4 шт. готовится 6 порций' },
  { id: 'dogFood',   name: 'Корм для собаки', unit: '7 порций', qty: 7, price: 800, icon: '🦴', desc: 'Кормить 2 раза в день' },
  { id: 'chem',      name: 'Бытовая химия', unit: '6 шт.', qty: 6, price: 700, icon: '🧴', desc: 'Для стирки, посуды и полов' },
  { id: 'sweets',    name: 'Сладости детям', unit: '3 шт.', qty: 3, price: 450, icon: '🍬', desc: 'Поднимают детям настроение' },
  { id: 'cake',      name: 'Торт «Наполеон»', unit: '1 шт.', qty: 1, price: 2500, icon: '🎂', desc: 'Для праздника. Или для стресса' },
  { id: 'decor',     name: 'Шарики и гирлянды', unit: 'набор', qty: 1, price: 1200, icon: '🎈', desc: 'Украсить гостиную к празднику' },
];

HW.fmtTime = function (min) {
  min = Math.floor(min);
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
HW.fmtDur = function (min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h && m) return h + ' ч ' + m + ' мин';
  if (h) return h + ' ч';
  return m + ' мин';
};
HW.fmtMoney = function (v) {
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
};
HW.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
