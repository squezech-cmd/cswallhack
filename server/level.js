'use strict';
// Процедурная генерация уровня: подземный склад-лабиринт.
// Карта клеток: 0 = пол, 1 = стена/порода, 2 = контейнер/стеллаж (низкий блок).

const N = 48; // 48x48 метров

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_TYPES = [
  { shape: 'vase', name: 'Амфора', value: 45, color: '#d9c7a3', w: 0.3, h: 0.75 },
  { shape: 'skull', name: 'Череп', value: 70, color: '#e8e0cf', w: 0.28, h: 0.3 },
  { shape: 'statue', name: 'Статуэтка', value: 90, color: '#b9c6cf', w: 0.34, h: 0.6 },
  { shape: 'lamp', name: 'Лампа', value: 40, color: '#f0d27a', w: 0.34, h: 0.55 },
  { shape: 'tv', name: 'Телевизор', value: 130, color: '#7f8a93', w: 0.5, h: 0.42 },
  { shape: 'crate', name: 'Ящик', value: 35, color: '#a87b4a', w: 0.42, h: 0.42 },
  { shape: 'gem', name: 'Кристалл', value: 180, color: '#6ee7ff', w: 0.24, h: 0.34 },
  { shape: 'orb', name: 'Сфера', value: 110, color: '#c68cff', w: 0.26, h: 0.5 },
  { shape: 'engine', name: 'Двигатель', value: 160, color: '#95a1ad', w: 0.5, h: 0.5 },
  { shape: 'painting', name: 'Картина', value: 75, color: '#caa06a', w: 0.42, h: 0.5 },
];

