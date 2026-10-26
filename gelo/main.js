// Página /gelo: três mundos em sequência na rolagem (iglu na montanha, anéis de gelo dos projetos, palco de partículas),
// ligados por transições no pós-processo. Código original deste projeto: Three.js + GSAP + Lenis, sem assets externos.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { crackNormal, veinTexture, smooth } from './textures.js';
import { createIglu } from './iglu.js';
import { createRing } from './ring.js';
import { createStage, SHAPES } from './stage.js';
import * as S from './shaders.js';
import { createSound } from './sound.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mobile = innerWidth < 760;
const params = new URLSearchParams(location.search);
const debugSteps = +(params.get('debug') || 0); // ?debug=N: passos extras da simulação (testes em máquina lenta)

/* Estados na ordem da rolagem */
const STATES = [
  { w: 'iglu', scn: 'Iglu', a: 'Kauê Ribeiro', b: 'Design e desenvolvimento web' },
  { w: 'ring', p: 0, scn: 'Anel 01', a: '01 · Curso de fotografia', b: 'Landing page · exemplo' },
  { w: 'ring', p: 1, scn: 'Anel 02', a: '02 · Clínica de fisioterapia', b: 'Site institucional · exemplo' },
  { w: 'ring', p: 2, scn: 'Anel 03', a: '03 · Painel de cozinha', b: 'Interface · exemplo' },
  { w: 'ring', p: 3, scn: 'Anel 04', a: '04 · Galeria de arte', b: 'Experiência 3D · exemplo' },
  { w: 'stage', scn: 'Palco', a: 'Contato', b: '' },
];
const N = STATES.length;
const FOG = new THREE.Color(0xc4cad5);

/* ---------- Texto do HUD: embaralhar ---------- */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
function scramble(el, text, dur = .6) {
  if (reduce) { el.textContent = text; return; }
  const start = performance.now(), id = (el._sid = (el._sid || 0) + 1);
  const tick = (now) => {
    if (el._sid !== id) return;
    const k = clamp((now - start) / (dur * 1000), 0, 1), shown = Math.floor(text.length * k);
    let out = text.slice(0, shown);
    for (let i = shown; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  $('#loader')?.remove();
  throw e;
}
const PR = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

/* ---------- Mundos ---------- */
const iglu = createIglu({ mobile });
const ring = createRing({ mobile, envMap, crack: crackNormal(512), vein: veinTexture(512) });
const stage = createStage({ renderer, mobile });
const sound = createSound();
iglu.onPop = () => sound.pop();
if (params.has('debug')) window.__gelo = { iglu, ring, stage, intro: null, sound };

/* ---------- Pós-processo ---------- */
const rtOpts = { type: THREE.HalfFloatType, samples: 4 };
const rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts), rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .55, 1.1);
const post = new THREE.ShaderMaterial({
  vertexShader: S.postVert, fragmentShader: S.postFrag, depthTest: false, depthWrite: false,
  uniforms: {
    tA: { value: rtA.texture }, tB: { value: rtB.texture }, uT: { value: 0 }, uKind: { value: 0 }, uTime: { value: 0 }, uVel: { value: 0 },
    uAspect: { value: 1 }, uIntro: { value: 1 }, uRes: { value: new THREE.Vector2() }, uFog: { value: FOG },
  },
});
const postScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
quad.frustumCulled = false;
postScene.add(quad);
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/* ---------- HUD desenhado (linhas entre blocos do iglu) ---------- */
const hud = $('#hud'), hg = hud.getContext('2d');

/* ---------- Tamanho ---------- */
let W = innerWidth, H = innerHeight;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  rtA.setSize(W * PR, H * PR); rtB.setSize(W * PR, H * PR);
  bloom.setSize(W * PR, H * PR);
  iglu.resize(W, H); ring.resize(W, H); stage.resize(W, H, PR);
  post.uniforms.uAspect.value = W / H;
  post.uniforms.uRes.value.set(W * PR, H * PR);
  hud.width = W * PR; hud.height = H * PR;
}
resize();
addEventListener('resize', resize);

/* ---------- Entrada ---------- */
const pointer = new THREE.Vector2(), look = new THREE.Vector2(), zero = new THREE.Vector2();
let pointerIn = false;
addEventListener('pointermove', (e) => { pointer.set(e.clientX / W * 2 - 1, -(e.clientY / H) * 2 + 1); pointerIn = true; });
document.addEventListener('pointerleave', () => { pointerIn = false; });

