import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyProfile } from '../src/server/enrichment.js';
import { rankInvestors, selectProfileCandidates, stageIndex } from '../src/server/ranking.js';
import { normalizedIdentity } from '../src/server/verification.js';
import { DEMO_STARTUPS, type ComparableCompany } from '../src/shared/types.js';

test('a country-supported prospect ranks ahead of a more similar unconfirmed foreign investor', () => {
  const company = (id:string,name:string,country:string,similarity:number):ComparableCompany => ({id,name,description:'Battery recycling technology',country,website:null,roundDate:'2026-10-01',roundStage:'Series A',roundAmount:null,investors:[{investorName:name,evidenceId:id,isLead:false,leadPartner:null,partnerEvidenceId:null}],similarity,similarityReason:'Battery circularity',similarityMethod:'lexical',sourceUrl:'https://example.com/funding',evidenceId:id});
  const local=emptyProfile('European Fund');local.geographies={value:['Europe'],evidenceIds:['mandate']};
  const foreign=emptyProfile('Foreign Family Office');
  const profiles=new Map([[normalizedIdentity(local.name),local],[normalizedIdentity(foreign.name),foreign]]);
  const investors=rankInvestors(DEMO_STARTUPS[2],[company('eu','European Fund','France',0.6),company('foreign','Foreign Family Office','India',0.99)],profiles,'2026-11-17');
  assert.equal(investors[0].name,'European Fund');
  assert.equal(investors[0].eligibility,'supported');
  assert.match(investors[0].explanation,/published market mandate covers Germany/);
  assert.equal(investors[1].eligibility,'unconfirmed');
  assert.equal(investors[1].score>investors[0].score,true);
  for(const investor of investors)assert.equal(investor.score,Math.round(investor.breakdown.reduce((sum,part)=>sum+part.points,0)*10)/10);
});

test('research reaches investors in a second local company when one syndicate dominates the score list', () => {
  const syndicate=Array.from({length:20},(_,index)=>({name:`Syndicate ${index}`,comparables:['one-company']}));
  const independent={name:'Independent Local Investor',comparables:['second-company']};
  const candidates=selectProfileCandidates([...syndicate,independent],[{id:'one-company',country:'India'},{id:'second-company',country:'India'}],'India',20);
  assert.equal(candidates.length,20);
  assert.equal(candidates.includes(independent),true);
  assert.equal(new Set(candidates.map(c=>c.name)).size,20);
  assert.equal(stageIndex('pre-Series A'),null);
});
