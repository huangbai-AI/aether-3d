/* ═══════════════════════════════════════════════════════════
   AETHER — Interstellar Voyage Division
   Fully procedural WebGL deep-space scene.
   Planet / atmosphere / rings / moon / nebula / starfield —
   no external assets, everything generated in GLSL.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

/* ────────────────────────── SETUP ────────────────────────── */

const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const DEBUG_P = params.has('p') ? parseFloat(params.get('p')) : null;
const NO_UI = params.has('noui');

const isCoarse = window.matchMedia('(pointer: coarse)').matches;
const isMobile = isCoarse || window.innerWidth < 760;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.75 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020208);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 0.7, 11);

const SUN_DIR = new THREE.Vector3(-0.8, 0.3, 0.6).normalize();

// key light — only affects standard materials (asteroid belt);
// all custom shaders take SUN_DIR as a uniform instead
const sunLight = new THREE.DirectionalLight(0xfff2e0, 1.7);
sunLight.position.copy(SUN_DIR).multiplyScalar(20);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x2a3a55, 0.4));

/* ────────────────────── SHARED GLSL NOISE ────────────────────── */

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(11.3);
      a *= 0.5;
    }
    return v;
  }
`;

/* ────────────────────── NEBULA DOME ────────────────────── */

const nebula = new THREE.Mesh(
  new THREE.SphereGeometry(240, 40, 40),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float n1 = fbm(d * 2.6 + vec3(3.7));
        float n2 = fbm(d * 5.2 - vec3(1.3));
        float n3 = fbm(d * 3.4 + vec3(9.1));
        vec3 col = vec3(0.006, 0.008, 0.020);
        col += vec3(0.055, 0.030, 0.110) * smoothstep(0.42, 0.85, n1);   // violet clouds
        col += vec3(0.000, 0.055, 0.075) * smoothstep(0.48, 0.90, n2);   // teal wisps
        col += vec3(0.065, 0.026, 0.010) * smoothstep(0.60, 0.95, n3);   // faint embers
        col *= 0.85 + 0.15 * sin(uTime * 0.05 + n1 * 6.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
scene.add(nebula);

/* ────────────────────── STARFIELD ────────────────────── */

function makeStars(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const cWhite = new THREE.Color(0xdfe9ff);
  const cCyan = new THREE.Color(0x8ff4ff);
  const cWarm = new THREE.Color(0xffd9a8);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // random point on shell
    const r = 60 + Math.pow(Math.random(), 0.6) * 150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    size[i] = 0.5 + Math.pow(Math.random(), 2.4) * 2.4;
    phase[i] = Math.random();

    const pick = Math.random();
    tmp.copy(pick < 0.72 ? cWhite : pick < 0.88 ? cCyan : cWarm);
    const dimmer = 0.45 + Math.random() * 0.55;
    color[i * 3]     = tmp.r * dimmer;
    color[i * 3 + 1] = tmp.g * dimmer;
    color[i * 3 + 2] = tmp.b * dimmer;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        float tw = 0.70 + 0.30 * sin(uTime * (0.5 + aPhase) + aPhase * 40.0);
        vColor = aColor * tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });

  return new THREE.Points(geo, mat);
}

const stars = makeStars(isMobile ? 3800 : 7500);
scene.add(stars);

/* ────────────────────── DRIFTING DUST ────────────────────── */

function makeDust(count) {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 36;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 24;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    phase[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.07 + aPhase * 6.2831) * 1.4;
        p.y += cos(uTime * 0.05 + aPhase * 4.0) * 1.0;
        p.z += sin(uTime * 0.06 + aPhase * 9.0) * 1.2;
        vA = 0.5 + 0.5 * sin(uTime * 0.4 + aPhase * 20.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.8 + aPhase * 1.3) * uPixelRatio * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * 0.07 * vA;
        gl_FragColor = vec4(vec3(0.55, 0.85, 0.95), a);
      }
    `,
  });
  return new THREE.Points(geo, mat);
}

const dust = makeDust(isMobile ? 320 : 700);
scene.add(dust);

/* ────────────────────── PLANET ────────────────────── */

