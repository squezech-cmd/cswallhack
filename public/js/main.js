// DEEP SALVAGE — клиент: управление, сеть, HUD.
import * as THREE from 'three';
import { makeTextures, buildLevel, buildItemMesh, buildAvatar, buildMonster } from './world.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- параметры ----------------
const params = new URLSearchParams(location.search);
const state = {
  ws: null, myId: null, room: (params.get('room') || '').toUpperCase(),
  name: localStorage.getItem('ds_name') || '',
  phase: 'menu', snap: null, level: null,
  keys: {}, yaw: 0, pitch: 0, vy: 0, stamina: 100,
  crouch: false, sprint: false, flash: true, onGround: true,
  pos: new THREE.Vector3(24, 1.65, 24),
  held: null, target: null, prompt: null,
  items: new Map(), avatars: new Map(),
  bob: 0, shake: 0, flashFlicker: 1, hp: 100,
  lastFootstep: 0, mouseSens: 0.0022, normMove: new THREE.Vector3(),
};

// ---------------- three ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x04060a);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060a, 0.055);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0x4a5a68, 0x0a0c10, 0.35);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x2a3540, 0.55);
scene.add(ambient);

// фонарь
const flash = new THREE.SpotLight(0xfff0cf, 4.2, 34, 0.42, 0.55, 1.4);
flash.position.set(0.18, -0.12, 0);
flash.target.position.set(0, 0, -1);
camera.add(flash);
camera.add(flash.target);
scene.add(camera);
// слабый ближний подсвет
const near = new THREE.PointLight(0x88a0b4, 0.7, 6, 2);
camera.add(near);

const tex = makeTextures();
let world = null;
let monster = buildMonster();
scene.add(monster);

// ---------------- сеть ----------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const name = state.name || 'Сальважер';
  const url = `${proto}//${location.host}/?room=${encodeURIComponent(state.room)}&name=${encodeURIComponent(name)}`;
  const ws = new WebSocket(url);
  state.ws = ws;
  ws.onopen = () => {
    $('loading').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('room-badge').textContent = 'КОМНАТА ' + state.room;
    SFX.initAudio();
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'welcome') {
      state.myId = msg.id;
      window.DS_MY = state.myId;
      if (msg.level) applyLevel(msg.level);
      applySnapshot(msg.state);
      $('packs').textContent = 'моды: ' + ((msg.mods && msg.mods.packs.length) ? msg.mods.packs.map(p => p.name).join(', ') : 'нет');
    } else if (msg.t === 'level') {
      applyLevel(msg.level);
    } else if (msg.t === 'state') {
      applySnapshot(msg.s);
    }
  };
  ws.onclose = () => {
    $('loading').classList.remove('hidden');
    $('loading').textContent = 'СВЯЗЬ ПОТЕРЯНА — ОБНОВИТЕ СТРАНИЦУ';
  };
  ws.onerror = () => {};
}

function send(obj) {
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(obj));
}

