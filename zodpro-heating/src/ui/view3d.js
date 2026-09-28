// Realistic 3D BIM viewer (three.js, PBR): textured architecture with floor slabs between levels,
// detailed parametric product models (radiators, manifolds, boiler, pump, vessel, valves),
// pipes with fittings, real UFH loops, soft shadows, environment reflections, section cutaway,
// isolate level, x-ray architecture, flow arrows, selection and measurement.
import { elementsOf, sortedLevels, levelById, openingPos, wallDir, localToPlan, collectorPortLocal, COLLECTOR_PITCH, COLLECTOR_RETURN_Y } from '../core/model.js';
import { PIPE_MATERIALS } from '../data/products.js';

let THREE = null;
let OrbitControls = null;
let RoomEnvironment = null;
let M3 = null; // models3d module

const ROOM_FLOOR = { bathroom: 'tiles', wc: 'tiles', kitchen: 'tiles', corridor: 'tiles', boiler: 'tiles', storage: 'tiles', garage: 'screed', stair: 'tiles' };

export class View3D {
  constructor(host, toolbar, store, app) {
    this.host = host;
    this.toolbar = toolbar;
    this.store = store;
    this.app = app;
    this.clipH = null;
    this.cutaway = true; // section box 2.2 m above the active level (above wall-hung boilers)
    this.isolate = null;
    this.showArch = true;
    this.xray = false;
    this.showArrows = false;
    this.systemColors = true;
    this.measure = null;
    this.ready = false;
    this.buildToolbar();
    store.on('results', () => this.visible && this.rebuild());
    store.on('selection', () => this.visible && this.highlight());
    store.on('level', () => this.visible && this.applyClip());
  }

  async init() {
    if (this.ready || this.loading) return;
    this.loading = true;
    try {
      THREE = await import('three');
      ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
      ({ RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js'));
      M3 = await import('./models3d.js');
    } catch (err) {
      this.host.innerHTML = `<div style="padding:24px" class="muted">3D kutubxonasi (vendor/three) yuklanmadi.<br>${err}</div>`;
      this.loading = false;
      return;
    }
    const r = this.host.getBoundingClientRect();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(r.width, r.height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.host.appendChild(renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = this.skyTexture();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(40, r.width / Math.max(1, r.height), 0.05, 2000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-8, 18, 16);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x8a8577, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.0);
    sun.position.set(-12, -18, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
    this.raycaster = new THREE.Raycaster();
    renderer.domElement.addEventListener('pointerdown', (e) => (this._down = { x: e.clientX, y: e.clientY }));
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (this._down && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) < 4) this.pick(e);
    });
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.textures = M3.makeTextures();
    this.ready = true;
    this.loading = false;
    this.rebuild(true);
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      renderer.render(this.scene, this.camera);
    };
    loop();
  }

  skyTexture() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#8fb3d9');
    grd.addColorStop(0.55, '#d6e4f0');
    grd.addColorStop(1, '#eef1ee');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  show(v) {
    this.visible = v;
    if (v) {
      if (!this.ready) this.init();
      else {
        this.resize();
        this.rebuild();
      }
    }
  }