const PLANET_R = 2.3;
const RING_IN = PLANET_R * 1.5;
const RING_OUT = PLANET_R * 2.55;
const RING_TILT = new THREE.Euler(-1.12, 0.0, 0.32);
const RING_NORMAL = new THREE.Vector3(0, 0, 1).applyEuler(RING_TILT).normalize();

const planetGroup = new THREE.Group();
scene.add(planetGroup);

const planetUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR },
  uRingNormal: { value: RING_NORMAL },
  uRingIn: { value: RING_IN },
  uRingOut: { value: RING_OUT },
};

const planet = new THREE.Mesh(
  new THREE.SphereGeometry(PLANET_R, 96, 96),
  new THREE.ShaderMaterial({
    uniforms: planetUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uRingNormal;
      uniform float uRingIn;
      uniform float uRingOut;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 p = normalize(vPos);
        vec3 viewDir = normalize(cameraPosition - vWorld);

        float warp = fbm(p * 2.2 + vec3(0.0, uTime * 0.008, 0.0));
        float cont = fbm(p * 3.1 + vec3(warp * 1.6) + vec3(4.7));
        float det  = fbm(p * 11.0 + vec3(cont * 2.0));

        vec3 deep    = vec3(0.008, 0.024, 0.075);
        vec3 shallow = vec3(0.028, 0.195, 0.265);
        vec3 land    = vec3(0.360, 0.155, 0.070);
        vec3 high    = vec3(0.560, 0.360, 0.195);

        float landMask = smoothstep(0.48, 0.56, cont);
        vec3 col = mix(deep, shallow, smoothstep(0.20, 0.50, cont));
        col = mix(col, land, landMask * smoothstep(0.30, 0.60, det));
        col = mix(col, high, landMask * smoothstep(0.62, 0.85, det));

        // polar ice
        float ice = smoothstep(0.84, 0.96, abs(p.y) + det * 0.08);
        col = mix(col, vec3(0.60, 0.67, 0.78), ice * 0.75);

        // drifting clouds
        float cl = fbm(p * 4.5 + vec3(uTime * 0.020, 0.0, uTime * 0.010) + vec3(8.2));
        float clouds = smoothstep(0.52, 0.72, cl);

        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.18, 0.55, ndl);
        vec3 lit = col * (0.08 + 0.88 * day);
        lit = mix(lit, vec3(0.75, 0.82, 0.90) * (0.08 + day) * 0.9, clouds * 0.35);

        // amber terminator band
        float term = exp(-abs(ndl) * 5.0);
        lit += vec3(0.95, 0.42, 0.16) * term * 0.22;

        // ── ring shadow cast onto the surface (analytic plane intersection)
        vec3 S = normalize(uSunDir);
        vec3 RN = normalize(uRingNormal);
        float denom = dot(S, RN);
        if (abs(denom) > 1e-4) {
          float tS = -dot(vWorld, RN) / denom;
          if (tS > 0.0) {
            vec3 Q = vWorld + S * tS;
            float r = length(Q);
            float rn = (r - uRingIn) / (uRingOut - uRingIn);
            if (rn > 0.0 && rn < 1.0) {
              float dens = smoothstep(0.25, 0.75, fbm(vec3(r * 2.4, 0.0, 3.3))) * 0.6
                         + smoothstep(0.30, 0.80, noise(vec3(r * 9.0, 0.0, 7.7))) * 0.4;
              dens *= 0.30 + 0.70 * smoothstep(0.015, 0.09, abs(rn - 0.42));
              float edge = smoothstep(0.0, 0.10, rn) * smoothstep(1.0, 0.86, rn);
              lit *= 1.0 - dens * edge * 0.88;
            }
          }
        }

        // night-side city lights
        float night = 1.0 - day;
        float cities = step(0.982, noise(p * 90.0)) * landMask;
        lit += vec3(1.0, 0.75, 0.40) * cities * night * 0.55;

        // cyan fresnel rim
        float fr = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        lit += vec3(0.30, 0.68, 0.85) * fr * (0.10 + 0.55 * day);

        gl_FragColor = vec4(lit * 0.82, 1.0);
      }
    `,
  })
);
planetGroup.add(planet);

/* ────────────── ATMOSPHERE SHELL ────────────── */

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(PLANET_R * 1.24, 64, 64),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float rim = pow(1.0 - abs(dot(n, viewDir)), 5.2);
        float sunF = 0.25 + 0.75 * max(dot(n, uSunDir), 0.0);
        vec3 col = mix(vec3(0.12, 0.35, 0.70), vec3(0.45, 0.85, 1.00), rim);
        gl_FragColor = vec4(col * rim * 0.32 * sunF, rim * 0.45);
      }
    `,
  })
);
planetGroup.add(atmosphere);

