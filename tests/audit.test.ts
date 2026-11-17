import assert from 'node:assert/strict';
import test from 'node:test';
import { dateWindow } from '../src/server/spec.js';
import { csvCell, publicUrl, isPrivateAddress } from '../src/server/security.js';
import { entityMention, exactQuote, verifyRound, investorNames, extractDates, type Candidate } from '../src/server/verification.js';
import type { TinyFetchPage } from '../src/server/tinyfish.js';
import { brandedInvestorUrl, basicProfile, emptyProfile, explicitPartnerLead, extractCheque, extractGeographies, extractStages } from '../src/server/enrichment.js';
import { coversMarket, rankInvestors } from '../src/server/ranking.js';
import { normalizedIdentity } from '../src/server/verification.js';
import { DEMO_STARTUPS, type ComparableCompany } from '../src/shared/types.js';

const window = { from: '2025-05-17', to: '2026-11-17' };
const candidate = (changes: Partial<Candidate> = {}): Candidate => ({
  id: 'acme', name: 'Acme', description: 'Acme sells AI customer support software to businesses.',
  country: 'United States', website: 'https://acme.example/', roundDate: '2026-06-10',
  roundStage: 'seed', roundAmount: '$10 million', investors: ['Alpha Ventures'],
  sourceUrl: 'https://news.example/acme-seed', proposedExcerpt: '', ...changes,
});
const page = (body: string, changes: Partial<TinyFetchPage> = {}): TinyFetchPage => ({
  url: 'https://news.example/acme-seed', final_url: 'https://news.example/acme-seed',
  title: 'Acme raises a seed round', text: body, published_date: '2026-06-10', ...changes,
});

test('explicit current financing accepts only named participating investors', () => {
  const result = verifyRound(candidate({ investors: ['Alpha Ventures', 'Invented Capital'] }), page(
    'June 10, 2026. Acme raised $10 million in seed funding led by Alpha Ventures. The financing supports its AI customer support product and team.'
  ), window);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.investors.map(i => i.name), ['Alpha Ventures']);
  assert.equal(result.investors[0].isLead, true);
});

test('a branded company source can identify itself as we in a financing announcement', () => {
  const c=candidate({name:'Gradient Labs',website:'https://gradient-labs.ai/',sourceUrl:'https://gradient-labs.ai/news/series-a',investors:['Redpoint Ventures'],roundDate:'2025-07-08',roundStage:'Series A',roundAmount:'$13M'});
  const p=page('Gradient Labs. Jul 8, 2025. We are thrilled to announce our $13M Series A led by Redpoint Ventures, with participation from Exceptional Capital. This capital grows our team.',{url:c.sourceUrl!,final_url:c.sourceUrl!,title:'Gradient Labs News',published_date:'2025-07-08'});
  assert.equal(verifyRound(c,p,window).accepted,true);
  assert.equal(verifyRound({...c,website:'https://another-company.example/'},p,window).accepted,false);
});

test('a neighboring company round cannot attach its investor to Acme', () => {
  const result = verifyRound(candidate({ investors: ['Omega Capital'] }), page(
    'Acme raised $10 million in seed funding led by Alpha Ventures on June 10, 2026. This capital supports Acme customer support software.\n\nBeta Robotics raised $20 million in Series A funding led by Omega Capital on June 10, 2026. This is a separate company and financing event.'
  ), window);
  assert.equal(result.accepted, false);
});

test('a beta product participant is not a round investor', () => {
  const result = verifyRound(candidate({ investors: ['Omega Capital'] }), page(
    'Acme raised $10 million in seed funding on June 10, 2026. Omega Capital joined the product beta. The platform automates customer support workflows for business users.'
  ), window);
  assert.equal(result.accepted, false);
});

test('publication metadata cannot turn an explicitly old financing into a current round', () => {
  const result = verifyRound(candidate(), page(
    'Acme raised $10 million in seed funding led by Alpha Ventures on January 12, 2024. Today we explain how the AI customer support company uses that funding.'
  ), window);
  assert.equal(result.accepted, false);
});

test('a date attached to the financing in a separate sentence overrides article metadata', () => {
  const result = verifyRound(candidate(), page(
    'Acme raised $10 million in seed funding led by Alpha Ventures. That financing closed on January 12, 2024. Today we explain its customer support product.'
  ), window);
  assert.equal(result.accepted, false);
});

