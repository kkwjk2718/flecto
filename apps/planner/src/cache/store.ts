import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  CachedBlueprintSchema, CACHE_VERSION, PROMPT_VERSION, RunMetricSchema,
  type CachedBlueprint, type PagePlan, type PublicPageSnapshot, type RunMetric,
} from '@flecto/contracts';

export class BlueprintStore {
  private readonly db: DatabaseSync;
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
  }
  find(fingerprint: string, model: string): CachedBlueprint | null {
    const row = this.db.prepare('SELECT id,payload FROM blueprints WHERE fingerprint=? AND model=? AND version=? AND status=? ORDER BY created_at DESC LIMIT 1')
      .get(fingerprint, model, `${PROMPT_VERSION}:${CACHE_VERSION}`, 'VERIFIED');
    if (!row) return null;
    try { return CachedBlueprintSchema.parse(JSON.parse(String(row.payload))); }
    catch { this.quarantine(String(row.id)); return null; }
  }
  candidate(snapshot: PublicPageSnapshot, plan: PagePlan, fingerprint: string, model: string): CachedBlueprint {
    const controls = new Map(snapshot.controls.map((control) => [control.ref, control]));
    const notices = new Map(snapshot.notices.map((notice) => [notice.ref, notice]));
    const blueprint = CachedBlueprintSchema.parse({
      id: `b_${randomUUID()}`, schemaVersion: 1, cacheVersion: CACHE_VERSION, promptVersion: PROMPT_VERSION,
      model, origin: snapshot.origin, fingerprint, status: 'CANDIDATE', createdAt: Date.now(),
      steps: plan.steps.map((step) => ({
        id: step.id, template: step.template, title: step.title,
        controlKeys: step.controlRefs.map((ref) => controls.get(ref)!.semanticKey),
        noticeKeys: step.noticeRefs.map((ref) => notices.get(ref)!.semanticKey),
      })),
      actionKey: plan.sourceActionRef ? controls.get(plan.sourceActionRef)!.semanticKey : null,
      locators: snapshot.controls.map((control) => ({
        key: control.semanticKey, kind: control.kind, formKey: null, required: control.required,
      })),
    });
    this.db.prepare('INSERT INTO blueprints VALUES(?,?,?,?,?,?,?)').run(blueprint.id, fingerprint, model,
      `${PROMPT_VERSION}:${CACHE_VERSION}`, blueprint.status, JSON.stringify(blueprint), blueprint.createdAt);
    return blueprint;
  }
  rebind(blueprint: CachedBlueprint, snapshot: PublicPageSnapshot): PagePlan | null {
    const unique = <T extends { semanticKey: string; ref: string }>(items: T[], key: string): string | null => {
      const matches = items.filter((item) => item.semanticKey === key);
      return matches.length === 1 ? matches[0].ref : null;
    };
    const steps = blueprint.steps.map((step) => ({ id: step.id, template: step.template, title: step.title,
      controlRefs: step.controlKeys.map((key) => unique(snapshot.controls, key)),
      noticeRefs: step.noticeKeys.map((key) => unique(snapshot.notices, key)),
    }));
    const actionRef = blueprint.actionKey ? unique(snapshot.controls, blueprint.actionKey) : null;
    if (steps.some((step) => [...step.controlRefs, ...step.noticeRefs].includes(null)) || blueprint.actionKey && !actionRef) {
      this.quarantine(blueprint.id); return null;
    }
    return { schemaVersion: 1, snapshotId: snapshot.snapshotId, steps: steps as PagePlan['steps'], sourceActionRef: actionRef };
  }
  verify(id: string): void {
    const row = this.db.prepare('SELECT payload FROM blueprints WHERE id=? AND status=?').get(id, 'CANDIDATE');
    if (!row) return;
    const blueprint = CachedBlueprintSchema.parse(JSON.parse(String(row.payload)));
    blueprint.status = 'VERIFIED';
    this.db.prepare('UPDATE blueprints SET status=?,payload=? WHERE id=?').run('VERIFIED', JSON.stringify(blueprint), id);
  }
  quarantine(id: string): void { this.db.prepare('UPDATE blueprints SET status=? WHERE id=?').run('QUARANTINED', id); }
  metric(metric: RunMetric): void {
    const safe = RunMetricSchema.parse(metric);
    this.db.prepare('INSERT INTO plan_runs(payload) VALUES(?)').run(JSON.stringify(safe));
    if (safe.sponsorShown) this.db.prepare('INSERT INTO sponsor_aggregate(day,impressions) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET impressions=impressions+1')
      .run(new Date().toISOString().slice(0, 10));
  }
  close(): void { this.db.close(); }
}
