import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_PLAYERS } from '../src/shared.js';
import { advanceRoom, beginShift, buyUpgrade, createPlayer, createRoom, interact, movePlayer, publicRoom } from './game.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const rooms = new Map();
const sockets = new Map();
const port = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === 'production';

app.get('/health', (_req, res) => res.json({ ok: true }));
if (production) {
  app.use(express.static('dist'));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: 'dist' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/ws') return; // Vite handles its own HMR upgrades.
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function broadcast(room) {
  const message = JSON.stringify({ type: 'state', room: publicRoom(room) });
  for (const player of room.players.values()) {
    const ws = sockets.get(player.id);
    if (ws?.readyState === WebSocket.OPEN) ws.send(message);
  }
}
function notify(ws, text, kind = 'info') { send(ws, { type: 'notice', text, kind }); }
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (n) => alphabet[n % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}
function leave(ws) {
  const room = rooms.get(ws.roomId);
  const id = ws.playerId;
  if (!room || !id) return;
  const player = room.players.get(id);
  room.players.delete(id);
  sockets.delete(id);
  ws.roomId = null;
  ws.playerId = null;
  if (!room.players.size) {
    rooms.delete(room.id);
    return;
  }
  if (room.hostId === id) room.hostId = room.players.keys().next().value;
  if (player) {
    room.chat.push({ id: crypto.randomUUID(), system: true, text: `${player.name} покинул(а) смену.` });
    room.chat = room.chat.slice(-30);
  }
  broadcast(room);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return notify(ws, 'Неверный формат сообщения.', 'warning'); }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'create' || message.type === 'join') {
      if (ws.roomId) return notify(ws, 'Вы уже находитесь в лобби.', 'warning');
      const playerId = crypto.randomUUID();
      const player = createPlayer(playerId, message.name, message.color);
      let room;
      if (message.type === 'create') {
        room = createRoom(makeCode(), player);
        rooms.set(room.id, room);
      } else {
        const code = (typeof message.code === 'string' ? message.code : '').trim().toUpperCase();
        room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', message: 'Лобби не найдено. Проверьте ID и попробуйте ещё раз.' });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'Лобби заполнено: максимум 8 игроков.' });
        const index = room.players.size;
        player.x = (index % 4 - 1.5) * 0.8;
        player.z = 1.65 + Math.floor(index / 4) * 0.9;
        room.players.set(playerId, player);
        room.chat.push({ id: crypto.randomUUID(), system: true, text: `${player.name} присоединился(ась) к команде.` });
      }
      ws.playerId = playerId;
      ws.roomId = room.id;
      sockets.set(playerId, ws);
      send(ws, { type: 'joined', playerId, code: room.id });
      if (message.type === 'create' && message.autoStart) beginShift(room);
      broadcast(room);
      return;
    }
    const room = rooms.get(ws.roomId);
    const player = room?.players.get(ws.playerId);
    if (!room || !player) return;
    if (message.type === 'leave') { leave(ws); return; }
    if (message.type === 'start') {
      if (room.hostId !== player.id) return notify(ws, 'Только создатель лобби может начать смену.', 'warning');
      if (room.phase === 'playing') return;
      beginShift(room);
      broadcast(room);
    } else if (message.type === 'move' && room.phase === 'playing') {
      movePlayer(player, message);
    } else if (message.type === 'interact') {
      const response = interact(room, player, message.station);
      notify(ws, response.text, response.kind);
      broadcast(room);
    } else if (message.type === 'buy') {
      const response = buyUpgrade(room, player, message.upgrade);
      notify(ws, response.text, response.kind);
      broadcast(room);
    } else if (message.type === 'discard' && room.phase === 'playing') {
      if (player.hand) {
        player.hand = null;
        notify(ws, 'Предмет выброшен.', 'info');
        broadcast(room);
      }
    } else if (message.type === 'chat') {
      const now = Date.now();
      if (ws.lastChat && now - ws.lastChat < 500) return;
      const text = (typeof message.text === 'string' ? message.text : '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
      if (!text) return;
      ws.lastChat = now;
      room.chat.push({ id: crypto.randomUUID(), name: player.name, color: player.color, text });
      room.chat = room.chat.slice(-30);
      broadcast(room);
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

setInterval(() => {
  for (const room of rooms.values()) {
    advanceRoom(room);
    broadcast(room);
  }
}, 250).unref();
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000).unref();

server.listen(port, '0.0.0.0', () => console.log(`Burger Shift is listening on http://0.0.0.0:${port}`));
