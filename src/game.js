import * as THREE from 'three';
import { STATIONS, ITEMS, WORLD_BOUNDS } from './shared.js';

const clamp = THREE.MathUtils.clamp;
const materials = {};
function mat(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  return materials[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...extra });
}
function box(parent, w, h, d, material, x = 0, y = 0, z = 0, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent, top, bottom, height, material, x = 0, y = 0, z = 0, segments = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function ball(parent, radius, material, x = 0, y = 0, z = 0, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.scale.set(...scale);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function canvasLabel(text, sub = '', accent = '#f8b647', width = 512, height = 150) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const radius = 17;
  ctx.fillStyle = 'rgba(16,32,30,.92)';
  ctx.beginPath(); ctx.roundRect(4, 4, width - 8, height - 8, radius); ctx.fill();
  ctx.strokeStyle = 'rgba(248,182,71,.65)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = accent; ctx.fillRect(23, 29, 6, height - 58);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff9e8';
  ctx.font = 'bold 45px Oswald, sans-serif';
  ctx.fillText(text, 48, sub ? 66 : 88, width - 70);
  if (sub) {
    ctx.fillStyle = '#d0d5c7';
    ctx.font = '500 25px Manrope, sans-serif';
    ctx.fillText(sub, 49, 107, width - 70);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false }));
  sprite.scale.set(1.85, .54, 1);
  return sprite;
}
function signPlane(text, sub, width, height, color = '#f4b648') {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 420;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#172c2b'; ctx.fillRect(0, 0, 1024, 420);
  ctx.strokeStyle = '#e8b65b'; ctx.lineWidth = 7; ctx.strokeRect(18, 18, 988, 384);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 132px Oswald, sans-serif';
  ctx.fillText(text, 512, 192);
  ctx.fillStyle = '#e8e4d1'; ctx.font = '600 54px Manrope, sans-serif'; ctx.fillText(sub, 512, 292);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas) }));
  return mesh;
}
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c3c6b6'; ctx.fillRect(0, 0, 256, 256);
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
    ctx.fillStyle = (x + z) % 2 ? '#4b5d58' : '#d3d0be';
    ctx.fillRect(x * 64 + 2, z * 64 + 2, 60, 60);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(x * 64 + 4, z * 64 + 4, 56, 2);
  }
  const texture = canvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 4);
  return texture;
}
function tileTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#aab3a9'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    ctx.fillStyle = y === 2 ? '#33776e' : ((x + y) % 2 ? '#e2e0d2' : '#d5d9cc');
    ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x * 64 + 5, y * 64 + 5, 52, 3);
  }
  const texture = canvasTexture(c); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 1.5);
  return texture;
}
function buildItem(type, scale = 1) {
  const group = new THREE.Group();
  const bun = mat('#df9c43'), bunTop = mat('#e7ab54'), patty = mat('#653b25'), green = mat('#73a344'), red = mat('#cf4938'), yellow = mat('#f3bf4e');
  if (type === 'bun' || type === 'burger' || type === 'cheeseburger') {
    cylinder(group, .25, .23, .13, bun, 0, .065, 0);
    if (type !== 'bun') {
      cylinder(group, .255, .255, .09, patty, 0, .16, 0);
      if (type === 'cheeseburger') box(group, .38, .035, .38, yellow, 0, .23, 0).rotation.y = .3;
      cylinder(group, .26, .25, .035, green, 0, type === 'cheeseburger' ? .27 : .22, 0, 12);
      cylinder(group, .20, .20, .035, red, 0, type === 'cheeseburger' ? .31 : .26, 0, 18);
      ball(group, .25, bunTop, 0, type === 'cheeseburger' ? .34 : .30, 0, [1, .48, 1]);
    } else ball(group, .25, bunTop, 0, .12, 0, [1, .5, 1]);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, r = .08 + (i % 3) * .055;
      const seed = box(group, .025, .009, .05, mat('#fff0b5'), Math.cos(a) * r, type === 'bun' ? .225 : (type === 'cheeseburger' ? .455 : .415), Math.sin(a) * r, false);
      seed.rotation.y = a;
    }
  } else if (type === 'patty' || type === 'patty_raw' || type === 'patty_burnt') {
    cylinder(group, .25, .25, .1, type === 'patty_raw' ? mat('#c1695d') : type === 'patty_burnt' ? mat('#272321') : patty, 0, .05, 0);
  } else if (type === 'fries' || type === 'fries_raw' || type === 'fries_burnt') {
    const paper = type === 'fries_raw' ? mat('#d8c495') : mat('#b54433');
    cylinder(group, .19, .14, .28, paper, 0, .14, 0, 5);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, r = .04 + (i % 3) * .047;
      const fry = box(group, .045, .28 + (i % 3) * .03, .045, type === 'fries_burnt' ? mat('#493827') : yellow, Math.cos(a) * r, .34, Math.sin(a) * r);
      fry.rotation.z = (i % 3 - 1) * .12;
    }
  } else if (type === 'soda' || type === 'coffee') {
    cylinder(group, .17, .125, .34, type === 'coffee' ? mat('#ede4d2') : mat('#d75841'), 0, .17, 0);
    cylinder(group, .175, .175, .025, mat('#f3ead8'), 0, .35, 0);
    if (type === 'soda') {
      const straw = cylinder(group, .018, .018, .25, mat('#e4dcc8'), .05, .46, 0, 8); straw.rotation.z = -.18;
    } else {
      cylinder(group, .13, .13, .01, mat('#573a2c'), 0, .367, 0);
    }
  } else if (type === 'cheese') {
    box(group, .42, .04, .42, yellow, 0, .03, 0).rotation.y = .2;
  } else if (type === 'lettuce') {
    ball(group, .24, green, 0, .08, 0, [1, .35, 1]);
  } else if (type === 'tomato') {
    cylinder(group, .23, .23, .06, red, 0, .04, 0);
  }
  group.scale.setScalar(scale);
  return group;
}
function disposeTree(object) {
  // Item meshes are replaced often; release their per-instance buffers without
  // disposing the shared material palette used elsewhere in the kitchen.
  object.traverse((node) => {
    node.geometry?.dispose();
    if (node.isSprite) { node.material.map?.dispose(); node.material.dispose(); }
  });
}
function clearGroup(group) {
  group.children.forEach(disposeTree);
  group.clear();
}
function createChef(color = '#e46643', customer = false) {
  const group = new THREE.Group();
  const outfit = mat(color); const dark = mat('#303b39'); const skin = mat(customer ? '#c98e6e' : '#d8a47f');
  box(group, .52, .65, .30, outfit, 0, 1.02, 0);
  box(group, .21, .65, .23, dark, -.14, .35, 0);
  box(group, .21, .65, .23, dark, .14, .35, 0);
  box(group, .15, .58, .17, outfit, -.34, 1.03, 0).rotation.z = -.12;
  box(group, .15, .58, .17, outfit, .34, 1.03, 0).rotation.z = .12;
  ball(group, .235, skin, 0, 1.56, 0, [1, 1.08, .92]);
  // Face points towards -Z, matching the camera's forward direction.
  ball(group, .025, mat('#242b29'), -.075, 1.59, -.211);
  ball(group, .025, mat('#242b29'), .075, 1.59, -.211);
  if (!customer) {
    cylinder(group, .24, .22, .13, mat('#f3eee0'), 0, 1.81, 0);
    ball(group, .24, mat('#f3eee0'), 0, 1.91, 0, [1.12, .65, 1]);
    box(group, .38, .40, .02, mat('#f0dfc7'), 0, .92, -.161);
  } else {
    ball(group, .24, mat('#3c3029'), 0, 1.72, .01, [1, .43, .95]);
  }
  return group;
}

export class KitchenGame {
  constructor(container, handlers) {
    this.container = container;
    this.handlers = handlers;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.position = new THREE.Vector3(0, 1.65, 1.65);
    this.remotePlayers = new Map();
    this.stationLabels = new Map();
    this.state = null; this.playerId = null; this.target = null;
    this.enabled = false; this.pointerWasLocked = false; this.shift = 0; this.lastMoveSent = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    // The kitchen is static: render its shadow map once instead of every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.17;
    this.renderer.domElement.setAttribute('aria-label', 'Трёхмерная кухня');
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#233b3b');
    this.scene.fog = new THREE.Fog('#233b3b', 16, 38);
    this.camera = new THREE.PerspectiveCamera(67, 1, .04, 60);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.buildWorld();
    this.held = new THREE.Group();
    this.camera.add(this.held);
    this.held.position.set(.39, -.39, -.72);
    this.currentHand = null;
    this.clock = new THREE.Clock();
    this.bindEvents();
    this.resize();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildWorld() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight('#e0f3e4', '#59625a', 1.55));
    const sun = new THREE.DirectionalLight('#ffe9c4', 1.4);
    sun.position.set(-4, 10, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
    sun.shadow.normalBias = .03; sun.shadow.bias = -.0001;
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 12), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: .85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallMaterial = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: .9 });
    box(scene, .2, 3.5, 12, wallMaterial, -7.5, 1.75, 0, false);
    box(scene, .2, 3.5, 12, wallMaterial, 7.5, 1.75, 0, false);
    box(scene, 15, 3.5, .2, wallMaterial, 0, 1.75, 5.95, false);
    box(scene, 15, 3.5, .2, mat('#263f3e'), 0, 1.75, -5.95, false);
    // Ceiling, beams, and warm industrial pendant lights.
    box(scene, 15, .16, 12, mat('#293934'), 0, 4.25, 0, false);
    for (let x = -6; x <= 6; x += 3) box(scene, .11, .14, 12, mat('#1c2928'), x, 4.12, 0, false);
    for (let z = -3.2; z < 4; z += 3.2) {
      for (const x of [-3, 3]) {
        cylinder(scene, .018, .018, .75, mat('#202b29'), x, 3.77, z, 8);
        cylinder(scene, .12, .36, .24, mat('#37544c', { metalness: .4 }), x, 3.36, z);
        ball(scene, .12, new THREE.MeshBasicMaterial({ color: '#ffe5a4' }), x, 3.23, z, [1, .65, 1]);
        const light = new THREE.PointLight('#ffd392', 16, 7.5, 2); light.position.set(x, 3.1, z); scene.add(light);
      }
    }
    // Window wall, with a small illustrated city beyond the serving counter.
    const windowMaterial = mat('#152d38', { metalness: .2, roughness: .4, emissive: '#10242d', emissiveIntensity: .25 });
    for (let i = -3; i <= 3; i++) {
      box(scene, 1.96, 2.35, .05, windowMaterial, i * 2.05, 2.3, -5.79, false);
      box(scene, .09, 2.5, .08, mat('#233535'), i * 2.05 - 1.02, 2.3, -5.73, false);
      for (let n = 0; n < 5; n++) {
        const wx = i * 2.05 - .70 + (n % 3) * .5;
        const wy = 1.65 + Math.floor(n / 3) * .65 + (Math.abs(i + n) % 2) * .2;
        box(scene, .13, .18, .01, new THREE.MeshBasicMaterial({ color: n % 2 ? '#c68d4f' : '#8fb7a3' }), wx, wy, -5.755, false);
      }
    }
    box(scene, 15, .16, .13, mat('#1a302e'), 0, 3.47, -5.68, false);
    box(scene, 15, .15, .15, mat('#1a302e'), 0, 1.22, -5.68, false);
    const sign = signPlane('BURGER SHIFT', 'FRESH FOOD  ·  GOOD MOOD', 3.7, 1.46);
    sign.position.set(0, 3.33, -5.59); scene.add(sign);
    // Back-of-house details.
    const backSign = signPlane('ПРИЯТНОЙ СМЕНЫ!', 'ЛУЧШАЯ КОМАНДА В ГОРОДЕ', 3.6, 1.2);
    backSign.rotation.y = Math.PI; backSign.position.set(-2.6, 3.0, 5.82); scene.add(backSign);
    box(scene, 1.1, 2.6, .10, mat('#30534d'), 4.9, 1.3, 5.8);
    box(scene, .84, 1.1, .04, mat('#87a8a0', { metalness: .1 }), 4.9, 1.7, 5.72);
    cylinder(scene, .04, .04, .09, mat('#d1bc8d', { metalness: .6 }), 5.27, 1.1, 5.64, 8).rotation.x = Math.PI / 2;
    // Hood over the hot line.
    box(scene, 1.45, .34, 3.8, mat('#87928b', { metalness: .75, roughness: .35 }), -6.3, 3.05, -.4);
    box(scene, .65, .75, 1.0, mat('#737f79', { metalness: .7, roughness: .4 }), -6.5, 3.58, -.4);
    // A few wall-mounted details, not blocking walkways.
    for (const z of [-3.5, -.3, 2.9]) {
      box(scene, .05, .06, 1.4, mat('#495b55', { metalness: .7 }), 7.32, 2.55, z);
      for (let i = 0; i < 3; i++) cylinder(scene, .075, .09, .3, mat(i === 0 ? '#ce6550' : i === 1 ? '#e2bb57' : '#f0e6d3'), 7.2, 2.73, z - .42 + i * .42, 10);
    }
    this.stationGroups = new Map();
    for (const station of STATIONS) this.makeStation(station);
    this.customers = [];
    for (let i = 0; i < 3; i++) {
      const customer = createChef(['#c99f6b', '#799fa1', '#ad7770'][i], true);
      customer.scale.setScalar(.87); customer.position.set((i - 1) * .8, .12, -5.20); customer.rotation.y = Math.PI;
      scene.add(customer); this.customers.push(customer);
    }
  }

  makeStation(station) {
    const group = new THREE.Group(); group.position.set(station.x, 0, station.z); this.scene.add(group);
    this.stationGroups.set(station.id, group);
    const steel = mat('#8d9d96', { metalness: .7, roughness: .36 });
    const steelDark = mat('#4a5e58', { metalness: .65, roughness: .42 });
    const top = mat('#bcc7b9', { metalness: .65, roughness: .3 });
    box(group, station.w, .86, station.d, steel, 0, .46, 0);
    box(group, station.w + .08, .09, station.d + .08, top, 0, .93, 0);
    // Cabinet seams and little handles on the side facing the cook.
    if (station.side === 'left' || station.side === 'right') {
      const frontX = station.side === 'left' ? station.w / 2 + .006 : -station.w / 2 - .006;
      box(group, .025, .53, station.d * .8, steelDark, frontX, .47, 0);
      box(group, .035, .035, .42, mat('#dce1d3', { metalness: .8 }), frontX * 1.01, .67, 0);
    } else {
      box(group, station.w * .8, .53, .025, steelDark, 0, .47, station.d / 2 + .006);
      box(group, .42, .035, .035, mat('#dce1d3', { metalness: .8 }), 0, .67, station.d / 2 + .025);
    }
    const label = canvasLabel(station.name, station.detail);
    label.position.set(0, station.id === 'serve' ? 2.23 : 2.17, 0);
    group.add(label); this.stationLabels.set(station.id, label);
    if (station.id === 'grill') {
      box(group, 1.35, .10, 1.24, steelDark, 0, 1.0, 0);
      box(group, 1.13, .035, 1.02, mat('#202926', { metalness: .3 }), 0, 1.07, 0);
      for (let z = -.42; z < .5; z += .18) box(group, 1.02, .014, .025, mat('#414a42', { metalness: .5 }), 0, 1.095, z, false);
      for (let i = 0; i < 3; i++) cylinder(group, .05, .05, .04, mat('#d7d3bb', { metalness: .6 }), .63, .65, -.45 + i * .44, 10).rotation.z = Math.PI / 2;
      this.grillFood = buildItem('patty', .85); this.grillFood.position.set(0, 1.10, 0); group.add(this.grillFood);
      this.grillFood.visible = false;
    } else if (station.id === 'fryer') {
      box(group, 1.4, .13, 1.22, steelDark, 0, 1.01, 0);
      box(group, 1.10, .04, .94, mat('#78693c', { metalness: .4, roughness: .28 }), 0, 1.09, 0);
      for (const x of [-.31, .31]) {
        box(group, .45, .12, .7, mat('#929e8f', { metalness: .65, wireframe: true }), x, 1.15, 0);
        box(group, .09, .05, .32, steelDark, x, 1.2, .51);
      }
      this.fryerFood = buildItem('fries', .65); this.fryerFood.position.set(0, 1.1, -.05); group.add(this.fryerFood); this.fryerFood.visible = false;
    } else if (station.id === 'raw') {
      box(group, 1.25, .20, 1.10, steelDark, 0, 1.06, 0);
      box(group, 1.10, .04, .95, mat('#b9c5b8'), 0, 1.18, 0);
      for (const [x, z] of [[-.3, -.25], [.3, -.25], [-.3, .25], [.3, .25]]) {
        const food = buildItem('patty_raw', .8); food.position.set(x, 1.21, z); group.add(food);
      }
    } else if (station.id === 'potato') {
      box(group, 1.30, .15, 1.12, mat('#8c694c'), 0, 1.04, 0);
      for (const [x, z] of [[-.35, -.25], [0, -.3], [.35, -.25], [-.2, .2], [.2, .2]]) ball(group, .23, mat('#bf965a'), x, 1.22, z, [1, .8, .7]);
      const fries = buildItem('fries_raw', .8); fries.position.set(.34, 1.18, .2); group.add(fries);
    } else if (station.id === 'bun') {
      box(group, 1.3, .09, 1.14, mat('#675b4a'), 0, 1.01, 0);
      for (const [x, z] of [[-.34, -.25], [.32, -.25], [-.34, .28], [.32, .28]]) {
        const food = buildItem('bun', .85); food.position.set(x, 1.07, z); group.add(food);
      }
    } else if (station.id === 'lettuce' || station.id === 'tomato' || station.id === 'cheese') {
      box(group, 1.28, .15, 1.1, steelDark, 0, 1.04, 0);
      box(group, 1.13, .05, .94, mat('#e2e2d1'), 0, 1.13, 0);
      for (const [x, z] of [[-.33, -.23], [.28, -.22], [-.33, .25], [.28, .25]]) {
        const food = buildItem(station.id, .8); food.position.set(x, 1.17, z); group.add(food);
      }
    } else if (station.id === 'prep') {
      box(group, 1.3, .07, .9, mat('#b58d61'), 0, 1.02, 0);
      box(group, 1.1, .02, .7, mat('#d7b889'), 0, 1.065, 0);
      this.prepFood = new THREE.Group(); this.prepFood.position.set(0, 1.08, 0); group.add(this.prepFood);
      box(group, .12, .28, .12, mat('#d4533d'), -.83, 1.15, -.35);
      box(group, .12, .28, .12, mat('#e6b84f'), -.65, 1.15, -.35);
    } else if (station.id === 'soda') {
      box(group, 1.05, .95, .70, mat('#bd5842'), 0, 1.46, -.12);
      box(group, .83, .34, .02, mat('#f0dfbd'), 0, 1.69, .24);
      box(group, .83, .25, .05, mat('#303b37'), 0, 1.27, .25);
      for (const x of [-.25, 0, .25]) {
        box(group, .08, .17, .1, mat('#cbd1c2'), x, 1.17, .27);
        box(group, .035, .13, .06, mat('#242c29'), x, 1.05, .30);
      }
      const cup = buildItem('soda', .6); cup.position.set(.62, .98, .38); group.add(cup);
    } else if (station.id === 'coffee') {
      box(group, 1.03, .88, .68, mat('#343c38', { metalness: .4 }), 0, 1.42, -.12);
      box(group, .81, .25, .04, mat('#acb9aa', { metalness: .6 }), 0, 1.69, .24);
      box(group, .68, .28, .04, mat('#1e2927'), 0, 1.28, .24);
      cylinder(group, .05, .05, .1, mat('#d2d8ca', { metalness: .7 }), 0, 1.17, .29);
      const cup = buildItem('coffee', .67); cup.position.set(.03, .98, .37); group.add(cup);
      for (const x of [-.3, 0, .3]) ball(group, .025, mat('#d8ad59', { emissive: '#a46922', emissiveIntensity: .7 }), x, 1.71, .27);
    } else if (station.id === 'serve') {
      box(group, 1.65, .025, .7, mat('#e7ded0'), 0, .99, 0);
      for (const x of [-.72, .72]) cylinder(group, .035, .035, .9, steel, x, 1.46, -.43, 8);
      box(group, 1.55, .07, .3, mat('#c7cabc', { metalness: .5 }), 0, 1.92, -.43);
      ball(group, .12, mat('#efb34e', { emissive: '#f1aa31', emissiveIntensity: .8 }), 0, 1.86, -.39, [1, .45, 1]);
      cylinder(group, .10, .13, .08, mat('#e0c279', { metalness: .7 }), -.80, 1.04, .27);
      ball(group, .10, mat('#e0c279', { metalness: .7 }), -.80, 1.09, .27, [1, .5, 1]);
    }
  }

  bindEvents() {
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('mousemove', (event) => {
      if (!this.enabled || document.pointerLockElement !== this.renderer.domElement) return;
      // Some browsers report their pointer-lock recentering as a huge first movement.
      if (this.ignoreNextMouseMove) { this.ignoreNextMouseMove = false; return; }
      if (performance.now() < this.ignoreMouseUntil) return;
      this.yaw -= clamp(event.movementX, -100, 100) * .0023;
      this.pitch = clamp(this.pitch - clamp(event.movementY, -100, 100) * .002, -1.2, 1.2);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (locked) { this.pointerWasLocked = true; this.ignoreNextMouseMove = true; }
      else if (this.pointerWasLocked && this.enabled) {
        this.pointerWasLocked = false; this.enabled = false; this.keys.clear();
        this.handlers.onPause?.();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (!this.enabled || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        this.keys.add(event.code); event.preventDefault();
      }
      if (event.repeat) return;
      if (event.code === 'KeyE' && this.target) this.handlers.onInteract?.(this.target.id);
      if (event.code === 'KeyQ') this.handlers.onDiscard?.();
      if (event.code === 'KeyH' || event.code === 'Tab') { event.preventDefault(); this.pause(); this.handlers.onHelp?.(); }
      if (event.code === 'Enter') { event.preventDefault(); this.pause(); this.handlers.onChat?.(); }
      if (event.code === 'Escape' && document.pointerLockElement !== this.renderer.domElement) { this.pause(); this.handlers.onPause?.(); }
    });
    document.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.renderer.domElement.addEventListener('mousedown', (event) => {
      if (this.enabled && event.button === 0 && this.target) this.handlers.onInteract?.(this.target.id);
    });
    let lastTouch = null;
    this.renderer.domElement.addEventListener('touchstart', (event) => {
      if (!this.enabled || !event.touches.length) return;
      const touch = event.touches[0]; lastTouch = { x: touch.clientX, y: touch.clientY };
      event.preventDefault();
    }, { passive: false });
    this.renderer.domElement.addEventListener('touchmove', (event) => {
      if (!this.enabled || !lastTouch || !event.touches.length) return;
      const touch = event.touches[0];
      this.yaw -= (touch.clientX - lastTouch.x) * .006;
      this.pitch = clamp(this.pitch - (touch.clientY - lastTouch.y) * .004, -1.2, 1.2);
      lastTouch = { x: touch.clientX, y: touch.clientY }; event.preventDefault();
    }, { passive: false });
    this.renderer.domElement.addEventListener('touchend', () => { lastTouch = null; });
  }
  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  resume() {
    this.enabled = true; this.keys.clear(); this.clock.getDelta();
    // Pointer lock can warp the cursor on entry; don't turn the camera on that event.
    this.ignoreMouseUntil = performance.now() + 250;
    try {
      const result = this.renderer.domElement.requestPointerLock();
      if (result?.catch) result.catch(() => this.handlers.onPointerFallback?.());
    } catch { this.handlers.onPointerFallback?.(); }
  }
  pause() {
    this.enabled = false; this.keys.clear(); this.pointerWasLocked = false;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }
  setState(room, playerId) {
    this.state = room; this.playerId = playerId; this.serverOffset = room.serverTime - Date.now();
    const me = room.players.find((p) => p.id === playerId);
    if (room.phase === 'playing' && me && this.shift !== room.shift) {
      this.shift = room.shift;
      this.position.set(me.x, 1.65, me.z); this.yaw = 0; this.pitch = 0;
    }
    if (me && me.hand !== this.currentHand) {
      this.currentHand = me.hand;
      clearGroup(this.held);
      if (me.hand) {
        const sleeve = box(this.held, .17, .17, .49, mat(me.color), .13, -.10, .2); sleeve.rotation.x = -.27;
        ball(this.held, .10, mat('#d8a47f'), .08, -.08, -.03, [1, .85, 1]);
        const food = buildItem(me.hand, .66); food.position.set(.04, -.09, -.10); this.held.add(food);
      }
    }
    this.syncPlayers(room.players);
    this.syncPrep(room.stations.prep || []);
    for (let i = 0; i < this.customers.length; i++) this.customers[i].visible = i < room.orders.length;
  }
  syncPlayers(players) {
    const other = players.filter((player) => player.id !== this.playerId);
    for (const [id, data] of this.remotePlayers) {
      if (!other.some((p) => p.id === id)) { disposeTree(data.group); this.scene.remove(data.group); this.remotePlayers.delete(id); }
    }
    for (const player of other) {
      if (!this.remotePlayers.has(player.id)) {
        const group = createChef(player.color);
        group.position.set(player.x, 0, player.z);
        const label = canvasLabel(player.name.toUpperCase(), 'ВАША КОМАНДА', '#f8b647');
        label.position.y = 2.27; label.scale.set(1.45, .42, 1); group.add(label);
        this.scene.add(group); this.remotePlayers.set(player.id, { group, hand: null, handModel: null, player });
      }
      const data = this.remotePlayers.get(player.id); data.player = player;
      if (data.hand !== player.hand) {
        if (data.handModel) { disposeTree(data.handModel); data.group.remove(data.handModel); }
        data.hand = player.hand; data.handModel = player.hand ? buildItem(player.hand, .5) : null;
        if (data.handModel) { data.handModel.position.set(.38, .85, -.22); data.group.add(data.handModel); }
      }
    }
  }
  syncPrep(ingredients) {
    const key = ingredients.join(',');
    if (key === this.prepKey) return;
    this.prepKey = key; clearGroup(this.prepFood);
    let y = 0;
    for (const ingredient of ingredients) {
      if (ingredient === 'bun') {
        cylinder(this.prepFood, .29, .27, .12, mat('#db9c4d'), 0, .06, 0); y = .12;
      } else if (ingredient === 'patty') {
        cylinder(this.prepFood, .28, .28, .10, mat('#653b25'), 0, y + .05, 0); y += .10;
      } else if (ingredient === 'cheese') {
        box(this.prepFood, .43, .04, .43, mat('#f3bf4e'), 0, y + .02, 0).rotation.y = .2; y += .04;
      } else if (ingredient === 'tomato') {
        cylinder(this.prepFood, .23, .23, .04, mat('#cf4938'), 0, y + .02, 0); y += .04;
      } else if (ingredient === 'lettuce') {
        cylinder(this.prepFood, .3, .28, .04, mat('#73a344'), 0, y + .02, 0); y += .04;
      }
    }
  }
  collision(x, z) {
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) return true;
    const radius = .24;
    return STATIONS.some((s) => Math.abs(x - s.x) < s.w / 2 + radius && Math.abs(z - s.z) < s.d / 2 + radius);
  }
  findTarget() {
    const forwardX = -Math.sin(this.yaw), forwardZ = -Math.cos(this.yaw);
    let best = null, bestScore = -Infinity;
    for (const station of STATIONS) {
      const dx = station.x - this.position.x, dz = station.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      const dot = (dx * forwardX + dz * forwardZ) / Math.max(distance, .001);
      if (distance > 2.6 || dot < .15) continue;
      const score = dot * 2 - distance * .35;
      if (score > bestScore) { best = station; bestScore = score; }
    }
    return best;
  }
  animate() {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), .12);
    if (this.container.getClientRects().length === 0) return;
    if (this.enabled && this.state?.phase === 'playing') {
      if (this.keys.has('ArrowLeft')) this.yaw += 1.8 * delta;
      if (this.keys.has('ArrowRight')) this.yaw -= 1.8 * delta;
      if (this.keys.has('ArrowUp')) this.pitch = clamp(this.pitch + delta, -1.2, 1.2);
      if (this.keys.has('ArrowDown')) this.pitch = clamp(this.pitch - delta, -1.2, 1.2);
      const fw = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const side = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      const length = Math.hypot(fw, side) || 1;
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 5.0 : 3.2) * delta / length;
      const dx = (-Math.sin(this.yaw) * fw + Math.cos(this.yaw) * side) * speed;
      const dz = (-Math.cos(this.yaw) * fw - Math.sin(this.yaw) * side) * speed;
      if (!this.collision(this.position.x + dx, this.position.z)) this.position.x += dx;
      if (!this.collision(this.position.x, this.position.z + dz)) this.position.z += dz;
      const now = performance.now();
      if (now - this.lastMoveSent > 85) {
        this.handlers.onMove?.({ x: this.position.x, z: this.position.z, yaw: this.yaw });
        this.lastMoveSent = now;
      }
      const target = this.findTarget();
      if (target?.id !== this.target?.id) { this.target = target; this.handlers.onTarget?.(target); }
    }
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    for (const [id, label] of this.stationLabels) {
      const station = STATIONS.find((s) => s.id === id);
      const distance = Math.hypot(station.x - this.position.x, station.z - this.position.z);
      label.material.opacity = distance < 5.5 ? (id === this.target?.id ? 1 : .78) : .35;
    }
    for (const { group, player } of this.remotePlayers.values()) {
      group.position.x += (player.x - group.position.x) * Math.min(1, delta * 10);
      group.position.z += (player.z - group.position.z) * Math.min(1, delta * 10);
      const diff = Math.atan2(Math.sin(player.yaw - group.rotation.y), Math.cos(player.yaw - group.rotation.y));
      group.rotation.y += diff * Math.min(1, delta * 10);
    }
    const stations = this.state?.stations;
    if (stations) {
      this.grillFood.visible = !!stations.grill; this.fryerFood.visible = !!stations.fryer;
      if (stations.grill) {
        const now = Date.now() + (this.serverOffset || 0);
        const cooked = now >= stations.grill.readyAt;
        const burnt = now >= stations.grill.burnAt;
        const mesh = this.grillFood.children[0]; if (mesh) mesh.material = burnt ? mat('#25211e') : cooked ? mat('#653b25') : mat('#c1695d');
      }
      if (stations.fryer) this.fryerFood.rotation.y += delta * .3;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
