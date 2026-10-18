// 3D preview: the rider as Biketerra draws it (bind pose or a site pose, nearest-filtered
// 512 texture, palette row repainted), or in the A-pose used for the bake.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Palette cells along the top 32 px row, 32 px each (applyRiderDesign):
// 0 skin, 1 hair, 2 pants, 3-5 socks, 6-7 helmet, 8-9 shoes.
const PALETTE = ['#d9a382', '#3b2a1e', '#15161a', '#f2f2f2', '#f2f2f2', '#f2f2f2', '#f4f4f4', '#202024', '#f4f4f4', '#202024'];

export async function createPreview(container, glbUrl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(container).getPropertyValue('--preview-bg').trim() || '#20232a');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 1.5);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(2.6, 1.5, 0.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0.15, 1.15, 0);
  controls.enableDamping = true;

  // The texture: a 512 canvas with the palette row and the jersey drawn as
  // the site does (jersey first, palette cells repainted on top).
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide });

  const gltf = await new GLTFLoader().loadAsync(glbUrl);
  let riding = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { o.material = material; riding = o; } });
  scene.add(gltf.scene);

  const aGeom = new THREE.BufferGeometry();
  const aMesh = new THREE.Mesh(aGeom, material);
  aMesh.visible = false;
  scene.add(aMesh);

  function setJersey(imageData) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 512, 512);
    if (imageData) ctx.putImageData(imageData, 0, 0);
    PALETTE.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * 32, 0, 32, 32); });
    texture.needsUpdate = true;
  }

  // posed: { position, normal } from the rig; index and uv from the GLB.
  function setAPose(posed, glb) {
    aGeom.setAttribute('position', new THREE.BufferAttribute(posed.position, 3));
    aGeom.setAttribute('normal', new THREE.BufferAttribute(posed.normal, 3));
    aGeom.setAttribute('uv', new THREE.BufferAttribute(glb.uv, 2));
    if (glb.index) aGeom.setIndex(new THREE.BufferAttribute(glb.index, 1));
    aGeom.computeBoundingSphere();
  }

  function showAPose(on) {
    aMesh.visible = on;
    gltf.scene.visible = !on;
  }

  // Pose the rider as the site's avatar preview does: rider_m rebound to the
  // low-LOD rider's skeleton, which an AnimationMixer drives. Stopped is the
  // `mount` clip held at time 0; seated and standing play `pedal.seated` and
  // `pedal.standing`, here frozen at time t. Returns how far the chest bone
  // moved from the bind pose, so callers can reframe.
  // (GLTFLoader drops the dots from node names: spine.3 is spine3.)
  const chest = () => riding.skeleton.getBoneByName('spine3').getWorldPosition(new THREE.Vector3());
  const bindChest = chest();
  async function setPose(lodUrl, clipName, t = 0) {
    const lod = await new GLTFLoader().loadAsync(lodUrl);
    let lodMesh = null;
    lod.scene.traverse((o) => { if (o.isSkinnedMesh) lodMesh = o; });
    lod.scene.visible = false;
    scene.add(lod.scene);
    const mixer = new THREE.AnimationMixer(lod.scene);
    mixer.clipAction(THREE.AnimationClip.findByName(lod.animations, clipName)).play();
    mixer.setTime(t);
    riding.bind(lodMesh.skeleton, lodMesh.bindMatrix);
    scene.updateMatrixWorld(true);
    return chest().sub(bindChest);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Named views for the toolbar.
  const VIEWS = {
    front: [[2.6, 1.3, 0], [0.1, 1.2, 0]],
    back: [[-2.6, 1.3, 0], [0.1, 1.2, 0]],
    side: [[0.3, 1.3, 2.6], [0.1, 1.2, 0]],
    three: [[2.6, 1.5, 0.9], [0.15, 1.15, 0]],
  };
  // A named view, or [position, target] arrays.
  function look(name) {
    const [p, t] = Array.isArray(name) ? name : VIEWS[name];
    camera.position.set(...p);
    controls.target.set(...t);
  }

  setJersey(null);
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  return { setJersey, setAPose, showAPose, setPose, look, riding };
}
