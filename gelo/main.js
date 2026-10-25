// Página /gelo: blocos de gelo com objetos congelados, partículas na GPU e transições congeladas.
// Código original deste projeto (Three.js + GSAP + Lenis). Nenhum código ou asset de terceiros além das bibliotecas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import * as S from './shaders.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let mobile = innerWidth < 760;

/* Estados da página, na ordem da rolagem. "ice" = bloco de gelo, "dust" = partículas. */
const STATES = [
  { world: 'ice', name: 'Início', tint: '#3a55ff' },
  { world: 'ice', name: 'Curso de fotografia', tint: '#ff5a1f' },
  { world: 'ice', name: 'Clínica de fisioterapia', tint: '#2fd08a' },
  { world: 'ice', name: 'Painel de cozinha', tint: '#6b7cff' },
  { world: 'ice', name: 'Galeria de arte', tint: '#e0402f' },
  { world: 'dust', name: 'Manifesto', tint: '#4a63ff' },
  { world: 'dust', name: 'Contato', tint: '#8fb2ff' },
];
const N = STATES.length;

/* ---------- Texto: embaralhar e revelar linhas ---------- */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
function scramble(el, dur = .7) {
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  if (reduce) { el.textContent = final; return; }
  const start = performance.now();
  const tick = (now) => {
    const k = clamp((now - start) / (dur * 1000), 0, 1);
    const shown = Math.floor(final.length * k);
    let out = final.slice(0, shown);
    for (let i = shown; i < final.length; i++) out += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
$$('.panel .title').forEach((t) => {
  t.innerHTML = t.innerHTML.split(/<br\s*\/?>/i).map((l) => `<span class="ln"><span>${l.trim()}</span></span>`).join('');
});

/* ---------- Copiar e-mail ---------- */
$('#copy').addEventListener('click', () => {
  const btn = $('#copy'), mail = $('#mail').textContent.trim();
  const ok = () => { btn.textContent = 'Copiado'; setTimeout(() => (btn.textContent = 'Copiar e-mail'), 1800); };
  try { navigator.clipboard.writeText(mail).then(ok, () => {}); } catch (e) { /* sem clipboard */ }
});

/* ---------- WebGL ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  $('#loader')?.remove();
  throw e;
}
const PR = Math.min(devicePixelRatio, mobile ? 1.5 : 1.75);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .1, 60);
camera.position.set(0, 0, 10);
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), .04).texture;

function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: S.backdropVert, fragmentShader: S.backdropFrag, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uGlow: { value: new THREE.Vector2() }, uTint: { value: new THREE.Color() }, uBars: { value: .35 } },
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), mat);
  m.position.z = -7;
  return m;
}

/* ---------- Texturas procedurais do gelo ---------- */
// Rachaduras: linhas desenhadas num canvas viram um mapa de altura, e o mapa de altura vira normal map.
function crackNormalMap(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * .05})`; const r = rnd() * 40 + 4; g.beginPath(); g.arc(rnd() * size, rnd() * size, r, 0, 7); g.fill(); }
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    let x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${.25 + rnd() * .5})`;
    g.lineWidth = .6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, y);
    const steps = 4 + (rnd() * 10) | 0;
    for (let s = 0; s < steps; s++) { a += (rnd() - .5) * 1.1; x += Math.cos(a) * 26; y += Math.sin(a) * 26; g.lineTo(x, y); }
    g.stroke();
  }
  const src = g.getImageData(0, 0, size, size).data;
  const out = g.createImageData(size, size);
  const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    out.data[o] = (-dx / l * .5 + .5) * 255; out.data[o + 1] = (dy / l * .5 + .5) * 255; out.data[o + 2] = (1 / l * .5 + .5) * 255; out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Gelo que derrete onde o cursor passa: um canvas de rugosidade (branco = fosco) e um de brilho.
