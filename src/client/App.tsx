import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComparableCompany, Evidence, RankedInvestor, ResearchResult, ResearchRun, StartupInput, StartupStage, UsageEvent } from '../shared/types';
import { DEMO_STARTUPS, STAGES } from '../shared/types';
import { radarFetch } from './transport';

type AppConfig = { configured: boolean; allowLive: boolean; embeddings: boolean; requiresAuth?: boolean; replayOnly?: boolean; repositoryUrl?: string; replayAsOf?: string; examples: typeof DEMO_STARTUPS; rankingWeights: Record<string, number> };
type Tab = 'investors' | 'companies' | 'evidence';
const finalStatuses = new Set(['complete', 'partial', 'failed']);
const stageLabel = (stage: string) => ({ 'pre-seed': 'Pre-seed', seed: 'Seed', 'series-a': 'Series A', 'series-b': 'Series B', growth: 'Growth' }[stage] ?? stage);
const formatDate = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
const similarityLabel = (n: number) => `${Math.round(n <= 1 ? n * 100 : n)}%`;

function Icon({ name, size = 18 }: { name: 'arrow' | 'external' | 'download' | 'search' | 'check' | 'clock' | 'close' | 'chevron' | 'link' | 'shield' | 'radar'; size?: number }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m8 5 7 7-7 7" />,
    link: <><path d="m10 13 4-4M9 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 9l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
    shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12V3" /><circle cx="16" cy="8" r="1.7" fill="currentColor" stroke="none" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function EvidenceLinks({ ids, evidence, label = 'Source' }: { ids: string[]; evidence: Evidence[]; label?: string }) {
  return <span className="fact-sources">{ids.map((id, index) => {
    const item = evidence.find(e => e.id === id);
    return item ? <a key={id} href={item.url} target="_blank" rel="noreferrer" title={item.title}>{label}{ids.length > 1 ? ` ${index + 1}` : ''}<Icon name="external" size={11} /></a> : null;
  })}</span>;
}

function UsageLedger({ events }: { events: UsageEvent[] }) {
  return <details className="usage-ledger"><summary><span><Icon name="radar" size={16} /> Endpoint activity</span><span>{events.length} operations</span></summary>
    <div className="usage-items">{events.length === 0 ? <p className="muted">Operations will appear as live research begins.</p> : events.map(event => <div className="usage-item" key={event.id}>
      <span className={`event-state ${event.status}`}><Icon name={event.status === 'success' ? 'check' : event.status === 'failed' ? 'close' : 'clock'} size={13} /></span>
      <div><div className="usage-title"><strong>{event.endpoint}</strong><span>{event.operation}</span></div><p>{event.detail}</p></div>
      <span className="usage-time">{event.durationMs ? `${(event.durationMs / 1000).toFixed(1)}s` : event.status === 'running' ? 'Running' : event.status}</span>
    </div>)}</div>
  </details>;
}

