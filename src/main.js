import './style.css';
import { createIcons, Play, ArrowUpRight, UsersRound, ChefHat, Flame, Volume2, VolumeX, ChevronDown, X, ArrowRight, Copy, Clock3, Coins, HelpCircle, Trash2, Link, Check, Coffee, Keyboard, LogOut, RotateCcw, MessageSquare } from 'lucide';
import { KitchenGame } from './game.js';
import { ITEMS, PLAYER_COLORS, STATIONS, MAX_PLAYERS, UPGRADES } from './shared.js';
import { foodIcon } from './food-icons.js';

const icons = { Play, ArrowUpRight, UsersRound, ChefHat, Flame, Volume2, VolumeX, ChevronDown, X, ArrowRight, Copy, Clock3, Coins, HelpCircle, Trash2, Link, Check, Coffee, Keyboard, LogOut, RotateCcw, MessageSquare };
const refreshIcons = () => createIcons({ icons });
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const home = $('#home');
const gameScreen = $('#game-screen');
const modalRoot = $('#modal-root');
const gameOverlay = $('#game-overlay');
const toastEl = $('#toast');
let socket, game, room, playerId, currentScreen = 'home', modalKind = '', overlayKind = '';
let selectedColor = Number(localStorage.getItem('burger-color') || 0);
if (!Number.isInteger(selectedColor) || selectedColor < 0 || selectedColor >= PLAYER_COLORS.length) selectedColor = 0;
let savedName = localStorage.getItem('burger-name') || '';
let setupTab = 'create';
let setupCode = '';
let queued = [];
let lobbyKey = '';
let currentTarget = null;
let serverOffset = 0;
let soundOn = localStorage.getItem('burger-sound') !== 'off';
let audioContext;
let toastTimer;
let manualLeave = false;

function sound(frequency = 650, duration = .1) {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is optional. */ }
}
function toast(message, kind = 'info') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
}
function updateConnection(status) {
  const dot = $('.status-dot');
  dot.className = `status-dot ${status}`;
  $('#connection-label').textContent = status === 'online' ? 'СЕРВЕР ОНЛАЙН' : status === 'offline' ? 'НЕТ СОЕДИНЕНИЯ' : 'ПОДКЛЮЧЕНИЕ';
}
function connect() {
  updateConnection('connecting');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket.addEventListener('open', () => {
    updateConnection('online');
    for (const data of queued) socket.send(JSON.stringify(data));
    queued = [];
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'joined') {
      playerId = message.playerId;
      manualLeave = false;
    } else if (message.type === 'state') {
      applyState(message.room);
    } else if (message.type === 'notice') {
      toast(message.text, message.kind);
      if (message.kind === 'success') sound(690, .08);
      else if (message.kind === 'warning') sound(260, .12);
    } else if (message.type === 'error') {
      const error = $('#form-error');
      if (error) { error.textContent = message.message; error.classList.remove('hidden'); }
      else toast(message.message, 'warning');
      const submit = $('#setup-submit');
      if (submit) { submit.disabled = false; submit.innerHTML = `${setupTab === 'create' ? 'СОЗДАТЬ ЛОББИ' : 'ВОЙТИ В ЛОББИ'} <i data-lucide="arrow-right"></i>`; refreshIcons(); }
    }
  });
  socket.addEventListener('close', () => {
    updateConnection('offline');
    queued = [];
    if (!playerId && modalKind === 'setup') {
      const submit = $('#setup-submit');
      if (submit?.disabled) {
        submit.disabled = false;
        submit.innerHTML = `${setupTab === 'create' ? 'СОЗДАТЬ ЛОББИ' : 'ВОЙТИ В ЛОББИ'} <i data-lucide="arrow-right"></i>`;
        refreshIcons();
        toast('Нет соединения с сервером. Подключаемся снова…', 'warning');
      }
    }
    if (playerId && !manualLeave) {
      game?.pause();
      playerId = null; room = null;
      showHome(); closeModal();
      toast('Соединение с сервером потеряно. Подключаемся снова…', 'warning');
    }
    setTimeout(connect, 1800);
  });
  socket.addEventListener('error', () => updateConnection('offline'));
}
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  else if (socket?.readyState === WebSocket.CONNECTING) queued.push(message);
  else { toast('Нет соединения с сервером. Попробуйте ещё раз.', 'warning'); return false; }
  return true;
}
function showHome() {
  currentScreen = 'home';
  home.classList.remove('hidden'); gameScreen.classList.add('hidden');
  gameOverlay.classList.add('hidden'); overlayKind = '';
  if (game) { game.pause(); game.shift = 0; }
  currentTarget = null;
  history.replaceState(null, '', location.pathname);
}
function leaveRoom() {
  manualLeave = true;
  if (playerId) send({ type: 'leave' });
  playerId = null; room = null; lobbyKey = '';
  closeModal(); showHome();
}
function closeModal() { modalRoot.innerHTML = ''; modalKind = ''; }
function modal(inner, className = '') {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal-card ${className}" role="dialog" aria-modal="true">${inner}</div></div>`;
  refreshIcons();
}
function actionClose() { return '<button class="close-btn" data-action="close-modal" aria-label="Закрыть"><i data-lucide="x"></i></button>'; }

function saveSetupValues() {
  const name = $('#player-name'); if (name) savedName = name.value.trim().slice(0, 20);
  const code = $('#room-code-input'); if (code) setupCode = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
function showSetup(tab = 'create') {
  setupTab = tab; modalKind = 'setup';
  modal(`${actionClose()}
    <div class="modal-eyebrow">ИГРАЙТЕ ВМЕСТЕ</div><h2>СОБЕРИТЕ КОМАНДУ<span style="color:#d76b4e">.</span></h2>
    <p class="modal-lead">Одна кухня и до восьми поваров. Создайте лобби или присоединитесь к друзьям по ID.</p>
    <div class="modal-tabs"><button class="${tab === 'create' ? 'selected' : ''}" data-action="tab-create">СОЗДАТЬ ЛОББИ</button><button class="${tab === 'join' ? 'selected' : ''}" data-action="tab-join">ВОЙТИ ПО ID</button></div>
    <div class="form-grid"><label><span class="field-label">ВАШЕ ИМЯ</span><input class="text-field" id="player-name" maxlength="20" placeholder="Например, Шеф" value="${escapeHTML(savedName)}" autocomplete="off"></label>
    ${tab === 'join' ? `<label><span class="field-label">ID ЛОББИ</span><input class="text-field code-field" id="room-code-input" maxlength="6" placeholder="ABC123" value="${escapeHTML(setupCode)}" autocomplete="off" spellcheck="false"></label>` : ''}
    <div><span class="field-label">ЦВЕТ ФОРМЫ</span><div class="color-row">${PLAYER_COLORS.map((color, i) => `<button class="swatch ${selectedColor === i ? 'selected' : ''}" style="background:${color}" data-action="choose-color" data-color="${i}" aria-label="Цвет формы ${i + 1}" title="Цвет формы ${i + 1}"></button>`).join('')}</div></div></div>
    <div id="form-error" class="form-error hidden"></div>
    <button class="btn btn-primary modal-action" id="setup-submit" data-action="${tab === 'create' ? 'create-room' : 'join-room'}">${tab === 'create' ? 'СОЗДАТЬ ЛОББИ' : 'ВОЙТИ В ЛОББИ'} <i data-lucide="arrow-right"></i></button>
    <span class="subtle-link">БЕЗ РЕГИСТРАЦИИ · ПРОСТО ПОДЕЛИТЕСЬ ID</span>`);
  setTimeout(() => $(tab === 'join' && savedName ? '#room-code-input' : '#player-name')?.focus(), 30);
}
function submitSetup() {
  saveSetupValues();
  savedName ||= 'Шеф';
  localStorage.setItem('burger-name', savedName);
  localStorage.setItem('burger-color', String(selectedColor));
  const error = $('#form-error');
  if (setupTab === 'join' && setupCode.length !== 6) {
    error.textContent = 'Введите шестисимвольный ID лобби, который прислал друг.'; error.classList.remove('hidden'); return;
  }
  if (!send(setupTab === 'create' ? { type: 'create', name: savedName, color: selectedColor } : { type: 'join', name: savedName, color: selectedColor, code: setupCode })) return;
  const submit = $('#setup-submit'); submit.disabled = true; submit.textContent = 'ПОДКЛЮЧАЕМСЯ…';
}
function showLobby(force = false) {
  if (!room) return;
  const key = JSON.stringify([room.id, room.hostId, room.players.map((p) => [p.id, p.name, p.color])]);
  if (!force && modalKind === 'lobby' && key === lobbyKey) return;
  lobbyKey = key; modalKind = 'lobby';
  const host = room.hostId === playerId;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const p = room.players[i];
    return p ? `<div class="roster-slot"><span class="roster-avatar" style="background:${p.color}">${escapeHTML(p.name.slice(0, 1).toUpperCase())}</span><strong>${escapeHTML(p.name)}</strong><small>${p.id === room.hostId ? 'СОЗДАТЕЛЬ' : p.id === playerId ? 'ВЫ' : 'ПОВАР'}</small></div>` : '<div class="roster-slot empty"><span>+</span><small>СВОБОДНО</small></div>';
  }).join('');
  modal(`<button class="close-btn" data-action="leave-room" aria-label="Выйти из лобби"><i data-lucide="x"></i></button>
    <div class="modal-eyebrow">КОМАНДА СОБИРАЕТСЯ</div><h2>ВАША КУХНЯ<span style="color:#d76b4e">.</span></h2>
    <p class="modal-lead">Отправьте ID друзьям. Они смогут присоединиться к вашей смене из главного меню.</p>
    <div class="lobby-code-row"><div><small>ID ВАШЕГО ЛОББИ</small><strong>${escapeHTML(room.id)}</strong></div><button class="copy-button" data-action="copy-code"><i data-lucide="copy"></i> СКОПИРОВАТЬ</button></div>
    <div class="roster-head"><span>КОМАНДА</span><span>${room.players.length} / ${MAX_PLAYERS}</span></div><div class="roster-grid">${slots}</div>
    <div class="lobby-bottom"><button class="btn btn-secondary" data-action="copy-link"><i data-lucide="link"></i> ССЫЛКА</button><button class="btn btn-primary" data-action="start-room" ${host ? '' : 'disabled'}>${host ? 'НАЧАТЬ СМЕНУ' : 'ОЖИДАЕМ СОЗДАТЕЛЯ…'} <i data-lucide="arrow-right"></i></button></div>
    <p class="lobby-help">${host ? 'Начните сейчас или подождите друзей. Присоединиться можно и во время смены.' : 'Создатель лобби скоро начнёт смену. Приготовьте фартук!'}</p>`);
}
const guideContent = `
  <div class="guide-grid">
    <div class="guide-box"><span class="guide-icon">${foodIcon('burger')}</span><strong>СОБЕРИТЕ БУРГЕР</strong><p>Положите булочку на стол сборки. Поджарьте котлету на гриле и добавьте её. Заберите готовый бургер.</p></div>
    <div class="guide-box"><span class="guide-icon">${foodIcon('cheese')}</span><strong>ДОБАВЬТЕ СЫР</strong><p>Для чизбургера добавьте сыр до того, как забрать бургер. Салат и томаты — по желанию.</p></div>
    <div class="guide-box"><span class="guide-icon">${foodIcon('fries')}</span><strong>ПРИГОТОВЬТЕ ФРИ</strong><p>Возьмите картофель, положите во фритюр и заберите, когда будет готов. Не дайте еде сгореть!</p></div>
    <div class="guide-box"><span class="guide-icon">${foodIcon('soda')}</span><strong>ОТДАЙТЕ ЗАКАЗ</strong><p>Возьмите напиток в автомате. Отнесите все блюда из карточки на стойку выдачи.</p></div>
  </div>
  <div class="guide-controls"><span class="control-pair"><span class="keycap">WASD</span> движение</span><span class="control-pair"><span class="keycap">МЫШЬ</span> обзор</span><span class="control-pair"><span class="keycap">E</span> действие</span><span class="control-pair"><span class="keycap">Q</span> выбросить</span><span class="control-pair"><span class="keycap">H</span> рецепты</span><span class="control-pair"><span class="keycap">ENTER</span> чат</span></div>`;
