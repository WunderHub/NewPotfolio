// Cena 1: um iglu de blocos de neve no alto de uma montanha, com névoa e neve caindo.
// Os blocos se montam na entrada, se afastam sob o cursor e explodem com a rolagem, deixando vazar a luz de dentro.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fbm, smooth, snowNormal, brickNormal, softDot, addRim } from './textures.js';

export function createIglu({ mobile }) {
  const FOG = new THREE.Color(0xb3bbc8);
  const scene = new THREE.Scene();
  scene.background = FOG.clone();
  scene.fog = new THREE.FogExp2(FOG, .016);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 220);

  /* Luz */
  scene.add(new THREE.HemisphereLight(0xeef2fa, 0x6f7889, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 2.9);
  sun.position.set(-7, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun);
  const core = new THREE.PointLight(0xe4eeff, 30, 9, 1.5);
  scene.add(core);

  /* Montanha */
  const terrainH = (x, z) => {
    const r = Math.hypot(x, z);
    const ridge = 1 - Math.abs(fbm(x * .03 + 40, z * .03 + 40, 5, 7) * 2 - 1);
    const ridge2 = 1 - Math.abs(fbm(x * .07 + 9, z * .07 + 3, 4, 11) * 2 - 1);
    const mountains = (Math.pow(ridge, 2.6) * 20 + Math.pow(ridge2, 3) * 4) * smooth(10, 50, r);
    const rolling = (fbm(x * .11, z * .11, 4, 3) - .5) * 2.2 * smooth(3, 9, r);
    const mound = 1.1 * Math.exp(-(r * r) / 45);
    const drop = -3 * smooth(6, 16, r) * (1 - smooth(18, 40, r)); // vale entre o iglu e as montanhas
    return mountains + rolling + mound + drop;
  };
  const SEG = mobile ? 170 : 260;
  const tg = new THREE.PlaneGeometry(150, 150, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, terrainH(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const snowN = snowNormal(256);
  snowN.repeat.set(55, 55);
  const timeU = { value: 0 };
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0xd3d9e3, roughness: .93, metalness: 0, normalMap: snowN, normalScale: new THREE.Vector2(.9, .9) });
  // brilho da neve: pontinhos que piscam conforme o ângulo de visão
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpk = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSpk; uniform float uTime;\nfloat hs(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hh = hs(floor(vSpk * 50.));
        float tw = .5 + .5 * sin(uTime * 3. + hh * 80. + dot(vViewPosition, vec3(4.)));
        float spk = step(.9968, hh) * tw * tw * smoothstep(22., 5., length(vViewPosition));
        totalEmissiveRadiance += vec3(1., 1., 1.05) * spk * 4.;`);
  };
  const terrain = new THREE.Mesh(tg, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  const y0 = terrainH(0, 0) - .06;

  /* Iglu: fileiras de blocos numa cúpula + túnel de entrada */
  const R = 2.1, ROWS = 8, dT = (Math.PI / 2 * .92) / ROWS, GAP = .06;
  const BW = .62, BH = .4, BD = .44;
  const bricks = [];
  const dummy = new THREE.Object3D();
  const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const FRONT = Math.PI / 2; // a entrada fica para +z
  for (let k = 0; k < ROWS; k++) {
    const tc = (k + .5) * dT, rr = R * Math.cos(tc), y = R * Math.sin(tc);
    const count = Math.max(4, Math.round(2 * Math.PI * rr / .66));
    const w = 2 * Math.PI * rr / count - GAP;
    for (let i = 0; i < count; i++) {
      const a = (i + (k % 2) * .5) / count * Math.PI * 2 + .13;
      if ((k <= 1 && angDist(a, FRONT) < .44) || (k === 2 && angDist(a, FRONT) < .22)) continue;
      const n = new THREE.Vector3(Math.cos(tc) * Math.cos(a), Math.sin(tc), Math.cos(tc) * Math.sin(a));
      const p = new THREE.Vector3(rr * Math.cos(a), y0 + y, rr * Math.sin(a));
      dummy.up.set(0, 1, 0); dummy.position.copy(p); dummy.lookAt(p.clone().add(n));
      bricks.push({ p, q: dummy.quaternion.clone(), n, s: new THREE.Vector3(w / BW, (R * dT - GAP) / BH, 1) });
    }
  }
  { // tampa no topo
    const p = new THREE.Vector3(0, y0 + R - .04, 0);
    bricks.push({ p, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), n: new THREE.Vector3(0, 1, 0), s: new THREE.Vector3(.85, 1.25, 1) });
  }
  const RA = .85, ARCH = 8;
  for (let j = 0; j < 4; j++) for (let m = 0; m < ARCH; m++) {
    const f = (m + .5) / ARCH * Math.PI, z = 1.78 + j * (BH + GAP);
    const n = new THREE.Vector3(Math.cos(f), Math.sin(f), 0);
    const p = new THREE.Vector3(RA * Math.cos(f), y0 + RA * Math.sin(f) - .02, z + (m % 2) * .02);
    dummy.up.set(0, 0, 1); dummy.position.copy(p); dummy.lookAt(p.clone().add(n));
    bricks.push({ p, q: dummy.quaternion.clone(), n, s: new THREE.Vector3((Math.PI * RA / ARCH - GAP) / BW, 1, .78) });
  }
  // gira o iglu para a entrada ficar de lado para a câmera
  const TURN = 1.1, turnQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TURN);
  bricks.forEach((b) => { b.p.applyQuaternion(turnQ); b.n.applyQuaternion(turnQ); b.q.premultiply(turnQ); });
  bricks.forEach((b, i) => {
    b.r1 = Math.random(); b.r2 = Math.random(); b.r3 = Math.random();
    b.axis = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    b.hover = 0; b.cur = new THREE.Vector3();
    b.idx = i;
  });

  const bN = brickNormal(256);
  const brickMat = addRim(new THREE.MeshStandardMaterial({ color: 0xaeb7c5, roughness: .82, metalness: 0, normalMap: bN, normalScale: new THREE.Vector2(1.1, 1.1) }), 0xe8f0ff, 3, .55);
  const brickMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(BW, BH, BD, 3, .07), brickMat, bricks.length);
  brickMesh.castShadow = brickMesh.receiveShadow = true;
  brickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(brickMesh);

  // luz interna: aparece pelas frestas e pela porta (e o bloom transforma em brilho)
  // aditiva: com cor zero some de vez (antes de o iglu estar montado)
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1.02, 1.08).multiplyScalar(5), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const inner = new THREE.Mesh(new THREE.SphereGeometry(R - BD * .55, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glowMat);
  inner.position.y = y0;
  scene.add(inner);
  const tunnelGlow = new THREE.Mesh(new THREE.CylinderGeometry(RA - .22, RA - .22, 1.5, 24, 1, true, -Math.PI / 2, Math.PI), glowMat);
  tunnelGlow.rotation.x = Math.PI / 2; tunnelGlow.position.set(0, y0, 2.15); // fica dentro do túnel (z 1.4 a 2.9)
  const pivot = new THREE.Group(); pivot.rotation.y = TURN; pivot.add(tunnelGlow);
  scene.add(pivot);
  core.position.set(0, y0 + .9, 0);

  /* Planta técnica: arestas de cada bloco, grade no chão e traços soltos, revelados de baixo para cima na abertura */
  const wireMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal: { value: 0 }, uAlpha: { value: 0 }, uY0: { value: y0 - .2 }, uY1: { value: y0 + R + .4 }, uTime: timeU },
    vertexShader: `attribute float aRand; varying float vY; varying float vR;
      void main(){ vY = position.y; vR = aRand; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uReveal, uAlpha, uY0, uY1, uTime; varying float vY; varying float vR;
      void main(){
        float t = (vY - uY0) / (uY1 - uY0), front = uReveal * 1.25 - vR * .25;
        float a = smoothstep(t - .05, t, front);
        float head = smoothstep(t - .12, t, front) * (1. - smoothstep(t, t + .1, front)); // faixa clara onde a linha acabou de surgir
        a *= .6 + .4 * step(.5, fract(uTime * 2.5 + vR * 7.));
        vec3 ink = vec3(.11, .13, .19);
        gl_FragColor = vec4(mix(ink, vec3(2.4), head), (a * .7 + head * .5) * uAlpha);
      }`,
  });
  const lineSet = (pts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const n = pts.length / 6, r = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) r[i * 2] = r[i * 2 + 1] = Math.random();
    g.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
    const l = new THREE.LineSegments(g, wireMat); l.frustumCulled = false; scene.add(l); return l;
  };
  {
    const ep = new THREE.EdgesGeometry(new THREE.BoxGeometry(BW, BH, BD)).attributes.position;
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), pts = [];
    bricks.forEach((b) => { m4.compose(b.p, b.q, b.s); for (let i = 0; i < ep.count; i++) { v.fromBufferAttribute(ep, i).applyMatrix4(m4); pts.push(v.x, v.y, v.z); } });
    lineSet(pts);
    const grid = [];
    for (let k = -10; k <= 10; k++) for (let j = -10; j < 10; j++) {
      const a = k * .5, b0 = j * .5, b1 = b0 + .5;
      if (Math.hypot(a, b0) > 5 || Math.hypot(a, b1) > 5) continue;
      grid.push(a, terrainH(a, b0) + .03, b0, a, terrainH(a, b1) + .03, b1);
      grid.push(b0, terrainH(b0, a) + .03, a, b1, terrainH(b1, a) + .03, a);
    }
    lineSet(grid);
    const loose = [];
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7, y = y0 + Math.random() * 5;
      const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), d = new THREE.Vector3().randomDirection().multiplyScalar(.3 + Math.random() * 1.4);
      loose.push(p.x, p.y, p.z, p.x + d.x, p.y + d.y, p.z + d.z);
    }
    lineSet(loose);
  }
  bricks.forEach((b) => { b.o = Math.min(1, Math.max(0, (b.p.y - y0) / R) * .85 + b.r1 * .15); });

  /* Névoa em camadas: lençóis de ruído que passam devagar atrás do iglu */
  const mistMat = (seed, alpha) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: timeU, uColor: { value: FOG }, uSeed: { value: seed }, uAlpha: { value: alpha } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uTime, uSeed, uAlpha; uniform vec3 uColor; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), u.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), u.x), u.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; for (int k = 0; k < 5; k++){ s += a * n(p); p *= 2.02; a *= .5; } return s; }
      void main(){
        vec2 p = vUv * vec2(7., 1.6) + vec2(uTime * .025 + uSeed, uSeed * .37);
        float m = fbm(p + fbm(p * 1.6 - vec2(uTime * .02, 0.)));
        float a = smoothstep(.38, .8, m) * smoothstep(0., .3, vUv.y) * smoothstep(1., .4, vUv.y) * smoothstep(0., .12, vUv.x) * smoothstep(1., .88, vUv.x);
        gl_FragColor = vec4(uColor * 1.05, a * uAlpha);
      }`,
  });
  [[11, 1.4, .5], [17, 3, .6], [26, 5, .7], [36, 8, .8]].forEach(([r, hgt, al], i) => {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(90, 6 + hgt * 1.5), mistMat(i * 3.7, al));
    const a = .62 + Math.PI;
    sheet.position.set(Math.sin(a) * r, y0 - 1 + hgt, Math.cos(a) * r);
    sheet.rotation.y = .62;
    sheet.renderOrder = -1 - i;
    scene.add(sheet);
  });

  /* Neve caindo */
  const FLAKES = mobile ? 1200 : 2600;
  const fp = new Float32Array(FLAKES * 3), fs = new Float32Array(FLAKES);
  for (let i = 0; i < FLAKES; i++) { fp.set([(Math.random() - .5) * 34, Math.random() * 16 - 2, (Math.random() - .5) * 34], i * 3); fs[i] = .4 + Math.random(); }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const flakes = new THREE.Points(fg, new THREE.PointsMaterial({ map: softDot(), size: .07, transparent: true, depthWrite: false, color: 0xffffff, opacity: .85 }));
  scene.add(flakes);

  /* Marcadores do HUD: alguns blocos ligados por linhas, com o número do bloco */
  const markerIdx = [12, 27, 33, 41, 46, 58].map((i) => i % bricks.length);

  /* Estado */
  const ray = new THREE.Raycaster();
  const sphere = new THREE.Sphere(new THREE.Vector3(0, y0, 0), R + .1);
  const hit = new THREE.Vector3(), tmp = new THREE.Vector3(), q2 = new THREE.Quaternion();
  const api = {
    scene, camera, y0,
    explode: 0,  // blocos afastados (rolagem)
    build: 0,    // 0 = blocos no céu, 1 = iglu montado (abertura)
    wire: 0,     // revelação da planta técnica
    wireAlpha: 0,
    onPop: null, // chamado quando o cursor solta um bloco (som)
    markers: [],
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    update(dt, time, local, pointer, pointerIn, look) {
      // câmera: órbita lenta + paralaxe; a rolagem sobe e aproxima
      // na saída (segunda metade), a câmera sobe por cima do iglu e mergulha na névoa, abrindo a lente
      const fly = smooth(.5, 1, local);
      const ang = .62 + Math.sin(time * .05) * .06 + look.x * .08 - local * .5 - fly * .5;
      const dist = Math.max(10.4, 3.2 / (Math.tan(THREE.MathUtils.degToRad(15)) * camera.aspect)) - local * 2.5 - fly * 5;
      camera.position.set(Math.sin(ang) * dist, 2.7 + y0 + look.y * .5 + local * 2.2 + fly * fly * 7, Math.cos(ang) * dist);
      camera.lookAt(0, y0 + 1.25 + local * .6 + fly * 6, 0);
      camera.fov = 30 + fly * 28; camera.updateProjectionMatrix();

      // cursor sobre a cúpula
      let hasHit = false;
      if (pointerIn) { ray.setFromCamera(pointer, camera); hasHit = !!ray.ray.intersectSphere(sphere, hit); }
      const ex = api.explode + smooth(.02, .5, local) * 1.3;
      let popped = false;
      for (const b of bricks) {
        const target = hasHit ? smooth(.95, .15, b.p.distanceTo(hit)) * .3 : 0;
        if (target > .12 && b.hover < .06) popped = true;
        b.hover += (target - b.hover) * Math.min(1, dt * 6);
        // abertura: cada bloco cai do céu na sua vez, de baixo para cima
        const bb = smooth(b.o * .6, b.o * .6 + .4, api.build), drop = 1 - bb;
        const e = ex * (.35 + b.r1 * 1.4) + b.hover + drop * 1.2;
        b.cur.copy(b.p).addScaledVector(b.n, e).addScaledVector(tmp.set(0, 1, 0), ex * ex * b.r2 * .9 + drop * drop * 8);
        dummy.position.copy(b.cur);
        dummy.quaternion.copy(b.q).multiply(q2.setFromAxisAngle(b.axis, (ex * (b.r3 - .5) * 2.4) + b.hover * (b.r3 - .5) * .8 + drop * (b.r3 - .5) * 3));
        dummy.scale.copy(b.s);
        dummy.updateMatrix();
        brickMesh.setMatrixAt(b.idx, dummy.matrix);
      }
      brickMesh.instanceMatrix.needsUpdate = true;
      if (popped && api.onPop) api.onPop();
      timeU.value = time;
      wireMat.uniforms.uReveal.value = api.wire;
      wireMat.uniforms.uAlpha.value = api.wireAlpha;
      const open = Math.min(1, ex * .8 + Math.max(...markerIdx.map((i) => bricks[i].hover)) * .4);
      const lit = smooth(.55, 1, api.build); // a luz de dentro acende quando os blocos fecham a cúpula
      glowMat.color.setRGB(1, 1.02, 1.08).multiplyScalar((4 + open * 6) * lit);
      inner.visible = tunnelGlow.visible = lit > .001;
      core.intensity = (18 + open * 60) * lit;

      // neve: cai com vento e volta ao topo
      const a = fg.attributes.position.array;
      for (let i = 0; i < FLAKES; i++) {
        a[i * 3 + 1] -= dt * .55 * fs[i];
        a[i * 3] += dt * (.35 + Math.sin(time * .7 + i) * .15);
        if (a[i * 3 + 1] < -2) { a[i * 3 + 1] = 14; }
        if (a[i * 3] > 17) a[i * 3] -= 34;
      }
      fg.attributes.position.needsUpdate = true;

      // posições projetadas dos marcadores (o HUD desenha linhas entre elas)
      api.markers = markerIdx.map((i) => { tmp.copy(bricks[i].cur).project(camera); return { x: tmp.x, y: tmp.y, z: tmp.z, n: i }; });
    },
  };
  return api;
}