const FROST = 256;
const frostC = document.createElement('canvas'); frostC.width = frostC.height = FROST;
const glowC = document.createElement('canvas'); glowC.width = glowC.height = FROST;
const fg = frostC.getContext('2d'), gg = glowC.getContext('2d');
fg.fillStyle = '#fff'; fg.fillRect(0, 0, FROST, FROST);
gg.fillStyle = '#000'; gg.fillRect(0, 0, FROST, FROST);
const frostTex = new THREE.CanvasTexture(frostC);
const glowTex = new THREE.CanvasTexture(glowC);
glowTex.colorSpace = THREE.SRGBColorSpace;
function paintFrost(u, v, strength = 1) {
  const x = u * FROST, y = (1 - v) * FROST, r = FROST * .16;
  let grd = fg.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(36,36,36,${.5 * strength})`); grd.addColorStop(1, 'rgba(36,36,36,0)');
  fg.fillStyle = grd; fg.fillRect(x - r, y - r, r * 2, r * 2);
  grd = gg.createRadialGradient(x, y, r * .55, x, y, r);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(.6, `rgba(120,160,255,${.22 * strength})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
  gg.fillStyle = grd; gg.fillRect(x - r, y - r, r * 2, r * 2);
}
function regrowFrost(dt) {
  fg.fillStyle = `rgba(255,255,255,${Math.min(dt * .45, 1)})`; fg.fillRect(0, 0, FROST, FROST);
  gg.fillStyle = `rgba(0,0,0,${Math.min(dt * 1.2, 1)})`; gg.fillRect(0, 0, FROST, FROST);
  frostTex.needsUpdate = glowTex.needsUpdate = true;
}

const iceMat = new THREE.MeshPhysicalMaterial({
  color: 0xe4eeff, metalness: 0, roughness: .42, roughnessMap: frostTex,
  transmission: 1, thickness: 1.8, ior: 1.31, dispersion: 3,
  attenuationColor: new THREE.Color(0x9cc0ff), attenuationDistance: 4,
  normalMap: crackNormalMap(), normalScale: new THREE.Vector2(.4, .4),
  clearcoat: 1, clearcoatRoughness: .2, emissive: 0xffffff, emissiveMap: glowTex, emissiveIntensity: 1.4,
  envMapIntensity: 1.3, specularIntensity: 1,
});

/* ---------- Mundo do gelo ---------- */
const ice = new THREE.Scene();
ice.environment = envMap;
const iceBack = makeBackdrop();
ice.add(iceBack);
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); ice.add(key);
ice.add(new THREE.HemisphereLight(0xbcd2ff, 0x0a0f22, .6));

const inner = (color, rough = .32) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: .15, emissive: color, emissiveIntensity: .35 });
const blocks = []; // um grupo por estado de gelo: { group, ice, inside, label }
function addBlock(w, h, d, insideObj) {
  const group = new THREE.Group();
  const iceMesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, .16), iceMat);
  group.add(iceMesh);
  if (insideObj) group.add(insideObj);
  ice.add(group);
  blocks.push({ group, ice: iceMesh, inside: insideObj, label: null });
}
// 0 · Início: o "KR" em 3D entra quando a fonte carregar; até lá, um cristal
const heroSeed = new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 0), inner(0x3a55ff));
addBlock(2.5, 2.5, 2.5, heroSeed);
// 1 · Fotografia: uma lente
{
  const g = new THREE.Group(); const m = inner(0xff5a1f), dark = inner(0x2a0d00, .5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.55, .62, .9, 48), dark); body.rotation.x = Math.PI / 2; g.add(body);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.6 + i * .03, .05, 16, 64), m); r.position.z = -.3 + i * .3; g.add(r); }
  const glass = new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), inner(0x111a40, .05)); glass.rotation.x = Math.PI / 2; glass.position.z = .42; g.add(glass);
  g.rotation.set(.3, -.5, 0);
  addBlock(2.1, 2.7, 1.8, g);
}
// 2 · Fisioterapia: um nó contínuo, movimento
addBlock(2.0, 2.8, 1.7, new THREE.Mesh(new THREE.TorusKnotGeometry(.48, .14, 180, 24, 2, 3), inner(0x2fd08a)));
// 3 · Painel de cozinha: telas empilhadas
{
  const g = new THREE.Group();
  [0x6b7cff, 0xdfe7ff, 0x3a46c8].forEach((c, i) => {
    const t = new THREE.Mesh(new RoundedBoxGeometry(1.1, .72, .06, 3, .04), inner(c, .25));
    t.position.set((i - 1) * .14, (i - 1) * -.22, (i - 1) * .32); t.rotation.set(-.25, .35, .05); g.add(t);
  });
  addBlock(2.2, 2.6, 1.9, g);
}
// 4 · Galeria: uma escultura facetada
{
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(.62, 0), new THREE.MeshStandardMaterial({ color: 0xe0402f, roughness: .25, metalness: .3, flatShading: true, emissive: 0xe0402f, emissiveIntensity: .25 }));
  m.scale.set(.8, 1.35, .8);
  addBlock(2.0, 2.9, 1.8, m);
}