test('planned financing and grant-only awards are not completed equity rounds', () => {
  const planned = page('Acme announced a proposed seed funding round on June 10, 2026. Investors in the round include Alpha Ventures. The company hopes to build its AI product.');
  const grant = page('Acme received $10 million in grant funding from Alpha Ventures on June 10, 2026. This non-equity award funds customer support research and development.');
  assert.equal(verifyRound(candidate(), planned, window).accepted, false);
  assert.equal(verifyRound(candidate(), grant, window).accepted, false);
  const nonEquity = page('Acme received $10 million in non-equity grant funding from Alpha Ventures on June 10, 2026. This award funds its support software research.');
  assert.equal(verifyRound(candidate(), nonEquity, window).accepted, false);
});

test('a current dateline cannot mask a different explicit deal date', () => {
  const source=page('June 10, 2026 - Acme raised $10 million in seed funding led by Alpha Ventures on January 12, 2024. Today we review that financing.');
  assert.equal(verifyRound(candidate(), source, window).accepted, false);
});

test('a historic investor with only a month and year does not participate in the current round', () => {
  const c=candidate({name:'Capacity',investors:['Kathy Ireland'],roundDate:'2026-09-02',roundStage:'Series E'});
  const p=page('Capacity raised $54M in Series E on September 2, 2026. Entrepreneur Kathy Ireland disclosed a significant personal investment in Capacity in March 2026. The platform automates support.',{title:'Capacity raises Series E',published_date:'2026-09-02'});
  assert.equal(verifyRound(c,p,window).accepted,false);
});

test('two rounds announced together keep their respective investors and round amounts', () => {
  const c=candidate({name:'Parahelp',website:'https://parahelp.com/',sourceUrl:'https://parahelp.com/funding',investors:['Hidden Capital','Alt Capital'],roundDate:'2025-09-11',roundStage:'Series A',roundAmount:'$18M'});
  const p=page('Parahelp. September 11, 2025. Today, we are announcing that we\'ve raised a $3.2M Seed round led by Blake Robbins at Hidden Capital and an $18M Series A round led by Jack Altman at Alt Capital.',{url:c.sourceUrl!,final_url:c.sourceUrl!,title:'Parahelp funding',published_date:'2025-09-11'});
  const result=verifyRound(c,p,window);
  assert.equal(result.accepted,true);
  assert.equal(result.roundStage,'Series A');
  assert.equal(result.roundAmount,'$18M');
  assert.deepEqual(result.investors.map(i=>i.name),['Alt Capital']);
});

test('undisclosed and invented round metadata is not copied from the dataset', () => {
  const undisclosed = verifyRound(candidate({ roundStage: 'Series B', roundAmount: '$99 million' }), page(
    'Acme announced new funding on June 10, 2026. Investors in the round include Alpha Ventures. The financing amount and stage have not been disclosed.'
  ), window);
  assert.equal(undisclosed.accepted, true);
  assert.equal(undisclosed.roundStage, 'undisclosed');
  assert.equal(undisclosed.roundAmount, null);
  const cumulative = verifyRound(candidate({ roundAmount: '$50 million' }), page(
    'Acme raised $10 million in seed funding led by Alpha Ventures on June 10, 2026, bringing its total funding to $50 million. This financing supports its AI product.'
  ), window);
  assert.equal(cumulative.accepted, true);
  assert.equal(cumulative.roundStage, 'seed');
  assert.equal(cumulative.roundAmount, null);
});

test('Crosby-style customers and portfolio mentions cannot prove their new financing', () => {
  const result = verifyRound(candidate({ name: 'Cartesia', investors: ['Index Ventures'], roundDate: '2025-10-08' }), page(
    'Multiple portfolio companies, including Cartesia, Parallel, and others converted on the spot. We could not be more thrilled to lead Crosby\'s Series A. This investment supports a different company.',
    { title: 'Our Investment in Crosby', published_date: '2025-10-08' }
  ), window);
  assert.equal(result.accepted, false);
});

test('future and impossible financing dates are rejected', () => {
  const source = page('Acme raised $10 million in seed funding led by Alpha Ventures. This capital supports the customer support software platform.');
  assert.equal(verifyRound(candidate({ roundDate: '2026-11-18' }), source, window).accepted, false);
  assert.equal(verifyRound(candidate({ roundDate: '2026-02-30' }), source, window).accepted, false);
});