// ---------------- уровень ----------------
function applyLevel(level) {
  state.level = level;
  if (world) {
    scene.remove(world.group);
    world.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  for (const [, rec] of state.items) { scene.remove(rec.mesh); }
  state.items.clear();
  world = buildLevel(scene, level, tex);
  state.pos.set(level.spawn.x, 1.65, level.spawn.z);
  state.vy = 0;
  state.held = null;
  state.yaw = 0; state.pitch = 0;
  monster.visible = false;
  if (level.monsterSpawn) monster.position.set(level.monsterSpawn.x, 0, level.monsterSpawn.z);
}

function ensureItemMesh(l) {
  let rec = state.items.get(l.id);
  if (!rec) {
    const full = findItemDef(l.id);
    const mesh = buildItemMesh(full || l);
    mesh.position.set(l.pos.x, l.pos.y, l.pos.z);
    scene.add(mesh);
    rec = { mesh, base: mesh.position.clone(), rot: l.rot || 0 };
    state.items.set(l.id, rec);
  }
  return rec;
}

let itemDefs = new Map();
function findItemDef(id) {
  return itemDefs.get(id);
}

// ---------------- снимок ----------------
let lastSnapTime = 0;
function applySnapshot(s) {
  state.snap = s;
  state.phase = s.phase;
  lastSnapTime = performance.now();
  state.hp = (s.players.find(p => p.id === state.myId) || {}).hp ?? state.hp;

  // добыча
  const seen = new Set();
  for (const l of s.loot) {
    seen.add(l.id);
    const rec = ensureItemMesh(l);
    if (l.held && l.held === state.myId) continue; // своей рукой управляем локально
    rec.tx = l.pos.x; rec.ty = l.pos.y; rec.tz = l.pos.z;
    if (rec.trot === undefined) rec.trot = l.rot || 0;
    rec.trot = l.rot || 0;
    if (l.held) { rec.tx = l.pos.x; rec.ty = l.pos.y; rec.tz = l.pos.z; }
  }
  for (const [id, rec] of state.items) {
    if (!seen.has(id)) { scene.remove(rec.mesh); state.items.delete(id); }
  }

  // мои данные
  const me = s.players.find(p => p.id === state.myId);
  if (me) {
    state.held = me.holding || null;
    if (me.dead) showDead(true, 'dead');
    else if (me.downed) showDead(true, 'напарник может поднять вас (E)');
    else showDead(false);
  }

  // напарники
  const seenP = new Set();
  s.players.forEach(p => {
    if (p.id === state.myId) return;
    seenP.add(p.id);
    let av = state.avatars.get(p.id);
    if (!av) {
      const colors = ['#3f6f8f', '#7a5a8f', '#7f6a3f', '#3f7f6a'];
      av = buildAvatar(p.name, colors[state.avatars.size % colors.length]);
      av.position.set(p.pos.x, 0, p.pos.z);
      scene.add(av);
      state.avatars.set(p.id, av);
      av.userData.tx = p.pos.x; av.userData.tz = p.pos.z;
    }
    av.userData.tx = p.pos.x;
    av.userData.tz = p.pos.z;
    av.userData.yaw = p.yaw;
    av.userData.downed = p.downed;
    av.userData.dead = p.dead;
    av.userData.flash = p.flash;
    av.userData.holding = p.holding;
    av.visible = !p.dead;
  });
  for (const [id, av] of state.avatars) {
    if (!seenP.has(id)) { scene.remove(av); state.avatars.delete(id); }
  }

  // монстр
  if (s.monster) {
    monster.visible = true;
    monster.userData.tx = s.monster.pos.x;
    monster.userData.tz = s.monster.pos.z;
    monster.userData.state = s.monster.state;
    monster.userData.facing = s.monster.facing;
  } else monster.visible = false;

  handleEvents(s.events || []);
  updateHUD();
}

function distToMe(x, z) {
  return Math.hypot(state.pos.x - x, state.pos.z - z);
}

function handleEvents(events) {
  for (const e of events) {
    switch (e.kind) {
      case 'deposit':
        SFX.deposit();
        toast(`+$${e.value} в приёмник`, '#8ef7c0');
        break;
      case 'grab': SFX.pickup(); break;
      case 'drop': SFX.impact(0.4); break;
      case 'impact':
        if (distToMe(e.x, e.z) < 16) SFX.impact(e.v || 0.4);
        break;
      case 'growl': {
        const d = state.pos.distanceTo(new THREE.Vector3(e.x, 0, e.z));
        SFX.growl(d);
        break;
      }
      case 'hit':
        SFX.hit();
        state.shake = 1;
        const dmg = $('damage');
        dmg.classList.add('on');
        setTimeout(() => dmg.classList.remove('on'), 130);
        state.hp = Math.max(0, state.hp - 34);
        break;
      case 'downed': toast(`${e.name} ранен — поднимите его (E)`, '#ffb02e'); break;
      case 'revived': SFX.revived(); toast('Напарник снова на ногах', '#8ef7c0'); break;
      case 'dead': toast(`${e.name} погиб`, '#ff5f5f'); break;
      case 'roundStart':
        toast(`СМЕНА ${e.round} · квота $${e.quota}`, '#ffd28a');
        itemDefs = new Map();
        break;
      case 'extracted': SFX.revived(); break;
      case 'failed': SFX.alarm(); break;
      case 'throw': if (distToMe(e.x, e.z) < 12) SFX.impact(0.3); break;
    }
  }
}

// ---------------- HUD ----------------
let toastTimer = null;
function toast(text, color = '#ffd28a') {
  const el = $('chatlog');
  const div = document.createElement('div');
  div.innerHTML = `<b style="color:${color}">◆</b> ${escapeHtml(text)}`;
  el.appendChild(div);
  while (el.children.length > 6) el.removeChild(el.firstChild);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let lastChatKey = '';
function updateHUD() {
  const s = state.snap;
  if (!s) return;
  const quota = Math.max(1, s.quota);
  $('quota-fill').style.width = clamp((s.deposited / quota) * 100, 0, 100) + '%';
  $('quota-text').textContent = `$${s.deposited} / $${quota}`;
  $('hp-fill').style.width = clamp(s.hp ?? state.hp, 0, 100) + '%';
  $('hp-text').textContent = Math.round(s.hp ?? state.hp);
  $('stamina-fill').style.width = clamp(state.stamina, 0, 100) + '%';

  const t = s.timeLeft;
  $('timer').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('low', t < 60);
  $('round').textContent = 'СМЕНА ' + s.round;

  // бригада
  const team = $('team');
  team.innerHTML = s.players.map(p => {
    const cls = p.dead ? 'dead' : p.downed ? 'down' : '';
    const hp = p.dead ? 0 : p.hp;
    return `<div class="tm ${cls}"><span class="dot"></span>
      <span class="nm">${escapeHtml(p.name)}${p.id === state.myId ? ' (вы)' : ''}</span>
      <span class="hpbar"><i style="width:${clamp(hp, 0, 100)}%"></i></span></div>`;
  }).join('');

  // чат
  const key = s.chat.map(c => c.ts).join(',');
  if (key !== lastChatKey) {
    lastChatKey = key;
    const log = $('chatlog');
    const sys = log.querySelectorAll('.sysmsg');
    sys.forEach(n => n.remove());
    for (const c of s.chat.slice(-7)) {
      const div = document.createElement('div');
      div.className = 'sysmsg';
      div.innerHTML = `<b>${escapeHtml(c.from)}</b> ${escapeHtml(c.text)}`;
      log.appendChild(div);
    }
    while (log.children.length > 8) log.removeChild(log.firstChild);
  }

  // прогресс эвакуации
  const ready = s.deposited >= s.quota;
  $('pad-progress').classList.toggle('hidden', !(ready && s.padProgress > 0.01));
  $('pad-fill').style.width = clamp((s.padProgress / s.padHold) * 100, 0, 100) + '%';

  // оверлеи
  const ov = $('overlay');
  if (s.phase === 'lobby') {
    ov.classList.remove('hidden');
    $('ov-title').textContent = 'БРИГАДА В СБОРЕ';
    $('ov-text').innerHTML = `Код комнаты: <b style="color:#ffd28a">${state.room}</b> — отправьте друзьям ту же ссылку.<br>В шахте ${s.players.length} сальважёр(ов). Цель: добыть $${s.quota} и эвакуироваться.`;
    $('ov-stats').innerHTML = s.players.map(p => `<div>${escapeHtml(p.name)}</div>`).join('');
    const isHost = s.hostId === state.myId;
    $('ov-btn').classList.toggle('hidden', !isHost);
    $('ov-btn').textContent = 'НАЧАТЬ СМЕНУ';
    $('ov-wait').classList.toggle('hidden', isHost);
  } else if (s.phase === 'roundEnd') {
    ov.classList.remove('hidden');
    $('ov-title').textContent = 'ЭВАКУАЦИЯ УСПЕШНА';
    $('ov-title').style.color = '#8ef7c0';
    const total = s.players.reduce((a, p) => a + (p.score || 0), 0);
    $('ov-text').textContent = `Смена ${s.round} закрыта. Квота $${s.quota} выполнена.`;
    $('ov-stats').innerHTML = `<div>Добыто за смену: <span>$${s.deposited}</span></div>
      <div>Всего вынесено: <span>$${s.totalValue}</span></div>
      ${s.players.map(p => `<div>${escapeHtml(p.name)} — <span>$${p.score || 0}</span></div>`).join('')}
      <div style="color:#7b8a94;font-size:11px;margin-top:8px">Следующая смена: квота вырастет, а внизу станет теснее.</div>`;
    const isHost = s.hostId === state.myId;
    $('ov-btn').classList.toggle('hidden', !isHost);
    $('ov-btn').textContent = 'СЛЕДУЮЩАЯ СМЕНА';
    $('ov-wait').classList.toggle('hidden', isHost);
  } else if (s.phase === 'dead') {
    ov.classList.remove('hidden');
    $('ov-title').textContent = 'СМЕНА ПРОВАЛЕНА';
    $('ov-title').style.color = '#ff5f5f';
    $('ov-text').textContent = s.reason || 'Бригада не вернулась.';
    $('ov-stats').innerHTML = `<div>Вынесено всего: <span>$${s.totalValue}</span></div>
      <div>Дошли до смены: <span>${s.round}</span></div>`;
    const isHost = s.hostId === state.myId;
    $('ov-btn').classList.toggle('hidden', !isHost);
    $('ov-btn').textContent = 'НОВАЯ ВЫЛАЗКА';
    $('ov-wait').classList.toggle('hidden', isHost);
  } else {
    ov.classList.add('hidden');
  }
}

function showDead(on, sub) {
  $('dead').classList.toggle('hidden', !on);
  if (!on) return;
  const dead = sub === 'dead';
  $('dead').querySelector('h2').textContent = dead ? 'ВАС БОЛЬШЕ НЕТ' : 'ВЫ РАНЕНЫ';
  $('dead').querySelector('h2').style.color = dead ? '#ff5f5f' : '#ffb02e';
  $('dead-sub').textContent = dead ? 'наблюдение за бригадой' : (sub || 'напарник может поднять вас');
}

// ---------------- управление ----------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

canvas.addEventListener('click', () => {
  if (state.phase !== 'menu') canvas.requestPointerLock();
  SFX.resumeAudio();
});

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state.phase === 'play') {
    $('prompt').classList.remove('hidden');
    $('prompt').innerHTML = 'Клик — продолжить <i>· Esc — пауза</i>';
    state.prompt = null;
  }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  state.yaw -= e.movementX * state.mouseSens;
  state.pitch = clamp(state.pitch - e.movementY * state.mouseSens, -1.45, 1.45);
});

