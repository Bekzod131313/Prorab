// System topology: builds a real graph of the heating network from BIM connectors, pipes,
// risers and equipment, then traces flow paths boiler → … → consumer → … → boiler.
//
// Supported topology: tree-shaped supply and return networks (2-pipe radial / collector
// systems, 2-pipe dead-end branches). Closed loops are detected and reported (Hardy-Cross
// loop solving is tracked in backlog item HYD-LOOP).

import { allConnectors, elementsOf, levelById, levelIndex, sortedLevels } from '../core/model.js';
import { round, polylineLength } from '../core/util.js';

export const NETWORK_VERSION = 'network/1.1';
const SNAP = 0.03;

const nodeKey = (levelId, system, x, y) => `${levelId}|${system}|${round(x, 3)},${round(y, 3)}`;

export function buildNetwork(project, productLookup) {
  const nodes = new Map();
  const edges = [];
  const issues = [];
  const connectors = allConnectors(project, productLookup);
  const connByKey = new Map();

  const ensureNode = (key, info) => {
    if (!nodes.has(key)) nodes.set(key, { key, ...info, edges: [], connectors: [] });
    return nodes.get(key);
  };

  for (const c of connectors) {
    const key = nodeKey(c.levelId, c.system, c.pos.x, c.pos.y);
    const n = ensureNode(key, { levelId: c.levelId, system: c.system, x: c.pos.x, y: c.pos.y });
    n.connectors.push(c);
    connByKey.set(c.id, key);
  }

  const snapToConnector = (levelId, system, p) => {
    let best = null;
    let bestD = SNAP;
    for (const c of connectors) {
      if (c.levelId !== levelId) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.y - p.y);
      if (d <= bestD) {
        if (c.system !== system) {
          issues.push({ severity: 'error', code: 'connector_system_mismatch', params: { connector: c.id, system } , elementId: c.elementId });
          continue;
        }
        best = c;
        bestD = d;
      }
    }
    return best;
  };

  const addEdge = (e) => {
    edges.push(e);
    nodes.get(e.a).edges.push(e);
    nodes.get(e.b).edges.push(e);
  };

  // pipes
  for (const p of elementsOf(project, 'pipe')) {
    if (!p.points || p.points.length < 2) continue;
    const sys = p.system === 'return' ? 'return' : 'supply';
    const ends = [p.points[0], p.points[p.points.length - 1]].map((pt) => {
      const c = snapToConnector(p.levelId, sys, pt);
      const pos = c ? c.pos : pt;
      const key = nodeKey(p.levelId, sys, pos.x, pos.y);
      ensureNode(key, { levelId: p.levelId, system: sys, x: pos.x, y: pos.y });
      return key;
    });
    if (ends[0] === ends[1]) {
      issues.push({ severity: 'warning', code: 'pipe_zero_loop', elementId: p.id });
      continue;
    }
    addEdge({
      id: p.id,
      kind: 'pipe',
      elementId: p.id,
      system: sys,
      a: ends[0],
      b: ends[1],
      length: polylineLength(p.points),
      bends: Math.max(0, p.points.length - 2),
    });
  }

  // risers: vertical semantic connection between the same (x,y) on two levels
  for (const r of elementsOf(project, 'riser')) {
    const sys = r.system === 'return' ? 'return' : 'supply';
    const lf = levelById(project, r.levelFrom);
    const lt = levelById(project, r.levelTo);
    if (!lf || !lt) {
      issues.push({ severity: 'error', code: 'riser_bad_level', elementId: r.id });
      continue;
    }
    const ka = nodeKey(lf.id, sys, r.x, r.y);
    const kb = nodeKey(lt.id, sys, r.x, r.y);
    ensureNode(ka, { levelId: lf.id, system: sys, x: r.x, y: r.y });
    ensureNode(kb, { levelId: lt.id, system: sys, x: r.x, y: r.y });
    addEdge({ id: r.id, kind: 'riser', elementId: r.id, system: sys, a: ka, b: kb, length: Math.abs(lt.elevation - lf.elevation), bends: 0 });
  }

  // internal equipment edges
  const consumers = [];
  let source = null;
  for (const el of Object.values(project.elements)) {
    const key = (name) => connByKey.get(`${el.id}:${name}`);
    if (el.cat === 'collector') {
      if (el.kind === 'ufh') {
        consumers.push({ kind: 'ufh_collector', elementId: el.id, supplyKey: key('in_supply'), returnKey: key('in_return') });
      } else {
        for (let i = 1; i <= (el.outlets ?? 4); i++) {
          addEdge({ id: `${el.id}#s${i}`, kind: 'manifold', elementId: el.id, system: 'supply', a: key('in_supply'), b: key(`s${i}`), length: 0, bends: 0 });
          addEdge({ id: `${el.id}#r${i}`, kind: 'manifold', elementId: el.id, system: 'return', a: key(`r${i}`), b: key('in_return'), length: 0, bends: 0 });
        }
      }
    } else if (el.cat === 'pump') {
      addEdge({ id: `${el.id}#p`, kind: 'pump', elementId: el.id, system: 'supply', a: key('in'), b: key('out'), length: 0, bends: 0 });
    } else if (el.cat === 'radiator') {
      consumers.push({ kind: 'radiator', elementId: el.id, supplyKey: key('supply'), returnKey: key('return') });
    } else if (el.cat === 'boiler') {
      if (source) issues.push({ severity: 'warning', code: 'multiple_sources', elementId: el.id });
      else source = { elementId: el.id, supplyKey: key('supply'), returnKey: key('return') };
    }
  }

  // BFS trees
  const bfs = (rootKey, system) => {
    const parent = new Map(); // nodeKey → {edge, from}
    const visited = new Set([rootKey]);
    const loops = [];
    const queue = [rootKey];
    while (queue.length) {
      const k = queue.shift();
      for (const e of nodes.get(k)?.edges ?? []) {
        if (e.system !== system) continue;
        const other = e.a === k ? e.b : e.a;
        if (parent.get(k)?.edge === e) continue;
        if (visited.has(other)) {
          loops.push(e.id);
          continue;
        }
        visited.add(other);
        parent.set(other, { edge: e, from: k });
        queue.push(other);
      }
    }
    return { parent, visited, loops: [...new Set(loops)] };
  };

  let supplyTree = null;
  let returnTree = null;
  if (!source) {
    issues.push({ severity: 'critical', code: 'no_source' });
  } else {
    supplyTree = bfs(source.supplyKey, 'supply');
    returnTree = bfs(source.returnKey, 'return');
    for (const l of [...supplyTree.loops, ...returnTree.loops]) issues.push({ severity: 'warning', code: 'loop_detected', elementId: l.split('#')[0] });
  }

  const pathTo = (tree, key) => {
    const path = [];
    let k = key;
    let guard = 0;
    while (tree.parent.has(k) && guard++ < 100000) {
      const p = tree.parent.get(k);
      path.push(p.edge);
      k = p.from;
    }
    return path.reverse();
  };

  for (const c of consumers) {
    c.connected = false;
    if (!source) continue;
    const sOk = c.supplyKey && supplyTree.visited.has(c.supplyKey);
    const rOk = c.returnKey && returnTree.visited.has(c.returnKey);
    c.supplyPath = sOk ? pathTo(supplyTree, c.supplyKey) : [];
    c.returnPath = rOk ? pathTo(returnTree, c.returnKey) : [];
    c.connected = !!(sOk && rOk);
    if (!sOk) issues.push({ severity: 'error', code: 'consumer_supply_disconnected', elementId: c.elementId });
    if (!rOk) issues.push({ severity: 'error', code: 'consumer_return_disconnected', elementId: c.elementId });
  }

  // disconnected / dangling pipes
  const reached = new Set();
  if (source) {
    for (const k of supplyTree.visited) for (const e of nodes.get(k).edges) reached.add(e.id);
    for (const k of returnTree.visited) for (const e of nodes.get(k).edges) reached.add(e.id);
  }
  for (const e of edges) {
    if ((e.kind === 'pipe' || e.kind === 'riser') && !reached.has(e.id)) {
      issues.push({ severity: 'error', code: 'pipe_disconnected', elementId: e.elementId });
    }
  }
  for (const n of nodes.values()) {
    const deg = n.edges.length;
    if (deg === 1 && !n.connectors.length) {
      const e = n.edges[0];
      if (e.kind === 'pipe' || e.kind === 'riser') issues.push({ severity: 'warning', code: 'pipe_open_end', elementId: e.elementId, params: { x: round(n.x, 2), y: round(n.y, 2) } });
    }
    if (deg >= 3) n.tee = true;
  }

  return { nodes, edges, consumers, source, issues, supplyTree, returnTree, version: NETWORK_VERSION };
}

/** Levels touched by the network — used by the riser diagram. */
export function networkLevels(project) {
  return sortedLevels(project).map((l) => ({ ...l, index: levelIndex(project, l.id) }));
}