function makeLevel(opts = {}) {
  const seed = (opts.seed || Math.floor(Math.random() * 1e9)) >>> 0;
  const rnd = mulberry32(seed);
  const cells = new Uint8Array(N * N).fill(1);
  const idx = (x, z) => z * N + x;
  const rooms = [];

  const carve = (x0, z0, x1, z1) => {
    for (let z = Math.max(1, z0); z <= Math.min(N - 2, z1); z++)
      for (let x = Math.max(1, x0); x <= Math.min(N - 2, x1); x++) cells[idx(x, z)] = 0;
  };

  // Комнаты
  for (let attempt = 0; attempt < 160 && rooms.length < 10; attempt++) {
    const w = 6 + Math.floor(rnd() * 6);
    const h = 6 + Math.floor(rnd() * 6);
    const x = 3 + Math.floor(rnd() * (N - w - 6));
    const z = 3 + Math.floor(rnd() * (N - h - 6));
    const r = { x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) };
    let ok = true;
    for (const o of rooms) {
      if (x < o.x + o.w + 2 && x + w + 2 > o.x && z < o.z + o.h + 2 && z + h + 2 > o.z) { ok = false; break; }
    }
    if (!ok) continue;
    rooms.push(r);
    carve(x, z, x + w - 1, z + h - 1);
  }

  // Коридоры (ширина 3) между соседними комнатами
  const carveH = (x0, x1, z) => carve(Math.min(x0, x1), z - 1, Math.max(x0, x1), z + 1);
  const carveV = (z0, z1, x) => carve(x - 1, Math.min(z0, z1), x + 1, Math.max(z0, z1));
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    if (rnd() < 0.5) { carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
    else { carveV(a.cz, b.cz, a.cx); carveH(a.cx, b.cx, b.cz); }
  }
  // Пара дополнительных петель, чтобы не было тупикового лабиринта
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    const a = rooms[Math.floor(rnd() * rooms.length)];
    const b = rooms[Math.floor(rnd() * rooms.length)];
    if (a === b) continue;
    carveH(a.cx, b.cx, a.cz);
    carveV(a.cz, b.cz, b.cx);
  }

  // Стеллажи/контейнеры внутри комнат (блокируют проход и обзор)
  for (const r of rooms) {
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const bw = 1 + Math.floor(rnd() * 3);
      const bh = 1 + Math.floor(rnd() * 2);
      const bx = r.x + 1 + Math.floor(rnd() * Math.max(1, r.w - bw - 2));
      const bz = r.z + 1 + Math.floor(rnd() * Math.max(1, r.h - bh - 2));
      for (let z = bz; z < bz + bh; z++)
        for (let x = bx; x < bx + bw; x++) if (cells[idx(x, z)] === 0) cells[idx(x, z)] = 2;
    }
  }

  const room0 = rooms[0];
  const spawn = { x: room0.cx + 0.5, z: room0.cz + 0.5 };
  const pad = { x: spawn.x - 1.5, z: spawn.z - 1.5, r: 2.2 };
  const chute = { x: spawn.x + 3.5, z: spawn.z + 0.5 };
  for (let z = Math.floor(pad.z - 2); z <= Math.floor(pad.z + 2); z++)
    for (let x = Math.floor(pad.x - 2); x <= Math.floor(pad.x + 2); x++)
      if (x > 0 && z > 0 && x < N && z < N) cells[idx(x, z)] = 0;
  for (let z = Math.floor(chute.z - 1); z <= Math.floor(chute.z + 1); z++)
    for (let x = Math.floor(chute.x - 1); x <= Math.floor(chute.x + 1); x++)
      if (x > 0 && z > 0 && x < N && z < N) cells[idx(x, z)] = 0;

  // Лампы (аварийное освещение) — по одной на комнату
  const lamps = rooms.slice(1).map(r => ({ x: r.cx + 0.5, z: r.cz + 0.5 }));

  // Типы добычи (базовые + моды)
  const types = BASE_TYPES.concat(opts.modItems || []);
  const isFree = (x, z) => cells[idx(x, z)] === 0;
  const nearSpawn = (x, z) => Math.hypot(x - spawn.x, z - spawn.z) < 6;

  const items = [];
  let guard = 0;
  const wanted = opts.itemCount || 26;
  while (items.length < wanted && guard++ < 4000) {
    const x = 2 + Math.floor(rnd() * (N - 4));
    const z = 2 + Math.floor(rnd() * (N - 4));
    if (!isFree(x, z) || nearSpawn(x + 0.5, z + 0.5)) continue;
    // не спавним вплотную к стенам
    if (!isFree(x - 1, z) && !isFree(x + 1, z) && !isFree(x, z - 1) && !isFree(x, z + 1)) continue;
    const t = types[Math.floor(rnd() * types.length)];
    items.push({
      id: 0, // выдаётся рум-менеджером
      shape: t.shape, name: t.name, color: t.color,
      value: Math.round(t.value * (0.8 + rnd() * 0.5)),
      w: t.w, h: t.h,
      x: x + 0.5, y: t.h / 2 + 0.02, z: z + 0.5, rot: rnd() * Math.PI * 2,
    });
  }

  // Стартовая комната монстра — подальше от игроков
  let far = rooms[rooms.length - 1], farD = -1;
  for (const r of rooms) {
    const d = Math.hypot(r.cx - spawn.x, r.cz - spawn.z);
    if (d > farD) { farD = d; far = r; }
  }
  // ищем свободную клетку рядом с центром дальней комнаты
  let monsterSpawn = { x: far.cx + 0.5, z: far.cz + 0.5 };
  outer:
  for (let ring = 0; ring < 8; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const mx = far.cx + dx, mz = far.cz + dz;
        if (mx > 0 && mz > 0 && mx < N - 1 && mz < N - 1 && cells[idx(mx, mz)] === 0) {
          monsterSpawn = { x: mx + 0.5, z: mz + 0.5 };
          break outer;
        }
      }
    }
  }

  // Полный список твёрдых клеток для рендера стен/контейнеров
  return {
    seed, size: N, cells: Buffer.from(cells).toString('base64'),
    spawn, pad, chute, lamps, items, monsterSpawn,
    rooms: rooms.map(r => ({ x: r.x, z: r.z, w: r.w, h: r.h })),
  };
}

module.exports = { makeLevel, N };