/* ────────────── RING SYSTEM ────────────── */

const ringGroup = new THREE.Group();
ringGroup.rotation.copy(RING_TILT);
planetGroup.add(ringGroup);

const rings = new THREE.Mesh(
  new THREE.RingGeometry(RING_IN, RING_OUT, 160, 1),
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uInner: { value: RING_IN },
      uOuter: { value: RING_OUT },
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR },
      uPlanetR: { value: PLANET_R },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vWorld;
      void main() {
        vLocal = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uInner;
      uniform float uOuter;
      uniform vec3 uSunDir;
      uniform float uPlanetR;
      varying vec3 vLocal;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        float r = length(vLocal.xy);
        float rn = (r - uInner) / (uOuter - uInner);
        float bands  = fbm(vec3(r * 2.4, 0.0, 3.3));
        float bands2 = noise(vec3(r * 9.0, 0.0, 7.7));
        float density = smoothstep(0.25, 0.75, bands) * 0.6
                      + smoothstep(0.30, 0.80, bands2) * 0.4;
        // Cassini-style division
        density *= 0.30 + 0.70 * smoothstep(0.015, 0.09, abs(rn - 0.42));
        float edge = smoothstep(0.0, 0.06, rn) * smoothstep(1.0, 0.80, rn);
        vec3 col = mix(vec3(0.38, 0.48, 0.62), vec3(0.62, 0.52, 0.40), bands2);
        float a = density * edge * 0.24;

        // ── planet shadow cast onto the rings (analytic sphere occlusion)
        vec3 S = normalize(uSunDir);
        float tOc = -dot(vWorld, S);
        if (tOc > 0.0) {
          float d = length(vWorld + S * tOc);
          float umbra = smoothstep(uPlanetR * 0.92, uPlanetR * 1.18, d);
          a *= mix(0.10, 1.0, umbra);
        }

        gl_FragColor = vec4(col * a, a);
      }
    `,
  })
);
ringGroup.add(rings);

/* ────────────── MOON ────────────── */

const moonPivot = new THREE.Group();
planetGroup.add(moonPivot);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.46, 48, 48),
  new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 p = normalize(vPos);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float mott = fbm(p * 6.0 + vec3(2.2));
        vec3 col = mix(vec3(0.30, 0.30, 0.35), vec3(0.62, 0.62, 0.66), smoothstep(0.3, 0.7, mott));
        float ndl = max(dot(n, uSunDir), 0.0);
        col *= 0.05 + 1.0 * ndl;
        float fr = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        col += vec3(0.30, 0.50, 0.70) * fr * ndl * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
moon.position.set(5.4, 1.35, 0);
moonPivot.add(moon);

/* ────────────── ASTEROID BELT ────────────── */

function makeAsteroidGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const posAttr = geo.attributes.position;
  const vtx = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    vtx.fromBufferAttribute(posAttr, i);
    const k = 0.72 + Math.abs(Math.sin(vtx.x * 12.9 + vtx.y * 7.7 + vtx.z * 5.3)) * 0.55;
    vtx.multiplyScalar(k);
    posAttr.setXYZ(i, vtx.x, vtx.y, vtx.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const AST_COUNT = isMobile ? 260 : 620;
const asteroids = new THREE.InstancedMesh(
  makeAsteroidGeometry(),
  new THREE.MeshStandardMaterial({
    color: 0x6b625a,
    roughness: 0.98,
    metalness: 0.03,
    flatShading: true,
  }),
  AST_COUNT
);
{
  const dummy = new THREE.Object3D();
  const tiltM = new THREE.Matrix4().makeRotationFromEuler(RING_TILT);
  for (let i = 0; i < AST_COUNT; i++) {
    const r = 7.0 + Math.pow(Math.random(), 1.4) * 2.8;
    const ang = Math.random() * Math.PI * 2;
    const y = (Math.random() + Math.random() - 1) * 0.4;
    dummy.position
      .set(Math.cos(ang) * r, y, Math.sin(ang) * r)
      .applyMatrix4(tiltM);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(0.025 + Math.pow(Math.random(), 2.2) * 0.08);
    dummy.updateMatrix();
    asteroids.setMatrixAt(i, dummy.matrix);
  }
  asteroids.instanceMatrix.needsUpdate = true;
}
scene.add(asteroids);

/* ────────────── DISTANT SUN GLOW ────────────── */

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.0, 'rgba(255, 244, 224, 1)');
  g.addColorStop(0.18, 'rgba(255, 214, 160, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 170, 110, 0.14)');
  g.addColorStop(1.0, 'rgba(255, 150, 90, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  })
);
sunGlow.position.copy(SUN_DIR).multiplyScalar(180);
sunGlow.scale.setScalar(64);
sunGlow.material.opacity = 0.55;
scene.add(sunGlow);

/* ────────────── ANAMORPHIC SUN STREAK ────────────── */

function makeStreakTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0.0, 'rgba(255, 210, 160, 0)');
  g.addColorStop(0.5, 'rgba(255, 236, 210, 0.9)');
  g.addColorStop(1.0, 'rgba(255, 210, 160, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunStreak = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeStreakTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.4,
  })
);
sunStreak.position.copy(sunGlow.position);
sunStreak.scale.set(150, 2.2, 1);
scene.add(sunStreak);

/* ────────────── NEBULA GLOW BLOBS ────────────── */

function makeColorGlowTexture(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0.85)`);
  grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.28)`);
  grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

[
  { c: [107, 77, 255], pos: [-120, 42, -85], s: 175, o: 0.15 },  // violet
  { c: [25, 190, 215], pos: [105, -55, -115], s: 150, o: 0.12 }, // teal
  { c: [255, 115, 50], pos: [62, 75, 125], s: 120, o: 0.10 },    // ember
].forEach(({ c, pos, s, o }) => {
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeColorGlowTexture(c[0], c[1], c[2]),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: o,
    })
  );
  spr.position.set(pos[0], pos[1], pos[2]);
  spr.scale.setScalar(s);
  scene.add(spr);
});

/* ────────────────────── COMETS ────────────────────── */

const COMET_TRAIL = 26;
const comets = [];
let nextCometAt = 4 + Math.random() * 5;

function spawnComet(start, velocity, life) {
  const head = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    })
  );
  head.scale.setScalar(1.1);
  head.position.copy(start);
  scene.add(head);

  const positions = new Float32Array(COMET_TRAIL * 3);
  const colors = new Float32Array(COMET_TRAIL * 3);
  for (let i = 0; i < COMET_TRAIL; i++) {
    positions.set([start.x, start.y, start.z], i * 3);
    const f = Math.pow(1 - i / (COMET_TRAIL - 1), 1.6);
    colors.set([0.75 * f, 0.94 * f, 1.0 * f], i * 3);
  }
  const geo = new LineGeometry();
  geo.setPositions(Array.from(positions));
  geo.setColors(Array.from(colors));
  const mat = new LineMaterial({
    linewidth: 2.4,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mat.resolution.set(window.innerWidth, window.innerHeight);
  const line = new Line2(geo, mat);
  line.frustumCulled = false;
  scene.add(line);

  comets.push({ head, line, velocity, life, age: 0, trail: Array.from({ length: COMET_TRAIL }, () => start.clone()) });
}

function spawnRandomComet() {
  const start = new THREE.Vector3(
    (Math.random() - 0.5) * 44,
    6 + Math.random() * 14,
    -20 + Math.random() * 18
  );
  const dir = new THREE.Vector3(
    (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 5),
    -(1.5 + Math.random() * 2.5),
    (Math.random() - 0.5) * 3
  );
  spawnComet(start, dir, 2.8 + Math.random() * 1.6);
}

function updateComets(dt) {
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i];
    c.age += dt;
    c.head.position.addScaledVector(c.velocity, dt);
    c.trail.unshift(c.head.position.clone());
    c.trail.length = COMET_TRAIL;

    const flat = [];
    for (const p of c.trail) flat.push(p.x, p.y, p.z);
    c.line.geometry.setPositions(flat);

    // fast fade-in, fade-out only near end of life
    const env = Math.min(1, c.age / 0.4) * (1 - THREE.MathUtils.smoothstep(c.age, c.life - 0.8, c.life));
    c.head.material.opacity = env * 0.9;
    c.line.material.opacity = env * 0.85;

    if (c.age >= c.life) {
      scene.remove(c.head, c.line);
      c.head.material.dispose();
      c.line.geometry.dispose();
      c.line.material.dispose();
      comets.splice(i, 1);
    }
  }
}

// debug: ?comet=2 spawns persistent comets on photogenic paths
if (params.has('comet')) {
  const n = parseInt(params.get('comet'), 10) || 1;
  const paths = [
    [new THREE.Vector3(-17, 6.5, -6), new THREE.Vector3(8.5, -1.4, 1.6)],
    [new THREE.Vector3(15, 9, -12), new THREE.Vector3(-7.5, -2.2, 2.2)],
    [new THREE.Vector3(-6, 12, -16), new THREE.Vector3(3.5, -3.2, 2.6)],
  ];
  for (let i = 0; i < Math.min(n, paths.length); i++) {
    spawnComet(paths[i][0], paths[i][1], 60);
  }
}

/* ────────────────────── POST-PROCESSING ────────────────────── */

const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
  samples: (isMobile || DEBUG_P !== null) ? 0 : 4,
  type: THREE.HalfFloatType,
});
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(size.clone(), 0.55, 0.35, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// hyperspace warp — radial zoom blur driven by scroll velocity
const warpPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 dir = vec2(0.5) - uv;
      vec3 sharp = texture2D(tDiffuse, uv).rgb;
      vec3 acc = vec3(0.0);
      float tot = 0.0;
      for (int i = 0; i < 12; i++) {
        float f = float(i) / 11.0;
        float w = 1.0 - 0.6 * f;
        acc += texture2D(tDiffuse, uv + dir * f * uStrength).rgb * w;
        tot += w;
      }
      float m = smoothstep(0.0015, 0.02, uStrength);
      gl_FragColor = vec4(mix(sharp, acc / tot, m), 1.0);
    }
  `,
});
composer.addPass(warpPass);

