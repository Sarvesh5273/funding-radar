# Completed live demos and recording guide

The three examples are genuine TinySet research runs started on November 17, 2026. Final source audits corrected parsed facts using fetched primary evidence; they did not replace the datasets or create new paid Agent runs. Saved reports preserve the original research date and show source retrieval times separately.

## Requests used

1. **United States — customer support software**
   - Description: AI agents that resolve customer support tickets for software companies.
   - Stage: seed.
   - Country: United States.
   - Target cheque: $1,000,000.
2. **India — financial infrastructure**
   - Description: B2B payments and accounts payable automation for small businesses.
   - Stage: seed.
   - Country: India.
   - Target cheque: $500,000.
3. **Germany — battery circularity**
   - Description: Battery recycling and recovery of critical materials from lithium ion batteries.
   - Stage: Series A.
   - Country: Germany.
   - Target cheque: $5,000,000.

All three use the inclusive May 17, 2025–November 17, 2026 financing window and request 24 candidates. Target cheques are founder inputs. They are not sourced investor facts, and non-USD ranges are not converted to satisfy them.

## Record each request

1. Show the startup input and the report's exact 12- or 18-month date window.
2. Start research and show that TinySet creates or resumes a live dataset.
3. Show the live progress and evidence verification work.
4. Open the highest-ranked investor and explain its score contributions.
5. Open two supporting company funding sources and identify the company, round, and investor in the source.
6. Show how cheque range, lead partner, and contact route are sourced; show an unknown value honestly.
7. Show the comparable-company count and any rejected rows.
8. Download JSON and CSV and open the machine-readable records.
9. Repeat using another product and country.

## Results log

The JSON files contain the saved run envelope and full `result`; CSV files contain the investor outreach table. The final automated and source-replay result is in [live-demo-validation.json](live-demo-validation.json).

| Input | Observation time | Dataset ID | Accepted companies | Proven investment edges | Ranked investors | JSON/CSV artifact | Review result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US AI support | Nov 17, 2026, 11:03:37 UTC (original research) | `1f594b0a-ea09-4c0e-b31a-0bdfb7b80485` | 14 | 38 | 12 | [JSON](../data/public-runs/95a243df-f62f-4f1c-9957-a833f0bfbef4.json) / [CSV](../data/public-runs/95a243df-f62f-4f1c-9957-a833f0bfbef4.csv) | Passed final structural + cached-source gate |
| India B2B payments | Nov 17, 2026, 11:03:39 UTC (original research) | `7d421eac-4734-4705-920c-e83d07535300` | 12 | 34 | 12 | [JSON](../data/public-runs/730e8414-6b9e-4ff6-b4d2-b8ec851dadcc.json) / [CSV](../data/public-runs/730e8414-6b9e-4ff6-b4d2-b8ec851dadcc.csv) | Passed final structural + cached-source gate |
| Germany battery recycling | Nov 17, 2026, 11:03:39 UTC (original research) | `14ad482d-98e3-48c1-aab7-c086df39937f` | 10 | 36 | 12 | [JSON](../data/public-runs/6220057b-e49c-40a4-8db4-86a060bc07be.json) / [CSV](../data/public-runs/6220057b-e49c-40a4-8db4-86a060bc07be.csv) | Passed final structural + cached-source gate |

TinySet discovered 24, 24 and 20 candidate rows respectively. The validator retained 36 worldwide qualifying companies and 108 investor-company edges across the three runs. The final acceptance gate passed at November 17, 2026, 13:32:43 UTC (19:02:43 IST); the final audited snapshots were saved at 13:29:09 UTC. Rejected candidates remain listed with reasons. The search is bounded and is not represented as an exhaustive company census.

## Evidence tour

