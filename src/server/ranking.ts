import { createHash } from 'node:crypto';
import type { ComparableCompany, RankedInvestor, SourcedFact, StartupInput, ScorePart, ContactRoute } from '../shared/types.js';
import { normalizedIdentity } from './verification.js';
export const WEIGHTS = { similarity:40, stage:20, geography:15, cheque:10, repeated:10, recency:5 };
export interface InvestorProfile {
  name:string;website:string|null;
  cheque:RankedInvestor['cheque'];stages:SourcedFact<string[]>;geographies:SourcedFact<string[]>;
  contacts:ContactRoute[];caveats:string[];
}
export function stageIndex(stage: string): number|null {
  const s=stage.toLowerCase().replace(/[_-]/g,' ');
  if(/pre\s+series\s+a/.test(s))return null;
  if(/pre\s*seed|angel/.test(s))return 0;
  if(/seed/.test(s))return 1;
  if(/series\s*a/.test(s))return 2;
  if(/series\s*b/.test(s))return 3;
  if(/series\s*[c-z]|growth|late/.test(s))return 4;
  return null;
}
export function countryIdentity(s:string):string {
  const v=s.toLowerCase().trim().replace(/[.]/g,'');
  return ({us:'united states',usa:'united states','united states of america':'united states',uk:'united kingdom',england:'united kingdom',de:'germany',in:'india'} as Record<string,string>)[v]||v;
}
const REGIONS:Record<string,string[]>= {
  europe:['albania','andorra','austria','belarus','belgium','bosnia and herzegovina','bulgaria','croatia','cyprus','czechia','czech republic','denmark','estonia','finland','france','germany','greece','hungary','iceland','ireland','italy','latvia','liechtenstein','lithuania','luxembourg','malta','moldova','monaco','montenegro','netherlands','north macedonia','norway','poland','portugal','romania','san marino','serbia','slovakia','slovenia','spain','sweden','switzerland','ukraine','united kingdom'],
  'north america':['united states','canada','mexico'],
  'southeast asia':['singapore','indonesia','malaysia','thailand','vietnam','philippines','cambodia','laos','myanmar','brunei','timor-leste'],
  'south asia':['india','pakistan','bangladesh','sri lanka','nepal','bhutan','maldives'],
  'european union':['austria','belgium','bulgaria','croatia','cyprus','czechia','czech republic','denmark','estonia','finland','france','germany','greece','hungary','ireland','italy','latvia','lithuania','luxembourg','malta','netherlands','poland','portugal','romania','slovakia','slovenia','spain','sweden'],
};
REGIONS.eu=REGIONS['european union'];
export function coversMarket(markets:string[],country:string):boolean {
  const target=countryIdentity(country);
  return markets.some(market=>{
    const key=countryIdentity(market);
    return /^(?:global|worldwide)$/i.test(key)||key===target||REGIONS[key]?.includes(target);
  });
}
export function selectProfileCandidates<T extends Pick<RankedInvestor,'name'|'comparables'>>(ranked:T[],companies:Array<Pick<ComparableCompany,'id'|'country'>>,country:string,limit=20):T[] {
  const selected:T[]=[];const names=new Set<string>();
  const add=(investor:T|undefined)=>{if(!investor||selected.length>=limit)return;const key=normalizedIdentity(investor.name);if(!names.has(key)){names.add(key);selected.push(investor);}};
  // Preserve one prospect per local comparable before a large syndicate from
  // a single company can consume the entire investor research budget.
  for(const company of companies.filter(c=>countryIdentity(c.country)===countryIdentity(country)))add(ranked.find(i=>i.comparables.includes(company.id)));
  for(const investor of ranked)add(investor);
  return selected;
}
export function rankInvestors(input:StartupInput,companies:ComparableCompany[],profiles:Map<string,InvestorProfile>,asOf:string):RankedInvestor[] {
  const groups=new Map<string,{name:string;companies:ComparableCompany[]}>();
  for(const company of companies)for(const backing of company.investors){
    const key=normalizedIdentity(backing.investorName);
    if(!groups.has(key))groups.set(key,{name:backing.investorName,companies:[]});
    const list=groups.get(key)!.companies;if(!list.some(c=>c.id===company.id))list.push(company);
  }
  const stage=stageIndex(input.stage);
  return [...groups.entries()].map(([key,group])=>{
    const profile=profiles.get(key);
    const comps=group.companies.sort((a,b)=>b.similarity-a.similarity||b.roundDate.localeCompare(a.roundDate));
    const maxSimilarity=Math.max(...comps.map(c=>c.similarity));
    const knownDistances=comps.map(c=>stageIndex(c.roundStage)).filter((x):x is number=>x!==null).map(x=>Math.abs(x-(stage??0)));
    const declaredStages=profile?.stages.value?.map(stageIndex).filter((x):x is number=>x!==null)||[];
    const stageDistance=Math.min(...(declaredStages.length?declaredStages.map(x=>Math.abs(x-(stage??0))):knownDistances));
    const stagePoints=stageDistance===0?20:stageDistance===1?8:0;
    const local=comps.filter(c=>countryIdentity(c.country)===countryIdentity(input.country));
    const publishedMarkets=profile?.geographies.value||[];
    const declaredGeography=coversMarket(publishedMarkets,input.country);
    const countryPoints=publishedMarkets.length?(declaredGeography?15:0):(local.length?15:0);
    const ineligible=!!(profile?.stages.exclusive&&declaredStages.length&&stageDistance!==0)||!!(profile?.geographies.exclusive&&publishedMarkets.length&&!declaredGeography);
    const eligibility:NonNullable<RankedInvestor['eligibility']>=ineligible?'ineligible':stageDistance===0&&countryPoints>0?'supported':'unconfirmed';
    const cheque=profile?.cheque||{value:null,evidenceIds:[]};
    const chequeFit=cheque.value&&cheque.value.minUsd!=null&&cheque.value.maxUsd!=null&&input.targetChequeUsd!=null&&input.targetChequeUsd>=cheque.value.minUsd&&input.targetChequeUsd<=cheque.value.maxUsd;
    const latest=Math.max(...comps.map(c=>Date.parse(c.roundDate)));
    const ageDays=Math.max(0,(Date.parse(asOf)-latest)/86400000);
    const recency=Math.max(0,5*(1-ageDays/(input.lookbackMonths*30.4375)));
    const repeat=Math.min(10,Math.max(0,comps.length-1)*5);
    const breakdown:ScorePart[]=[
      {key:'similarity',label:'Product & customer fit',points:round(maxSimilarity*40),maxPoints:40,reason:`Closest funded analogue: ${comps[0].name}. ${comps[0].similarityReason}`},
      {key:'stage',label:'Stage fit',points:stagePoints,maxPoints:20,reason:stagePoints===20?`${declaredStages.length?'The sourced stage mandate':'A proven comparable round'} includes your ${input.stage} stage.`:stagePoints===8?`${declaredStages.length?'The published mandate':'Proven activity'} is one funding stage away.`:(knownDistances.length||declaredStages.length)?'The applicable stage evidence is two or more stages away.':'No explicit stage evidence; no points awarded.'},
      {key:'geography',label:'Market activity',points:countryPoints,maxPoints:15,reason:publishedMarkets.length?declaredGeography?`The published ${publishedMarkets.join(', ')} mandate covers ${input.country}.`:`The published ${publishedMarkets.join(', ')} mandate does not confirm ${input.country}.`:local.length?`Backed ${local.map(c=>c.name).join(', ')} in ${input.country}. This proves activity, not an unrestricted geographic mandate.`:`No proven investment or stated mandate in ${input.country}; review eligibility.`},
      {key:'cheque',label:'Cheque fit',points:chequeFit?10:0,maxPoints:10,reason:!input.targetChequeUsd?'No target cheque supplied.':!cheque.value?'Typical investor cheque is not publicly evidenced; no points awarded.':cheque.value.minUsd==null||cheque.value.maxUsd==null?`Published range is ${cheque.value.label}; no USD conversion or currency assumption is made, so no cheque-fit points are awarded.`:chequeFit?`Your target fits the stated ${cheque.value.label} cheque range.`:`Your target is outside the stated ${cheque.value.label} range.`},
      {key:'repeated',label:'Repeated conviction',points:repeat,maxPoints:10,reason:`${comps.length} distinct comparable ${comps.length===1?'investment':'investments'} verified; repeat points start at the second company.`},
      {key:'recency',label:'Recent activity',points:round(recency),maxPoints:5,reason:`Most recent proven comparable financing: ${new Date(latest).toISOString().slice(0,10)}.`}
    ];
    const caveats=[...(profile?.caveats||[])];
    if(!cheque.value)caveats.push('Typical cheque size not disclosed in the checked sources. Round size is never treated as cheque size.');
    else if(cheque.value.minUsd==null)caveats.push('The published cheque range is retained in its original currency; no exchange-rate conversion or assumption is used for USD fit.');
    if(!countryPoints)caveats.push('Your country is not confirmed by this research.');
    if(!stagePoints)caveats.push('Stage fit is unconfirmed or materially different.');
    if(declaredStages.length&&stageDistance>0)caveats.push(`Published stages (${profile!.stages.value!.join(', ')}) differ from your ${input.stage} stage; comparable deals do not override the stated mandate.`);
    if(publishedMarkets.length&&!declaredGeography)caveats.push(`Published geographic mandate (${publishedMarkets.join(', ')}) does not confirm your country, even if a comparable company is headquartered there.`);
    if(ineligible)caveats.push('Known ineligible for this input: an explicitly exclusive published stage or geographic requirement is not met. Exclude from outreach recommendations.');
    if(ineligible)for(const part of breakdown){part.points=0;part.reason+= ' Score is gated to zero by the exclusive eligibility requirement.';}
    const leadPartners=comps.flatMap(c=>c.investors.filter(b=>normalizedIdentity(b.investorName)===key&&b.leadPartner&&b.partnerEvidenceId).map(b=>({name:b.leadPartner!,companyId:c.id,evidenceId:b.partnerEvidenceId!,scope:b.leadScope||'round'})));
    const contacts=profile?.contacts.length?profile.contacts:[{
      type:'warm-intro' as const,label:`Suggested intro via ${comps[0].name}`,url:comps[0].website,
      detail:`Ask a founder at ${comps[0].name}, which this investor demonstrably backed, whether they are willing to introduce you. This is a suggested route; no relationship or intro availability is claimed.`,evidenceIds:[comps[0].evidenceId],verified:false
    }];
    const observedStages=comps.filter(c=>stageIndex(c.roundStage)!==null);
    const shownStages=profile?.stages.value?{...profile.stages,basis:'declared' as const}:{value:observedStages.length?[...new Set(observedStages.map(c=>c.roundStage))]:null,evidenceIds:[...new Set(observedStages.map(c=>c.evidenceId))],basis:'observed' as const};
    return {id:createHash('sha256').update(key).digest('hex').slice(0,16),name:group.name,rank:0,score:ineligible?0:round(breakdown.reduce((s,p)=>s+p.points,0)),eligibility,website:profile?.website||null,explanation:ineligible?`An explicitly exclusive published requirement excludes your ${input.stage} startup in ${input.country}.`: `${comps[0].name} provides the closest product/customer match. ${stagePoints===20?`Evidence includes your ${input.stage} stage.`:'Stage fit requires review.'} ${declaredGeography?`The published market mandate covers ${input.country}.`:local.length&&!publishedMarkets.length?`${local.length} proven ${input.country} ${local.length===1?'deal':'deals'}.`:'Country eligibility requires confirmation.'} ${comps.length>1?`${comps.length} relevant investments establish repeated activity.`:''}`.trim(),comparables:comps.map(c=>c.id),cheque,stages:shownStages,geographies:profile?.geographies||{value:null,evidenceIds:[]},leadPartners,contacts,breakdown,caveats:[...new Set(caveats)]};
  }).sort((a,b)=>eligibilityTier(a.eligibility)-eligibilityTier(b.eligibility)||b.score-a.score||a.name.localeCompare(b.name)).map((i,k)=>({...i,rank:k+1}));
}
function eligibilityTier(value:RankedInvestor['eligibility']):number{return value==='supported'?0:value==='ineligible'?2:1;}
function round(n:number):number{return Math.round(n*10)/10;}