addEventListener('keydown', (e) => {
  if ($('chatinput').classList.contains('hidden') === false) return;
  state.keys[e.code] = true;
  if (e.code === 'KeyF') { state.flash = !state.flash; flash.visible = state.flash; SFX.uiClick(); }
  if (e.code === 'KeyE') tryInteract(true);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Enter') openChat();
  if (e.code === 'Tab') { e.preventDefault(); $('team').classList.toggle('hidden'); }
});
addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
  if (e.code === 'KeyE') holdingInteract = false;
});

const chatField = $('chat-field');
let holdingInteract = false;
function openChat() {
  $('chatinput').classList.remove('hidden');
  chatField.focus();
  document.exitPointerLock?.();
}
chatField.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const v = chatField.value.trim();
    if (v) send({ t: 'chat', text: v });
    chatField.value = '';
    $('chatinput').classList.add('hidden');
    canvas.requestPointerLock();
  } else if (e.key === 'Escape') {
    chatField.value = '';
    $('chatinput').classList.add('hidden');
    canvas.requestPointerLock();
  }
});
chatField.addEventListener('keyup', e => e.stopPropagation());

addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0 && state.held) { send({ t: 'throw', power: 7.5 }); state.held = null; SFX.impact(0.25); }
  if (e.button === 2 && state.held) { send({ t: 'drop' }); state.held = null; }
});
addEventListener('contextmenu', e => e.preventDefault());

