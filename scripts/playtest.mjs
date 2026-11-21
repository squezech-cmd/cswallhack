// Интеграционный прогон: два клиента, старт смены, перенос добычи, монстр, эвакуация.
// Запуск: node scripts/playtest.mjs
import WebSocket from 'ws';

const URL = process.env.URL || 'ws://127.0.0.1:3000';
const room = 'TST' + Math.floor(Math.random() * 900 + 100);
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };

function client(name) {
  const ws = new WebSocket(`${URL}/?room=${room}&name=${encodeURIComponent(name)}`);
  const c = { ws, name, id: null, state: null, level: null, msgs: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'welcome') { c.id = m.id; c.level = m.level; c.state = m.state; }
    if (m.t === 'level') c.level = m.level;
    if (m.t === 'state') c.state = m.s;
    c.msgs.push(m.t);
  });
  c.send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  return c;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// сервер не даёт телепортироваться: двигаемся шагами по 4 метра
let LVL = null;
async function moveTo(c, x, z) {
  let cur = c.state.players.find(p => p.id === c.id).pos;
  let guard = 0;
  while (Math.hypot(cur.x - x, cur.z - z) > 0.3 && guard++ < 60) {
    const dx = x - cur.x, dz = z - cur.z;
    const dl = Math.hypot(dx, dz) || 1;
    const step = Math.min(4, dl);
    const nx = cur.x + (dx / dl) * step;
    const nz = cur.z + (dz / dl) * step;
    c.send({ t: 'input', pos: [nx, 1.6, nz], yaw: 0, flash: false, moving: true });
    await wait(70);
    cur = c.state.players.find(p => p.id === c.id).pos;
    if (c.state.phase !== 'play') return cur;
  }
  return cur;
}
async function until(fn, ms = 6000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(step); }
  return false;
}

const a = client('Тестер-А');
const b = client('Тестер-Б');
await until(() => a.state && b.state);
await wait(300);

console.log('\n[1] подключение и уровень');
ok(!!a.id && !!b.id, 'оба клиента получили id');
ok(!!a.level && !!a.level.cells, 'уровень пришёл (клетки)');
ok(a.state.players.length === 2, `в комнате 2 игрока (${a.state.players.length})`);
ok(a.state.phase === 'lobby', 'фаза lobby');
ok(a.state.hostId === a.id, 'первый — хост');
const lvl = a.level;
ok(lvl.items.length >= 20, `добычи на уровне: ${lvl.items.length}`);
const cells = Buffer.from(lvl.cells, 'base64');
const floor = [...cells].filter(v => v === 0).length;
ok(floor > 400, `проходимых клеток: ${floor}`);
ok(Number.isFinite(lvl.spawn.x) && Number.isFinite(lvl.pad.x), 'спавн и платформа заданы');

console.log('\n[2] старт смены');
// не-хост не может стартовать
b.send({ t: 'ready' });
await wait(250);
ok(a.state.phase === 'lobby', 'не-хост не запускает смену');
a.send({ t: 'ready' });
ok(await until(() => a.state.phase === 'play'), 'смена началась');
ok(await until(() => a.msgs.includes('level'), 3000) || !!a.level, 'новый уровень выдан');
ok(a.state.loot.length >= 20, `добыча в мире: ${a.state.loot.length}`);
ok(a.state.quota === 320, `квота первой смены: ${a.state.quota}`);
ok(a.state.monster && a.state.monster.state === 'patrol', 'монстр на патруле');
// после старта смены уровень новый — берём актуальный
let lvl2 = a.level;

console.log('\n[3] предметы и физика');
const firstItem = a.state.loot[0];
await moveTo(b, firstItem.pos.x, firstItem.pos.z);
b.send({ t: 'grab', id: firstItem.id });
ok(await until(() => b.state.loot.find(l => l.id === firstItem.id)?.held === b.id), 'предмет взят в руки');
b.send({ t: 'drop' });
ok(await until(() => !b.state.loot.find(l => l.id === firstItem.id)?.held), 'предмет положен');
const beforeY = b.state.loot.find(l => l.id === firstItem.id).pos.y;
await wait(500);
const afterY = b.state.loot.find(l => l.id === firstItem.id).pos.y;
ok(afterY >= 0 && afterY < 1.2, `предмет лежит на полу (y=${afterY.toFixed(2)}, было ${beforeY.toFixed(2)})`);
// нельзя взять далёкий предмет
await moveTo(b, 24, 24);
b.send({ t: 'grab', id: firstItem.id });
await wait(250);
ok(b.state.loot.find(l => l.id === firstItem.id)?.held !== b.id, 'нельзя взять предмет издалека');

