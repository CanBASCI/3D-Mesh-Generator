import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { downloadBlob } from "@/lib/mesh/download";
import { fileStem, imageDataFromFile } from "@/lib/mesh/from-file";
import { buildInflatedMesh } from "@/lib/mesh/inflate";
import { imageDataToTextureCanvas } from "@/lib/mesh/load-image";
import { prepareSprite } from "@/lib/mesh/prepare-sprite";
import { toImageData, type RgbaImage } from "@/lib/mesh/rgba";
import { sampleImages, type SampleGrid } from "@/lib/mesh/sample";
import { buildVoxelInstances } from "@/lib/mesh/voxel";
import type { StageApi, ViewMode } from "@/components/ninja-stage";

export function createNinjaSession(
  host: HTMLElement,
  hooks: {
    getMode: () => ViewMode;
    getPuff: () => number;
    getAutoRotate: () => boolean;
    onStatus: (text: string | null) => void;
    onReady: (api: StageApi) => void;
  },
): { dispose: () => void } {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x0c0c0e, 1);
  host.appendChild(renderer.domElement);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.outline = "none";
  renderer.domElement.style.touchAction = "none";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    32,
    Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1),
    0.05,
    40,
  );
  camera.position.set(1.15, 1.15, 2.55);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.panSpeed = 1.1;
  controls.minDistance = 1.35;
  controls.maxDistance = 5.4;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.58;
  controls.target.set(0, 0.88, 0);
  controls.autoRotateSpeed = 1.15;
  controls.autoRotate = hooks.getAutoRotate();

  scene.add(new THREE.HemisphereLight(0xe8e4dc, 0x1a1a1e, 0.72));
  const key = new THREE.DirectionalLight(0xfff6ea, 1.35);
  key.position.set(2.2, 3.4, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 2;
  key.shadow.camera.bottom = -2;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9d2dc, 0.4);
  fill.position.set(-2.4, 1.4, 1.2);
  scene.add(fill);
  const rimLight = new THREE.DirectionalLight(0xd7dde6, 0.55);
  rimLight.position.set(-0.6, 2.2, -2.6);
  scene.add(rimLight);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.028, 64),
    new THREE.MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.62,
      metalness: 0.08,
    }),
  );
  platform.position.y = -0.014;
  platform.receiveShadow = true;
  scene.add(platform);

  const shadow = makeSoftShadow();
  shadow.position.y = 0.001;
  scene.add(shadow);

  const figure = new THREE.Group();
  figure.position.y = 0.012;
  scene.add(figure);

  let gridRelief: SampleGrid | null = null;
  let gridVoxel: SampleGrid | null = null;
  let texture: THREE.CanvasTexture | null = null;
  let reliefMesh: THREE.Mesh | null = null;
  let voxelMesh: THREE.InstancedMesh | null = null;
  let rebuildTimer = 0;
  let frame = 0;
  let running = true;
  let exportStem = "shinobi";
  let generation = 0;
  let lastSprite: RgbaImage | null = null;
  let showingTrellis = false;

  const reliefMat = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0.04,
    vertexColors: false,
  });
  const voxelGeo = new THREE.BoxGeometry(1, 1, 1);
  const voxelMat = new THREE.MeshStandardMaterial({
    roughness: 0.46,
    metalness: 0.03,
    vertexColors: true,
  });

  let prefab: THREE.Object3D | null = null;
  let gridsReady = false;

  function clearFigure() {
    if (prefab) {
      figure.remove(prefab);
      prefab = null;
    }
    if (reliefMesh) {
      figure.remove(reliefMesh);
      reliefMesh.geometry.dispose();
      reliefMesh = null;
    }
    if (voxelMesh) {
      figure.remove(voxelMesh);
      voxelMesh.dispose();
      voxelMesh = null;
    }
  }

  function applySprite(color: RgbaImage, depth: RgbaImage, name: string) {
    gridRelief = sampleImages(toImageData(color), toImageData(depth), 120);
    gridVoxel = sampleImages(toImageData(color), toImageData(depth), 56);
    const canvas = imageDataToTextureCanvas(toImageData(color));
    texture?.dispose();
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    exportStem = name;
    lastSprite = color;
    showingTrellis = false;
    gridsReady = true;
    rebuild();
    camera.position.set(1.15, 1.15, 2.55);
    controls.target.set(0, 0.88, 0);
    controls.update();
  }

  function rebuild() {
    if (!gridsReady || showingTrellis) return;
    const puff = hooks.getPuff();
    const mode = hooks.getMode();
    clearFigure();
    if (mode === "relief") {
      if (!gridRelief) return;
      const built = buildInflatedMesh(gridRelief, puff);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(built.position, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(built.uv, 2));
      geo.setAttribute("color", new THREE.BufferAttribute(built.color, 3));
      geo.setIndex(new THREE.BufferAttribute(built.index, 1));
      geo.computeVertexNormals();
      reliefMat.map = texture;
      reliefMesh = new THREE.Mesh(geo, reliefMat);
      reliefMesh.castShadow = true;
      reliefMesh.receiveShadow = true;
      figure.add(reliefMesh);
    } else {
      if (!gridVoxel) return;
      const voxels = buildVoxelInstances(gridVoxel, puff);
      voxelMesh = new THREE.InstancedMesh(voxelGeo, voxelMat, voxels.count);
      const dummy = new THREE.Object3D();
      const c = new THREE.Color();
      for (let i = 0; i < voxels.count; i++) {
        dummy.matrix.fromArray(voxels.matrices, i * 16);
        voxelMesh.setMatrixAt(i, dummy.matrix);
        c.setRGB(
          voxels.colors[i * 3]!,
          voxels.colors[i * 3 + 1]!,
          voxels.colors[i * 3 + 2]!,
          THREE.SRGBColorSpace,
        );
        voxelMesh.setColorAt(i, c);
      }
      voxelMesh.instanceMatrix.needsUpdate = true;
      if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true;
      voxelMesh.castShadow = true;
      voxelMesh.receiveShadow = true;
      figure.add(voxelMesh);
    }
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, 40);
  }

  function exportObject() {
    const exportRoot = new THREE.Group();
    if (reliefMesh) {
      const clone = reliefMesh.clone();
      clone.material = reliefMat.clone();
      exportRoot.add(clone);
    } else if (voxelMesh && gridVoxel) {
      exportRoot.add(bakeVoxels(gridVoxel, hooks.getPuff()));
    } else if (prefab) {
      exportRoot.add(prefab.clone(true));
    }
    exportRoot.position.copy(figure.position);
    return exportRoot;
  }

  const api: StageApi = {
    setMode: () => {
      showingTrellis = false;
      scheduleRebuild();
    },
    setPuff: () => {
      if (showingTrellis) return;
      scheduleRebuild();
    },
    setAutoRotate: (value) => {
      controls.autoRotate = value;
    },
    resetCamera: () => {
      camera.position.set(1.15, 1.15, 2.55);
      controls.target.set(0, 0.88, 0);
      controls.update();
    },
    importImage: async (file) => {
      const mine = ++generation;
      hooks.onStatus("Görsel okunuyor…");
      await yieldFrame();
      const raw = await imageDataFromFile(file);
      if (!running || mine !== generation) return;
      hooks.onStatus("3D üretiliyor…");
      await yieldFrame();
      const prepared = prepareSprite(raw);
      if (!running || mine !== generation) return;
      applySprite(prepared.color, prepared.depth, fileStem(file.name));
      hooks.onStatus(null);
    },
    getSpritePng: async () => {
      if (!lastSprite) throw new Error("Önce bir 2D görsel içe aktar.");
      const canvas = imageDataToTextureCanvas(toImageData(lastSprite));
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG yazılamadı"))), "image/png");
      });
      return blob;
    },
    loadTrellisGlb: async (buffer) => {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buffer, "");
      showingTrellis = true;
      clearFigure();
      prefab = gltf.scene;
      fitToPlatform(prefab);
      prefab.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      figure.add(prefab);
      camera.position.set(1.15, 1.15, 2.55);
      controls.target.set(0, 0.88, 0);
      controls.update();
    },
    downloadGLB: async () => {
      const root = exportObject();
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(root, {
        binary: true,
        maxTextureSize: 1024,
      });
      const blob =
        result instanceof ArrayBuffer
          ? new Blob([result], { type: "model/gltf-binary" })
          : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
      downloadBlob(blob, `${exportStem}.glb`);
    },
    downloadSTL: async () => {
      const root = exportObject();
      const exporter = new STLExporter();
      const result = exporter.parse(root, { binary: true });
      const bytes = result instanceof ArrayBuffer ? result : new TextEncoder().encode(String(result));
      downloadBlob(new Blob([bytes], { type: "model/stl" }), `${exportStem}.stl`);
    },
    dispose: () => {},
  };

  function resize() {
    const w = Math.max(host.clientWidth, 1);
    const h = Math.max(host.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const tick = () => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    controls.autoRotate = hooks.getAutoRotate();
    controls.update();
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(tick);
  hooks.onStatus(null);
  hooks.onReady(api);

  function dispose() {
    running = false;
    cancelAnimationFrame(frame);
    window.clearTimeout(rebuildTimer);
    ro.disconnect();
    controls.dispose();
    clearFigure();
    voxelGeo.dispose();
    reliefMat.dispose();
    voxelMat.dispose();
    texture?.dispose();
    platform.geometry.dispose();
    (platform.material as THREE.Material).dispose();
    shadow.geometry.dispose();
    (shadow.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  api.dispose = dispose;
  return { dispose };
}

function yieldFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function fitToPlatform(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 1e-4);
  root.scale.multiplyScalar(1.72 / height);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.x -= (box.min.x + box.max.x) / 2;
  root.position.z -= (box.min.z + box.max.z) / 2;
  root.position.y -= box.min.y;
}

function makeSoftShadow() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas desteklenmiyor");
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function bakeVoxels(grid: SampleGrid, puff: number) {
  const voxels = buildVoxelInstances(grid, puff);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pieces: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < voxels.count; i++) {
    dummy.matrix.fromArray(voxels.matrices, i * 16);
    const g = box.clone();
    g.applyMatrix4(dummy.matrix);
    const nVert = g.getAttribute("position")!.count;
    const col = new Float32Array(nVert * 3);
    for (let v = 0; v < nVert; v++) {
      col[v * 3] = voxels.colors[i * 3]!;
      col[v * 3 + 1] = voxels.colors[i * 3 + 1]!;
      col[v * 3 + 2] = voxels.colors[i * 3 + 2]!;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    pieces.push(g);
  }
  box.dispose();
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  if (!merged) throw new Error("Voxel birleştirilemedi");
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.46,
    metalness: 0.03,
    vertexColors: true,
  });
  return new THREE.Mesh(merged, mat);
}
