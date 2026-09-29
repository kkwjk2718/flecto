import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  CachedBlueprintSchema, CACHE_VERSION, PROMPT_VERSION, RunMetricSchema,
  type CachedBlueprint, type PagePlan, type PublicPageSnapshot, type RunMetric,
} from '@flecto/contracts';
import { rebindBlueprint } from '@flecto/core';
import { COMPATIBILITY_VERSION, compatibleKey, genericTitles, rebindCompatible } from './compatibility';

export class BlueprintStore {
  private readonly db: DatabaseSync;
  quarantines = 0;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS blueprints (
        id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, model TEXT NOT NULL,
        version TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS blueprint_lookup ON blueprints(fingerprint, model, version, status);
      CREATE TABLE IF NOT EXISTS plan_runs (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sponsor_aggregate (day TEXT PRIMARY KEY, impressions INTEGER NOT NULL DEFAULT 0);`);
    const columns = this.db.prepare('PRAGMA table_info(blueprints)').all();
    if (!columns.some(c => c.name === 'compatible_key')) this.db.exec('ALTER TABLE blueprints ADD COLUMN compatible_key TEXT');
    if (!columns.some(c => c.name === 'compatible_version')) this.db.exec('ALTER TABLE blueprints ADD COLUMN compatible_version TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS blueprint_compatible ON blueprints(compatible_key,compatible_version,model,version,status)');
  }
  find(fingerprint: string, model: string): CachedBlueprint | null {
    const row = this.db.prepare('SELECT id,payload FROM blueprints WHERE fingerprint=? AND model=? AND version=? AND status=? ORDER BY created_at DESC LIMIT 1')
      .get(fingerprint, model, `${PROMPT_VERSION}:${CACHE_VERSION}`, 'VERIFIED');
    if (!row) return null;
    try {
      const blueprint = CachedBlueprintSchema.parse(JSON.parse(String(row.payload)));
      if (blueprint.id !== row.id || blueprint.status !== 'VERIFIED' || blueprint.model !== model ||
        blueprint.fingerprint !== fingerprint || blueprint.promptVersion !== PROMPT_VERSION || blueprint.cacheVersion !== CACHE_VERSION) {
        this.quarantine(String(row.id)); return null;
      }
      return genericTitles(blueprint);
    }
    catch { this.quarantine(String(row.id)); return null; }
  }
  findCompatible(snapshot: PublicPageSnapshot, model: string): { blueprint: CachedBlueprint; plan: PagePlan } | null {
    const key = compatibleKey(snapshot);
    if (!key) return null;
    const rows = this.db.prepare(`SELECT id,payload,fingerprint FROM blueprints
      WHERE compatible_key=? AND compatible_version=? AND model=? AND version=? AND status='VERIFIED'
      ORDER BY created_at DESC LIMIT 8`).all(key, COMPATIBILITY_VERSION, model, `${PROMPT_VERSION}:${CACHE_VERSION}`);
    for (const row of rows) {
      try {
        const blueprint = CachedBlueprintSchema.parse(JSON.parse(String(row.payload)));
        if (blueprint.id !== row.id || blueprint.model !== model || blueprint.fingerprint !== row.fingerprint) throw new Error('Invalid cache metadata');
        const plan = rebindCompatible(blueprint, snapshot, key);
        return { blueprint: genericTitles(blueprint), plan };
      } catch { this.quarantine(String(row.id)); }
    }
    return null;
  }
  candidate(snapshot: PublicPageSnapshot, plan: PagePlan, fingerprint: string, model: string): CachedBlueprint {
    const controls = new Map(snapshot.controls.map((control) => [control.ref, control]));
    const notices = new Map(snapshot.notices.map((notice) => [notice.ref, notice]));
    const selected = snapshot.goal === 'complete_form' && snapshot.goalRef ? controls.get(snapshot.goalRef) : undefined;
    const scopedControls = selected ? snapshot.controls.filter(c => c.ref === selected.ref || (c.formRef === selected.formRef && c.actionKind === 'none')) : snapshot.controls;
    const stableKey = (key: string) => selected ? key.replace(/^form_\d+(?=\||$)/, 'selected_form') : key;
    const blueprint = CachedBlueprintSchema.parse({
      id: `b_${randomUUID()}`, schemaVersion: 1, cacheVersion: CACHE_VERSION, promptVersion: PROMPT_VERSION,
      model, origin: snapshot.origin, fingerprint, status: 'CANDIDATE', createdAt: Date.now(),
      steps: genericTitles(plan).steps.map((step) => ({
        id: step.id, template: step.template, title: step.title,
        controlKeys: step.controlRefs.map((ref) => stableKey(controls.get(ref)!.semanticKey)),
        noticeKeys: step.noticeRefs.map((ref) => stableKey(notices.get(ref)!.semanticKey)),
      })),
      actionKey: plan.sourceActionRef ? stableKey(controls.get(plan.sourceActionRef)!.semanticKey) : null,
      locators: scopedControls.map((control) => ({
        key: stableKey(control.semanticKey), kind: control.kind,
        formKey: control.formRef === null ? null : stableKey(control.semanticKey.split('|')[0]), required: control.required,
      })),
    });
    this.db.prepare('INSERT INTO blueprints(id,fingerprint,model,version,status,payload,created_at,compatible_key,compatible_version) VALUES(?,?,?,?,?,?,?,?,?)').run(blueprint.id, fingerprint, model,
      `${PROMPT_VERSION}:${CACHE_VERSION}`, blueprint.status, JSON.stringify(blueprint), blueprint.createdAt, compatibleKey(snapshot), COMPATIBILITY_VERSION);
    return blueprint;
  }
  async rebind(blueprint: CachedBlueprint, snapshot: PublicPageSnapshot): Promise<PagePlan | null> {
    try { return await rebindBlueprint(genericTitles(blueprint), snapshot); }
    catch { this.quarantine(blueprint.id); return null; }
  }
  verify(id: string): void {
    const row = this.db.prepare('SELECT payload FROM blueprints WHERE id=? AND status=?').get(id, 'CANDIDATE');
    if (!row) return;
    const blueprint = CachedBlueprintSchema.parse(JSON.parse(String(row.payload)));
    blueprint.status = 'VERIFIED';
    this.db.prepare('UPDATE blueprints SET status=?,payload=? WHERE id=?').run('VERIFIED', JSON.stringify(blueprint), id);
  }
  quarantine(id: string): void {
    const result = this.db.prepare("UPDATE blueprints SET status='QUARANTINED' WHERE id=? AND status!='QUARANTINED'").run(id);
    this.quarantines += Number(result.changes);
  }
  metric(metric: RunMetric): void {
    const safe = RunMetricSchema.parse(metric);
    this.db.prepare('INSERT INTO plan_runs(payload) VALUES(?)').run(JSON.stringify(safe));
    if (safe.sponsorShown) this.db.prepare('INSERT INTO sponsor_aggregate(day,impressions) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET impressions=impressions+1')
      .run(new Date().toISOString().slice(0, 10));
  }
  close(): void { this.db.close(); }
}