// Estilhaços de gelo flutuando em volta do bloco
const SHARDS = mobile ? 40 : 80;
const shardMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshPhysicalMaterial({ color: 0x8fa6d6, roughness: .08, metalness: .1, flatShading: true, clearcoat: 1, envMapIntensity: .9, transparent: true, opacity: .85 }), SHARDS);
const shardData = Array.from({ length: SHARDS }, (_, i) => ({
  r: 2.2 + Math.random() * 3.2, a: Math.random() * Math.PI * 2, y: (Math.random() - .5) * 4.2, s: .02 + Math.random() ** 3 * .1,
  sp: (.05 + Math.random() * .12) * (i % 2 ? 1 : -1), rot: Math.random() * 6,
}));
ice.add(shardMesh);
const dummy = new THREE.Object3D();

// Texto 3D: "KR" congelado no bloco de abertura e números dos projetos
let font = null;
const fontReady = new FontLoader().loadAsync('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_bold.typeface.json').then((f) => {
  font = f;
  const kr = new TextGeometry('KR', { font, size: .78, depth: .32, curveSegments: 6, bevelEnabled: true, bevelThickness: .03, bevelSize: .02, bevelSegments: 3 });
  kr.center();
  const krMesh = new THREE.Mesh(kr, new THREE.MeshStandardMaterial({ color: 0x3a55ff, roughness: .2, metalness: .2, emissive: 0x2238ff, emissiveIntensity: .6 }));
  const b0 = blocks[0]; b0.group.remove(heroSeed); b0.group.add(krMesh); b0.inside = krMesh;
  const numMat = new THREE.MeshStandardMaterial({ color: 0xe6eeff, roughness: .3, emissive: 0xe6eeff, emissiveIntensity: .25 });
  blocks.forEach((b, i) => {
    if (!i) return;
    const g = new TextGeometry(String(i).padStart(2, '0'), { font, size: .34, depth: .05, curveSegments: 4 });
    g.computeBoundingBox();
    const label = new THREE.Mesh(g, numMat);
    label.position.set(-1.65, -1.55, .9);
    b.group.add(label); b.label = label;
  });
}).catch(() => { /* sem fonte: fica o cristal */ });

/* ---------- Mundo das partículas (GPGPU) ---------- */
const dust = new THREE.Scene();
const dustBack = makeBackdrop();
dust.add(dustBack);
const dustGroup = new THREE.Group();
dust.add(dustGroup);
const SIZE = mobile ? 128 : 256, COUNT = SIZE * SIZE;
const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
let sim = null;

function shapeTexture(fill) {
  const data = new Float32Array(COUNT * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) { fill(v, i); data.set([v.x, v.y, v.z, Math.random()], i * 4); }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}
