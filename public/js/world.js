// Процедурные текстуры и геометрия мира (внешних ассетов нет).
import * as THREE from 'three';

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function noiseFill(g, w, h, base, spread) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

export function makeTextures() {
  const concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3b4148'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 40},${22 + Math.random() * 40},${26 + Math.random() * 40},${0.15 + Math.random() * 0.25})`;
      const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 40;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    noiseFill(g, w, h, 60, 34);
    // трещины
    g.strokeStyle = 'rgba(10,12,14,.55)';
    for (let i = 0; i < 12; i++) {
      g.lineWidth = 0.6 + Math.random();
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += (Math.random() - 0.5) * 26; y += (Math.random() - 0.5) * 26; g.lineTo(x, y); }
      g.stroke();
    }
    // швы плит
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  }, 1);

  const floor = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#23282d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(${Math.random() * 40 | 0},${Math.random() * 40 | 0},${Math.random() * 44 | 0},.22)`;
      g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 26, Math.random() * 26);
    }
    noiseFill(g, w, h, 40, 22);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    // лужи
    for (let i = 0; i < 4; i++) {
      const grd = g.createRadialGradient(Math.random() * w, Math.random() * h, 2, Math.random() * w, Math.random() * h, 40);
      grd.addColorStop(0, 'rgba(20,28,34,.5)'); grd.addColorStop(1, 'rgba(20,28,34,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
  }, 1);

  const metal = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#31373d'; g.fillRect(0, 0, w, h);
    noiseFill(g, w, h, 30, 26);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(180,140,60,.25)';
    for (let i = 0; i < 26; i++) g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 12, Math.random() * 4);
  }, 1);

  const crate = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#7a5330'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) {
      g.fillStyle = `rgba(${70 + Math.random() * 30 | 0},${45 + Math.random() * 20 | 0},${24 + Math.random() * 14 | 0},1)`;
      g.fillRect(0, y, w, 20);
    }
    noiseFill(g, w, h, 40, 26);
    g.strokeStyle = 'rgba(20,12,6,.75)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
  }, 1);

  const warning = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#1b1d20'; g.fillRect(0, 0, w, h);
    for (let i = -h; i < w + h; i += 28) {
      g.save(); g.translate(i, 0); g.rotate(-Math.PI / 4);
      g.fillStyle = '#c9a227'; g.fillRect(0, -h, 14, h * 3);
      g.restore();
    }
    noiseFill(g, w, h, 30, 20);
  }, 1);

  return { concrete, floor, metal, crate, warning };
}

