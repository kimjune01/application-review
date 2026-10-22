import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Review, type Workspace, parseCsv, statuses } from '../src/model';

export class WorkspaceStore {
  private state: Workspace;
  constructor(private file: string) {
    this.state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { applications: [], reviews: {} };
  }
  snapshot(): Workspace { return structuredClone(this.state); }
  importCsv(csv: string): Workspace {
    const next = parseCsv(csv);
    if (this.state.applications.length) {
      const backups = join(dirname(this.file), 'backups');
      mkdirSync(backups, { recursive: true, mode: 0o700 });
      writeFileSync(join(backups, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(this.state, null, 2), { mode: 0o600 });
    }
    this.persist(next);
    return this.snapshot();
  }
  update(id: string, value: unknown): Review {
    if (!this.state.applications.some(a => a['Submission ID'] === id)) throw new Error('Unknown submission');
    if (!value || typeof value !== 'object') throw new Error('Invalid review');
    const r = value as Review;
    if (!statuses.includes(r.status) || typeof r.notes !== 'string' || r.notes.length > 100000 || typeof r.reviewer !== 'string' || r.reviewer.length > 1000) throw new Error('Invalid review');
    const next = { status: r.status, reviewer: r.reviewer, notes: r.notes, updatedAt: new Date().toISOString() };
    this.persist({ ...this.state, reviews: { ...this.state.reviews, [id]: next } });
    return structuredClone(next);
  }
  private persist(next: Workspace) {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
    this.state = next;
  }
}