function textPoints(str, font, w = 512, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
  g.fillText(str, w / 2, h / 2 + h * .04);
  const d = g.getImageData(0, 0, w, h).data, pts = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 140) pts.push([x / w - .5, .5 - y / h]);
  return pts;
}
const shapes = {};
{
  // nuvem solta (antes de entrar no mundo das partículas)
  shapes.cloud = shapeTexture((v) => v.randomDirection().multiplyScalar(3 + Math.random() * 6).setZ(v.z - 2));
  // manifesto: um planeta de gelo, esfera com relevo e um anel
  const sp = new THREE.Vector3();
  shapes.planet = shapeTexture((v, i) => {
    if (i % 5 === 0) { const a = Math.random() * Math.PI * 2, r = 2.25 + Math.random() ** 2 * .9; v.set(Math.cos(a) * r, (Math.random() - .5) * .05, Math.sin(a) * r).applyAxisAngle(sp.set(1, 0, .3).normalize(), .45); return; }
    v.randomDirection();
    const bump = Math.sin(v.x * 6.1 + v.y * 2.3) * Math.cos(v.z * 5.3 - v.y * 4.1) * .08 + Math.sin(v.y * 13.) * .03;
    v.multiplyScalar(1.45 + bump + (Math.random() < .08 ? Math.random() * .25 : 0));
  });
  // contato: o símbolo @
  const at = textPoints('@', '700 420px Archivo, Arial Black, Arial, sans-serif');
  shapes.at = shapeTexture((v) => { const p = at.length ? at[(Math.random() * at.length) | 0] : [0, 0]; v.set(p[0] * 4.6, p[1] * 4.6, (Math.random() - .5) * .35); });
}
{
  const pos = gpu.createTexture(), vel = gpu.createTexture();
  pos.image.data.set(shapes.cloud.image.data);
  const posVar = gpu.addVariable('texturePosition', S.positionSim, pos);
  const velVar = gpu.addVariable('textureVelocity', S.velocitySim, vel);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  Object.assign(velVar.material.uniforms, {
    tA: { value: shapes.cloud }, tB: { value: shapes.planet }, uMix: { value: 0 }, uTime: { value: 0 }, uDt: { value: .016 },
    uChaos: { value: 0 }, uMouse: { value: new THREE.Vector3(99, 99, 99) }, uMouseOn: { value: 0 },
  });
  posVar.material.uniforms.uDt = { value: .016 };
  const err = gpu.init();
  if (!err) sim = { posVar, velVar };
}
const dustUniforms = {
  tPos: { value: null }, tVel: { value: null }, uSize: { value: mobile ? 12 : 14 }, uPR: { value: PR }, uFocus: { value: 10 },
  uIce: { value: new THREE.Color(0xe6eeff) }, uTint: { value: new THREE.Color(0x4a63ff) }, uAlpha: { value: 1 },
};
if (sim) {
  const ref = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) { ref[i * 2] = (i % SIZE + .5) / SIZE; ref[i * 2 + 1] = (Math.floor(i / SIZE) + .5) / SIZE; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: S.dustVert, fragmentShader: S.dustFrag, uniforms: dustUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  dustGroup.add(points);
}

/* ---------- Pós-processo ---------- */
const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
const rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts), rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
const post = new THREE.ShaderMaterial({
  vertexShader: S.postVert, fragmentShader: S.postFrag, depthTest: false, depthWrite: false,
  uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, uT: { value: 0 }, uTime: { value: 0 }, uVel: { value: 0 }, uAspect: { value: 1 }, uRes: { value: new THREE.Vector2() }, uIntro: { value: 1 } },
});
const postScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
quad.frustumCulled = false;
postScene.add(quad);

