// Texturas procedurais (geradas no navegador, nenhuma imagem baixada): neve, blocos, rachaduras e veios de luz.
import * as THREE from 'three';

/* Ruído de valor 2D com hash inteiro. "per" deixa o ruído repetível (para texturas que se repetem sem emenda). */
const hash = (x, y, s) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function vnoise(x, y, s = 0, per = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a) => (per ? ((a % per) + per) % per : a);
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5, s = 0, per = 0) {
  let a = .5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i * 17, per ? per * f : 0); f *= 2; a *= .5; }
  return t;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* Mapa de altura -> normal map (tangente), com bordas que se repetem. */
function heightToNormal(h, size, strength) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
    d[o] = (-dx / l * .5 + .5) * 255; d[o + 1] = (dy / l * .5 + .5) * 255; d[o + 2] = (1 / l * .5 + .5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Neve: ondulação suave + grão fino.
export function snowNormal(size = 256) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    h[y * size + x] = fbm(u * 6, v * 6, 4, 3, 6) * .9 + vnoise(u * 96, v * 96, 9, 96) * .22 + vnoise(u * 40, v * 40, 4, 40) * .18;
  }
  return heightToNormal(h, size, 4);
}

// Bloco de neve compactada: relevo irregular, marcas de corte e pequenos buracos.
export function brickNormal(size = 256) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let n = fbm(u * 5, v * 5, 5, 21, 5) * 1.1 + vnoise(u * 70, v * 70, 2, 70) * .12;
    n += Math.sin((v + fbm(u * 3, v * 3, 2, 8, 3) * .2) * 90) * .015; // marcas de serra
    const pit = vnoise(u * 22, v * 22, 31, 22); if (pit > .78) n -= (pit - .78) * 1.6;
    h[y * size + x] = n;
  }
  return heightToNormal(h, size, 5);
}

// Rachaduras: linhas que se ramificam, desenhadas num canvas e convertidas em relevo.
export function crackNormal(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.lineCap = 'round';
  const crack = (x, y, a, len, w, depth) => {
    g.lineWidth = w; g.strokeStyle = `rgba(255,255,255,${.35 + rnd() * .5})`;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < len; s++) {
      a += (rnd() - .5) * .9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y);
      if (depth < 2 && rnd() < .08) { g.stroke(); crack(x, y, a + (rnd() < .5 ? 1 : -1) * (.6 + rnd()), len * .5, w * .6, depth + 1); g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  for (let i = 0; i < 30; i++) crack(rnd() * size, rnd() * size, rnd() * 7, 12 + rnd() * 30, .6 + rnd() * 1.6, 0);
  const src = g.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    h[i] = -src[i * 4] / 255 * .8 + fbm(x / size * 8, y / size * 8, 3, 5, 8) * .5;
  }
  return heightToNormal(h, size, 3);
}

// Veios de luz (bordas de voronoi), usados na membrana brilhante dentro do anel.
export function veinTexture(size = 512, cells = 9) {
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + hash(i, j, 3)) / cells, (j + hash(i, j, 4)) / cells]);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size + (fbm(x / size * 4, y / size * 4, 3, 2, 4) - .5) * .06, v = y / size + (fbm(x / size * 4, y / size * 4, 3, 9, 4) - .5) * .06;
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const ii = ci + ox, jj = cj + oy;
      const p = pts[((jj % cells + cells) % cells) * cells + ((ii % cells + cells) % cells)];
      const px = p[0] + Math.floor(ii / cells), py = p[1] + Math.floor(jj / cells);
      const dd = Math.hypot(u - px, v - py);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    const e = 1 - smooth(0, .012, d2 - d1);
    const fine = 1 - smooth(0, .05, Math.abs(fbm(u * 18, v * 18, 3, 13, 18) - .5));
    const val = Math.min(1, e * .9 + fine * .25) * 255;
    const o = (y * size + x) * 4; d[o] = d[o + 1] = d[o + 2] = val; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Sprite redondo e macio para flocos de neve e poeira.
export function softDot(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* Borda que brilha (fresnel) em materiais padrão do Three, como gelo pegando luz nas quinas. */
export function addRim(material, color = 0xdfe8ff, power = 3, strength = .6) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRim = { value: strength };
    material.userData.rim = shader.uniforms.uRim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1. - clamp(abs(dot(normal, normalize(vViewPosition))), 0., 1.), ${power.toFixed(1)});
        totalEmissiveRadiance += uRimColor * rimF * uRim;`);
  };
  return material;
}
