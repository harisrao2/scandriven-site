import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './gallery.js';
gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070b18, 9, 26);
// Big sky dome with a vertical gradient + two coloured glows; colours shift as you scroll
const skyUniforms = {
  top: { value: new THREE.Color(0x03050c) }, bottom: { value: new THREE.Color(0x0a1830) },
  glowA: { value: new THREE.Color(0x00c8ff) }, glowB: { value: new THREE.Color(0x3a5bff) }, time: { value: 0 },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top, bottom, glowA, glowB; uniform float time; varying vec3 vP;
    void main(){
      float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 c = mix(bottom, top, smoothstep(0.35, 0.85, h));
      float a = pow(max(dot(vP, normalize(vec3(0.8 + 0.2*sin(time*0.2), 0.15, -0.6))), 0.0), 6.0);
      float b = pow(max(dot(vP, normalize(vec3(-0.9, 0.05 + 0.1*cos(time*0.15), -0.3))), 0.0), 5.0);
      c += glowA * a * 0.55 + glowB * b * 0.45;
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
scene.add(sky);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(6, 2.5, 7);

// rig = positioned in the layout; car spins inside it, laser stays fixed relative to it
const rig = new THREE.Group(); rig.position.y = -0.9; scene.add(rig);
const car = new THREE.Group(); rig.add(car);

// Clipping plane: the solid car only appears where the laser has passed (world x < laser x)
const revealPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -10);
const state = { reveal: -2.6 };

const meshPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 10);
const pts = new THREE.MeshBasicMaterial({ color: 0x00d8f0, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, clippingPlanes: [meshPlane] });

const loader = new GLTFLoader();
const onError = (e) => console.error('Car model failed to load', e);
// Preview builds embed the model (gzip + base64) so it works without fetching files
if (window.__CAR_GZ_B64) {
  const bytes = Uint8Array.from(atob(window.__CAR_GZ_B64), (c) => c.charCodeAt(0));
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    .then((buf) => {
      // Load textures through <img> (blob: images) instead of fetch(), which the preview page blocks
      const cib = window.createImageBitmap; window.createImageBitmap = undefined;
      try { loader.parse(buf, '', onCarLoaded, onError); } finally { window.createImageBitmap = cib; }
    }).catch(onError);
} else {
  loader.load('models/car.glb', onCarLoaded, undefined, onError);
}
function onCarLoaded(gltf) {
  const inner = gltf.scene;
  // Pearlescent metallic paint: metal base + sparkle flakes + colour-shifting pearl layer + glossy clearcoat
  const flakeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 128 + (Math.random() - 0.5) * 120; img.data[i + 1] = 128 + (Math.random() - 0.5) * 120; img.data[i + 2] = 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); return t; })();
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x0a46c8, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.4,
    normalMap: flakeTex, normalScale: new THREE.Vector2(0.18, 0.18),
    clearcoat: 1, clearcoatRoughness: 0.02, clearcoatNormalScale: new THREE.Vector2(0, 0),
    iridescence: 0.75, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520],
    sheen: 0.6, sheenColor: new THREE.Color(0x4fd8ff), sheenRoughness: 0.35,
  });
  inner.traverse((o) => {
    if (!o.isMesh) return;
    const label = (o.name + ' ' + (o.material.name || '')).toLowerCase();
    if (/ferrari_yellow|license|emblem|logo|badge|manufacturerplate/.test(label)) { o.visible = false; return; } // strip branding
    o.material = /body_color|paint/.test(label) ? paint : o.material.clone();
    // Ferrari model ships with grey placeholder materials; give the cabin, tyres and glass real colours
    const mn = (o.material.name || '').toLowerCase(), m = o.material;
    if (/^leather$|carpet|interior_dark|interior_light|plastic_gray/.test(mn)) m.color?.set(0x141414);
    if (/leather_red/.test(mn)) m.color?.set(0x8a0010);
    if (/tires/.test(mn)) { m.color?.set(0x0d0d0d); m.roughness = 0.9; m.metalness = 0; }
    if (/metal_gray/.test(mn)) { m.color?.set(0x9aa3ad); m.metalness = 1; m.roughness = 0.3; }
    if (/carbon/.test(mn)) m.color?.set(0x1c1f22);
    if (/glass|window/.test(mn + ' ' + o.name.toLowerCase()) && !/red/.test(mn)) { m.map = null; m.color?.set(0x05070a); m.transparent = true; m.opacity = 0.92; m.metalness = 0.3; m.roughness = 0.05; m.needsUpdate = true; } // dark tinted glass / roof
    o.material.clippingPlanes = [revealPlane];
  });
  // Auto-fit any car model: length along x, 4.5 units long, centred, wheels on the ground
  const model = new THREE.Group(); model.add(inner);
  let box = new THREE.Box3().setFromObject(inner), size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) { inner.rotation.y = Math.PI / 2; inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner); size = box.getSize(new THREE.Vector3()); }
  const s = 4.5 / size.x; inner.scale.multiplyScalar(s);
  inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  car.add(model);
  car.updateMatrixWorld(true);

  // Glowing wireframe "scan mesh" over the exterior. An invisible depth-only copy hides
  // the wires on the far side of the car so only the front-facing mesh shows.
  const skip = /interior|leather|carpet|steering|nuts|brake/i;
  const occluderMat = new THREE.MeshBasicMaterial({ clippingPlanes: [meshPlane], colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const scanMesh = new THREE.Group();
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || skip.test(o.name + ' ' + o.material.name)) return;
    const toCar = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (const mat of [occluderMat, pts]) {
      const m = new THREE.Mesh(o.geometry, mat);
      m.matrixAutoUpdate = false; m.matrix.copy(toCar);
      m.renderOrder = mat === occluderMat ? 0 : 1;
      scanMesh.add(m);
    }
  });
  car.add(scanMesh);
  document.body.classList.add('loaded');
}

