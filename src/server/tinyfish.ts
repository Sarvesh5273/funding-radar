import { randomUUID } from 'node:crypto';
import type { Endpoint, UsageEvent } from '../shared/types.js';
import { assertPublicUrl } from './security.js';

export type DatasetCell = string | number | boolean | null;
export interface DatasetColumn {
  name: string;
  label?: string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'date';
  is_primary_key: boolean;
  retrieval_hint?: string;
  format?: string;
  examples?: string[];
  is_unique?: boolean;
}
export interface DatasetSpec {
  name: string;
  description: string;
  columns: DatasetColumn[];
  keep_when?: { column: string };
}
export interface TinyDataset {
  id: string;
  name: string;
  spec: DatasetSpec;
  status: 'empty' | 'populating' | 'ready' | 'failed' | 'cancelled';
  target_rows: number;
  row_count: number;
  run: { id: string; status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; started_at?: string; finished_at?: string; error?: unknown } | null;
  created_at: string;
}
export interface TinyDatasetRow { _id: string; data: Record<string, DatasetCell>; }
export interface TinyDatasetPage { columns: DatasetColumn[]; rows: TinyDatasetRow[]; truncated: boolean; next_cursor: string | null; }
export interface TinySearchResult { position?: number; site_name?: string; title: string; snippet: string; url: string; date?: string; }
export interface TinySearchResponse { query: string; results: TinySearchResult[]; total_results: number; page: number; }
export interface TinyFetchPage {
  url: string;
  final_url: string;
  title: string | null;
  description?: string | null;
  text: string | null;
  published_date: string | null;
  links?: string[];
  iframe_links?: string[];
  latency_ms?: number | null;
}
export interface TinyFetchResponse { results: TinyFetchPage[]; errors: Array<{ url: string; error: string; status?: number; http_status?: number }>; }
export interface TinyAgentRun {
  run_id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  result?: unknown;
  resultJson?: unknown;
  num_of_steps?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  error?: { code?: string; message?: string; help_url?: string } | null;
}
export interface TinyBrowserSession { session_id: string; cdp_url: string; base_url: string; }
export interface TinyWallet {
  available_balance: string;
  currency: string;
  as_of: string;
  rates?: { meters: Array<{ label: string; unit_amount: string; currency: string; per: string }> };
}

export class TinyFishError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly helpUrl: string | null = null,
    public readonly retryAfterSeconds: number | null = null,
    public readonly ambiguous = false,
    /** A provider-returned handle to recover instead of starting a second run. */
    public readonly resourceId: string | null = null,
  ) { super(message); this.name = 'TinyFishError'; }
}

const HOSTS = new Set(['agent.tinyfish.ai', 'api.search.tinyfish.ai', 'api.fetch.tinyfish.ai', 'api.browser.tinyfish.ai']);
const AGENT = 'https://agent.tinyfish.ai';
type Audit = (event: UsageEvent) => void;

