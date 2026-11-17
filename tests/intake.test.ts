import assert from 'node:assert/strict';
import test from 'node:test';
import { assessIntake } from '../src/server/contact-browser.js';

test('a funding homepage with only an email field does not prove a founder application', () => {
  const surface={text:'Startup funding. Apply now. Enter your email ID.',labels:['Enter your email ID'],fields:1,forms:[],headings:['Startup funding'],links:[{label:'Apply now',url:'https://example.com/fund-application-page'}]};
  assert.equal(assessIntake(surface,'https://example.com/').intake,false);
  assert.equal(assessIntake({...surface,labels:['Founder email'],forms:['Subscribe to our newsletter']},'https://example.com/').intake,false);
});

test('an explicit startup field or a named Typeform application can establish an intake', () => {
  const base={text:'Founder application. Submit your startup pitch.',labels:['Company name'],fields:1,forms:[],headings:['Founder application'],links:[]};
  assert.equal(assessIntake(base,'https://example.com/pitch').intake,true);
  assert.equal(assessIntake({...base,labels:['Email address']},'https://example.typeform.com/to/application').intake,true);
  assert.equal(assessIntake({...base,headings:['Newsletter'],text:'Subscribe to our newsletter',forms:['Newsletter'],labels:['Email address']},'https://example.typeform.com/to/newsletter').intake,false);
});
