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
  v += curl(p * .55 + vec3(0., uTime * .07, 0.)) * (.18 + uChaos * 3.) * uDt;
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

// Partículas do palco: cada ponto é desenhado como uma pequena esfera iluminada (normal falsa no sprite).
export const beadVert = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize;
uniform float uScale;
attribute vec2 ref;
varying float vDepth;
varying float vR;
varying float vSpeed;
void main(){
  vec4 P = texture2D(tPos, ref);
  vec4 mv = modelViewMatrix * vec4(P.xyz, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, uSize * (.7 + P.w * .6) * uScale / -mv.z);
  vDepth = -mv.z; vR = P.w; vSpeed = length(texture2D(tVel, ref).xyz);
}
`;

export const beadFrag = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying float vDepth;
varying float vR;
varying float vSpeed;
void main(){
  vec2 c = gl_PointCoord * 2. - 1.;
  float r2 = dot(c, c);
  if (r2 > 1.) discard;
  vec3 n = vec3(c.x, -c.y, sqrt(1. - r2));
  float diff = max(dot(n, uLight), 0.);
  float rim = pow(1. - n.z, 2.);
  vec3 col = mix(vec3(.05, .06, .085), vec3(.62, .68, .78), diff * .9 + .05) + rim * .12;
  col *= .8 + vR * .35;
  col += vec3(.7, .8, 1.) * smoothstep(.8, 3., vSpeed) * .5;
  float f = 1. - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.);
}
`;

/* ---------- Pós-processo: transições ---------- */
// Mistura duas cenas (A e B) por uma frente de ruído. Dois tipos:
//  - entre projetos (uKind = 0): a frente racha a imagem em estilhaços (voronoi) que deslocam o UV;
//  - entre mundos (uKind = 1): rastro radial com os canais R, G e B separados (arco-íris) e névoa branca no meio.
export const postVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const postFrag = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uT;
uniform float uKind;
uniform float uTime;
uniform float uVel;
uniform float uAspect;
uniform float uIntro;
uniform vec2 uRes;
uniform vec3 uFog;
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
// rastro radial: 8 amostras em direção ao centro, cada canal com um comprimento diferente
vec3 streak(sampler2D t, vec2 uv, vec2 disp, float amt){
  vec2 dir = uv - .5;
  vec3 acc = vec3(0.);
  for (int k = 0; k < 8; k++){
    vec2 o = dir * amt * float(k) / 7.;
    acc.r += texture2D(t, uv + disp - o).r;
    acc.g += texture2D(t, uv + disp - o * 1.3).g;
    acc.b += texture2D(t, uv + disp - o * 1.6).b;
  }
  return acc / 8.;
}
void main(){
  vec2 uv = vUv;
  vec2 c = uv - .5;
  vec2 p = vec2(uv.x * uAspect, uv.y);
  float n = fbm(p * 2.3 + vec2(0., uTime * .03));
  float field = n * .55 + (1. - uv.y) * .25 + uv.x * .2;
  float front = mix(-.2, 1.2, uT);
  float m = smoothstep(front + .04, front - .04, field);
  float live = step(.0005, uT) * step(uT, .9995);
  float band = exp(-pow((field - front) * 7., 2.)) * live;
  float mid = sin(3.14159 * uT) * live;
  float shardAmt = 1. - uKind;
  vec2 cid = shard(p * 7. + n * 2.);
  vec2 dA = cid * (band * .07 + uT * (1. - m) * .03) * shardAmt;
  vec2 dB = cid * (band * .07 + (1. - uT) * m * .03) * shardAmt;
  float sAmt = .006 + uKind * mid * .4 + band * .05 + min(uVel, 3.) * .012 + uIntro * .12;
  vec3 col = streak(tA, uv, dA, sAmt);
  if (live > .5) col = mix(col, streak(tB, uv, dB, sAmt), m);
  col += vec3(.75, .85, 1.) * band * .22;
  col = mix(col, uFog, uKind * pow(mid, 1.4) * .62 + uIntro * .6);
  col *= mix(1., .72, smoothstep(.45, 1.25, length(c * vec2(uAspect, 1.))));
  col += (hash(uv * uRes + fract(uTime * 7.) * 91.) - .5) * .025;
  gl_FragColor = vec4(max(col, 0.), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
