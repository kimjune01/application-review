import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Upload, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, Circle, ClipboardList, ExternalLink, MessageSquare, Search, X } from 'lucide-react';
import { type Application, type Review, type Reviews, type Status, type Workspace, decision, exportCsv, filterApplications, normalize, statuses, statusLabels } from './model';

const proposalKeys = ['Benchmark topic', 'Impact on jobs', 'Impact on AI timelines', 'Societal relatability', 'Safety', 'Other', 'Tasks involved', 'Scoring process'];
const experienceKeys = ['Hardware setup and maintenance', 'Robot learning', 'Simulation', 'Task design and evaluation', 'Relevant experience (optional)', 'Potential challenges (optional)', 'Anything else we should know about? (Optional)'];

function Answer({ text }: { text: string }) {
  return <div className="answer">{normalize(text).split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noreferrer">{part}<ExternalLink size={11}/></a> : part)}</div>;
}

function Question({ name, value = '', showEmpty = false }: { name: string; value?: string; showEmpty?: boolean }) {
  if (!value.trim() && !showEmpty) return null;
  return <section className="question"><h3>{name.replace(' (optional)', '').replace(' (Optional)', '')}</h3>{value.trim() ? <Answer text={value}/> : <p className="empty-field">No answer provided</p>}</section>;
}

function Detail({ app, review, notes, reviewer, onReviewerChange, onNotesChange, busy, onSave, onUndo, canUndo, position, total, onNavigate }: {
  app: Application; review: Review; busy: boolean; onSave: (status: Status, notes: string) => Promise<boolean>;
  reviewer: string; onReviewerChange: (reviewer: string) => void;
  notes: string; onNotesChange: (notes: string) => void;
  onUndo: () => void; canUndo: boolean; position: number; total: number; onNavigate: (offset: number) => void;
}) {
  const [tab, setTab] = useState('Proposal');
  const dirty = notes !== review.notes || reviewer !== review.reviewer;
  const fields = tab === 'Proposal' ? proposalKeys : tab === 'Experience' ? experienceKeys : Object.keys(app).filter(k => !['Reviewer', 'Accept/Reject', 'Reason'].includes(k));
  return <>
    <div className="detail-top"><div className="breadcrumb">APPLICATION <span>/</span> {app['Submission ID']}</div><div className="navigation"><span>{position + 1} of {total}</span><button title="Previous application" aria-label="Previous application" disabled={busy || dirty || position <= 0} onClick={() => onNavigate(-1)}><ArrowLeft size={16}/></button><button title="Next application" aria-label="Next application" disabled={busy || dirty || position >= total - 1} onClick={() => onNavigate(1)}><ArrowRight size={16}/></button></div></div>
    <header className="app-heading"><div className="eyebrow">{app['Primary benchmark category']}</div><h1>{app['Primary Contact Information']}</h1><p>{app['Employer / Institution']}</p><div className="metadata">{app['Country'] && <span>{app['Country']}</span>}{app['Team Composition'] && <span>{app['Team Composition']} {app['Team Composition'] === '1' ? 'person' : 'people'}</span>}{app['Total weekly hour commitment '] && <span>{app['Total weekly hour commitment ']} hours / week</span>}{app['Availability Constraints'] && <span>Start: {app['Availability Constraints']}</span>}</div></header>
    <div className="decision-panel"><div className="decision-label"><span>Your decision</span><span className={`badge ${review.status}`}>{statusLabels[review.status]}</span></div><div className="decision-buttons">
      <button className={`accept ${review.status === 'accepted' ? 'active' : ''}`} disabled={busy} onClick={() => onSave('accepted', notes)}><Check size={17}/>Accept</button>
      <button className={`follow ${review.status === 'follow-up' ? 'active' : ''}`} disabled={busy} onClick={() => onSave('follow-up', notes)}><MessageSquare size={16}/>Borderline</button>
      <button className={`reject ${review.status === 'rejected' ? 'active' : ''}`} disabled={busy} onClick={() => onSave('rejected', notes)}><X size={17}/>Reject</button>
      <button className="reset" disabled={busy || review.status === 'unreviewed'} onClick={() => onSave('unreviewed', notes)}>Clear</button>
      {canUndo && <button className="reset" disabled={busy} onClick={onUndo}>Undo</button>}
    </div><label className="notes-label" htmlFor="reviewer">Reviewer</label><input className="reviewer-input" id="reviewer" disabled={busy} placeholder="Your name" value={reviewer} onChange={e => onReviewerChange(e.target.value)}/><label className="notes-label" htmlFor="notes">Reason / review notes</label><textarea id="notes" disabled={busy} placeholder="Evidence, questions to ask, or a reason for your decision…" value={notes} onChange={e => onNotesChange(e.target.value)}/><div className="save-line"><span>{busy ? 'Saving…' : dirty ? 'Unsaved review — save below or make a decision' : review.updatedAt ? 'Saved on this computer' : 'Decisions and saved notes stay on this computer'}</span>{dirty && <button disabled={busy} onClick={() => onSave(review.status, notes)}>Save review</button>}</div></div>
    <div className="tabs" role="tablist" aria-label="Application sections">{['Proposal', 'Experience', 'All fields'].map(label => <button role="tab" aria-selected={tab === label} className={tab === label ? 'selected' : ''} key={label} onClick={() => setTab(label)}>{label}</button>)}</div>
    <div className="answers" role="tabpanel">{fields.map(key => <Question key={key} name={key} value={app[key]} showEmpty={tab === 'All fields'}/>)}</div>
    <footer className="detail-footer">Submitted {app['Submitted at']}<span>{app['Submission ID']}</span></footer>
  </>;
}

export default function App() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [reviews, setReviews] = useState<Reviews>({});
  const [reviewerDrafts, setReviewerDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [reviewerFilter, setReviewerFilter] = useState('');
  const [sort, setSort] = useState('submitted');
  const [selected, setSelected] = useState('');
  const [undo, setUndo] = useState<{ id: string; previous: Review } | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const unsaved = [...new Set([...Object.keys(drafts), ...Object.keys(reviewerDrafts)])].filter(id => (drafts[id] ?? decision(reviews, id).notes) !== decision(reviews, id).notes || (reviewerDrafts[id] ?? decision(reviews, id).reviewer) !== decision(reviews, id).reviewer);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (unsaved.length) event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved.length]);
  useEffect(() => {
    fetch('/api/workspace').then(async res => { if (!res.ok) throw new Error('Could not load the local workspace.'); return res.json() as Promise<Workspace>; })
      .then(({ applications: apps, reviews: saved }) => { setApplications(apps); setReviews(saved); setSelected(apps[0]?.['Submission ID'] ?? ''); })
      .catch(e => setError(String(e.message))).finally(() => setLoading(false));
  }, []);
  const counts = useMemo(() => Object.fromEntries(statuses.map(s => [s, applications.filter(a => decision(reviews, a['Submission ID']).status === s).length])) as Record<Status, number>, [applications, reviews]);
  const filtered = useMemo(() => {
    const result = filterApplications(applications, reviews, { query, status, category, reviewer: reviewerFilter });
    if (sort === 'name') result.sort((a, b) => a['Primary Contact Information'].localeCompare(b['Primary Contact Information']));
    if (sort === 'updated') result.sort((a, b) => decision(reviews, b['Submission ID']).updatedAt.localeCompare(decision(reviews, a['Submission ID']).updatedAt));
    return result;
  }, [applications, reviews, query, status, category, reviewerFilter, sort]);
  const active = filtered.find(a => a['Submission ID'] === selected) ?? filtered[0];
  const activeId = active?.['Submission ID'];
  useEffect(() => { detailRef.current?.scrollTo({ top: 0 }); }, [activeId]);
  const save = async (id: string, nextStatus: Status, notes: string, reviewer: string, undoing = false): Promise<boolean> => {
    if (busyRef.current) return false;
    const previous = decision(reviews, id);
    busyRef.current = true; setBusy(true); setError('');
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, notes, reviewer }) });
      if (!res.ok) throw new Error('Could not save. Your changes have not been saved; please try again.');
      const saved: Review = await res.json();
      setReviews(current => ({ ...current, [id]: saved }));
      setDrafts(current => { if (current[id] !== notes) return current; const next = { ...current }; delete next[id]; return next; });
      setReviewerDrafts(current => { if (current[id] !== reviewer) return current; const next = { ...current }; delete next[id]; return next; });
      if (undoing) setUndo(null); else setUndo({ id, previous });
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const importFile = async (file: File) => {
    if (busyRef.current || unsaved.length) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Please choose a CSV smaller than 10 MB.');
      const csv = await file.text();
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Could not import CSV.');
      const workspace = result as Workspace;
      setNotice(`Imported ${workspace.applications.length} applications.${applications.length ? ' The previous workspace was backed up locally.' : ''}`);
      setApplications(workspace.applications); setReviews(workspace.reviews);
      setSelected(workspace.applications[0]?.['Submission ID'] ?? '');
      setDrafts({}); setReviewerDrafts({}); setUndo(null);
      setQuery(''); setStatus(''); setCategory(''); setReviewerFilter(''); setMobileDetail(false);
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + exportCsv(applications, reviews)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `applications-reviewed-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const progress = applications.length ? (applications.length - counts.unreviewed) / applications.length * 100 : 0;
  return <div className="shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Application review home"><span className="brand-icon"><CheckCheck size={23}/></span><span>Application review<span className="brand-sub">LOCAL CSV WORKSPACE</span></span></a><div className="top-right">{unsaved.length > 0 && <button className="unsaved-notice" onClick={() => { setQuery(''); setStatus(''); setCategory(''); setReviewerFilter(''); setSelected(unsaved[0]); setMobileDetail(true); }}>{unsaved.length} unsaved review{unsaved.length > 1 ? 's' : ''}</button>}<span className="local-indicator"><i/>Local workspace</span><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }}/><button className="export" onClick={() => fileRef.current?.click()} disabled={loading || busy || unsaved.length > 0}><Upload size={16}/>Import CSV</button><button className="export" onClick={download} disabled={loading || !applications.length || busy || unsaved.length > 0}><ArrowDownToLine size={16}/>Export reviews</button></div></header>
    <section className="overview"><div className="overview-title"><h2>Your review queue</h2><p>Read the evidence. Make the call.</p></div><div className="progress"><div><span>{applications.length - (counts.unreviewed ?? 0)} of {applications.length} reviewed</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }}/></div></div></section>
    <nav className="status-filters" aria-label="Filter by decision"><button className={!status ? 'current' : ''} onClick={() => setStatus('')}>All applications <span>{applications.length}</span></button>{statuses.map(s => <button key={s} className={status === s ? 'current' : ''} onClick={() => setStatus(s)}><i className={`dot ${s}`}/>{statusLabels[s]}<span>{counts[s] ?? 0}</span></button>)}</nav>
    {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
    <div className={`workspace ${mobileDetail ? 'show-detail' : ''}`}>
      <aside className="queue"><div className="queue-controls"><div className="search-box"><Search size={17}/><input aria-label="Search applications" placeholder="Search people, topics, answers…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button>}</div><div className="select-row"><select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{[...new Set(applications.map(a => a['Primary benchmark category']))].sort().map(c => <option key={c}>{c}</option>)}</select><select aria-label="Filter reviewer" value={reviewerFilter} onChange={e => setReviewerFilter(e.target.value)}><option value="">All reviewers</option>{[...new Set(Object.values(reviews).map(r => r.reviewer).filter(Boolean))].sort().map(name => <option key={name}>{name}</option>)}</select></div><div className="list-heading"><span>{filtered.length} applications</span><select aria-label="Sort applications" value={sort} onChange={e => setSort(e.target.value)}><option value="submitted">Submission order</option><option value="name">Name A–Z</option><option value="updated">Recently reviewed</option></select></div></div>
        <div className="application-list">{loading ? <div className="empty">Loading applications…</div> : filtered.length ? filtered.map((a) => { const id = a['Submission ID']; const d = decision(reviews, id); return <button className={`app-card ${id === activeId ? 'selected' : ''}`} key={id} disabled={busy} onClick={() => { setSelected(id); setMobileDetail(true); }}><div className="card-top"><span className={`category-label ${a['Primary benchmark category'] === 'Safety' ? 'safety' : ''}`}>{a['Primary benchmark category']}</span><span className={`status-icon ${d.status}`} title={statusLabels[d.status]} aria-label={statusLabels[d.status]}>{d.status === 'accepted' ? <Check size={14}/> : d.status === 'rejected' ? <X size={14}/> : d.status === 'follow-up' ? <MessageSquare size={13}/> : <Circle size={9}/>}</span></div><h3>{a['Primary Contact Information']}</h3><div className="institution">{a['Employer / Institution']}</div><p>{a['Benchmark topic']}</p><div className="card-bottom"><span>{d.reviewer || statusLabels[d.status]}</span><ChevronRight size={14}/></div></button>; }) : <div className="empty"><Search size={25}/><h3>{applications.length ? 'No matches' : 'No applications yet'}</h3><p>{applications.length ? 'Try a different search or clear your filters.' : 'Import a CSV to begin reviewing.'}</p><button onClick={() => { setQuery(''); setStatus(''); setCategory(''); setReviewerFilter(''); }}>Clear filters</button></div>}</div><div className="queue-footer">{applications.length} imported applications</div>
      </aside>
      <main className="detail" ref={detailRef}><button className="mobile-back" onClick={() => setMobileDetail(false)}><ArrowLeft size={16}/>Back to applications</button>{active ? <Detail key={activeId} app={active} review={decision(reviews, activeId)} reviewer={reviewerDrafts[activeId] ?? decision(reviews, activeId).reviewer} onReviewerChange={reviewer => setReviewerDrafts(current => ({ ...current, [activeId]: reviewer }))} notes={drafts[activeId] ?? decision(reviews, activeId).notes} onNotesChange={notes => setDrafts(current => ({ ...current, [activeId]: notes }))} busy={busy} onSave={(s, n) => save(activeId, s, n, reviewerDrafts[activeId] ?? decision(reviews, activeId).reviewer)} onUndo={() => { if (undo) void save(undo.id, undo.previous.status, undo.previous.notes, undo.previous.reviewer, true); }} canUndo={undo?.id === activeId} position={filtered.indexOf(active)} total={filtered.length} onNavigate={offset => setSelected(filtered[filtered.indexOf(active) + offset]['Submission ID'])}/> : <div className="detail-empty"><ClipboardList size={36}/><h2>{loading ? 'Opening your workspace' : applications.length ? 'Your next decision starts here' : 'Import your applications'}</h2><p>{loading ? 'Loading the full application workspace.' : applications.length ? 'Choose an application from the review queue.' : 'Choose a CSV to load applications and any existing review decisions.'}</p>{!loading && !applications.length && <button className="empty-import" disabled={busy} onClick={() => fileRef.current?.click()}>Import CSV</button>}</div>}</main>
    </div>
  </div>;
}