// взаимодействие
function teammates() {
  return (state.snap ? state.snap.players : []).filter(p => p.id !== state.myId);
}
function nearestDowned() {
  let best = null, bd = 2.9;
  for (const p of teammates()) {
    if (!p.downed || p.dead) continue;
    const d = Math.hypot(p.pos.x - state.pos.x, p.pos.z - state.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function tryInteract(pressed) {
  if (state.phase !== 'play' || document.pointerLockElement !== canvas) return;
  const downed = nearestDowned();
  holdingInteract = true;
  if (downed) {
    send({ t: 'revive', target: downed.id });
    return;
  }
  if (state.held) {
    // у приёмника — сдаём, иначе кладём
    const L = state.level;
    if (L && Math.hypot(state.pos.x - L.chute.x, state.pos.z - L.chute.z) < 3.2) {
      send({ t: 'deposit' });
    } else {
      send({ t: 'drop' });
    }
    state.held = null;
    return;
  }
  if (state.target != null) {
    send({ t: 'grab', id: state.target });
    state.held = state.target;
  }
}

// ---------------- физика игрока ----------------
function blocked(x, z, r = 0.34) {
  if (!world) return true;
  const N = world.N;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const sx = Math.floor(x + Math.cos(ang) * r);
    const sz = Math.floor(z + Math.sin(ang) * r);
    if (sx < 0 || sz < 0 || sx >= N || sz >= N) return true;
    if (world.cells[sz * N + sx] !== 0) return true;
  }
  return false;
}

const vel = new THREE.Vector3();
let acc = 0;
let lastT = performance.now();
let heartbeatT = 0;
let monsterStepT = 0;
let promptT = 0;
let reviveT = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (state.phase === 'play' || state.phase === 'lobby') update(dt, now);
  else updateIdle(dt);
  renderer.render(scene, camera);
}

function updateIdle(dt) {
  // плавное вращение камеры в меню/лобби
  camera.rotation.set(state.pitch, state.yaw, 0);
  for (const [, rec] of state.items) {
    rec.mesh.rotation.y += dt * 0.15;
  }
}

function update(dt, now) {
  if (!world) return;
  const locked = document.pointerLockElement === canvas;
  const k = state.keys;
  const wantCrouch = !!(k.ControlLeft || k.ControlRight || k.KeyC);
  state.crouch = wantCrouch;
  const advanced = !!(k.ShiftLeft || k.ShiftRight) && state.stamina > 4 && !state.crouch;
  state.sprint = advanced;

  // направление
  let fx = 0, fz = 0;
  if (locked) {
    if (k.KeyW) fz -= 1;
    if (k.KeyS) fz += 1;
    if (k.KeyA) fx -= 1;
    if (k.KeyD) fx += 1;
  }
  const len = Math.hypot(fx, fz);
  if (len > 0) { fx /= len; fz /= len; }
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const wx = cos * fx + sin * fz;
  const wz = -sin * fx + cos * fz;

  let speed = 3.9;
  if (state.crouch) speed = 1.9;
  else if (state.sprint && len > 0) speed = 6.4;
  if (state.held) speed *= 0.88;
  if (state.snap && state.snap.phase === 'play') {
    const me = state.snap.players.find(p => p.id === state.myId);
    if (me && (me.downed || me.dead)) speed = 0;
  }

  const target = new THREE.Vector3(wx * speed, 0, wz * speed);
  vel.x = lerp(vel.x, target.x, 1 - Math.pow(0.0008, dt));
  vel.z = lerp(vel.z, target.z, 1 - Math.pow(0.0008, dt));

  const nx = state.pos.x + vel.x * dt;
  const nz = state.pos.z + vel.z * dt;
  if (!blocked(nx, state.pos.z)) state.pos.x = nx; else vel.x = 0;
  if (!blocked(state.pos.x, nz)) state.pos.z = nz; else vel.z = 0;

  // прыжок/гравитация
  if (locked && k.Space && state.onGround) { state.vy = 4.4; state.onGround = false; }
  state.vy -= 16 * dt;
  state.pos.y += state.vy * dt;
  const meState = state.snap && state.snap.players.find(p => p.id === state.myId);
  const lie = !!(meState && (meState.downed || meState.dead));
  const eyeHeight = lie ? 0.45 : state.crouch ? 1.08 : 1.68;
  if (state.pos.y <= eyeHeight) { state.pos.y = eyeHeight; state.vy = 0; state.onGround = true; }

  // дыхание
  if (state.sprint && len > 0) state.stamina = Math.max(0, state.stamina - 17 * dt);
  else state.stamina = Math.min(100, state.stamina + (state.crouch ? 16 : 10) * dt);

  // шаги
  const moving = len > 0 && (Math.abs(vel.x) + Math.abs(vel.z)) > 0.8;
  if (moving && state.onGround) {
    state.bob += dt * (state.sprint ? 11 : state.crouch ? 4 : 7);
    const interval = state.sprint ? 0.29 : state.crouch ? 0.7 : 0.46;
    if (now - state.lastFootstep > interval * 1000) {
      state.lastFootstep = now;
      SFX.footstep(state.sprint);
    }
  } else {
    state.bob += dt * 1.4;
  }

  // камера
  const bobY = Math.sin(state.bob) * (moving ? (state.sprint ? 0.055 : 0.032) : 0.008);
  const bobX = Math.cos(state.bob * 0.5) * (moving ? 0.022 : 0.004);
  state.shake = Math.max(0, state.shake - dt * 1.6);
  const shakeAmt = state.shake * 0.02;
  camera.position.set(
    state.pos.x + bobX + (Math.random() - 0.5) * shakeAmt,
    state.pos.y + bobY + (Math.random() - 0.5) * shakeAmt,
    state.pos.z + (Math.random() - 0.5) * shakeAmt
  );
  camera.rotation.set(state.pitch, state.yaw, Math.sin(state.bob * 0.5) * 0.004);

  // фонарь
  state.flashFlicker = lerp(state.flashFlicker, Math.random() < 0.02 ? 0.35 : 1, 0.25);
  flash.intensity = 4.2 * state.flashFlicker;
  flash.visible = state.flash;

  // выбор цели
  promptT -= dt;
  if (promptT <= 0) { promptT = 0.08; updateTarget(); }

  // подсветка цели и позиции добычи
  const nowS = now / 1000;
  for (const [id, rec] of state.items) {
    const held = state.snap && state.snap.loot.find(l => l.id === id && l.held);
    if (held && held.held === state.myId) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const hx = camera.position.x + dir.x * 1.25;
      const hy = camera.position.y - 0.18 + dir.y * 0.3;
      const hz = camera.position.z + dir.z * 1.25;
      rec.mesh.position.lerp(new THREE.Vector3(hx, hy, hz), 1 - Math.pow(0.001, dt));
      rec.mesh.rotation.set(dir.z * -0.3, state.yaw + Math.PI / 2, dir.x * 0.3);
      rec.mesh.scale.setScalar(0.78);
      continue;
    }
    rec.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
    if (rec.tx !== undefined) {
      rec.mesh.position.lerp(new THREE.Vector3(rec.tx, rec.ty, rec.tz), 1 - Math.pow(0.0001, dt));
    }
    rec.mesh.rotation.y = lerp(rec.mesh.rotation.y, rec.trot || 0, 0.2);
    // подсветка наведённой вещи
    const isTarget = state.target === id;
    rec.mesh.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        const base = o.userData.baseEmissive || new THREE.Color(0x000000);
        if (!o.userData.baseEmissive) o.userData.baseEmissive = base.clone();
        if (isTarget) o.material.emissive.setHex(0x6a4a10);
        else o.material.emissive.copy(base);
      }
    });
  }

  // аватары
  for (const [, av] of state.avatars) {
    const u = av.userData;
    av.position.x = lerp(av.position.x, u.tx ?? av.position.x, 1 - Math.pow(0.0002, dt));
    av.position.z = lerp(av.position.z, u.tz ?? av.position.z, 1 - Math.pow(0.0002, dt));
    av.rotation.y = lerp(av.rotation.y, u.yaw || 0, 0.25);
    const bob = Math.sin(nowS * 4 + av.position.x) * 0.02;
    av.position.y = u.downed ? -0.75 : bob;
    av.userData.lampLight.visible = !!u.flash;
    if (u.downed) av.rotation.z = 1.2; else av.rotation.z = 0;
  }

  // монстр
  if (monster.visible) {
    const u = monster.userData;
    const md = Math.hypot(state.pos.x - (u.tx ?? 0), state.pos.z - (u.tz ?? 0));
    monster.position.x = lerp(monster.position.x, u.tx ?? monster.position.x, 1 - Math.pow(0.00008, dt));
    monster.position.z = lerp(monster.position.z, u.tz ?? monster.position.z, 1 - Math.pow(0.00008, dt));
    monster.rotation.y = lerp(monster.rotation.y, (u.facing || 0) + Math.PI, 0.2);
    const movingM = u.state !== 'idle';
    const t = nowS * (u.state === 'chase' ? 7.5 : 3);
    u.armL.rotation.x = Math.sin(t) * 0.7;
    u.armR.rotation.x = -Math.sin(t) * 0.7;
    u.legL.rotation.x = Math.sin(t) * 0.5;
    u.legR.rotation.x = -Math.sin(t) * 0.5;
    u.head.rotation.y = Math.sin(t * 0.3) * 0.3;
    monsterStepT -= dt;
    if (movingM && md < 30 && monsterStepT <= 0) {
      monsterStepT = u.state === 'chase' ? 0.42 : 0.9;
      SFX.stepMonster(md);
    }
    if (u.state === 'chase' && md < 22) state.shake = Math.max(state.shake, 0.25 * (1 - md / 22));
    SFX.setDroneTension(clamp(1 - md / 28, 0, 1));
    // сердцебиение
    heartbeatT -= dt;
    if (md < 16 && heartbeatT <= 0) {
      heartbeatT = clamp(md / 22, 0.35, 1.1);
      SFX.heartbeat(md < 8);
    }
  } else {
    SFX.setDroneTension(0);
  }

  // платформа
  if (world) {
    const ready = state.snap && state.snap.deposited >= state.snap.quota;
    const pulse = 0.5 + Math.sin(nowS * 4) * 0.5;
    const color = ready ? 0x37d68b : 0x2a6a8f;
    world.padRing.material.color.setHex(color);
    world.padRing.material.opacity = 0.16 + pulse * 0.22;
    world.beam.material.opacity = (ready ? 0.1 : 0.03) + pulse * 0.03;
  }

  // сеть
  acc += dt;
  if (acc > 0.06) {
    acc = 0;
    sendInput();
  }

  // восстановление
  reviveT -= dt;
  if (holdingInteract && reviveT <= 0) {
    const d = nearestDowned();
    if (d) { send({ t: 'revive', target: d.id }); reviveT = 0.12; }
  }

  updatePrompt();
}

