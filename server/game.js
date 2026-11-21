'use strict';
// Игровая логика комнаты: авторитетный сервер (физика добычи, монстр, раунды).
const { makeLevel } = require('./level');

const ROUND_TIME = 12 * 60;      // секунд на смену
const BASE_QUOTA = 320;
const REVIVE_TIME = 2.2;
const BLEED_TIME = 50;
const PAD_HOLD = 5.0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.phase = 'lobby';
    this.level = null;
    this.loot = [];
    this.byId = new Map();
    this.monster = null;
    this.round = 1;
    this.quota = BASE_QUOTA;
    this.deposited = 0;
    this.depositedTotal = 0;
    this.timeLeft = ROUND_TIME;
    this.padProgress = 0;
    this.events = [];
    this.chat = [];
    this.nextItemId = 1;
    this.growlTimer = 3;
    this.lastResult = null;
    this.hostId = null;
    this.itemCount = 26;
    this.lootBroken = 0;
    this.levelVersion = 0;
    this.deathReason = null;
  }

  prepareLevel() {
    this.level = makeLevel({ itemCount: this.itemCount, modItems: this.modItems || [] });
    this._cells = Buffer.from(this.level.cells, 'base64');
    this.levelVersion = (this.levelVersion || 0) + 1;
    return this.level;
  }

  addPlayer(id, name) {
    const p = {
      id, name: (name || 'Сальважер').slice(0, 16),
      pos: { x: 0, y: 1.65, z: 0 }, yaw: 0, pitch: 0,
      hp: 100, downed: false, dead: false, holding: null,
      flash: false, crouch: false, moving: false, sprint: false,
      reviveProgress: 0, reviveTarget: null, bleed: 0,
      value: 0, score: 0, kills: 0,
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    if (this.phase === 'play' || this.phase === 'roundEnd') this.respawnAtSpawn(p);
    else if (this.level) this.respawnAtSpawn(p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
    for (const it of this.loot) if (it.held === id) it.held = null;
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
  }

  respawnAtSpawn(p) {
    const s = this.level ? this.level.spawn : { x: 24, z: 24 };
    p.pos = { x: s.x + (Math.random() - 0.5) * 2, y: 1.65, z: s.z + (Math.random() - 0.5) * 2 };
    p.hp = 100; p.downed = false; p.dead = false; p.holding = null; p.bleed = 0;
  }

  startRound() {
    this.prepareLevel();
    this.phase = 'play';
    this.deposited = 0;
    this.padProgress = 0;
    this.timeLeft = ROUND_TIME;
    this.quota = Math.round(BASE_QUOTA * Math.pow(1.45, this.round - 1) * (this.quotaScale || 1));
    this.loot = [];
    this.byId.clear();
    this.lootBroken = 0;
    for (const it of this.level.items) {
      const item = {
        id: this.nextItemId++, shape: it.shape, name: it.name, color: it.color,
        value: it.value, w: it.w, h: it.h,
        pos: { x: it.x, y: it.y, z: it.z },
        vel: { x: 0, y: 0, z: 0 },
        rot: it.rot, held: null, target: null, inChute: false,
      };
      this.loot.push(item);
      this.byId.set(item.id, item);
    }
    this.monster = {
      pos: { x: this.level.monsterSpawn.x, y: 0, z: this.level.monsterSpawn.z },
      state: 'patrol', target: null, path: [], pathTimer: 0,
      cooldown: 0, growl: 0, facing: 0, rage: Math.min(1.35, 1 + (this.round - 1) * 0.05),
      stun: 0, targetId: null,
    };
    for (const p of this.players.values()) {
      p.hp = 100; p.downed = false; p.dead = false; p.holding = null; p.bleed = 0;
      p.reviveProgress = 0; p.value = 0;
      this.respawnAtSpawn(p);
    }
    this.deathReason = null;
    this.event('roundStart', { round: this.round, quota: this.quota });
  }

  event(kind, data = {}) {
    if (this.events.length < 80) this.events.push(Object.assign({ kind }, data));
  }

  solid(x, z) {
    const L = this.level;
    if (!L) return true;
    const gx = Math.floor(x), gz = Math.floor(z);
    if (gx < 0 || gz < 0 || gx >= L.size || gz >= L.size) return true;
    if (!this._cells) this._cells = Buffer.from(L.cells, 'base64');
    return this._cells[gz * L.size + gx] !== 0;
  }

  // ---- Ввод от клиента ----
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.t) {
      case 'input': {
        if (Array.isArray(msg.pos) && msg.pos.length === 3 && msg.pos.every(n => Number.isFinite(n))) {
          const nx = clamp(msg.pos[0], 0.4, this.level ? this.level.size - 0.4 : 48);
          const nz = clamp(msg.pos[2], 0.4, this.level ? this.level.size - 0.4 : 48);
          // мягкая античит-проверка телепорта
          const d = Math.hypot(nx - p.pos.x, nz - p.pos.z);
          if (d < 6 || !this.level) { p.pos.x = nx; p.pos.z = nz; }
          p.pos.y = clamp(msg.pos[1] || 1.65, 0.4, 3);
        }
        if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
        if (Number.isFinite(msg.pitch)) p.pitch = msg.pitch;
        p.flash = !!msg.flash;
        p.crouch = !!msg.crouch;
        p.moving = !!msg.moving;
        p.sprint = !!msg.sprint;
        if (msg.cheat) { /* игнор */ }
        break;
      }
      case 'grab': {
        if (p.downed || p.dead) return;
        const it = this.byId.get(msg.id);
        if (!it || it.held || it.inChute) return;
        if (dist2(p.pos, it.pos) > 3.6 * 3.6) return;
        if (p.holding && this.byId.get(p.holding)) this.byId.get(p.holding).held = null;
        it.held = p.id; p.holding = it.id;
        this.event('grab', { x: it.pos.x, z: it.pos.z });
        break;
      }
      case 'drop': {
        const it = p.holding ? this.byId.get(p.holding) : null;
        p.holding = null;
        if (!it) return;
        it.held = null;
        it.vel = fwd(p.yaw).mul(1.4);
        it.vel.x += (Math.random() - 0.5) * 0.5;
        this.event('drop', { x: it.pos.x, z: it.pos.z });
        break;
      }
      case 'throw': {
        const it = p.holding ? this.byId.get(p.holding) : null;
        p.holding = null;
        if (!it) return;
        it.held = null;
        const power = clamp(Number(msg.power) || 6, 2, 12);
        it.vel = fwd(p.yaw).mul(power);
        it.vel.y = 2.2 + power * 0.12;
        it.rot += 0.3;
        this.event('throw', { x: p.pos.x, z: p.pos.z });
        break;
      }
      case 'deposit': {
        const it = p.holding ? this.byId.get(p.holding) : null;
        if (!it || !this.level) return;
        const d = Math.hypot(p.pos.x - this.level.chute.x, p.pos.z - this.level.chute.z);
        if (d > 3.2) return;
        this.despositItem(it, p);
        break;
      }
      case 'revive': {
        const t = this.players.get(msg.target);
        if (!t || !t.downed || t.dead) return;
        if (dist2(p.pos, t.pos) > 2.6 * 2.6) return;
        p.reviveTarget = t.id;
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 140);
        if (!text.trim()) return;
        this.chat.push({ from: p.name, text, ts: Date.now() });
        if (this.chat.length > 40) this.chat.shift();
        break;
      }
      case 'ready':
        if (this.phase === 'roundEnd' && this.hostId === id) {
          this.round++;
          this.startRound();
        } else if (this.phase === 'lobby' && this.hostId === id) {
          this.round = 1;
          this.startRound();
        }
        break;
      case 'restart':
        if (this.hostId === id) {
          this.phase = 'lobby';
          this.round = 1;
          this.deposited = 0;
          this.depositedTotal = 0;
          this.deathReason = null;
          this.lastResult = null;
          this.loot = [];
          this.byId.clear();
          this.monster = null;
          this.prepareLevel();
          for (const pl of this.players.values()) this.respawnAtSpawn(pl);
          this.event('reset', {});
        }
        break;
    }
  }

  despositItem(it, p) {
    this.deposited += it.value;
    this.depositedTotal += it.value;
    if (p) { p.value += it.value; p.score += it.value; }
    it.inChute = true;
    const i = this.loot.indexOf(it);
    if (i >= 0) this.loot.splice(i, 1);
    this.byId.delete(it.id);
    if (p) p.holding = null;
    this.event('deposit', { value: it.value, x: it.pos.x, z: it.pos.z });
  }

  // ---- Тик ----
  update(dt) {
    if (!this.level) return;
    if (this.phase !== 'play') {
      this.decayEvents(dt);
      return;
    }
    this.timeLeft -= dt;
    this.updateLoot(dt);
    this.updateRevives(dt);
    this.updateMonster(dt);
    this.updatePad(dt);

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.fail('Время вышло: смена провалена.');
    }
    const alive = [...this.players.values()].filter(p => !p.dead);
    if (alive.length === 0 && this.players.size > 0) {
      this.fail('Вся бригада погибла.');
    }
  }

  decayEvents() {}
  drainEvents() { const e = this.events; this.events = []; return e; }

  updateLoot(dt) {
    const L = this.level;
    for (const it of this.loot) {
      if (it.held) {
        const p = this.players.get(it.held);
        if (!p || p.downed || p.dead) { it.held = null; continue; }
        const f = fwd(p.yaw);
        const eye = p.crouch ? 1.05 : 1.6;
        it.pos.x = p.pos.x + f.x * 1.35;
        it.pos.z = p.pos.z + f.z * 1.35;
        it.pos.y = eye - 0.15 + Math.sin(Date.now() / 260) * 0.02;
        it.vel = { x: 0, y: 0, z: 0 };
        continue;
      }
      // Свободная физика
      it.vel.y -= 18 * dt;
      const steps = 2;
      for (let s = 0; s < steps; s++) {
        const h = dt / steps;
        it.pos.x += it.vel.x * h;
        if (this.solid(it.pos.x, it.pos.z)) { it.pos.x -= it.vel.x * h; it.vel.x *= -0.25; }
        it.pos.z += it.vel.z * h;
        if (this.solid(it.pos.x, it.pos.z)) { it.pos.z -= it.vel.z * h; it.vel.z *= -0.25; }
        it.pos.y += it.vel.y * h;
        const floor = it.h / 2;
        if (it.pos.y <= floor) {
          it.pos.y = floor;
          const impact = Math.abs(it.vel.y);
          it.vel.y = 0;
          it.vel.x *= 0.82; it.vel.z *= 0.82;
          if (impact > 4.5) {
            this.monsterNoise(it.pos, 10);
            this.event('impact', { x: it.pos.x, z: it.pos.z, v: Math.min(1, impact / 12) });
          }
        }
      }
      if (this.solid(it.pos.x, it.pos.z)) it.pos.y = Math.max(it.pos.y, it.h);
      it.rot += (it.vel.x + it.vel.z) * dt * 0.4;
      // Падение в приёмник (если бросили рядом)
      if (!it.inChute) {
        const d = Math.hypot(it.pos.x - this.level.chute.x, it.pos.z - this.level.chute.z);
        if (d < 1.4) this.despositItem(it, null);
      }
    }
  }

  monsterNoise(pos, radius) {
    const m = this.monster;
    if (!m) return;
    if (dist2(m.pos, pos) < radius * radius * 4) {
      m.memory = { x: pos.x, z: pos.z, t: 8 };
    }
  }

  updateRevives(dt) {
    for (const p of this.players.values()) {
      const t = p.reviveTarget ? this.players.get(p.reviveTarget) : null;
      p.reviveTarget = null;
      if (p.downed || p.dead) continue;
      if (!t || !t.downed || t.dead) continue;
      if (dist2(p.pos, t.pos) > 2.8 * 2.8) continue;
      if (p.moving && p.sprint) continue;
      t.reviveProgress += dt / REVIVE_TIME;
      if (t.reviveProgress >= 1) {
        t.reviveProgress = 0;
        t.downed = false; t.dead = false; t.hp = 45; t.bleed = 0;
        this.event('revived', { x: t.pos.x, z: t.pos.z });
      }
    }
    for (const p of this.players.values()) {
      if (p.downed && !p.dead) {
        p.bleed -= dt;
        if (p.bleed <= 0) {
          p.dead = true; p.hp = 0;
          this.event('dead', { name: p.name });
        }
      }
    }
  }

  updatePad(dt) {
    const L = this.level;
    const alive = [...this.players.values()].filter(p => !p.dead && !p.downed);
    const onPad = alive.filter(p => Math.hypot(p.pos.x - L.pad.x, p.pos.z - L.pad.z) < L.pad.r + 0.6);
    if (this.deposited >= this.quota && alive.length > 0 && onPad.length === alive.length) {
      this.padProgress += dt;
      if (this.padProgress >= PAD_HOLD) {
        this.phase = 'roundEnd';
        this.padProgress = PAD_HOLD;
        this.lastResult = 'success';
        this.event('extracted', { round: this.round });
        return;
      }
    } else {
      this.padProgress = Math.max(0, this.padProgress - dt * 1.5);
    }
  }

  fail(reason) {
    this.phase = 'dead';
    this.lastResult = 'fail';
    this.deathReason = reason;
    this.event('failed', { reason });
  }

  // ---- Монстр ----
  updateMonster(dt) {
    const m = this.monster;
    if (!m) return;
    const L = this.level;
    m.cooldown = Math.max(0, m.cooldown - dt);
    if (m.memory) { m.memory.t -= dt; if (m.memory.t <= 0) m.memory = null; }

    m.stun = Math.max(0, (m.stun || 0) - dt);
    if (m.stun > 0) { m.state = 'roar'; return; }

    // Восприятие
    let best = null, bestScore = 1e9;
    let locked = null;
    if (m.targetId) {
      const t = this.players.get(m.targetId);
      if (t && !t.dead && !t.downed &&
          Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) < 26) locked = t;
      else m.targetId = null;
    }
    if (locked) { best = locked; bestScore = 0; }
    for (const p of this.players.values()) {
      if (p.dead || p.downed) continue;
      if (locked) continue;
      const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
      let score = d;
      const los = this.lineOfSight(m.pos, p.pos) && d < 20;
      if (los) {
        if (p.flash) score -= 9;
        if (p.moving) score -= 2.5;
        if (p.crouch) score += 4;
        if (p.sprint) score -= 3;
      } else score += 30;
      if (!locked && score < bestScore) { bestScore = score; best = p; }
    }

    let targetPos = null;
    if (best && bestScore < 13) {
      m.state = 'chase';
      m.targetId = best.id;
      targetPos = best.pos;
      if (Math.hypot(best.pos.x - m.pos.x, best.pos.z - m.pos.z) < 2.1 && m.cooldown <= 0) {
        m.cooldown = 1.6;
        this.damagePlayer(best, 30);
        this.event('hit', { x: best.pos.x, z: best.pos.z });
      }
    } else if (m.memory) {
      m.state = 'investigate';
      targetPos = m.memory;
      if (Math.hypot(targetPos.x - m.pos.x, targetPos.z - m.pos.z) < 1.5) m.memory = null;
    } else {
      if (m.state !== 'patrol') { m.state = 'patrol'; m.target = null; m.path = []; }
      if (!m.target) {
        let tries = 0;
        while (tries++ < 40) {
          const x = 2 + Math.floor(Math.random() * (L.size - 4));
          const z = 2 + Math.floor(Math.random() * (L.size - 4));
          if (!this.solid(x + 0.5, z + 0.5)) { m.target = { x: x + 0.5, z: z + 0.5 }; break; }
        }
      }
      targetPos = m.target;
      if (targetPos && Math.hypot(targetPos.x - m.pos.x, targetPos.z - m.pos.z) < 1.2) m.target = null;
    }

    // Гроулы для атмосферы
    m.growl -= dt;
    if (m.growl <= 0) {
      m.growl = m.state === 'chase' ? 2.2 : 5 + Math.random() * 5;
      this.event('growl', { x: m.pos.x, z: m.pos.z, state: m.state });
    }

    // Движение по BFS-пути
    const speed = (m.state === 'chase' ? 4.15 : m.state === 'investigate' ? 2.5 : 1.5) * (m.rage || 1) * (this.monsterSpeed || 1);
    const px = m.pos.x, pz = m.pos.z;
    if (targetPos) {
      m.pathTimer -= dt;
      if (m.pathTimer <= 0 || !m.path.length) {
        m.pathTimer = 0.45;
        m.path = this.findPath(m.pos, targetPos);
      }
      let waypoint = m.path[0];
      if (waypoint) {
        const dx = waypoint.x - m.pos.x, dz = waypoint.z - m.pos.z;
        const dl = Math.hypot(dx, dz);
        if (dl < 0.28) { m.path.shift(); waypoint = m.path[0]; }
        if (waypoint) {
          const ndx = waypoint.x - m.pos.x, ndz = waypoint.z - m.pos.z;
          const nl = Math.hypot(ndx, ndz) || 1;
          const step = Math.min(speed * dt, nl);
          const nx = m.pos.x + (ndx / nl) * step;
          const nz = m.pos.z + (ndz / nl) * step;
          if (!this.solid(nx, m.pos.z)) m.pos.x = nx;
          if (!this.solid(m.pos.x, nz)) m.pos.z = nz;
          m.facing = Math.atan2(ndx, ndz);
        }
      }
      // если застрял в геометрии — выталкиваем в ближайшую свободную клетку
      const realMove = Math.hypot(m.pos.x - px, m.pos.z - pz);
      m.stuck = realMove < 0.05 ? (m.stuck || 0) + dt : 0;
      if (m.stuck > 1.2) {
        m.stuck = 0; m.path = []; m.pathTimer = 0;
        for (let r = 1; r < 6; r++) {
          let done = false;
          for (let dz = -r; dz <= r && !done; dz++) {
            for (let dx = -r; dx <= r && !done; dx++) {
              if (!this.solid(m.pos.x + dx, m.pos.z + dz)) {
                m.pos.x += dx; m.pos.z += dz; done = true;
              }
            }
          }
          if (done) break;
        }
      }
    }
  }

  damagePlayer(p, dmg) {
    if (p.downed || p.dead) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.hp = 0;
      p.downed = true;
      p.bleed = BLEED_TIME;
      p.reviveProgress = 0;
      if (p.holding) { const it = this.byId.get(p.holding); if (it) it.held = null; p.holding = null; }
      this.event('downed', { name: p.name, x: p.pos.x, z: p.pos.z });
      if (this.monster) {
        this.monster.stun = 2.6;
        this.monster.targetId = null;
        this.monster.path = [];
        this.event('roar', { x: this.monster.pos.x, z: this.monster.pos.z });
      }
    }
  }

  lineOfSight(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solid(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  findPath(from, to) {
    const L = this.level, N = L.size;
    if (!this._cells) this._cells = Buffer.from(L.cells, 'base64');
    const cells = this._cells;
    const sx = clamp(Math.floor(from.x), 0, N - 1), sz = clamp(Math.floor(from.z), 0, N - 1);
    const tx = clamp(Math.floor(to.x), 0, N - 1), tz = clamp(Math.floor(to.z), 0, N - 1);
    if (cells[tz * N + tx] !== 0) return [{ x: to.x, z: to.z }];
    const prev = new Int32Array(N * N).fill(-1);
    const seen = new Uint8Array(N * N);
    const q = new Int32Array(N * N);
    let head = 0, tail = 0;
    const start = sz * N + sx;
    q[tail++] = start; seen[start] = 1;
    const goal = tz * N + tx;
    let found = false;
    while (head < tail) {
      const c = q[head++];
      if (c === goal) { found = true; break; }
      const cx = c % N, cz = (c / N) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of nb) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (seen[n] || cells[n] !== 0) continue;
        seen[n] = 1; prev[n] = c; q[tail++] = n;
      }
    }
    if (!found) return [{ x: to.x, z: to.z }];
    const path = [];
    let c = goal;
    while (c !== start && c !== -1) {
      path.push({ x: (c % N) + 0.5, z: ((c / N) | 0) + 0.5 });
      c = prev[c];
    }
    path.reverse();
    // сглаживание: оставляем только точки с прямой видимостью
    const out = [];
    let cur = { x: from.x, z: from.z };
    let i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      while (j > i && !this.lineOfSight(cur, path[j])) j--;
      out.push(path[j]);
      cur = path[j];
      i = j + 1;
    }
    return out;
  }

  // Снимок состояния для клиентов
  snapshot() {
    return {
      phase: this.phase,
      round: this.round,
      quota: this.quota,
      deposited: this.deposited,
      timeLeft: Math.max(0, Math.round(this.timeLeft)),
      padProgress: this.padProgress,
      padHold: PAD_HOLD,
      hostId: this.hostId,
      result: this.lastResult,
      reason: this.deathReason || null,
      totalValue: this.depositedTotal,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, pos: p.pos, yaw: p.yaw, pitch: p.pitch,
        hp: p.hp, downed: p.downed, dead: p.dead, holding: p.holding,
        flash: p.flash, crouch: p.crouch, moving: p.moving,
        reviveProgress: p.reviveProgress, bleed: Math.max(0, Math.round(p.bleed)),
        value: p.value, score: p.score,
      })),
      levelVersion: this.levelVersion,
      loot: this.loot.map(it => ({
        id: it.id, pos: it.pos, rot: it.rot, held: it.held,
        shape: it.shape, name: it.name, color: it.color, value: it.value, w: it.w, h: it.h,
      })),
      monster: this.monster ? {
        pos: this.monster.pos, state: this.monster.state, facing: this.monster.facing,
      } : null,
      chat: this.chat.slice(-12),
      events: this.drainEvents(),
    };
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 + ((a.y || 0) - (b.y || 0)) ** 2;
const fwd = (yaw) => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw), mul(k) { return { x: this.x * k, y: 0, z: this.z * k }; } });

module.exports = { Room, ROUND_TIME, BASE_QUOTA };
