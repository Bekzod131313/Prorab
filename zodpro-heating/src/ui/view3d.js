// 3D BIM viewer (three.js): orbit/pan/zoom, shaded/wireframe/x-ray, section clipping,
// isolate level, hide architecture, flow arrows, pipe diameter visualisation, selection, measure.
import { elementsOf, sortedLevels, levelById, openingPos, wallDir, localToPlan } from '../core/model.js';
import { polygonCentroid } from '../core/util.js';

let THREE = null;
let OrbitControls = null;

export class View3D {
  constructor(host, toolbar, store, app) {
    this.host = host;
    this.toolbar = toolbar;
    this.store = store;
    this.app = app;
    this.mode = 'shaded';
    this.clipH = null;
    this.cutaway = true; // 3D cutaway: section box 1.6 m above the active level
    this.isolate = null;
    this.showArch = true;
    this.showArrows = true;
    this.measure = null;
    this.ready = false;
    this.pending = false;
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
    } catch (err) {
      this.host.innerHTML = `<div style="padding:24px" class="muted">3D kutubxonasi (vendor/three) yuklanmadi.<br>${err}</div>`;
      this.loading = false;
      return;
    }
    const r = this.host.getBoundingClientRect();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(r.width, r.height);
    this.renderer.localClippingEnabled = true;
    this.host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, r.width / Math.max(1, r.height), 0.05, 2000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(-8, 18, 16);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bccb, 1.6));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(10, -15, 25);
    this.scene.add(sun);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
    this.raycaster = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', (e) => (this._down = { x: e.clientX, y: e.clientY }));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (this._down && Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) < 4) this.pick(e);
    });
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.ready = true;
    this.loading = false;
    this.rebuild(true);
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.visible) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
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
    btn('Soyali', 'Shaded', () => this.setMode('shaded'), () => this.mode === 'shaded');
    btn('Karkas', 'Wireframe', () => this.setMode('wire'), () => this.mode === 'wire');
    btn('Shaffof', 'X-ray / transparency', () => this.setMode('xray'), () => this.mode === 'xray');
    btn('Arxitektura', 'Show/hide architecture', () => {
      this.showArch = !this.showArch;
      this.rebuild();
    }, () => this.showArch);
    btn('Oqim', 'Flow arrows', () => {
      this.showArrows = !this.showArrows;
      this.rebuild();
    }, () => this.showArrows);
    btn('Kesik ko‘rinish', '3D cutaway above the active level', () => {
      this.cutaway = !this.cutaway;
      this.applyClip();
    }, () => this.cutaway);
    btn(this.isolate ? 'Qavat: izolyatsiya' : 'Barcha qavatlar', 'Isolate active level', () => {
      this.isolate = this.isolate ? null : this.store.activeLevelId;
      this.rebuild();
    }, () => !!this.isolate);
    btn("O'lchash", 'Measure (2 clicks)', () => {
      this.measure = this.measure ? null : { pts: [] };
      this.app.setHint(this.measure ? "3D o'lchash: ikkita nuqtani bosing" : '');
    }, () => !!this.measure);
    btn('Ko‘rinishni moslash', 'Zoom extents', () => this.fitCamera());
    const lab = document.createElement('label');
    lab.innerHTML = 'Kesim <input type="range" min="0" max="100" value="100">';
    lab.querySelector('input').oninput = (e) => {
      const v = Number(e.target.value);
      this.clipH = v >= 100 ? null : v;
      this.applyClip();
    };
    tb.appendChild(lab);
    btn('PNG', 'Export PNG', () => this.app.exportPNG3d());
  }

  setMode(m) {
    this.mode = m;
    this.rebuild();
  }

  maxZ() {
    const ls = sortedLevels(this.store.project);
    const top = ls[ls.length - 1];
    return (top?.elevation ?? 0) + (top?.height ?? 3) + 0.5;
  }

  applyClip() {
    if (!this.ready) return;
    let z = this.clipH === null ? 1e6 : (this.clipH / 100) * this.maxZ();
    if (this.cutaway && this.clipH === null) {
      const lv = levelById(this.store.project, this.store.activeLevelId);
      if (lv) z = lv.elevation + 1.6;
    }
    this.clipPlane.constant = z;
    const on = z < 1e5;
    this.group.traverse((o) => {
      if (o.material) o.material.clippingPlanes = on ? [this.clipPlane] : [];
    });
  }

  mat(color, opts = {}) {
    const xray = this.mode === 'xray' && !opts.mep;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0.05,
      wireframe: this.mode === 'wire',
      transparent: xray || !!opts.opacity,
      opacity: xray ? 0.18 : opts.opacity ?? 1,
      depthWrite: !(xray || opts.opacity),
      side: THREE.DoubleSide,
    });
  }

  box(cx, cy, cz, sx, sy, sz, rotZ, material, meta) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(cx, -cy, cz);
    m.rotation.z = -rotZ;
    m.userData = meta ?? {};
    this.group.add(m);
    return m;
  }

  tube(pts, radius, material, meta) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = new THREE.Vector3(pts[i - 1].x, -pts[i - 1].y, pts[i - 1].z);
      const b = new THREE.Vector3(pts[i].x, -pts[i].y, pts[i].z);
      const L = a.distanceTo(b);
      if (L < 1e-4) continue;
      const g = new THREE.CylinderGeometry(radius, radius, L, 10, 1);
      const m = new THREE.Mesh(g, material);
      m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.userData = meta ?? {};
      this.group.add(m);
      out.push(m);
      // elbow sphere
      const s = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 8, 8), material);
      s.position.copy(b);
      s.userData = meta ?? {};
      this.group.add(s);
    }
    return out;
  }

  arrow(a, b, color) {
    const dir = new THREE.Vector3(b.x - a.x, -(b.y - a.y), b.z - a.z);
    const L = dir.length();
    if (L < 0.6) return;
    dir.normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 10), new THREE.MeshBasicMaterial({ color }));
    cone.position.set((a.x + b.x) / 2, -(a.y + b.y) / 2, (a.z + b.z) / 2 + 0.0);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.group.add(cone);
  }

  rebuild(first = false) {
    if (!this.ready) return;
    const p = this.store.project;
    const res = this.store.results;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.geometry?.dispose();
    }
    const colors = p.settings.colors ?? {};
    const M = {
      wall: this.mat(0xfafaf7),
      wallInt: this.mat(0xf1efea),
      floor: this.mat(0xd9c7a6, { rough: 0.9 }),
      slab: this.mat(0xcfd3d8),
      glass: this.mat(0x9fc6e8, { opacity: 0.35, rough: 0.1 }),
      door: this.mat(0x9a6b3f),
      rad: this.mat(0xffffff, { rough: 0.4, mep: true }),
      supply: this.mat(colors.supply ?? 0xe0312b, { rough: 0.5, mep: true }),
      ret: this.mat(colors.return ?? 0x1f5fd6, { rough: 0.5, mep: true }),
      ufh: this.mat(0xe08a1f, { mep: true }),
      boiler: this.mat(0xf8f8f8, { rough: 0.3, mep: true }),
      equip: this.mat(0x9aa4b2, { metal: 0.4, mep: true }),
      pump: this.mat(0x2d6cdf, { metal: 0.3, mep: true }),
      tank: this.mat(0xd8261c, { metal: 0.2, mep: true }),
      obstacle: this.mat(0xa08050, { opacity: 0.6 }),
    };
    this.materials = M;
    for (const l of sortedLevels(p)) {
      if (this.isolate && l.id !== this.isolate) continue;
      const z0 = l.elevation;
      const H = l.height ?? 3;
      if (this.showArch) {
        for (const r of elementsOf(p, 'room', l.id)) {
          const shape = new THREE.Shape(r.points.map((q) => new THREE.Vector2(q.x, -q.y)));
          const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
          const m = new THREE.Mesh(g, M.floor);
          m.position.z = z0 - 0.02;
          m.userData = { id: r.id };
          this.group.add(m);
        }
        for (const w of elementsOf(p, 'wall', l.id)) this.buildWall(w, l, M);
        for (const o of elementsOf(p, 'obstacle', l.id)) {
          const d = wallDir(o);
          this.box((o.a.x + o.b.x) / 2, (o.a.y + o.b.y) / 2, z0 + (o.zBottom + o.zTop) / 2, d.L, o.width ?? 0.3, o.zTop - o.zBottom, Math.atan2(d.y, d.x), M.obstacle, { id: o.id });
        }
      }
      // radiators
      for (const e of elementsOf(p, 'radiator', l.id)) {
        const pr = res?.radiators?.[e.id]?.product;
        const L = e.length ?? pr?.length ?? 1;
        const h = pr?.height ?? 0.5;
        const dpt = pr?.depth ?? 0.1;
        const a = ((e.angle ?? 0) * Math.PI) / 180;
        const c = localToPlan(e, 0, -dpt / 2 + 0.05);
        const mesh = this.box(c.x, c.y, z0 + (e.mountHeight ?? 0.1) + h / 2, L, dpt, h, a, M.rad, { id: e.id });
        // fins visual: thin grooves via edges
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xb0b6bf }));
        mesh.add(edges);
        // connection stubs down to pipe elevation
        for (const [lx, mat] of [[-(L / 2 + 0.05) * (e.flip ? -1 : 1), M.supply], [(L / 2 + 0.05) * (e.flip ? -1 : 1), M.ret]]) {
          const q = localToPlan(e, lx, 0.05);
          this.tube([{ x: q.x, y: q.y, z: z0 + (e.mountHeight ?? 0.1) + 0.05 }, { x: q.x, y: q.y, z: z0 + p.settings.pipeElevation }], 0.009, mat, { id: e.id });
        }
      }
      for (const e of elementsOf(p, 'boiler', l.id)) {
        const c = localToPlan(e, 0, 0.065);
        this.box(c.x, c.y, z0 + 1.35, 0.45, 0.35, 0.72, ((e.angle ?? 0) * Math.PI) / 180, M.boiler, { id: e.id });
        for (const [lx, mat] of [[-0.12, M.supply], [0.12, M.ret]]) {
          const q = localToPlan(e, lx, 0.25);
          this.tube([{ x: q.x, y: q.y, z: z0 + 0.99 }, { x: q.x, y: q.y, z: z0 + p.settings.pipeElevation + (lx < 0 ? 0.1 : 0.15) }], 0.014, mat, { id: e.id });
        }
        // expansion tank beside boiler
        if (res?.expansion?.tank) {
          const q = localToPlan(e, 0.45, 0.15);
          const r = Math.cbrt(res.expansion.tank.volumeL / 1000 / Math.PI) * 0.8;
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 2.4, 20), M.tank);
          cyl.rotation.x = Math.PI / 2;
          cyl.position.set(q.x, -q.y, z0 + 0.4 + r * 1.2);
          this.group.add(cyl);
        }
      }
      for (const e of elementsOf(p, 'collector', l.id)) {
        const n = e.outlets ?? 4;
        const L = 0.25 + n * 0.1;
        const a = ((e.angle ?? 0) * Math.PI) / 180;
        const c1 = localToPlan(e, L / 2 - 0.15, 0);
        const c2 = localToPlan(e, L / 2 - 0.15, 0.2);
        this.box(c1.x, c1.y, z0 + 0.55, L, 0.05, 0.05, a, M.supply, { id: e.id });
        this.box(c2.x, c2.y, z0 + 0.4, L, 0.05, 0.05, a, M.ret, { id: e.id });
        const cab = localToPlan(e, L / 2 - 0.15, 0.1);
        this.box(cab.x, cab.y, z0 + 0.5, L + 0.1, 0.32, 0.55, a, this.mat(0xdfe3e8, { opacity: 0.25 }), { id: e.id });
        for (let i = 0; i < n && e.kind !== 'ufh'; i++) {
          const s = localToPlan(e, 0.05 + i * 0.1, 0);
          const r = localToPlan(e, 0.05 + i * 0.1, 0.2);
          this.tube([{ x: s.x, y: s.y, z: z0 + 0.55 }, { x: s.x, y: s.y, z: z0 + p.settings.pipeElevation }], 0.008, M.supply, { id: e.id });
          this.tube([{ x: r.x, y: r.y, z: z0 + 0.4 }, { x: r.x, y: r.y, z: z0 + p.settings.pipeElevation + 0.05 }], 0.008, M.ret, { id: e.id });
        }
        for (const [ly, z, mat] of [[0, 0.55, M.supply], [0.2, 0.4, M.ret]]) {
          const q = localToPlan(e, -0.1, ly);
          this.tube([{ x: q.x, y: q.y, z: z0 + z }, { x: q.x, y: q.y, z: z0 + p.settings.pipeElevation + (ly ? 0.15 : 0.1) }], 0.012, mat, { id: e.id });
        }
      }
      for (const e of elementsOf(p, 'pump', l.id)) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), M.pump);
        m.position.set(e.x, -e.y, z0 + p.settings.pipeElevation + 0.1);
        m.userData = { id: e.id };
        this.group.add(m);
      }
      // pipes
      for (const pipe of elementsOf(p, 'pipe', l.id)) {
        const pr = res?.pipes?.[pipe.id];
        const rad = Math.max(0.006, (pr?.dInner ?? 0.016) / 2 + 0.003);
        const z = z0 + (pipe.elevation ?? p.settings.pipeElevation);
        const pts = pipe.points.map((q) => ({ x: q.x, y: q.y, z }));
        this.tube(pts, rad, pipe.system === 'return' ? M.ret : M.supply, { id: pipe.id });
        if (this.showArrows && pr?.vM3s > 0) {
          const net = res._network;
          let dirPts = pts;
          const fromTree = pipe.system === 'return' ? net?.returnTree : net?.supplyTree;
          if (fromTree) {
            for (const [child, v] of fromTree.parent) {
              if (v.edge.elementId !== pipe.id) continue;
              const nFrom = net.nodes.get(pipe.system === 'return' ? child : v.from);
              if (nFrom && Math.hypot(nFrom.x - pts[0].x, nFrom.y - pts[0].y) > Math.hypot(nFrom.x - pts[pts.length - 1].x, nFrom.y - pts[pts.length - 1].y)) dirPts = [...pts].reverse();
            }
          }
          for (let i = 1; i < dirPts.length; i++) this.arrow(dirPts[i - 1], dirPts[i], pipe.system === 'return' ? 0x1f5fd6 : 0xe0312b);
        }
      }
      // ufh loops
      for (const r of elementsOf(p, 'room', l.id)) {
        const u = res?.ufh?.[r.id];
        if (!u) continue;
        const xs = r.points.map((q) => q.x);
        const ys = r.points.map((q) => q.y);
        const x0 = Math.min(...xs) + 0.2;
        const x1 = Math.max(...xs) - 0.2;
        const y0 = Math.min(...ys) + 0.2;
        const y1 = Math.max(...ys) - 0.2;
        const pts = [];
        let dir = 1;
        for (let y = y0; y <= y1; y += u.spacing) {
          pts.push({ x: dir > 0 ? x0 : x1, y, z: z0 + 0.01 }, { x: dir > 0 ? x1 : x0, y, z: z0 + 0.01 });
          dir = -dir;
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q.x, -q.y, q.z)));
        this.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe08a1f })));
      }
    }
    // risers
    for (const r of elementsOf(p, 'riser')) {
      const a = levelById(p, r.levelFrom);
      const b = levelById(p, r.levelTo);
      if (!a || !b) continue;
      if (this.isolate && r.levelFrom !== this.isolate && r.levelTo !== this.isolate) continue;
      const pr = res?.pipes?.[r.id];
      const rad = Math.max(0.008, (pr?.dInner ?? 0.02) / 2 + 0.003);
      const zz = p.settings.pipeElevation + (r.system === 'return' ? 0.15 : 0.1);
      this.tube([{ x: r.x, y: r.y, z: a.elevation + zz }, { x: r.x, y: r.y, z: b.elevation + zz }], rad, r.system === 'return' ? M.ret : M.supply, { id: r.id });
    }
    this.applyClip();
    this.highlight();
    if (first || !this._fitted) {
      this._fitted = true;
      this.fitCamera();
    }
  }

  buildWall(w, level, M) {
    const p = this.store.project;
    const d = wallDir(w);
    const H = level.height ?? 3;
    const z0 = level.elevation;
    const ang = Math.atan2(d.y, d.x);
    const mat = w.exterior ? M.wall : M.wallInt;
    const ops = [...elementsOf(p, 'window', level.id), ...elementsOf(p, 'door', level.id)].filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
    // split the wall into solid pieces around openings
    let s = 0;
    const piece = (s0, s1, zb, zt) => {
      if (s1 - s0 < 1e-3 || zt - zb < 1e-3) return;
      const cx = w.a.x + d.x * ((s0 + s1) / 2);
      const cy = w.a.y + d.y * ((s0 + s1) / 2);
      this.box(cx, cy, z0 + (zb + zt) / 2, s1 - s0, w.thickness, zt - zb, ang, mat, { id: w.id });
    };
    for (const o of ops) {
      const o0 = Math.max(0, o.offset - o.width / 2);
      const o1 = Math.min(d.L, o.offset + o.width / 2);
      piece(s, o0, 0, H);
      piece(o0, o1, 0, o.sill ?? 0);
      piece(o0, o1, (o.sill ?? 0) + o.height, H);
      const cx = w.a.x + d.x * o.offset;
      const cy = w.a.y + d.y * o.offset;
      if (o.cat === 'window') this.box(cx, cy, z0 + o.sill + o.height / 2, o.width, 0.04, o.height, ang, M.glass, { id: o.id });
      else this.box(cx, cy, z0 + o.height / 2, o.width, 0.05, o.height, ang, M.door, { id: o.id });
      s = o1;
    }
    piece(s, d.L, 0, H);
    // slab above
    void openingPos;
  }

  highlight() {
    if (!this.ready) return;
    const sel = this.store.selection;
    this.group.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      if (sel.has(o.userData.id)) {
        if (!o.userData.hl) {
          o.material = o.material.clone();
          o.userData.hl = true;
        }
        o.material.emissive.setHex(0x1e6ef2);
        o.material.emissiveIntensity = 0.6;
      } else if (o.userData.hl) {
        o.material.emissive.setHex(0x000000);
      }
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects(this.group.children, false).filter((h) => h.object.visible);
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

  fitCamera() {
    if (!this.ready) return;
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(c);
    this.camera.position.set(c.x - size * 0.45, c.y - size * 0.75, c.z + size * 0.65);
    this.camera.near = size / 500;
    this.camera.far = size * 20;
    this.camera.updateProjectionMatrix();
  }

  toPNG() {
    if (!this.ready) return null;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

export { polygonCentroid };
