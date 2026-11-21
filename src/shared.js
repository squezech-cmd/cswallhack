// Shared by the browser and the authoritative room server.
export const PLAYER_COLORS = ['#e46643', '#4da99d', '#e8ad48', '#8a82b9', '#da7a9a', '#729ac0'];

export const STATIONS = [
  { id: 'raw', name: 'ХОЛОДИЛЬНИК', detail: 'Сырые котлеты', x: -5.75, z: -3.50, w: 1.7, d: 1.65, side: 'left' },
  { id: 'grill', name: 'ГРИЛЬ', detail: 'Жарим котлеты', x: -5.75, z: -1.45, w: 1.7, d: 1.65, side: 'left' },
  { id: 'fryer', name: 'ФРИТЮР', detail: 'Готовим картошку', x: -5.75, z: 0.60, w: 1.7, d: 1.65, side: 'left' },
  { id: 'potato', name: 'КАРТОФЕЛЬ', detail: 'Заготовка для фри', x: -5.75, z: 2.65, w: 1.7, d: 1.65, side: 'left' },
  { id: 'soda', name: 'ГАЗИРОВКА', detail: 'Прохладительные напитки', x: -3.35, z: -4.55, w: 1.7, d: 1.4, side: 'back' },
  { id: 'serve', name: 'ВЫДАЧА', detail: 'Отдаём готовые блюда', x: 0, z: -4.55, w: 2.65, d: 1.4, side: 'back' },
  { id: 'coffee', name: 'КОФЕ', detail: 'Горячие напитки', x: 3.35, z: -4.55, w: 1.7, d: 1.4, side: 'back' },
  { id: 'bun', name: 'БУЛОЧКИ', detail: 'Основа бургера', x: 5.75, z: -3.50, w: 1.7, d: 1.65, side: 'right' },
  { id: 'lettuce', name: 'САЛАТ', detail: 'Свежие листья', x: 5.75, z: -1.45, w: 1.7, d: 1.65, side: 'right' },
  { id: 'tomato', name: 'ТОМАТЫ', detail: 'Сочные ломтики', x: 5.75, z: 0.60, w: 1.7, d: 1.65, side: 'right' },
  { id: 'cheese', name: 'СЫР', detail: 'Для чизбургера', x: 5.75, z: 2.65, w: 1.7, d: 1.65, side: 'right' },
  { id: 'prep', name: 'СБОРКА', detail: 'Собираем бургеры', x: 2.05, z: 3.95, w: 2.3, d: 1.4, side: 'island' },
];

export const ITEMS = {
  patty_raw: { name: 'Сырая котлета', icon: '🥩', short: 'КОТЛЕТА' },
  patty: { name: 'Готовая котлета', icon: '🥩', short: 'КОТЛЕТА' },
  patty_burnt: { name: 'Сгоревшая котлета', icon: '💨', short: 'СГОРЕЛО' },
  fries_raw: { name: 'Сырой картофель', icon: '🥔', short: 'КАРТОФЕЛЬ' },
  fries: { name: 'Картофель фри', icon: '🍟', short: 'ФРИ' },
  fries_burnt: { name: 'Сгоревший картофель', icon: '💨', short: 'СГОРЕЛО' },
  bun: { name: 'Булочка', icon: '🍞', short: 'БУЛОЧКА' },
  lettuce: { name: 'Салат', icon: '🥬', short: 'САЛАТ' },
  tomato: { name: 'Томат', icon: '🍅', short: 'ТОМАТ' },
  cheese: { name: 'Сыр', icon: '🧀', short: 'СЫР' },
  burger: { name: 'Бургер', icon: '🍔', short: 'БУРГЕР' },
  cheeseburger: { name: 'Чизбургер', icon: '🍔', short: 'ЧИЗБУРГЕР' },
  soda: { name: 'Газировка', icon: '🥤', short: 'ГАЗИРОВКА' },
  coffee: { name: 'Кофе', icon: '☕', short: 'КОФЕ' },
};

export const ORDER_TEMPLATES = [
  { name: 'Классика', items: ['burger'], price: 12 },
  { name: 'Фри и газировка', items: ['fries', 'soda'], price: 10 },
  { name: 'Чиз-комбо', items: ['cheeseburger', 'fries'], price: 19 },
  { name: 'Бодрое утро', items: ['burger', 'coffee'], price: 16 },
  { name: 'Быстрый перекус', items: ['fries', 'coffee'], price: 9 },
  { name: 'Двойная жажда', items: ['soda', 'soda'], price: 8 },
  { name: 'Чизбургер', items: ['cheeseburger'], price: 15 },
  { name: 'Большой обед', items: ['burger', 'fries', 'soda'], price: 22 },
];

export const UPGRADES = [
  { id: 'grill', name: 'БЫСТРЫЙ ГРИЛЬ', detail: 'Котлеты готовятся быстрее', price: 25 },
  { id: 'fryer', name: 'НОВЫЙ ФРИТЮР', detail: 'Картофель готовится быстрее', price: 25 },
  { id: 'patience', name: 'УЮТНЫЙ ЗАЛ', detail: 'Гости ждут дольше', price: 35 },
];

export const EVENTS = [
  { type: 'rush', title: 'ЧАС ПИК', description: 'Гости приходят чаще!' },
  { type: 'tips', title: 'ЩЕДРЫЕ ГОСТИ', description: '+$3 за каждый готовый заказ!' },
  { type: 'heat', title: 'ГОРЯЧАЯ КУХНЯ', description: 'Еда готовится и сгорает быстрее!' },
];

export const SHIFT_SECONDS = 240;
export const MAX_PLAYERS = 8;
export const INTERACT_DISTANCE = 2.75;
export const WORLD_BOUNDS = { minX: -6.85, maxX: 6.85, minZ: -5.20, maxZ: 5.15 };

export function stationById(id) {
  return STATIONS.find((station) => station.id === id);
}
