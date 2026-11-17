export const STAGES = ['pre-seed', 'seed', 'series-a', 'series-b', 'growth'] as const;
export type StartupStage = typeof STAGES[number];
export interface StartupInput {
  description: string;
  stage: StartupStage;
  country: string;
  targetChequeUsd: number | null;
  lookbackMonths: 12 | 18;
  maxCompanies: number;
}
export type Endpoint = 'TinySet' | 'Search' | 'Fetch' | 'Agent' | 'Browser';
export interface UsageEvent {
  id: string;
  endpoint: Endpoint;
  operation: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'failed';
  units: number;
  detail: string;
  durationMs?: number;
  resourceId?: string;
}
export interface Evidence {
  id: string;
  url: string;
  title: string;
  retrievedAt: string;
  excerpt: string;
  kind: 'investment' | 'mandate' | 'partner' | 'contact' | 'company';
  verification: 'text-match' | 'agent-confirmed' | 'browser-confirmed';
  contentHash: string;
}
export interface InvestorBacking {
  investorName: string;
  evidenceId: string;
  leadPartner: string | null;
  partnerEvidenceId: string | null;
  isLead: boolean;
  leadScope?: 'round' | 'company';
}
export interface ComparableCompany {
  id: string;
  name: string;
  description: string;
  country: string;
  website: string | null;
  roundDate: string;
  roundStage: string;
  roundAmount: string | null;
  investors: InvestorBacking[];
  similarity: number;
  similarityReason: string;
  similarityMethod: 'sentence-embedding' | 'lexical';
  sourceUrl: string;
  evidenceId: string;
}
export interface SourcedFact<T> { value: T | null; evidenceIds: string[]; basis?: 'declared' | 'observed'; exclusive?: boolean; }
export interface ContactRoute {
  type: 'application' | 'open-intake' | 'warm-intro';
  label: string;
  url: string | null;
  detail: string;
  evidenceIds: string[];
  verified: boolean;
  requiresLogin?: boolean;
  verificationLevel?: 'destination' | 'form';
}
export interface ScorePart { key: string; label: string; points: number; maxPoints: number; reason: string; }
export interface RankedInvestor {
  id: string;
  name: string;
  rank: number;
  score: number;
  website: string | null;
  explanation: string;
  comparables: string[];
  cheque: SourcedFact<{ minUsd: number | null; maxUsd: number | null; label: string; currency?: string | null; min?: number; max?: number }>;
  stages: SourcedFact<string[]>;
  geographies: SourcedFact<string[]>;
  leadPartners: Array<{ name: string; companyId: string; evidenceId: string; scope?: 'round' | 'company' }>;
  contacts: ContactRoute[];
  breakdown: ScorePart[];
  caveats: string[];
  eligibility?: 'supported' | 'unconfirmed' | 'ineligible';
}
export interface ResearchResult {
  schemaVersion: '1.0';
  startup: StartupInput;
  asOf: string;
  window: { from: string; to: string; months: number };
  datasetId: string;
  companies: ComparableCompany[];
  investors: RankedInvestor[];
  evidence: Evidence[];
  rejected: Array<{ company: string; reason: string; sourceUrl: string | null }>;
  warnings: string[];
  coverage: { requested: number; discovered: number; verified: number; minimumRequired: 10; meetsMinimum: boolean; exhaustive: false };
  rankingMethod: { version: string; weights: Record<string, number>; similarityModel: string; description: string };
  usage: UsageEvent[];
}
export type RunStatus = 'queued' | 'discovering' | 'verifying' | 'enriching' | 'ranking' | 'complete' | 'partial' | 'failed';
export interface ResearchRun {
  id: string;
  input: StartupInput;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  progress: { phase: string; current: number; total: number; message: string };
  datasetId: string | null;
  usage: UsageEvent[];
  result: ResearchResult | null;
  error: string | null;
  demo?: boolean;
}
export const DEMO_STARTUPS: Array<StartupInput & { id: string; title: string; subtitle: string }> = [
  { id: 'support-ai', title: 'AI customer support', subtitle: 'Seed · United States', description: 'AI agents that resolve customer support tickets for software companies', stage: 'seed', country: 'United States', targetChequeUsd: 1000000, lookbackMonths: 18, maxCompanies: 24 },
  { id: 'india-fintech', title: 'B2B payments', subtitle: 'Seed · India', description: 'B2B payments and accounts payable automation for small businesses', stage: 'seed', country: 'India', targetChequeUsd: 500000, lookbackMonths: 18, maxCompanies: 24 },
  { id: 'battery-climate', title: 'Battery circularity', subtitle: 'Series A · Germany', description: 'Battery recycling and recovery of critical materials from lithium ion batteries', stage: 'series-a', country: 'Germany', targetChequeUsd: 5000000, lookbackMonths: 18, maxCompanies: 24 }
];
