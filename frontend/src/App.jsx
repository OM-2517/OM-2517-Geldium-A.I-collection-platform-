import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  BarChart3, Bell, BriefcaseBusiness, CalendarClock, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Database, Download, FileCheck2, FileSpreadsheet,
  Filter, Gauge, Handshake, HeartHandshake, Info, LayoutDashboard, LifeBuoy,
  ListChecks, LockKeyhole, Menu, MessageSquareText, MoreHorizontal, Play,
  RefreshCw, Search, Settings2, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, Upload, Users, Workflow, X, Zap
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const API = import.meta.env.VITE_API_BASE_URL || '';
const WORKSPACE_CACHE_KEY = 'geldium.workspace-state.v1';

function readWorkspaceCache() {
  try { return JSON.parse(localStorage.getItem(WORKSPACE_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function writeWorkspaceCache(patch) {
  try { localStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify({ ...readWorkspaceCache(), ...patch })); }
  catch { /* Keep the workspace usable when browser storage is disabled or full. */ }
}

function summarizeWorkspace(reviewed = {}, checks = {}, eventCount = 0, store = 'browser') {
  return {
    reviewed_customers: Object.values(reviewed).filter(Boolean).length,
    completed_validation_tasks: Object.values(checks).filter(Boolean).length,
    validation_task_count: VALIDATION_ITEMS.length,
    review_activity_events: eventCount,
    state_store: store,
  };
}

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
  { id: 'customers', label: 'Customer explorer', icon: Users, group: 'Workspace' },
  { id: 'simulator', label: 'Risk simulator', icon: Gauge, group: 'Workspace' },
  { id: 'review', label: 'Human review queue', icon: ListChecks, group: 'Workspace' },
  { id: 'workflow', label: 'AI workflow', icon: Workflow, group: 'Governance' },
  { id: 'responsible', label: 'Responsible AI', icon: ShieldCheck, group: 'Governance' },
  { id: 'performance', label: 'Performance', icon: Target, group: 'Governance' },
  { id: 'validation', label: 'Validation checklist', icon: FileCheck2, group: 'Governance' },
];

const VALIDATION_ITEMS = [
  { id:'data-definitions', area:'Data readiness', title:'Document source fields and units', detail:'Confirm what every field means, its unit, allowed range, source system and update schedule.' },
  { id:'reconcile-payments', area:'Data readiness', title:'Reconcile payment-history mismatches', detail:'Investigate the sample records where monthly Missed labels exceed Missed_Payments; agree a source-of-truth rule.' },
  { id:'missingness', area:'Data readiness', title:'Approve missing-value handling', detail:'Measure missingness by field and subgroup; document imputation, exclusion and unknown-value behavior.' },
  { id:'utilization', area:'Data readiness', title:'Confirm utilization scale and outliers', detail:'Resolve values above 100% and establish valid bounds before modeling or routing.' },
  { id:'labels', area:'Data readiness', title:'Standardize employment labels', detail:'Confirm equivalences such as EMP and Employed with the data owner; retain source values for traceability.' },
  { id:'identity', area:'Data readiness', title:'Check duplicates and record lineage', detail:'Document duplicate handling, customer matching, sampling and dataset version controls.' },
  { id:'baseline', area:'Model validation', title:'Build simple comparison baselines', detail:'Compare any candidate model with a majority-class baseline and transparent, constrained alternatives.' },
  { id:'holdout', area:'Model validation', title:'Use a leakage-safe holdout evaluation', detail:'Define time-aware train, validation and test splits; freeze the test set before tuning.' },
  { id:'calibration', area:'Model validation', title:'Review performance and calibration', detail:'Measure precision, recall, false-positive rates, calibration and uncertainty at proposed thresholds.' },
  { id:'fairness', area:'Fairness review', title:'Evaluate subgroup outcomes', detail:'Compare error and flag rates for lawful, adequately sized groups; investigate material gaps with legal and compliance review.' },
  { id:'explainability', area:'Human oversight', title:'Approve explanations and override paths', detail:'Confirm staff can understand, challenge and override signals; record reasons and escalation routes.' },
  { id:'privacy', area:'Privacy and security', title:'Approve data access, retention and security', detail:'Set access controls, encryption, retention, deletion and incident response before any real data is used.' },
  { id:'pilot', area:'Pilot readiness', title:'Define a controlled pilot and stop rules', detail:'Specify eligibility, human review, comparison group, success measures, customer safeguards and rollback triggers.' },
  { id:'monitoring', area:'Pilot readiness', title:'Assign monitoring and change ownership', detail:'Name owners for drift, complaints, incidents, periodic review, versioning and model-change approval.' },
];

async function readApiResponse(response, fallback) {
  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(response.ok ? 'The server returned an unreadable response.' : fallback); }
  }
  if (!response.ok) {
    const error = new Error(payload.detail || fallback);
    error.status = response.status;
    throw error;
  }
  if (!text.trim()) throw new Error('The server returned an empty response. Please try again.');
  return payload;
}

const money = (value) => value == null || value === '' || Number.isNaN(Number(value))
  ? '—'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const num = (value) => value == null || value === '' || Number.isNaN(Number(value)) ? '—' : Number(value).toLocaleString();
const labelStatus = (value) => Number(value) === 1 ? 'Delinquent' : Number(value) === 0 ? 'Not delinquent' : 'Not recorded';

function localScreen(row) {
  const missed = Number(row.Missed_Payments || 0);
  const utilization = Number(row.Credit_Utilization || 0) * 100;
  const dti = Number(row.Debt_to_Income_Ratio || 0) * 100;
  const score = Number(row.Credit_Score || 900);
  const recent = ['Month_1','Month_2','Month_3'].filter((k) => String(row[k] || '').toLowerCase() === 'missed').length;
  let points = 0;
  if (missed >= 3) points += 2; else if (missed >= 1) points += 1;
  if (utilization >= 80) points += 2; else if (utilization >= 60) points += 1;
  if (dti >= 40) points += 1;
  if (score <= 580) points += 1;
  if (recent >= 2) points += 1;
  return { points, band: points <= 1 ? 'Routine' : points <= 3 ? 'Support' : 'Priority', tone: points <= 1 ? 'low' : points <= 3 ? 'medium' : 'high' };
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'blue', trend }) {
  return <div className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={18} /></div>
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-detail">{trend && <span className="metric-trend"><ArrowUpRight size={13}/>{trend}</span>}{detail}</div>
  </div>;
}

function SectionHeader({ eyebrow, title, description, right }) {
  return <div className="section-header">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
    {right && <div className="header-actions">{right}</div>}
  </div>;
}

function Pill({ children, tone = 'neutral' }) { return <span className={`pill ${tone}`}>{children}</span>; }

function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={`panel ${className}`}>
    {(title || action) && <div className="panel-head"><div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>{action}</div>}
    {children}
  </section>;
}

function EmptyState({ icon: Icon = CircleHelp, title, description }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={22}/></div><strong>{title}</strong><p>{description}</p></div>;
}

