// Cena 2: um anel de gelo fosco feito de blocos, com uma membrana de luz rachada por dentro
// e um objeto congelado no centro (um por projeto). Tudo modelado em código.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { softDot, addRim, smooth } from './textures.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform float uGlowAmt;
varying vec3 vDir;
void main(){
  float y = vDir.y * .5 + .5;
  vec3 col = mix(uBottom, uTop, smoothstep(.2, .85, y));
  col += uGlow * pow(max(dot(vDir, vec3(0., .05, 1.)), 0.), 6.) * uGlowAmt;
  gl_FragColor = vec4(col, 1.);
}
`;
export function makeSky(top, bottom, glow = 0xffffff, amt = .35) {
  return new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) }, uGlow: { value: new THREE.Color(glow) }, uGlowAmt: { value: amt } },
  }));
}

// membrana: veios de luz que pulsam, mais fortes perto da borda do anel
const memVert = /* glsl */ `
varying vec2 vUv; varying vec2 vP;
void main(){ vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
`;
const memFrag = /* glsl */ `
uniform sampler2D tVein; uniform float uTime; uniform float uR; uniform float uAmt;
varying vec2 vUv; varying vec2 vP;
void main(){
  float r = length(vP) / uR;
  vec2 q = vP / uR * .55 + .5;
  float v1 = texture2D(tVein, q * 1.3 + vec2(uTime * .006, 0.)).r;
  float v2 = texture2D(tVein, q * 2.6 - vec2(0., uTime * .009)).r;
  float veins = max(v1, v2 * .7);
  float edge = smoothstep(.55, 1., r);
  float pulse = .75 + .25 * sin(uTime * 1.3 + r * 9.);
  float a = veins * (.06 + edge * .55) * pulse + smoothstep(.86, 1., r) * .3 + .02;
  a *= smoothstep(1.01, .97, r) * uAmt;
  gl_FragColor = vec4(vec3(.92, .96, 1.) * a, a);
}
`;

export function createRing({ mobile, envMap, crack, vein }) {
  const FOG = new THREE.Color(0xb9c0cc);
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.fog = new THREE.FogExp2(FOG, .018);
  scene.add(makeSky(0xc3cad5, 0x737c8d, 0xffffff, .45));
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 120);
  scene.add(new THREE.HemisphereLight(0xf0f4fb, 0x5d6677, .9));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(-4, 6, 8); scene.add(key);
  const back = new THREE.PointLight(0xe6efff, 25, 14, 1.4); back.position.set(0, 2.2, -1.2); scene.add(back);

  const group = new THREE.Group();
  scene.add(group);

  /* Anel: 10 blocos em setor de coroa, extrudados com chanfro arredondado */
  const SEGS = 10, RM = 2.72, HW = .58, span = Math.PI * 2 / SEGS - .05;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, RM + HW, -span / 2, span / 2, false);
  shape.absarc(0, 0, RM - HW, span / 2, -span / 2, true);
  const segGeo = new THREE.ExtrudeGeometry(shape, { depth: .62, bevelEnabled: true, bevelThickness: .2, bevelSize: .16, bevelSegments: 6, curveSegments: 24 });
  segGeo.translate(0, 0, -.31);
  segGeo.computeVertexNormals();
  crack.repeat.set(.6, .6);
  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0xb7c0ce, roughness: .34, metalness: 0, transmission: .6, thickness: 1.3, ior: 1.31, dispersion: 1.2,
    attenuationColor: new THREE.Color(0xc4d3ea), attenuationDistance: 2.2,
    normalMap: crack, normalScale: new THREE.Vector2(1.1, 1.1), clearcoat: 1, clearcoatRoughness: .35, envMapIntensity: .8,
  });
  const segs = [];
  for (let i = 0; i < SEGS; i++) {
    const m = new THREE.Mesh(segGeo, iceMat);
    m.rotation.z = i / SEGS * Math.PI * 2 + Math.PI / 2;
    m.userData.r = Math.random();
    group.add(m); segs.push(m);
  }
  // aro de luz na borda interna, e um mais fraco na externa
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(4), fog: false });
  const rimIn = new THREE.Mesh(new THREE.TorusGeometry(RM - HW - .1, .03, 8, 200), hot);
  group.add(rimIn);

  // dentro do gelo: bolhas de ar e lâminas de fratura com veios
  // (as bolhas ficam por cima do anel, sem teste de profundidade, senão a transmissão borra tudo)
  const BUB = mobile ? 260 : 600;
  const bubMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.3, 1.4), transparent: true, opacity: .75, depthTest: false, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubMat, BUB);
  bubbles.renderOrder = 2;
  {
    const d = new THREE.Object3D();
    for (let i = 0; i < BUB; i++) {
      const a = Math.random() * Math.PI * 2, r = RM + (Math.random() - .5) * HW * 1.6, z = (Math.random() - .5) * .6;
      d.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
      d.scale.setScalar(.007 + Math.random() ** 4 * .035);
      d.updateMatrix(); bubbles.setMatrixAt(i, d.matrix);
    }
  }
  group.add(bubbles);
  const fracMat = new THREE.MeshBasicMaterial({ map: vein, color: new THREE.Color(.55, .6, .7), transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < SEGS * 2; i++) {
    const a = (i / (SEGS * 2)) * Math.PI * 2 + Math.random() * .2, r = RM + (Math.random() - .5) * HW;
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(.5 + Math.random() * .4, .35 + Math.random() * .3), fracMat);
    fr.position.set(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - .5) * .3);
    fr.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(fr);
  }
  const membrane = new THREE.Mesh(new THREE.CircleGeometry(RM - HW - .08, 96), new THREE.ShaderMaterial({
    vertexShader: memVert, fragmentShader: memFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { tVein: { value: vein }, uTime: { value: 0 }, uR: { value: RM - HW - .08 }, uAmt: { value: 1 } },
  }));
  membrane.position.z = -.25;
  group.add(membrane);

  /* Objetos congelados no centro, um por projeto */
  const objMat = addRim(new THREE.MeshPhysicalMaterial({
    color: 0x6f7a8c, roughness: .3, metalness: 0, clearcoat: 1, clearcoatRoughness: .2,
    normalMap: crack, normalScale: new THREE.Vector2(.35, .35), transmission: .2, thickness: .6, envMapIntensity: 1.2,
  }), 0xf2f6ff, 2.5, .55);
  const ext = (sh, depth = .32, bevel = .07) => { const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 }); g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g; };
  const piece = (geo, x, y, z = 0, rz = 0) => { const m = new THREE.Mesh(geo, objMat); m.position.set(x, y, z); m.rotation.z = rz; m.userData.base = m.position.clone(); m.userData.rz = rz; m.userData.r = Math.random(); return m; };
  const objects = [];
  { // 01 · fotografia: diafragma de câmera com 6 lâminas
    const g = new THREE.Group();
    const blade = new THREE.Shape();
    blade.moveTo(.18, -.05); blade.lineTo(1.1, -.32); blade.absarc(0, 0, 1.15, -.28, .62, false); blade.lineTo(.28, .3); blade.closePath();
    const bg = ext(blade, .2, .05);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(piece(bg, 0, 0, (i % 2) * .08, a)); }
    const ring = new THREE.Shape(); ring.absarc(0, 0, 1.38, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, 1.18, 0, Math.PI * 2, true); ring.holes.push(hole);
    g.add(piece(ext(ring, .22, .05), 0, 0, -.12));
    objects.push(g);
  }
  { // 02 · fisioterapia: cruz de cinco blocos
    const g = new THREE.Group(), cube = new RoundedBoxGeometry(.62, .62, .62, 4, .12);
    [[0, 0], [.7, 0], [-.7, 0], [0, .7], [0, -.7]].forEach(([x, y]) => g.add(piece(cube, x, y)));
    objects.push(g);
  }
  { // 03 · painel de cozinha: grade de telas, com duas faltando
    const g = new THREE.Group(), tile = new RoundedBoxGeometry(.56, .4, .16, 3, .06);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if ((i === 2 && j === 0) || (i === 0 && j === 2)) continue; g.add(piece(tile, (i - 1) * .66, (j - 1) * .5, ((i + j) % 2) * .12)); }
    objects.push(g);
  }
  { // 04 · galeria: moldura em quatro barras e uma peça no meio
    const g = new THREE.Group(), barH = new RoundedBoxGeometry(1.5, .2, .24, 3, .06), barV = new RoundedBoxGeometry(.2, 1.9, .24, 3, .06);
    g.add(piece(barH, 0, .95)); g.add(piece(barH, 0, -.95)); g.add(piece(barV, -.85, 0)); g.add(piece(barV, .85, 0));
    g.add(piece(new THREE.OctahedronGeometry(.42, 0), 0, 0, .1));
    objects.push(g);
  }
  objects.forEach((o) => { o.visible = false; group.add(o); });

  /* Poeira de gelo flutuando */
  const DUST = mobile ? 300 : 700;
  const dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dp.set([(Math.random() - .5) * 18, (Math.random() - .5) * 11, (Math.random() - .5) * 8 - 1], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: softDot(), size: .05, transparent: true, depthWrite: false, opacity: .7 }));
  scene.add(dust);

  return {
    scene, camera,
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    // pose do anel para o projeto "p" com rolagem local "local" (0 = parado, 1 = saindo)
    // through = a próxima cena é o palco: a câmera atravessa o centro do anel
    pose(p, local, time, look, through = false) {
      const s = Math.min(1, 3.35 * camera.aspect / 3.6);
      group.scale.setScalar(s);
      objects.forEach((o, i) => (o.visible = i === p));
      const arrive = local < 0 ? smooth(-.5, 0, local) : 1; // chega de longe girando
      const leave = local > 0 ? smooth(.5, 1, local) : 0;
      group.rotation.set(look.y * -.12 + Math.sin(time * .3 + p) * .03, look.x * .18 + (local - .2) * .5, time * .02 + p * .6 + local * .35 - (1 - arrive) * 1.4);
      const z = leave > 0 ? 13 - leave * (through ? 19 : 7) : 13 + (1 - arrive) * (1 - arrive) * 26;
      const calm = (1 - leave) * arrive;
      camera.position.set(look.x * .5 * calm, look.y * .35 * calm, z);
      camera.lookAt(look.x * .5 * calm, look.y * .35 * calm, z - 10);
      camera.fov = 30 + (1 - arrive) * 12 + leave * (through ? 34 : 14); camera.updateProjectionMatrix();
      segs.forEach((m, i) => { m.position.set(0, 0, Math.sin(time * .6 + i) * .03 + Math.abs(local) * (m.userData.r - .5) * 1.2); });
      const o = objects[p];
      const spread = .05 + Math.max(0, local) * .9;
      o.children.forEach((c) => {
        const u = c.userData;
        c.position.copy(u.base).multiplyScalar(1 + spread * .45);
        c.position.z = u.base.z + Math.sin(time * .8 + u.r * 6) * .05 + spread * (u.r - .5) * 1.2;
        c.rotation.set(Math.sin(time * .5 + u.r * 9) * .06 + spread * (u.r - .5), spread * (u.r - .5) * .8, u.rz + spread * (u.r - .5) * .4);
      });
      o.rotation.y = Math.sin(time * .35) * .25;
      membrane.material.uniforms.uTime.value = time;
      bubMat.opacity = .75 * (1 - smooth(0, .45, Math.abs(local)));
      bubbles.visible = bubMat.opacity > .01;
      // o aro de luz tremula de leve, como corrente elétrica no gelo
      hot.color.setScalar(3.6 + Math.sin(time * 13) * .25 + Math.sin(time * 31 + p) * .2 + (Math.sin(time * 2.3) > .97 ? 1.5 : 0));
      dust.rotation.y = time * .01;
    },
  };
}