function showHomeHelp() {
  modalKind = 'help';
  modal(`${actionClose()}<div class="modal-eyebrow">ШПАРГАЛКА ДЛЯ ПОВАРА</div><h2>КАК ИГРАТЬ<span style="color:#d76b4e">.</span></h2><p class="modal-lead">Работайте вместе, следите за заказами и не забывайте про гриль.</p>${guideContent}<p class="guide-note">На кухне подсказка появится, когда вы подойдёте к станции и посмотрите на неё. Нажмите E или левую кнопку мыши.</p>`);
}
function showAbout() {
  modalKind = 'about';
  modal(`${actionClose()}<div class="modal-eyebrow">С ЛЮБОВЬЮ К БУРГЕРАМ</div><h2>ОБ ЭТОЙ ИГРЕ<span style="color:#d76b4e">.</span></h2><p class="about-copy"><strong>Одна кухня. Целая команда. Море заказов.</strong><br><br>Готовьте, работайте сообща и успейте накормить всех до конца смены. Приглашайте друзей по ID лобби или играйте в одиночку.<br><br>Это самостоятельный фанатский прототип, вдохновлённый Burger Shift: Team Rush, а не официальная игра. Оригинальные ресурсы и все функции оригинала не воспроизведены.</p><button class="btn btn-primary modal-action" data-action="close-modal">ПОНЯТНО <i data-lucide="arrow-right"></i></button>`);
}
function showOverlay(kind, html) {
  overlayKind = kind; gameOverlay.classList.remove('hidden'); gameOverlay.innerHTML = html; refreshIcons();
}
function showIntro() {
  game?.pause();
  showOverlay('intro', `<div class="overlay-card wide"><div class="overlay-tag">СМЕНА ${String(room.shift).padStart(2, '0')} / ЛОББИ ${escapeHTML(room.id)}</div><div class="modal-eyebrow">ФАРТУК НАДЕТ. ВРЕМЯ РАБОТАТЬ.</div><h2>КУХНЯ ЖДЁТ<span style="color:#d76b4e">!</span></h2><p class="modal-lead">Клиенты уже на подходе. Готовьте блюда и отдавайте их на выдаче до конца смены.</p>${guideContent}<button class="btn btn-primary" data-action="resume-game">НА КУХНЮ <i data-lucide="arrow-right"></i></button><p class="guide-note" style="text-align:center">Нажмите кнопку, чтобы захватить мышь. Смена идёт в реальном времени.</p></div>`);
}
function showPause() {
  if (room?.phase !== 'playing' || overlayKind === 'results') return;
  game?.pause();
  showOverlay('pause', `<div class="overlay-card"><div class="modal-eyebrow">НЕМНОГО ПЕРЕДЫШКИ</div><h2>ВЫ НА ПАУЗЕ<span style="color:#d76b4e">.</span></h2><p class="modal-lead">Пока вы отдыхаете, смена и заказы продолжаются. Команда ждёт вас на кухне!</p><div class="intro-banner"><span class="intro-emoji">${foodIcon('burger')}</span><div><strong>ЛОББИ ${escapeHTML(room.id)}</strong><p>Друзья могут присоединиться по этому ID даже во время смены.</p></div></div><div class="pause-share"><button class="copy-button" data-action="copy-code"><i data-lucide="copy"></i> СКОПИРОВАТЬ ID</button><button class="copy-button" data-action="copy-link"><i data-lucide="link"></i> ССЫЛКА ДЛЯ ДРУГА</button></div><div class="overlay-actions"><button class="btn btn-secondary" data-action="game-help">РЕЦЕПТЫ</button><button class="btn btn-primary" data-action="resume-game">ПРОДОЛЖИТЬ <i data-lucide="arrow-right"></i></button></div><button class="btn btn-secondary" style="width:100%;margin-top:9px" data-action="leave-room">ВЫЙТИ ИЗ СМЕНЫ</button></div>`);
}
function showGameHelp() {
  if (!room || room.phase !== 'playing') return;
  game?.pause();
  showOverlay('help', `<div class="overlay-card wide"><div class="modal-eyebrow">ШПАРГАЛКА ДЛЯ ПОВАРА</div><h2>РЕЦЕПТЫ И УПРАВЛЕНИЕ<span style="color:#d76b4e">.</span></h2><p class="modal-lead">Смена продолжается. Вернитесь на кухню, когда будете готовы.</p>${guideContent}<button class="btn btn-primary" data-action="resume-game">ПРОДОЛЖИТЬ <i data-lucide="arrow-right"></i></button></div>`);
}
function showChat() {
  if (room?.phase !== 'playing') return;
  game?.pause();
  showOverlay('chat', `<div class="overlay-card"><div class="modal-eyebrow">СООБЩЕНИЕ ДЛЯ КОМАНДЫ</div><h2>ЧТО СКАЖЕМ<span style="color:#d76b4e">?</span></h2><p class="modal-lead">Напишите напарникам — вместе управляться с заказами легче.</p><form class="chat-form" id="chat-form"><input class="text-field" id="chat-input" maxlength="120" placeholder="Например: я на гриле!" autocomplete="off"><button type="submit" class="btn btn-primary">ОТПРАВИТЬ <i data-lucide="arrow-right"></i></button></form><button class="btn btn-secondary" style="width:100%;margin-top:10px" data-action="resume-game">ВЕРНУТЬСЯ БЕЗ СООБЩЕНИЯ</button></div>`);
  setTimeout(() => $('#chat-input')?.focus(), 10);
}
function showResults() {
  game?.pause();
  const host = room.hostId === playerId;
  showOverlay('results', `<div class="overlay-card"><div class="modal-eyebrow">ДВЕРИ ЗАКРЫТЫ · СМЕНА ${String(room.shift).padStart(2, '0')}</div><h2>ОТЛИЧНАЯ РАБОТА<span style="color:#d76b4e">!</span></h2><p class="modal-lead">Фартуки можно снять. Вот как команда справилась сегодня:</p><div class="result-stats"><div class="result-stat"><strong>${room.served}</strong><small>ЗАКАЗОВ ВЫДАНО</small></div><div class="result-stat"><strong>${room.missed}</strong><small>НЕ УСПЕЛИ</small></div><div class="result-stat"><strong>$${room.money}</strong><small>ЗАРАБОТАНО ВСЕГО</small></div></div><div class="intro-banner"><span class="intro-emoji">★</span><div><strong>${room.score} ОЧКОВ ЗА СМЕНУ</strong><p>Совместный результат всех поваров в лобби.</p></div></div><div class="upgrade-heading"><span>УЛУЧШЕНИЯ КУХНИ</span><span>БАЛАНС: $${room.money}</span></div><div class="upgrade-list">${UPGRADES.map((upgrade) => `<button class="upgrade-card ${room.upgrades[upgrade.id] ? 'purchased' : ''}" data-action="buy-upgrade" data-upgrade="${upgrade.id}" ${!host || room.upgrades[upgrade.id] || room.money < upgrade.price ? 'disabled' : ''}><strong>${upgrade.name}</strong><small>${upgrade.detail}</small><b>${room.upgrades[upgrade.id] ? 'КУПЛЕНО ✓' : `$${upgrade.price}`}</b></button>`).join('')}</div><p class="upgrade-note">${host ? 'Улучшения останутся у команды в следующих сменах.' : 'Улучшения выбирает создатель лобби.'}</p><div class="overlay-actions"><button class="btn btn-secondary" data-action="leave-room">ВЫЙТИ</button><button class="btn btn-primary" data-action="next-shift" ${host ? '' : 'disabled'}>${host ? 'СЛЕДУЮЩАЯ СМЕНА' : 'ОЖИДАЕМ СОЗДАТЕЛЯ…'} <i data-lucide="arrow-right"></i></button></div></div>`);
}
function resumeGame() {
  if (room?.phase !== 'playing') return;
  gameOverlay.classList.add('hidden'); overlayKind = '';
  game.resume(); sound(560, .07);
}
function ensureGame() {
  if (game) return true;
  try {
    game = new KitchenGame($('#game-canvas'), {
      onMove: (position) => { send({ type: 'move', ...position }); updateMapPlayer(position); },
      onInteract: (station) => send({ type: 'interact', station }),
      onDiscard: () => send({ type: 'discard' }),
      onTarget: (station) => { currentTarget = station; updatePrompt(); },
      onPause: showPause,
      onHelp: showGameHelp,
      onChat: showChat,
      onPointerFallback: () => toast(matchMedia('(pointer: coarse)').matches ? 'Проведите пальцем по кухне, чтобы повернуть камеру.' : 'Захват мыши недоступен. Используйте стрелки для обзора.', 'info'),
    });
    const map = $('#map-inner');
    map.innerHTML = STATIONS.map((s) => `<span class="map-station ${s.id}" title="${s.name}" style="left:${(s.x + 7.5) / 15 * 100}%;top:${(s.z + 6) / 12 * 100}%"></span>`).join('') + '<div class="map-player" id="map-player"></div>';
    return true;
  } catch (error) {
    console.error(error); toast('Не удалось запустить 3D-графику. Проверьте поддержку WebGL в браузере.', 'warning'); leaveRoom(); return false;
  }
}
function showGame() {
  currentScreen = 'game'; closeModal(); home.classList.add('hidden'); gameScreen.classList.remove('hidden');
  if (!ensureGame()) return false;
  game.resize(); return true;
}
function applyState(newRoom) {
  if (!playerId) return;
  const previous = room;
  room = newRoom; serverOffset = room.serverTime - Date.now();
  if (room.phase === 'lobby') {
    if (currentScreen !== 'home') showHome();
    showLobby(); return;
  }
  const justStarted = room.phase === 'playing' && (currentScreen !== 'game' || previous?.phase !== 'playing' || previous?.shift !== room.shift);
  const justFinished = room.phase === 'results' && (currentScreen !== 'game' || previous?.phase !== 'results');
  if (currentScreen !== 'game' && !showGame()) return;
  game.setState(room, playerId);
  updateHUD();
  if (justStarted) showIntro();
  else if (justFinished) showResults();
  else if (room.phase === 'results' && (previous?.hostId !== room.hostId || previous?.money !== room.money || JSON.stringify(previous?.upgrades) !== JSON.stringify(room.upgrades))) showResults();
  if (room.event && room.event.startedAt !== previous?.event?.startedAt && !justStarted) {
    toast(`${room.event.title}: ${room.event.description}`, 'warning'); sound(760, .18);
  }
}
function serverNow() { return Date.now() + serverOffset; }
function formatTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function updateHUD() {
  if (!room || currentScreen !== 'game') return;
  $('#shift-label').innerHTML = `СМЕНА ${String(room.shift).padStart(2, '0')} <b>●</b> ${room.phase === 'playing' ? 'ОТКРЫТО' : 'ЗАКРЫТО'}`;
  $('#time-left').textContent = formatTime(room.shiftEndsAt - serverNow());
  $('#money-value').textContent = `$${room.money}`;
  const eventBanner = $('#event-banner');
  eventBanner.classList.toggle('hidden', !room.event);
  if (room.event) eventBanner.innerHTML = `<strong>${escapeHTML(room.event.title)}</strong><span>${escapeHTML(room.event.description)}</span>`;
  $('#hud-room-code').textContent = room.id;
  $('#crew-count').textContent = `${room.players.length} / ${MAX_PLAYERS}`;
  $('#crew-list').innerHTML = room.players.map((p) => `<span class="crew-member"><span class="crew-avatar" style="background:${p.color}">${escapeHTML(p.name.slice(0, 1).toUpperCase())}</span>${escapeHTML(p.name)} ${p.id === playerId ? '<span class="crew-me">ВЫ</span>' : ''}</span>`).join('');
  $('#order-count').textContent = `${room.orders.length} / 4`;
  $('#orders-list').innerHTML = room.orders.map((order) => {
    const percent = Math.max(0, Math.min(100, (order.expiresAt - serverNow()) / (order.expiresAt - order.createdAt) * 100));
    return `<article class="ticket"><div class="ticket-head"><span class="ticket-id">ЗАКАЗ #${String(order.id).padStart(2, '0')}</span><span class="ticket-price">$${order.price}</span></div><div class="ticket-name">${escapeHTML(order.name)}</div><div class="ticket-items">${order.items.map((item) => `<span class="ticket-item ${item.delivered ? 'delivered' : ''}" title="${escapeHTML(ITEMS[item.type]?.name || item.type)}">${foodIcon(item.type)}</span>`).join('')}</div><div class="ticket-progress"><span class="${percent < 28 ? 'urgent' : ''}" style="width:${percent}%"></span></div></article>`;
  }).join('');
  const me = room.players.find((p) => p.id === playerId);
  const item = me?.hand ? ITEMS[me.hand] : null;
  $('#held-emoji').innerHTML = foodIcon(me?.hand || 'empty');
  $('#held-name').textContent = item?.short || 'ПУСТО';
  $('#chat-feed').innerHTML = room.chat.slice(-3).map((message) => `<div class="chat-message">${message.system ? '' : `<strong style="color:${message.color}">${escapeHTML(message.name)}:</strong> `}${escapeHTML(message.text)}</div>`).join('');
  updatePrompt();
}
function updateMapPlayer(position) {
  const marker = $('#map-player'); if (!marker) return;
  marker.style.left = `${(position.x + 7.5) / 15 * 100}%`;
  marker.style.top = `${(position.z + 6) / 12 * 100}%`;
  marker.style.transform = `translate(-50%,-50%) rotate(${-position.yaw}rad)`;
}
function promptText(station, me) {
  const hand = me?.hand;
  if (station.id === 'grill' || station.id === 'fryer') {
    const slot = room?.stations[station.id];
    if (slot) {
      const now = serverNow();
      return now >= slot.burnAt ? 'Забрать сгоревшую еду' : now >= slot.readyAt ? 'Забрать готовое блюдо' : `Готовится · ${Math.ceil((slot.readyAt - now) / 1000)} сек.`;
    }
    return station.id === 'grill' ? (hand === 'patty_raw' ? 'Положить котлету на гриль' : 'Пожарить котлету') : (hand === 'fries_raw' ? 'Положить картофель' : 'Приготовить картошку');
  }
  if (station.id === 'prep') return hand ? `Добавить: ${ITEMS[hand]?.name || 'предмет'}` : room?.stations.prep.length ? 'Забрать готовый бургер' : 'Начать с булочки';
  if (station.id === 'serve') return hand ? 'Отдать блюдо' : 'Выдача заказов';
  const label = { raw: 'Взять сырую котлету', potato: 'Взять картофель', bun: 'Взять булочку', lettuce: 'Взять салат', tomato: 'Взять томат', cheese: 'Взять сыр', soda: 'Налить газировку', coffee: 'Налить кофе' };
  return label[station.id] || 'Взаимодействовать';
}
function updatePrompt() {
  const prompt = $('#interaction-prompt');
  if (!currentTarget || !room || room.phase !== 'playing') { prompt.classList.add('hidden'); return; }
  prompt.classList.remove('hidden');
  $('#interaction-station').textContent = currentTarget.name;
  $('#interaction-text').textContent = promptText(currentTarget, room.players.find((p) => p.id === playerId));
}
async function copyText(text, what) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('Clipboard unavailable');
  } catch {
    const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select();
    try { if (!document.execCommand('copy')) throw new Error('Copy failed'); } catch { area.remove(); toast(`Скопируйте вручную: ${text}`, 'info'); return; }
    area.remove();
  }
  toast(`${what} скопирован${what === 'Ссылка' ? 'а' : ''}!`, 'success');
}
function toggleSound() {
  soundOn = !soundOn; localStorage.setItem('burger-sound', soundOn ? 'on' : 'off');
  const button = $('[data-action="sound"]');
  button.innerHTML = `<i data-lucide="${soundOn ? 'volume-2' : 'volume-x'}"></i>`; refreshIcons();
  if (soundOn) sound();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  switch (action) {
    case 'solo':
      savedName ||= 'Шеф';
      send({ type: 'create', name: savedName, color: selectedColor, autoStart: true }); sound(); break;
    case 'multiplayer': setupCode = ''; showSetup('create'); sound(); break;
    case 'home-help': showHomeHelp(); break;
    case 'about': showAbout(); break;
    case 'close-modal': closeModal(); break;
    case 'tab-create': saveSetupValues(); showSetup('create'); break;
    case 'tab-join': saveSetupValues(); showSetup('join'); break;
    case 'choose-color': selectedColor = Number(button.dataset.color); document.querySelectorAll('.swatch').forEach((el) => el.classList.toggle('selected', el === button)); sound(500 + selectedColor * 50, .05); break;
    case 'create-room': case 'join-room': submitSetup(); break;
    case 'start-room': case 'next-shift': send({ type: 'start' }); sound(); break;
    case 'buy-upgrade': send({ type: 'buy', upgrade: button.dataset.upgrade }); break;
    case 'leave-room': leaveRoom(); break;
    case 'copy-code': if (room) copyText(room.id, 'ID'); break;
    case 'copy-link': if (room) copyText(`${location.origin}${location.pathname}?room=${encodeURIComponent(room.id)}`, 'Ссылка'); break;
    case 'sound': toggleSound(); break;
    case 'resume-game': resumeGame(); break;
    case 'game-help': showGameHelp(); break;
    case 'touch-interact': if (game?.target) send({ type: 'interact', station: game.target.id }); break;
    case 'touch-discard': send({ type: 'discard' }); break;
  }
});
document.addEventListener('submit', (event) => {
  if (event.target.id === 'chat-form') {
    event.preventDefault();
    const input = $('#chat-input');
    if (input.value.trim()) send({ type: 'chat', text: input.value.trim() });
    resumeGame();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && modalKind === 'setup' && (event.target.id === 'player-name' || event.target.id === 'room-code-input')) { event.preventDefault(); submitSetup(); }
  if (event.key === 'Escape' && modalKind && modalKind !== 'lobby') closeModal();
});
// Virtual movement buttons supplement keyboard/mouse on touch devices.
document.querySelectorAll('[data-touch]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); game?.keys.add(button.dataset.touch); });
  const release = (event) => { event.preventDefault(); game?.keys.delete(button.dataset.touch); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
setInterval(() => { if (room && currentScreen === 'game') updateHUD(); }, 1000);
refreshIcons();
if (!soundOn) { $('[data-action="sound"]').innerHTML = '<i data-lucide="volume-x"></i>'; refreshIcons(); }
connect();
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode) { setupCode = inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); showSetup('join'); }