function InvestorCard({ investor, result }: { investor: RankedInvestor; result: ResearchResult }) {
  const [expanded, setExpanded] = useState(investor.rank === 1);
  const matches = result.companies.filter(c => investor.comparables.includes(c.id));
  const maxTotal = investor.breakdown.reduce((sum, part) => sum + part.maxPoints, 0) || 100;
  return <article className={`investor-card ${expanded ? 'expanded' : ''}`}>
    <div className="investor-main">
      <div className="rank-number">{String(investor.rank).padStart(2, '0')}</div>
      <div className="investor-heading"><div className="name-row"><h3>{investor.name}</h3>{investor.rank === 1 && <span className="best-match">Highest ranked</span>}{investor.eligibility && <span className={`eligibility-badge ${investor.eligibility}`}>{investor.eligibility === 'supported' ? 'Stage & market supported' : investor.eligibility === 'ineligible' ? 'Published eligibility excludes fit' : 'Eligibility needs confirmation'}</span>}</div><p>{investor.explanation}</p><div className="backing-summary"><Icon name="link" size={14} /> {matches.length} funded comparable{matches.length === 1 ? '' : 's'}<span className="dot">·</span>{investor.cheque.value?.label ?? 'Cheque size undisclosed'}</div></div>
      <div className="score"><strong>{Math.round(investor.score)}</strong><span>fit / {maxTotal}</span></div>
      <button className="expand-button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${investor.name}`} onClick={() => setExpanded(!expanded)}><Icon name="chevron" /></button>
    </div>
    {expanded && <div className="investor-details">
      <section className="match-section"><div className="section-eyebrow">THE INVESTMENT TRAIL</div><div className="match-grid">{matches.map(company => {
        const backing = company.investors.find(i => i.investorName.toLowerCase() === investor.name.toLowerCase());
        const proof = result.evidence.find(e => e.id === (backing?.evidenceId ?? company.evidenceId));
        return <a className="match-chip" key={company.id} href={proof?.url ?? company.sourceUrl} target="_blank" rel="noreferrer"><div><strong>{company.name}</strong><Icon name="external" size={13} /></div><p>{stageLabel(company.roundStage)}{company.roundAmount ? ` · ${company.roundAmount}` : ''}</p><span>{formatDate(company.roundDate)} · {company.country}</span><span className="match-reason">{company.similarityReason}</span></a>;
      })}</div></section>
      <div className="investor-facts">
        <section><div className="section-eyebrow">TYPICAL CHEQUE</div><strong className={investor.cheque.value ? '' : 'unknown'}>{investor.cheque.value?.label ?? 'Not publicly verified'}</strong><EvidenceLinks ids={investor.cheque.evidenceIds} evidence={result.evidence} /></section>
        <section><div className="section-eyebrow">{investor.stages.basis === 'observed' ? 'OBSERVED RECENT STAGES' : 'PUBLISHED STAGES'}</div><strong className={investor.stages.value?.length ? '' : 'unknown'}>{investor.stages.value?.map(stageLabel).join(', ') || 'Not publicly verified'}</strong><EvidenceLinks ids={investor.stages.evidenceIds} evidence={result.evidence} /></section>
        <section><div className="section-eyebrow">PUBLISHED MARKETS</div><strong className={investor.geographies.value?.length ? '' : 'unknown'}>{investor.geographies.value?.join(', ') || 'Not publicly verified'}</strong><EvidenceLinks ids={investor.geographies.evidenceIds} evidence={result.evidence} /></section>
        <section><div className="section-eyebrow">INVESTMENT LEADS</div>{investor.leadPartners.length ? investor.leadPartners.map(partner => <div className="partner-line" key={`${partner.name}-${partner.companyId}`}><strong>{partner.name}</strong><span>{result.companies.find(c => c.id === partner.companyId)?.name}</span><span className="partner-scope">{'scope' in partner && partner.scope === 'company' ? 'Company lead; latest round unconfirmed' : 'Round lead'}</span><EvidenceLinks ids={[partner.evidenceId]} evidence={result.evidence} /></div>) : <strong className="unknown">Not publicly verified</strong>}</section>
      </div>
      <section className="reach-section"><div className="section-eyebrow">YOUR ROUTE IN</div>{investor.contacts.length ? investor.contacts.map((route, i) => <div className="contact-route" key={i}><span className={`route-badge ${route.type}`}>{route.type === 'application' ? 'Apply' : route.type === 'open-intake' ? 'Open intake' : 'Warm intro'}</span><div><div className="contact-label"><strong>{route.label}</strong>{route.requiresLogin && <span className="login-required">Login required</span>}</div><p>{route.detail}</p><span className="route-verification">{route.verified ? route.verificationLevel === 'form' ? 'Pitch form verified' : route.verificationLevel === 'destination' ? 'Published destination verified' : 'Published route verified' : route.type === 'warm-intro' ? 'Suggested introduction route — availability unverified' : 'Published route identified — destination not yet verified'}</span><EvidenceLinks ids={route.evidenceIds} evidence={result.evidence} label="Route evidence" /></div>{route.url && <a className="route-link" href={route.url} target="_blank" rel="noreferrer">Open<Icon name="external" size={13} /></a>}</div>) : <p className="unknown">No public contact route verified.</p>}</section>
      <details className="score-details"><summary>Why this investor ranks #{investor.rank}<span>See score breakdown<Icon name="chevron" size={13} /></span></summary><div className="score-parts">{investor.breakdown.map(part => <div key={part.key}><div className="score-part-heading"><strong>{part.label}</strong><span>{part.points.toFixed(1)} / {part.maxPoints}</span></div><div className="score-track"><span style={{ width: `${Math.max(0, Math.min(100, 100 * part.points / (part.maxPoints || 1)))}%` }} /></div><p>{part.reason}</p></div>)}</div></details>
      {investor.caveats.length > 0 && <div className="caveats"><strong>Before you approach</strong><ul>{investor.caveats.map((caveat, i) => <li key={i}>{caveat}</li>)}</ul></div>}
    </div>}
  </article>;
}