const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash2(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      // chromatic aberration toward edges
      float ab = 0.006 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ab).b;
      // vignette
      float vig = smoothstep(0.98, 0.32, r2 * 1.55);
      col *= mix(0.52, 1.0, vig);
      // film grain
      float g = hash2(uv * vec2(1920.0, 1080.0) + fract(uTime) * 7.13) - 0.5;
      col += g * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(gradePass);

/* ────────────────────── CAMERA FLIGHT PATH ────────────────────── */

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

const camPath = new THREE.CatmullRomCurve3([
  v3(0.0, 0.7, 11.0),   // 01 hero — wide establish
  v3(3.7, 0.9, 6.3),    // 02 manifesto — swing in close
  v3(-4.9, 1.6, 4.6),   // 03 destinations — cross to far side
  v3(-1.4, 5.4, 5.6),   // 04 telemetry — rise above the ring plane
  v3(0.0, 1.5, 16.5),   // 05 departure — pull far back
], false, 'catmullrom', 0.35);

const lookPath = new THREE.CatmullRomCurve3([
  v3(0, 0.2, 0),
  v3(0.3, 0.15, 0),
  v3(0, 0.1, 0),
  v3(0, -0.4, 0),
  v3(0, 0, 0),
], false, 'catmullrom', 0.35);

