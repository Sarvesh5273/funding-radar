import { readdir, readFile, writeFile } from 'node:fs/promises';
import type { ResearchRun } from '../src/shared/types.js';
import { DEMO_STARTUPS } from '../src/shared/types.js';
import { normalizedIdentity, validDate, verifyRound } from '../src/server/verification.js';
import type { TinyFetchPage } from '../src/server/tinyfish.js';
const runs:ResearchRun[]=[];
for(const file of await readdir('data/public-runs'))if(file.endsWith('.json'))runs.push(JSON.parse(await readFile(`data/public-runs/${file}`,'utf8')));
const checks=[];
for(const example of DEMO_STARTUPS){
  const run=runs.filter(r=>r.input.description===example.description).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
  const failures:string[]=[];
  const sourceReplay={available:false,checkedCompanies:0,verifiedInvestmentEdges:0,failures:[] as string[]};
  const result=run?.result;
  if(!result||run.status!=='complete')failures.push('A complete genuine live result is required.');
  if(result){
    if(result.companies.length<10||!result.coverage.meetsMinimum)failures.push('At least ten verified distinct companies required.');
    if(new Set(result.companies.map(c=>normalizedIdentity(c.name))).size!==result.companies.length)failures.push('Duplicate company identities.');
    const evidence=new Map(result.evidence.map(e=>[e.id,e]));
    for(const company of result.companies){
      if(!validDate(company.roundDate)||company.roundDate<result.window.from||company.roundDate>result.window.to)failures.push(`${company.name}: out-of-window date.`);
      const source=evidence.get(company.evidenceId);
      if(!source||source.kind!=='investment'||source.url!==company.sourceUrl||!source.retrievedAt||source.contentHash.length!==64)failures.push(`${company.name}: missing or mismatched financing proof.`);
      if(!company.investors.length)failures.push(`${company.name}: no proven participating investor.`);
      for(const backing of company.investors){
        if(evidence.get(backing.evidenceId)?.kind!=='investment')failures.push(`${company.name}: missing investor edge proof.`);
        if(backing.leadPartner&&(!backing.partnerEvidenceId||evidence.get(backing.partnerEvidenceId)?.kind!=='partner'))failures.push(`${company.name}: missing named partner proof.`);
        if(backing.leadPartner&&backing.leadScope==='round'&&!backing.isLead)failures.push(`${company.name}: named round lead conflicts with investor lead status.`);
      }
    }
    for(const [index,investor] of result.investors.entries()){
      if(!investor.comparables.length||investor.comparables.some(id=>!result.companies.some(c=>c.id===id&&c.investors.some(b=>normalizedIdentity(b.investorName)===normalizedIdentity(investor.name)))))failures.push(`${investor.name}: unproved investor match.`);
      if(!investor.contacts.length)failures.push(`${investor.name}: missing outreach route.`);
      if(investor.cheque.value&&!investor.cheque.evidenceIds.length)failures.push(`${investor.name}: unsourced cheque range.`);
      for(const fact of [investor.cheque,investor.stages,investor.geographies])if(fact.value&&(fact.evidenceIds.length===0||fact.evidenceIds.some(id=>!evidence.has(id))))failures.push(`${investor.name}: unsupported investor fact.`);
      if(investor.eligibility==='ineligible')failures.push(`${investor.name}: excluded mandate remains in recommendations.`);
      if(investor.rank!==index+1)failures.push(`${investor.name}: unstable rank numbering.`);
      if(investor.eligibility==='supported'&&result.investors.slice(0,index).some(prior=>prior.eligibility==='unconfirmed'))failures.push(`${investor.name}: supported prospect appears after an unconfirmed candidate.`);
      if(Math.abs(investor.score-investor.breakdown.reduce((sum,p)=>sum+p.points,0))>0.11)failures.push(`${investor.name}: unexplained score.`);
      for(const partner of investor.leadPartners)if(evidence.get(partner.evidenceId)?.kind!=='partner'||!result.companies.some(c=>c.id===partner.companyId&&c.investors.some(b=>normalizedIdentity(b.investorName)===normalizedIdentity(investor.name)&&b.leadPartner===partner.name&&b.partnerEvidenceId===partner.evidenceId&&(b.leadScope||'round')===(partner.scope||'round'))))failures.push(`${investor.name}: unsourced or mismatched deal lead scope.`);
      for(const contact of investor.contacts){
        if(!contact.evidenceIds.length||contact.evidenceIds.some(id=>!evidence.has(id)))failures.push(`${investor.name}: unsourced outreach route.`);
        if(contact.verified&&contact.type==='application'&&!contact.verificationLevel)failures.push(`${investor.name}: application lacks destination-versus-form disclosure.`);
        if(contact.verificationLevel==='form'&&contact.requiresLogin)failures.push(`${investor.name}: login destination misrepresented as a checked form.`);
      }
    }
    if(!result.usage.some(e=>e.endpoint==='TinySet'&&e.status==='success'&&e.resourceId===result.datasetId))failures.push('Missing completed TinySet provenance.');
    const botree=result.companies.find(c=>c.name==='Botree Recycling Technologies');
    if(botree&&(botree.investors.length!==1||botree.investors[0].investorName!=='Taiping Science and Technology Innovation Fund'))failures.push('Botree fund identity was incorrectly split.');
    const bonventure=result.investors.find(i=>i.name==='BonVenture');
    if(bonventure?.cheque.value&&(bonventure.cheque.value.currency!=='EUR'||bonventure.cheque.value.min!==1000000||bonventure.cheque.value.max!==2500000||bonventure.cheque.value.minUsd!==null||bonventure.cheque.value.maxUsd!==null))failures.push('BonVenture decimal-comma cheque bounds are inaccurate.');
    const investible=result.investors.find(i=>i.name==='Investible');
    if(investible?.cheque.value&&(investible.cheque.value.currency!=='AUD'||investible.cheque.value.min!==250000||investible.cheque.value.max!==1500000||investible.cheque.value.minUsd!==null||investible.cheque.value.maxUsd!==null))failures.push('Investible AUD cheque range is inaccurate.');
    try{
      const saved=JSON.parse(await readFile(`data/private/runs/${run.id}.json`,'utf8'));
      const pages=Object.values(saved.checkpoint?.sourcePages||{}) as TinyFetchPage[];
      sourceReplay.available=pages.length>0;
      for(const company of result.companies){
        const page=pages.find(p=>p.url===company.sourceUrl||p.final_url===company.sourceUrl);
        if(!page){sourceReplay.failures.push(`${company.name}: source cache missing.`);continue;}
        const proof=verifyRound({...company,investors:company.investors.map(i=>i.investorName),proposedExcerpt:''},page,result.window);
        sourceReplay.checkedCompanies++;
        if(!proof.accepted){sourceReplay.failures.push(`${company.name}: ${proof.reason}`);continue;}
        const proved=new Set(proof.investors.map(i=>normalizedIdentity(i.name)));
        for(const backing of company.investors)if(proved.has(normalizedIdentity(backing.investorName)))sourceReplay.verifiedInvestmentEdges++;else sourceReplay.failures.push(`${company.name}: ${backing.investorName} edge not recovered.`);
      }
      failures.push(...sourceReplay.failures);
    }catch{/* Public checkout validation remains available without private source caches. */}
  }
  const contacts=result?.investors.flatMap(i=>i.contacts)||[];
  const successfulUsage=result?.usage.filter(e=>e.status==='success')||[];
  const endpoints=[...new Set(successfulUsage.map(e=>e.endpoint))];
  const endpointEvidence=endpoints.map(endpoint=>({endpoint,successfulEvents:successfulUsage.filter(e=>e.endpoint===endpoint).length,resourceIds:[...new Set(successfulUsage.filter(e=>e.endpoint===endpoint).map(e=>e.resourceId).filter(Boolean))],example:successfulUsage.find(e=>e.endpoint===endpoint)}));
  const check={example:example.id,runId:run?.id||null,completedAt:run?.updatedAt||null,datasetId:result?.datasetId||null,companies:result?.companies.length||0,investmentEdges:result?.companies.reduce((sum,c)=>sum+c.investors.length,0)||0,investors:result?.investors.length||0,endpoints,endpointEvidence,verifiedPublicForms:contacts.filter(c=>c.verified&&c.verificationLevel==='form').length,verifiedPublicDestinations:contacts.filter(c=>c.verified&&c.verificationLevel==='destination'&&!c.requiresLogin).length,verifiedPublicApplicationDestinations:contacts.filter(c=>c.verified&&c.verificationLevel==='destination'&&!c.requiresLogin&&c.type==='application').length,verifiedDirectContactDestinations:contacts.filter(c=>c.verified&&c.verificationLevel==='destination'&&c.type==='open-intake').length,verifiedLoginDestinations:contacts.filter(c=>c.verified&&c.verificationLevel==='destination'&&c.requiresLogin).length,verifiedSharedInboxes:contacts.filter(c=>c.verified&&c.type==='open-intake'&&/^(?:Shared pitch inbox:|Direct founder contact:)/.test(c.label)).length,investorPublishedIntroRoutes:contacts.filter(c=>c.type==='warm-intro'&&c.verified).length,suggestedIntroRoutes:contacts.filter(c=>c.type==='warm-intro').length,confirmedRoundLeads:result?.investors.flatMap(i=>i.leadPartners).filter(p=>p.scope!=='company').length||0,listedCompanyLeads:result?.investors.flatMap(i=>i.leadPartners).filter(p=>p.scope==='company').length||0,sourcedChequeRanges:result?.investors.filter(i=>i.cheque.value).length||0,investorsWithoutNamedRoundLead:result?.investors.filter(i=>!i.leadPartners.some(p=>p.scope!=='company')).length||0,unknownCheques:result?.investors.filter(i=>!i.cheque.value).length||0,eligibilitySupported:result?.investors.filter(i=>i.eligibility==='supported').length||0,eligibilityUnconfirmed:result?.investors.filter(i=>i.eligibility==='unconfirmed').length||0,sourceReplay,pass:failures.length===0,failures};checks.push(check);
  console.log(JSON.stringify(check));
}
const report={checkedAt:new Date().toISOString(),pass:checks.length===3&&checks.every(c=>c.pass),checks,note:'Structural gates include cached financing replay when private source pages are available. Unknown partner/cheque disclosures and unconfirmed market eligibility remain visible; passing does not establish complete bounty compliance or predict approval.'};
await writeFile('docs/live-demo-validation.json',JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