export default function App() {
  const [active, setActive] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [simInputs, setSimInputs] = useState({ missed_payments: 2, utilization_pct: 72, dti_pct: 36, credit_score: 620, recent_missed_months: 1 });
  const [simulation, setSimulation] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [reviewed, setReviewed] = useState({});
  const [reviewActivity, setReviewActivity] = useState([]);
  const [operationSummary, setOperationSummary] = useState(null);
  const [workspaceStore, setWorkspaceStore] = useState('checking');
  const [savingReviews, setSavingReviews] = useState({});
  const [savingChecks, setSavingChecks] = useState({});
  const [validationChecks, setValidationChecks] = useState({});
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [workflowStage, setWorkflowStage] = useState(null);
  const uploadRef = useRef(null);

  const loadSample = async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await fetch(`${API}/api/sample`);
      const payload = await readApiResponse(response, 'Unable to load the sample dataset.');
      setData(payload);
      setNotice('Loaded the supplied 500-record Geldium sample dataset.');
    } catch (e) {
      setError('The analytics API is not available. Start the backend or use the deployed application.');
    } finally { setLoading(false); }
  };

  const loadBackendState = async () => {
    const [reviewsResponse, checklistResponse] = await Promise.all([
      fetch(`${API}/api/reviews`), fetch(`${API}/api/validation-checklist`),
    ]);
    if (reviewsResponse.status === 404 || checklistResponse.status === 404) {
      const cached = readWorkspaceCache();
      const cachedReviewed = cached.reviewed || {};
      const cachedChecks = cached.validationChecks || {};
      const cachedActivity = cached.reviewActivity || [];
      setReviewed(cachedReviewed); setValidationChecks(cachedChecks); setReviewActivity(cachedActivity);
      setOperationSummary(summarizeWorkspace(cachedReviewed, cachedChecks, cachedActivity.length));
      setWorkspaceStore('browser');
      return;
    }
    const [reviewsPayload, checklistPayload] = await Promise.all([
      readApiResponse(reviewsResponse, 'Could not load review queue state.'),
      readApiResponse(checklistResponse, 'Could not load validation progress.'),
    ]);
    const reviewedState = Object.fromEntries((reviewsPayload.items || []).filter((item) => item.reviewed).map((item) => [item.customer_id, true]));
    setReviewActivity(reviewsPayload.events || []);
    const checksState = Object.fromEntries((checklistPayload.items || []).filter((item) => item.completed).map((item) => [item.task_id, true]));
    setReviewed(reviewedState); setValidationChecks(checksState); setWorkspaceStore('backend');
    writeWorkspaceCache({ reviewed: reviewedState, reviewActivity: reviewsPayload.events || [], validationChecks: checksState });
    const summaryResponse = await fetch(`${API}/api/operations/summary`);
    const summaryPayload = summaryResponse.status === 404 ? null : await readApiResponse(summaryResponse, 'Could not load operations summary.');
    setOperationSummary(summaryPayload || summarizeWorkspace(reviewedState, checksState, (reviewsPayload.events || []).length, 'sqlite'));
  };

  useEffect(() => { loadSample(); loadBackendState().catch((e) => setError(`Backend workspace state is unavailable: ${e.message}`)); }, []);

  const toggleReviewStatus = async (customerId) => {
    if (savingReviews[customerId]) return;
    const previous = Boolean(reviewed[customerId]);
    const next = !reviewed[customerId];
    setSavingReviews((prev) => ({ ...prev, [customerId]: true }));
    setReviewed((prev) => ({ ...prev, [customerId]: next }));
    const saveInBrowser = () => {
      const nextReviewed = { ...reviewed, [customerId]: next };
      const event = { id: `browser-${Date.now()}`, customer_id: customerId, reviewed: next, created_at: new Date().toISOString() };
      const nextActivity = [event, ...reviewActivity].slice(0, 12);
      setReviewed(nextReviewed); setReviewActivity(nextActivity); setWorkspaceStore('browser');
      setOperationSummary(summarizeWorkspace(nextReviewed, validationChecks, nextActivity.length));
      writeWorkspaceCache({ reviewed: nextReviewed, reviewActivity: nextActivity });
    };
    if (workspaceStore === 'browser') { saveInBrowser(); setSavingReviews((prev) => ({ ...prev, [customerId]: false })); return; }
    try {
      const response = await fetch(`${API}/api/reviews/${encodeURIComponent(customerId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: next }),
      });
      await readApiResponse(response, 'Could not save the review status.');
      await loadBackendState();
    } catch (e) {
      if (e.status === 404) { saveInBrowser(); setNotice('This backend version does not include workspace storage yet. Progress is saved in this browser.'); return; }
      setReviewed((prev) => {
        const restored = { ...prev };
        if (previous) restored[customerId] = true;
        else delete restored[customerId];
        return restored;
      });
      setError(e.message);
    } finally {
      setSavingReviews((prev) => ({ ...prev, [customerId]: false }));
    }
  };

  const setValidationCheck = async (taskId, completed) => {
    if (savingChecks[taskId]) return;
    const previous = Boolean(validationChecks[taskId]);
    setSavingChecks((prev) => ({ ...prev, [taskId]: true }));
    setValidationChecks((prev) => ({ ...prev, [taskId]: completed }));
    const saveInBrowser = () => {
      const nextChecks = { ...validationChecks, [taskId]: completed };
      setValidationChecks(nextChecks); setWorkspaceStore('browser');
      setOperationSummary(summarizeWorkspace(reviewed, nextChecks, reviewActivity.length));
      writeWorkspaceCache({ validationChecks: nextChecks });
    };
    if (workspaceStore === 'browser') { saveInBrowser(); setSavingChecks((prev) => ({ ...prev, [taskId]: false })); return; }
    try {
      const response = await fetch(`${API}/api/validation-checklist/${encodeURIComponent(taskId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
      });
      await readApiResponse(response, 'Could not save checklist progress.');
      await loadBackendState();
    } catch (e) {
      if (e.status === 404) { saveInBrowser(); setNotice('This backend version does not include workspace storage yet. Progress is saved in this browser.'); return; }
      setValidationChecks((prev) => ({ ...prev, [taskId]: previous }));
      setError(e.message);
    } finally {
      setSavingChecks((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const resetValidationProgress = async () => {
    if (workspaceStore === 'browser') {
      setValidationChecks({}); writeWorkspaceCache({ validationChecks: {} });
      setOperationSummary(summarizeWorkspace(reviewed, {}, reviewActivity.length));
      setNotice('Validation progress was reset in this browser.'); return;
    }
    try {
      const response = await fetch(`${API}/api/validation-checklist`, { method: 'DELETE' });
      await readApiResponse(response, 'Could not reset validation progress.');
      setValidationChecks({});
      await loadBackendState();
      setNotice('Validation checklist progress was reset on the backend.');
    } catch (e) {
      if (e.status === 404) { setWorkspaceStore('browser'); setValidationChecks({}); writeWorkspaceCache({ validationChecks: {} }); setNotice('Validation progress was reset in this browser.'); }
      else setError(e.message);
    }
  };

  const resetDemoProgress = async () => {
    setProfileOpen(false);
    if (workspaceStore === 'browser') {
      setReviewed({}); setValidationChecks({}); setReviewActivity([]); setSimulation(null);
      setOperationSummary(summarizeWorkspace({}, {}, 0));
      writeWorkspaceCache({ reviewed: {}, validationChecks: {}, reviewActivity: [] });
      setNotice('Demo review and validation progress reset in this browser.'); return;
    }
    try {
      const [reviewResponse, checklistResponse] = await Promise.all([
        fetch(`${API}/api/reviews`, { method: 'DELETE' }),
        fetch(`${API}/api/validation-checklist`, { method: 'DELETE' }),
      ]);
      await Promise.all([
        readApiResponse(reviewResponse, 'Could not reset review progress.'),
        readApiResponse(checklistResponse, 'Could not reset validation progress.'),
      ]);
      setReviewed({}); setValidationChecks({}); setSimulation(null);
      await loadBackendState();
      setNotice('Demo review and validation progress reset on the backend.');
    } catch (e) {
      if (e.status === 404) {
        setWorkspaceStore('browser'); setReviewed({}); setValidationChecks({}); setReviewActivity([]); setSimulation(null);
        setOperationSummary(summarizeWorkspace({}, {}, 0));
        writeWorkspaceCache({ reviewed: {}, validationChecks: {}, reviewActivity: [] });
        setNotice('Demo review and validation progress reset in this browser.');
      } else setError(e.message);
    }
  };

  const uploadCsv = async (file) => {
    if (!file) return;
    setLoading(true); setError(''); setNotice('');
    const form = new FormData(); form.append('file', file);
    try {
      const response = await fetch(`${API}/api/analyze`, { method: 'POST', body: form });
      const payload = await readApiResponse(response, 'Could not analyse this file.');
      setData(payload); setSelectedCustomer(null); setActive('overview');
      setNotice(`Successfully analysed ${file.name}. All calculations are exploratory.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); if (uploadRef.current) uploadRef.current.value = ''; }
  };

  const runSimulation = async () => {
    setSimLoading(true); setError('');
    try {
      const response = await fetch(`${API}/api/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simInputs),
      });
      const payload = await readApiResponse(response, 'Simulation failed.');
      setSimulation(payload);
    } catch (e) { setError(e.message); }
    finally { setSimLoading(false); }
  };

  const openCustomerSimulator = (row) => {
    const asPct = (value) => Math.max(0, Math.min(200, Math.round((Number(value) || 0) * 100)));
    const recentMissed = Array.from({ length: 6 }, (_, i) => row[`Month_${i + 1}`]).filter((value) => String(value || '').toLowerCase() === 'missed').length;
    setSimInputs({
      missed_payments: Math.max(0, Math.min(24, Number(row.Missed_Payments) || 0)),
      utilization_pct: asPct(row.Credit_Utilization),
      dti_pct: asPct(row.Debt_to_Income_Ratio),
      credit_score: Math.max(300, Math.min(900, Number(row.Credit_Score) || 600)),
      recent_missed_months: recentMissed,
    });
    setSelectedCustomer(null);
    setActive('simulator');
    setNotice(`Loaded ${row.Customer_ID || 'the selected sample record'} into the illustrative scenario. Review the fields before running.`);
  };

  const records = data?.records || [];
  const summary = data?.summary || {};
  const quality = data?.quality || {};
  const segments = data?.segments || {};
  const filteredCustomers = useMemo(() => records.filter((row) => {
    const idMatch = String(row.Customer_ID || '').toLowerCase().includes(query.toLowerCase());
    const status = Number(row.Delinquent_Account);
    const filterMatch = segmentFilter === 'all' || (segmentFilter === 'delinquent' && status === 1) || (segmentFilter === 'current' && status === 0);
    return idMatch && filterMatch;
  }).slice(0, 100), [records, query, segmentFilter]);

  const queue = useMemo(() => records
    .map((row) => ({ ...row, screening: localScreen(row) }))
    .filter((row) => row.screening.tone !== 'low')
    .sort((a, b) => b.screening.points - a.screening.points)
    .slice(0, 30), [records]);

  const paymentTrend = data?.payment_history || [];
  const delinquencyPie = [
    { name: 'Not delinquent', value: summary.non_delinquent_count || 0 },
    { name: 'Delinquent', value: summary.delinquent_count || 0 },
  ];

  const exportCustomers = () => {
    if (!records.length) return;
    const headers = Object.keys(records[0]);
    const csv = [headers.join(','), ...records.map((row) => headers.map((key) => {
      const value = row[key] ?? ''; return `"${String(value).replaceAll('"', '""')}"`;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'geldium_customer_data_export.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const title = NAV.find((item) => item.id === active)?.label || 'Overview';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><Activity size={21}/></div><div><div className="brand-name">geldium</div><div className="brand-caption">COLLECTIONS INTELLIGENCE</div></div></div>
      <div className="workspace-menu-wrap"><button className="workspace-switch" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen((value) => !value)}><div className="workspace-avatar">G</div><div className="workspace-copy"><strong>Geldium Financial</strong><span>Demo workspace</span></div><ChevronDown size={15}/></button>{workspaceOpen && <div className="popover-menu workspace-menu"><strong>Demo workspace</strong><button onClick={() => {setWorkspaceOpen(false); loadSample(); setActive('overview')}}><Database size={14}/> Reload supplied sample</button><button onClick={() => {setWorkspaceOpen(false); uploadRef.current?.click()}}><Upload size={14}/> Analyze a CSV</button><small>Workspace data stays in this browser session.</small></div>}</div>
      <nav className="side-nav">
        <div className="nav-label">WORKSPACE</div>
        {NAV.filter((item) => item.group === 'Workspace').map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={`nav-item ${active === item.id ? 'active' : ''}`}><item.icon size={18}/><span>{item.label}</span>{item.id === 'review' && <b className="nav-count">{queue.length}</b>}</button>)}
        <div className="nav-label governance-label">GOVERNANCE & CONTROL</div>
        {NAV.filter((item) => item.group === 'Governance').map((item) => <button key={item.id} onClick={() => setActive(item.id)} className={`nav-item ${active === item.id ? 'active' : ''}`}><item.icon size={18}/><span>{item.label}</span></button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-help" onClick={() => setWalkthroughOpen(true)}><div className="help-icon"><LifeBuoy size={17}/></div><div><strong>Need a walkthrough?</strong><span>Explore the prototype guide</span></div><ArrowRight size={15}/></button>
        <div className="profile-menu-wrap"><button className="profile-row" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}><div className="profile-avatar">OG</div><div className="profile-copy"><strong>Project Presenter</strong><span>Student workspace</span></div><MoreHorizontal size={18}/></button>{profileOpen && <div className="popover-menu profile-menu"><strong>Demo controls</strong><button onClick={() => {setProfileOpen(false); setWalkthroughOpen(true)}}><CircleHelp size={14}/> Open walkthrough</button><button onClick={resetDemoProgress}><RefreshCw size={14}/> Reset demo progress</button><small>{workspaceStore === 'browser' ? 'The active API is missing workspace routes. Progress is saved in this browser until the updated backend is started.' : 'Progress is stored by this demo service. Free hosting may clear it after a restart.'}</small></div>}</div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumb"><span>Geldium</span><span className="crumb-slash">/</span><strong>{title}</strong></div>
        <div className="topbar-actions">
          <button className="upload-button" onClick={() => uploadRef.current?.click()}><Upload size={15}/> Upload CSV</button>
          <span className="environment-tag"><span className="live-dot"/> DEMO ENVIRONMENT</span>
          <div className="topbar-popover-wrap"><button className="icon-button" title="Notifications" aria-label="Open notifications" aria-expanded={notificationOpen} onClick={() => setNotificationOpen((value) => !value)}><Bell size={18}/>{(queue.length || quality.issues?.length) ? <i/> : null}</button>{notificationOpen && <div className="notification-panel"><div className="notification-head"><div><strong>Platform attention</strong><span>{queue.length + (quality.issues?.length || 0)} items to review</span></div><button className="text-button" onClick={() => setNotificationOpen(false)}>Close</button></div><button className="notification-item" onClick={() => {setNotificationOpen(false); setActive('review')}}><span className="notification-symbol orange"><ListChecks size={16}/></span><span><strong>Human review queue</strong><small>{queue.length} illustrative cases are available to inspect.</small></span><ArrowRight size={15}/></button><button className="notification-item" onClick={() => {setNotificationOpen(false); setActive('validation')}}><span className="notification-symbol blue"><FileCheck2 size={16}/></span><span><strong>Pre-deployment validation</strong><small>{quality.issues?.length || 0} observed data issue types; validation tasks are pending evidence.</small></span><ArrowRight size={15}/></button></div>}</div>
          <div className="top-avatar">OG</div>
        </div>
      </header>

      <div className="content-area">
        {(notice || error) && <div className={`toast ${error ? 'error' : 'success'}`}><span>{error ? <AlertCircle size={17}/> : <CheckCircle2 size={17}/>}</span><div>{error || notice}</div><button onClick={() => {setNotice(''); setError('')}}><X size={15}/></button></div>}
        {loading && <div className="loading-bar"><span/></div>}
        {active === 'overview' && <OverviewPage summary={summary} quality={quality} segments={segments} paymentTrend={paymentTrend} issues={quality.issues || []} pie={delinquencyPie} loading={loading} go={setActive} />}
        {active === 'customers' && <CustomersPage records={filteredCustomers} count={records.length} query={query} setQuery={setQuery} segmentFilter={segmentFilter} setSegmentFilter={setSegmentFilter} onSelect={setSelectedCustomer} exportCustomers={exportCustomers} />}
        {active === 'simulator' && <SimulatorPage inputs={simInputs} setInputs={setSimInputs} result={simulation} run={runSimulation} loading={simLoading} />}
        {active === 'review' && <ReviewPage queue={queue} reviewed={reviewed} onReview={toggleReviewStatus} saving={savingReviews} activity={reviewActivity} summary={operationSummary} storageMode={workspaceStore} onSelect={setSelectedCustomer} />}
        {active === 'workflow' && <WorkflowPage selectedStage={workflowStage} setSelectedStage={setWorkflowStage} go={setActive} />}
        {active === 'responsible' && <ResponsiblePage quality={quality} segments={segments} summary={summary} go={setActive} />}
        {active === 'performance' && <PerformancePage summary={summary} go={setActive} />}
        {active === 'validation' && <ValidationPage quality={quality} checks={validationChecks} saving={savingChecks} storageMode={workspaceStore} onToggle={setValidationCheck} onReset={resetValidationProgress} />}
        <footer className="app-footer"><span>Geldium Collections Intelligence <b>v1.0</b></span><span><LockKeyhole size={12}/> Demo data · No real customer actions</span></footer>
      </div>
    </main>

    {selectedCustomer && <CustomerDrawer row={selectedCustomer} close={() => setSelectedCustomer(null)} openSimulator={openCustomerSimulator} />}
    <input ref={uploadRef} type="file" accept=".csv,text/csv" className="hidden-input" onChange={(e) => uploadCsv(e.target.files?.[0])}/>
    {walkthroughOpen && <div className="modal-backdrop" onClick={() => setWalkthroughOpen(false)}><section className="dialog-card walkthrough-dialog" role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" onClick={(e) => e.stopPropagation()}><div className="dialog-head"><div><div className="eyebrow">PROJECT GUIDE</div><h2 id="walkthrough-title">Explore the platform</h2><p>Choose a section to open. Everything here uses sample data and illustrative rules.</p></div><button className="icon-button" aria-label="Close walkthrough" onClick={() => setWalkthroughOpen(false)}><X size={18}/></button></div><div className="walkthrough-links">{NAV.map((item) => <button key={item.id} onClick={() => {setActive(item.id); setWalkthroughOpen(false)}}><item.icon size={17}/><span><strong>{item.label}</strong><small>{item.id === 'validation' ? 'Track evidence needed before any pilot.' : `Open the ${item.label.toLowerCase()} workspace.`}</small></span><ArrowRight size={15}/></button>)}</div><div className="dialog-note"><ShieldCheck size={15}/> This prototype does not contact customers or make financial decisions.</div></section></div>}
  </div>;
}

function OverviewPage({ summary, quality, segments, paymentTrend, issues, pie, loading, go }) {
  return <>
    <SectionHeader eyebrow="PORTFOLIO OVERVIEW" title="Collections intelligence" description="A unified view of customer repayment patterns, data readiness and responsible intervention opportunities." right={<span className="data-period"><CalendarClock size={15}/> Sample dataset · 500 records</span>} />
    <div className="callout-banner"><div className="callout-icon"><ShieldAlert size={19}/></div><div><strong>Decision-support prototype — not a validated risk model</strong><p>Explore the supplied data and test illustrative rules. Resolve data-quality issues and validate any future model before operational use.</p></div><button onClick={() => go('responsible')}>View safeguards <ArrowRight size={14}/></button></div>
    <div className="metric-grid">
      <MetricCard label="Customer records" value={num(summary.total_customers)} detail={`${num(summary.columns)} source fields`} icon={Users} tone="blue"/>
      <MetricCard label="Recorded delinquency" value={pct(summary.delinquency_rate_pct)} detail={`${num(summary.delinquent_count)} labelled accounts`} icon={Activity} tone="orange"/>
      <MetricCard label="Missing data cells" value={num(summary.missing_cells)} detail={`${num(summary.rows_with_missing)} records affected`} icon={Database} tone="purple"/>
      <MetricCard label="Payment-history flags" value={num(quality.payment_history_mismatches)} detail="Require reconciliation" icon={AlertTriangle} tone="red"/>
    </div>
    <div className="dashboard-grid two-col">
      <Panel title="Monthly repayment history" subtitle="Counts of source labels across the six available monthly fields.">
        {paymentTrend.length ? <div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={paymentTrend} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="ontime" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a47c" stopOpacity={0.2}/><stop offset="100%" stopColor="#16a47c" stopOpacity={0}/></linearGradient><linearGradient id="late" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e7a33e" stopOpacity={0.18}/><stop offset="100%" stopColor="#e7a33e" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f4"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8993a3', fontSize: 12 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8993a3', fontSize: 11 }}/><Tooltip contentStyle={{ border: '1px solid #edf0f4', borderRadius: 12, boxShadow: '0 8px 24px rgba(16,24,40,.08)' }}/><Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }}/><Area type="monotone" dataKey="on_time" name="On-time" stroke="#16a47c" fill="url(#ontime)" strokeWidth={2.3}/><Area type="monotone" dataKey="late" name="Late" stroke="#e7a33e" fill="url(#late)" strokeWidth={2.3}/><Area type="monotone" dataKey="missed" name="Missed" stroke="#db6c5b" fill="transparent" strokeWidth={2.3}/></AreaChart></ResponsiveContainer></div> : <EmptyState title="No payment history fields" description="Upload a CSV containing Month_1 to Month_6 to display repayment trends."/>}
      </Panel>
      <Panel title="Recorded account outcomes" subtitle="Distribution of the Delinquent_Account label in the supplied file.">
        <div className="pie-panel"><div className="chart-wrap donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={65} outerRadius={87} paddingAngle={3} stroke="none">{pie.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#dfe8f1' : '#e69a4b'}/>)}</Pie><Tooltip formatter={(v) => [num(v), 'Customers']}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{pct(summary.delinquency_rate_pct)}</strong><span>labelled delinquent</span></div></div><div className="pie-legend"><div><i className="legend-dot current"/><span>Not delinquent</span><strong>{num(summary.non_delinquent_count)}</strong></div><div><i className="legend-dot overdue"/><span>Delinquent</span><strong>{num(summary.delinquent_count)}</strong></div></div></div>
        <div className="insight-note"><Info size={15}/><span>This is the historical label distribution in the supplied sample, not a forecast of future delinquency.</span></div>
      </Panel>
    </div>
    <div className="dashboard-grid two-col lower-grid">
      <Panel title="Exploratory segment variation" subtitle="Unadjusted historical label rates by card type. Not a risk ranking.">
        {segments.credit_card_type?.length ? <div className="chart-wrap compact"><ResponsiveContainer width="100%" height="100%"><BarChart data={segments.credit_card_type} layout="vertical" margin={{ left: 12, right: 12, top: 2, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf0f4"/><XAxis type="number" domain={[0, 'dataMax + 5']} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} tick={{ fill:'#8993a3', fontSize:11 }}/><YAxis type="category" dataKey="label" width={75} axisLine={false} tickLine={false} tick={{ fill:'#5d6878', fontSize:12 }}/><Tooltip formatter={(v) => [`${v}%`, 'Observed rate']}/><Bar dataKey="observed_rate_pct" fill="#6d8ee8" radius={[0,6,6,0]} barSize={15}/></BarChart></ResponsiveContainer></div> : <EmptyState title="Segment data unavailable" description="Include Credit_Card_Type and Delinquent_Account to view this comparison."/>}
      </Panel>
      <Panel title="Data quality attention" subtitle="Resolve source issues before using these fields for modelling." action={<button className="text-button" onClick={() => go('validation')}>Open checklist <ArrowRight size={14}/></button>}>
        <div className="issue-list">{issues.slice(0, 4).map((issue, i) => <div className="issue-row" key={i}><div className={`issue-bullet ${issue.severity}`}>{issue.severity === 'critical' ? <AlertTriangle size={15}/> : <Info size={15}/>}</div><div className="issue-copy"><strong>{issue.title}</strong><span>{issue.detail}</span></div><b className="issue-count">{num(issue.count)}</b></div>)}{!issues.length && <EmptyState title="No issues detected" description="The current checks did not find the configured quality flags."/>}</div>
      </Panel>
    </div>
  </>;
}

function CustomersPage({ records, count, query, setQuery, segmentFilter, setSegmentFilter, onSelect, exportCustomers }) {
  return <>
    <SectionHeader eyebrow="CUSTOMER DATA" title="Customer explorer" description="Inspect customer-level source records, payment history and labelled outcomes. Use the sample only for learning and demonstration." right={<button className="secondary-button" onClick={exportCustomers}><Download size={16}/> Export CSV</button>} />
    <div className="callout-banner slim"><div className="callout-icon"><Database size={18}/></div><div><strong>Source inspection, not automated profiling</strong><p>Search and filter the uploaded records. Selecting a row opens its source attributes and quality context.</p></div></div>
    <Panel className="table-panel">
      <div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer ID..."/></div><div className="filter-select"><Filter size={15}/><select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}><option value="all">All outcomes</option><option value="delinquent">Recorded delinquent</option><option value="current">Not delinquent</option></select></div><span className="result-count">Showing {Math.min(records.length, 20)} of {num(count)} matching records</span></div>
      <div className="table-scroll"><table><thead><tr><th>Customer ID</th><th>Card type</th><th>Credit score</th><th>Utilization</th><th>Missed payments</th><th>Recorded outcome</th><th></th></tr></thead><tbody>
        {records.slice(0, 20).map((row, i) => <tr key={`${row.Customer_ID}-${i}`} onClick={() => onSelect(row)}><td><div className="customer-cell"><div className="customer-initial">{String(row.Customer_ID || 'C').slice(-2, -1)}</div><strong>{row.Customer_ID || '—'}</strong></div></td><td>{row.Credit_Card_Type || '—'}</td><td>{num(row.Credit_Score)}</td><td>{row.Credit_Utilization == null ? '—' : pct(Number(row.Credit_Utilization) * 100)}</td><td>{num(row.Missed_Payments)}</td><td><Pill tone={Number(row.Delinquent_Account) === 1 ? 'warning' : 'success'}>{labelStatus(row.Delinquent_Account)}</Pill></td><td><button className="row-open"><ArrowRight size={15}/></button></td></tr>)}
      </tbody></table>{!records.length && <EmptyState title="No matching customers" description="Try another customer ID or clear the outcome filter."/>}</div>
      <div className="table-foot">Select a record to inspect the full source profile. Up to 20 matching rows are shown on this page.</div>
    </Panel>
    <div className="notice-inline"><Info size={16}/> Customer IDs and values come from the supplied internship dataset. Treat them as sample records; do not infer real individuals or use the figures for operational collections.</div>
  </>;
}

function CustomerDrawer({ row, close, openSimulator }) {
  const fields = [
    ['Age', row.Age], ['Income', money(row.Income)], ['Credit score', row.Credit_Score],
    ['Credit utilization', row.Credit_Utilization == null ? '—' : pct(Number(row.Credit_Utilization) * 100)],
    ['Missed payments', row.Missed_Payments], ['Loan balance', money(row.Loan_Balance)],
    ['Debt-to-income', row.Debt_to_Income_Ratio == null ? '—' : pct(Number(row.Debt_to_Income_Ratio) * 100)],
    ['Employment status', row.Employment_Status], ['Account tenure', row.Account_Tenure == null ? '—' : `${row.Account_Tenure} years`],
    ['Card type', row.Credit_Card_Type], ['Location', row.Location],
  ];
  return <div className="drawer-backdrop" onClick={close}><aside className="customer-drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">CUSTOMER RECORD</div><h2>{row.Customer_ID}</h2></div><button className="icon-button" aria-label="Close customer record" onClick={close}><X size={18}/></button></div><div className="drawer-status"><Pill tone={Number(row.Delinquent_Account) === 1 ? 'warning' : 'success'}>{labelStatus(row.Delinquent_Account)}</Pill><span>Source outcome label</span></div><div className="drawer-section-title">Account attributes</div><div className="detail-grid">{fields.map(([label, value]) => <div className="detail-item" key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</div><div className="drawer-section-title">Monthly repayment labels</div><div className="month-grid">{Array.from({length:6}, (_,i) => { const value = row[`Month_${i+1}`] || 'Not recorded'; return <div className="month-item" key={i}><span>M{i+1}</span><Pill tone={value === 'Missed' ? 'warning' : value === 'Late' ? 'neutral' : value === 'On-time' ? 'success' : 'neutral'}>{value}</Pill></div>})}</div><div className="drawer-note"><AlertCircle size={15}/> This profile is for source-data inspection only. The recorded outcome is historical and is not a predicted risk score.</div><button className="primary-button drawer-action" onClick={() => openSimulator(row)}><SlidersHorizontal size={15}/> Explore in risk simulator</button></aside></div>;
}

function SimulatorPage({ inputs, setInputs, result, run, loading }) {
  const update = (key, value) => setInputs((prev) => ({ ...prev, [key]: Number(value) }));
  return <>
    <SectionHeader eyebrow="SCENARIO TESTING" title="Risk simulator" description="Explore how a transparent, illustrative rule set could route an account for proportionate support. These rules are not trained or validated." />
    <div className="sim-layout">
      <Panel title="Customer scenario" subtitle="Adjust inputs to test the demonstration rules.">
        <div className="sim-field-grid">
          <div className="sim-field"><label>Missed payments <span>{inputs.missed_payments}</span></label><input type="range" min="0" max="6" value={inputs.missed_payments} onChange={(e) => update('missed_payments', e.target.value)}/><div className="range-labels"><span>0</span><span>6+</span></div></div>
          <div className="sim-field"><label>Credit utilization <span>{inputs.utilization_pct}%</span></label><input type="range" min="0" max="120" step="5" value={inputs.utilization_pct} onChange={(e) => update('utilization_pct', e.target.value)}/><div className="range-labels"><span>0%</span><span>120%</span></div></div>
          <div className="sim-field"><label>Debt-to-income ratio <span>{inputs.dti_pct}%</span></label><input type="range" min="0" max="80" step="2" value={inputs.dti_pct} onChange={(e) => update('dti_pct', e.target.value)}/><div className="range-labels"><span>0%</span><span>80%</span></div></div>
          <div className="sim-field"><label>Credit score <span>{inputs.credit_score}</span></label><input type="range" min="300" max="850" step="5" value={inputs.credit_score} onChange={(e) => update('credit_score', e.target.value)}/><div className="range-labels"><span>300</span><span>850</span></div></div>
          <div className="sim-field full"><label>Recent monthly “Missed” statuses <span>{inputs.recent_missed_months}</span></label><input type="range" min="0" max="6" value={inputs.recent_missed_months} onChange={(e) => update('recent_missed_months', e.target.value)}/><div className="range-labels"><span>0</span><span>6</span></div></div>
        </div>
        <div className="sim-actions"><button className="primary-button" onClick={run} disabled={loading}>{loading ? <RefreshCw size={16} className="spin"/> : <Play size={16}/>} Run illustrative assessment</button><button className="text-button" onClick={() => {setInputs({missed_payments:2,utilization_pct:72,dti_pct:36,credit_score:620,recent_missed_months:1})}}>Reset inputs</button></div>
      </Panel>
      <Panel title="Assessment explanation" subtitle="Transparent rule triggers and proportionate next-step guidance." className="result-panel">
        {result ? <div className="result-content"><div className={`risk-result ${result.tone}`}><div><span>ILLUSTRATIVE ROUTING BAND</span><h2>{result.band}</h2></div><div className="risk-score"><strong>{result.points}</strong><span>rule points</span></div></div><div className="result-block"><h4>Why this scenario was routed</h4><ul className="reason-list">{result.reasons.map((reason,i)=><li key={i}><CheckCircle2 size={15}/>{reason}</li>)}</ul></div><div className="result-block recommendation-block"><h4><HeartHandshake size={16}/> Suggested support approach</h4><p>{result.recommendation}</p></div><div className="result-block oversight-block"><h4><ShieldCheck size={16}/> Human oversight</h4><p>{result.oversight}</p></div><div className="sim-disclaimer"><AlertCircle size={15}/>{result.disclaimer}</div></div> : <EmptyState icon={SlidersHorizontal} title="Ready to simulate" description="Adjust the customer inputs and run an illustrative assessment to see the rule triggers and recommended routing."/>}
      </Panel>
    </div>
    <div className="notice-inline"><Info size={16}/> Example thresholds (60%/80% utilization, 40% DTI and 580 credit score) are demonstration assumptions only. They are not estimated from the dataset, approved by Geldium or suitable for customer decisions.</div>
  </>;
}

function ReviewPage({ queue, reviewed, saving, activity, summary, storageMode, onReview, onSelect }) {
  const openCount = queue.filter((row) => !reviewed[row.Customer_ID]).length;
  return <>
    <SectionHeader eyebrow="HUMAN-IN-THE-LOOP" title="Human review queue" description="A mock review worklist for cases surfaced by illustrative screening rules. No real outreach or financial action is performed." right={<Pill tone="warning">{openCount} awaiting review</Pill>} />
    <div className="review-summary-grid"><div className="review-stat"><span>Queue size</span><strong>{queue.length}</strong><small>Rule-screened sample records</small></div><div className="review-stat"><span>Awaiting review</span><strong>{openCount}</strong><small>Waiting for a demo review</small></div><div className="review-stat"><span>Marked reviewed</span><strong>{summary?.reviewed_customers ?? Object.values(reviewed).filter(Boolean).length}</strong><small>{storageMode === 'browser' ? 'Saved in this browser' : 'Saved by the backend service'}</small></div></div>
    <Panel title="Cases requiring human attention" subtitle="Sorted by illustrative rule points. This list is not a validated prediction or collections priority list.">
      <div className="table-scroll"><table><thead><tr><th>Customer ID</th><th>Rule band</th><th>Rule points</th><th>Recorded outcome</th><th>Suggested handling</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {queue.map((row) => <tr key={row.Customer_ID}><td><button className="customer-link" onClick={() => onSelect(row)}>{row.Customer_ID}</button></td><td><Pill tone={row.screening.tone === 'high' ? 'danger' : 'warning'}>{row.screening.band}</Pill></td><td>{row.screening.points}</td><td>{labelStatus(row.Delinquent_Account)}</td><td>{row.screening.tone === 'high' ? 'Human review first' : 'Supportive outreach review'}</td><td>{reviewed[row.Customer_ID] ? <Pill tone="success">Reviewed</Pill> : <Pill tone="neutral">Awaiting</Pill>}</td><td><button disabled={saving[row.Customer_ID]} className={reviewed[row.Customer_ID] ? 'reviewed-button' : 'small-action'} onClick={() => onReview(row.Customer_ID)}>{saving[row.Customer_ID] ? 'Saving…' : reviewed[row.Customer_ID] ? <><Check size={14}/> Undo</> : <><CheckCircle2 size={14}/> Mark reviewed</>}</button></td></tr>)}
      </tbody></table>{!queue.length && <EmptyState title="No cases in the demo queue" description="No records met the illustrative medium or high screening rules."/>}</div>
      <div className="table-foot">{storageMode === 'browser' ? 'The active API does not expose workspace routes, so review changes are saved in this browser. Restart the updated backend for shared SQLite storage. ' : 'Review updates are saved through the API to the demo SQLite store and recorded in a recent activity history. '}The worklist does not contact customers, modify accounts or perform a financial action.</div>
    </Panel>
    <Panel className="review-activity-panel" title="Recent review activity" subtitle="Latest status changes saved by the backend service.">
      {activity.length ? <div className="review-activity-list">{activity.map((event) => <div className="review-activity-row" key={event.id || `${event.customer_id}-${event.created_at}`}><span className={`activity-dot ${event.reviewed ? 'done' : ''}`}/><div><strong>{event.customer_id}</strong><small>{event.reviewed ? 'Marked reviewed' : 'Returned to awaiting review'}</small></div><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div>)}</div> : <EmptyState icon={Activity} title="No review actions yet" description="Saved review decisions will appear here."/>}
      <div className="table-foot">{summary?.review_activity_events ?? activity.length} review actions recorded in this demo workspace.</div>
    </Panel>
  </>;
}

function WorkflowPage({ selectedStage, setSelectedStage, go }) {
  const steps = [
    { n:'01', icon: Database, title:'Collect & validate data', tag:'Input layer', color:'blue', bullets:['Repayment history and missed-payment indicators','Credit utilization, credit score and debt burden','Account context, missingness and source-quality checks'], output:'Validated, purpose-limited customer record', details:['Confirm field meaning, units, source and refresh cadence.','Reconcile inconsistent monthly statuses and aggregate counts.','Document missing-value, duplicate and outlier handling.'] },
    { n:'02', icon: Gauge, title:'Assess & explain', tag:'Decision layer', color:'purple', bullets:['Approved business rules plus a future validated model','Probability and review band only after model validation','Reason codes and data-quality warnings for every case'], output:'Review-oriented signal with clear reasons', details:['Compare candidate models with simple baselines on a frozen holdout.','Check calibration and errors at the proposed operating threshold.','Show reason codes and uncertainty to a trained human reviewer.'] },
    { n:'03', icon: HeartHandshake, title:'Recommend & route', tag:'Action layer', color:'orange', bullets:['Routine, respectful reminders within consent rules','Support outreach and payment-assistance information','Human review for hardship, disputes and sensitive cases'], output:'Proportionate next step — not automatic punishment', details:['Respect contact preferences, consent and approved hours.','Route hardship, dispute and sensitive cases to trained staff.','Record the chosen support and the reason for any override.'] },
    { n:'04', icon: RefreshCw, title:'Monitor & learn', tag:'Learning layer', color:'green', bullets:['Track contact outcomes, repayment and customer feedback','Measure false positives, missed cases and subgroup gaps','Review drift, update controls and approve any model change'], output:'Auditable feedback for controlled improvement', details:['Track service outcomes, complaints, opt-outs and customer feedback.','Watch data drift and subgroup error rates on a defined schedule.','Require documented approval, rollback plans and version history for changes.'] },
  ];
  return <>
    <SectionHeader eyebrow="OPERATING MODEL" title="How the system works" description="A four-stage operating loop connects customer data to explainable support recommendations and controlled learning." />
    <div className="workflow-grid">{steps.map((step, index) => <React.Fragment key={step.n}><div className={`workflow-card ${step.color}`}><div className="workflow-card-top"><span>{step.n}</span><Pill>{step.tag}</Pill></div><div className="workflow-icon"><step.icon size={22}/></div><h3>{step.title}</h3><ul>{step.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul><div className="workflow-output"><span>OUTPUT</span><strong>{step.output}</strong></div><button className="text-button workflow-explore" onClick={() => setSelectedStage(selectedStage === index ? null : index)}>{selectedStage === index ? 'Close details' : 'Explore this stage'} <ArrowRight size={14}/></button></div>{index < 3 && <div className="workflow-arrow"><ArrowRight size={20}/></div>}</React.Fragment>)}</div>
    {selectedStage != null && <Panel className="workflow-detail" title={`${steps[selectedStage].n} · ${steps[selectedStage].title}`} subtitle="What the team should do before moving to the next stage."><ul className="workflow-detail-list">{steps[selectedStage].details.map((detail) => <li key={detail}><CheckCircle2 size={16}/>{detail}</li>)}</ul><button className="secondary-button" onClick={() => go('validation')}><FileCheck2 size={15}/> Open pre-deployment checklist <ArrowRight size={14}/></button></Panel>}
    <div className="dual-control-grid"><Panel title="Suitable for bounded automation" subtitle="Low-risk, reversible operational tasks with approved rules."><ul className="check-list"><li><CheckCircle2/> Schedule standard reminders using consent and contact preferences.</li><li><CheckCircle2/> Summarize account context and assemble case information.</li><li><CheckCircle2/> Monitor service-level timers and flag missing data.</li><li><CheckCircle2/> Draft plain-language explanations for staff review.</li></ul></Panel><Panel title="Require human judgement" subtitle="Sensitive, consequential or exception-based decisions."><ul className="check-list human"><li><ShieldCheck/> Agree hardship or tailored repayment arrangements.</li><li><ShieldCheck/> Resolve disputes and correct inaccurate source records.</li><li><ShieldCheck/> Approve adverse, restrictive or escalated actions.</li><li><ShieldCheck/> Review model exceptions, fairness alerts and complaints.</li></ul></Panel></div>
    <div className="notice-inline"><Info size={16}/> Agentic AI is proposed as a coordinator under bounded permissions. This prototype simulates the workflow and does not connect to messaging, collections or financial systems.</div>
  </>;
}

function ResponsiblePage({ quality, segments, summary, go }) {
  const controls = [
    { icon: ScaleIcon, title:'Fairness & proxy control', text:'Check error rates, calibration and flag rates across relevant groups. Review age, location and employment fields for unjustified proxy effects; investigate disparities rather than assuming they prove bias.' },
    { icon: MessageSquareText, title:'Explainability & contestability', text:'Provide a concise reason summary for each review signal. Let staff and customers challenge or correct inaccurate information; keep a traceable record of overrides.' },
    { icon: LockKeyhole, title:'Privacy & data minimization', text:'Use only necessary fields, role-based access, secure transfer and storage, retention limits, and controlled access to scores and sensitive account details.' },
    { icon: ShieldCheck, title:'Compliance & human accountability', text:'Map applicable credit, consumer-protection, privacy and collections rules with legal/compliance teams. Keep human approval for sensitive or consequential decisions.' },
  ];
  return <>
    <SectionHeader eyebrow="TRUST, SAFETY & CONTROL" title="Responsible AI guardrails" description="Controls must be designed into the workflow before any predictive model or automation is used with real customers." />
    <div className="governance-status"><div className="governance-status-icon"><ShieldAlert size={22}/></div><div><strong>Pre-deployment validation required</strong><p>No trained model or fairness evaluation is available in this prototype. The safeguards below describe what must be tested and approved before a pilot.</p></div><Pill tone="warning">Not yet validated</Pill><button className="secondary-button validation-open" onClick={() => go('validation')}><FileCheck2 size={15}/> Open validation checklist <ArrowRight size={14}/></button></div>
    <div className="guardrail-grid">{controls.map((control, i)=><div className="guardrail-card" key={i}><div className="guardrail-icon"><control.icon size={20}/></div><div className="guardrail-number">0{i+1}</div><h3>{control.title}</h3><p>{control.text}</p><button className="text-button guardrail-action" onClick={() => go('validation')}>Explore control <ArrowRight size={13}/></button></div>)}</div>
    <div className="dashboard-grid two-col governance-lower">
      <Panel title="Dataset issues to resolve" subtitle="Observed from the supplied 500-record workbook.">
        <div className="quality-kpi-list"><div><span>Payment-history mismatches</span><strong>{num(quality.payment_history_mismatches)}</strong><small>Six-month “Missed” counts exceed Missed_Payments in these records.</small></div><div><span>Records with missing values</span><strong>{num(summary.rows_with_missing)}</strong><small>{num(summary.missing_cells)} missing cells require field-level review.</small></div><div><span>Utilization above 100%</span><strong>{num(quality.utilization_above_100)}</strong><small>Confirm whether ratios are stored as proportions.</small></div><div><span>Employment label variants</span><strong>{(quality.employment_labels || []).filter((v) => ['emp','employed'].includes(String(v).toLowerCase())).length}</strong><small>Confirm whether EMP and Employed are equivalent before standardization.</small></div></div>
      </Panel>
      <Panel title="Fairness assessment status" subtitle="Descriptive subgroup differences are review signals, not fairness test results.">
        <div className="pending-box"><div className="pending-icon"><Clock3 size={18}/></div><div><strong>Fairness evaluation pending</strong><p>Train and validate a candidate model first. Then compare recall, false-positive rate, precision, calibration and flag rates across lawful, sufficiently sized groups.</p></div></div>
        <div className="fairness-checks"><span><CheckCircle2/> Demographic parity as a screening diagnostic</span><span><CheckCircle2/> Disparate-impact ratio as a screening diagnostic</span><span><CheckCircle2/> Equal-opportunity / recall comparison</span><span><CheckCircle2/> Human and legal review of any material gap</span></div>
      </Panel>
    </div>
    <div className="notice-inline"><Info size={16}/> Applicable laws depend on where Geldium operates and the purpose of processing. Obtain jurisdiction-specific legal review; this student prototype does not certify compliance with ECOA, GDPR or any local law.</div>
  </>;
}

function ValidationPage({ quality, checks, saving, storageMode, onToggle, onReset }) {
  const done = VALIDATION_ITEMS.filter((item) => checks[item.id]).length;
  const grouped = [...new Set(VALIDATION_ITEMS.map((item) => item.area))];
  const exportChecklist = () => {
    const rows = [['Area','Task','Details','Marked complete']];
    VALIDATION_ITEMS.forEach((item) => rows.push([item.area,item.title,item.detail,checks[item.id] ? 'Yes' : 'No']));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'geldium_predeployment_checklist.csv'; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <SectionHeader eyebrow="READINESS WORKSPACE" title="Pre-deployment validation checklist" description="Work through the data, model, fairness, privacy and pilot controls that need evidence before a real-world pilot." right={<button className="secondary-button" onClick={exportChecklist}><Download size={15}/> Export checklist</button>} />
    <div className="validation-banner"><div className="validation-banner-icon"><ShieldAlert size={20}/></div><div><strong>This checklist tracks work; it does not validate the system.</strong><p>No predictive model is trained in this prototype. Mark an item only after its evidence has been reviewed and approved by the responsible owner.</p></div></div>
    <div className="validation-progress panel"><div><span className="eyebrow">{storageMode === 'browser' ? 'BROWSER-SAVED PROGRESS' : 'BACKEND-SAVED PROGRESS'}</span><strong>{done} of {VALIDATION_ITEMS.length}</strong><small>{storageMode === 'browser' ? 'Saved in this browser while the active backend is updated. ' : 'Saved by this service for the demo. '}Completion is not platform approval.</small></div><div className="validation-progress-track"><span style={{width:`${Math.round((done / VALIDATION_ITEMS.length) * 100)}%`}}/></div><button className="text-button" disabled={!done} onClick={onReset}>Reset progress</button></div>
    <div className="validation-stats"><div><span>Payment history flags</span><strong>{num(quality.payment_history_mismatches)}</strong><small>Need source reconciliation</small></div><div><span>Utilization over 100%</span><strong>{num(quality.utilization_above_100)}</strong><small>Confirm units and bounds</small></div><div><span>Checklist items</span><strong>{VALIDATION_ITEMS.length}</strong><small>Grouped by readiness area</small></div></div>
    <div className="validation-sections">{grouped.map((area) => <Panel key={area} title={area} subtitle="Assign an owner, collect evidence and record approval outside this demonstration." className="validation-section"><div className="validation-items">{VALIDATION_ITEMS.filter((item) => item.area === area).map((item) => <label className={`validation-item ${checks[item.id] ? 'complete' : ''}`} key={item.id}><input type="checkbox" checked={Boolean(checks[item.id])} disabled={saving[item.id]} onChange={(event) => onToggle(item.id, event.target.checked)}/><span className="validation-check-icon">{checks[item.id] ? <Check size={15}/> : <span/>}</span><span className="validation-item-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><Pill tone={checks[item.id] ? 'success' : 'warning'}>{saving[item.id] ? 'Saving…' : checks[item.id] ? 'Marked done' : 'Evidence needed'}</Pill></label>)}</div></Panel>)}</div>
    <div className="notice-inline"><Info size={16}/> Checklist progress is stored by the backend service. It is not an audit record, approval or evidence that a model, fairness control, security measure or deployment has passed review. The free-hosting demo may lose data when its service restarts.</div>
  </>;
}

function ScaleIcon(props) { return <Shield {...props}/>; }

function PerformancePage({ summary, go }) {
  const [selectedKpi, setSelectedKpi] = useState(null);
  const kpis = [
    { name:'Delinquency rate', definition:'Share of eligible accounts entering the defined delinquency state in the measurement window.', type:'Business outcome', target:'Set baseline, then compare pilot vs. control', status:'Baseline only' },
    { name:'Roll-rate / cure rate', definition:'Share moving into a worse status or returning to current after intervention.', type:'Business outcome', target:'Agree definitions and target with Collections', status:'Not measured' },
    { name:'Cost per resolved account', definition:'Collections operating cost divided by accounts resolved in the same period.', type:'Efficiency', target:'Compare pre-pilot and pilot cohorts', status:'Not measured' },
    { name:'Successful supportive contact', definition:'Share of eligible customers reached through approved, preference-aware channels.', type:'Customer outcome', target:'Set channel-specific baseline', status:'Not measured' },
    { name:'Complaint / opt-out rate', definition:'Customer complaints and contact opt-outs per contacted account.', type:'Customer protection', target:'No deterioration; investigate any increase', status:'Not measured' },
    { name:'Subgroup performance gap', definition:'Difference in recall, false-positive rate, calibration or flag rate across relevant groups.', type:'Fairness', target:'Set risk tolerance after baseline analysis', status:'Not measured' },
  ];
  return <>
    <SectionHeader eyebrow="VALUE & MEASUREMENT" title="Performance and business impact" description="Measure collections effectiveness and customer outcomes together. Targets should be approved only after baselines, data definitions and a controlled pilot are established." right={<button className="secondary-button" onClick={() => go('validation')}><FileCheck2 size={15}/> Readiness checklist</button>} />
    <div className="impact-cards"><div className="impact-card business"><div className="impact-card-head"><BarChart3 size={18}/><span>BUSINESS KPIs</span></div><h3>Operational effectiveness</h3><ul><li>Delinquency rate and roll-rate</li><li>Repayment / cure rate</li><li>Cost per resolved account</li><li>Time to resolve and case throughput</li></ul></div><div className="impact-card customer"><div className="impact-card-head"><HeartHandshake size={18}/><span>CUSTOMER OUTCOMES</span></div><h3>Fair and supportive servicing</h3><ul><li>Successful supportive contact</li><li>Hardship support uptake and resolution</li><li>Complaint and opt-out rates</li><li>Fairness and subgroup performance gaps</li></ul></div></div>
    <Panel title="Measurement scorecard" subtitle="Definitions and evaluation status for a future controlled pilot.">
      <div className="table-scroll"><table className="kpi-table"><thead><tr><th>Measure</th><th>What it tells us</th><th>Proposed evaluation approach</th><th>Status</th><th></th></tr></thead><tbody>{kpis.map((kpi) => <tr key={kpi.name}><td><strong>{kpi.name}</strong><span className="table-sub">{kpi.type}</span></td><td>{kpi.definition}</td><td>{kpi.target}</td><td><Pill tone={kpi.status === 'Baseline only' ? 'info' : 'neutral'}>{kpi.status}</Pill></td><td><button className="text-button" onClick={() => setSelectedKpi(selectedKpi === kpi.name ? null : kpi.name)}>{selectedKpi === kpi.name ? 'Close' : 'Details'} <ArrowRight size={13}/></button></td></tr>)}</tbody></table></div>
    </Panel>
    {selectedKpi && <Panel className="kpi-detail" title={`${selectedKpi}: measurement notes`} subtitle="Agree the definition and observation window before comparing results."><p>{kpis.find((kpi) => kpi.name === selectedKpi)?.definition}</p><div className="kpi-detail-meta"><span><strong>Evaluation</strong>{kpis.find((kpi) => kpi.name === selectedKpi)?.target}</span><span><strong>Current status</strong>{kpis.find((kpi) => kpi.name === selectedKpi)?.status}. This prototype does not calculate this KPI from an intervention dataset.</span></div><button className="secondary-button" onClick={() => go('validation')}><FileCheck2 size={15}/> Open pilot readiness tasks</button></Panel>}
    <div className="pilot-plan"><div className="pilot-icon"><Target size={20}/></div><div><div className="eyebrow">PROPOSED IMPLEMENTATION SEQUENCE</div><h3>Validate first. Pilot second. Scale only with evidence.</h3><div className="pilot-steps"><div><b>1</b><strong>Data readiness</strong><span>Resolve the 141 payment-history flags and document field definitions.</span></div><div><b>2</b><strong>Model evaluation</strong><span>Compare Logistic Regression, a constrained Decision Tree and a majority-class baseline.</span></div><div><b>3</b><strong>Controlled pilot</strong><span>Use approved thresholds, a comparison group and human review.</span></div><div><b>4</b><strong>Review & scale</strong><span>Scale only if outcome, fairness and customer safeguards pass review.</span></div></div></div></div>
    <div className="notice-inline"><Info size={16}/> The current sample has {num(summary.total_customers)} customers and {pct(summary.delinquency_rate_pct)} recorded delinquency. This is a descriptive baseline only. No predictive performance, cost saving or delinquency reduction has been measured.</div>
  </>;
}
