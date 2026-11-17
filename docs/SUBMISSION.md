# Funding Radar submission packet

## What the build does

Funding Radar accepts a founder's startup description, stage, and country. It researches recent comparable financing events with TinySet, checks the evidence, and ranks investors with reasons a founder can inspect. JSON and CSV exports carry the same facts and provenance.

The public reviewer replays genuine dated research reports. The general live app and API run locally or on a Node host using the entrant's personal server-side TinyFish key. A static reviewer cannot execute arbitrary new live searches itself.

## How TinyFish is used

- **TinySet:** constructs a live dataset of comparable companies and their recent financing, including named investors and source references. This is the core discovery step.
- **Search:** discovers missing investment proof and official investor mandate or intake pages.
- **Fetch:** reads supporting pages to validate company–investor edges and investor details.
- **Agent:** extracts round participants and deal details from the discovered source pages; the local validator checks the returned passages against the fetched text before accepting an investment.
- **Browser:** inspects top-ranked investor intake routes through a real browser when a page needs interactive verification.

All five products have successful material work recorded in the three saved demo ledgers, with TinySet, Agent and Browser resource identifiers. No Monitor or TinyResearch was used. The conventional scoring endpoints demonstrated are Search, Fetch, Agent and Browser; judges determine the endpoint tier. Polling and repeated snapshot audits are not separate endpoint families.

## Proof and ranking

Every accepted investor has a recent comparable investment with linked source evidence. Investor cheque ranges and deal leads require separate supporting evidence; absent details remain unknown. Published cheque ranges retain their original currency, with no assumed USD conversion. Ranking combines company similarity, stage, geography, cheque fit, repeated comparable investments, and recency. The exported report includes the score breakdown and ranking rationale.

The final ranking places investors whose stage and country fit have evidence before candidates whose eligibility needs confirmation. Weighted scores determine order within each tier. Exclusive incompatible mandates are excluded. Conditional requirements, such as UAE strategic relevance or DACH business activity, remain visible.

Company investment leads and selected-round leads have different scope labels. A verified public application destination is distinguished from an interactively inspected form; a sign-in requirement is disclosed.

## Attach before submitting

- Repository: [Sarvesh5273/funding-radar](https://github.com/Sarvesh5273/funding-radar).
- Public reviewer: deployment verification is **pending**.
- Recorded demo: [Funding Radar MP4](../artifacts/funding-radar-demo.mp4), with [UI/export QA results](../artifacts/final-qa.json).
- Three completed live report artifacts: [US AI support](../data/public-runs/95a243df-f62f-4f1c-9957-a833f0bfbef4.json), [India payments](../data/public-runs/730e8414-6b9e-4ff6-b4d2-b8ec851dadcc.json), [Germany battery circularity](../data/public-runs/6220057b-e49c-40a4-8db4-86a060bc07be.json). Final acceptance is recorded in [the validation report](live-demo-validation.json).
- JSON and CSV examples: [demo log and exports](DEMO.md).
- LinkedIn post URL tagging TinyFish: **pending**.
- TinyFish Discord `#showcase` message link: **pending**.

## LinkedIn draft

I built Funding Radar for the TinyFish Funding Radar bounty.

You describe your startup, stage, and country. Funding Radar researches comparable companies that raised recently, follows the investment evidence, and ranks investors with an explanation for each result.

TinySet builds the comparable-company dataset from the live web. TinyFish Search and Fetch help verify investment sources and investor details. Unknown cheque sizes and deal partners stay unknown; the tool does not turn a round total into an investor's cheque.

Three startup examples cover US AI support, India B2B payments, and German battery recycling, returning 14, 12 and 10 qualifying worldwide comparables respectively (36 total), with 108 sourced investor-company relationships. The public reviewer replays those dated reports. The live app/API supports new descriptions using a personal server key.

The result includes linked proof, separate eligibility tiers and reusable JSON/CSV exports. Named deal leads are only shown when the source establishes the person and their scope.

Demo: [ADD DEMO LINK]
Build: https://github.com/Sarvesh5273/funding-radar

[Tag TinyFish using LinkedIn's company mention picker before publishing.]

This draft is not a published post. Add the verified public demo or recording link and use LinkedIn's TinyFish company mention before posting.

## Discord showcase draft

Built **Funding Radar** for the Funding Radar bounty: describe a startup, stage, and country, then get investors ranked from their recent comparable investments, with source proof and JSON/CSV exports.

TinySet does the comparable-company discovery. Search and Fetch verify the evidence and investor details; Agent resolves ambiguous passages and Browser checks advertised intake destinations. Three dated live reports contain 14, 12 and 10 qualifying worldwide comparables across the US AI-support, India-payments and Germany-battery startup examples. The public reviewer replays them, and the live app/API can research new inputs with a personal server key.

Demo: [ADD LINK]
Build: https://github.com/Sarvesh5273/funding-radar

The three reports have completed. Check the final validation report and add the verified demo URL before publishing this draft.

## Remaining disclosure gaps

The final 36 shortlist entries have 5 sourced cheque or investment-range facts, including one range across multiple stages; 31 cheques remain unknown. Only 1 named selected-round lead and 2 separately labelled company leads are evidenced. Eight investors have a published founder destination, inbox or referral preference; remaining outreach is predominantly suggested portfolio-founder introductions. The output reports these details as unknown and offers evidenced portfolio-founder introductions where an open route was not verified. This is a material limitation against the bounty's useful-detail requirement; the structural acceptance gate does not guarantee that judges will accept it.

Research is bounded to the requested candidate count and does not claim an exhaustive list of every similar company. Three contrasting examples establish observed behavior across those inputs, while arbitrary descriptions use the same discovery and validation engine. Sparse markets can return an insufficient-evidence result.

## Deadline and reward notes

The user-supplied rulebook gives **Tuesday, November 17, 2026, 11:59 PM Pacific Time**, which is **Wednesday, November 18, 2026, 1:29 PM India Standard Time**. The public dashboard requires sign-in, so the private claim's deadline was not independently verified from the public site.

The supplied Funding Radar exclusive says one winner receives a $50 gift card and 200 points, and every other valid entry receives 50 points. The supplied general rulebook describes different top-three reward and approval rules. Confirm the Funding Radar claim's displayed terms when submitting; this packet does not guarantee approval, points, or a prize.

## Final readiness

The 41-test release suite and final structural/cached-source validation passed for all three completed reports; see `docs/live-demo-validation.json`. Publish the verified reviewer link, complete the required LinkedIn and Discord posts, record their URLs, and submit once through My Claims. The useful-detail gaps above remain subject to the judges' approval criteria. The supplied rulebook says submissions are final.
