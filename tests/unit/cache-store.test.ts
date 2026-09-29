// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPage, structuralFingerprint } from '@flecto/core';
import { CACHE_VERSION, PROMPT_VERSION } from '@flecto/contracts';
import { BlueprintStore } from '../../apps/planner/src/cache/store';
import { buildFixturePlan } from '../../apps/planner/src/provider/fixture';
import { compatibleKey, rebindCompatible } from '../../apps/planner/src/cache/compatibility';

afterEach(() => { document.body.innerHTML = ''; });
function source() {
  document.body.innerHTML = `<form action="/apply" method="post"><label for="c">강좌</label>
    <select id="c" required><option disabled>강좌를 선택해 주세요</option><option>요가</option><option>수영</option></select>
    <p>수강료 30,000원</p><button>신청</button></form>`;
  const initial = extractPage(document);
  return extractPage(document, { goalRef: initial.snapshot.controls.find(c => c.kind === 'submit')!.ref }).snapshot;
}
it('migrates the existing seven-column SQLite table without granting old rows compatibility', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flecto-cache-migration-'));
  const path = join(dir, 'old.sqlite'); const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE blueprints(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,model TEXT NOT NULL,
    version TEXT NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL)`);
  const store = new BlueprintStore(path);
  try {
    const snapshot = source(); const fingerprint = await structuralFingerprint(snapshot);
    const candidate = store.candidate(snapshot, buildFixturePlan(snapshot), fingerprint, 'FIXTURE:unit');
    expect(store.findCompatible(snapshot, 'FIXTURE:unit')).toBeNull();
    store.verify(candidate.id);
    expect(store.find(fingerprint, 'FIXTURE:unit')!.id).toBe(candidate.id);
    db.prepare('UPDATE blueprints SET compatible_key=NULL,compatible_version=NULL').run();
    expect(store.findCompatible(snapshot, 'FIXTURE:unit')).toBeNull();
    expect(store.find(fingerprint, 'FIXTURE:unit')!.id).toBe(candidate.id);
    expect(db.prepare('SELECT version FROM blueprints').get()!.version).toBe(`${PROMPT_VERSION}:${CACHE_VERSION}`);
    store.quarantine(candidate.id); store.quarantine(candidate.id);
    expect(store.find(fingerprint, 'FIXTURE:unit')).toBeNull(); expect(store.quarantines).toBe(1);
  } finally { store.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
it.each(['선택하세요', '강좌를 선택해 주세요', '선택', '---', 'Please select a course', 'Choose a course'])('a remaining prompt is not a genuine enabled choice: %s', label => {
  const snapshot = source();
  snapshot.controls[0].options = [{ ref: 'prompt_option', label, disabled: false }, { ref: 'sold_out', label: '요가', disabled: true }];
  expect(compatibleKey(snapshot)).toBeNull();
});
it('requires matching compatibility evidence and complete unique locators, even for optional controls', async () => {
  const store = new BlueprintStore(':memory:');
  try {
    const snapshot = source(); const fingerprint = await structuralFingerprint(snapshot);
    const candidate = store.candidate(snapshot, buildFixturePlan(snapshot), fingerprint, 'FIXTURE:unit');
    store.verify(candidate.id); const blueprint = store.find(fingerprint, 'FIXTURE:unit')!;
    expect(() => rebindCompatible(blueprint, snapshot, 'wrong-signature')).toThrow('STALE_DOCUMENT');
    expect(() => rebindCompatible({ ...blueprint, locators: [] }, snapshot, compatibleKey(snapshot)!)).toThrow('STALE_DOCUMENT');
    expect(() => rebindCompatible({ ...blueprint, locators: [blueprint.locators[0], blueprint.locators[0]] }, snapshot, compatibleKey(snapshot)!)).toThrow('STALE_DOCUMENT');
    store.quarantine(candidate.id); expect(store.findCompatible(snapshot, 'FIXTURE:unit')).toBeNull();
  } finally { store.close(); }
});
