import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:'artifacts/recordings',size:{width:1280,height:900}},acceptDownloads:true,reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(5000);const video=page.video();const posts=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
await page.goto('http://127.0.0.1:4173/');await page.getByRole('region',{name:'Reviewer replay disclosure'}).waitFor();await page.waitForTimeout(700);
for(const title of ['AI customer support','B2B payments','Battery circularity']){
  await page.getByRole('button',{name:new RegExp(title)}).first().click();await page.locator('.result-workspace').waitFor();await page.waitForTimeout(1200);
  await page.locator('.input-panel').evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(850);
  await page.locator('.results-intro').evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(900);
  if(title==='B2B payments'){
    const first=page.locator('.investor-card').first();if(await first.locator('.expand-button').getAttribute('aria-expanded')==='true')await first.locator('.expand-button').click();
    await first.evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(900);await page.screenshot({path:'artifacts/final-india-ranking.png'});
  }
  const intakeNames=title==='AI customer support'?['Khosla Ventures']:title==='Battery circularity'?['Investible','EIT Urban Mobility']:[];
  for(const name of intakeNames){
    const card=page.locator('.investor-card').filter({has:page.getByRole('heading',{name,exact:true})});
    if(await card.locator('.expand-button').getAttribute('aria-expanded')!=='true')await card.locator('.expand-button').click();
    await card.evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(650);
    await card.locator('.reach-section').evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(800);
    await page.screenshot({path:`artifacts/final-intake-${name==='Khosla Ventures'?'khosla':name==='Investible'?'investible':'eit'}.png`});
  }
}
await page.getByRole('button',{name:/AI customer support/}).first().click();await page.locator('.result-workspace').waitFor();await page.waitForTimeout(1200);
const hidden=page.locator('.investor-card').filter({has:page.getByRole('heading',{name:'Hidden Capital',exact:true})});
if(await hidden.locator('.expand-button').getAttribute('aria-expanded')!=='true')await hidden.locator('.expand-button').click();
await hidden.evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(1000);
const blake=await page.getByText('Blake Robbins',{exact:true}).boundingBox();if(!blake||blake.y<80||blake.y+blake.height>900)throw new Error('Blake partner proof not framed.');
await page.screenshot({path:'artifacts/final-partner-proof.png'});
await hidden.locator('.score-details summary').click();await hidden.locator('.score-details').evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(1000);
await page.getByRole('tab',{name:/Companies/}).click();await page.locator('.company-card').first().evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(900);
await page.getByRole('tab',{name:/Evidence/}).click();await page.getByRole('textbox',{name:'Filter evidence'}).fill('Blake');await page.locator('.evidence-card').first().evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(1000);
await page.screenshot({path:'artifacts/final-evidence-proof.png'});
await page.locator('.results-intro').evaluate(e=>e.scrollIntoView({block:'start'}));
for(const format of ['JSON','CSV']){const wait=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();await wait;await page.waitForTimeout(600);}
await context.close();await fs.rename(await video.path(),'artifacts/funding-radar-demo.webm');await browser.close();console.log(JSON.stringify({partnerFramed:true,posts,video:'artifacts/funding-radar-demo.webm'}));
