import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, SHIFT_SECONDS } from '../src/shared.js';
import { advanceRoom, beginShift, buyUpgrade, createPlayer, createRoom, interact, movePlayer, publicRoom } from '../server/game.js';

function visit(player, id) {
  const station = STATIONS.find((s) => s.id === id);
  player.x = station.x; player.z = station.z;
}

test('two players can prepare and deliver both starting orders together', () => {
  const start = 1_000_000;
  const host = createPlayer('host', 'Аня', 0);
  const guest = createPlayer('guest', 'Борис', 1);
  const room = createRoom('ABCDEF', host, start);
  room.players.set(guest.id, guest);
  beginShift(room, start);
  assert.equal(room.orders.length, 2);
  assert.equal(room.phase, 'playing');

  // Guest lays out the bun while host cooks the patty.
  visit(guest, 'bun'); interact(room, guest, 'bun', start);
  visit(guest, 'prep'); interact(room, guest, 'prep', start);
  assert.deepEqual(room.stations.prep, ['bun']);
  visit(host, 'raw'); interact(room, host, 'raw', start);
  visit(host, 'grill'); interact(room, host, 'grill', start + 1000);
  assert.equal(host.hand, null);
  interact(room, host, 'grill', start + 7_999);
  assert.equal(host.hand, null, 'food must not be taken before it is ready');
  interact(room, host, 'grill', start + 8_000);
  assert.equal(host.hand, 'patty');
  visit(host, 'prep'); interact(room, host, 'prep', start + 8_000);
  interact(room, guest, 'prep', start + 8_000);
  assert.equal(guest.hand, 'burger');
  visit(guest, 'serve'); interact(room, guest, 'serve', start + 9_000);
  assert.equal(room.served, 1);
  assert.equal(room.orders.length, 1);
  assert.ok(room.money > 0);

  // Food in a multi-item order can be delivered independently by each player.
  visit(guest, 'soda'); interact(room, guest, 'soda', start + 10_000);
  visit(guest, 'serve'); interact(room, guest, 'serve', start + 10_000);
  assert.equal(room.orders[0].items.find((i) => i.type === 'soda').delivered, true);
  assert.equal(room.served, 1);
  visit(host, 'potato'); interact(room, host, 'potato', start + 10_000);
  visit(host, 'fryer'); interact(room, host, 'fryer', start + 10_000);
  interact(room, host, 'fryer', start + 19_000);
  assert.equal(host.hand, 'fries');
  visit(host, 'serve'); interact(room, host, 'serve', start + 20_000);
  assert.equal(room.served, 2);
  assert.equal(room.orders.length, 0);
  assert.equal(room.totalServed, 2);
});

test('cheeseburgers, burnt food, inventory, and distance are validated', () => {
  const t = 2_000_000, player = createPlayer('1', 'Шеф');
  const room = createRoom('ABC234', player, t);
  beginShift(room, t);
  assert.match(interact(room, player, 'raw', t).text, /Подойдите ближе/);
  visit(player, 'bun'); interact(room, player, 'bun', t);
  assert.match(interact(room, player, 'bun', t).text, /освободите руки/i);
  visit(player, 'prep'); interact(room, player, 'prep', t);
  visit(player, 'cheese'); interact(room, player, 'cheese', t);
  visit(player, 'prep'); interact(room, player, 'prep', t);
  visit(player, 'raw'); interact(room, player, 'raw', t);
  visit(player, 'grill'); interact(room, player, 'grill', t);
  interact(room, player, 'grill', t + 7_000);
  visit(player, 'prep'); interact(room, player, 'prep', t + 7_000);
  interact(room, player, 'prep', t + 7_000);
  assert.equal(player.hand, 'cheeseburger');
  player.hand = null;
  visit(player, 'raw'); interact(room, player, 'raw', t);
  visit(player, 'grill'); interact(room, player, 'grill', t);
  interact(room, player, 'grill', t + 29_000);
  assert.equal(player.hand, 'patty_burnt');
});

test('shifts, events, patience and upgrades are authoritative and persistent within a room', () => {
  const t = 3_000_000, host = createPlayer('host', 'Шеф'), guest = createPlayer('guest', 'Друг');
  const room = createRoom('ABC234', host, t);
  room.players.set(guest.id, guest);
  beginShift(room, t);
  const previousRandom = Math.random;
  Math.random = () => 0;
  try { advanceRoom(room, t + 65_000); } finally { Math.random = previousRandom; }
  assert.equal(room.event.type, 'rush');
  advanceRoom(room, t + 140_001);
  assert.equal(room.missed, 2);
  advanceRoom(room, t + SHIFT_SECONDS * 1000);
  assert.equal(room.phase, 'results');
  room.money = 100;
  assert.match(buyUpgrade(room, guest, 'grill').text, /создатель/i);
  assert.equal(room.money, 100);
  buyUpgrade(room, host, 'grill');
  buyUpgrade(room, host, 'patience');
  assert.equal(room.money, 40);
  assert.equal(room.upgrades.grill, true);
  assert.match(buyUpgrade(room, host, 'grill').text, /уже куплено/i);
  beginShift(room, t + 300_000);
  assert.equal(room.shift, 2);
  assert.equal(room.orders[0].expiresAt - room.orders[0].createdAt, 170_000);
  visit(host, 'raw'); interact(room, host, 'raw', t + 300_000);
  visit(host, 'grill'); interact(room, host, 'grill', t + 300_000);
  assert.equal(room.stations.grill.readyAt - room.stations.grill.startedAt, 4_500);
  assert.equal(publicRoom(room).upgrades.grill, true);
});

test('movement rejects invalid values and caps teleportation', () => {
  const malformed = createPlayer('bad', { toString: null, valueOf: null });
  assert.equal(malformed.name, 'Повар');
  const player = createPlayer('a', '<Шеф>', 99);
  player.lastMoveAt = 1000;
  movePlayer(player, { x: 99, z: 99, yaw: 0 }, 1100);
  assert.ok(Math.hypot(player.x, player.z - 1.6) < 1.1);
  const x = player.x;
  movePlayer(player, { x: NaN, z: 0, yaw: 0 }, 1200);
  assert.equal(player.x, x);
});