// ---------------- уровень ----------------
export function buildLevel(scene, level, tex) {
  const N = level.size;
  const cells = Uint8Array.from(atob(level.cells), c => c.charCodeAt(0));
  const at = (x, z) => (x < 0 || z < 0 || x >= N || z >= N ? 1 : cells[z * N + x]);
  const group = new THREE.Group();

  // пол
  const floorMat = new THREE.MeshLambertMaterial({ map: tex.floor.clone(), color: 0x9aa3aa });
  floorMat.map.repeat.set(N / 3, N / 3);
  floorMat.map.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N, N), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // потолок
  const ceilMat = new THREE.MeshLambertMaterial({ map: tex.metal.clone(), color: 0x6a737b });
  ceilMat.map.repeat.set(N / 4, N / 4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(N, N), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 3.2;
  group.add(ceil);

  // стены (инстансы)
  const wallCells = [];
  const crateCells = [];
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const v = cells[z * N + x];
      if (v === 0) continue;
      if (v === 2) { crateCells.push([x, z]); continue; }
      // рисуем только те блоки, что граничат с полом
      if (at(x + 1, z) === 0 || at(x - 1, z) === 0 || at(x, z + 1) === 0 || at(x, z - 1) === 0) wallCells.push([x, z]);
    }
  }
  const wallGeo = new THREE.BoxGeometry(1, 3.2, 1);
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.concrete, color: 0x8f979e });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  const m4 = new THREE.Matrix4();
  wallCells.forEach(([x, z], i) => {
    m4.makeTranslation(x + 0.5, 1.6, z + 0.5);
    walls.setMatrixAt(i, m4);
  });
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);

  // контейнеры
  const crateMat = new THREE.MeshLambertMaterial({ map: tex.crate, color: 0xb9a48c });
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 1.55, 0.98), crateMat, crateCells.length);
  crateCells.forEach(([x, z], i) => {
    m4.makeTranslation(x + 0.5, 0.775, z + 0.5);
    crates.setMatrixAt(i, m4);
  });
  crates.instanceMatrix.needsUpdate = true;
  group.add(crates);

  // аварийные лампы
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb454 });
  level.lamps.forEach((l, i) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lampMat);
    bulb.position.set(l.x, 2.75, l.z);
    group.add(bulb);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.3, 8, 1, true),
      new THREE.MeshLambertMaterial({ map: tex.metal, color: 0x525b62, side: THREE.DoubleSide })
    );
    shade.position.set(l.x, 2.92, l.z);
    group.add(shade);
    if (i < 7) {
      const light = new THREE.PointLight(0xffa542, 5.5, 11, 1.8);
      light.position.set(l.x, 2.5, l.z);
      group.add(light);
    }
  });

  // платформа эвакуации
  const padMat = new THREE.MeshBasicMaterial({ color: 0x2ad98a, transparent: true, opacity: 0.16 });
  const padRing = new THREE.Mesh(new THREE.RingGeometry(level.pad.r - 0.18, level.pad.r, 40), padMat);
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(level.pad.x, 0.03, level.pad.z);
  group.add(padRing);
  const padDisc = new THREE.Mesh(new THREE.CircleGeometry(level.pad.r - 0.2, 32), padMat);
  padDisc.rotation.x = -Math.PI / 2;
  padDisc.position.set(level.pad.x, 0.02, level.pad.z);
  group.add(padDisc);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x3effa8, transparent: true, opacity: 0.06, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(level.pad.r, level.pad.r, 3.1, 26, 1, true), beamMat);
  beam.position.set(level.pad.x, 1.55, level.pad.z);
  group.add(beam);

  // приёмник (пневмопочта наверх)
  const chute = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ map: tex.metal, color: 0x8b949b });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 1.2), frameMat);
  shell.position.y = 1.1;
  chute.add(shell);
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x06d0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, 1.15, 0.62);
  chute.add(hole);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.42), new THREE.MeshBasicMaterial({ map: tex.warning }));
  sign.position.set(0, 2.42, 0.61);
  chute.add(sign);
  chute.position.set(level.chute.x, 0, level.chute.z);
  group.add(chute);
  const chuteLight = new THREE.PointLight(0x39d0ff, 3.2, 8, 2);
  chuteLight.position.set(level.chute.x, 1.8, level.chute.z + 1);
  group.add(chuteLight);

  scene.add(group);
  return { group, padRing, padDisc, beam, chute, chuteLight, cells, N, at };
}

// ---------------- добыча ----------------
const matCache = new Map();
function itemMaterial(color) {
  const key = color;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color).multiplyScalar(0.12) }));
  }
  return matCache.get(key).clone();
}

