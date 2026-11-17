# Funding Radar

**Find investors through the companies they actually funded.** A startup description becomes a TinySet dataset, independently checked funding evidence, and a ranked investor shortlist with JSON and CSV exports.

Built for the TinyFish **Funding Radar** launch bounty. No canned investor database, seeded recommendations, paid financial database, or hardcoded sector pipelines.

## Run

Requires Node.js 22.13+ and a **personal** TinyFish API key with TinySet enabled. An organization key cannot use TinySet.

[Open the reviewer demo](https://sarvesh5273.github.io/funding-radar/) · [Watch the walkthrough](https://sarvesh5273.github.io/funding-radar/demo.mp4) · [Source repository](https://github.com/Sarvesh5273/funding-radar). The public reviewer build displays three genuine, dated research snapshots with evidence and downloads. Run the server app below to research a new startup.

```sh
npm ci
cp .env.example .env
# Set TINYFISH_API_KEY inside .env. Never commit it.
npm run dev
```

Open **http://127.0.0.1:3000**. Describe the actual product and customer, select stage and country, optionally enter a target investor cheque, then run research.

TinySet typically takes **5–20 minutes**. Progress is saved to disk; closing a tab does not stop research. If a provider job exceeds the wait budget, its dataset/run IDs are retained. Resume the same research to check them again instead of starting another paid job.

The first comparison downloads a quantized `all-MiniLM-L6-v2` sentence model. It runs locally with no extra model API key. If unavailable, the output explicitly labels a lexical fallback.

## How TinyFish does real work

| Product | Job in this build | Proof in output |
|---|---|---|
| **TinySet** | Finds up to 24 distinct comparable companies, their product/customer, country, recent round and participating investors. A dynamic ten-column spec is built from the input and exact calendar dates. | Dataset ID, dated raw rows in private research logs, discovered/verified coverage |
| **Search** | Finds each shortlisted investor's official mandate and public founder intake. | Search operation ledger and fetched source URLs |
| **Fetch** | Independently reads the funding announcement and checks company identity, event date, stage, amount and named investment relationships. It also validates investor profile quotes. | Source URL, short passage, retrieval timestamp, SHA-256 |
| **Agent** | Resolves ambiguous source-specific funding announcements and navigates official investor pages for stated cheque, stage, deal-lead and pitch information. | Preserved run ID, completed operation ledger, source-matched facts |
| **Browser** | Opens an actual advertised founder application through TinyBrowser/CDP to inspect visible startup fields, login barriers, or an embedded form. Conditional: it is used only when a discovered route needs rendered verification. | Browser-confirmed contact evidence, observed labels, cleanup-confirmed ledger |

Endpoint counts reflect successful actual work, not API polling or allocated browser sessions. TinySet is mandatory; its treatment in the bounty's endpoint tier is left to the judges. See [provider contracts](docs/PROVIDERS.md).

## Evidence policy

Only companies meeting both the product similarity threshold and investment proof gate count as comparables. Unknown fields remain unknown.

- Funding window: exact **12 or 18 calendar months**, inclusive, ending on the research date.
- Financing must be completed equity/accelerator investment. Debt facilities, acquisitions, grant-only awards, future rounds and stale deals are excluded.
- An investor must be named as participating in that particular company's particular round. Customer, sponsor, portfolio and older-round mentions do not prove a match.
- Round stage and amount are checked against the source. A round total is never used as investor cheque size.
- A person being quoted or sitting on a board does not establish that they led the deal.
- Application destinations are checked against public content. A published investor intake referral can be shown with its evidence and a visible destination/form verification status, including a login requirement. A **suggested portfolio-founder intro route** does not claim an available intro or personal relationship.
- Published cheque ranges retain their original currency. USD cheque-fit points require source-established USD values; GBP/EUR/INR ranges and ambiguous dollar ranges are displayed without a guessed conversion.
- Fewer than 10 proved comparables produces a **partial result** and an explicit failed bounty gate. The tool never pads sparse markets.
- Research is finite and does **not** claim a complete census of all funded companies.

Automatic source checks and model similarities assist research; read the cited announcement before outreach. Scores measure observed fit, not funding probability. Investor mandates can change and competing portfolio companies may create conflicts.

## Reproducible ranking

| Signal | Maximum | Rule |
|---|---:|---|
| Product/customer fit | 40 | Best verified comparable's locally computed sentence similarity |
| Stage | 20 | 20 at exact stage, 8 one stage away, 0 otherwise/unknown; published mandate takes precedence over inferred deal activity |
| Country/market | 15 | A published covering mandate, or verified local activity when no mandate is available; published restrictions remain visible |
| Cheque | 10 | USD target fits a source-checked USD investor cheque range; no USD conversion or currency assumption |
| Repeated comparable investments | 10 | 5 for second distinct company, 10 for three or more |
| Recency | 5 | Newest verified comparable round, decreasing with age within the window |

Every investor exposes the score terms, source links, closest analogue and caveats. Investors with evidence supporting the requested stage and country rank first. Candidates whose eligibility needs confirmation follow. The weighted score orders investors within each group, with alphabetical tie-breaking. There is no brand/popularity factor.

## API and exports

All outputs use stable schema `1.0`. The browser and API use the same engine.

```sh
curl -X POST http://127.0.0.1:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"description":"AI agents that resolve customer support tickets for software companies","stage":"seed","country":"United States","targetChequeUsd":1000000,"lookbackMonths":18,"maxCompanies":24}'
```

The `202` response includes the research `id`. Poll `GET /api/runs/{id}`. On completion:

```sh
curl http://127.0.0.1:3000/api/runs/RUN_ID/export?format=json
curl http://127.0.0.1:3000/api/runs/RUN_ID/export?format=csv
```

| Route | Purpose |
|---|---|
| `GET /api/health` | Server health and key configuration status |
| `GET /api/config` | Available inputs and live-research configuration |
| `GET /api/demos` | Saved genuine research, with original timestamps |
| `POST /api/runs` | Start a new live TinySet research job |
| `GET /api/runs` | List private/saved research jobs |
| `GET /api/runs/{id}` | Read status, progress and result |
| `POST /api/runs/{id}/resume` | Resume the original remote dataset/Agent jobs |
| `GET /api/runs/{id}/export?format=json` | Full reusable result, proof ledger, score breakdown |
| `GET /api/runs/{id}/export?format=csv` | Investor outreach table; formula injection neutralized |
| `GET /api/openapi.json` | Machine-readable API contract |

For protected deployments add `Authorization: Bearer YOUR_RADAR_ACCESS_TOKEN`. The UI keeps this access token in memory. The TinyFish key stays on the server.

## Three contrasting demos

The example inputs cover AI customer support in the United States, B2B payments in India, and battery recycling in Germany. The same code/spec/ranking logic processes each. Saved results, when present in `data/public-runs/`, are **real dated research snapshots**, not fresh runs or fabricated fixtures. The UI labels replay accordingly.

```sh
# Run all three examples against the running local API; this creates paid live jobs.
npm run demo
```

See [demo walkthrough](docs/DEMO.md), [submission package](docs/SUBMISSION.md) and [adversarial review](docs/REVIEW.md). `scripts/start-datasets.ts` is the one-time build validation helper; never rerun it as a retry for existing datasets.

## Verify and deploy

```sh
npm test
npm run build
NODE_ENV=production npm start
```

For Render/Railway/any Node host: build command `npm ci --include=dev && npm run build`; start command `npm start`; set `NODE_ENV=production`, `TINYFISH_API_KEY`, `RADAR_ACCESS_TOKEN` and `HOST=0.0.0.0`. Mount a persistent disk for `RADAR_DATA_DIR`, or research progress will be lost when the instance is replaced. Use one process with disk storage. Horizontal deployment needs a shared durable job store and worker queue.

A public reviewer demo can set `RADAR_ALLOW_LIVE=false` to expose genuine saved examples without permitting paid research. With no access token, production live jobs are disabled automatically. Browser/Agent concurrency is bounded to two; new research is limited to three active jobs and eight new jobs per hour.

`npm run build:reviewer` also creates a standalone review site in `dist/reviewer`, using only the public dated snapshots. It labels replay, disables new research, and preserves evidence links and JSON/CSV downloads. The included GitHub Pages workflow publishes this site without needing a TinyFish key. The full Node app/API handles new startup descriptions.

```sh
docker build -t funding-radar .
docker run --env-file .env -e NODE_ENV=production -p 3000:3000 -v radar-data:/app/data/private funding-radar
```

Costs use your TinyFish wallet. The account's live quoted TinySet price during build validation was $0.10 per row, so a 24-row set was $2.40 before Search/Fetch/Agent/Browser work. Check your account for current rates. Paid POSTs are never automatically repeated after ambiguous transport failures.

## Project map

`src/server/spec.ts` builds the dynamic TinySet spec. `verification.ts` binds funding facts to a fetched announcement. `similarity.ts` compares product/customer descriptions locally. `enrichment.ts` validates official investor facts. `ranking.ts` scores proven edges. `pipeline.ts` coordinates durable progress and conditional live verification. `contact-browser.ts` inspects application forms without submitting. `src/client/` is the responsive reviewer interface.

## Submission boundary

The rulebook requires a working build link, a LinkedIn post tagging TinyFish, and a Discord showcase share. Drafts are included, but they are not automatically posted or submitted. Public posts and the final claim are final human-reviewed actions.
