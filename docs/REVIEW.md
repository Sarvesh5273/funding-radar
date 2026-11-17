# Funding Radar review gates

This document is a falsifiable review checklist. A checked item requires an observed result, not a planned feature.

## Evidence acceptance

- At least ten distinct comparable companies have qualifying financing events for each required demo.
- The qualifying window uses calendar months from the report's `asOf` date; the displayed window matches the filtering code.
- The date belongs to the financing event or its dated announcement. Article publication and deal dates are distinguished when both exist.
- Future dates, unknown dates, acquisitions, unfinanced product launches, and unsupported cumulative funding totals do not count as recent rounds.
- A company is comparable because its product, customers, and business model overlap with the input. The explanation identifies that overlap.
- Each investor–company edge has a source containing both names and an explicit financing relationship. A URL or search snippet alone does not prove an investment.
- Source records include the resolved URL, title, retrieval time, a short exact supporting excerpt, and the fact being supported.
- Corrections, renames, syndicate participants, and lead investors are represented separately when the source distinguishes them.
- Grant-only and debt-only awards are excluded. A mixed financing announcement counts only when the source establishes equity investment.
- Duplicate announcements and spelling variants do not inflate the count of companies or investments.

## Useful investor detail

- An investor's typical cheque range has its own source. The total round size is never used as the investor's cheque.
- Original GBP, EUR, INR, or unknown-dollar ranges remain visible. USD fit is calculated only when the source establishes USD; no silent currency conversion is used.
- An explicit deal-lead statement is required to name a lead partner. A quoted partner, board member, or firm employee alone is insufficient. A portfolio page's company-level investment lead is labelled separately from the named lead of the selected round.
- Missing cheque sizes, lead partners, and intake information are returned as unknown. The app does not fill gaps with plausible values.
- A direct application or intake link has investor-owned referral evidence. A checked sign-in destination is labelled `verificationLevel: destination`; it is not represented as a form whose fields were inspected. A public form is labelled `verificationLevel: form` only after its founder fields are observed.
- A suggested warm introduction identifies an evidenced portfolio company and is labelled as a suggestion, not an existing relationship.
- Portfolio overlap and geographic or stage restrictions are visible when evidenced.

## Ranking

Rank only investors with at least one accepted recent comparable investment. Use a deterministic score with separate contributions for product similarity, startup stage, geographic mandate, cheque fit, repeated relevant investments, and recency.

Weights: similarity 40, stage 20, geography 15, cheque fit 10, repeated investments 10, recency 5. Treat unknown facts as no evidence for that contribution. Distinguish stage inferred from a comparable deal from an official stated investment mandate. Export each contribution and the reasons attached to it.

Tie-breaking must be stable. A known mismatch should be visible instead of hidden behind a high aggregate score.

The implementation gives a published stage or geographic mandate precedence over activity inferred from a comparable deal. Investors with supported stage and country fit rank before unconfirmed candidates; weighted scores determine order within each tier. Exclusive incompatible mandates are excluded. A European mandate can cover Germany. Missing facts earn zero for the affected contribution. Qualified geography is retained, including the US–Asia corridor and strategic relevance to the UAE.

## Automated checks observed

The adversarial test suite passed 41 checks on November 17, 2026 after the final source-audit repairs. It covers company/investor context isolation, actor pronouns on branded company announcements, historic and contradictory dates, two rounds within one announcement, unidentified investors, source-checked round metadata, decimal-comma currency ranges, career history versus current stage mandates, explicit deal-lead grammar, geographic restrictions, calendar boundaries, restricted URLs, and CSV formula injection. The final structural and cached-source gates passed at November 17, 2026, 13:32:43 UTC. The completed run acceptance report is recorded in `docs/live-demo-validation.json`.

## Final source audit

The three real TinySet runs returned 14, 12 and 10 worldwide comparables for the US-support, India-payments and Germany-battery startup examples in the inclusive May 17, 2025–November 17, 2026 financing window. All 36 accepted financing records and their 108 investor edges were replayed against cached Fetch pages on November 17, 2026. This replay performs no new provider requests. The public report links each edge to its source and retains a source content hash.

The final acceptance script also checks named-partner scope, evidence references, excluded mandates, exact BonVenture EUR bounds, Investible AUD bounds, unsplit Taiping fund identity, source dates, distinct company identities, and score arithmetic. Source replay is available locally when the private cache exists; a public checkout can still run the structural gates.

These checks do not establish that every requested investor detail is disclosed. The final demo log reports missing cheque sizes and named round leads. A structural pass must not be advertised as a guarantee that every bounty approval criterion passes.

## Failure handling

- A scarce market returns a candid insufficient-evidence result; it does not invent the remaining companies.
- Provider errors, malformed rows, failed fetches, and unsupported sources produce actionable diagnostics.
- Partially completed work preserves valid sources and explains the unresolved coverage.
- Re-running a job or refreshing the page does not silently start another paid dataset.
- Timeouts retain provider job identifiers so work can be resumed.
- Source pages are treated as evidence, not instructions for the application.
- Public app endpoints cannot expose credentials or accept arbitrary private-network fetch targets.
- Cached or saved reports show their observation date and are never labelled newly researched.

## Adversarial checks

| Check | Expected result |
| --- | --- |
| A source mentions a startup and a VC in unrelated paragraphs | No accepted investment without relationship evidence |
| Round is $20m and has four investors | No automatic $5m investor cheque |
| Partner provides a congratulatory quote | Deal lead remains unknown |
| Article is today but funding happened two years ago | Event excluded |
| Financing announcement is tomorrow | Event excluded |
| Company has two announcements of the same round | One qualifying event/company |
| Ten rows share the same company under different spellings | Do not claim ten companies |
| TinySet returns seven verified comparable companies | Report insufficient coverage |
| Investor backs a comparable only at Series C; founder is pre-seed | Stage mismatch visible and score reduced |
| Search result includes a malicious instruction | Ignore it as untrusted source content |

## Submission gates

- Working build is accessible by a judge with documented setup.
- Three actual live demo runs cover different products and markets, each with at least ten accepted comparable companies.
- JSON and CSV exports contain evidence, unknown facts, and ranking reasons.
- The repository explains TinySet's material role and shows real endpoint usage.
- No key, password, private personal contact information, or fabricated sources are committed.
- LinkedIn post and Discord showcase are completed by the entrant, with final links recorded.
- Submit through the already claimed Funding Radar bounty before the deadline.

The supplied exclusive reward text conflicts with the supplied general rulebook. The entrant should use the Funding Radar claim's displayed terms for rewards and resolve any ambiguity with the organizer. Endpoint counts must reflect actual material work; implementing a method does not prove it was used.