export function buildItemMesh(item) {
  const g = new THREE.Group();
  const mat = itemMaterial(item.color);
  const w = item.w || 0.3, h = item.h || 0.5;
  let mesh;
  switch (item.shape) {
    case 'vase':
      mesh = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0.01, 0), new THREE.Vector2(w * 0.5, 0.05),
        new THREE.Vector2(w * 0.62, h * 0.4), new THREE.Vector2(w * 0.34, h * 0.78),
        new THREE.Vector2(w * 0.5, h), new THREE.Vector2(w * 0.42, h),
      ], 14), mat);
      break;
    case 'skull': {
      mesh = new THREE.Group();
      const s = new THREE.Mesh(new THREE.SphereGeometry(w * 0.62, 12, 10), mat);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.28, w * 0.6), mat);
      jaw.position.set(0, -h * 0.32, w * 0.16);
      mesh.add(s, jaw);
      break;
    }
    case 'statue': {
      mesh = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.6, 0.08, 12), mat);
      base.position.y = 0.04;
      const body = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, h * 0.9, 10), mat);
      body.position.y = h * 0.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(w * 0.2, 10, 8), mat);
      head.position.y = h * 0.98;
      mesh.add(base, body, head);
      break;
    }
    case 'lamp': {
      mesh = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h * 0.85, 8), mat);
      stand.position.y = h * 0.42;
      const shadeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(item.color), emissive: new THREE.Color(item.color).multiplyScalar(0.7) });
      const shade = new THREE.Mesh(new THREE.ConeGeometry(w * 0.55, h * 0.34, 12, 1, true), shadeMat);
      shade.position.y = h * 0.86;
      mesh.add(stand, shade);
      break;
    }
    case 'tv': {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.86, w * 0.72), mat);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.42),
        new THREE.MeshBasicMaterial({ color: 0x2b4a55 }));
      screen.position.z = w * 0.37;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.05, w * 0.5), mat);
      legs.position.y = -h * 0.46;
      mesh.add(body, screen, legs);
      break;
    }
    case 'crate':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, h), mat);
      break;
    case 'gem':
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(w * 0.8, 0), new THREE.MeshLambertMaterial({
        color: new THREE.Color(item.color), emissive: new THREE.Color(item.color).multiplyScalar(0.5), transparent: true, opacity: 0.9,
      }));
      break;
    case 'orb': {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.7, 14, 12), new THREE.MeshLambertMaterial({
        color: new THREE.Color(item.color), emissive: new THREE.Color(item.color).multiplyScalar(0.35),
      }));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.55, 0.12, 12), mat);
      base.position.y = -h * 0.45;
      const grp = new THREE.Group(); grp.add(mesh, base); mesh = grp;
      break;
    }
    case 'engine': {
      mesh = new THREE.Group();
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, w * 0.8), mat);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.14, w * 0.14, h * 0.9, 8), mat);
      cyl.position.y = h * 0.4;
      mesh.add(blk, cyl);
      break;
    }
    case 'painting': {
      mesh = new THREE.Group();
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), mat);
      const cv = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, h * 0.84),
        new THREE.MeshLambertMaterial({ color: 0x24323a, emissive: 0x0a1418 }));
      cv.position.z = 0.035;
      mesh.add(f, cv);
      break;
    }
    default:
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
  }
  mesh.traverse(o => { if (o.isMesh) { o.material = o.material || mat; } });
  g.add(mesh);
  g.userData.itemId = item.id;
  g.userData.baseEmissive = mat.emissive ? mat.emissive.clone() : null;
  return g;
}

export function buildAvatar(name, color) {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.86, 4, 10), suit);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c6 }));
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
    new THREE.MeshBasicMaterial({ color: 0xffb454 }));
  visor.position.y = 1.64;
  visor.rotation.x = Math.PI / 2.1;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  lamp.position.set(0, 1.68, -0.22);
  const lampLight = new THREE.PointLight(0xffd28a, 1.4, 6, 2);
  lampLight.position.set(0, 1.6, -0.4);
  g.add(body, head, visor, lamp, lampLight);
  g.userData.lampLight = lampLight;
  g.userData.lamp = lamp;

  // табличка с именем
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(6,10,14,.6)'; ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 30px monospace'; ctx.fillStyle = '#ffd28a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(1.1, 0.28, 1);
  sp.position.y = 2.05;
  g.add(sp);
  return g;
}

export function buildMonster() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.05, 4, 10), skin);
  body.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.16;
  head.scale.set(1, 0.9, 1.1);
  const limbMat = new THREE.MeshLambertMaterial({ color: 0x0d0f12 });
  const armGeo = new THREE.BoxGeometry(0.15, 1.5, 0.15);
  const armL = new THREE.Mesh(armGeo, limbMat); armL.position.set(-0.46, 1.1, 0);
  const armR = new THREE.Mesh(armGeo, limbMat); armR.position.set(0.46, 1.1, 0);
  const legGeo = new THREE.BoxGeometry(0.17, 1.0, 0.17);
  const legL = new THREE.Mesh(legGeo, limbMat); legL.position.set(-0.2, 0.5, 0);
  const legR = new THREE.Mesh(legGeo, limbMat); legR.position.set(0.2, 0.5, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2f2f });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeMat);
  eyeL.position.set(-0.11, 2.2, -0.28);
  eyeR.position.set(0.11, 2.2, -0.28);
  const glow = new THREE.PointLight(0xff2222, 1.4, 4.5, 2);
  glow.position.set(0, 2.2, -0.3);
  g.add(body, head, armL, armR, legL, legR, eyeL, eyeR, glow);
  g.userData = { armL, armR, legL, legR, glow, head };
  g.visible = false;
  return g;
}
