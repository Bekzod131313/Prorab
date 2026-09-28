// Enscape-style navigation for the 3D view (Z up):
//   left drag   – look around (the camera turns in place)
//   right drag  – orbit around the point under the cursor
//   middle drag / Shift+left – pan
//   wheel       – move towards / away from the point under the cursor
//   W A S D / arrows – walk (see View3D.walkStep), Q / E – down / up, Shift – faster
// The object keeps a `target` (the point looked at) so the rest of the viewer can aim the camera.
import * as THREE from 'three';

export class NavControls {
  /** @param pick (clientX, clientY) → THREE.Vector3 | null — scene point under the cursor */
  constructor(camera, dom, pick) {
    this.camera = camera;
    this.dom = dom;
    this.pick = pick;
    this.target = new THREE.Vector3();
    this.enabled = true;
    this.lookSpeed = 0.0042;
    this.drag = null;
    this.walk = false; // eye-level mode: vertical look only, no pitch change of position
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => this.down(e));
    dom.addEventListener('pointermove', (e) => this.move(e));
    dom.addEventListener('pointerup', (e) => this.up(e));
    dom.addEventListener('pointercancel', (e) => this.up(e));
    dom.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  update() {
    this.camera.lookAt(this.target);
  }

  down(e) {
    if (!this.enabled) return;
    const mode = e.button === 2 ? 'orbit' : e.button === 1 || (e.button === 0 && e.shiftKey) ? 'pan' : 'look';
    let pivot = null;
    if (mode !== 'look') pivot = this.pick(e.clientX, e.clientY) ?? this.target.clone();
    this.drag = { mode, x: e.clientX, y: e.clientY, pivot };
    this.dom.setPointerCapture?.(e.pointerId);
  }

  move(e) {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    const cam = this.camera;
    if (d.mode === 'look') {
      // turn the view direction in place (yaw about Z, pitch about the camera's right axis)
      const dir = this.target.clone().sub(cam.position);
      const dist = Math.max(dir.length(), 0.5);
      dir.normalize();
      this.rotateDir(dir, -dx * this.lookSpeed, -dy * this.lookSpeed);
      this.target.copy(cam.position).addScaledVector(dir, dist);
    } else if (d.mode === 'orbit') {
      // move the camera around the pivot; keep looking the same way relative to it
      const pv = d.pivot;
      const yaw = -dx * this.lookSpeed * 1.2;
      const pitch = -dy * this.lookSpeed * 1.2;
      const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
      const off = cam.position.clone().sub(pv).applyQuaternion(qz);
      const toT = this.target.clone().sub(pv).applyQuaternion(qz);
      const right = new THREE.Vector3().crossVectors(off.clone().negate(), new THREE.Vector3(0, 0, 1)).normalize();
      const qx = new THREE.Quaternion().setFromAxisAngle(right, pitch);
      const off2 = off.clone().applyQuaternion(qx);
      // stay between straight down and just above the horizon of the pivot
      const el = Math.asin(Math.max(-1, Math.min(1, off2.z / off2.length())));
      const useX = el > -0.1 && el < 1.55;
      cam.position.copy(pv).add(useX ? off2 : off);
      this.target.copy(pv).add(useX ? toT.applyQuaternion(qx) : toT);
    } else if (d.mode === 'pan') {
      const dist = Math.max(0.5, cam.position.distanceTo(d.pivot));
      const k = (2 * dist * Math.tan(((cam.fov ?? 40) * Math.PI) / 360)) / Math.max(1, this.dom.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
      const mv = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
      cam.position.add(mv);
      this.target.add(mv);
    }
  }

  up(e) {
    this.drag = null;
    this.dom.releasePointerCapture?.(e.pointerId);
  }

  wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const cam = this.camera;
    const p = this.pick(e.clientX, e.clientY);
    const dir = p ? p.clone().sub(cam.position) : this.target.clone().sub(cam.position).normalize().multiplyScalar(8);
    const dist = dir.length();
    if (dist < 1e-6) return;
    // 15 % of the way per notch (never less than 0.25 m, never through the surface)
    const inward = e.deltaY < 0;
    let step = Math.max(0.25, dist * 0.15);
    if (inward) step = Math.min(step, dist - 0.3);
    if (step <= 0) return;
    const mv = dir.normalize().multiplyScalar(inward ? step : -step);
    if (this.walk) mv.z = 0;
    cam.position.add(mv);
    this.target.add(mv);
  }

  rotateDir(dir, yaw, pitch) {
    dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
    const d2 = dir.clone().applyAxisAngle(right, pitch);
    if (Math.abs(d2.z) < 0.985) dir.copy(d2); // no flipping over the zenith / nadir
    return dir;
  }
}