function updateTarget() {
  state.target = null;
  if (state.held) return;
  let best = null, bestD = 3.4;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  for (const [id, rec] of state.items) {
    const p = rec.mesh.position;
    const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > bestD) continue;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
    if (dot < 0.55) continue;
    bestD = d; best = id;
  }
  state.target = best;
}

function updatePrompt() {
  const el = $('prompt');
  if (document.pointerLockElement !== canvas) {
    el.classList.remove('hidden');
    el.innerHTML = 'Клик — продолжить <i>· Esc — пауза</i>';
    return;
  }
  const downed = nearestDowned();
  if (downed) {
    el.classList.remove('hidden');
    el.innerHTML = `Держите <b>E</b> — поднять <b>${escapeHtml(downed.name)}</b> <i>· ${Math.round((downed.reviveProgress || 0) * 100)}%</i>`;
    return;
  }
  if (state.held) {
    const L = state.level;
    const atChute = L && Math.hypot(state.pos.x - L.chute.x, state.pos.z - L.chute.z) < 3.2;
    el.classList.remove('hidden');
    el.innerHTML = atChute
      ? '<b>E</b> — сдать добычу в приёмник <i>· ЛКМ — швырнуть</i>'
      : '<b>E</b> — положить <i>· ЛКМ — швырнуть</i>';
    return;
  }
  if (state.target != null) {
    const l = state.snap && state.snap.loot.find(x => x.id === state.target);
    const def = l ? itemName(l) : null;
    el.classList.remove('hidden');
    el.innerHTML = def ? `<b>E</b> — взять · <b>${def.name}</b> <i>≈$${def.value}</i>` : '<b>E</b> — взять';
    return;
  }
  el.classList.add('hidden');
}

