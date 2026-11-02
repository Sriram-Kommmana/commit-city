// The look of the world. Buildings are flat colour with procedural windows; the comic
// treatment (ink lines, print dots, off-register colour, speed lines) happens in COMIC_FRAG.

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.1, 1.0);
  vec3 horizon = vec3(1.0, 0.42, 0.16);
  vec3 low = vec3(0.98, 0.09, 0.47);
  vec3 mid = vec3(0.42, 0.06, 0.62);
  vec3 top = vec3(0.07, 0.03, 0.26);
  vec3 c = mix(horizon, low, smoothstep(0.0, 0.1, h));
  c = mix(c, mid, smoothstep(0.08, 0.3, h));
  c = mix(c, top, smoothstep(0.26, 0.62, h));

  // The huge sun, cut into bands near the horizon.
  float a = dot(d, uSunDir);
  float disc = smoothstep(0.9605, 0.9612, a);
  float bands = step(0.5, fract(d.y * 44.0));
  float cut = mix(bands, 1.0, smoothstep(0.015, 0.2, d.y));
  c = mix(c, mix(vec3(1.0, 0.86, 0.1), vec3(1.0, 0.3, 0.32), smoothstep(0.26, 0.0, d.y)), disc * cut);

  // Clouds as flat comic shapes.
  float n = sin(d.x * 9.0 + sin(d.y * 31.0) * 1.6) + sin(d.x * 21.0 + 1.7) * 0.5;
  float cloud = smoothstep(0.86, 0.9, n) * smoothstep(0.03, 0.09, h) * smoothstep(0.34, 0.14, h);
  float cloudLine = smoothstep(0.5, 0.52, fract(d.y * 90.0 + d.x * 4.0));
  c = mix(c, vec3(1.0, 0.55, 0.62), cloud * cloudLine);

  // Stars.
  vec2 g = floor(vec2(atan(d.x, d.z) * 90.0, d.y * 160.0));
  float star = step(0.992, hash(g)) * smoothstep(0.3, 0.6, h);
  c = mix(c, vec3(1.0, 0.96, 0.75), star);
  gl_FragColor = vec4(c, 1.0);
}`;

export const BUILDING_VERT = /* glsl */ `
attribute float aSeed;
attribute float aHero;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocalSize;
varying float vSeed;
varying float vHero;
varying float vDist;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normal;
  vSeed = aSeed;
  vHero = aHero;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  gl_Position = projectionMatrix * view;
}`;

export const BUILDING_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vHero;
varying float vDist;
uniform vec3 uSunDir;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, normalize(vec3(uSunDir.x, 0.35, uSunDir.z)));
  // Two-tone comic shading: lit side burns orange-pink, shadow side stays deep violet.
  vec3 lit = mix(vec3(0.96, 0.22, 0.42), vec3(1.0, 0.52, 0.18), vSeed);
  vec3 shade = mix(vec3(0.13, 0.06, 0.34), vec3(0.2, 0.05, 0.42), vSeed);
  vec3 side = mix(shade, lit, smoothstep(0.1, 0.16, ndl));
  if (vHero > 0.5) {
    lit = vec3(1.0, 0.79, 0.09);
    shade = vec3(0.12, 0.09, 0.16);
    side = mix(shade, vec3(0.3, 0.16, 0.34), smoothstep(0.1, 0.16, ndl));
  }

  vec3 c = side;
  if (abs(n.y) < 0.5) {
    float u = abs(n.x) > 0.5 ? vWorld.z : vWorld.x;
    vec2 cell = vec2(u / 3.1, vWorld.y / 4.1);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78);
    float r = hash(id + vSeed * 37.0);
    float ratio = vHero > 0.5 ? 0.86 : 0.3;
    float on = step(r, ratio);
    vec3 glow = vHero > 0.5 ? vec3(1.0, 0.82, 0.1) : mix(vec3(1.0, 0.76, 0.2), vec3(0.2, 0.92, 1.0), step(0.86, r / ratio));
    // A few windows flicker, stepped so it reads as drawn animation.
    float flick = step(0.04, abs(hash(id + floor(uTime * 3.0)) - 0.5));
    vec3 dark = side * 0.55;
    c = mix(c, mix(dark, glow, on * flick), win * smoothstep(1400.0, 500.0, vDist));
    // Light rim at the very top of each building, like an inked highlight.
    c = mix(c, c + vec3(0.06, 0.03, 0.1), step(0.98, fract(vWorld.y / 41.0)));
  } else {
    c = vHero > 0.5 ? vec3(0.1, 0.07, 0.14) : shade * 0.82;
  }

  // Colour haze swallows distance, which gives the city its depth.
  float fog = 1.0 - exp(-vDist * 0.0019);
  vec3 haze = mix(vec3(0.98, 0.16, 0.42), vec3(0.42, 0.08, 0.58), smoothstep(10.0, 190.0, vWorld.y));
  c = mix(c, haze, fog * 0.9);
  gl_FragColor = vec4(c, 1.0);
}`;

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const GROUND_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorld;
uniform vec3 uCam;
void main() {
  vec2 p = vWorld.xz;
  vec2 g = abs(mod(p + 20.0, 40.0) - 20.0); // distance from the block centre
  float road = step(13.5, max(g.x, g.y));
  vec3 c = mix(vec3(0.1, 0.05, 0.22), vec3(0.06, 0.04, 0.13), road);
  // Dashes down the middle of each road.
  float dx = step(19.6, g.x) * step(0.5, fract(p.y / 9.0));
  float dz = step(19.6, g.y) * step(0.5, fract(p.x / 9.0));
  c = mix(c, vec3(1.0, 0.79, 0.09), max(dx, dz) * road);
  float edge = step(13.5, max(g.x, g.y)) - step(14.2, max(g.x, g.y));
  c = mix(c, vec3(0.86, 0.14, 0.5), edge);
  float d = length(vWorld - uCam);
  float fog = 1.0 - exp(-d * 0.0019);
  c = mix(c, vec3(0.98, 0.16, 0.42), fog * 0.92);
  gl_FragColor = vec4(c, 1.0);
}`;

export const COMIC_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const COMIC_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uTick;    // steps 12 times a second: everything hand-drawn boils on this
uniform float uSpeed;   // 0 at rest, 1 in free fall
uniform float uNear;
uniform float uFar;
uniform float uPx;      // device pixel scale
uniform float uFlash;

float linearDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  float l = (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  return l / uFar;
}
float hash(float x) { return fract(sin(x * 91.17) * 43758.5453); }
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

void main() {
  vec2 px = 1.0 / uRes;
  // Boil: the whole drawing shifts by under a pixel, 12 times a second.
  vec2 boil = (vec2(hash(uTick), hash(uTick + 7.0)) - 0.5) * px * 1.2 * uPx;
  vec2 uv = vUv + boil;

  float d = linearDepth(uv);
  // Spider-Verse's trick: out-of-focus things split into off-register colour rather than blur.
  float split = (0.0016 + smoothstep(0.02, 0.5, d) * 0.0052 + uSpeed * 0.0085);
  vec2 axis = normalize(vec2(1.0, 0.32));
  vec2 fromCenter = (vUv - 0.5);
  vec2 off = axis * split + fromCenter * uSpeed * 0.012;
  vec3 col = vec3(
    texture2D(tColor, uv + off).r,
    texture2D(tColor, uv).g,
    texture2D(tColor, uv - off).b
  );

  // Ink lines, from jumps in depth and colour.
  float t = 1.25 * uPx;
  vec2 e = px * t;
  float dl = linearDepth(uv - vec2(e.x, 0.0)), dr = linearDepth(uv + vec2(e.x, 0.0));
  float du = linearDepth(uv + vec2(0.0, e.y)), db = linearDepth(uv - vec2(0.0, e.y));
  float depthEdge = (abs(dl - dr) + abs(du - db)) / max(d, 0.004);
  float ll = lum(texture2D(tColor, uv - vec2(e.x, 0.0)).rgb), lr = lum(texture2D(tColor, uv + vec2(e.x, 0.0)).rgb);
  float lu = lum(texture2D(tColor, uv + vec2(0.0, e.y)).rgb), lb = lum(texture2D(tColor, uv - vec2(0.0, e.y)).rgb);
  float colorEdge = abs(ll - lr) + abs(lu - lb);
  float nearFade = smoothstep(0.75, 0.2, d);
  float ink = max(smoothstep(0.12, 0.3, depthEdge) * nearFade, smoothstep(0.34, 0.6, colorEdge) * nearFade * 0.8);

  // Print dots: size follows darkness, on a rotated grid like a real press.
  vec3 base = col;
  float l = lum(base);
  float size = 7.0 * uPx;
  float ang = 0.44;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 frag = rot * (vUv * uRes);
  vec2 cell = fract(frag / size) - 0.5;
  float r = sqrt(clamp(1.0 - l * 1.25, 0.0, 1.0)) * 0.47;
  float dots = smoothstep(r + 0.05, r - 0.05, length(cell));
  vec3 shadowInk = base * vec3(0.5, 0.36, 0.68);
  // The sky gets lighter dots, so the print texture doesn't fight the drawing.
  float skyMask = step(0.88, d);
  col = mix(base, shadowInk, dots * mix(0.8, 0.26, skyMask));

  // Light dots across bright areas, in a second colour.
  vec2 frag2 = mat2(cos(1.1), -sin(1.1), sin(1.1), cos(1.1)) * (vUv * uRes);
  vec2 cell2 = fract(frag2 / (size * 1.1)) - 0.5;
  float hi = smoothstep(0.72, 0.95, l) * (1.0 - skyMask);
  col = mix(col, col * vec3(1.0, 0.82, 0.74), smoothstep(0.26, 0.2, length(cell2)) * hi * 0.5);

  // Hatching in the deepest shadow.
  float hatch = step(0.62, fract((vUv.x * uRes.x + vUv.y * uRes.y) / (5.0 * uPx)));
  col = mix(col, col * 0.58, hatch * smoothstep(0.14, 0.05, l));

  col = mix(col, vec3(0.035, 0.02, 0.07), clamp(ink, 0.0, 1.0));

  // Speed lines burst out from the centre during the fall.
  if (uSpeed > 0.02) {
    vec2 c = vUv - 0.5;
    c.x *= uRes.x / uRes.y;
    float a = atan(c.y, c.x);
    float slice = floor((a + 3.1416) * 44.0);
    float on = step(0.68, hash(slice + floor(uTick / 2.0) * 13.0));
    float reach = 0.26 + hash(slice * 3.1) * 0.5;
    float line = on * smoothstep(reach, reach + 0.14, length(c));
    float widthGate = step(abs(fract((a + 3.1416) * 44.0) - 0.5), 0.1 + uSpeed * 0.2);
    col = mix(col, mix(vec3(1.0), vec3(0.04, 0.02, 0.07), step(0.5, hash(slice))), line * widthGate * uSpeed);
  }

  // Dotted vignette at the edge of the page.
  vec2 v = vUv - 0.5;
  float vig = smoothstep(0.34, 0.74, length(v));
  float vigDot = smoothstep(0.42, 0.36, length(fract(frag / (size * 1.5)) - 0.5));
  col = mix(col, col * vec3(0.32, 0.18, 0.5), vig * vigDot * 0.45);

  // A white frame on impacts.
  col = mix(col, vec3(1.0, 0.96, 0.82), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;