const scroll = { target: 0, current: 0 };
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
const warp = { prevP: 0, current: 0 };
const DEBUG_WARP = params.has('warp') ? parseFloat(params.get('warp')) : null;

function updateScrollTarget() {
  if (DEBUG_P !== null) {
    scroll.target = scroll.current = THREE.MathUtils.clamp(DEBUG_P, 0, 1);
    return;
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scroll.target = max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
}
window.addEventListener('scroll', updateScrollTarget, { passive: true });
updateScrollTarget();

window.addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

/* ────────────────────── HUD ────────────────────── */

const hudCoords = document.getElementById('hud-coords');
const hudSectionLabel = document.getElementById('hud-section-label');
const hudProgressFill = document.getElementById('hud-progress-fill');
const reticle = document.getElementById('reticle');
const retLabel = document.getElementById('ret-label');
const _proj = new THREE.Vector3();

function updateReticle() {
  if (NO_UI || !reticle) return;
  _proj.set(0, 0, 0).project(camera);
  if (_proj.z > 1 || _proj.z < -1) {
    reticle.style.opacity = '0';
    return;
  }
  const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
  const dist = camera.position.length();
  const projFactor = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const pxRadius = (PLANET_R / dist) * projFactor;
  const d = THREE.MathUtils.clamp(pxRadius * 3.4, 72, window.innerHeight * 0.82);
  reticle.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  reticle.style.width = reticle.style.height = `${d.toFixed(0)}px`;
  reticle.style.opacity = '0.55';
  retLabel.textContent = `KEPLER-186F · DIST ${(dist * 0.86).toFixed(2)} AU`;
}

const SECTIONS = [
  { at: 0.00, label: '01 — ORIGIN 原点' },
  { at: 0.16, label: '02 — MANIFESTO 宣言' },
  { at: 0.42, label: '03 — DESTINATIONS 目的地' },
  { at: 0.66, label: '04 — TELEMETRY 遥测' },
  { at: 0.86, label: '05 — DEPARTURE 启程' },
];
let currentSectionLabel = '';

function updateHUD(p) {
  if (NO_UI) return;
  hudProgressFill.style.height = `${(p * 100).toFixed(1)}%`;
  let label = SECTIONS[0].label;
  for (const s of SECTIONS) if (p >= s.at) label = s.label;
  if (label !== currentSectionLabel) {
    currentSectionLabel = label;
    hudSectionLabel.textContent = label;
  }
  const cp = camera.position;
  hudCoords.textContent =
    `RA ${(cp.x * 3.7 + 128).toFixed(2)}° / DEC ${(cp.y * 3.7 >= 0 ? '+' : '−')}${Math.abs(cp.y * 3.7).toFixed(2)}° / Z ${cp.z.toFixed(2)}`;
}

if (NO_UI) {
  document.getElementById('content').style.display = 'none';
  document.querySelector('.hud').style.display = 'none';
  document.querySelector('.grain').style.display = 'none';
}

/* ────────────────────── RENDER LOOP ────────────────────── */

const clock = new THREE.Clock();
const camPos = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
let firstFrameRendered = false;
let frameCount = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // smooth scroll + mouse
  scroll.current += (scroll.target - scroll.current) * Math.min(1, dt * 3.4);
  mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 5.0);
  mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 5.0);

  // animate world
  planet.rotation.y += dt * 0.03;
  rings.rotation.z += dt * 0.018;
  moonPivot.rotation.y += dt * 0.09;
  stars.rotation.y += dt * 0.004;

  planetUniforms.uTime.value = t;
  stars.material.uniforms.uTime.value = t;
  dust.material.uniforms.uTime.value = t;
  nebula.material.uniforms.uTime.value = t;
  gradePass.uniforms.uTime.value = t;

  // asteroid precession + comets
  asteroids.rotation.y += dt * 0.008;
  if (t > nextCometAt) {
    spawnRandomComet();
    nextCometAt = t + 4 + Math.random() * 6;
  }
  updateComets(dt);

  // hyperspace warp from scroll velocity
  const pVel = Math.abs(scroll.current - warp.prevP) / Math.max(dt, 1e-4);
  warp.prevP = scroll.current;
  const warpTarget = DEBUG_WARP !== null
    ? DEBUG_WARP
    : Math.min(0.085, pVel * 0.045);
  warp.current += (warpTarget - warp.current) * Math.min(1, dt * 5);
  warpPass.uniforms.uStrength.value = reducedMotion ? 0 : warp.current;

  // camera along spline
  const p = THREE.MathUtils.clamp(scroll.current, 0, 1);
  camPath.getPoint(p, camPos);
  lookPath.getPoint(p, lookTarget);

  if (!reducedMotion) {
    camPos.x += Math.sin(t * 0.50) * 0.06;
    camPos.y += Math.cos(t * 0.34) * 0.05;
  }
  camera.position.copy(camPos);
  lookTarget.x += mouse.sx * 0.55;
  lookTarget.y -= mouse.sy * 0.38;
  camera.lookAt(lookTarget);

  composer.render();

  if (!firstFrameRendered) {
    firstFrameRendered = true;
  }
  frameCount++;
  if (frameCount % 5 === 0) updateHUD(p);
  updateReticle();

  requestAnimationFrame(tick);
}
tick();