- **Selected-round lead:** Parahelp's [funding announcement](https://parahelp.com/blog/announcing-our-series-a-and-seed) explicitly associates Blake Robbins at Hidden Capital with its $3.2M seed round. The same page contains a separately led Series A, which is not assigned to Hidden.
- **Company investment lead:** Blume's [Mysa portfolio page](https://blume.vc/mysa) identifies Ashish Fafadia. This is displayed with `scope: company`, without claiming he led the January 27, 2026 financing. Vardan Gattani's [645 Ventures portfolio entry](https://645ventures.com/portfolio/risotto) is also a company-level attribution.
- **Original-currency cheque:** [BonVenture's founder criteria](https://www.bonventure.de/founders/) state €1M–€2.5M, and [Investible's founder FAQ](https://www.investible.com/get-investment) states AU$250k–AU$1.5M. USD fit remains unknown rather than using a guessed conversion.
- **Real outreach destination:** Y Combinator's application redirects to sign-in. Neon publishes a [founder application referral](https://neon.fund/fund-application-page/) to a public Typeform that states its B2B Enterprise AI requirement. Destination verification is distinguished from interactive form testing.
- **Additional founder routes:** [Khosla’s direct contact](https://www.khoslaventures.com/contact), [Elevation’s founder intake](https://www.elevationcapital.com/pitch), [Investible’s funding invitation](https://www.investible.com/get-investment), and [EIT’s pitch-deck screening referral](https://www.eiturbanmobility.eu/what-we-offer/support-to-startups/startup-investment/) are sourced. EIT’s full funding call has separate lead-investor, prototype and registration requirements; its current cutoff is unverified. Endiya publishes a preference for quality referrals from portfolio founders and entrepreneurs.
- **Missing facts:** Open an investor with an unknown cheque or named round lead, and explain that the source audit withheld unsupported details.

Across 36 shortlist entries, 5 have sourced cheque or investment-range facts and 31 remain unknown; Elevation’s published range spans multiple stages. There is 1 named selected-round lead and 2 separately labelled company leads; 35 entries have no named selected-round lead. Outreach includes 6 public founder destinations, 1 sign-in destination, 2 published shared inboxes and 32 portfolio-referral/intro routes. One inbox is also counted as a public destination; one intro route is an investor-published referral preference. No public form is claimed to have had its full interactive flow tested. Introduction availability remains unconfirmed. Eight shortlisted investors have an investor-published route or referral preference beyond a generated intro suggestion.

## Endpoint evidence

Each saved report carries the actual operation ledger. The counts below are successful ledger entries, including source repairs, refreshes and shared manual audits; they are not a claim of independent billable requests. Endpoint scoring depends on the distinct meaningful endpoint families.

| Example | Successful ledger entries | Preserved unique resource handles |
| --- | --- | --- |
| support-ai | TinySet: 1; Fetch: 105; Agent: 10; Search: 102; Browser: 2 | TinySet: 1; Agent: 10; Browser: 2 |
| india-fintech | TinySet: 1; Fetch: 114; Agent: 10; Search: 100; Browser: 8 | TinySet: 1; Agent: 10; Browser: 8 |
| battery-climate | TinySet: 1; Fetch: 94; Agent: 13; Search: 105; Browser: 5 | TinySet: 1; Agent: 13; Browser: 5 |

TinySet does the core company discovery. Search finds investor/source pages, Fetch reads the evidence, Agent resolves ambiguous passages and navigates official sites, and Browser examines advertised intake destinations. No Monitor or TinyResearch was used. The underlying three dataset IDs are recorded above; full Agent and Browser identifiers are in the JSON ledgers.

## API walkthrough

- `POST /api/runs` accepts the startup input and starts research.
- `GET /api/runs/:id` returns progress, provider usage, and the resulting report.
- `GET /api/runs/:id/export?format=json` downloads the full report; `?format=csv` downloads the investor outreach table.
- `GET /api/demos` lists the saved demo reports available in the build.

Check the README for the final request shape and exact export route before recording.

## Short recording outline

The recorded walkthrough is available as [funding-radar-demo.mp4](../artifacts/funding-radar-demo.mp4). The [final UI/export QA report](../artifacts/final-qa.json) records desktop/mobile and JSON/CSV checks.

- Explain the founder's question and enter the first startup.
- Show live research, then the ranked result and its proof.
- Show two other saved live runs, clearly naming their observation times.
- Explain TinySet, source verification, ranking, and exports.
- Close on the repo and working-build links.

Saved runs can make the recording practical, but the recording must identify them as saved live reports. Keep the live research action visible at least once.

The public static reviewer replays these reports. The general live app/API is demonstrated with the local Node server and a personal server-side TinyFish key. Use the saved reports for repeat recording; `npm run demo` creates new paid research jobs.
