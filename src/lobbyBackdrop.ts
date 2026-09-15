import * as THREE from "three";

export function createLobbyBackdrop(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b1018, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1018, 12, 42);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    80,
  );
  camera.position.set(-6, 3.2, 10);

  scene.add(new THREE.AmbientLight(0x4a5a70, 0.55));
  const key = new THREE.DirectionalLight(0xffe08a, 1.15);
  key.position.set(-8, 10, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x4d7cff, 0.35);
  fill.position.set(6, 2, 8);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({
      color: 0x152033,
      roughness: 0.9,
      metalness: 0.1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.2, 5.45, 64),
    new THREE.MeshBasicMaterial({ color: 0xf5c518, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  const pads = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x2a3d58 : 0x1a2738,
        roughness: 0.7,
      }),
    );
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    pad.position.set(Math.cos(a) * 3.4, 0.06, Math.sin(a) * 3.4);
    pads.add(pad);
  }
  scene.add(pads);

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 1.1, 6, 12),
    new THREE.MeshStandardMaterial({
      color: 0xd8dee8,
      roughness: 0.45,
      metalness: 0.15,
    }),
  );
  capsule.position.set(0, 1.0, -3.4);
  scene.add(capsule);

  const blockMat = new THREE.MeshStandardMaterial({
    color: 0x24344a,
    roughness: 0.85,
  });
  const layout = [
    [4.5, 1.1, -1.2],
    [6.2, 0.7, 2.4],
    [-2.8, 0.9, -6],
    [1.5, 0.5, 5.5],
  ];
  for (const [x, h, z] of layout) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, h * 2, 1.4), blockMat);
    m.position.set(x, h, z);
    scene.add(m);
  }

  const look = new THREE.Vector3(0, 0.8, -1);
  camera.lookAt(look);

  let raf = 0;
  let stopped = false;
  const clock = new THREE.Clock();

  function frame() {
    if (stopped) return;
    const t = clock.getElapsedTime();
    camera.position.x = -6 + Math.sin(t * 0.12) * 0.45;
    camera.position.y = 3.2 + Math.sin(t * 0.18) * 0.12;
    camera.lookAt(look);
    capsule.rotation.y = t * 0.35;
    ring.rotation.z = t * 0.08;
    raf = requestAnimationFrame(frame);
    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener("resize", onResize);
  frame();

  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
  };
}