/* ────────────────────── RESIZE ────────────────────── */

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  const pr = renderer.getPixelRatio();
  stars.material.uniforms.uPixelRatio.value = pr;
  dust.material.uniforms.uPixelRatio.value = pr;
  comets.forEach((c) => c.line.material.resolution.set(w, h));
  updateScrollTarget();
});

/* ══════════════════════ UI LAYER ══════════════════════ */

/* ────────────── LOADER ────────────── */

const loader = document.getElementById('loader');
const loaderNum = document.getElementById('loader-num');
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');

let fontsReady = false;
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { fontsReady = true; });
} else {
  fontsReady = true;
}

const loadState = { shown: 0, done: false };
let forceComplete = false;
// safety net: never hold the site hostage for slow networks/devices
setTimeout(() => { forceComplete = true; }, 3200);

const STATUS_LINES = [
  'CALIBRATING NAVIGATION ARRAY…',
  'CHARTING TRAJECTORIES…',
  'SPOOLING GRAVITY DRIVE…',
  'CLEARANCE GRANTED.',
];

function loaderTick() {
  if (loadState.done) return;

  let target = 30;
  if (fontsReady) target = 62;
  if ((fontsReady && firstFrameRendered) || forceComplete) target = 100;

  loadState.shown += (target - loadState.shown) * 0.055;
  if (target === 100 && loadState.shown > 99.2) loadState.shown = 100;

  const n = Math.floor(loadState.shown);
  loaderNum.textContent = String(n).padStart(3, '0');
  loaderFill.style.width = `${loadState.shown}%`;
  loaderStatus.textContent =
    STATUS_LINES[Math.min(STATUS_LINES.length - 1, Math.floor(loadState.shown / 28))];

  if (loadState.shown >= 100) {
    loadState.done = true;
    finishLoading();
    return;
  }
  requestAnimationFrame(loaderTick);
}
if (DEBUG_P !== null) {
  // debug screenshot mode: deterministic final state, minimal frames required
  loadState.done = true;
  loader.style.display = 'none';
  requestAnimationFrame(() => {
    scroll.current = scroll.target = THREE.MathUtils.clamp(DEBUG_P, 0, 1);
    // headless screenshot quirk: real window scroll blanks the fixed canvas,
    // so shift the content with a transform instead
    const max = document.documentElement.scrollHeight - window.innerHeight;
    document.getElementById('content').style.transform =
      `translateY(${(-scroll.target * max).toFixed(0)}px)`;
  });
  // smoke-test the real intro code path (split + scrolltriggers + gsap timeline)
  if (params.has('smoke')) finishLoading();
} else {
  requestAnimationFrame(loaderTick);
}

