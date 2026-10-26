// Cena 3: um palco circular em degraus, com um aro de luz no teto e um volume de partículas no centro
// que se transforma em formas (KR, floco de neve, iglu, @). Simulação na GPU.
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { makeSky } from './ring.js';
import { snowNormal, softDot, smooth } from './textures.js';
import * as S from './shaders.js';

export const SHAPES = ['KR', 'Floco', 'Iglu', '@'];

export function createStage({ renderer, mobile }) {
  const FOG = new THREE.Color(0xbfc6d1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG, .035);
  scene.add(makeSky(0xdfe3ea, 0xa3abb9, 0xffffff, .25));
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 120);
  scene.add(new THREE.HemisphereLight(0xf2f5fb, 0x8a93a3, 1.6));
  const top = new THREE.DirectionalLight(0xffffff, 1.6); top.position.set(2, 10, 6); scene.add(top);

  /* Palco: anéis em degraus + filetes de luz nas bordas */
  const floorN = snowNormal(256); floorN.repeat.set(8, 8);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: .5, metalness: .05, normalMap: floorN, normalScale: new THREE.Vector2(.25, .25) });
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(6), fog: true });
  const steps = [[1.5, .0], [2.7, -.22], [4.3, -.4], [6.4, -.55], [9.5, -.68], [14, -.78]];
  steps.forEach(([r, y], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .3, 128), floorMat);
    m.position.y = y - .15;
    scene.add(m);
    if (i === 1 || i === 3) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r + .01, .018, 6, 220), hot);
      t.rotation.x = Math.PI / 2; t.position.y = y - .05;
      scene.add(t);
    }
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.4, .07, 10, 220), hot);
  halo.rotation.x = Math.PI / 2; halo.position.y = 5.6;
  scene.add(halo);
  const halo2 = new THREE.Mesh(new THREE.TorusGeometry(5.2, .035, 8, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.5) }));
  halo2.rotation.x = Math.PI / 2; halo2.position.y = 6.3;
  scene.add(halo2);

  /* Formas alvo das partículas */
  const SIZE = mobile ? 112 : 208, COUNT = SIZE * SIZE;
  const CY = 1.75; // altura do centro do volume
  const fromCanvas = (draw, w = 512, h = 512) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; draw(g, w, h);
    const d = g.getImageData(0, 0, w, h).data, pts = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 140) pts.push([x / w - .5, .5 - y / h]);
    return pts;
  };
  const tex = (fill) => {
    const data = new Float32Array(COUNT * 4), v = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) { fill(v, i); data.set([v.x, v.y, v.z, Math.random()], i * 4); }
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t;
  };
  const planar = (pts, scale, depth) => (v) => { const p = pts.length ? pts[(Math.random() * pts.length) | 0] : [0, 0]; v.set(p[0] * scale, p[1] * scale + CY, (Math.random() - .5) * depth); };
  const font = (px) => `800 ${px}px Archivo, "Arial Black", Arial, sans-serif`;
  const targets = {
    cloud: tex((v) => { v.randomDirection().multiplyScalar(Math.cbrt(Math.random()) * 2.6); v.y = v.y * .8 + CY; }),
    KR: tex(planar(fromCanvas((g, w, h) => { g.font = font(300); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KR', w / 2, h / 2 + 20); }), 4.4, .7)),
    Floco: tex(planar(fromCanvas((g, w, h) => {
      g.translate(w / 2, h / 2); g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate(i / 6 * Math.PI * 2);
        g.lineWidth = 22; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -210); g.stroke();
        g.lineWidth = 14; [[-70, 60], [-130, 50], [-180, 34]].forEach(([y, l]) => { g.beginPath(); g.moveTo(0, y); g.lineTo(-l, y - l); g.moveTo(0, y); g.lineTo(l, y - l); g.stroke(); });
        g.restore();
      }
      g.beginPath(); g.arc(0, 0, 40, 0, 7); g.fill();
    }), 4, .5)),
    Iglu: tex((v, i) => {
      if (i % 4 === 0) { // túnel
        const f = Math.random() * Math.PI, r = .55 + Math.random() * .2; v.set(Math.cos(f) * r, Math.sin(f) * r + CY - 1.1, 1.2 + Math.random() * .8); return;
      }
      v.randomDirection(); v.y = Math.abs(v.y); v.multiplyScalar(1.6 + Math.random() * .3); v.y += CY - 1.1;
    }),
    '@': tex(planar(fromCanvas((g, w, h) => { g.font = font(420); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('@', w / 2, h / 2 + 10); }), 4.2, .6)),
  };

  /* Simulação (ping-pong em texturas float) */
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  const pos0 = gpu.createTexture(), vel0 = gpu.createTexture();
  pos0.image.data.set(targets.cloud.image.data);
  const posVar = gpu.addVariable('texturePosition', S.positionSim, pos0);
  const velVar = gpu.addVariable('textureVelocity', S.velocitySim, vel0);
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  const U = velVar.material.uniforms;
  Object.assign(U, {
    tA: { value: targets.cloud }, tB: { value: targets.KR }, uMix: { value: 0 }, uTime: { value: 0 }, uDt: { value: .016 },
    uChaos: { value: 0 }, uMouse: { value: new THREE.Vector3(99, 99, 99) }, uMouseOn: { value: 0 },
  });
  posVar.material.uniforms.uDt = { value: .016 };
  const ok = !gpu.init();

  const pu = {
    tPos: { value: null }, tVel: { value: null }, uSize: { value: mobile ? .06 : .046 }, uScale: { value: 400 },
    uLight: { value: new THREE.Vector3(.3, .9, .5).normalize() }, uFogColor: { value: FOG }, uFogDensity: { value: .035 },
  };
  const group = new THREE.Group();
  scene.add(group);
  if (ok) {
    const ref = new Float32Array(COUNT * 2);
    for (let i = 0; i < COUNT; i++) { ref[i * 2] = (i % SIZE + .5) / SIZE; ref[i * 2 + 1] = (Math.floor(i / SIZE) + .5) / SIZE; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: S.beadVert, fragmentShader: S.beadFrag, uniforms: pu }));
    pts.frustumCulled = false;
    group.add(pts);
  }

  /* Poeira no ar */
  const DUST = mobile ? 200 : 500, dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dp.set([(Math.random() - .5) * 20, Math.random() * 8, (Math.random() - .5) * 14], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: softDot(), size: .045, transparent: true, depthWrite: false, opacity: .8 }));
  scene.add(dust);

  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  let shape = -1;
  const mixer = { v: 1 };
  const api = {
    scene, camera, ok, shape: -1,
    px: 800,
    resize(w, h, pr) { camera.aspect = w / h; camera.updateProjectionMatrix(); api.px = h * pr; pu.uScale.value = h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); },
    setShape(k) {
      k = ((k % SHAPES.length) + SHAPES.length) % SHAPES.length;
      if (k === shape) return;
      U.tA.value = shape < 0 ? targets.cloud : targets[SHAPES[shape]];
      U.tB.value = targets[SHAPES[k]];
      shape = api.shape = k;
      mixer.v = 0;
      if (window.gsap) gsap.to(mixer, { v: 1, duration: 3, ease: 'power2.inOut', overwrite: true }); else mixer.v = 1;
    },
    // roda a simulação; chamado só quando a cena aparece
    simulate(dt, time, pointer, pointerIn, extraSteps = 0) {
      if (!ok) return;
      U.uMix.value = mixer.v; U.uTime.value = time; U.uDt.value = dt; posVar.material.uniforms.uDt.value = dt;
      U.uChaos.value = Math.sin(Math.PI * mixer.v) * .8;
      ray.setFromCamera(pointer, camera);
      if (pointerIn && ray.ray.intersectPlane(plane, hit)) { group.worldToLocal(U.uMouse.value.copy(hit)); U.uMouseOn.value = 1; } else U.uMouseOn.value = 0;
      for (let s = 0; s <= extraSteps; s++) gpu.compute();
      pu.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
      pu.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    },
    pose(local, time, look) {
      // chegada: desce do alto (vindo de dentro do anel) até a altura do palco
      const k = local < 0 ? 1 - smooth(-.5, 0, local) : 0;
      const d = Math.max(10.5, 2.8 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect));
      camera.position.set(look.x * .8 * (1 - k), 2.4 + look.y * .5 + k * k * 10, d - k * 4);
      pu.uFogDensity.value = scene.fog.density = .035 * Math.min(1, 10.5 / d);
      camera.lookAt(0, 1.55 - k * 1.2, 0);
      camera.fov = 32 + k * 22; camera.updateProjectionMatrix();
      pu.uScale.value = api.px / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      group.rotation.y = Math.sin(time * .25) * .35 + look.x * .3;
      halo.position.y = 5.6 + Math.sin(time * .8) * .05;
      plane.constant = 0;
      dust.rotation.y = time * .015;
    },
  };
  return api;
}
