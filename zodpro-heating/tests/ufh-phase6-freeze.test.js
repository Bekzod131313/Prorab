// Phase 7.0 baseline guard: the Phase 6 algorithm is frozen at 06130b3 (docs/phase6/ACCEPTANCE.md).
// Any byte changed in these files fails here — a change to Phase 6 is a new, re-proven phase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';

const BASELINE = '06130b3';
const FROZEN = {
  'geom.js': '8712da7dafb5c82b2a31f2e64ea29539d07f28034cfa564172735830ca9db230',
  'spiralgen.js': '96fe45dc50ff43db84326e53cfc4453d6052a7e53f9d9440e51042824e25181c',
  'decompose.js': '3ee5f555a254e981b938ff32beead32701496d54f2c125da3e3a8c42808ee021',
  'obstaclespiral.js': 'fad3bfe6444644af62af3866b7853152af3b8cbb0e82eea5d15913b7bbe42cbf',
  'closure.js': '6ca1dbacb6a9df055660e5aae1cd841197af1dbe7c7493c432e91e43f38b408e',
  'rawcheck.js': '425a7530ee30cb041143217435e40dec16e500c11e913e6178d64a734060f755',
  'criteria.js': 'ef07d88b67664fc86ce6bca51e59f80bf5d307102965b3f7272ca45b175eb71d',
  'loopplanner.js': '15ebdce4ea041cdb01a72f4b1ce4e185ba875c3c6cf02513bb3e29029d359acf',
  'loopproof.js': '3f9dd622593bc34c1536c3769af8ab9f162941e072790c018e64d5d67dbcf415',
  'partitionsearch.js': 'de6aaeb050313a5590fad771c9cd5704cdb175fe6440ab04baf23d018cefb519',
};

test(`Phase 6 frozen at ${BASELINE}: 10 / 10 algorithm files byte-identical (SHA-256)`, () => {
  const bad = [];
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(new URL(`../src/engines/ufh/${f}`, import.meta.url))).digest('hex');
    if (got !== want) bad.push(`${f}: ${got}`);
  }
  assert.equal(Object.keys(FROZEN).length, 10);
  assert.deepEqual(bad, [], `Phase 6 files changed since ${BASELINE}`);
});

test('Phase 6 acceptance baseline and evidence are in the repository', () => {
  const doc = fs.readFileSync(new URL('../docs/phase6/ACCEPTANCE.md', import.meta.url), 'utf8');
  assert.ok(doc.includes('06130b3') && doc.includes('candidate_minimum = 7'));
  assert.ok(!/global minimum\s*=\s*7/i.test(doc));
  for (const f of ['proof-LP8-k6-root-progress.jsonl', 'proof-LP8-k5-grid0.05.log', 'rebuilt-LP8-k7.log', 'regression-169.log'])
    assert.ok(fs.existsSync(new URL(`../docs/phase6/evidence/${f}`, import.meta.url)), f);
});