/* ---------- Rolagem ---------- */
let P = 0, vel = 0, active = -1, entered = false;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let lenis = null;
if (window.Lenis && !reduce) {
  lenis = new Lenis({ lerp: .07, smoothWheel: true, wheelMultiplier: .7 });
  lenis.on('scroll', (e) => { vel = Math.abs(e.velocity || 0) / 30; });
  if (window.gsap) { gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
  else { const r = (t) => { lenis.raf(t); requestAnimationFrame(r); }; requestAnimationFrame(r); }
}
const goTo = (s) => { const y = s / (N - 1) * maxScroll(); lenis ? lenis.scrollTo(y, { duration: 2.4 }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); };
$$('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); goTo(+a.dataset.go); }));

/* ---------- Painel do palco: formas e contato ---------- */
const shapeName = $('#shapeName');
let autoShape = true, shapeTimer = 0;
const setShape = (k) => { const prev = stage.shape; stage.setShape(k); if (prev >= 0) sound.chime(stage.shape); scramble(shapeName, `${String(stage.shape + 1).padStart(2, '0')} / ${String(SHAPES.length).padStart(2, '0')} · ${SHAPES[stage.shape]}`); shapeTimer = 0; };
$('#prev').addEventListener('click', () => { autoShape = false; setShape(stage.shape - 1); });
$('#next').addEventListener('click', () => { autoShape = false; setShape(stage.shape + 1); });
addEventListener('keydown', (e) => {
  if (active !== N - 1) return;
  if (e.key === 'ArrowLeft') { autoShape = false; setShape(stage.shape - 1); }
  if (e.key === 'ArrowRight') { autoShape = false; setShape(stage.shape + 1); }
});
$('#copy').addEventListener('click', () => {
  const btn = $('#copy'), mail = $('#mail').textContent.trim();
  try { navigator.clipboard.writeText(mail).then(() => { scramble(btn, 'Copiado'); setTimeout(() => scramble(btn, 'Copiar'), 1600); }, () => {}); } catch (e) { /* sem clipboard */ }
});

/* ---------- Troca de estado (HUD) ---------- */
function setActive(s) {
  if (s === active) return;
  const prevW = active >= 0 ? STATES[active].w : null;
  active = s;
  const st = STATES[s];
  if (prevW) sound.whoosh(prevW !== st.w);
  sound.setScene(st.w);
  scramble($('#labelA'), st.a);
  scramble($('#labelB'), st.b || ' ');
  scramble($('#dScene'), `SCN ${String(s).padStart(2, '0')} · ${st.scn}`);
  document.body.dataset.state = st.w;
  $$('[data-go]').forEach((a) => { const g = +a.dataset.go; a.classList.toggle('on', (g === 1 && st.w === 'ring') || (g === N - 1 && st.w === 'stage') || (g === 0 && st.w === 'iglu')); });
  if (st.w === 'stage' && stage.shape < 0) setShape(0);
}

/* ---------- Render ---------- */
let time = 0, frames = 0, fpsT = 0;
const intro = { v: 1 };
if (window.__gelo) window.__gelo.intro = intro;
function renderState(s, local, target, dt) {
  const st = STATES[s];
  renderer.setRenderTarget(target);
  if (st.w === 'iglu') renderer.render(iglu.scene, iglu.camera);
  else if (st.w === 'ring') { ring.pose(st.p, local, time, look, STATES[s + 1]?.w === 'stage'); renderer.render(ring.scene, ring.camera); }
  else { stage.pose(local, time, look); renderer.render(stage.scene, stage.camera); }
  bloom.render(renderer, null, target, dt, false);
}

let hudShown = true;
function drawHud() {
  hg.clearRect(0, 0, hud.width, hud.height);
  const a = (1 - smooth(.05, .35, P)) * smooth(.85, 1, iglu.build) * (1 - clamp(iglu.explode, 0, 1)) * (entered ? 1 : 0);
  if ((a >= .01) !== hudShown) { hudShown = a >= .01; hud.style.visibility = hudShown ? 'visible' : 'hidden'; }
  if (!hudShown) return;
  const pts = iglu.markers.filter((m) => m.z < 1).map((m) => ({ x: (m.x * .5 + .5) * hud.width, y: (-m.y * .5 + .5) * hud.height, n: m.n }));
  hg.globalAlpha = a;
  hg.strokeStyle = 'rgba(255,255,255,.75)'; hg.lineWidth = PR;
  hg.beginPath(); pts.forEach((p, i) => (i ? hg.lineTo(p.x, p.y) : hg.moveTo(p.x, p.y))); hg.stroke();
  hg.font = `${10 * PR}px "JetBrains Mono", monospace`;
  pts.forEach((p) => {
    hg.fillStyle = '#fff'; hg.fillRect(p.x - 2.5 * PR, p.y - 2.5 * PR, 5 * PR, 5 * PR);
    const label = String(p.n).padStart(2, '0'), w = hg.measureText(label).width + 8 * PR;
    hg.fillRect(p.x + 6 * PR, p.y - 16 * PR, w, 13 * PR);
    hg.fillStyle = '#1b2130'; hg.fillText(label, p.x + 10 * PR, p.y - 6 * PR);
  });
  hg.globalAlpha = 1;
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  time += reduce ? dt * .25 : dt;
  P = clamp(scrollY / maxScroll(), 0, 1) * (N - 1);
  vel *= .9;
  look.lerp(pointerIn ? pointer : zero, .05);

  const i = Math.min(Math.floor(P), N - 2), f = P - i;
  const t = smooth(.5, 1, f);
  if (entered) setActive(t < .5 ? i : i + 1);

  // HUD: progresso, relógio e fps
  frames++; fpsT += dt;
  if (fpsT > .5) { $('#dFps').textContent = `FPS ${String(Math.round(frames / fpsT)).padStart(2, '0')}`; frames = 0; fpsT = 0; $('#dClock').textContent = new Date().toLocaleTimeString('pt-BR'); }
  const prog = P / (N - 1);
  $('#pBar').style.transform = `scaleX(${prog})`;
  $('#pNum').textContent = String(Math.round(prog * 100)).padStart(3, '0');

  // atualiza os mundos que vão aparecer neste quadro
  if (P < 1) iglu.update(dt, time, i === 0 ? f : 1, pointer, pointerIn, look);
  if (P > 3.6) {
    stage.simulate(dt, time, pointer, pointerIn, debugSteps);
    if (active === N - 1 && autoShape && (shapeTimer += dt) > 7) setShape(stage.shape + 1);
  }

  // cenas e transição
  const kind = STATES[i].w === STATES[i + 1].w ? 0 : 1;
  let T = t;
  if (t <= .001) { renderState(i, f, rtA, dt); T = 0; }
  else if (t >= .999) { renderState(i + 1, f - 1, rtA, dt); T = 0; }
  else { renderState(i, f, rtA, dt); renderState(i + 1, f - 1, rtB, dt); }
  post.uniforms.uT.value = T;
  post.uniforms.uKind.value = kind;
  post.uniforms.uTime.value = time;
  post.uniforms.uVel.value = vel;
  post.uniforms.uIntro.value = intro.v;
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  drawHud();
  requestAnimationFrame(frame);
}

/* ---------- Carregamento e entrada ---------- */
const loader = $('#loader'), enterBtn = $('#enter'), num = $('#loadNum');
if (lenis) lenis.stop();
document.documentElement.style.overflow = 'hidden';
const count = { v: 0 };
let ready = false;
const tickCount = () => {
  count.v += ((ready ? 100 : 88) - count.v) * .05;
  num.textContent = String(Math.round(count.v)).padStart(3, '0');
  if (ready && count.v > 99.4) { num.textContent = '100'; enterBtn.disabled = false; scramble($('#loadMsg'), 'Pronto'); return; }
  requestAnimationFrame(tickCount);
};
tickCount();
requestAnimationFrame(frame);
Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 4000))]).then(() => {
  [iglu, ring, stage].forEach((w) => renderer.compile(w.scene, w.camera));
  ready = true;
});