/* ---------- Layout ---------- */
let W = innerWidth, H = innerHeight;
const layout = { iceX: 0, iceY: 0, scale: 1 };
function resize() {
  W = innerWidth; H = innerHeight; mobile = W < 760;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  rtA.setSize(W * PR, H * PR); rtB.setSize(W * PR, H * PR);
  post.uniforms.uAspect.value = W / H;
  post.uniforms.uRes.value.set(W * PR, H * PR);
  const halfW = Math.tan(THREE.MathUtils.degToRad(16)) * 10 * camera.aspect;
  layout.scale = mobile ? .78 : clamp(W / 1400, .82, 1.05);
  layout.side = mobile ? 0 : Math.min(halfW * .42, 2.6);
  layout.lift = mobile ? .95 : .15;
}
resize();
addEventListener('resize', resize);
// onde o bloco fica em cada estado: no início à direita do título, nos trabalhos à esquerda do texto
const blockX = (s) => (s === 0 ? layout.side : -layout.side);

/* ---------- Entrada do usuário ---------- */
const pointer = new THREE.Vector2(9, 9), look = new THREE.Vector2();
let pointerIn = false;
addEventListener('pointermove', (e) => {
  pointer.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); pointerIn = true;
});
document.addEventListener('pointerleave', () => { pointerIn = false; });
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();

/* ---------- Rolagem ---------- */
let P = 0, vel = 0, active = -1;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const readScroll = () => { P = clamp(scrollY / maxScroll(), 0, 1) * (N - 1); };
let lenis = null;
if (window.Lenis && !reduce) {
  lenis = new Lenis({ lerp: .075, smoothWheel: true, wheelMultiplier: .8 });
  lenis.on('scroll', (e) => { vel = Math.abs(e.velocity || 0) / 30; window.ScrollTrigger?.update(); });
  if (window.gsap) { gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  else { const r = (t) => { lenis.raf(t); requestAnimationFrame(r); }; requestAnimationFrame(r); }
}
const goTo = (s) => { const y = s / (N - 1) * maxScroll(); lenis ? lenis.scrollTo(y, { duration: 2.2 }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); };
$$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goTo(+a.dataset.go); }));
// abriu com âncora (#s3 etc.): pula direto para o estado
const fromHash = /^#s(\d)$/.exec(location.hash);

