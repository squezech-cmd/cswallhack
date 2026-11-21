import { ITEMS, ORDER_TEMPLATES, PLAYER_COLORS, SHIFT_SECONDS, STATIONS, INTERACT_DISTANCE, WORLD_BOUNDS, UPGRADES, EVENTS } from '../src/shared.js';

export function createPlayer(id, name, color = 0) {
  const cleanName = (typeof name === 'string' ? name : '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 20) || 'Повар';
  return {
    id,
    name: cleanName,
    color: PLAYER_COLORS[Number.isInteger(color) && color >= 0 && color < PLAYER_COLORS.length ? color : 0],
    x: 0, z: 1.6, yaw: 0, hand: null, lastMoveAt: 0,
  };
}

export function createRoom(id, host, now = Date.now()) {
  return {
    id, hostId: host.id, players: new Map([[host.id, host]]), phase: 'lobby',
    createdAt: now, shift: 0, money: 0, totalServed: 0, score: 0,
    served: 0, missed: 0, orders: [], nextOrderId: 1, nextOrderAt: 0,
    shiftEndsAt: 0, stations: freshStations(), chat: [],
    upgrades: { grill: false, fryer: false, patience: false }, event: null, nextEventAt: 0,
  };
}

function freshStations() {
  return { grill: null, fryer: null, prep: [] };
}

function addOrder(room, index, now) {
  const template = ORDER_TEMPLATES[index % ORDER_TEMPLATES.length];
  const id = room.nextOrderId++;
  room.orders.push({
    id, name: template.name,
    items: template.items.map((type) => ({ type, delivered: false })),
    price: template.price,
    createdAt: now, expiresAt: now + (room.upgrades.patience ? 170_000 : 140_000),
  });
}

export function beginShift(room, now = Date.now()) {
  room.phase = 'playing';
  room.shift += 1;
  room.shiftEndsAt = now + SHIFT_SECONDS * 1000;
  room.served = 0;
  room.missed = 0;
  room.score = 0;
  room.stations = freshStations();
  room.orders = [];
  room.event = null;
  room.nextEventAt = now + 65_000;
  for (const [index, player] of [...room.players.values()].entries()) {
    player.hand = null;
    player.x = (index % 4 - 1.5) * 0.8;
    player.z = 1.65 + Math.floor(index / 4) * 0.9;
    player.yaw = 0;
    player.lastMoveAt = now;
  }
  // The first two tickets are intentionally predictable for new cooks.
  addOrder(room, 0, now);
  addOrder(room, 1, now);
  room.nextOrderAt = now + 40_000;
}

export function advanceRoom(room, now = Date.now()) {
  if (room.phase !== 'playing') return;
  if (now >= room.shiftEndsAt) {
    room.phase = 'results';
    return;
  }
  if (room.event && now >= room.event.endsAt) {
    room.event = null;
    room.nextEventAt = now + 55_000;
  }
  if (!room.event && now >= room.nextEventAt) {
    const selected = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    room.event = { ...selected, startedAt: now, endsAt: now + 35_000 };
    if (selected.type === 'rush') room.nextOrderAt = Math.min(room.nextOrderAt, now + 3_000);
  }
  const expired = room.orders.filter((order) => order.expiresAt <= now);
  if (expired.length) {
    room.missed += expired.length;
    room.orders = room.orders.filter((order) => order.expiresAt > now);
  }
  if (room.orders.length < 4 && now >= room.nextOrderAt) {
    const index = 2 + Math.floor(Math.random() * (ORDER_TEMPLATES.length - 2));
    addOrder(room, index, now);
    room.nextOrderAt = now + (room.event?.type === 'rush' ? 15_000 : Math.max(23_000, 40_000 - (room.shift - 1) * 2_000));
  }
}

function result(text, kind = 'info') { return { text, kind }; }

function takeIngredient(player, type) {
  if (player.hand) return result('Сначала освободите руки. Нажмите Q, чтобы выбросить предмет.');
  player.hand = type;
  return result(`Взято: ${ITEMS[type].name}`, 'success');
}

function cook(room, player, station, rawType, cookedType, cookMs, now) {
  const slot = room.stations[station];
  if (!slot) {
    if (player.hand !== rawType) {
      return result(station === 'grill' ? 'Возьмите сырую котлету в холодильнике.' : 'Возьмите картофель для фри.');
    }
    const duration = Math.max(2_500, cookMs - (room.upgrades[station] ? 2_500 : 0) - (room.event?.type === 'heat' ? 1_500 : 0));
    const burnDelay = room.event?.type === 'heat' ? 12_000 : 22_000;
    room.stations[station] = { type: cookedType, startedAt: now, readyAt: now + duration, burnAt: now + duration + burnDelay };
    player.hand = null;
    return result(station === 'grill' ? 'Котлета жарится. Не забудьте забрать её!' : 'Картошка готовится. Не передержите!', 'success');
  }
  if (player.hand) return result('Освободите руки, чтобы забрать еду.');
  if (now < slot.readyAt) return result('Ещё готовится. Подождите немного!');
  player.hand = now >= slot.burnAt ? `${cookedType}_burnt` : cookedType;
  room.stations[station] = null;
  return result(now >= slot.burnAt ? 'Ой, еда сгорела! Нажмите Q, чтобы выбросить её.' : `Готово: ${ITEMS[cookedType].name}`, now >= slot.burnAt ? 'warning' : 'success');
}

function prepBurger(room, player) {
  const ingredients = room.stations.prep;
  const hand = player.hand;
  if (!hand) {
    if (!ingredients.length) return result('Положите булочку на стол сборки.');
    if (!ingredients.includes('patty')) return result('Теперь положите готовую котлету.');
    player.hand = ingredients.includes('cheese') ? 'cheeseburger' : 'burger';
    room.stations.prep = [];
    return result(`Готово: ${ITEMS[player.hand].name}! Отнесите на выдачу.`, 'success');
  }
  if (hand === 'bun') {
    if (ingredients.length) return result('На столе уже собирают бургер.');
    ingredients.push('bun');
    player.hand = null;
    return result('Булочка на месте. Добавьте готовую котлету.', 'success');
  }
  if (['patty', 'cheese', 'lettuce', 'tomato'].includes(hand)) {
    if (!ingredients.includes('bun')) return result('Сначала положите булочку.');
    if (ingredients.includes(hand)) return result('Этот ингредиент уже добавлен.');
    ingredients.push(hand);
    player.hand = null;
    return result(hand === 'patty' ? 'Котлета на месте. Добавьте сыр или заберите бургер.' : `${ITEMS[hand].name} добавлен.`, 'success');
  }
  return result('Этот предмет нельзя положить в бургер.');
}

function serve(room, player, now) {
  if (!player.hand) return result('Возьмите готовое блюдо и принесите его сюда.');
  const order = room.orders.find((ticket) => ticket.items.some((item) => item.type === player.hand && !item.delivered));
  if (!order) return result('В текущих заказах нет такого блюда.');
  const item = order.items.find((entry) => entry.type === player.hand && !entry.delivered);
  item.delivered = true;
  const itemName = ITEMS[player.hand].name;
  player.hand = null;
  if (order.items.every((entry) => entry.delivered)) {
    const timeBonus = Math.max(0, Math.ceil((order.expiresAt - now) / 30_000));
    const eventBonus = room.event?.type === 'tips' ? 3 : 0;
    room.money += order.price + timeBonus + eventBonus;
    room.score += 100 + timeBonus * 10;
    room.served += 1;
    room.totalServed += 1;
    room.orders = room.orders.filter((ticket) => ticket.id !== order.id);
    // An empty kitchen gets its next customer sooner, without flooding the queue.
    if (room.orders.length === 0) room.nextOrderAt = Math.min(room.nextOrderAt, now + 5_000);
    return result(`Заказ #${String(order.id).padStart(2, '0')} готов! +$${order.price + timeBonus + eventBonus}`, 'success');
  }
  return result(`${itemName} добавлен в заказ #${String(order.id).padStart(2, '0')}.`, 'success');
}

export function interact(room, player, stationId, now = Date.now()) {
  if (room.phase !== 'playing') return result('Смена ещё не началась.');
  const station = STATIONS.find((entry) => entry.id === stationId);
  if (!station || Math.hypot(station.x - player.x, station.z - player.z) > INTERACT_DISTANCE) return result('Подойдите ближе к станции.');
  switch (stationId) {
    case 'raw': return takeIngredient(player, 'patty_raw');
    case 'potato': return takeIngredient(player, 'fries_raw');
    case 'bun': return takeIngredient(player, 'bun');
    case 'lettuce': return takeIngredient(player, 'lettuce');
    case 'tomato': return takeIngredient(player, 'tomato');
    case 'cheese': return takeIngredient(player, 'cheese');
    case 'soda': return takeIngredient(player, 'soda');
    case 'coffee': return takeIngredient(player, 'coffee');
    case 'grill': return cook(room, player, 'grill', 'patty_raw', 'patty', 7000, now);
    case 'fryer': return cook(room, player, 'fryer', 'fries_raw', 'fries', 9000, now);
    case 'prep': return prepBurger(room, player);
    case 'serve': return serve(room, player, now);
    default: return result('Неизвестная станция.');
  }
}

export function buyUpgrade(room, player, id) {
  if (room.phase !== 'results') return result('Улучшения доступны после смены.', 'warning');
  if (room.hostId !== player.id) return result('Улучшения выбирает создатель лобби.', 'warning');
  const upgrade = UPGRADES.find((entry) => entry.id === id);
  if (!upgrade) return result('Неизвестное улучшение.', 'warning');
  if (room.upgrades[id]) return result('Это улучшение уже куплено.');
  if (room.money < upgrade.price) return result('Недостаточно денег на улучшение.', 'warning');
  room.money -= upgrade.price;
  room.upgrades[id] = true;
  return result(`Улучшение «${upgrade.name}» куплено для команды!`, 'success');
}

export function movePlayer(player, data, now = Date.now()) {
  if (![data.x, data.z, data.yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
  const x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, data.x));
  const z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, data.z));
  const elapsed = Math.max(0.05, Math.min(0.5, (now - (player.lastMoveAt || now)) / 1000));
  const maxDistance = 6.8 * elapsed + 0.3;
  const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
  const ratio = distance > maxDistance ? maxDistance / distance : 1;
  player.x += dx * ratio;
  player.z += dz * ratio;
  player.yaw = Math.atan2(Math.sin(data.yaw), Math.cos(data.yaw));
  player.lastMoveAt = now;
}

export function publicRoom(room) {
  return {
    id: room.id, hostId: room.hostId, phase: room.phase, shift: room.shift,
    players: [...room.players.values()].map(({ lastMoveAt, ...player }) => player),
    money: room.money, score: room.score, served: room.served, missed: room.missed,
    totalServed: room.totalServed, shiftEndsAt: room.shiftEndsAt,
    orders: room.orders, stations: room.stations, chat: room.chat, upgrades: room.upgrades, event: room.event,
    serverTime: Date.now(),
  };
}