function CompanyCard({ company, evidence }: { company: ComparableCompany; evidence: Evidence[] }) {
  return <article className="company-card"><div className="company-top"><div><h3>{company.name}</h3><p>{company.description}</p></div><span className="company-similarity">{similarityLabel(company.similarity)}<small>similarity</small></span></div><div className="company-meta"><span>{company.country}</span><span>{stageLabel(company.roundStage)}</span>{company.roundAmount && <span>{company.roundAmount}</span>}<span>{formatDate(company.roundDate)}</span></div><p className="company-reason">{company.similarityReason}</p><div className="company-backers">{company.investors.map(backer => <div key={backer.investorName}><strong>{backer.investorName}</strong>{backer.isLead && <span className="lead-label">Lead</span>}<EvidenceLinks ids={[backer.evidenceId]} evidence={evidence} label="Investment proof" />{backer.leadPartner && <span className="backer-partner">{backer.leadPartner}<EvidenceLinks ids={backer.partnerEvidenceId ? [backer.partnerEvidenceId] : []} evidence={evidence} /></span>}</div>)}</div><div className="company-footer"><a href={company.sourceUrl} target="_blank" rel="noreferrer">Funding announcement<Icon name="external" size={12} /></a><span>{company.similarityMethod === 'sentence-embedding' ? 'Semantic similarity' : 'Text similarity'}</span></div></article>;
}

