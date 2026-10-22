import Papa from 'papaparse';

export type Application = Record<string, string>;
export type Status = 'unreviewed' | 'accepted' | 'rejected' | 'follow-up';
export type Review = { status: Status; reviewer: string; notes: string; updatedAt: string };
export type Reviews = Record<string, Review>;
export type Workspace = { applications: Application[]; reviews: Reviews };
export const statusLabels: Record<Status, string> = { unreviewed: 'Unreviewed', accepted: 'Accepted', rejected: 'Rejected', 'follow-up': 'Borderline' };
export const statuses = Object.keys(statusLabels) as Status[];
export const normalize = (text = '') => text.replace(/\\n/g, '\n');
export const decision = (reviews: Reviews, id: string): Review => Object.hasOwn(reviews, id) ? reviews[id] : { status: 'unreviewed', reviewer: '', notes: '', updatedAt: '' };
const csvDecisions: Record<Status, string> = { unreviewed: '', accepted: 'Accept', rejected: 'Reject', 'follow-up': 'Borderline' };
const reviewColumns = ['Reviewer', 'Accept/Reject', 'Reason'];

export function parseCsv(csv: string): Workspace {
  const header = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ''), { preview: 1 }).data[0] ?? [];
  if (new Set(header).size !== header.length) throw new Error('CSV has duplicate column names.');
  const result = Papa.parse<Application>(csv, { header: true, skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(`Invalid CSV: ${result.errors[0].message}`);
  for (const field of ['Submission ID', 'Primary Contact Information']) {
    if (!result.meta.fields?.includes(field)) throw new Error(`Missing required column: ${field}`);
  }
  if (!result.data.length) throw new Error('CSV contains no applications.');
  const ids = new Set<string>();
  const applications = result.data.map((row, index) => {
    const id = row['Submission ID'].trim();
    if (!id || ids.has(id)) throw new Error(`Row ${index + 2}: Submission ID must be nonempty and unique.`);
    ids.add(id);
    return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'Standards review').map(([key, value]) => [key, key === 'Submission ID' ? id : value]));
  });
  const reviews = Object.fromEntries(applications.map((a, index) => {
    const value = (a['Accept/Reject'] ?? '').trim().toLowerCase();
    const status = statuses.find(s => csvDecisions[s].toLowerCase() === value);
    if (!status) throw new Error(`Row ${index + 2}: Accept/Reject must be Accept, Reject, Borderline, or blank.`);
    return [a['Submission ID'], { status, reviewer: a.Reviewer ?? '', notes: a.Reason ?? '', updatedAt: '' }];
  }));
  return { applications, reviews };
}

export type Filters = { query: string; status: string; category: string; reviewer: string };
export function filterApplications(apps: Application[], reviews: Reviews, filters: Filters) {
  const terms = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return apps.filter(a => {
    const review = decision(reviews, a['Submission ID']);
    const answers = Object.entries(a).filter(([key]) => !reviewColumns.includes(key)).map(([, value]) => value);
    const haystack = `${answers.join(' ')} ${review.notes} ${review.reviewer}`.toLowerCase();
    return (!filters.status || review.status === filters.status)
      && (!filters.category || a['Primary benchmark category'] === filters.category)
      && (!filters.reviewer || review.reviewer === filters.reviewer)
      && terms.every(term => haystack.includes(term));
  });
}
export function exportCsv(apps: Application[], reviews: Reviews) {
  const fields = [...reviewColumns, ...new Set(apps.flatMap(a => Object.keys(a).filter(k => !reviewColumns.includes(k) && k !== 'Standards review')))];
  return Papa.unparse({ fields, data: apps.map(a => {
    const review = decision(reviews, a['Submission ID']);
    const row = { ...a, Reviewer: review.reviewer, 'Accept/Reject': csvDecisions[review.status], Reason: review.notes };
    return fields.map(key => row[key as keyof typeof row] ?? '');
  }) }, { escapeFormulae: true });
}