function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  const frag = document.createDocumentFragment();
  for (const ch of Array.from(text)) {
    const outer = document.createElement('span');
    outer.className = 'char';
    const inner = document.createElement('span');
    inner.className = 'char-inner';
    inner.textContent = ch === ' ' ? ' ' : ch;
    outer.appendChild(inner);
    frag.appendChild(outer);
  }
  el.appendChild(frag);
  return el.querySelectorAll('.char-inner');
}

function finishLoading() {
  const hasGsap = typeof window.gsap !== 'undefined';
  if (!hasGsap) {
    loader.style.display = 'none';
    return;
  }

  // split section titles for char reveals
  document.querySelectorAll('[data-split]').forEach(splitChars);
  setupScrollEffects();

  const heroChars = document.querySelectorAll('.ht-char');
  const heroFades = document.querySelectorAll('[data-hero-fade]');
  const hudEls = document.querySelectorAll('.hud-top, .hud-bottom, .hud-progress');

  gsap.set(heroChars, { yPercent: 118 });
  gsap.set(heroFades, { opacity: 0, y: 24 });
  gsap.set(hudEls, { opacity: 0 });

  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.to(loader, {
    yPercent: -100,
    duration: 1.05,
    ease: 'power4.inOut',
    onComplete: () => { loader.style.display = 'none'; },
  })
    .to(heroChars, { yPercent: 0, duration: 1.25, stagger: 0.055 }, '-=0.42')
    .to(heroFades, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, '-=0.75')
    .to(hudEls, { opacity: 1, duration: 1.1, stagger: 0.1 }, '-=0.7');
}

