'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const CARDS = require('../public/cards.json');
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = Number(process.env.PORT || 3000);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/health', (_req, res) => res.json({ ok: true, cards: CARDS.length }));
const cardMap = new Map(CARDS.map(c => [c.id, c]));
const rooms = new Map();
let clientSeq = 0;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const defaultDeck = ['squire','longbow','brute','sprinters','mystic','wisp','fireball','cannon'];

function cleanDeck(input) {
  const list = Array.isArray(input) ? input.filter(id => cardMap.has(id)) : [];
  const deck = [...new Set(list)].slice(0, 8);
  for (const id of defaultDeck) if (deck.length < 8 && !deck.includes(id)) deck.push(id);
  return deck.slice(0, 8);
}
function shuffle(items) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function team(id, name, deck) { const shuffled = shuffle(deck); return { id, name, deck, hand: shuffled.slice(0,4), queue: shuffled.slice(4), elixir: 5, towers: { king:5000, left:2800, right:2800 }, plays: 0 }; }
function freshState(room, botMode = false) {
  const player = room.players[0];
  const t0 = team(player.id, player.name, player.deck);
  const t1 = botMode ? team('bot', `Бот · ${room.difficultyName}`, room.botDeck) : team(room.players[1].id, room.players[1].name, room.players[1].deck);
  return { phase: 'playing', mode: botMode ? 'bot' : 'friend', difficulty: room.difficulty, teams: [t0,t1], units: [], structures: [], effects: [], time: 180, winner: null, startedAt: Date.now(), events: [], doubleElixir: false };
}
function publicState(room) {
  if (!room.state) return { phase:'waiting', mode:room.mode, players:room.players.map(p=>({name:p.name})), room:room.code };
  const s = room.state;
  return { phase:s.phase, mode:s.mode, difficulty:s.difficulty, teams:s.teams.map(t=>({id:t.id,name:t.name,hand:t.hand, nextCard:t.queue[0] || null, elixir:+t.elixir.toFixed(1),towers:t.towers})), units:s.units.map(u=>({id:u.id,team:u.team,cardId:u.cardId,lane:u.lane,pos:u.pos,hp:u.hp,maxHp:u.maxHp,flying:u.flying,structure:u.structure})), structures:s.structures.map(o=>({id:o.id,team:o.team,cardId:o.cardId,lane:o.lane,pos:o.pos,hp:o.hp,maxHp:o.maxHp,time:o.time})), effects:s.effects, time:s.time, winner:s.winner, doubleElixir:s.doubleElixir, room:room.code };
}
function broadcast(room, extra) {
  const message = JSON.stringify({ t:'state', state:publicState(room), ...(extra || {}) });
  for (const p of room.players) if (p.ws && p.ws.readyState === 1) p.ws.send(message);
}
function notify(room, text) { room.event = text; broadcast(room, {notice:text}); room.event = ''; }
function roomFor(code) { if (!rooms.has(code)) rooms.set(code, { code, players:[], state:null, mode:'friend', difficulty:'normal', botDue:0, botDeck:defaultDeck, nextObject:1, lastTick:Date.now() }); return rooms.get(code); }
function startRoom(room, botMode = false) { if (!room.state && room.players.length >= (botMode ? 1 : 2)) { room.mode = botMode ? 'bot' : 'friend'; room.state = freshState(room, botMode); room.botDue = Date.now() + 1800; broadcast(room); } }
function emitEffect(s, lane, pos, color, icon) { s.effects.push({id:Date.now()+Math.random(),lane,pos,color,icon,life:1}); }
function createUnit(room, s, t, card, lane, pos) {
  const count = card.count || 1;
  for (let i=0;i<count;i++) {
    const offset=(i-(count-1)/2)*0.022;
    s.units.push({id:room.nextObject++,team:t.id,cardId:card.id,lane,pos:clamp(pos+offset,0.06,0.94),hp:card.hp,maxHp:card.hp,damage:card.damage||0,speed:card.speed||0,range:card.range||0.1,rate:card.rate||1.2,cooldown:0,flying:!!card.flying,splash:card.splash||0,heal:card.heal||0,slow:card.slow||0,deathDamage:card.deathDamage||0,life:0,attack:card.type==='building',icon:card.icon});
  }
  emitEffect(s,lane,pos,card.color,card.icon);
}
function damageTower(s, teamId, lane, amount) {
  const victim = s.teams.find(t=>t.id===teamId); if (!victim) return;
  const side = lane===0?'left':lane===2?'right':null;
  if (side && victim.towers[side]>0) victim.towers[side]=Math.max(0,victim.towers[side]-amount);
  else victim.towers.king=Math.max(0,victim.towers.king-amount);
}
function playCard(room, teamId, cardId, lane, pos) {
  const s=room.state; if (!s || s.phase!=='playing') return false;
  const t=s.teams.find(x=>x.id===teamId); if (!t || !t.hand.includes(cardId)) return false;
  const card=cardMap.get(cardId); if (!card || t.elixir+0.001<card.cost) return false;
  const handIndex=t.hand.indexOf(cardId); t.elixir-=card.cost; t.plays++;
  t.hand[handIndex]=t.queue.shift() || t.deck[(t.plays+3)%t.deck.length];
  lane=clamp(Math.round(Number(lane)||0),0,2);
  pos=clamp(Number(pos)||0.18,0.06,0.94);
  const globalPos=teamId===s.teams[0].id?pos:1-pos;
  if (card.type==='spell') {
    const opponent=s.teams.find(x=>x.id!==teamId);
    for (const u of [...s.units]) {
      if (u.team!==teamId && u.lane===lane && Math.abs(u.pos-globalPos)<=card.splash) { if(card.slow)u.slowUntil=Date.now()+card.slow*1000; u.hp-=card.damage||0; }
      if (u.team===teamId && card.heal && u.lane===lane && Math.abs(u.pos-globalPos)<=card.splash) u.hp=Math.min(u.maxHp,u.hp+card.heal);
    }
    if(card.damage) damageTower(s,opponent.id,lane,Math.round(card.damage*.32));
    emitEffect(s,lane,globalPos,card.color,card.icon);
  } else if (card.type==='building') {
    const posOwn=teamId===s.teams[0].id?pos:1-pos;
    s.structures.push({id:room.nextObject++,team:teamId,cardId:card.id,lane,pos:globalPos,hp:card.hp,maxHp:card.hp,time:card.duration||20,damage:card.damage||0,range:card.range||.2,rate:card.rate||1.2,cooldown:.4,aura:card.aura||0,icon:card.icon});
    emitEffect(s,lane,globalPos,card.color,card.icon);
  } else createUnit(room,s,t,card,lane,globalPos);
  return true;
}
function tickRoom(room, dt) {
  const s=room.state; if(!s || s.phase!=='playing')return;
  s.time=Math.max(0,s.time-dt); s.doubleElixir=s.time<=60;
  const regen=s.doubleElixir?0.72:0.36;
  for(const t of s.teams)t.elixir=Math.min(10,t.elixir+dt*regen);
  const now=Date.now();
  for(const u of [...s.units]) {
    u.life+=dt; u.cooldown=Math.max(0,u.cooldown-dt);
    if(u.hp<=0){if(u.deathDamage){for(const enemy of s.units)if(enemy.team!==u.team&&enemy.lane===u.lane&&Math.abs(enemy.pos-u.pos)<.09)enemy.hp-=u.deathDamage;}s.units.splice(s.units.indexOf(u),1);continue;}
    if(u.slowUntil&&u.slowUntil>now){} else if(u.slowUntil)u.slowUntil=0;
    const enemyTeam=s.teams.find(t=>t.id!==u.team);
    const direction=u.team===s.teams[0].id?1:-1;
    const nearby=s.units.filter(v=>v.team!==u.team&&v.lane===u.lane&&Math.abs(v.pos-u.pos)<=u.range).sort((a,b)=>Math.abs(a.pos-u.pos)-Math.abs(b.pos-u.pos))[0];
    const building=room.state.structures.filter(v=>v.team!==u.team&&v.lane===u.lane&&Math.abs(v.pos-u.pos)<u.range).sort((a,b)=>Math.abs(a.pos-u.pos)-Math.abs(b.pos-u.pos))[0];
    const target=nearby||building;
    const towerDist=u.team===s.teams[0].id?1-u.pos:u.pos;
    if(target&&u.cooldown<=0&&u.damage){target.hp-=u.damage;if(u.splash)for(const other of s.units)if(other!==target&&other.team!==u.team&&other.lane===u.lane&&Math.abs(other.pos-target.pos)<u.splash)other.hp-=u.damage*.7;u.cooldown=u.rate;}
    else if(!target&&towerDist<=u.range+0.035&&u.cooldown<=0){damageTower(s,enemyTeam.id,u.lane,u.damage||100);u.cooldown=u.rate;}
    else if(!target){let speed=u.speed;if(u.slowUntil>now)speed*=.48;for(const ally of s.units)if(ally.team===u.team&&ally.lane===u.lane&&ally.cardId==='banner'&&Math.abs(ally.pos-u.pos)<.09)speed*=1.2;u.pos=clamp(u.pos+direction*speed*dt,.035,.965);}
    if(u.heal&&u.cooldown<=0){const ally=s.units.filter(v=>v.team===u.team&&v!==u&&v.lane===u.lane&&Math.abs(v.pos-u.pos)<.09&&v.hp<v.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+u.heal);u.cooldown=u.rate;}}
  }
  for(const b of [...s.structures]){
    b.time-=dt;b.cooldown-=dt;
    if(b.time<=0||b.hp<=0){s.structures.splice(s.structures.indexOf(b),1);continue;}
    const target=s.units.filter(u=>u.team!==b.team&&u.lane===b.lane&&Math.abs(u.pos-b.pos)<=b.range).sort((a,c)=>Math.abs(a.pos-b.pos)-Math.abs(c.pos-b.pos))[0];
    if(target&&b.cooldown<=0&&b.damage){target.hp-=b.damage;if(cardMap.get(b.cardId)?.splash)for(const other of s.units)if(other!==target&&other.team!==b.team&&other.lane===b.lane&&Math.abs(other.pos-target.pos)<.08)other.hp-=b.damage*.55;b.cooldown=b.rate||1;}
  }
  s.units=s.units.filter(u=>u.hp>0);
  s.effects=s.effects.filter(e=>{e.life-=dt;return e.life>0;});
  for(let i=0;i<2;i++)if(s.teams[i].towers.king<=0){s.phase='ended';s.winner=s.teams[1-i].id;}
  if(s.time<=0&&s.phase==='playing'){
    const a=s.teams[0].towers.king,b=s.teams[1].towers.king;
    if(a!==b){s.phase='ended';s.winner=a>b?s.teams[0].id:s.teams[1].id;}
    else s.time=1;
  }
  if(room.mode==='bot'&&s.phase==='playing') botTick(room,now);
}
function botTick(room, now) {
  if(now<room.botDue)return;
  const s=room.state, bot=s.teams[1];
  const pace={easy:4900,normal:3000,hard:1750}[room.difficulty]||3000;
  room.botDue=now+pace*(.82+Math.random()*.4);
  const affordable=bot.hand.map(id=>cardMap.get(id)).filter(c=>c&&c.cost<=bot.elixir);
  if(!affordable.length)return;
  const chosen=affordable[Math.floor(Math.random()*affordable.length)];
  const lane=Math.floor(Math.random()*3);
  let pos=.16+Math.random()*.16;
  if(chosen.type==='spell'){
    const targets=s.units.filter(u=>u.team===s.teams[0].id).sort((a,b)=>a.hp-b.hp);
    if(targets.length){const target=targets[0];const li=target.lane;pos=1-target.pos;playCard(room,bot.id,chosen.id,li,pos);return;}
  }
  if(room.difficulty==='hard'&&chosen.type==='unit'&&Math.random()<.45){const recent=s.units.find(u=>u.team===s.teams[0].id);if(recent)pos=1-recent.pos;}
  playCard(room,bot.id,chosen.id,lane,pos);
}
function send(ws,obj){if(ws.readyState===1)ws.send(JSON.stringify(obj));}
wss.on('connection',(ws,req)=>{
  const url=new URL(req.url,'http://localhost');
  const code=(url.searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  if(!code){send(ws,{t:'error',message:'Укажи код комнаты.'});ws.close();return;}
  const room=roomFor(code); const mode=url.searchParams.get('mode')==='bot'?'bot':'friend';
  const name=String(url.searchParams.get('name')||'Страж арены').trim().slice(0,16)||'Страж арены';
  if(room.players.length>=(room.mode==='bot'?1:2)||room.state){send(ws,{t:'error',message:'Комната уже занята. Выбери другой код.'});ws.close();return;}
  if(room.players.length===0){room.mode=mode;room.difficulty=['easy','normal','hard'].includes(url.searchParams.get('difficulty'))?url.searchParams.get('difficulty'):'normal';room.difficultyName={easy:'Разминка',normal:'Тактик',hard:'Грандмастер'}[room.difficulty];room.botDeck=shuffle(CARDS.filter(c=>c.type==='unit').map(c=>c.id).concat(['fireball','zap','cannon','frost'])).slice(0,8);}
  if(room.mode!==mode){send(ws,{t:'error',message:'Этот код комнаты создан для другого режима.'});ws.close();return;}
  let requestedDeck=[];
  try { requestedDeck=JSON.parse(url.searchParams.get('deck')||'[]'); } catch { requestedDeck=[]; }
  const p={id:'p'+(++clientSeq),name,deck:cleanDeck(requestedDeck),ws};
  if(room.mode==='bot'&&room.players.length) {send(ws,{t:'error',message:'В этой комнате уже начался бой.'});ws.close();return;}
  room.players.push(p); ws._player=p; ws._room=room;
  send(ws,{t:'welcome',id:p.id,room:code,mode:room.mode,host:room.players.length===1,state:publicState(room),shareUrl:`${url.origin}/?mode=friend&room=${code}`});
  if(room.mode==='bot') startRoom(room,true);
  else if(room.players.length===2){startRoom(room,false);notify(room,`${room.players[1].name} присоединился — бой начинается!`);}
  else broadcast(room,{notice:`Код комнаты ${code} готов. Отправь другу ссылку.`});
  ws.on('message',raw=>{let msg;try{msg=JSON.parse(raw.toString());}catch{return;}if(!msg||typeof msg.t!=='string')return;if(msg.t==='play'&&room.state&&room.state.phase==='playing'){if(p.id===room.state.teams[0].id||p.id===room.state.teams[1].id){const ok=playCard(room,p.id,String(msg.card||''),msg.lane,msg.pos);if(ok)broadcast(room);}}else if(msg.t==='ping')send(ws,{t:'pong'});});
  ws.on('close',()=>{const index=room.players.indexOf(p);if(index>=0)room.players.splice(index,1);if(room.state&&room.state.phase==='playing'&&room.mode==='friend'){room.state.phase='ended';room.state.winner=room.state.teams.find(t=>t.id!==p.id)?.id||null;broadcast(room,{notice:`${p.name} покинул арену.`});}else if(room.players.length===0)rooms.delete(code);else broadcast(room,{notice:`${p.name} отключился.`});});
});
setInterval(()=>{const now=Date.now();for(const room of rooms.values()){const dt=Math.min(.1,(now-room.lastTick)/1000);room.lastTick=now;if(room.state?.phase==='playing')tickRoom(room,dt);if(room.state)broadcast(room);}},100);
server.listen(PORT,'0.0.0.0',()=>console.log(`Башни и руны доступны на 0.0.0.0:${PORT}`));
