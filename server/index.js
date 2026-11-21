'use strict';
// DEEP SALVAGE — сервер: статика + WebSocket-мультиплеер.
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Room } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { maxAge: 0 }));
app.use('/vendor/three.module.js', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.js')));

// ---- Моды (контент-пак: свои предметы добычи) ----
function loadMods() {
  const dir = path.join(__dirname, '..', 'mods');
  const out = { items: [], monsterSpeed: 1, quotaScale: 1, packs: [] };
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (Array.isArray(j.items)) out.items.push(...j.items.filter(it => it && it.shape && it.name));
        if (typeof j.monsterSpeed === 'number') out.monsterSpeed = j.monsterSpeed;
        if (typeof j.quotaScale === 'number') out.quotaScale = j.quotaScale;
        out.packs.push({ file: f, name: j.name || f });
      } catch (e) { console.warn('[mods] ошибка в', f, e.message); }
    }
  } catch { /* папки нет — не страшно */ }
  return out;
}
let MODS = loadMods();
app.get('/api/mods', (req, res) => res.json({ packs: MODS.packs, items: MODS.items.length }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();
const clients = new Map();
let nextId = 1;

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    r = new Room(code);
    r.modItems = MODS.items;
    r.monsterSpeed = MODS.monsterSpeed || 1;
    r.quotaScale = MODS.quotaScale || 1;
    r.prepareLevel();
    rooms.set(code, r);
    console.log('[room] создана', code);
  }
  return r;
}

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = (url.searchParams.get('room') || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'MAIN';
  const name = url.searchParams.get('name') || 'Сальважер';
  const id = 'p' + (nextId++);

  const room = getRoom(code);
  clients.set(ws, { id, room, name, levelV: room.levelVersion });
  const p = room.addPlayer(id, name);

  send(ws, {
    t: 'welcome',
    id, room: code, name: p.name,
    level: room.level,
    state: room.snapshot(),
    mods: { packs: MODS.packs, monsterSpeed: MODS.monsterSpeed },
  });

  if (room.phase === 'lobby' || room.phase === 'play') {
    // всем сообщаем о новом игроке
    room.chat.push({ from: 'СИСТЕМА', text: `${p.name} на связи`, ts: Date.now() });
  }
  console.log(`[join] ${p.name} -> ${code} (${room.players.size} игр.)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return send(ws, { t: 'pong', ts: msg.ts });
    room.handle(id, msg);
  });

  ws.on('close', () => {
    room.removePlayer(id);
    clients.delete(ws);
    room.chat.push({ from: 'СИСТЕМА', text: `${p.name} отключился`, ts: Date.now() });
    if (room.players.size === 0) {
      rooms.delete(code);
      console.log('[room] закрыта', code);
    }
  });
});

// ---- Серверный цикл: 30 Гц физика/ИИ ----
const STEP = 1 / 30;
let acc = 0, last = Date.now(), netAcc = 0;
setInterval(() => {
  const now = Date.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    for (const room of rooms.values()) room.update(STEP);
    acc -= STEP;
  }
  netAcc += STEP;
  if (netAcc >= 1 / 20) {
    netAcc = 0;
    for (const room of rooms.values()) {
      const snap = room.snapshot();
      for (const [ws, c] of clients) {
        if (c.room !== room) continue;
        if (c.levelV !== room.levelVersion) {
          c.levelV = room.levelVersion;
          send(ws, { t: 'level', level: room.level, v: room.levelVersion });
        }
        send(ws, { t: 'state', s: snap });
      }
    }
  }
}, 1000 / 40);

app.post('/api/reload-mods', (req, res) => {
  MODS = loadMods();
  for (const r of rooms.values()) {
    r.modItems = MODS.items;
    r.monsterSpeed = MODS.monsterSpeed || 1;
    r.quotaScale = MODS.quotaScale || 1;
  }
  res.json({ ok: true, packs: MODS.packs, items: MODS.items.length });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`DEEP SALVAGE слушает http://0.0.0.0:${PORT}`);
  console.log(`Моды загружены: ${MODS.packs.map(p => p.name).join(', ') || 'нет'}`);
  const nets = require('os').networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) {
        console.log(`Друзья в той же сети: http://${n.address}:${PORT}/  (код комнаты — в меню игры)`);
      }
    }
  }
});