// Laser scan plane (child of rig, so it lines up with the car on any screen size)
const laserMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true });
const laser = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 1.8), laserMat);
laser.position.set(-2.6, 0.8, 0); car.add(laser); // rides with the car so it always sweeps along its length
const glowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
const laserGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), glowMat);
laserGlow.rotation.y = Math.PI / 2; laser.add(laserGlow);

scene.add(new THREE.AmbientLight(0xffffff, 0.3));
const key = new THREE.DirectionalLight(0x9fefff, 2); key.position.set(5, 5, 5); scene.add(key);
const rimLight = new THREE.DirectionalLight(0x00e5ff, 3); rimLight.position.set(-5, 2, -5); scene.add(rimLight);
const grid = new THREE.GridHelper(40, 80, 0x00a8c8, 0x0d2a3a); grid.position.y = -0.899;
grid.material.transparent = true; grid.material.opacity = 0.35; grid.material.alphaMap = null; scene.add(grid);
// Glossy dark floor that picks up reflections, plus a soft light pool under the car
const fadeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, '#fff'); r.addColorStop(0.35, '#fff'); r.addColorStop(1, '#000');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshBasicMaterial({ color: 0x03060d, alphaMap: fadeTex, transparent: true, depthWrite: false, fog: false }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.905; scene.add(floor);
const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,255,255,0.5)'); r.addColorStop(0.5, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0x00dcff });
const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.002; rig.add(pool);
// Floating dust / data particles drifting through the scene
const DUST = 1400, dustPos = new Float32Array(DUST * 3), dustSpeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) { dustPos[i*3] = (Math.random() - 0.5) * 30; dustPos[i*3+1] = Math.random() * 8 - 0.9; dustPos[i*3+2] = (Math.random() - 0.5) * 30; dustSpeed[i] = 0.002 + Math.random() * 0.006; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({ color: 0x7fe9ff, size: 0.025, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
scene.add(new THREE.Points(dustGeo, dustMat));


// Scroll choreography
const tl = gsap.timeline({ scrollTrigger: { trigger: 'main', start: 'top top', endTrigger: '#book', end: 'top 30%', scrub: 1 } });
tl.to(car.rotation, { y: Math.PI * 2, ease: 'none', duration: 1 }, 0)
  .to(state, { reveal: 2.6, ease: 'none', duration: 0.4 }, 0.15)
  .to(pts, { opacity: 0.06, duration: 0.25 }, 0.4)
  .to(laserMat, { opacity: 0, duration: 0.1 }, 0.55)
  .to(camera.position, { x: 0, y: 1.5, z: 9, duration: 0.45 }, 0.55)
  // Colour story: cool cyan while scanning, warming to red/magenta once the car is revealed
  .to(skyUniforms.glowA.value, { r: 0.1, g: 0.42, b: 1.0, duration: 0.4 }, 0.5)
  .to(skyUniforms.glowB.value, { r: 0.0, g: 0.75, b: 1.0, duration: 0.4 }, 0.5)
  .to(poolMat.color, { r: 0.2, g: 0.55, b: 1.0, duration: 0.4 }, 0.5);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  rig.position.x = w > 800 ? 2.6 : 0;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const _n = new THREE.Vector3(), _p = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime(); skyUniforms.time.value = t;
  for (let i = 0; i < DUST; i++) { let y = dustPos[i*3+1] + dustSpeed[i]; if (y > 7) y = -0.9; dustPos[i*3+1] = y; dustPos[i*3] += Math.sin(t * 0.3 + i) * 0.002; }
  dustGeo.attributes.position.needsUpdate = true;
  grid.position.z = (t * 0.25) % 0.5; // slow treadmill motion
  laser.position.x = state.reveal;
  // Reveal plane follows the car's own length axis as it turns
  car.updateMatrixWorld();
  _n.set(-1, 0, 0).transformDirection(car.matrixWorld);
  _p.set(state.reveal, 0, 0).applyMatrix4(car.matrixWorld);
  revealPlane.setFromNormalAndCoplanarPoint(_n, _p);
  meshPlane.copy(revealPlane).negate(); // wireframe only ahead of the scanner
  glowMat.opacity = 0.08 * laserMat.opacity;
  camera.lookAt(rig.position.x, -0.3, 0);
  renderer.render(scene, camera);
});