/* ────────────── SCROLL-DRIVEN TEXT EFFECTS ────────────── */

function setupScrollEffects() {
  if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  // char-by-char title reveals
  document.querySelectorAll('[data-split]').forEach((el) => {
    gsap.from(el.querySelectorAll('.char-inner'), {
      yPercent: 118,
      rotate: 5,
      duration: 1.15,
      ease: 'power4.out',
      stagger: 0.032,
      scrollTrigger: { trigger: el, start: 'top 84%' },
    });
  });

  // fade-up blocks
  document.querySelectorAll('[data-fade]').forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 36,
      duration: 1.05,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // manifesto ghost lines — scrubbed slide
  document.querySelectorAll('[data-scrub-line]').forEach((el, i) => {
    const dir = el.classList.contains('mani-line--offset') ? -1 : 1;
    gsap.fromTo(el.querySelector('.ghost'),
      { xPercent: 6 * dir, opacity: 0.05 },
      {
        xPercent: 0,
        opacity: 1,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 42%', scrub: 1.1 },
      });
    gsap.fromTo(el.querySelector('.fill'),
      { xPercent: -5 * dir, opacity: 0 },
      {
        xPercent: 0,
        opacity: 1,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 40%', scrub: 1.1 },
      });
  });

  ScrollTrigger.refresh();
}

/* ────────────── COUNTERS ────────────── */

const counterIO = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    counterIO.unobserve(el);
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const dur = 1900;
    const start = performance.now();
    function step(now) {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 4);
      const val = target * eased;
      el.textContent = val.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}, { threshold: 0.4 });

document.querySelectorAll('[data-count]').forEach((el) => counterIO.observe(el));

/* ────────────── CUSTOM CURSOR ────────────── */

const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');

if (!isCoarse) {
  const cur = { x: -100, y: -100, rx: -100, ry: -100 };
  window.addEventListener('pointermove', (e) => {
    cur.x = e.clientX;
    cur.y = e.clientY;
  }, { passive: true });

  (function cursorTick() {
    cur.rx += (cur.x - cur.rx) * 0.16;
    cur.ry += (cur.y - cur.ry) * 0.16;
    cursorDot.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
    cursorRing.style.transform = `translate(${cur.rx}px, ${cur.ry}px)`;
    requestAnimationFrame(cursorTick);
  })();

  document.addEventListener('pointerover', (e) => {
    if (e.target.closest('[data-hover], a, button, .card')) {
      cursorRing.classList.add('is-hover');
    }
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest('[data-hover], a, button, .card')) {
      cursorRing.classList.remove('is-hover');
    }
  });
}

/* ────────────── CARD TILT ────────────── */

if (!isCoarse && !reducedMotion) {
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg)`;
      card.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

/* ────────────── MAGNETIC BUTTONS ────────────── */

if (!isCoarse && !reducedMotion) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.28}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}
