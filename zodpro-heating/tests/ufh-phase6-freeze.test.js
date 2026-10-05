// Phase 6 baseline guard. First frozen at 06130b3 (docs/phase6/ACCEPTANCE.md); reopened by the user
// (lead-aware spiral / side terminal closure — docs/phase6r/ACCEPTANCE.md) and frozen again here.
// Any byte changed in these files fails here — a change to Phase 6 is a new, re-proven phase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';

const BASELINE = 'Phase 6 reopen (phase6r)';
const FROZEN = {
  'geom.js': '8712da7dafb5c82b2a31f2e64ea29539d07f28034cfa564172735830ca9db230',
  'spiralgen.js': '96fe45dc50ff43db84326e53cfc4453d6052a7e53f9d9440e51042824e25181c',
  'decompose.js': '5a7090365c47efac8ff9c81162ea60de46af332bf46b910ac2daa72338dcc7d9',
  'obstaclespiral.js': '3f66d5e158ec28dd63f42b1272342c7c9660b951fed3ccdda63945e6dadd6a78',
  'closure.js': 'b57168f5ab73382164a74bd3da2b56d580ed56209bcb7491d66b44d3396987aa',
  'rawcheck.js': '425a7530ee30cb041143217435e40dec16e500c11e913e6178d64a734060f755',
  'criteria.js': '53f1fb1dd85428fe07d2ea91a8aa86ad09ec06e250034aa2bfd640ec9ad5e0f3',
  'loopplanner.js': '15ebdce4ea041cdb01a72f4b1ce4e185ba875c3c6cf02513bb3e29029d359acf',
  'loopproof.js': '3f9dd622593bc34c1536c3769af8ab9f162941e072790c018e64d5d67dbcf415',
  'partitionsearch.js': 'de6aaeb050313a5590fad771c9cd5704cdb175fe6440ab04baf23d018cefb519',
  'leadaware.js': '2047c55f2c4f0d2c4478d2ee6dc0181bd6cb651d56c2fac2b7945458ec842177',
};

test(`Phase 6 frozen at ${BASELINE}: 11 / 11 algorithm files byte-identical (SHA-256)`, () => {
  const bad = [];
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url))).digest('hex');
    if (got !== want) bad.push(`${f}: ${got}`);
  }
  assert.equal(Object.keys(FROZEN).length, 11);
  assert.deepEqual(bad, [], `Phase 6 files changed since ${BASELINE}`);
});

test('Phase 6 acceptance baseline and evidence are in the repository', () => {
  const doc = fs.readFileSync(new URL('../docs/phase6/ACCEPTANCE.md', import.meta.url), 'utf8');
  assert.ok(doc.includes('06130b3') && doc.includes('candidate_minimum = 7'));
  assert.ok(!/global minimum\s*=\s*7/i.test(doc));
  for (const f of ['proof-LP8-k6-root-progress.jsonl', 'proof-LP8-k5-grid0.05.log', 'rebuilt-LP8-k7.log', 'regression-169.log'])
    assert.ok(fs.existsSync(new URL(`../docs/phase6/evidence/${f}`, import.meta.url)), f);
  // the reopen: its acceptance, the old / new measurements
  const r = fs.readFileSync(new URL('../docs/phase6r/ACCEPTANCE.md', import.meta.url), 'utf8');
  assert.ok(r.includes('06130b3') && r.includes(FROZEN['leadaware.js'].slice(0, 12)));
  for (const f of ['old-baseline.json', 'new-phase6.json', 'lead-aware-apartment.json']) assert.ok(fs.existsSync(new URL(`../docs/phase6r/evidence/${f}`, import.meta.url)), f);
});
