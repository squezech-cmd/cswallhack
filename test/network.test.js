import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

function client(url) {
  const ws = new WebSocket(url);
  const queue = [], waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer); waiter.resolve(message);
    } else {
      queue.push(message);
      if (queue.length > 100) queue.shift();
    }
  });
  return {
    ws,
    send: (data) => ws.send(JSON.stringify(data)),
    wait: (predicate, timeout = 5000) => {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter); if (i >= 0) waiters.splice(i, 1);
          reject(new Error('Timed out waiting for a server message'));
        }, timeout);
        waiters.push(waiter);
      });
    },
  };
}

test('real WebSocket lobby: create, join by ID, sync, host promotion, cleanup', { timeout: 20_000 }, async (t) => {
  const port = 32000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill('SIGTERM'));
  await Promise.race([
    once(server.stdout, 'data'),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('server did not start')), 5000); timer.unref(); }),
  ]);
  const url = `ws://127.0.0.1:${port}/ws`;
  const host = client(url), guest = client(url), outsider = client(url);
  t.after(() => { host.ws.terminate(); guest.ws.terminate(); outsider.ws.terminate(); });
  await Promise.all([once(host.ws, 'open'), once(guest.ws, 'open'), once(outsider.ws, 'open')]);
  host.send({ type: 'create', name: 'Аня' });
  const created = await host.wait((m) => m.type === 'joined');
  assert.match(created.code, /^[A-Z2-9]{6}$/);
  const firstState = await host.wait((m) => m.type === 'state' && m.room.phase === 'lobby');
  assert.equal(firstState.room.players.length, 1);
  outsider.send({ type: 'join', code: 'ZZZZZZ', name: 'Нет' });
  assert.match((await outsider.wait((m) => m.type === 'error')).message, /не найдено/i);
  guest.send({ type: 'join', code: created.code.toLowerCase(), name: 'Борис', color: 1 });
  const joined = await guest.wait((m) => m.type === 'joined');
  const withGuest = await host.wait((m) => m.type === 'state' && m.room.players.length === 2);
  assert.equal(withGuest.room.players[1].name, 'Борис');
  guest.send({ type: 'start' });
  assert.match((await guest.wait((m) => m.type === 'notice')).text, /создатель/i);
  host.send({ type: 'start' });
  const hostPlaying = await host.wait((m) => m.type === 'state' && m.room.phase === 'playing');
  const guestPlaying = await guest.wait((m) => m.type === 'state' && m.room.phase === 'playing');
  assert.equal(hostPlaying.room.shift, 1);
  assert.deepEqual(hostPlaying.room.orders, guestPlaying.room.orders);
  guest.send({ type: 'chat', text: 'Я на гриле!' });
  const chatted = await host.wait((m) => m.type === 'state' && m.room.chat.some((entry) => entry.text === 'Я на гриле!'));
  assert.equal(chatted.room.chat.at(-1).name, 'Борис');
  host.send({ type: 'leave' });
  const promoted = await guest.wait((m) => m.type === 'state' && m.room.hostId === joined.playerId);
  assert.equal(promoted.room.players.length, 1);
  guest.send({ type: 'leave' });
  // After all players leave, the old ID no longer admits new users.
  await new Promise((resolve) => setTimeout(resolve, 100));
  outsider.send({ type: 'join', code: created.code, name: 'Нет' });
  assert.match((await outsider.wait((m) => m.type === 'error')).message, /не найдено/i);
});

test('players may join a running shift, but a ninth player is rejected', { timeout: 20_000 }, async (t) => {
  const port = 42000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill('SIGTERM'));
  await Promise.race([once(server.stdout, 'data'), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('server did not start')), 5000); timer.unref(); })]);
  const players = Array.from({ length: 9 }, () => client(`ws://127.0.0.1:${port}/ws`));
  t.after(() => players.forEach((player) => player.ws.terminate()));
  await Promise.all(players.map((player) => once(player.ws, 'open')));
  players[0].send({ type: 'create', name: 'Хост', autoStart: true });
  const created = await players[0].wait((m) => m.type === 'joined');
  await players[0].wait((m) => m.type === 'state' && m.room.phase === 'playing');
  for (let i = 1; i < 8; i++) {
    players[i].send({ type: 'join', code: created.code, name: `Повар ${i}` });
    await players[i].wait((m) => m.type === 'joined');
    const state = await players[i].wait((m) => m.type === 'state' && m.room.players.length === i + 1);
    assert.equal(state.room.phase, 'playing');
  }
  players[8].send({ type: 'join', code: created.code, name: 'Лишний' });
  assert.match((await players[8].wait((m) => m.type === 'error')).message, /максимум 8/i);
});