  resize() {
    if (!this.ready) return;
    const r = this.host.getBoundingClientRect();
    if (r.width < 2) return;
    this.renderer.setSize(r.width, r.height);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  buildToolbar() {
    const tb = this.toolbar;
    tb.innerHTML = '';
    const btn = (label, title, fn, active = () => false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.onclick = () => {
        fn();
        this.buildToolbar();
      };
      if (active()) b.classList.add('active');
      tb.appendChild(b);
    };
    btn('Kesik ko‘rinish', 'Faol qavat ustidan 2.2 m balandlikda kesish', () => {
      this.cutaway = !this.cutaway;
      this.applyClip();
    }, () => this.cutaway);
    btn(this.isolate ? 'Faqat joriy qavat' : 'Barcha qavatlar', 'Faol qavatni ajratish', () => {
      this.isolate = this.isolate ? null : this.store.activeLevelId;
      this.rebuild();
    }, () => !!this.isolate);
    btn('Arxitektura', 'Devor, pol, deraza — ko‘rsatish/yashirish', () => {
      this.showArch = !this.showArch;
      this.rebuild();
    }, () => this.showArch);
    btn('Rentgen', 'Arxitekturani shaffof qilish', () => {
      this.xray = !this.xray;
      this.rebuild();
    }, () => this.xray);
    btn('Tizim ranglari', "Ta'minot qizil / qaytish ko‘k (o‘chirilsa — haqiqiy material rangi)", () => {
      this.systemColors = !this.systemColors;
      this.rebuild();
    }, () => this.systemColors);
    btn('Oqim', 'Oqim yo‘nalishi strelkalari', () => {
      this.showArrows = !this.showArrows;
      this.rebuild();
    }, () => this.showArrows);
    btn("O'lchash", 'Ikki nuqta orasidagi masofa', () => {
      this.measure = this.measure ? null : { pts: [] };
      this.app.setHint(this.measure ? "3D o'lchash: ikkita nuqtani bosing" : '');
    }, () => !!this.measure);
    btn('Moslash', 'Butun modelni ko‘rsatish', () => this.fitCamera());
    const lab = document.createElement('label');
    lab.innerHTML = 'Kesim <input type="range" min="0" max="100" value="100" id="clip3d">';
    lab.querySelector('input').oninput = (e) => {
      const v = Number(e.target.value);
      this.clipH = v >= 100 ? null : v;
      this.applyClip();
    };
    tb.appendChild(lab);
    btn('PNG', 'Rasmni saqlash', () => this.app.exportPNG3d());
  }

  maxZ() {
    const ls = sortedLevels(this.store.project);
    const top = ls[ls.length - 1];
    return (top?.elevation ?? 0) + (top?.height ?? 3) + 1;
  }

  applyClip() {
    if (!this.ready) return;
    let z = this.clipH === null ? 1e6 : (this.clipH / 100) * this.maxZ();
    if (this.cutaway && this.clipH === null) {
      const lv = levelById(this.store.project, this.store.activeLevelId);
      if (lv) z = lv.elevation + 2.2;
    }
    this.clipPlane.constant = z;
    this.renderer.clippingPlanes = z < 1e5 ? [this.clipPlane] : [];
  }

  // ------------------------------------------------------------------ model build
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.userData.hlMat) o.userData.hlMat.dispose?.();
    });
    this.group.clear();
  }

  pipeOD(pr, fallbackMat = 'PPR') {
    const mat = PIPE_MATERIALS[pr?.material ?? fallbackMat];
    const size = mat?.sizes.find((s) => s.dn === String(pr?.dn)) ?? mat?.sizes[0];
    return size?.od ?? 0.02;
  }

  pipeMaterial(system, material) {
    const M = this.M;
    if (this.systemColors) return system === 'return' ? M.ret : M.supply;
    if (material === 'STEEL') return M.steel;
    if (material === 'CU') return M.copper;
    if (material === 'PEX' || material === 'PERT') return system === 'return' ? M.pexBlue : M.pexRed;
    return M.ppr;
  }

  add(obj, id) {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.castShadow !== false;
        o.receiveShadow = true;
      }
    });
    if (id) M3.tagIds(obj, id);
    this.group.add(obj);
    return obj;
  }

  rebuild(first = false) {
    if (!this.ready) return;
    const p = this.store.project;
    const res = this.store.results;
    const s = p.settings;
    this.dispose();
    const colors = s.colors ?? {};
    this.M = M3.makeMaterials(this.textures, { supply: colors.supply ?? '#e0312b', ret: colors.return ?? '#1f5fd6' });
    const M = this.M;
    if (this.xray) {
      for (const k of ['wallFacade', 'wallInterior', 'wallCore', 'slab', 'ceiling', 'roof', 'parquet', 'tiles', 'screed', 'pvc', 'doorWood', 'frameWood', 'sill', 'ebb', 'plinth']) {
        M[k].transparent = true;
        M[k].opacity = 0.18;
        M[k].depthWrite = false;
      }
    }
    const levels = sortedLevels(p);
    const lvIndex = new Map(levels.map((l, i) => [l.id, i]));
    for (const l of levels) {
      if (this.isolate && l.id !== this.isolate) continue;
      const next = levels[lvIndex.get(l.id) + 1];
      const top = !next;
      const wallH = next ? next.elevation - l.elevation : l.height + (l.floorThickness ?? 0.3) + 0.45;
      const centre = this.levelCentre(l.id);
      if (this.showArch) {
        this.buildSlab(l, levels, centre);
        if (top) this.buildRoof(l);
        for (const r of elementsOf(p, 'room', l.id)) this.buildFloorFinish(r, l, res);
        for (const w of elementsOf(p, 'wall', l.id)) this.buildWall(w, l, wallH, centre);
        for (const o of elementsOf(p, 'obstacle', l.id)) {
          const d = wallDir(o);
          const m = new THREE.Mesh(new THREE.BoxGeometry(d.L, o.width ?? 0.3, o.zTop - o.zBottom), M.obstacle);
          m.position.set((o.a.x + o.b.x) / 2, -(o.a.y + o.b.y) / 2, l.elevation + (o.zBottom + o.zTop) / 2);
          m.rotation.z = -Math.atan2(d.y, d.x);
          this.add(m, o.id);
        }
      }
      this.buildEquipment(l, res);
      this.buildPipes(l, res);
      this.buildUfh(l, res);
    }
    this.buildRisers(res);
    this.buildGround();
    this.applyClip();
    this.highlight();
    this.fitShadow();
    if (first || !this._fitted) {
      this._fitted = true;
      this.fitCamera();
    }
  }

  levelCentre(levelId) {
    const pts = [];
    for (const w of elementsOf(this.store.project, 'wall', levelId)) pts.push(w.a, w.b);
    if (!pts.length) return { x: 0, y: 0 };
    return { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length };
  }

  /** Outer footprint of a level: chained exterior walls offset to their outer face (fallback: bounding box). */
  footprint(levelId) {
    const walls = elementsOf(this.store.project, 'wall', levelId).filter((w) => w.exterior);
    const all = elementsOf(this.store.project, 'wall', levelId);
    const key = (q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`;
    if (walls.length >= 3) {
      const chain = [walls[0]];
      const used = new Set([walls[0].id]);
      let end = walls[0].b;
      for (let guard = 0; guard < walls.length; guard++) {
        const nx = walls.find((w) => !used.has(w.id) && (key(w.a) === key(end) || key(w.b) === key(end)));
        if (!nx) break;
        used.add(nx.id);
        const fwd = key(nx.a) === key(end);
        chain.push(fwd ? nx : { ...nx, a: nx.b, b: nx.a });
        end = fwd ? nx.b : nx.a;
      }
      if (chain.length === walls.length && key(end) === key(chain[0].a)) {
        const pts = chain.map((w) => w.a);
        const t = Math.max(...walls.map((w) => w.thickness ?? 0.3)) / 2;
        const area = pts.reduce((a, q, i) => a + (q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y), 0) / 2;
        const sgn = area > 0 ? -1 : 1; // outward
        return pts.map((q, i) => {
          const a = pts[(i - 1 + pts.length) % pts.length];
          const b = pts[(i + 1) % pts.length];
          const d1 = norm2(q.x - a.x, q.y - a.y);
          const d2 = norm2(b.x - q.x, b.y - q.y);
          const n1 = { x: sgn * -d1.y, y: sgn * d1.x };
          const n2 = { x: sgn * -d2.y, y: sgn * d2.x };
          const bis = norm2(n1.x + n2.x, n1.y + n2.y);
          const k = t / Math.max(0.2, bis.x * n1.x + bis.y * n1.y);
          return { x: q.x - bis.x * k, y: q.y - bis.y * k };
        });
      }
    }
    const src = all.length ? all.flatMap((w) => [w.a, w.b]) : elementsOf(this.store.project, 'room', levelId).flatMap((r) => r.points);
    if (!src.length) return null;
    const t = 0.25;
    const x0 = Math.min(...src.map((q) => q.x)) - t;
    const x1 = Math.max(...src.map((q) => q.x)) + t;
    const y0 = Math.min(...src.map((q) => q.y)) - t;
    const y1 = Math.max(...src.map((q) => q.y)) + t;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  extrudePoly(pts, z0, z1, mats) {
    const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
    const m = new THREE.Mesh(g, mats);
    m.position.z = z0;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  buildSlab(l, levels, centre) {
    const fp = this.footprint(l.id);
    if (!fp) return;
    const ft = l.floorThickness ?? 0.3;
    // floor slab of this level (its underside is the ceiling of the level below)
    const slab = this.extrudePoly(fp, l.elevation - ft, l.elevation - 0.001, [this.M.ceiling, this.M.slab]);
    this.add(slab);
    if (levels[0].id !== l.id) {
      // interfloor belt course on the façade marks the slab between storeys
      const band = offsetPoly(fp, 0.05);
      this.add(this.extrudePoly(band, l.elevation - ft, l.elevation, [this.M.plinth, this.M.plinth]));
    }
    if (levels[0].id === l.id) {
      // plinth / foundation strip and thermal insulation under the ground floor
      const pl = this.extrudePoly(fp, l.elevation - ft - 0.45, l.elevation - ft, [this.M.plinth, this.M.plinth]);
      this.add(pl);
    }
    void centre;
  }

  buildRoof(l) {
    const fp = this.footprint(l.id);
    if (!fp) return;
    const z0 = l.elevation + l.height;
    this.add(this.extrudePoly(fp, z0, z0 + (l.floorThickness ?? 0.3), [this.M.roof, this.M.slab]));
  }

  buildGround() {
    const fp = sortedLevels(this.store.project)[0];
    const z = (fp?.elevation ?? 0) - (fp?.floorThickness ?? 0.3) - 0.45;
    const c = this.levelCentre(fp?.id);
    const g = new THREE.Mesh(new THREE.CircleGeometry(60, 64), this.M.ground);
    g.position.set(c.x, -c.y, z);
    g.receiveShadow = true;
    // metric UVs for the grass texture
    const uv = g.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 120, uv.getY(i) * 120);
    this.group.add(g);
  }

  buildFloorFinish(r, l, res) {
    const u = res?.ufh?.[r.id];
    const matKey = u ? 'screed' : ROOM_FLOOR[r.roomType] ?? 'parquet';
    const shape = new THREE.Shape(r.points.map((q) => new THREE.Vector2(q.x, -q.y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
    const m = new THREE.Mesh(g, [this.M[matKey], this.M.slab]);
    m.position.z = l.elevation;
    m.receiveShadow = true;
    this.add(m, r.id);
  }

  buildWall(w, l, H, centre) {
    const M = this.M;
    const p = this.store.project;
    const d = wallDir(w);
    const z0 = l.elevation;
    const ang = Math.atan2(d.y, d.x);
    const t = w.thickness ?? 0.2;
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    // which side (+y / −y in the box frame) faces outside the building?
    const worldPlusY = { x: Math.sin(ang), y: Math.cos(ang) }; // box +Y in world (x, y_world)
    const out = { x: mid.x - centre.x, y: -(mid.y - centre.y) };
    const plusIsOut = worldPlusY.x * out.x + worldPlusY.y * out.y > 0;
    const faceOut = w.exterior ? M.wallFacade : M.wallInterior;
    const mats = [M.wallCore, M.wallCore, plusIsOut ? faceOut : M.wallInterior, plusIsOut ? M.wallInterior : faceOut, M.wallCore, M.wallCore];
    const ops = [...elementsOf(p, 'window', l.id), ...elementsOf(p, 'door', l.id)].filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
    let s0 = 0;
    const piece = (a0, a1, zb, zt) => {
      if (a1 - a0 < 1e-3 || zt - zb < 1e-3) return;
      const geo = M3.metricBoxUV(new THREE.BoxGeometry(a1 - a0, t, zt - zb), a1 - a0, t, zt - zb);
      const m = new THREE.Mesh(geo, mats);
      const c = { x: w.a.x + d.x * ((a0 + a1) / 2), y: w.a.y + d.y * ((a0 + a1) / 2) };
      m.position.set(c.x, -c.y, z0 + (zb + zt) / 2);
      m.rotation.z = -ang;
      this.add(m, w.id);
    };
    for (const o of ops) {
      const o0 = Math.max(0, o.offset - o.width / 2);
      const o1 = Math.min(d.L, o.offset + o.width / 2);
      piece(s0, o0, 0, H);
      piece(o0, o1, 0, o.sill ?? 0);
      piece(o0, o1, (o.sill ?? 0) + o.height, H);
      const c = { x: w.a.x + d.x * o.offset, y: w.a.y + d.y * o.offset };
      const interiorSign = plusIsOut ? -1 : 1;
      const model = o.cat === 'window' ? M3.windowModel(M, o.width, o.height, t, interiorSign) : M3.doorModel(M, o.width, o.height, t);
      model.position.set(c.x, -c.y, z0 + (o.cat === 'window' ? o.sill : 0));
      model.rotation.z = -ang;
      this.add(model, o.id);
      s0 = o1;
    }
    piece(s0, d.L, 0, H);
  }

  buildEquipment(l, res) {
    const p = this.store.project;
    const M = this.M;
    const s = p.settings;
    const z0 = l.elevation;
    for (const e of elementsOf(p, 'radiator', l.id)) {
      const prod = res?.radiators?.[e.id]?.product ?? { length: e.length ?? 1, height: 0.5, depth: 0.1, type: 22, kind: 'panel' };
      const pr = { ...prod, length: e.length ?? prod.length };
      const body = pr.kind === 'sectional' ? M3.sectionalRadiator(M, pr, { flip: e.flip }) : M3.panelRadiator(M, pr, { flip: e.flip });
      this.add(M3.place(body, e, z0 + (e.mountHeight ?? 0.1)), e.id);
      const conn = M3.radiatorConnections(M, pr, { flip: e.flip, mount: e.mountHeight ?? 0.1, zPipe: s.pipeElevation, pipeMatS: this.pipeMaterial('supply', s.pipeMaterial), pipeMatR: this.pipeMaterial('return', s.pipeMaterial) });
      this.add(M3.place(conn, e, z0), e.id);
    }
    for (const e of elementsOf(p, 'boiler', l.id)) {
      const b = M3.wallBoiler(M, res?.boiler?.product, { pipeMatS: this.pipeMaterial('supply', s.pipeMaterial), pipeMatR: this.pipeMaterial('return', s.pipeMaterial), pipeZ: s.pipeElevation });
      this.add(M3.place(b, e, z0), e.id);
      if (res?.expansion?.tank) {
        const v = M3.expansionVessel(M, res.expansion.tank.volumeL);
        const q = localToPlan(e, 0.45, 0.14);
        v.group.position.set(q.x, -q.y, z0 + 0.25 + v.height / 2 + 0.2);
        this.add(v.group, e.id);
      }
    }
    for (const e of elementsOf(p, 'collector', l.id)) {
      const n = Math.max(e.outlets ?? 4, res?.ufhPorts?.[e.id] ?? 0);
      const m = M3.manifold(M, { n, kind: e.kind, mixing: e.mixing !== false, pitch: COLLECTOR_PITCH, returnY: COLLECTOR_RETURN_Y, portLocal: collectorPortLocal, pipeZ: s.pipeElevation, pipeMatS: this.pipeMaterial('supply', e.kind === 'ufh' ? 'PEX' : s.pipeMaterial), pipeMatR: this.pipeMaterial('return', e.kind === 'ufh' ? 'PEX' : s.pipeMaterial) });
      this.add(M3.place(m, e, z0), e.id);
    }
    for (const e of elementsOf(p, 'pump', l.id)) {
      const c = M3.circulator(M, 0.3);
      this.add(M3.place(c, e, z0 + s.pipeElevation), e.id);
    }
    for (const e of elementsOf(p, 'thermostat', l.id)) {
      // mount on the nearest wall face at 1.5 m
      let best = null;
      for (const w of elementsOf(p, 'wall', l.id)) {
        const d = wallDir(w);
        const t = Math.max(0, Math.min(d.L, (e.x - w.a.x) * d.x + (e.y - w.a.y) * d.y));
        const q = { x: w.a.x + d.x * t, y: w.a.y + d.y * t };
        const dist = Math.hypot(e.x - q.x, e.y - q.y);
        if (!best || dist < best.dist) best = { dist, q, w, d };
      }
      const th = M3.roomThermostat(M);
      if (best) {
        const nrm = { x: (e.x - best.q.x) / (best.dist || 1), y: (e.y - best.q.y) / (best.dist || 1) };
        const off = (best.w.thickness ?? 0.2) / 2 + 0.012;
        th.position.set(best.q.x + nrm.x * off, -(best.q.y + nrm.y * off), z0 + 1.5);
        th.rotation.z = Math.atan2(-nrm.y, nrm.x) + Math.PI / 2;
      } else th.position.set(e.x, -e.y, z0 + 1.5);
      this.add(th, e.id);
    }
  }

  buildPipes(l, res) {
    const p = this.store.project;
    const s = p.settings;
    const z0 = l.elevation;
    for (const pipe of elementsOf(p, 'pipe', l.id)) {
      const pr = res?.pipes?.[pipe.id];
      const material = pr?.material ?? pipe.material ?? s.pipeMaterial;
      const od = this.pipeOD(pr, material);
      const z = z0 + (pipe.elevation ?? s.pipeElevation);
      const pts = pipe.points.map((q) => new THREE.Vector3(q.x, -q.y, z));
      const mat = this.pipeMaterial(pipe.system, material);
      const style = material === 'PEX' || material === 'PERT' ? 'bend' : 'socket';
      const run = M3.pipeRun(pts, od, mat, { style, fittingMat: this.systemColors ? mat : material === 'PPR' ? this.M.pprFitting : mat, barLength: PIPE_MATERIALS[material]?.barLength <= 6 ? PIPE_MATERIALS[material].barLength : 0 });
      this.add(run, pipe.id);
      if (this.showArrows && pr?.vM3s > 0) this.flowArrows(pipe, pts, res);
    }
    // tee fittings at network junctions
    const net = res?._network;
    if (net) {
      for (const n of net.nodes.values()) {
        if (!n.tee || n.levelId !== l.id) continue;
        const pe = n.edges.find((e) => e.kind === 'pipe');
        if (!pe) continue;
        const el = p.elements[pe.elementId];
        const pr = res.pipes[pe.elementId];
        const od = this.pipeOD(pr, el?.material);
        this.add(M3.teeFitting(new THREE.Vector3(n.x, -n.y, z0 + (el?.elevation ?? s.pipeElevation)), od, this.pipeMaterial(el?.system, pr?.material)), pe.elementId);
      }
    }
  }

  flowArrows(pipe, pts, res) {
    const net = res._network;
    const tree = pipe.system === 'return' ? net?.returnTree : net?.supplyTree;
    let P = pts;
    if (tree) {
      for (const [child, v] of tree.parent) {
        if (v.edge.elementId !== pipe.id) continue;
        const from = net.nodes.get(pipe.system === 'return' ? child : v.from);
        if (from && Math.hypot(from.x - pts[0].x, -from.y - pts[0].y) > Math.hypot(from.x - pts[pts.length - 1].x, -from.y - pts[pts.length - 1].y)) P = [...pts].reverse();
      }
    }
    const color = pipe.system === 'return' ? 0x1f5fd6 : 0xe0312b;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1];
      const b = P[i];
      const d = b.clone().sub(a);
      if (d.length() < 0.6) continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 12), new THREE.MeshBasicMaterial({ color }));
      cone.position.copy(a).addScaledVector(d, 0.5);
      cone.position.z += 0.04;
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      this.group.add(cone);
    }
  }

  buildUfh(l, res) {
    const p = this.store.project;
    const M = this.M;
    for (const r of elementsOf(p, 'room', l.id)) {
      const u = res?.ufh?.[r.id];
      if (!u?.layout) continue;
      const od = (Number(u.pipe?.dn) || 16) / 1000;
      const z = l.elevation + 0.012 + od / 2;
      const tube = (pts2, mat, zz = z) => {
        if (!pts2?.length || pts2.length < 2) return;
        const path = new THREE.CurvePath();
        for (let i = 1; i < pts2.length; i++) {
          const a = new THREE.Vector3(pts2[i - 1].x, -pts2[i - 1].y, zz);
          const b = new THREE.Vector3(pts2[i].x, -pts2[i].y, zz);
          if (a.distanceTo(b) > 1e-5) path.add(new THREE.LineCurve3(a, b));
        }
        if (!path.curves.length) return;
        const g = new THREE.TubeGeometry(path, Math.min(4000, path.curves.length * 2), od / 2, 8, false);
        const m = new THREE.Mesh(g, mat);
        m.castShadow = false;
        this.add(m, r.id);
      };
      const coilMat = this.systemColors ? M.pexRed : M.pexRed;
      for (const loop of u.layout) {
        tube(loop.coil, coilMat);
        tube(loop.supplyLead, this.pipeMaterial('supply', 'PEX'));
        tube(loop.returnLead, this.pipeMaterial('return', 'PEX'), z + 0.001);
      }
    }
  }

  buildRisers(res) {
    const p = this.store.project;
    const s = p.settings;
    for (const r of elementsOf(p, 'riser')) {
      const a = levelById(p, r.levelFrom);
      const b = levelById(p, r.levelTo);
      if (!a || !b) continue;
      if (this.isolate && r.levelFrom !== this.isolate && r.levelTo !== this.isolate) continue;
      const pr = res?.pipes?.[r.id];
      const od = this.pipeOD(pr, r.material ?? s.pipeMaterial);
      const zz = s.pipeElevation + (r.system === 'return' ? 0.15 : 0.1);
      const mat = this.pipeMaterial(r.system, pr?.material ?? s.pipeMaterial);
      this.add(M3.pipeRun([new THREE.Vector3(r.x, -r.y, a.elevation + zz), new THREE.Vector3(r.x, -r.y, b.elevation + zz)], od, mat, { style: 'socket', barLength: 1.5 }), r.id);
      // wall clamps every 1.2 m
      for (let z = a.elevation + 0.6; z < b.elevation; z += 1.2) {
        const c = new THREE.Mesh(new THREE.TorusGeometry(od * 0.75, 0.004, 6, 16), this.M.steel);
        c.position.set(r.x, -r.y, z);
        this.add(c, r.id);
      }
    }
  }

  // ------------------------------------------------------------------ interaction
  highlight() {
    if (!this.ready) return;
    const sel = this.store.selection;
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const on = sel.has(o.userData.id);
      if (on && !o.userData.hl) {
        o.userData.orig = o.material;
        const mk = (m) => {
          const c = m.clone();
          if (c.emissive) {
            c.emissive.setHex(0x1e6ef2);
            c.emissiveIntensity = 0.45;
          }
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(mk) : mk(o.material);
        o.userData.hl = true;
      } else if (!on && o.userData.hl) {
        o.material = o.userData.orig;
        o.userData.hl = false;
      }
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    let hits = this.raycaster.intersectObjects(this.group.children, true);
    if (this.renderer.clippingPlanes.length) hits = hits.filter((h) => h.point.z <= this.clipPlane.constant + 1e-3);
    if (this.measure) {
      if (!hits.length) return;
      this.measure.pts.push(hits[0].point.clone());
      if (this.measure.pts.length === 2) {
        const [a, b] = this.measure.pts;
        this.app.toast(`3D masofa: ${a.distanceTo(b).toFixed(3)} m (Δz ${(b.z - a.z).toFixed(3)} m)`);
        this.measure = { pts: [] };
      }
      return;
    }
    const hit = hits.find((h) => h.object.userData.id);
    if (hit) this.store.select(hit.object.userData.id, e.shiftKey);
    else this.store.clearSelection();
  }

  fitShadow() {
    const box = new THREE.Box3();
    this.group.children.forEach((c) => {
      if (c.geometry?.type !== 'CircleGeometry') box.expandByObject(c);
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).add(new THREE.Vector3(-0.45, -0.65, 0.95).multiplyScalar(size));
    const cam = this.sun.shadow.camera;
    cam.left = -size * 0.6;
    cam.right = size * 0.6;
    cam.top = size * 0.6;
    cam.bottom = -size * 0.6;
    cam.near = 0.1;
    cam.far = size * 3;
    cam.updateProjectionMatrix();
  }

  fitCamera() {
    if (!this.ready) return;
    const box = new THREE.Box3();
    this.group.children.forEach((c) => {
      if (c.geometry?.type !== 'CircleGeometry') box.expandByObject(c);
    });
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(c);
    this.camera.position.set(c.x - size * 0.42, c.y - size * 0.72, c.z + size * 0.62);
    this.camera.near = size / 800;
    this.camera.far = size * 30;
    this.camera.updateProjectionMatrix();
  }

  toPNG() {
    if (!this.ready) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

/** Offset an orthogonal/convex polygon outward by d (vertex bisector offset). */
function offsetPoly(pts, d) {
  const area = pts.reduce((a, q, i) => a + (q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y), 0) / 2;
  const sgn = area > 0 ? -1 : 1;
  return pts.map((q, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const d1 = norm2(q.x - a.x, q.y - a.y);
    const d2 = norm2(b.x - q.x, b.y - q.y);
    const n1 = { x: sgn * -d1.y, y: sgn * d1.x };
    const n2 = { x: sgn * -d2.y, y: sgn * d2.x };
    const bis = norm2(n1.x + n2.x, n1.y + n2.y);
    const k = d / Math.max(0.2, bis.x * n1.x + bis.y * n1.y);
    return { x: q.x - bis.x * k, y: q.y - bis.y * k };
  });
}

function norm2(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export { openingPos };
