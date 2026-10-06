// UFH routing in the background (spec §40): the UI stays responsive, progress is reported.
import { runPhase6Engine as runUfhEngine } from '../engines/ufh/apartment.js';

self.onmessage = (e) => {
  const { id, job } = e.data;
  try {
    const result = runUfhEngine(job, (step, f) => self.postMessage({ id, type: 'progress', step, f }));
    const transfer = result.map?.grid ? [result.map.grid.buffer] : [];
    self.postMessage({ id, type: 'result', result }, transfer);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message ?? String(err) });
  }
};