function ResultWorkspace({ run, onExport }: { run: ResearchRun; onExport: (format: 'json' | 'csv') => Promise<void> }) {
  const result = run.result!;
  const [tab, setTab] = useState<Tab>('investors');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const filteredInvestors = useMemo(() => result.investors.filter(i => `${i.name} ${i.explanation}`.toLowerCase().includes(query.toLowerCase())), [result, query]);
  const filteredCompanies = useMemo(() => result.companies.filter(c => `${c.name} ${c.description} ${c.country}`.toLowerCase().includes(query.toLowerCase())), [result, query]);
  const filteredEvidence = useMemo(() => result.evidence.filter(e => `${e.title} ${e.excerpt} ${e.url}`.toLowerCase().includes(query.toLowerCase())), [result, query]);
  const hasEligibilityTiers = result.investors.some(investor => investor.eligibility);
  const exportFile = async (format: 'json' | 'csv') => { setExporting(true); try { await onExport(format); } finally { setExporting(false); } };
  return <section className="result-workspace" aria-labelledby="results-heading">
    <div className="results-intro"><div><span className="section-eyebrow">YOUR RESEARCH, WITH RECEIPTS</span><h2 id="results-heading">Follow the investment trail.</h2><p>{formatDate(result.window.from)} — {formatDate(result.window.to)}<span className="dot">·</span>{stageLabel(result.startup.stage)}<span className="dot">·</span>{result.startup.country}</p></div><div className="export-buttons"><button className="secondary-button" disabled={exporting} onClick={() => void exportFile('json')}><Icon name="download" size={15} />JSON</button><button className="secondary-button" disabled={exporting} onClick={() => void exportFile('csv')}><Icon name="download" size={15} />CSV</button></div></div>
    <div className="result-stats"><div><strong>{result.companies.length}</strong><span>verified companies</span></div><div><strong>{result.investors.length}</strong><span>ranked investors</span></div><div><strong>{result.evidence.length}</strong><span>source records</span></div><div className="minimum-stat"><Icon name={result.coverage.meetsMinimum ? 'check' : 'clock'} size={19} /><span>{result.coverage.meetsMinimum ? '10-company minimum met' : `${result.coverage.verified} of 10 required companies`}<small>{result.coverage.meetsMinimum ? 'Investment evidence checked' : 'Partial research — minimum not met'}</small></span></div></div>
    {result.warnings.length > 0 && <details className="warnings"><summary>{result.warnings.length} research note{result.warnings.length === 1 ? '' : 's'} to review</summary><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    <div className="results-toolbar"><div className="tabs" role="tablist" aria-label="Research views">{([['investors', 'Investors', result.investors.length], ['companies', 'Companies', result.companies.length], ['evidence', 'Evidence', result.evidence.length]] as const).map(([key, label, count]) => <button key={key} role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab === key} onClick={() => { setTab(key); setQuery(''); }}>{label}<span>{count}</span></button>)}</div><label className="filter-input"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Filter ${tab}…`} aria-label={`Filter ${tab}`} /></label></div>
    <div className="result-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'investors' && <>{hasEligibilityTiers && <p className="ranking-note">Investors with supported stage and market fit come first. Fit scores compare investors within the same eligibility tier.</p>}<div className="list-guide"><span>RANKED FOR YOUR STARTUP</span><span>Evidence and fit determine the order.</span></div>{filteredInvestors.map(investor => <InvestorCard key={investor.id} investor={investor} result={result} />)}{!filteredInvestors.length && <div className="no-matches">{query ? 'No investors match this filter.' : 'No investors passed the evidence checks.'}</div>}</>}
      {tab === 'companies' && <><p className="view-note">Recent funding announcements checked against live pages. Similarity is a retrieval signal; inspect the business match before outreach.</p><div className="companies-grid">{filteredCompanies.map(company => <CompanyCard key={company.id} company={company} evidence={result.evidence} />)}</div>{!filteredCompanies.length && <div className="no-matches">No companies match this filter.</div>}</>}
      {tab === 'evidence' && <><p className="view-note">Each source includes its retrieval time, the supporting excerpt, and the check used. The full ledger and content hashes are included in JSON.</p><div className="evidence-list">{filteredEvidence.map((item, index) => <article className="evidence-card" key={item.id}><div className="evidence-number">{String(index + 1).padStart(2, '0')}</div><div><div className="evidence-top"><span className="evidence-kind">{item.kind}</span><span>{item.verification === 'text-match' ? 'Text checked' : item.verification === 'agent-confirmed' ? 'Agent confirmed' : 'Browser confirmed'}</span></div><a className="evidence-title" href={item.url} target="_blank" rel="noreferrer">{item.title}<Icon name="external" size={13} /></a><blockquote>{item.excerpt}</blockquote><div className="evidence-footer"><span>{new URL(item.url).hostname}</span><span>Retrieved {formatDate(item.retrievedAt)}</span></div></div></article>)}</div>{!filteredEvidence.length && <div className="no-matches">No evidence matches this filter.</div>}</>}
    </div>
    {result.rejected.length > 0 && <details className="rejected"><summary>{result.rejected.length} rejected candidate{result.rejected.length === 1 ? '' : 's'}<span>See what failed verification</span></summary><div>{result.rejected.map((rejected, i) => <div key={i}><strong>{rejected.company}</strong><p>{rejected.reason}</p>{rejected.sourceUrl && <a href={rejected.sourceUrl} target="_blank" rel="noreferrer">Candidate source<Icon name="external" size={11} /></a>}</div>)}</div></details>}
    <details className="methodology"><summary>Ranking methodology<span>{result.rankingMethod.version}</span></summary><p>{result.rankingMethod.description}</p><div className="weight-chips">{Object.entries(result.rankingMethod.weights).map(([key, value]) => <span key={key}>{key.replaceAll('_', ' ')} <strong>{value}</strong></span>)}</div><p className="muted">Similarity model: {result.rankingMethod.similarityModel}. Discovery is bounded and cannot guarantee an exhaustive list. Missing public facts are disclosed.</p></details>
    <UsageLedger events={result.usage} />
  </section>;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [input, setInput] = useState<StartupInput>({ description: '', stage: 'seed', country: '', targetChequeUsd: null, lookbackMonths: 18, maxCompanies: 24 });
  const [token, setToken] = useState('');
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [history, setHistory] = useState<ResearchRun[]>([]);
  const [demos, setDemos] = useState<ResearchRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const examples = config?.examples ?? DEMO_STARTUPS;
  const api = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const response = await radarFetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? body.message ?? `Request failed (${response.status}).`); }
    return response.json();
  };
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api<AppConfig>('/api/config'), api<{ runs: ResearchRun[] }>('/api/runs'), api<{ runs: ResearchRun[] }>('/api/demos')]).then(values => {
      if (!mounted) return;
      if (values[0].status === 'fulfilled') setConfig(values[0].value); else setError('Could not connect to the research server. Check that Funding Radar is running.');
      if (values[1].status === 'fulfilled') setHistory(values[1].value.runs);
      if (values[2].status === 'fulfilled') setDemos(values[2].value.runs);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!config?.requiresAuth || !token) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.allSettled([api<{ runs: ResearchRun[] }>('/api/runs'), api<{ runs: ResearchRun[] }>('/api/demos')]).then(values => {
        if (cancelled) return;
        if (values[0].status === 'fulfilled') setHistory(values[0].value.runs);
        if (values[1].status === 'fulfilled') setDemos(values[1].value.runs);
      });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [token, config?.requiresAuth]);
  useEffect(() => {
    if (!run || finalStatuses.has(run.status)) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const latest = await api<ResearchRun>(`/api/runs/${run.id}`);
        if (cancelled) return;
        setRun(latest); setPollError(false);
        if (finalStatuses.has(latest.status)) setHistory(previous => [latest, ...previous.filter(item => item.id !== latest.id)]);
      } catch { if (!cancelled) setPollError(true); }
    };
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [run?.id, run?.status, token]);
  useEffect(() => {
    if (![...history, ...demos].some(item => !finalStatuses.has(item.status))) return;
    let cancelled = false;
    const interval = window.setInterval(() => {
      Promise.allSettled([api<{ runs: ResearchRun[] }>('/api/runs'), api<{ runs: ResearchRun[] }>('/api/demos')]).then(values => {
        if (cancelled) return;
        if (values[0].status === 'fulfilled') setHistory(values[0].value.runs);
        if (values[1].status === 'fulfilled') setDemos(values[1].value.runs);
      });
    }, 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [history.map(item => item.status).join(','), demos.map(item => item.status).join(','), token]);
  const startResearch = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setSubmitting(true);
    try { const created = await api<ResearchRun>('/api/runs', { method: 'POST', body: JSON.stringify(input) }); setRun(created); setHistory(previous => [created, ...previous.filter(item => item.id !== created.id)]); setPollError(false); window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start research.'); }
    finally { setSubmitting(false); }
  };
  const selectRun = async (id: string) => {
    if (!id) return;
    setError(null);
    try { const saved = await api<ResearchRun>(`/api/runs/${id}`); setRun(saved); setInput(saved.input); window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load research.'); }
  };
  const resumeResearch = async () => {
    if (!run) return;
    setError(null); setSubmitting(true);
    try { const resumed = await api<ResearchRun>(`/api/runs/${run.id}/resume`, { method: 'POST' }); setRun(resumed); setPollError(false); setHistory(previous => [resumed, ...previous.filter(item => item.id !== resumed.id)]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resume the existing dataset.'); }
    finally { setSubmitting(false); }
  };
  const chooseExample = (id: string) => { const example = examples.find(e => e.id === id); if (example) { if (config?.replayOnly) { const snapshot = demos.find(item => item.input.description === example.description && item.input.country === example.country); if (snapshot) void selectRun(snapshot.id); return; } const { id: _id, title: _title, subtitle: _subtitle, ...startup } = example; setInput(startup); setError(null); document.getElementById('startup-description')?.focus(); } };
  const exportResult = async (format: 'json' | 'csv') => {
    if (!run) return;
    try { const response = await radarFetch(`/api/runs/${run.id}/export?format=${format}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw new Error('Export failed. Please try again.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `funding-radar-${run.id}.${format}`; link.click(); URL.revokeObjectURL(url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.'); }
  };
  const active = Boolean(run && !finalStatuses.has(run.status));
  const isReplay = Boolean(config?.replayOnly);
  const replayAsOf = config?.replayAsOf ?? demos.find(item => item.result)?.result?.asOf;
  const disabled = isReplay || submitting || active || loading || !config?.configured || !config.allowLive;
  const progressPercent = run ? Math.min(100, Math.max(0, 100 * run.progress.current / (run.progress.total || 1))) : 0;
  const endpointNames = Array.from(new Set(run?.usage.filter(event => event.status === 'success').map(event => event.endpoint) ?? []));
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL} aria-label="Funding Radar home"><span className="brand-mark"><Icon name="radar" size={27} /></span><span>FUNDING<span className="brand-light">RADAR</span></span></a><div className="topbar-right"><span className="tinyfish-credit"><span className="green-dot" />Powered by TinySet + TinyFish</span><a className="github-link" href={isReplay && config?.repositoryUrl ? config.repositoryUrl : "https://www.tinyfish.ai/"} target="_blank" rel="noreferrer">{isReplay ? "Source & setup" : "Live web research"}<Icon name="external" size={12} /></a></div></header>
    <main>
      {isReplay && <section className="reviewer-note" aria-label="Reviewer replay disclosure"><div><strong>Dated reviewer replay{replayAsOf ? ` · ${formatDate(replayAsOf)}` : ""}</strong><p>Saved real research. Run new descriptions with your TinyFish key from the repository.</p></div>{config?.repositoryUrl && <a href={config.repositoryUrl} target="_blank" rel="noreferrer">Source & setup<Icon name="external" size={14} /></a>}</section>}
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" />FUNDRAISING, GROUNDED IN EVIDENCE</div><h1>Find the investors<br />who <em>fund your kind.</em></h1><p>Start with what you’re building. Follow recent rounds in similar companies to a ranked investor shortlist, with proof for every match.</p><div className="hero-proof"><span><Icon name="shield" size={16} />{isReplay ? "Source-linked investment evidence" : "Live investment sources"}</span><span><Icon name="link" size={16} />Explainable rankings</span><span><Icon name="download" size={16} />Reusable exports</span></div></div><div className="radar-illustration" aria-hidden="true"><div className="radar-ring ring-1" /><div className="radar-ring ring-2" /><div className="radar-ring ring-3" /><div className="radar-cross cross-x" /><div className="radar-cross cross-y" /><div className="radar-line" /><div className="radar-center" /><span className="radar-point p1"><span />Sector fit</span><span className="radar-point p2"><span />Recent backing</span><span className="radar-point p3"><span />Stage fit</span><div className="radar-coordinate">SIGNAL OVER REPUTATION</div></div></section>
      <section className="research-section"><div className="input-panel"><div className="panel-title"><span className="step-num">01</span><h2>Tell us what you’re building.</h2><span className="panel-label">YOUR STARTUP</span></div><form onSubmit={startResearch}>
        <label htmlFor="startup-description">One-line startup description</label><textarea id="startup-description" disabled={isReplay} minLength={12} maxLength={600} required value={input.description} onChange={e => setInput({ ...input, description: e.target.value })} placeholder="e.g. AI agents that resolve customer support tickets for software companies" rows={3} /><div className="description-hint"><span>What it does, who it serves, and what makes it specific.</span><span>{input.description.length}/600</span></div>
        <div className="input-grid"><div><label htmlFor="startup-stage">Fundraising stage</label><select id="startup-stage" disabled={isReplay} value={input.stage} onChange={e => setInput({ ...input, stage: e.target.value as StartupStage })}>{STAGES.map(stage => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></div><div><label htmlFor="startup-country">Startup country</label><input id="startup-country" disabled={isReplay} value={input.country} required maxLength={80} onChange={e => setInput({ ...input, country: e.target.value })} placeholder="e.g. India" /></div><div><label htmlFor="startup-cheque">Target cheque <span className="optional">optional</span></label><div className="money-input"><span>USD</span><input type="number" id="startup-cheque" disabled={isReplay} min={1000} max={1000000000} step={1000} value={input.targetChequeUsd ?? ''} onChange={e => setInput({ ...input, targetChequeUsd: e.target.value ? Number(e.target.value) : null })} placeholder="500,000" /></div></div></div>
        <div className="form-bottom"><fieldset className="lookback"><legend>RECENT ROUNDS</legend>{([12, 18] as const).map(months => <label key={months} className={input.lookbackMonths === months ? 'selected' : ''}><input type="radio" name="lookback" disabled={isReplay} value={months} checked={input.lookbackMonths === months} onChange={() => setInput({ ...input, lookbackMonths: months })} />{months} months</label>)}</fieldset><button type="submit" className="primary-button" disabled={disabled}>{isReplay ? 'Open a saved case below' : submitting ? 'Starting research…' : active ? 'Research in progress' : 'Find my investors'}<Icon name={active || submitting ? 'clock' : 'arrow'} size={18} /></button></div>
        {config?.requiresAuth && <div className="token-input"><label htmlFor="access-token">Research access token</label><input type="password" id="access-token" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Enter the shared access token" /><p>The token is kept in this tab’s memory.</p></div>}
        {(!loading && config && !isReplay && (!config.configured || !config.allowLive)) && <div className="setup-note"><strong>{!config.configured ? 'Connect TinyFish to run live research.' : 'Live research is paused on this server.'}</strong><p>{!config.configured ? 'Set TINYFISH_API_KEY in the server environment and restart. Saved research can still be reviewed below.' : 'Set RADAR_ALLOW_LIVE=true on the server. Public deployments also require RADAR_ACCESS_TOKEN. Saved research remains available.'}</p></div>}
      </form><div className="examples"><span className="section-eyebrow">{isReplay ? "OPEN A SAVED MARKET" : "TRY A DIFFERENT MARKET"}</span><div>{examples.map(example => <button type="button" key={example.id} onClick={() => chooseExample(example.id)}><strong>{example.title}</strong><span>{example.subtitle}<Icon name="arrow" size={13} /></span></button>)}</div></div></div>
      <aside className="approach-panel"><span className="section-eyebrow">HOW THE RADAR WORKS</span><h2>A shortlist built<br />from actual backing.</h2><ol><li><span>1</span><div><strong>Discover the comparables</strong><p>TinySet builds a structured company list from recent funding on the live web.</p></div></li><li><span>2</span><div><strong>Check the investment trail</strong><p>Read the funding pages. Confirm the company, round date, and each named investor.</p></div></li><li><span>3</span><div><strong>Find a useful route in</strong><p>Research cheque sizes, stages, deal partners, and published contact routes.</p></div></li><li><span>4</span><div><strong>Rank for your startup</strong><p>Score business similarity, stage, geography, cheque fit, and evidence.</p></div></li></ol><div className="honesty-note"><Icon name="shield" size={17} /><p>Undisclosed means undisclosed. No guessed partner names or inferred investor cheques.</p></div></aside></section>
      {error && <div className="error-banner" role="alert"><Icon name="close" size={18} /><p>{error}</p><button onClick={() => setError(null)} aria-label="Dismiss error"><Icon name="close" size={16} /></button></div>}
      <section className="saved-section"><div><Icon name="clock" size={17} /><span>REVISIT YOUR RESEARCH</span></div>{history.length ? <select value={run?.id ?? ''} onChange={e => void selectRun(e.target.value)} aria-label="Open a saved research run"><option value="">Choose a saved run…</option>{history.map(item => <option key={item.id} value={item.id}>{item.input.description.slice(0, 60)} · {stageLabel(item.input.stage)} · {item.status}</option>)}</select> : <span className="muted">Completed and in-progress runs will appear here.</span>}</section>
      {!run && demos.length > 0 && <section className="demo-section"><div className="demo-heading"><h2>{demos.length === 3 ? 'Three markets. Real research.' : 'Saved source-checked research.'}</h2><p>{isReplay ? "Inspect dated snapshots, investment evidence, and coverage." : "Open the live or saved runs to inspect status, evidence, and coverage."}</p></div><div className="demo-grid">{demos.map((demo, i) => <button key={demo.id} onClick={() => void selectRun(demo.id)}><span className="demo-num">0{i + 1}</span><strong>{demo.input.description}</strong><span>{stageLabel(demo.input.stage)} · {demo.input.country}</span><span className="demo-counts">{demo.result ? `${demo.result.companies.length} verified companies · ${demo.result.investors.length} investors` : `Research ${demo.status} — open progress`}<Icon name="arrow" size={16} /></span></button>)}</div></section>}
      <div ref={resultsRef} className="results-anchor">{run && <><section className={`run-progress ${run.status}`} aria-live="polite"><div className="run-status-top"><div><span className="section-eyebrow">{isReplay ? 'DATED RESEARCH SNAPSHOT' : active ? 'LIVE RESEARCH' : run.status === 'complete' ? 'RESEARCH COMPLETE' : run.status === 'partial' ? 'PARTIAL RESEARCH' : 'RESEARCH STOPPED'}</span><h2>{run.progress.message}</h2></div><span className={`status-pill ${run.status}`}><span />{run.status}</span></div><div className="progress-track"><span style={{ width: `${finalStatuses.has(run.status) ? 100 : progressPercent}%` }} /></div><div className="progress-meta"><span>{run.progress.phase} · {run.progress.current}/{run.progress.total || '—'}</span><span>{run.datasetId ? `Dataset ${run.datasetId.slice(0, 18)}…` : 'Preparing TinySet discovery'}</span></div><div className="pipeline-stages">{['discovering', 'verifying', 'enriching', 'ranking'].map((status, i) => { const index = ['queued', 'discovering', 'verifying', 'enriching', 'ranking', 'complete', 'partial', 'failed'].indexOf(run.status); const stepIndex = i + 1; const done = run.status !== 'failed' && index > stepIndex; return <div key={status} className={`${run.status === status ? 'current' : done ? 'done' : ''}`}><span>{done ? <Icon name="check" size={12} /> : i + 1}</span>{['Discover', 'Verify', 'Enrich', 'Rank'][i]}</div>; })}</div>{endpointNames.length > 0 && <div className="used-endpoints"><span>Contributing endpoints</span>{endpointNames.map(name => <strong key={name}>{name}</strong>)}</div>}{run.error && <div className="run-error"><strong>Research needs attention</strong><p>{run.error}</p>{run.status === 'failed' && run.datasetId && <button className="secondary-button resume-button" disabled={submitting || !config?.configured || !config.allowLive} onClick={() => void resumeResearch()}>{submitting ? 'Resuming…' : 'Resume this dataset'}<Icon name="arrow" size={13} /></button>}</div>}{pollError && <p className="poll-note">Connection interrupted. Retrying the existing run…</p>}{!run.result && <UsageLedger events={run.usage} />}</section>{run.result && <ResultWorkspace key={run.id} run={run} onExport={exportResult} />}</>}
      {!run && <div className="empty-results"><div className="empty-icon"><Icon name="radar" size={28} /></div><div><h3>Your investment trail starts here.</h3><p>Describe your startup above to discover recent comparables and the investors behind them.</p></div><span>LIVE SOURCES. CLEAR REASONS.</span></div>}</div>
    </main><footer><span><strong>FUNDING RADAR</strong><span className="dot">·</span>Follow the evidence.</span><span>TinySet discovery · {isReplay ? "Recorded source verification" : "Live source verification"} · JSON & CSV</span></footer>
  </div>;
}
