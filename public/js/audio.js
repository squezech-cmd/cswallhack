// Синтезированный звук: ни одного внешнего файла.
let ctx = null;
let master = null;
let noiseBuf = null;
let drone = null;

export function initAudio() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startDrone();
  return ctx;
}
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function noise(dur, filterType, freq, q, gain) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
  return g;
}

function tone(freq, dur, type = 'sine', gain = 0.16, slideTo = null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function footstep(sprint) {
  noise(sprint ? 0.11 : 0.16, 'bandpass', sprint ? 900 : 620, 1.1, sprint ? 0.14 : 0.075);
  if (sprint) noise(0.06, 'highpass', 2200, 0.8, 0.05);
}
export function stepMonster(dist) {
  const g = Math.max(0, 1 - dist / 26);
  if (g <= 0.02) return;
  noise(0.35, 'lowpass', 130, 1.4, 0.32 * g * g);
  tone(46, 0.4, 'sine', 0.18 * g, 32);
}
export function growl(dist) {
  const g = Math.max(0, 1 - dist / 34);
  if (g <= 0.03) return;
  noise(0.9, 'bandpass', 180, 2.5, 0.2 * g);
  tone(58, 0.9, 'sawtooth', 0.05 * g, 38);
}
export function pickup() { tone(880, 0.09, 'triangle', 0.09, 1180); }
export function deposit() {
  tone(660, 0.12, 'triangle', 0.1);
  setTimeout(() => tone(990, 0.2, 'triangle', 0.09), 70);
  setTimeout(() => tone(1320, 0.26, 'sine', 0.07), 150);
}
export function hit() {
  noise(0.35, 'lowpass', 400, 1, 0.45);
  tone(120, 0.3, 'sawtooth', 0.2, 60);
}
export function impact(v) { noise(0.18, 'bandpass', 1400, 1.4, 0.06 + v * 0.16); }
export function heartbeat(fast) {
  tone(fast ? 62 : 52, 0.16, 'sine', fast ? 0.22 : 0.12, 40);
}
export function uiClick() { tone(520, 0.06, 'square', 0.05); }
export function reviveStart() { tone(240, 0.7, 'sine', 0.06, 420); }
export function revived() { tone(520, 0.5, 'sine', 0.1, 880); }
export function alarm() { tone(300, 0.8, 'sawtooth', 0.06, 200); }

function startDrone() {
  if (!ctx || drone) return;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  const g = ctx.createGain(), f = ctx.createBiquadFilter();
  o1.type = 'sine'; o2.type = 'sine';
  o1.frequency.value = 41; o2.frequency.value = 55.3;
  f.type = 'lowpass'; f.frequency.value = 220;
  g.gain.value = 0.05;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o1.start(); o2.start();
  drone = { g, o1, o2 };
  // редкие скрипы металла
  setInterval(() => {
    if (Math.random() < 0.35) noise(1.6, 'bandpass', 1200 + Math.random() * 900, 6, 0.012);
  }, 9000);
}
export function setDroneTension(v) {
  if (!drone) return;
  drone.g.gain.value = 0.05 + v * 0.06;
  drone.o2.frequency.value = 55.3 + v * 26;
}
