// Shaders da página /gelo. Tudo escrito para este projeto.
// O ruído simplex 3D é a implementação pública de Ashima Arts / Stefan Gustavson (licença MIT).

export const simplex = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1. / 289.)) * 289.; }
vec4 mod289(vec4 x){ return x - floor(x * (1. / 289.)) * 289.; }
vec4 permute(vec4 x){ return mod289(((x * 34.) + 1.) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - .85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1. / 6., 1. / 3.);
  const vec4 D = vec4(0., .5, 1., 2.);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1. - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0., i1.z, i2.z, 1.)) + i.y + vec4(0., i1.y, i2.y, 1.)) + i.x + vec4(0., i1.x, i2.x, 1.));
  float n_ = .142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49. * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7. * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1. - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2. + 1.;
  vec4 s1 = floor(b1) * 2. + 1.;
  vec4 sh = -step(h, vec4(0.));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.);
  m = m * m;
  return 42. * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec3 snoise3(vec3 x){
  return vec3(snoise(x), snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
}
// Campo de rotacional (curl noise): movimento de fluido sem divergência.
vec3 curl(vec3 p){
  const float e = .1;
  vec3 dx = vec3(e, 0., 0.), dy = vec3(0., e, 0.), dz = vec3(0., 0., e);
  vec3 x0 = snoise3(p - dx), x1 = snoise3(p + dx);
  vec3 y0 = snoise3(p - dy), y1 = snoise3(p + dy);
  vec3 z0 = snoise3(p - dz), z1 = snoise3(p + dz);
  return normalize(vec3(y1.z - y0.z - z1.y + z0.y, z1.x - z0.x - x1.z + x0.z, x1.y - x0.y - y1.x + y0.x) / (2. * e) + 1e-5);
}
`;

/* ---------- Partículas na GPU (GPGPU, ping-pong) ---------- */

// Velocidade: mola em direção à forma alvo + curl noise + o cursor empurra.
export const velocitySim = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uTime;
uniform float uDt;
uniform float uChaos;
uniform vec3 uMouse;
uniform float uMouseOn;
${simplex}
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec3 p = P.xyz;
  vec3 v = texture2D(textureVelocity, uv).xyz;
  float r = P.w;
  // cada partícula sai num momento um pouco diferente, para a forma "escorrer"
  float m = smoothstep(0., 1., clamp(uMix * 1.5 - r * .5, 0., 1.));
  vec3 target = mix(texture2D(tA, uv).xyz, texture2D(tB, uv).xyz, m);
  v += (target - p) * (2.6 + r * 1.4) * uDt;
  v += curl(p * .55 + vec3(0., uTime * .07, 0.)) * (.35 + uChaos * 3.5) * uDt;
  vec3 dm = p - uMouse;
  float d2 = dot(dm, dm);
  v += normalize(dm + 1e-4) * uMouseOn * 7. * exp(-d2 * 1.6) * uDt;
  v *= 1. - 2.4 * uDt;
  gl_FragColor = vec4(v, 1.);
}
`;

export const positionSim = /* glsl */ `
uniform float uDt;
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  gl_FragColor = vec4(P.xyz + v * uDt, P.w);
}
`;

// Desenho das partículas, com profundidade de campo pelo tamanho do ponto.
export const dustVert = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize;
uniform float uPR;
uniform float uFocus;
attribute vec2 ref;
varying float vAlpha;
varying float vSpeed;
varying float vR;
void main(){
  vec4 P = texture2D(tPos, ref);
  vec3 v = texture2D(tVel, ref).xyz;
  vec4 mv = modelViewMatrix * vec4(P.xyz, 1.);
  gl_Position = projectionMatrix * mv;
  float blur = smoothstep(.4, 4.5, abs(-mv.z - uFocus));
  gl_PointSize = uSize * uPR * (.55 + P.w * .9) * mix(1., 3.2, blur) / -mv.z;
  vAlpha = mix(1., .14, blur);
  vSpeed = length(v);
  vR = P.w;
}
`;

export const dustFrag = /* glsl */ `
uniform vec3 uIce;
uniform vec3 uTint;
uniform float uAlpha;
varying float vAlpha;
varying float vSpeed;
varying float vR;
void main(){
  float d = length(gl_PointCoord - .5);
  if (d > .5) discard;
  float a = smoothstep(.5, .1, d) * vAlpha;
  vec3 col = mix(uTint, uIce, smoothstep(.15, .9, vR * .7 + vSpeed * .35));
  col += uIce * smoothstep(.6, 2.5, vSpeed) * .6;
  a *= .75;
  gl_FragColor = vec4(col * a * uAlpha, a * uAlpha);
}
`;

/* ---------- Fundo das cenas ---------- */
// Um plano atrás de tudo: brilho colorido e faixas de luz. O gelo refrata este fundo, então ele precisa ter desenho.
export const backdropVert = /* glsl */ `
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

export const backdropFrag = /* glsl */ `
uniform float uTime;
uniform vec2 uGlow;
uniform vec3 uTint;
uniform float uBars;
varying vec3 vPos;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main(){
  vec2 p = vPos.xy;
  vec3 col = vec3(.004, .007, .02);
  float g = exp(-length((p - uGlow) * vec2(.32, .42)));
  col += uTint * g * .6;
  float wob = sin(p.y * .35 + uTime * .25) * .9;
  float bars = smoothstep(.93, 1., sin(p.x * 1.15 + wob)) + smoothstep(.985, 1., sin(p.x * 3.1 - wob * 2.)) * .6;
  col += vec3(.55, .72, 1.) * bars * g * uBars;
  col += (h(p * 13.7) - .5) * .006;
  gl_FragColor = vec4(col, 1.);
}
`;

/* ---------- Pós-processo: transição congelada ---------- */
// Mistura duas cenas (A e B) por uma frente de gelo com ruído. Na faixa da frente, a imagem racha em
// células (voronoi) que deslocam o UV, e os canais R, G e B são lidos em pontos diferentes
// (aberração cromática). Fora da transição, só sobra uma aberração leve nas bordas, vinheta e grão.
export const postVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const postFrag = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uT;
uniform float uTime;
uniform float uVel;
uniform float uAspect;
uniform vec2 uRes;
uniform float uIntro;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float a = .5, s = 0.;
  for (int k = 0; k < 5; k++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}
// devolve um valor aleatório por célula: cada estilhaço desloca a imagem numa direção
vec2 shard(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float md = 8.; vec2 id = vec2(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash(i + g), hash(i + g + 19.7));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md){ md = d; id = o; }
  }
  return id - .5;
}
vec3 split(sampler2D t, vec2 uv, vec2 dir){
  return vec3(texture2D(t, uv + dir).r, texture2D(t, uv).g, texture2D(t, uv - dir).b);
}
void main(){
  vec2 uv = vUv;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float n = fbm(p * 2.3 + vec2(0., uTime * .03));
  float field = n * .55 + (1. - uv.y) * .25 + uv.x * .2;
  float front = mix(-.2, 1.2, uT);
  float m = smoothstep(front + .04, front - .04, field);
  float band = exp(-pow((field - front) * 7., 2.)) * step(.0005, uT) * step(uT, .9995);
  vec2 cid = shard(p * 7. + n * 2.);
  float frostA = uT * (1. - m), frostB = (1. - uT) * m;
  vec2 dA = cid * (band * .07 + frostA * .03);
  vec2 dB = cid * (band * .07 + frostB * .03);
  vec2 c = uv - .5;
  vec2 dir = c * (.004 + band * .05 + min(uVel, 3.) * .006 + uIntro * .03);
  vec3 a = split(tA, uv + dA, dir);
  vec3 b = split(tB, uv + dB, dir);
  vec3 col = mix(a, b, m);
  col += vec3(.5, .68, 1.) * band * .28;
  col *= mix(1., .45, smoothstep(.35, 1.1, length(c * vec2(uAspect, 1.))));
  col += (hash(uv * uRes + fract(uTime * 7.) * 91.) - .5) * .03;
  gl_FragColor = vec4(max(col, 0.), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
