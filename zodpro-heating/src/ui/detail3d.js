// Off-screen 3D renders for drawing details, e.g. "Узел подключения коллектора":
// the real manifold model rendered isometrically on white, with numbered callouts at the parts
// listed in the parts specification (positions match manifoldNodeParts in engines/bom.js).
import { collectorPortLocal, COLLECTOR_PITCH, COLLECTOR_RETURN_Y } from '../core/model.js';

let cache = new Map();

export async function renderManifoldNode({ n, kind, mixing = false, width = 900, height = 700 }) {
  const key = `${n}|${kind}|${mixing}|${width}`;
  if (cache.has(key)) return cache.get(key);
  const THREE = await import('three');
  const M3 = await import('./models3d.js');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1.5);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 3, 4);
  scene.add(sun);
  const M = M3.makeMaterials(M3.makeTextures(), { supply: '#e0312b', ret: '#1f5fd6' });
  const g = M3.manifold(M, { n, kind, mixing, pitch: COLLECTOR_PITCH, returnY: COLLECTOR_RETURN_Y, portLocal: collectorPortLocal, pipeZ: 0.02, floorZ: 0.02, cabinet: false, pipeMatS: kind === 'ufh' ? M.pexRed : M.supply, pipeMatR: kind === 'ufh' ? M.pexBlue : M.ret });
  scene.add(g);
  // floor loops: PE-RT pipes leaving the connector rows into the floor
  for (let i = 0; i < n; i++) {
    const x = collectorPortLocal(i);
    // supply shifts half a pitch sideways so it passes the return connector, then both run into the room
    const sup = [new THREE.Vector3(x, 0, 0.02), new THREE.Vector3(x, -0.06, 0.02), new THREE.Vector3(x - 0.025, -0.11, 0.02), new THREE.Vector3(x - 0.025, -0.9, 0.02)];
    const ret = [new THREE.Vector3(x, -COLLECTOR_RETURN_Y, 0.02), new THREE.Vector3(x, -0.9, 0.02)];
    for (const [pts, mat] of [[sup, M.pexRed], [ret, M.pexBlue]]) {
      const geo = M3.tubeAlong(M3.bend3(pts, 0.04), 0.008, 12);
      if (geo) scene.add(new THREE.Mesh(geo, mat));
    }
  }
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const aspect = width / height;
  const cam = new THREE.OrthographicCamera((-size * aspect) / 1.6, (size * aspect) / 1.6, size / 1.6, -size / 1.6, 0.01, 100);
  cam.up.set(0, 0, 1);
  cam.position.set(c.x - size * 0.9, c.y - size * 1.4, c.z + size * 0.7); // from the room side (−y)
  cam.lookAt(c);
  cam.updateMatrixWorld();
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  // callout anchors (model frame, positions from the model itself) → image coordinates
  const P = (v, pos) => {
    const q = v.clone().project(cam);
    return { pos, x: ((q.x + 1) / 2) * width, y: ((1 - q.y) / 2) * height };
  };
  const A = M3.manifoldAnchors(n, collectorPortLocal);
  const anchors = [
    P(A.ballValveS, 2),
    P(A.ballValveR, 2),
    P(A.adapter, 3),
    P(A.elbow, 4),
    P(A.balancing, 9),
    P(A.nipple, 5),
    P(A.manifold, 10),
    P(A.sleeveRed, 6),
    P(A.actuator, 8),
    P(A.sleeveBlue, 7),
  ];
  renderer.dispose();
  const out = { url, width, height, anchors };
  cache.set(key, out);
  return out;
}

/** SVG overlay: callout balloons with leaders placed on the left/right margins. */
export function calloutSVG(node) {
  const { width, height, anchors } = node;
  const left = anchors.filter((a) => a.x < width / 2).sort((a, b) => a.y - b.y);
  const right = anchors.filter((a) => a.x >= width / 2).sort((a, b) => a.y - b.y);
  const place = (list, x) => {
    let last = -Infinity;
    return list
      .map((a) => {
        const y = Math.max(a.y - 40, last + 26);
        last = y;
        return `<line x1="${a.x}" y1="${a.y}" x2="${x}" y2="${y}" stroke="#333" stroke-width="1"/><circle cx="${a.x}" cy="${a.y}" r="2.5" fill="#333"/><line x1="${x}" y1="${y}" x2="${x + (x < width / 2 ? -40 : 40)}" y2="${y}" stroke="#333" stroke-width="1"/><text x="${x + (x < width / 2 ? -34 : 6)}" y="${y - 4}" font-size="15" fill="#c0268c">${a.pos}</text>`;
      })
      .join('');
  };
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%" font-family="Arial">${place(left, 60)}${place(right, width - 60)}</svg>`;
}

export function clearDetailCache() {
  cache = new Map();
}
