import { createHash } from 'node:crypto';
import type { TinyDatasetRow, TinyFetchPage } from './tinyfish.js';
import { publicUrl } from './security.js';

export interface Candidate {
  id: string; name: string; description: string; country: string; website: string|null;
  roundDate: string; roundStage: string; roundAmount: string|null; investors: string[];
  sourceUrl: string|null; proposedExcerpt: string;
}
export function normalizeText(s: string): string {
  return s.normalize('NFKC').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&(?:nbsp|#160);/g,' ').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/[*_#`]/g,'').replace(/\s+/g,' ').trim();
}
export function entityMention(text: string, name: string): boolean {
  const clean = normalizeText(name).toLowerCase().replace(/\s+(inc\.?|llc|ltd\.?)$/,'');
  if (!clean) return false;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'iu').test(normalizeText(text));
}
export function investorNames(value: unknown): string[] {
  let items: unknown[] = [];
  if (Array.isArray(value)) items=value;
  else if (typeof value==='string') {
    try { const parsed=JSON.parse(value); if(Array.isArray(parsed))items=parsed; } catch { items=value.split(/[,;\n]/); }
  }
  return [...new Set(items.map(x=>typeof x==='string'?x:typeof x==='object'&&x!==null?String((x as any).name??''):'').map(x=>x.trim().replace(/\s*\((?:lead|co-lead|co-led|existing|new)(?:\s+investor)?\)\s*$/i,'')).filter(x=>x.length>=2&&x.length<=100&&!/^(undisclosed|unknown|n\/a|none|investors?|group|capital|ventures|angels?|syndicate|high.net.worth individuals)$/i.test(x)&&! /(?:^(?:founders? of|angel investors?|strategic investors?|\d+\s+(?:crowdfunding )?investors)|(?:unnamed|undisclosed|US-based|U\.S\.-based)\s+(?:angel|individual|investor))/i.test(x)))].slice(0,20);
}
export function candidateFromRow(row: TinyDatasetRow): Candidate {
  const d=row.data, str=(k:string)=>typeof d[k]==='string'?String(d[k]).trim():'';
  return {id:row._id,name:str('company_name'),description:str('company_description'),country:str('country'),website:publicUrl(d.company_url),roundDate:str('funding_date').slice(0,10),roundStage:str('funding_stage')||'undisclosed',roundAmount:/^(undisclosed|unknown|n\/a)$/i.test(str('funding_amount'))?null:str('funding_amount')||null,investors:investorNames(d.investors),sourceUrl:publicUrl(d.funding_source_url),proposedExcerpt:str('funding_excerpt')};
}
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
}
export function extractDates(text: string): string[] {
  const normalized=normalizeText(text);
  const dates:string[]=[];
  for(const m of normalized.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g))dates.push(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  const months='January February March April May June July August September October November December'.split(' ');
  const monthMap=new Map(months.flatMap((m,i)=>[[m.toLowerCase(),i+1],[m.slice(0,3).toLowerCase(),i+1]] as [string,number][]));
  monthMap.set('sept',9);
  const mPattern='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  for(const m of normalized.matchAll(new RegExp(`\\b(${mPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`,'gi')))dates.push(`${m[3]}-${String(monthMap.get(m[1].toLowerCase())).padStart(2,'0')}-${m[2].padStart(2,'0')}`);
  for(const m of normalized.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${mPattern})\\.?[,]?\\s+(20\\d{2})\\b`,'gi')))dates.push(`${m[3]}-${String(monthMap.get(m[2].toLowerCase())).padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  return [...new Set(dates.filter(validDate))];
}
export const FINANCING = /\b(rais(?:e[ds]?|ing)|funding|financ(?:ing|ed)|invest(?:ed|ment|ing)|led|backed|participat(?:ed|ion)|seed|series\s+[a-f])\b/i;
const ROUND = /\b(?:round|raise|funding|financing|investment|equity|seed|series\s+[a-f])\b/i;
function sentences(text: string): string[] { return normalizeText(text).split(/(?<=[.!?])\s+/).filter(Boolean); }
function statedMonths(text:string):string[] {
  const months='January February March April May June July August September October November December'.split(' ');
  const pattern=months.map(month=>month==='September'?'Sep(?:t(?:ember)?)?':`${month.slice(0,3)}(?:${month.slice(3)})?`).join('|');
  return [...normalizeText(text).matchAll(new RegExp(`\\b(${pattern})\\.?\\s+(?:of\\s+)?(20\\d{2})\\b`,'gi'))].map(match=>`${match[2]}-${String(months.findIndex(month=>month.slice(0,3).toLowerCase()===match[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}`);
}
function selectTransactionStage(context:string,candidate:Candidate):string {
  return sentences(context).map(sentence=>{
    const stages=[...sentence.matchAll(/\b(pre[- ]seed|seed|series\s+[a-f])\b/gi)].map(match=>disclosedStage(match[0]));
    if(new Set(stages).size<2)return sentence;
    const parts=sentence.split(/\s+and\s+(?:an?\s+)?(?=(?:US\$|USD|EUR|GBP|\$|€|£|₹)\s*\d)/i);
    const wanted=candidate.roundStage.toLowerCase().replace(/[_-]/g,' ');
    const selected=parts.find(part=>disclosedStage(part).toLowerCase().replace(/[_-]/g,' ')===wanted);
    if(selected)return selected;
    if(parts.length>1) {
      const priority=(part:string)=>{
        const stage=disclosedStage(part);
        return /^Series [A-F]$/.test(stage)?stage.charCodeAt(stage.length-1)-63:stage==='seed'?1:stage==='pre-seed'?0:-1;
      };
      return [...parts].sort((a,b)=>priority(b)-priority(a))[0];
    }
    return sentence;
  }).join(' ');
}
function fundedActor(text: string, name: string): boolean {
  const normalized=normalizeText(text);
  const escaped=normalizeText(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const subject=new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])(?:['’]s)?(?:,?[^.!?]{0,240}?)\\b(raised|raises|raising|bags|secured|closed|closes|completed|announced|announces|received|receives|funding|financing|series|seed)\\b`,'iu');
  if(subject.test(normalized)) {
    // If the candidate only appears as a client or sponsor it cannot be the funded actor.
    const clauses=normalized.split(/(?<=[.!?])\s+/);
    return clauses.some(c=>subject.test(c)&&!new RegExp(`(?:customer|client|sponsor|user)(?:s| including| such as| include| of)*[^.!?]{0,70}${escaped}`,'iu').test(c));
  }
  return new RegExp(`\\b(?:investment in|invested in|funding for|backing)\\s+${escaped}(?![\\p{L}\\p{N}])`,'iu').test(normalized);
}
function foreignFundedActor(text: string, name: string): boolean {
  // A transaction for a different named company terminates the context. This
  // prevents adjacent announcements in news digests from sharing investors.
  const normalized=normalizeText(text);
  for (const match of normalized.matchAll(/(?:^|[.!?]\s+)([A-Z][\p{L}\p{N}.&'-]*(?:\s+[A-Z][\p{L}\p{N}.&'-]*){0,3})\s+(?:has\s+|today\s+)?(?:raised|raises|secured|closed|announced)\b/gu)) {
    const actor=match[1];
    if (!/^(?:The Company|The Round|The Funding|The Investment|We|It|This)$/i.test(actor) && !entityMention(actor,name)) return true;
  }
  return false;
}
function fundingRelation(text: string, company: string): boolean {
  if (/(?:customer|client|sponsor|technology partner|product beta|product launch|commercial partner)/i.test(text)) return false;
  const round=ROUND.test(text);
  return (/\b(?:co-?led\s+by|led\s+by|led\s+(?:the|this|its|a)|leading\s+(?:the|this|its|a))\b/i.test(text) && round)
    || (/\b(?:participat(?:ion|ed|ing)|joined)\b/i.test(text) && round)
    || /\b(?:investors?|backers?)\s+(?:in\s+(?:the|this)\s+round\s+)?(?:include[ds]?|are|were|such as)\b/i.test(text)
    || /\b(?:funding|financing|capital|investment)\s+(?:came\s+)?from\b/i.test(text)
    || (/\bbacked\s+by\b/i.test(text) && round)
    || (/\b(?:invested\s+in|investment\s+in)\b/i.test(text) && entityMention(text,company))
    || /^with\s+participation\s+from\b/i.test(text);
}
function financeContexts(page: TinyFetchPage, candidate:Candidate): string[] {
  const company=candidate.name;
  const paragraphs=(page.text||'').split(/\n\s*\n/).map(normalizeText).filter(Boolean);
  const title=normalizeText(page.title||'');
  const fromTitle=fundedActor(title,company)&&ROUND.test(title);
  const titlePosition=paragraphs.findIndex(p=>fundedActor(p,company)&&ROUND.test(p));
  let firstParty=false;
  if(candidate.website) {
    const target=new URL(candidate.website),source=new URL(page.final_url||page.url);
    const host=target.hostname.replace(/^www\./,'').replace(/[^\p{L}\p{N}]/gu,'');
    const brand=normalizedIdentity(company).replace(/(?:labs|technologies|technology)$/,'');
    const contentBrand=normalizedIdentity(`${page.title||''} ${page.description||''} ${(page.text||'').slice(0,4000)}`);
    firstParty=target.hostname.replace(/^www\./,'')===source.hostname.replace(/^www\./,'')&&brand.length>=3&&host.includes(brand)&&contentBrand.includes(brand);
  }
  const contexts:string[]=[];
  for(let p=0;p<paragraphs.length;p++) {
    const parts=sentences(paragraphs[p]);
    for(let i=0;i<parts.length;i++) {
      const anchor=parts[i];
      const explicit=fundedActor(anchor,company)&&ROUND.test(anchor);
      const selfAnchor=firstParty&&(/\bwe(?:'ve|\s+have)?\s+(?:just\s+|successfully\s+)?(?:raised|secured|closed)\b/i.test(anchor)||/\bwe[^.!?]{0,100}\bannounc(?:e|ed|ing)\s+(?:our\b|that\s+we\b|(?:US\$|USD|\$|€|£|₹)\s*\d)/i.test(anchor))&&ROUND.test(anchor);
      const nearbyIdentity=[...parts.slice(Math.max(0,i-2),i),...paragraphs.slice(Math.max(0,p-2),p)].reverse().find(s=>entityMention(s,company));
      const pronounAnchor=!!nearbyIdentity&&!foreignFundedActor(nearbyIdentity,company)&&/^(?:The company|The startup|This company|It)\s+(?:has\s+|today\s+)?(?:raised|raises|secured|closed|announced)\b/i.test(anchor)&&ROUND.test(anchor)&&!foreignFundedActor(anchor,company);
      const titleRange=titlePosition>=0?p>=titlePosition&&p<=titlePosition+8:p<3;
      const titleAnchor=fromTitle&&titleRange&&i<3&&ROUND.test(anchor)&&/\b(?:announced|announce|raised|raises|round\s+(?:was|is)|leading|led\s+by)\b/i.test(anchor)&&!foreignFundedActor(anchor,company);
      if(!explicit&&!titleAnchor&&!selfAnchor&&!pronounAnchor)continue;
      if(foreignFundedActor(anchor,company))continue;
      const current=[anchor];
      for(let j=i+1;j<parts.length;j++) {
        if(foreignFundedActor(parts[j],company))break;
        if(fundingRelation(parts[j],company)||/^(?:The|This|That|Our|Its)\s+(?:new\s+)?(?:round|raise|funding|investment|financing)\b/i.test(parts[j]))current.push(parts[j]);
      }
      // Only transaction continuations can extend a context across paragraphs.
      // Product descriptions, customer quotes, and another company's round stop it.
      for(let next=p+1;next<Math.min(p+4,paragraphs.length);next++) {
        const para=paragraphs[next];
        if(foreignFundedActor(para,company)||! /^(?:(?:The|This|That|Our|Its)\s+(?:new\s+)?(?:round|raise|funding|investment|financing)|(?:Other|Existing|Participating|New)\s+(?:investors|backers)|Investors\s+(?:in|include)|With\s+participation|Led\s+by|Co-led\s+by)/i.test(para))break;
        current.push(para);
      }
      contexts.push(current.join(' ').slice(0,2400));
    }
  }
  return [...new Set(contexts)];
}
function disclosedStage(context: string): string {
  const stage=normalizeText(context).match(/\b(pre[- ]seed|seed|series\s+[a-f]|growth\s+(?:round|funding))\b/i)?.[1];
  if(!stage)return 'undisclosed';
  if(/^series/i.test(stage))return `Series ${stage.slice(-1).toUpperCase()}`;
  return stage.toLowerCase().replace('pre seed','pre-seed').replace(/\s+(?:round|funding)$/,'');
}
function moneyValues(text: string): Array<{value:number;currency:string;start:number;end:number}> {
  const matches:Array<{value:number;currency:string;start:number;end:number}>=[];
  const regex=/(US\$|USD\s*|\$|€|EUR\s*|£|GBP\s*|₹|INR\s*)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(billion|million|thousand|[bmk])?\b/gi;
  for(const m of text.matchAll(regex)) {
    const unit=(m[3]||'').toLowerCase();
    const scale=/^(b|billion)$/.test(unit)?1e9:/^(m|million)$/.test(unit)?1e6:/^(k|thousand)$/.test(unit)?1e3:1;
    const prefix=m[1].trim();
    const currency=/^(?:US\$|USD|\$)$/i.test(prefix)?'USD':/^(?:€|EUR)$/i.test(prefix)?'EUR':/^(?:£|GBP)$/i.test(prefix)?'GBP':'INR';
    matches.push({value:Number(m[2].replaceAll(',',''))*scale,currency,start:m.index!,end:m.index!+m[0].length});
  }
  return matches;
}
function disclosedAmount(proposed: string|null, context: string): string|null {
  if(!proposed)return null;
  const expected=moneyValues(normalizeText(proposed));
  if(expected.length!==1)return null;
  const text=normalizeText(context);
  for(const amount of moneyValues(text)) {
    if(amount.value!==expected[0].value||amount.currency!==expected[0].currency)continue;
    const before=text.slice(Math.max(0,amount.start-70),amount.start);
    const after=text.slice(amount.end,amount.end+60);
    if(/(?:cumulative|total(?:\s+funding)?|valuation|valued|bringing[^.!?]{0,40})(?:\s+(?:of|to|at|is|now|raised|capital))*\s*$/i.test(before)||/^\s*(?:in\s+)?(?:cumulative|total\s+funding|valuation)/i.test(after))continue;
    if(/\b(?:raised|raises|secured|closed|announced|funding|financing|round|investment)\b/i.test(before)||/^\s*(?:in\s+)?(?:pre[- ]seed|seed|series\s+[a-f]|funding|financing|round|investment)/i.test(after))return proposed;
  }
  return null;
}
export interface VerifiedRound {
  accepted: boolean; reason: string; excerpt: string; text: string;
  investors: Array<{name:string;quote:string;isLead:boolean}>;
  dateEvidence: string|null;
  roundStage: string;
  roundAmount: string|null;
}
export function verifyRound(candidate: Candidate, page: TinyFetchPage, window:{from:string;to:string}): VerifiedRound {
  const reject=(reason:string):VerifiedRound=>({accepted:false,reason,excerpt:'',text:'',investors:[],dateEvidence:null,roundStage:'undisclosed',roundAmount:null});
  if(!candidate.name||candidate.description.length<15)return reject('Missing substantive company identity or product description.');
  if(!validDate(candidate.roundDate)||candidate.roundDate<window.from||candidate.roundDate>window.to)return reject('Financing date is invalid or outside the requested calendar window.');
  if(!candidate.sourceUrl||!publicUrl(page.final_url||page.url))return reject('No valid public funding source.');
  const text=normalizeText(page.text||'');
  if(text.length<100)return reject('Funding source could not be read; snippets are insufficient.');
  const sourceDates=extractDates((page.text||'').slice(0,7000));
  const published=page.published_date?.slice(0,10);
  if(published&&validDate(published)&&!sourceDates.includes(published))sourceDates.unshift(published);
  const exactDate=sourceDates.includes(candidate.roundDate);
  if(!exactDate)return reject('The supplied financing date is not independently present in the fetched source or publication metadata.');
  const sourceContexts=financeContexts(page,candidate);
  const contexts=sourceContexts.map(context=>selectTransactionStage(context,candidate));
  const originalContext=new Map(contexts.map((context,index)=>[context,sourceContexts[index]]));
  if(!contexts.length)return reject('Source does not identify this company as the recipient of this financing; portfolio/client mentions are insufficient.');
  const candidates=contexts.filter(c=>{
    const anchor=sentences(c)[0];
    if(/\b(?:planned|proposed|seeking|intends?\s+to|plans?\s+to|will\s+raise|hopes?\s+to|in\s+talks|targeting|expected\s+to)\b/i.test(anchor))return false;
    const positiveEquity=anchor.replace(/\bnon[- ]equity\b/gi,'non ownership capital');
    if(/\b(?:grants?|debt|credit\s+facility|loan\s+facility)\b/i.test(anchor)&&!/\bequity\b/i.test(positiveEquity))return false;
    if(/\bacqui(?:red|sition)\b/i.test(anchor)&&!/\b(?:equity|seed\s+(?:round|funding)|series\s+[a-f]\s+(?:round|funding))\b/i.test(anchor))return false;
    return true;
  });
  if(!candidates.length)return reject('Source describes debt or an acquisition rather than a qualifying equity round.');
  const datedContexts=candidates.filter(context=>{
    const full=originalContext.get(context)||context;
    const eventSentences=sentences(full).filter((s,index)=>index===0||fundedActor(s,candidate.name)||/^(?:The|This|That|Our|Its)\s+(?:new\s+)?(?:round|funding|investment|financing)\b/i.test(s));
    const dates=eventSentences.flatMap(extractDates);
    return !dates.length||dates.every(date=>date===candidate.roundDate);
  });
  if(!datedContexts.length)return reject('The financing passage dates a different event; publication metadata cannot update an old round.');
  const verified:VerifiedRound['investors']=[];
  for(const name of candidate.investors){
    for(const context of datedContexts){
      if(!entityMention(context,name))continue;
      const relation=sentences(context).find(s=>entityMention(s,name)&&fundingRelation(s,candidate.name));
      if(!relation)continue;
      const affiliation=relation.search(/\b(?:founders?|CEOs?)\s+of\b/i);
      if(affiliation>=0&&!entityMention(relation.slice(0,affiliation),name))continue;
      // A clearly historical financing sentence cannot prove participation in this round.
      if(/\b(?:previous(?:ly)?|prior|earlier|in\s+20[0-2][0-4])\b/i.test(relation))continue;
      const relationDates=extractDates(relation);
      if(relationDates.length&&!relationDates.includes(candidate.roundDate))continue;
      const months=statedMonths(relation);
      if(months.length&&months.some(month=>month!==candidate.roundDate.slice(0,7)))continue;
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const isLead=new RegExp(`(?:led by|co-led by)\\s+${escaped}(?![\\p{L}\\p{N}])`,'iu').test(relation)||new RegExp(`${escaped}[^.!?]{0,35}\\bled (?:the|this|its|a)\\b`,'iu').test(relation);
      verified.push({name,quote:relation,isLead});break;
    }
  }
  if(!verified.length)return reject('No named investor has an explicit financing relationship in the fetched announcement.');
  const best=datedContexts.find(c=>verified.some(v=>entityMention(c,v.name)))!;
  return {accepted:true,reason:'Company, event date and named investment relationships matched the live announcement.',excerpt:best,text,investors:verified,dateEvidence:candidate.roundDate,roundStage:disclosedStage(best),roundAmount:disclosedAmount(candidate.roundAmount,best)};
}
export function exactQuote(page: TinyFetchPage, quote: unknown): string|null {
  if(typeof quote!=='string'||quote.trim().length<12)return null;
  const normalized=normalizeText(quote);
  return normalizeText(page.text||'').includes(normalized)?normalized:null;
}
export function shortExcerpt(text: string, words=25): string {return normalizeText(text).split(/\s+/).slice(0,words).join(' ');}
export function contentHash(page:TinyFetchPage): string {return createHash('sha256').update(page.text||'').digest('hex');}
export function normalizedIdentity(name:string):string{return normalizeText(name).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').replace(/(?:inc|llc|ltd)$/,'');}
