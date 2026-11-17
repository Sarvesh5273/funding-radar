import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const report={checkedAt:new Date().toISOString(),modes:[],errors:[]};
const browser=await chromium.launch({headless:true});
const cases=[{country:'United States',slug:'us',title:'AI customer support'},{country:'India',slug:'india',title:'B2B payments'},{country:'Germany',slug:'germany',title:'Battery circularity'}];
const live=await fetch('http://127.0.0.1:3000/api/demos').then(r=>r.json());
if(live.runs.length!==3||live.runs.some(r=>r.status!=='complete'||!r.result?.coverage.meetsMinimum||r.result.rankingMethod.version!=='evidence-fit-v2'))throw new Error('Final real demo gate/version not complete.');
for(const mode of [{name:'live',url:'http://127.0.0.1:3000/'},{name:'reviewer',url:'http://127.0.0.1:4173/'}]){
  const context=await browser.newContext({viewport:{width:1440,height:1120},acceptDownloads:true,reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[],failed=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await page.goto(mode.url);await page.getByRole('heading',{name:'Tell us what you’re building.'}).waitFor();
  if(mode.name==='reviewer'){
    await page.getByRole('region',{name:'Reviewer replay disclosure'}).waitFor();
    if(!(await page.locator('#startup-description').isDisabled()))throw new Error('Replay permits new inputs.');
    if(await page.locator('.setup-note').count())throw new Error('Replay shows live server setup as an error.');
  }
  await page.screenshot({path:`artifacts/final-${mode.name}-home.png`,fullPage:true});
  const checked=[];
  for(const item of cases){
    const saved=live.runs.find(run=>run.input.country===item.country);
    await page.locator('.saved-section select').selectOption(saved.id);await page.locator('.result-workspace').waitFor();
    await page.locator('.minimum-stat').filter({hasText:'10-company minimum met'}).waitFor();
    const count=Number(await page.locator('.result-stats>div').first().locator('strong').textContent());
    if(count<10)throw new Error(`Minimum failure: ${mode.name}/${item.country}`);
    await page.locator('.results-intro').evaluate(e=>e.scrollIntoView({block:'start'}));
    await page.screenshot({path:`artifacts/final-${mode.name}-${item.slug}.png`});
    for(const tab of ['Companies','Evidence','Investors']){
      await page.getByRole('tab',{name:new RegExp(tab)}).click();
      if(!(await page.getByRole('tab',{name:new RegExp(tab)}).getAttribute('aria-selected')==='true'))throw new Error('Tab selection failed.');
    }
    const exported={};
    for(const format of ['JSON','CSV']){
      const promise=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();const download=await promise;
      const downloaded=await fs.readFile(await download.path(),'utf8');
      if(format==='JSON'){
        const result=JSON.parse(downloaded);if(result.startup.country!==item.country||!result.coverage.meetsMinimum||result.rankingMethod.version!=='evidence-fit-v2')throw new Error('JSON export does not match final case/version.');const tiers={supported:0,unconfirmed:1,ineligible:2};for(let index=1;index<result.investors.length;index++){const previous=result.investors[index-1],current=result.investors[index];if(tiers[previous.eligibility]>tiers[current.eligibility]||(previous.eligibility===current.eligibility&&previous.score<current.score))throw new Error('Export violates eligibility-tier ranking.');}exported.json={companies:result.companies.length,investors:result.investors.length,version:result.rankingMethod.version,bytes:downloaded.length};
      }else{if(!downloaded.split('\n')[0].includes('investment_source_links'))throw new Error('CSV missing investment proof column.');exported.csv={bytes:downloaded.length,header:downloaded.split('\n')[0]};}
    }
    const invalidLinks=await page.locator('.result-workspace a').evaluateAll(nodes=>nodes.filter(node=>!/^https?:\/\//.test(node.href)).map(node=>node.href));
    if(invalidLinks.length)throw new Error('Invalid evidence links.');
    checked.push({country:item.country,companies:count,exports:exported});
  }
  await page.setViewportSize({width:375,height:812});await page.locator('.results-intro').evaluate(e=>e.scrollIntoView({block:'start'}));
  await page.screenshot({path:`artifacts/final-${mode.name}-mobile.png`});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error(`${mode.name} mobile overflow.`);
  await page.setViewportSize({width:812,height:375});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error(`${mode.name} landscape overflow.`);
  if(mode.name==='reviewer'&&posts.length)throw new Error('Replay submitted a POST.');
  report.modes.push({name:mode.name,cases:checked,errors,failed,posts,mobileOverflow:overflow});
  report.errors.push(...errors,...failed.map(e=>`${e.url}: ${e.error}`));await context.close();
}
await browser.close();
await fs.writeFile('artifacts/final-qa.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(report.errors.length)throw new Error('Browser errors detected.');