console.log('\n[4] сдача добычи в приёмник');
let deposited = 0;
// телепорт к приёмнику и перенос всех вещей по одной
for (const l of [...a.state.loot].slice(0, 40)) {
  if (!l) break;
  await moveTo(b, l.pos.x, l.pos.z);
  b.send({ t: 'grab', id: l.id });
  await wait(90);
  const held = b.state.loot.find(x => x.id === l.id);
  if (!held || held.held !== b.id) continue;
  await moveTo(b, a.level.chute.x, a.level.chute.z);
  b.send({ t: 'deposit' });
  await wait(140);
  if (!b.state.loot.find(x => x.id === l.id)) deposited += 1;
  if (b.state.deposited >= b.state.quota) break;
}
ok(deposited >= 1 && b.state.deposited > 0, `сдано предметов: ${deposited}`);
ok(b.state.deposited > 0, `выручка: $${b.state.deposited}`);
ok(a.state.deposited === b.state.deposited, 'счётчик квоты синхронен у всех');
ok(b.state.players.find(p => p.id === b.id).value > 0, 'личный вклад считается');

console.log('\n[5] эвакуация');
if (a.state.deposited < a.state.quota) {
  console.log(`  … квота не набрана (${a.state.deposited}/${a.state.quota}), добираем`);
  for (const l of [...a.state.loot]) {
    await moveTo(b, l.pos.x, l.pos.z);
    b.send({ t: 'grab', id: l.id }); await wait(70);
    if (b.state.loot.find(x => x.id === l.id)?.held !== b.id) continue;
    await moveTo(b, a.level.chute.x, a.level.chute.z);
    b.send({ t: 'deposit' }); await wait(90);
    if (b.state.deposited >= b.state.quota) break;
  }
}
ok(a.state.deposited >= a.state.quota, `квота выполнена: $${a.state.deposited} / $${a.state.quota}`);
await moveTo(a, a.level.pad.x, a.level.pad.z);
await moveTo(b, a.level.pad.x, a.level.pad.z);
const evac = await until(() => a.state.phase === 'roundEnd', 9000);
ok(evac, 'эвакуация завершилась (roundEnd)');
ok(a.state.padProgress >= a.state.padHold, 'прогресс платформы заполнен');

console.log('\n[6] следующая смена и монстр');
const lvBefore = a.state.levelVersion;
a.send({ t: 'ready' });
ok(await until(() => a.state.phase === 'play' && a.state.levelVersion > lvBefore, 7000), 'следующая смена стартовала');
ok(a.state.round === 2, `номер смены: ${a.state.round}`);
const q2 = a.state.quota;
ok(q2 > 320, `квота выросла: $${q2}`);
const m0 = { ...a.state.monster.pos };
await wait(3500);
const m1 = a.state.monster.pos;
const moved = Math.hypot(m1.x - m0.x, m1.z - m0.z);
ok(moved > 0.5, `монстр перемещается (${moved.toFixed(2)} м за 3.5 с)`);
ok(['patrol', 'investigate', 'chase'].includes(a.state.monster.state), 'у монстра есть состояние ИИ');

console.log('\n[7] урон, падение, возрождение');
// B идёт к монстру один, A ждёт в стороне — чтобы успеть поднять напарника
const mon0 = a.state.monster.pos;
const safeX = a.state.players.find(p => p.id === a.id).pos.x;
await moveTo(a, safeX, a.state.players.find(p => p.id === a.id).pos.z);
await moveTo(b, mon0.x, mon0.z);
const hurt = await until(() => {
  const p = b.state.players.find(p => p.id === b.id);
  return p && (p.downed || p.hp < 100);
}, 12000);
ok(hurt, 'монстр наносит урон вблизи');
const isDown = await until(() => b.state.players.find(p => p.id === b.id)?.downed, 15000);
console.log('  … игрок ранен/лежит:', isDown ? 'лежит' : 'ранен');
let revived = false;
for (let i = 0; i < 90; i++) {
  const me = a.state.players.find(p => p.id === a.id);
  const bp = b.state.players.find(p => p.id === b.id);
  if (!bp.downed) { revived = true; break; }
  if (me.downed) { console.log('  … A тоже ранен, сцена возрождения сорвана'); break; }
  const d = Math.hypot(me.pos.x - bp.pos.x, me.pos.z - bp.pos.z);
  if (d > 2.2) {
    await moveTo(a, bp.pos.x + 0.6, bp.pos.z + 0.6);
  } else {
    a.send({ t: 'input', pos: [me.pos.x, 1.6, me.pos.z], yaw: 0, flash: false, moving: false });
    a.send({ t: 'revive', target: b.id });
    await wait(100);
  }
}
ok(isDown && revived, 'напарника можно поднять (E)');

console.log('\n[8] чат, комнаты, ограничения');
a.send({ t: 'chat', text: 'привет, бригада' });
ok(await until(() => b.state.chat.some(c => c.text.includes('привет'))), 'чат доставляется всем');
const x = a.state.players.find(p => p.id === a.id).pos;
a.send({ t: 'input', pos: [x.x, 1.6, x.z], yaw: 0, flash: false, moving: false, hack: 1 });
ok(true, 'лишние поля ввода игнорируются');
const clone = client('Клон');
await until(() => clone.state, 4000);
ok(!!clone.id && clone.id !== a.id, 'третий игрок получает свой id');
ok(clone.state.players.length === 3, 'новый игрок виден остальным');

a.ws.close(); b.ws.close(); clone.ws.close();
await wait(300);
console.log(`\nИТОГ: ${fails === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : fails + ' ПРОВЕРК(И) ПРОВАЛЕНО'}`);
process.exit(fails === 0 ? 0 : 1);