function enter() {
  if (entered) return;
  entered = true;
  document.documentElement.style.overflow = '';
  if (lenis) lenis.start();
  const hash = /^#s(\d)$/.exec(location.hash);
  if (hash) { const y = +hash[1] / (N - 1) * maxScroll(); scrollTo(0, y); lenis?.scrollTo(y, { immediate: true }); }
  sound.enable(); updateSoundBtn(); sound.whoosh(true);
  if (window.gsap && !reduce) {
    // abertura: a névoa abre, a planta técnica do iglu aparece em linhas, os blocos caem no lugar e as linhas somem
    gsap.to(loader, { opacity: 0, duration: .8, ease: 'power2.out', onComplete: () => loader.remove() });
    gsap.timeline()
      .to(intro, { v: 0, duration: 2, ease: 'power2.out' }, 0)
      .to(iglu, { wireAlpha: 1, duration: .4 }, .2)
      .to(iglu, { wire: 1, duration: 1.6, ease: 'power2.inOut' }, .2)
      .to(iglu, { build: 1, duration: 3.2, ease: 'power2.out' }, 1)
      .to(iglu, { wireAlpha: 0, duration: 1.2, ease: 'power1.in' }, 3.4);
  } else { loader.remove(); intro.v = 0; iglu.build = 1; }
}
enterBtn.addEventListener('click', enter);
const sndBtn = $('#snd');
function updateSoundBtn() { sndBtn.classList.toggle('on', sound.on); sndBtn.setAttribute('aria-pressed', String(sound.on)); scramble(sndBtn, sound.on ? 'Som' : 'Mudo'); sndBtn.setAttribute('aria-label', sound.on ? 'Desligar som' : 'Ligar som'); }
sndBtn.addEventListener('click', () => { sound.toggle(); updateSoundBtn(); });
addEventListener('keydown', (e) => { if (!entered && !enterBtn.disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } });
