import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Papa from 'papaparse';
import { WorkspaceStore } from '../server/store';
import { parseCsv, filterApplications, exportCsv } from '../src/model';

// Entirely fictional fixtures; no applicant data is needed to run tests.
const csv = Papa.unparse([
  { Reviewer: 'Demo reviewer', 'Accept/Reject': 'Accept', Reason: 'Clear evidence', 'Submission ID': 'demo-1', 'Primary Contact Information': 'Example Applicant', 'Primary benchmark category': 'Safety', 'Tasks involved': 'Close a drawer,\nthen stop at an obstacle.', 'Scoring process': 'Count "safe" stops' },
  { Reviewer: '', 'Accept/Reject': 'Borderline', Reason: 'Ask for details', 'Submission ID': 'demo-2', 'Primary Contact Information': 'Sample Applicant', 'Primary benchmark category': 'Simulation', 'Tasks involved': '', 'Scoring process': '' },
]);
function withStore(run: (store: WorkspaceStore, file: string, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'application-review-'));
  const file = join(dir, 'workspace.json');
  try { run(new WorkspaceStore(file), file, dir); } finally { rmSync(dir, { recursive: true }); }
}
describe('CSV import and export', () => {
  it('reads decisions, reviewer names, reasons and multiline answers', () => {
    const result = parseCsv('\uFEFF' + csv);
    expect(result.applications).toHaveLength(2);
    expect(result.applications[0]['Tasks involved']).toBe('Close a drawer,\nthen stop at an obstacle.');
    expect(result.reviews['demo-1']).toMatchObject({ status: 'accepted', reviewer: 'Demo reviewer', notes: 'Clear evidence' });
    expect(result.reviews['demo-2'].status).toBe('follow-up');
  });
  it('accepts unanswered review columns and omits Standards review', () => {
    const result = parseCsv('Submission ID,Primary Contact Information,Standards review\ndemo-3,Fictional Person,Hidden assessment');
    expect(result.reviews['demo-3'].status).toBe('unreviewed');
    expect(result.applications[0]).not.toHaveProperty('Standards review');
    expect(exportCsv(result.applications, result.reviews)).not.toContain('Hidden assessment');
  });
  it('rejects missing headers, empty files, duplicate or blank IDs and invalid decisions', () => {
    for (const bad of ['', 'Name\nExample', 'Submission ID,Primary Contact Information', 'Submission ID,Primary Contact Information\n,Example', 'Submission ID,Primary Contact Information\nx,One\nx,Two', 'Submission ID,Primary Contact Information,Accept/Reject\nx,One,Maybe', 'Submission ID,Primary Contact Information\nx,One,Extra']) {
      expect(() => parseCsv(bad)).toThrow();
    }
  });
  it('round trips edits in the same review columns without adding duplicate columns', () => {
    const result = parseCsv(csv);
    result.reviews['demo-1'] = { status: 'rejected', reviewer: 'Test reviewer', notes: 'Needs "details",\nand evidence.', updatedAt: '' };
    const exported = exportCsv(result.applications, result.reviews);
    const again = parseCsv(exported);
    expect(again.reviews).toEqual(result.reviews);
    expect(again.applications[0]['Scoring process']).toBe('Count "safe" stops');
    expect(Papa.parse(exported, { header: true }).meta.fields?.slice(0, 3)).toEqual(['Reviewer', 'Accept/Reject', 'Reason']);
    expect(exported).not.toContain('Review decision');
  });
  it('neutralizes spreadsheet formulas in exports', () => {
    const result = parseCsv(csv);
    result.reviews['demo-1'].notes = '=1+1';
    expect(Papa.parse<Record<string,string>>(exportCsv(result.applications, result.reviews), { header: true }).data[0].Reason).toBe("'=1+1");
  });
});
describe('local workspace', () => {
  it('starts empty and persists imported applications and review edits across restart', () => withStore((store, file) => {
    expect(store.snapshot()).toEqual({ applications: [], reviews: {} });
    store.importCsv(csv);
    store.update('demo-1', { status: 'rejected', notes: 'Need details', reviewer: 'Local reviewer' });
    const restarted = new WorkspaceStore(file).snapshot();
    expect(restarted.applications).toHaveLength(2);
    expect(restarted.reviews['demo-1']).toMatchObject({ status: 'rejected', notes: 'Need details', reviewer: 'Local reviewer' });
    expect(restarted.reviews['demo-1'].updatedAt).toBeTruthy();
  }));
  it('leaves the workspace unchanged on invalid imports or edits', () => withStore((store, file) => {
    store.importCsv(csv);
    const before = readFileSync(file, 'utf8');
    expect(() => store.importCsv('bad')).toThrow();
    expect(() => store.update('missing', { status: 'accepted', notes: '', reviewer: '' })).toThrow();
    expect(() => store.update('demo-1', { status: 'bogus', notes: '', reviewer: '' })).toThrow();
    expect(readFileSync(file, 'utf8')).toBe(before);
  }));
  it('backs up the previous workspace before replacing it from a new import', () => withStore((store, file, dir) => {
    store.importCsv(csv);
    store.update('demo-1', { status: 'rejected', notes: 'Saved note', reviewer: '' });
    const before = readFileSync(file, 'utf8');
    store.importCsv(csv);
    const backups = readdirSync(join(dir, 'backups'));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dir, 'backups', backups[0]), 'utf8')).toBe(before);
    expect(store.snapshot().reviews['demo-1'].status).toBe('accepted');
  }));
  it('combines full text, category, reviewer and status filters', () => {
    const { applications, reviews } = parseCsv(csv);
    expect(filterApplications(applications, reviews, { query: 'drawer evidence', category: 'Safety', status: 'accepted', reviewer: 'Demo reviewer' })).toHaveLength(1);
    expect(filterApplications(applications, reviews, { query: '', category: '', status: 'rejected', reviewer: '' })).toHaveLength(0);
  });
});