function itemName(l) {
  // имя и стоимость лежат только в определении уровня, их отдаёт сервер в loot
  if (l.name && l.value) return l;
  return null;
}

function sendInput() {
  const me = state.snap && state.snap.players.find(p => p.id === state.myId);
  const moving = (Math.abs(vel.x) + Math.abs(vel.z)) > 0.8 || state.vy > 0.2;
  send({
    t: 'input',
    pos: [+state.pos.x.toFixed(2), +state.pos.y.toFixed(2), +state.pos.z.toFixed(2)],
    yaw: +state.yaw.toFixed(3), pitch: +state.pitch.toFixed(3),
    flash: state.flash, crouch: state.crouch, moving, sprint: state.sprint,
    downed: me ? me.downed : false,
  });
}

// ---------------- меню ----------------
$('name-input').value = state.name;
$('room-input').value = state.room || 'MAIN';

function randomCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

$('play-btn').addEventListener('click', () => {
  state.name = ($('name-input').value || 'Сальважер').slice(0, 16);
  localStorage.setItem('ds_name', state.name);
  state.room = (($('room-input').value || randomCode()).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MAIN').slice(0, 8);
  const url = new URL(location.href);
  url.searchParams.set('room', state.room);
  history.replaceState(null, '', url);
  $('join-url').classList.remove('hidden');
  $('join-url').innerHTML = `Ссылка для друзей:<br>${location.origin}${location.pathname}?room=${state.room}`;
  SFX.initAudio(); SFX.uiClick();
  $('loading').classList.remove('hidden');
  $('loading').textContent = 'ПОДКЛЮЧЕНИЕ…';
  connect();
  setTimeout(() => canvas.requestPointerLock(), 600);
});

$('ov-btn').addEventListener('click', () => {
  SFX.uiClick();
  const s = state.snap;
  if (!s) return;
  if (s.phase === 'dead') send({ t: 'restart' });
  else send({ t: 'ready' });
  $('overlay').classList.add('hidden');
  canvas.requestPointerLock();
});

// авто-подключение если есть ?room=
if (state.room) {
  $('room-input').value = state.room;
}

frame();