export const READ_RETRY_POLICY = Object.freeze({ maxRetries: 3, backoffSeconds: [20, 40, 60] as const, maxElapsedMs: 360000, fetchUrlsPerMinute: 100, searchesPerMinute: 24 });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function waitInSegments(ms: number, deadline: number): Promise<void> {
  const target = Math.min(Date.now() + ms, deadline);
  while (Date.now() < target) await sleep(Math.min(60000, target - Date.now()));
}
class RollingQuota {
  private entries: Array<{ at: number; units: number }> = [];
  private cooldownUntil = 0;
  constructor(private readonly capacity: number) {}
  pause(ms: number): void { this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms); }
  async take(units: number, deadline: number, onWait?: (ms: number) => void): Promise<void> {
    while (true) {
      const now = Date.now();
      this.entries = this.entries.filter(entry => entry.at > now - 60000);
      const used = this.entries.reduce((sum, entry) => sum + entry.units, 0);
      if (now >= this.cooldownUntil && used + units <= this.capacity) { this.entries.push({ at: now, units }); return; }
      if (now >= deadline) throw new TinyFishError('Read-only provider requests remained rate limited for six minutes. Try the saved run later.', 429, 'RATE_LIMIT_EXCEEDED');
      const windowWait = used + units > this.capacity ? Math.max(1, (this.entries[0]?.at ?? now) + 60000 - now) : 0;
      const wait = Math.max(windowWait, this.cooldownUntil - now, 1);
      onWait?.(Math.min(wait, deadline - now));
      await waitInSegments(wait, deadline);
    }
  }
}
// Shared by every client/run in this process; individual clients must not each
// claim the full account limit. The observed account Fetch limit was 150 URLs/min.
const fetchQuota = new RollingQuota(READ_RETRY_POLICY.fetchUrlsPerMinute);
const searchQuota = new RollingQuota(READ_RETRY_POLICY.searchesPerMinute);
export function readRetryDelaySeconds(attempt: number, retryAfterSeconds: number | null): number {
  return Math.max(READ_RETRY_POLICY.backoffSeconds[Math.min(attempt, 2)], retryAfterSeconds ?? 0);
}

function retryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : null;
}

/** Thin REST adapter. Paid creation POSTs are sent once; orchestration owns recovery. */
export class TinyFishClient {
  private readonly key: string;
  private readonly trackedDatasets = new Map<string, UsageEvent>();
  private readonly trackedAgents = new Map<string, UsageEvent>();
  private readonly trackedBrowsers = new Map<string, UsageEvent>();

  constructor(private readonly audit: Audit = () => {}) {
    this.key = process.env.TINYFISH_API_KEY?.trim() ?? '';
    if (!this.key) throw new TinyFishError('Set TINYFISH_API_KEY on the server to run live research.', 401, 'MISSING_API_KEY');
  }

  private safeMessage(message: string): string { return message.replaceAll(this.key, '[redacted]').slice(0, 700); }

  private begin(endpoint: Endpoint, operation: string, units: number, detail: string): UsageEvent {
    const event: UsageEvent = { id: randomUUID(), endpoint, operation, startedAt: new Date().toISOString(), status: 'running', units, detail };
    this.audit(event);
    return event;
  }

  private finish(event: UsageEvent, status: 'success' | 'failed', detail?: string): void {
    this.audit({ ...event, status, detail: detail ?? event.detail, finishedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(event.startedAt) });
  }

  private stampResource(event: UsageEvent, resourceId: string): UsageEvent {
    const stamped = { ...event, resourceId };
    if (event.resourceId !== resourceId) this.audit(stamped);
    return stamped;
  }

  private async request<T>(url: string, method = 'GET', body?: unknown, timeoutMs = 65000, event?: UsageEvent): Promise<T> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
      throw new TinyFishError('Unsupported TinyFish API host.', 400, 'INVALID_HOST');
    }
    const isSearch = method === 'GET' && parsed.hostname === 'api.search.tinyfish.ai';
    const isFetch = method === 'POST' && parsed.hostname === 'api.fetch.tinyfish.ai';
    const retryableRead = isSearch || isFetch;
    const paidCreation = method === 'POST' && !retryableRead;
    const quota = isFetch ? fetchQuota : isSearch ? searchQuota : null;
    const units = isFetch && body && typeof body === 'object' && 'urls' in body && Array.isArray(body.urls) ? body.urls.length : 1;
    const deadline = Date.now() + (retryableRead ? READ_RETRY_POLICY.maxElapsedMs : timeoutMs);
    let retryAttempt = 0;
    const onWait = (ms: number) => { if (event) this.audit({ ...event, detail: `${event.detail}. Waiting ${Math.ceil(ms / 1000)}s for the shared read quota.` }); };
    try {
      while (true) {
        if (quota) await quota.take(units, deadline, onWait);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new TinyFishError('Read-only provider retry budget exhausted after six minutes.', 429, 'RATE_LIMIT_EXCEEDED');
        const response = await fetch(url, {
        method,
        headers: { 'X-API-Key': this.key, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))),
        // Redirects from API hosts must never carry an API key to another origin.
        redirect: 'error',
        });
        const text = response.status === 204 ? '' : await response.text();
        let data: any;
        try { data = text ? JSON.parse(text) : null; } catch {
          if (response.status === 429 && retryableRead) data = { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'TinyFish read quota was exceeded.' } };
          else throw new TinyFishError('TinyFish returned a non-JSON response.', response.status, 'INVALID_RESPONSE', null, null, paidCreation);
        }
        if (!response.ok) {
        const error = data?.error;
        const message = typeof error?.message === 'string' ? this.safeMessage(error.message) : `TinyFish request returned HTTP ${response.status}.`;
        const candidateHelp = error?.details?.wallet_url ?? error?.help_url ?? (response.status === 402 ? `${AGENT}/wallet` : null);
        const helpUrl = typeof candidateHelp === 'string' && candidateHelp.startsWith('https://agent.tinyfish.ai/') ? candidateHelp : null;
        const retry = retryAfterSeconds(response.headers.get('Retry-After'));
        const handle = data?.run_id ?? data?.id ?? error?.details?.run_id ?? error?.details?.dataset_id ?? error?.details?.session_id;
        const resourceId = typeof handle === 'string' && handle.length <= 200 ? handle : null;
          if (response.status === 429 && retryableRead && retryAttempt < READ_RETRY_POLICY.maxRetries) {
            const seconds = readRetryDelaySeconds(retryAttempt++, retry);
            if (Date.now() + seconds * 1000 >= deadline) throw new TinyFishError(message, 429, 'RATE_LIMIT_EXCEEDED', helpUrl, retry);
            quota?.pause(seconds * 1000);
            onWait(seconds * 1000);
            await waitInSegments(seconds * 1000, deadline);
            continue;
          }
          throw new TinyFishError(message, response.status, typeof error?.code === 'string' ? error.code : `HTTP_${response.status}`, helpUrl, retry, paidCreation && response.status >= 500, resourceId);
        }
        return data as T;
      }
    } catch (error) {
      if (event) this.finish({ ...event, ...(error instanceof TinyFishError && error.resourceId ? { resourceId: error.resourceId } : {}) }, 'failed');
      if (error instanceof TinyFishError) throw error;
      const message = error instanceof Error ? this.safeMessage(error.message) : 'Unknown provider transport failure';
      throw new TinyFishError(`TinyFish transport failed: ${message}${paidCreation ? ' The request may have been accepted; do not automatically submit it again.' : ''}`, 502, 'TRANSPORT_ERROR', null, null, paidCreation);
    }
  }

  async createDataset(spec: DatasetSpec, targetRows: number): Promise<TinyDataset> {
    if (!Number.isInteger(targetRows) || targetRows < 1 || targetRows > 250) throw new TinyFishError('TinySet target rows must be from 1 to 250.', 400, 'INVALID_INPUT');
    if (!spec.columns.length || spec.columns.length > 10 || spec.columns.filter(c => c.is_primary_key).length !== 1) throw new TinyFishError('TinySet needs 1–10 columns and exactly one primary key.', 400, 'INVALID_INPUT');
    let event = this.begin('TinySet', 'create-dataset', targetRows, `Discover up to ${targetRows} recent comparable companies from live pages`);
    const dataset = await this.request<TinyDataset>(`${AGENT}/v1/datasets`, 'POST', { spec, target_rows: targetRows }, 65000, event);
    if (!dataset?.id) { this.finish(event, 'failed'); throw new TinyFishError('TinySet did not return a dataset ID; check the dashboard before submitting again.', 502, 'INVALID_RESPONSE', null, null, true); }
    event = this.stampResource(event, dataset.id);
    this.trackedDatasets.set(dataset.id, event);
    if (['ready', 'failed', 'cancelled'].includes(dataset.status)) {
      this.finish(event, dataset.status === 'ready' ? 'success' : 'failed', `TinySet ${dataset.status}; ${dataset.row_count ?? 0} rows discovered`);
      this.trackedDatasets.delete(dataset.id);
    }
    return dataset;
  }

  async getDataset(id: string): Promise<TinyDataset> {
    const dataset = await this.request<TinyDataset>(`${AGENT}/v1/datasets/${encodeURIComponent(id)}`);
    const event = this.trackedDatasets.get(id);
    if (event && ['ready', 'failed', 'cancelled'].includes(dataset.status)) {
      this.finish(event, dataset.status === 'ready' ? 'success' : 'failed', `TinySet ${dataset.status}; ${dataset.row_count} rows discovered`);
      this.trackedDatasets.delete(id);
    }
    return dataset;
  }

  /** Resume audit for a known existing dataset without starting another paid run. */
  trackDataset(id: string, event: UsageEvent): void { this.trackedDatasets.set(id, this.stampResource(event, id)); }

  /** Resume a persisted Agent handle and its original audit event. */
  trackAgent(id: string, event: UsageEvent): void { this.trackedAgents.set(id, this.stampResource(event, id)); }

  async getRows(id: string, after?: string): Promise<TinyDatasetPage> {
    const query = new URLSearchParams({ limit: '500' });
    if (after) query.set('after', after);
    return this.request<TinyDatasetPage>(`${AGENT}/v1/datasets/${encodeURIComponent(id)}/rows?${query}`);
  }

  async search(query: string, options: { afterDate?: string; beforeDate?: string } = {}): Promise<TinySearchResponse> {
    const params = new URLSearchParams({ query, language: 'en', purpose: 'Find primary funding announcements, investor mandates and founder intake routes for Funding Radar.' });
    if (options.afterDate) params.set('after_date', options.afterDate);
    if (options.beforeDate) params.set('before_date', options.beforeDate);
    const event = this.begin('Search', 'search', 1, query.slice(0, 200));
    const result = await this.request<TinySearchResponse>(`https://api.search.tinyfish.ai?${params}`, 'GET', undefined, 65000, event);
    this.finish(event, 'success', `${query.slice(0, 150)} · ${result.results?.length ?? 0} source candidates`);
    return result;
  }

  async fetchPages(urls: string[], purpose = 'Verify exact funding, investor, partner and contact facts against live source text.'): Promise<TinyFetchResponse> {
    if (!urls.length || urls.length > 10) throw new TinyFishError('Fetch accepts between 1 and 10 URLs per call.', 400, 'INVALID_INPUT');
    await Promise.all(urls.map(url => assertPublicUrl(url)));
    const event = this.begin('Fetch', 'fetch-pages', urls.length, `Read ${urls.length} live source pages`);
    const result = await this.request<TinyFetchResponse>('https://api.fetch.tinyfish.ai', 'POST', { urls, format: 'markdown', links: true, iframe_links: true, ttl: 0, per_url_timeout_ms: 45000, purpose }, 65000, event);
    this.finish(event, result.results?.length ? 'success' : 'failed', `${result.results?.length ?? 0}/${urls.length} pages read; ${result.errors?.length ?? 0} failed`);
    return result;
  }

  async startAgent(url: string, goal: string, maxDurationSeconds = 120): Promise<{ run_id: string; error?: TinyAgentRun['error'] }> {
    await assertPublicUrl(url);
    let event = this.begin('Agent', 'public-evidence-extraction', 1, `Extract source-backed public evidence at ${new URL(url).hostname}`);
    const result = await this.request<{ run_id: string; error?: TinyAgentRun['error'] }>(`${AGENT}/v1/automation/run-async`, 'POST', { url, goal, agent_config: { max_duration_seconds: maxDurationSeconds } }, 65000, event);
    if (!result.run_id) { this.finish(event, 'failed'); throw new TinyFishError(this.safeMessage(result.error?.message ?? 'Agent did not return a run ID. Check the dashboard before retrying.'), 502, result.error?.code ?? 'INVALID_RESPONSE', null, null, !result.error); }
    // A returned handle is authoritative even if a response also carries an
    // error. Persist it and poll its terminal state instead of paying again.
    event = this.stampResource(event, result.run_id);
    this.trackedAgents.set(result.run_id, event);
    return result;
  }

  async getAgent(id: string): Promise<TinyAgentRun> {
    const run = await this.request<TinyAgentRun>(`${AGENT}/v1/runs/${encodeURIComponent(id)}?screenshots=none&html=none`);
    const event = this.trackedAgents.get(id);
    if (event && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) {
      this.finish({ ...event, units: run.num_of_steps ?? 1 }, run.status === 'COMPLETED' ? 'success' : 'failed', `Public evidence extraction ${run.status.toLowerCase()}${run.num_of_steps ? ` in ${run.num_of_steps} browser steps` : ''}`);
      this.trackedAgents.delete(id);
    }
    return run;
  }

  async createBrowser(url: string): Promise<TinyBrowserSession> {
    await assertPublicUrl(url);
    let event = this.begin('Browser', 'verify-intake', 1, `Inspect the rendered public founder intake at ${new URL(url).hostname}`);
    const session = await this.request<TinyBrowserSession>('https://api.browser.tinyfish.ai', 'POST', { url, timeout_seconds: 120 }, 65000, event);
    if (!session.session_id || !session.cdp_url || !session.base_url) { this.finish(event, 'failed'); throw new TinyFishError('Browser returned an incomplete session; no replacement was started.', 502, 'INVALID_RESPONSE', null, null, true); }
    event = this.stampResource(event, session.session_id);
    this.trackedBrowsers.set(session.session_id, event);
    return session;
  }

  /** Allocate ≠ inspect: only the caller's completed page read ends this audit. */
  finishBrowser(id: string, success: boolean, detail: string): void {
    const event = this.trackedBrowsers.get(id);
    if (event) { this.finish(event, success ? 'success' : 'failed', detail); this.trackedBrowsers.delete(id); }
  }

  async closeBrowser(id: string): Promise<void> {
    await this.request(`https://api.browser.tinyfish.ai/${encodeURIComponent(id)}`, 'DELETE', undefined, 65000);
  }
  async wallet(): Promise<TinyWallet> { return this.request<TinyWallet>(`${AGENT}/v1/wallet`); }
}

/** Backfill only unambiguous legacy audit rows. Never infer a missing paid run. */
export function migrateUsageHandles(usage: UsageEvent[], checkpoint: { agents: Record<string, string> }, datasetId?: string | null): boolean {
  let changed = false;
  const datasets = usage.filter(event => event.endpoint === 'TinySet' && event.operation === 'create-dataset');
  if (datasetId && datasets.length === 1 && !datasets[0].resourceId) { datasets[0].resourceId = datasetId; changed = true; }
  const agents = usage.filter(event => event.endpoint === 'Agent' && (event.status === 'success' || event.status === 'running')).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const handles = Object.values(checkpoint.agents);
  // Failed creation could leave an event without a resource; unequal counts
  // mean chronological alignment is unsafe and all unknown rows stay unknown.
  const failed = usage.some(event => event.endpoint === 'Agent' && event.status === 'failed');
  if (!failed && agents.length === handles.length && new Set(handles).size === handles.length) {
    const agrees = agents.every((event, index) => !event.resourceId || event.resourceId === handles[index]);
    if (agrees) for (const [index, event] of agents.entries()) if (!event.resourceId) { event.resourceId = handles[index]; changed = true; }
  }
  return changed;
}