test('entity boundaries and exact excerpts do not accept coincidental names or paraphrases', () => {
  assert.equal(entityMention('Our linear product supports users.', 'NEA'), false);
  assert.equal(entityMention('NEA invested in Acme.', 'NEA'), true);
  const source = page('Acme raised $10 million in seed funding led by Alpha Ventures.');
  assert.equal(exactQuote(source, 'Alpha Ventures invested $10 million into Acme'), null);
  assert.equal(exactQuote(source, 'seed funding led by Alpha Ventures.'), 'seed funding led by Alpha Ventures.');
  assert.deepEqual(investorNames('Taiping Science and Technology Innovation Fund'),['Taiping Science and Technology Innovation Fund']);
  assert.deepEqual(extractDates('Sept. 17, 2026'),['2026-09-17']);
});

test('18-month evidence window uses calendar months and the exact inclusive date boundary', () => {
  assert.deepEqual(dateWindow(new Date('2026-11-17T10:59:00Z'), 18), {
    from: '2025-05-17', to: '2026-11-17', months: 18,
  });
});

test('12-month evidence window stays a calendar year across a leap day', () => {
  assert.deepEqual(dateWindow(new Date('2025-02-28T23:59:00Z'), 12), {
    from: '2024-02-28', to: '2025-02-28', months: 12,
  });
});

test('month-end calculation clamps to February instead of overflowing into March', () => {
  assert.equal(dateWindow(new Date('2026-08-31T00:00:00Z'), 18).from, '2025-02-28');
  assert.equal(dateWindow(new Date('2025-08-31T00:00:00Z'), 18).from, '2024-02-29');
});

test('untrusted source links cannot point at loopback, private networks, or credentials', () => {
  for (const url of [
    'http://example.com/funding',
    'https://127.0.0.1/admin',
    'https://10.1.2.3/funding',
    'https://172.16.0.1/funding',
    'https://192.168.1.1/funding',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/funding',
    'https://user:password@example.com/funding',
    'https://example.com:8443/funding',
    'https://localhost/funding',
  ]) assert.equal(publicUrl(url), null, url);
  assert.equal(publicUrl('https://example.com/funding#tracking'), 'https://example.com/funding');
});