/* ---------- Painéis HTML ---------- */
const panels = $$('.panel');
function showPanel(s) {
  if (s === active) return;
  const prev = panels[active];
  active = s;
  if (prev) {
    prev.classList.remove('on');
    if (window.gsap) gsap.killTweensOf(prev.querySelectorAll('*'));
  }
  const p = panels[s]; if (!p) return;
  p.classList.add('on');
  $$('[data-scramble]', p).forEach((el) => scramble(el));
  if (window.gsap && !reduce) {
    gsap.fromTo($$('.ln > span', p), { yPercent: 110 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: .07 });
    gsap.fromTo($$('.lede, .tag, .mail, .links, .cue', p), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', stagger: .06, delay: .15 });
  }
  $('#hudIdx').textContent = String(s).padStart(2, '0');
  $('#hudName').textContent = STATES[s].name;
  $$('.hud-top nav a').forEach((a) => {
    const g = +a.dataset.go; a.classList.toggle('on', g === s || (g === 1 && s >= 1 && s <= 4));
  });
}

/* ---------- Render ---------- */
const tintA = new THREE.Color(), tintB = new THREE.Color();
const tints = STATES.map((s) => new THREE.Color(s.tint));
let time = 0, intro = { v: reduce ? 0 : 1 }, entered = false;

function poseBlock(s, local) {
  const b = blocks[s];
  blocks.forEach((o, k) => (o.group.visible = k === s));
  const g = b.group;
  const x = blockX(s), y = layout.lift + Math.sin(time * .6 + s) * .06;
  g.position.set(x, y - local * .5, 0);
  g.scale.setScalar(layout.scale * (s === 0 ? 1 - intro.v * .35 : 1));
  g.rotation.set(.18 + Math.sin(time * .4 + s) * .05 + look.y * -.15, -.35 + time * .06 + local * 1.1 + look.x * .3 + (s === 0 ? intro.v * 1.2 : 0), Math.sin(time * .3) * .03);
  if (b.inside) { b.inside.rotation.y += .004; }
  if (b.label) b.label.position.x = mobile ? -1.15 : -1.65;
  iceBack.material.uniforms.uGlow.value.set(x * 1.6, y);
  iceBack.material.uniforms.uTint.value.copy(tints[s]).multiplyScalar(.55);
  // estilhaços orbitando o bloco
  for (let i = 0; i < SHARDS; i++) {
    const d = shardData[i], a = d.a + time * d.sp + local * .8;
    dummy.position.set(x + Math.cos(a) * d.r * layout.scale, y + d.y * layout.scale + Math.sin(time * .5 + i) * .1, Math.sin(a) * d.r * .7 - 1);
    dummy.rotation.set(d.rot + time * .3, d.rot * 2 + time * .2, 0);
    dummy.scale.setScalar(d.s * layout.scale);
    dummy.updateMatrix(); shardMesh.setMatrixAt(i, dummy.matrix);
  }
  shardMesh.instanceMatrix.needsUpdate = true;
}
function renderState(s, local, target) {
  renderer.setRenderTarget(target);
  if (STATES[s].world === 'ice') { poseBlock(s, local); renderer.render(ice, camera); }
  else renderer.render(dust, camera);
}

const clock = new THREE.Clock();
// ?debug=N roda N passos extras da simulação por quadro (para testes em máquinas lentas)
const debugSteps = +(new URLSearchParams(location.search).get('debug') || 0);
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += reduce ? dt * .2 : dt;
  readScroll();
  vel *= .92;
  look.lerp(pointerIn ? pointer : new THREE.Vector2(), .05);
  camera.position.set(look.x * .35, look.y * .25, 10);
  camera.lookAt(0, 0, 0);

  const i = Math.min(Math.floor(P), N - 2), f = P - i;
  const t = smooth(.45, 1, f);
  const now = t < .5 ? i : i + 1;
  if (entered) showPanel(now);

  // progresso no HUD
  const prog = P / (N - 1);
  $('#hudBar').style.transform = `scaleX(${prog})`;
  $('#hudPct').textContent = String(Math.round(prog * 100)).padStart(3, '0') + '%';

  // gelo que derrete sob o cursor (só no bloco visível)
  regrowFrost(dt);
  if (pointerIn && STATES[now].world === 'ice') {
    ray.setFromCamera(pointer, camera);
    poseBlock(now, now === i ? f : f - 1);
    const h = ray.intersectObject(blocks[now].ice, false)[0];
    if (h && h.uv) paintFrost(h.uv.x, h.uv.y, 1);
  }

  // partículas: alvo de forma conforme a rolagem
  const dustOn = P > 3.6;
  if (sim && dustOn) {
    const u = sim.velVar.material.uniforms;
    if (P < 5) { u.tA.value = shapes.cloud; u.tB.value = shapes.planet; u.uMix.value = P < 4 ? 0 : t; }
    else { u.tA.value = shapes.planet; u.tB.value = shapes.at; u.uMix.value = t; }
    u.uTime.value = time;
    u.uDt.value = dt; sim.posVar.material.uniforms.uDt.value = dt;
    u.uChaos.value = Math.min(vel, 2) * .5 + (1 - Math.abs(2 * t - 1)) * (P > 4 ? .6 : 0);
    // cursor projetado no plano z=0 do grupo
    ray.setFromCamera(pointer, camera);
    if (pointerIn && ray.ray.intersectPlane(plane, hit)) { dustGroup.worldToLocal(u.uMouse.value.copy(hit)); u.uMouseOn.value = 1; }
    else u.uMouseOn.value = 0;
    gpu.compute();
    for (let x = 0; x < debugSteps; x++) gpu.compute();
    dustUniforms.tPos.value = gpu.getCurrentRenderTarget(sim.posVar).texture;
    dustUniforms.tVel.value = gpu.getCurrentRenderTarget(sim.velVar).texture;
  }
  // grupo das partículas: à direita no manifesto, centralizado e mais alto no contato
  const k = P < 5 ? 0 : t;
  dustGroup.position.set(THREE.MathUtils.lerp(mobile ? 0 : layout.side, 0, k), THREE.MathUtils.lerp(mobile ? 1.1 : 0, mobile ? 1.5 : 1.35, k), 0);
  dustGroup.scale.setScalar(layout.scale * THREE.MathUtils.lerp(mobile ? .7 : 1, mobile ? .6 : .55, k));
  dustGroup.rotation.set(look.y * -.25 + .15, time * .12 * (1 - k) + look.x * .4, 0);
  dustUniforms.uTint.value.copy(tintA.copy(tints[5]).lerp(tintB.copy(tints[6]), k));
  dustBack.material.uniforms.uGlow.value.set(dustGroup.position.x * 1.6, dustGroup.position.y);
  dustBack.material.uniforms.uTint.value.copy(dustUniforms.uTint.value).multiplyScalar(.35);
  dustBack.material.uniforms.uBars.value = .25;
  iceBack.material.uniforms.uTime.value = dustBack.material.uniforms.uTime.value = time;

  // cenas e transição
  const sameDust = STATES[i].world === 'dust' && STATES[i + 1].world === 'dust';
  let T = t;
  if (sameDust || t <= .001) { renderState(i, f, rtA); T = 0; }
  else if (t >= .999) { renderState(i + 1, f - 1, rtA); T = 0; }
  else { renderState(i, f, rtA); renderState(i + 1, f - 1, rtB); }
  post.uniforms.uT.value = T;
  post.uniforms.uTime.value = time;
  post.uniforms.uVel.value = vel;
  post.uniforms.uIntro.value = intro.v;
  renderer.setRenderTarget(null);
  renderer.render(postScene, camera);
  requestAnimationFrame(frame);
}

