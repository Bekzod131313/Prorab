// debug render of an engine result: collector, doors, wall-following leads (50 mm offset), supply /
// return, loop entry point + starting direction, 200 mm pitch; per lead START → DOOR → ROOM ENTRY → LOOP START
import fs from 'fs';
import { house } from './house.mjs';
import { zoneJob } from '/home/user/Prorab/zodpro-heating/src/core/ufhmodel.js';
const { pr, z1, z2 } = house();
pr.elements[z1.id] = z1;
const job = zoneJob(pr, z2, null, { siblings: [z1] });
const r = JSON.parse(fs.readFileSync(process.argv[2]));
const K = 90, O = 60, T = (p) => [p.x * K + O, p.y * K + O];
const P = (pts) => pts.map((p) => T(p).map((v) => v.toFixed(1)).join(',')).join(' ');
const W = 8.5 * K + 2 * O + 330, H = 10 * K + 2 * O;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" style="background:#fff">`;
for (const w of Object.values(pr.elements).filter((e) => e.cat === 'wall')) { const [x1, y1] = T(w.a), [x2, y2] = T(w.b); svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3b4252" stroke-width="${w.thickness * K}"/>`; }
for (const rm of job.rooms) svg += `<polygon points="${P(rm.poly)}" fill="none" stroke="#999" stroke-width="0.6" stroke-dasharray="2 2"/>`;
// doors
const doors = job.doors.filter((d) => !d.virtual);
doors.forEach((d, i) => { const [x, y] = T(d.c); svg += `<circle cx="${x}" cy="${y}" r="${(d.width / 2) * K}" fill="#fff8e1" stroke="#f9a825" stroke-width="1.5"/><text x="${x + 6}" y="${y - 6}" font-size="13" fill="#e65100" font-weight="bold">DOOR D${i + 1}</text>`; });
// heating (thin, per loop colour)
const cols = ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#ad1457'];
const legend = [];
r.loops.forEach((l, i) => {
  const leads = r.leads.filter((q) => q.loop === l.key && q.path.length >= 2);
  const spiral = l.spiralPath;
  svg += `<polyline points="${P(spiral)}" fill="none" stroke="${cols[i % 8]}" stroke-width="1.3" opacity="0.75"/>`;
  // leads: supply red, return blue (pair)
  for (const q of leads) svg += `<polyline points="${P(q.path)}" fill="none" stroke="${q.kind === 'supply' ? '#e53935' : '#1e88e5'}" stroke-width="1.6"/>`;
  // loop entry point + starting direction (first spiral segment)
  const e = spiral[0], n = spiral.find((p) => Math.hypot(p.x - e.x, p.y - e.y) > 0.15) ?? spiral[1];
  const [ex, ey] = T(e), [nx, ny] = T(n);
  const L = Math.hypot(nx - ex, ny - ey) || 1;
  svg += `<circle cx="${ex}" cy="${ey}" r="5" fill="#000"/><line x1="${ex}" y1="${ey}" x2="${ex + ((nx - ex) / L) * 28}" y2="${ey + ((ny - ey) / L) * 28}" stroke="#000" stroke-width="2.5" marker-end="url(#a)"/><text x="${ex + 7}" y="${ey + 16}" font-size="12" font-weight="bold" fill="${cols[i % 8]}">${l.circuitId} START</text>`;
  // sequence: START (port) → DOOR(s) passed → ROOM ENTRY → LOOP START
  const sup = leads.find((q) => q.kind === 'supply') ?? leads[0];
  const passed = doors.map((d, j) => ({ j, d })).filter(({ d }) => sup.path.some((p, k) => k && segDist(d.c, sup.path[k - 1], p) < d.width / 2 + 0.05)).sort((a, b) => idxOn(sup.path, a.d.c) - idxOn(sup.path, b.d.c)).map(({ j }) => `D${j + 1}`);
  const lead = leads.reduce((a, q) => a + q.path.reduce((s2, p, k) => (k ? s2 + Math.hypot(p.x - q.path[k - 1].x, p.y - q.path[k - 1].y) : 0), 0), 0);
  legend.push({ c: cols[i % 8], t: `${l.circuitId}: START(C-01) → ${passed.length ? passed.join(' → ') + ' → ' : ''}ROOM ENTRY → LOOP START`, t2: `   lead ${lead.toFixed(1)} m · total ${l.length.toFixed(2)} m · ${l.closure} · ${l.status}` });
});
// collector
const ports = job.collector.ports;
svg += `<polyline points="${P(ports.map((p) => p.supply))}" stroke="#000" stroke-width="5"/><text x="${T(ports[0].supply)[0] - 10}" y="${T(ports[0].supply)[1] + 30}" font-size="13" font-weight="bold">COLLECTOR C-01</text>`;
// 50 mm offset callout + pitch callout
svg += `<text x="${T({ x: 4.62, y: 8.6 })[0] + 40}" y="${T({ x: 4.62, y: 8.6 })[1]}" font-size="12" fill="#333">← wall-following transfer, 1st lead 50 mm from the wall, leads 50 mm apart</text>`;
svg += `<text x="${O}" y="${H - 12}" font-size="12" fill="#333">heatingPitch 200 mm (spirals) · supply = red, return = blue · ● loop entry, ➜ starting direction</text>`;
svg += `<defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#000"/></marker></defs>`;
legend.forEach((g, i) => { svg += `<text x="${8.5 * K + 2 * O - 20}" y="${O + 10 + i * 44}" font-size="12" fill="${g.c}" font-weight="bold">${g.t}</text><text x="${8.5 * K + 2 * O - 20}" y="${O + 26 + i * 44}" font-size="11" fill="#444">${g.t2}</text>`; });
fs.writeFileSync(process.argv[3], svg + '</svg>');
function segDist(p, a, b) { const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-12; const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)); return Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y); }
function idxOn(path, c) { let b = 0, bd = 1e9; path.forEach((p, k) => { if (k && segDist(c, path[k - 1], p) < bd) { bd = segDist(c, path[k - 1], p); b = k; } }); return b; }