test('DNS responses cannot disguise private IPv4 addresses as hexadecimal IPv6 mappings', () => {
  for(const address of ['::ffff:7f00:1','0:0:0:0:0:ffff:7f00:1','::ffff:a9fe:a9fe','::ffff:192.168.1.1','64:ff9b::a9fe:a9fe','fe80::1','fd00::1'])assert.equal(isPrivateAddress(address),true,address);
  assert.equal(isPrivateAddress('::ffff:808:808'),false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'),false);
});

test('CSV exports neutralize spreadsheet formulas supplied by source content', () => {
  for (const value of ['=HYPERLINK("https://evil.example","click")', '+SUM(1,2)', '@SUM(1,2)', '-1+2', ' \t=cmd']) {
    assert.equal(csvCell(value).slice(0, 2), '"\'', value);
  }
  assert.equal(csvCell('Investor "A"'), '"Investor ""A"""');
  assert.equal(csvCell(null), '""');
});

test('fund totals, round sizes, valuations and ambiguous currencies are not USD cheque mandates', () => {
  assert.equal(extractCheque('We raised a USD 200 million fund. Our investors write USD 1 million to USD 5 million rounds.'), null);
  assert.equal(extractCheque('Acme raised USD 1 million to USD 5 million with our investment.'), null);
  assert.equal(extractCheque('We write initial cheques of $1 million to $5 million.')?.minUsd, null);
  assert.equal(extractCheque('We write initial cheques of £1 million to £5 million.')?.currency, 'GBP');
  assert.equal(extractCheque('We write initial cheques of £1 million to £5 million.')?.min, 1000000);
  assert.deepEqual(extractCheque('We write initial cheques of USD 500k to USD 2 million.')?.minUsd, 500000);
  assert.deepEqual(extractCheque('We write initial cheques of USD 500k to USD 2 million.')?.maxUsd, 2000000);
  assert.equal(extractCheque('We invest $500,000 in every company on standard terms.')?.min,500000);
  assert.equal(extractCheque('We invest $500,000 in every company on standard terms.')?.max,500000);
  assert.equal(extractCheque('We invest through our $200 million fund.'),null);
});

test('decimal-comma cheque ceilings preserve their numeric value and original currency', () => {
  const european=extractCheque('We write initial cheques of €1M - 2,5M.')!;
  assert.equal(european.min,1000000);
  assert.equal(european.max,2500000);
  assert.equal(european.currency,'EUR');
  assert.equal(european.minUsd,null);
  assert.equal(european.maxUsd,null);
  const grouped=extractCheque('We write initial checks of USD 1,000,000 to USD 2,500,000.')!;
  assert.equal(grouped.minUsd,1000000);
  assert.equal(grouped.maxUsd,2500000);
  const decimalDot=extractCheque('We write initial checks of USD 1M to USD 2.5M.')!;
  assert.equal(decimalDot.maxUsd,2500000);
});

test('a maximum initial investment is not a fixed cheque size', () => {
  assert.equal(extractCheque('Our target initial investment is up to €2.5M.'),null);
  assert.equal(extractCheque('We write checks of at least USD 500k.'),null);
  assert.equal(extractCheque('We invest USD 500k in every company.')?.minUsd,500000);
});

test('qualified Australian dollar cheque ranges keep both endpoints and never become USD', () => {
  const cheque=extractCheque('Our cheque sizes tend to be in the AU$250k to AU$1.5M range, but we have capacity to deploy smaller and larger cheques.')!;
  assert.equal(cheque.currency,'AUD');
  assert.equal(cheque.min,250000);
  assert.equal(cheque.max,1500000);
  assert.equal(cheque.minUsd,null);
  assert.equal(cheque.maxUsd,null);
  assert.equal(cheque.label,'AU$250k to AU$1.5M');
  const canadian=extractCheque('We write initial cheques of CAD $500k to CAD $2M.')!;
  assert.equal(canadian.currency,'CAD');
  assert.equal(canadian.max,2000000);
  assert.equal(canadian.maxUsd,null);
});

test('adjacent investment-range heading and amount are one sourced mandate', () => {
  const cheque=extractCheque('Investment range\n\nUSD 500k - USD 35M')!;
  assert.equal(cheque.minUsd,500000);assert.equal(cheque.maxUsd,35000000);
  assert.equal(extractCheque('Fund size\n\nUSD 500k - USD 35M'),null);
});

test('stage action modifiers preserve pre-Series A without promoting it to Series A', () => {
  assert.deepEqual(extractStages('We primarily invest in seed & pre-series A rounds, with some room for flexibility on both ends.')?.values,['seed','pre-series a']);
  assert.deepEqual(extractStages('We mainly back pre-seed and seed companies.')?.values,['pre-seed','seed']);
  assert.deepEqual(extractStages('We typically lead Series A rounds.')?.values,['series a']);
});

test('investor detail discovery retains a relevant sector strategy and a distinct pitch route', async()=>{
  const homepage='https://alphaventures.example/';const sector=homepage+'fintech-and-financial-services',pitch=homepage+'pitch';
  const calls:string[][]=[];
  const fake={search:async()=>({results:[{url:homepage,title:'Alpha Ventures',snippet:'Official investor'}]}),fetchPages:async(urls:string[])=>{
    calls.push(urls);return{results:urls.map(url=>({url,final_url:url,title:'Alpha Ventures',description:null,published_date:null,text:url===homepage?'We invest at seed in financial technology companies.':url===sector?'Startup investing in financial technology.\n\nInvestment range\n\nUSD 500k - USD 35M':'Submit your pitch for your startup.',links:url===homepage?[sector,pitch]:[]})),errors:[]};
  }};
  const company={name:'Acme',description:'AI finance automation and financial workflow software',investors:[]} as unknown as ComparableCompany;
  const result=await basicProfile(fake as unknown as import('../src/server/tinyfish.js').TinyFishClient,'Alpha Ventures',[],[company]);
  assert.ok(calls[1].includes(sector));assert.ok(calls[1].includes(pitch));assert.equal(calls[1].length,2);
  assert.equal(result.profile.cheque.value?.maxUsd,35000000);
});

test('global investor networks and global challenges do not establish fund geography', () => {
  assert.equal(extractGeographies('Our unique model for early-stage investment sees our VC Funds investing alongside Club Investible, a global investor syndicate.'),null);
  assert.equal(extractGeographies('To achieve these goals, we focus on five priority domains in which we believe our community has the potential to innovate and create impact that reflect key global challenges and opportunities:'),null);
  const genuine=extractGeographies('While we primarily invest in Australia, New Zealand and across Southeast Asia, we are always on the lookout for exceptional founders, from anywhere.')!;
  assert.deepEqual(genuine.values,['Australia','New Zealand','Southeast Asia','global']);
  assert.equal(genuine.exclusive,false);
});

test('career history, global support teams and office lists do not become investment geographies', () => {
  assert.equal(extractGeographies('Topaz started investing in startups in 2001 in the US and has continued building her portfolio ever since in both the US and Australia.'),null);
  assert.equal(extractGeographies('When we invest in a founder, you do not just get one person: you get the global team, the global thematic expertise and the global connectivity.'),null);
  assert.equal(extractGeographies('After investing on the continent for over a decade, GC hired Chris as a managing director and global healthcare team lead.'),null);
  assert.equal(extractGeographies('With offices in 27 cities, including Singapore, we back founders from all backgrounds.'),null);
  assert.deepEqual(extractGeographies('Antler is a global early-stage VC firm that partners with exceptional founders from day zero.','Antler')?.values,['global']);
  assert.equal(extractGeographies('Antler is a global early-stage VC firm.','Another Fund'),null);
});

test('cross-border corridors and conditional global mandates retain their restrictions', () => {
  const corridor=extractGeographies('We back ambitious founders building startups in the US-Asia corridor.')!;
  assert.deepEqual(corridor.values,['US-Asia corridor']);
  const conditional=extractGeographies('We invest globally in startups whose innovations have strategic relevance to the UAE and wider region.')!;
  assert.deepEqual(conditional.values,['Global subject to strategic relevance to the UAE and wider region']);
  assert.equal(coversMarket(conditional.values,'India'),false);
  assert.equal(coversMarket(conditional.values,'United Arab Emirates'),false);
});

test('current stage ranges include intermediate rounds without turning career history into mandates', () => {
  assert.equal(extractStages('Hidden is the product of a decade spent investing from pre-seed to Series A.','Hidden Capital'),null);
  assert.deepEqual(extractStages('We invest from pre-seed to Series A.')?.values,['pre-seed','seed','series a']);
  assert.deepEqual(extractStages('We invest from seed through Series B.')?.values,['seed','series a','series b']);
  const profile=emptyProfile('Hidden Capital');
  const history=extractStages('Hidden is the product of a decade spent investing from pre-seed to Series A.','Hidden Capital');
  profile.stages={value:history?.values||null,evidenceIds:[]};
  const company:ComparableCompany={id:'parahelp-seed',name:'Parahelp',description:'AI customer support software.',country:'United States',website:'https://parahelp.com/',roundDate:'2025-09-11',roundStage:'seed',roundAmount:'$3.2M',investors:[{investorName:'Hidden Capital',evidenceId:'seed-proof',leadPartner:'Blake Robbins',partnerEvidenceId:'lead-proof',isLead:true}],similarity:0.9,similarityReason:'Matches the product and buyers.',similarityMethod:'lexical',sourceUrl:'https://parahelp.com/funding',evidenceId:'seed-proof'};
  const ranked=rankInvestors(DEMO_STARTUPS[0],[company],new Map([[normalizedIdentity(profile.name),profile]]),'2026-11-17')[0];
  assert.equal(ranked.breakdown.find(part=>part.key==='stage')?.points,20);
  assert.equal(ranked.stages.basis,'observed');
  assert.equal(ranked.leadPartners[0].name,'Blake Robbins');
});

test('a news or directory source cannot become an official investor domain from a name mention', () => {
  assert.equal(brandedInvestorUrl('https://alphaventures.com/strategy','Alpha Ventures'), true);
  assert.equal(brandedInvestorUrl('https://newspaper.example/alpha-ventures-official','Alpha Ventures'), false);
  assert.equal(brandedInvestorUrl('https://crunchbase.com/organization/alpha-ventures','Alpha Ventures'), false);
});

test('only an explicit financing lead and employer association identifies a deal partner', () => {
  assert.equal(explicitPartnerLead('Jane Doe, partner at Alpha Ventures, led Acme\'s seed round.','Jane Doe','Acme','Alpha Ventures'), true);
  assert.equal(explicitPartnerLead('Jane Doe from Alpha Ventures praised Acme\'s seed round and joined its board.','Jane Doe','Acme','Alpha Ventures'), false);
  assert.equal(explicitPartnerLead('Jane Doe led the investment in Acme.','Jane Doe','Acme','Alpha Ventures'), false);
  assert.equal(explicitPartnerLead('Jane Doe of Alpha Ventures led innovation at Acme following its seed round.','Jane Doe','Acme','Alpha Ventures'), false);
});

test('a European mandate covers Germany and unknown markets receive no optimistic fit', () => {
  assert.equal(coversMarket(['Europe'],'Germany'), true);
  assert.equal(coversMarket(['North America'],'United States'), true);
  assert.equal(coversMarket(['Europe'],'India'), false);
  assert.equal(coversMarket([],'India'), false);
  assert.equal(extractGeographies('Visit Us\n\nWe invest from pre-seed to Series A.'),null);
  assert.equal(extractGeographies('We back founders with global ambition.'),null);
  assert.equal(extractStages('Learn what it is like to work with Bonfire Ventures, including exceptionally high graduation rates from Seed to Series A.','Bonfire Ventures'),null);
});

test('published restrictions override a misleading recent comparable for stage and market points', () => {
  const profile=emptyProfile('Alpha Ventures');
  profile.stages={value:['Series A'],evidenceIds:['stage-proof']};
  profile.geographies={value:['United States'],evidenceIds:['market-proof']};
  const company:ComparableCompany={id:'acme',name:'Acme',description:'B2B payments and accounts payable automation.',country:'India',website:'https://acme.example/',roundDate:'2026-06-10',roundStage:'seed',roundAmount:'$10 million',investors:[{investorName:'Alpha Ventures',evidenceId:'investment-proof',leadPartner:null,partnerEvidenceId:null,isLead:true}],similarity:0.9,similarityReason:'Matches the product and buyers.',similarityMethod:'lexical',sourceUrl:'https://news.example/acme-seed',evidenceId:'investment-proof'};
  const ranked=rankInvestors(DEMO_STARTUPS[1],[company],new Map([[normalizedIdentity(profile.name),profile]]),'2026-11-17');
  assert.equal(ranked[0].breakdown.find(p=>p.key==='stage')?.points,8);
  assert.equal(ranked[0].breakdown.find(p=>p.key==='geography')?.points,0);
  assert.equal(ranked[0].breakdown.find(p=>p.key==='cheque')?.points,0);
  assert.ok(ranked[0].caveats.some(c=>c.includes('Published geographic mandate')));
});

test('literal exclusive mandates make a startup ineligible while ordinary focus statements do not', () => {
  const input=DEMO_STARTUPS[2];
  const company:ComparableCompany={id:'german-recycler',name:'German Recycler',description:'Battery recycling and critical mineral recovery.',country:'Germany',website:'https://recycler.example/',roundDate:'2026-06-10',roundStage:'Series A',roundAmount:'€10 million',investors:[{investorName:'Alpha Ventures',evidenceId:'investment-proof',leadPartner:null,partnerEvidenceId:null,isLead:true}],similarity:0.95,similarityReason:'Battery recycling matches the product.',similarityMethod:'lexical',sourceUrl:'https://news.example/recycler',evidenceId:'investment-proof'};
  const profile=emptyProfile('Alpha Ventures');
  profile.stages={value:['Series A'],evidenceIds:['stage-proof']};
  const focused=extractGeographies('We invest in Australia.')!;
  profile.geographies={value:focused.values,evidenceIds:['market-proof'],exclusive:focused.exclusive};
  const soft=rankInvestors(input,[company],new Map([[normalizedIdentity(profile.name),profile]]),'2026-11-17')[0];
  assert.equal(soft.eligibility,'unconfirmed');
  assert.ok(soft.score>0);
  const hard=extractGeographies('We invest in Australia.\n\nProjects must be based in Australia.')!;
  assert.equal(hard.exclusive,true);
  profile.geographies={value:hard.values,evidenceIds:['restriction-proof'],exclusive:hard.exclusive};
  const denied=rankInvestors(input,[company],new Map([[normalizedIdentity(profile.name),profile]]),'2026-11-17')[0];
  assert.equal(denied.eligibility,'ineligible');
  assert.equal(denied.score,0);
  assert.equal(denied.breakdown.reduce((sum,part)=>sum+part.points,0),0);
  assert.equal(extractStages('We invest only at seed.')?.exclusive,true);
});