/* ---------- Carregamento e entrada ---------- */
const loader = $('#loader'), enterBtn = $('#enter'), num = $('#loadNum');
if (lenis) lenis.stop();
document.documentElement.style.overflow = 'hidden';
const count = { v: 0 };
let ready = false;
const tickCount = () => {
  count.v += ((ready ? 100 : 86) - count.v) * .06;
  num.textContent = String(Math.round(count.v)).padStart(3, '0');
  if (ready && count.v > 99.4) { num.textContent = '100'; enterBtn.disabled = false; $('#loadMsg').textContent = 'pronto'; return; }
  requestAnimationFrame(tickCount);
};
tickCount();
Promise.race([Promise.all([fontReady, document.fonts?.ready]), new Promise((r) => setTimeout(r, 6000))]).then(() => {
  renderer.compile(ice, camera); renderer.compile(dust, camera);
  ready = true;
});
requestAnimationFrame(frame);

function enter() {
  if (entered) return;
  entered = true;
  document.documentElement.style.overflow = '';
  if (lenis) lenis.start();
  if (fromHash) { const s = +fromHash[1]; scrollTo(0, s / (N - 1) * maxScroll()); lenis?.scrollTo(s / (N - 1) * maxScroll(), { immediate: true }); }
  if (window.gsap && !reduce) {
    gsap.to(loader, { yPercent: -100, duration: 1.1, ease: 'expo.inOut', onComplete: () => loader.remove() });
    gsap.to(intro, { v: 0, duration: 2.4, ease: 'expo.out', delay: .35 });
  } else { loader.remove(); intro.v = 0; }
  // um rastro de derretimento inicial no bloco, para mostrar que o gelo reage
  for (let k = 0; k < 14; k++) setTimeout(() => paintFrost(.25 + k * .04, .5 + Math.sin(k * .6) * .12, .9), 500 + k * 45);
}
enterBtn.addEventListener('click', enter);
addEventListener('keydown', (e) => { if (!entered && ready && !enterBtn.disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } });
