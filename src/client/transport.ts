import type { ResearchRun } from '../shared/types';

type ReplayManifest = { generatedAt: string; repositoryUrl?: string; runIds: string[] };
const replayOnly = import.meta.env.VITE_RADAR_REPLAY === 'true';
const base = import.meta.env.BASE_URL;
let replayData: Promise<{ manifest: ReplayManifest; runs: ResearchRun[] }> | undefined;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function loadReplay() {
  replayData ??= (async () => {
    const response = await fetch(`${base}replay/manifest.json`);
    if (!response.ok) throw new Error('The saved reviewer research could not be loaded.');
    const manifest = await response.json() as ReplayManifest;
    const runs = await Promise.all(manifest.runIds.map(async id => {
      const source = await fetch(`${base}replay/${encodeURIComponent(id)}.json`);
      if (!source.ok) throw new Error('A saved research example could not be loaded.');
      return source.json() as Promise<ResearchRun>;
    }));
    return { manifest, runs };
  })();
  return replayData;
}

/** The public review build reads dated artifacts. Normal builds use the live API. */
export async function radarFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!replayOnly) return fetch(input, init);
  const route = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : new URL(input.url).pathname + new URL(input.url).search;
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return json({ error: 'This public demo displays saved research. Run the server app to research a new startup.' }, 405);
  try {
    const { manifest, runs } = await loadReplay();
    if (route === '/api/config') return json({ configured: true, allowLive: false, requiresAuth: false, embeddings: true, replayOnly: true, replayAsOf: runs[0]?.result?.asOf, repositoryUrl: manifest.repositoryUrl });
    if (route === '/api/runs' || route === '/api/demos') return json({ runs });
    const match = route.match(/^\/api\/runs\/([^/?]+)(?:\/export\?format=(json|csv))?$/);
    const run = match && runs.find(item => item.id === decodeURIComponent(match[1]));
    if (!run) return json({ error: 'Saved research run not found.' }, 404);
    if (match?.[2] === 'json') return json(run.result);
    if (match?.[2] === 'csv') return fetch(`${base}replay/${encodeURIComponent(run.id)}.csv`);
    return json(run);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Reviewer research could not be loaded.' }, 503);
  }
}
