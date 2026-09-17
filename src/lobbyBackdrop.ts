import * as THREE from "three";

export function createLobbyBackdrop(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x7e94bb, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x7e94bb, 10, 28);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(0.35, 1.55, 6.2);

  scene.add(new THREE.HemisphereLight(0xd7e4f5, 0x5a6e90, 1.15));
  const key = new THREE.DirectionalLight(0xfff4dc, 1.35);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ec5ff, 0.55);
  rim.position.set(-6, 3, -2);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(22, 64),
    new THREE.MeshStandardMaterial({ color: 0x6d82a8, roughness: 0.95, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(24, 24, 0xb8c8de, 0x8aa0c0);
  grid.position.y = 0.01;
  scene.add(grid);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 40),
    new THREE.MeshStandardMaterial({
      color: 0x5d7399,
      roughness: 0.4,
      metalness: 0.25,
      emissive: 0x2a4a78,
      emissiveIntensity: 0.25,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  scene.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.42, 1.52, 48),
    new THREE.MeshBasicMaterial({ color: 0xcfe0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  const hero = buildShowcase();
  hero.position.set(0, 0, 0);
  scene.add(hero);

  const look = new THREE.Vector3(0, 1.05, 0);
  camera.lookAt(look);

  let raf = 0;
  let stopped = false;
  const clock = new THREE.Clock();

  function frame() {
    if (stopped) return;
    const t = clock.getElapsedTime();
    camera.position.x = 0.35 + Math.sin(t * 0.22) * 0.55;
    camera.position.z = 6.2 + Math.cos(t * 0.18) * 0.25;
    camera.lookAt(look);
    hero.rotation.y = Math.sin(t * 0.35) * 0.35;
    ring.rotation.z = t * 0.12;
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

function buildShowcase() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9b39a, roughness: 0.55 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x2c4a6e, roughness: 0.45, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.4, metalness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xe09f3e,
    emissive: 0xe09f3e,
    emissiveIntensity: 0.55,
    roughness: 0.35,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.12, 8, 14), suit);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
  head.position.y = 1.82;
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.42), dark);
  helm.position.y = 1.88;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.08), trim);
  visor.position.set(0, 1.86, -0.2);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.18), dark);
  pack.position.set(0, 1.15, 0.3);

  const rifle = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.05), dark);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.16), dark);
  mag.position.set(0, -0.14, 0.12);
  rifle.add(barrel, mag);
  rifle.position.set(0.48, 1.12, -0.28);
  rifle.rotation.y = 0.15;

  g.add(body, head, helm, visor, pack, rifle);
  return g;
}
