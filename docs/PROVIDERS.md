# Verified TinyFish integration

Contracts checked against the official documentation on **17 November 2026**. The implementation is in `src/server/tinyfish.ts`; the REST key stays in the server environment.

| Product | Request | Response and use in Funding Radar |
| --- | --- | --- |
| TinySet | `POST https://agent.tinyfish.ai/v1/datasets` with `{spec, target_rows}` | Returns `{id, status, row_count, run}`. Collects distinct recently funded comparable companies and the named investors in each financing. |
| TinySet status | `GET https://agent.tinyfish.ai/v1/datasets/{id}` | Poll until `ready`, `failed`, or `cancelled`. Existing IDs are persisted; resuming does not create another dataset. |
| TinySet rows | `GET https://agent.tinyfish.ai/v1/datasets/{id}/rows?limit=500&after={cursor}` | `{rows:[{_id,data}], next_cursor, truncated}`. Read all available pages. |
| Search | `GET https://api.search.tinyfish.ai?query=...` | `{results:[{title,url,snippet,date?}]}`. Finds official investor mandates and founder intake pages. Search snippets do not prove an investment. |
| Fetch | `POST https://api.fetch.tinyfish.ai` | `{results:[{url,final_url,title,text,published_date,links}],errors}`. Independently reads funding announcements and investor sources with `ttl:0`. |
| Agent | `POST https://agent.tinyfish.ai/v1/automation/run-async` | `{run_id,error}`. Navigates public investor pages or resolves an ambiguous funding announcement. Every extracted fact must still match fetched source text. |
| Agent status | `GET https://agent.tinyfish.ai/v1/runs/{id}?screenshots=none&html=none` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, or `CANCELLED`; completed result is in `result`. Persisted Agent IDs are polled again after a restart. |
| Browser | `POST https://api.browser.tinyfish.ai` with `{url,timeout_seconds:120}` | `{session_id,cdp_url,base_url}`. Playwright connects to the returned CDP URL to inspect rendered founder applications and their actual field labels. |
| Browser cleanup | `DELETE https://api.browser.tinyfish.ai/{session_id}` | `204`. Explicitly closes the session after inspection; session allocation alone does not count as a completed inspection. |

All requests use `X-API-Key`. TinySet requires a **personal** key; organization keys are refused.

## TinySet schema and scope

TinySet supports **1–10 columns**, including exactly one primary key, and **1–250 rows per population**. Funding Radar uses ten columns: company identity, product/customer description, official website, country, financing date, financing stage, financing amount, participating investors, announcement URL and excerpt.

The documented rows contract does not expose per-cell citation metadata. The explicit announcement URL and excerpt are therefore required. Fetch checks the live page independently before a company or investor is eligible for ranking.

The requested calendar window is computed from each research run's timestamp. Financing dates are distinguished from page publication/update dates. A finite row target is **bounded discovery**, not proof that every matching company on the web was found. Fewer than ten accepted companies remains a partial run.

Typical TinySet runtime is 5–20 minutes. Up to three dataset runs may be active per account. The app keeps progress and remote IDs so a long run can be resumed.

## Calls and spend

- Three demo inputs request up to 24 companies each. At the account's observed TinySet rate of **$0.10 per row**, this is up to **$7.20** for 72 rows, plus enrichment.
- Each research run limits the investor profile shortlist, Agent repairs and rendered contact inspections. Relevant limits are configurable in `.env.example`.
- Provider status polls and cleanup calls are excluded from meaningful endpoint usage. Audit events are updated under the same event ID rather than accumulated as duplicate calls.
- Paid creation requests are sent once. A transport failure may still have started work; preserve a returned resource ID and inspect the dashboard before considering another creation request.
- Search and Fetch share process-wide rolling quotas of 24 queries and 100 fetched URLs per minute. The live account returned a Fetch limit of 150 URLs per minute during concurrent demo enrichment, so the application leaves headroom. Only these read-only requests retry HTTP 429: up to three retries with 20/40/60-second minimum backoff, honoring `Retry-After`, with a six-minute total budget. Waiting and retries update the existing audit event; creation requests are never retried by this mechanism.
- Missing public cheque sizes, deal partners and contact eligibility remain undisclosed. A financing's total round amount is never an investor cheque estimate.

Rates above were observed for this account on the verification date; another account or later run may use different rates. The wallet endpoint provides the account's current contract.

## Real rendered application verification

On **17 November 2026 at 11:14 UTC**, TinyBrowser inspected the [firstminute capital funding application](https://form.typeform.com/to/pCFphSxu), linked by the firm's [official About page](https://www.firstminute.capital/about).

The rendered form's title identified inbound dealflow. It displayed a funding-stage question, pre-seed/seed eligibility text, and a company-name field. Only the welcome screen's **Start** button was clicked. No field was answered and no application was submitted. Explicit provider cleanup succeeded.

The private diagnostic record is `data/private/browser-check-firstminute.json`. Its provenance includes the official referring page, inspection timestamp, content hash and one completed Browser audit event. It is a real contact-inspection check, separate from the three complete startup demos.

An earlier 1984 Ventures check redirected to login. That diagnostic is marked **invalid intake evidence** and cannot support a claim of anonymous open intake. When the official investor source explicitly links the funding application, a reached login destination can still be retained with `requiresLogin:true` and `verificationLevel:"destination"`. Only an actually inspected application form receives `verificationLevel:"form"`.

## Access and browser boundaries

Browser inspection uses an isolated public session. It does not attach a saved user profile, consume vault credentials, log in, email or submit forms. Navigation is limited to the original investor host/subdomains and the permitted public form providers. Private addresses and non-HTTPS source URLs are refused. Provider API host redirects are disabled so the REST key cannot be forwarded to another origin.

## Official references

- [TinySet reference](https://docs.tinyfish.ai/tinyset/reference)
- [TinySearch reference](https://docs.tinyfish.ai/tinysearch/reference)
- [TinyFetch reference](https://docs.tinyfish.ai/tinyfetch/reference)
- [TinyAgent reference](https://docs.tinyfish.ai/tinyagent/api/agent)
- [TinyAgent run lifecycle](https://docs.tinyfish.ai/tinyagent/api/runs)
- [TinyBrowser reference](https://docs.tinyfish.ai/tinybrowser/reference)
- [Authentication](https://docs.tinyfish.ai/authentication)
