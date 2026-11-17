import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page, type Frame } from 'playwright';
import { assertPublicUrl, publicUrl } from './security.js';
import type { TinyFishClient } from './tinyfish.js';

export interface ContactInspection {
  url: string;
  title: string;
  text: string;
  formPresent: boolean;
  intake: boolean;
  hash: string;
  labels: string[];
  requiresLogin?: boolean;
}

function isKnownForm(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === 'tally.so' || host.endsWith('.tally.so')
    || host === 'typeform.com' || host.endsWith('.typeform.com')
    || host === 'jotform.com' || host.endsWith('.jotform.com')
    || (host === 'docs.google.com' && url.pathname.startsWith('/forms/'))
    || host === 'forms.gle';
}

function allowedNavigation(value: string, initial: URL): boolean {
  const clean = publicUrl(value);
  if (!clean) return false;
  const url = new URL(clean);
  const baseHost = initial.hostname.replace(/^www\./, '').toLowerCase();
  const nextHost = url.hostname.replace(/^www\./, '').toLowerCase();
  // Subdomains of the original investor are allowed; unrelated hosts are not.
  return nextHost === baseHost || nextHost.endsWith(`.${baseHost}`) || isKnownForm(url);
}

interface VisibleSurface {
  text: string;
  labels: string[];
  fields: number;
  forms: string[];
  headings: string[];
  links: Array<{ label: string; url: string }>;
}

async function readVisible(frame: Frame): Promise<VisibleSurface> {
  // A JS string avoids tsx/esbuild injecting server-only __name helpers into CDP.
  return frame.evaluate<VisibleSurface>(`(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
    };
    const text = document.body?.innerText?.slice(0, 16000) ?? '';
    const fields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="textbox"]')).filter(visible);
    const labels = fields.map(field => {
      const labelledBy = field.getAttribute('aria-labelledby')?.split(/\\s+/).map(id => document.getElementById(id)?.innerText ?? '').join(' ');
      const label = field.labels ? Array.from(field.labels).map(node => node.innerText).join(' ') : '';
      return label || field.getAttribute('aria-label') || labelledBy || field.getAttribute('placeholder') || field.getAttribute('name') || field.getAttribute('type') || '';
    }).map(s => s.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const forms = Array.from(document.querySelectorAll('form,[role="form"]')).filter(visible).map(form => form.innerText.slice(0, 5000));
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).filter(visible).map(node => node.innerText.trim()).filter(Boolean);
    const links = Array.from(document.querySelectorAll('a[href]')).filter(visible).map(node => ({ label: node.innerText.trim(), url: node.href })).filter(link => link.label && link.url).slice(0, 100);
    return { text, fields: fields.length, labels, forms, headings, links };
  })()`);
}

export function assessIntake(surface: VisibleSurface, url: string): { formPresent: boolean; intake: boolean } {
  const formPresent = surface.fields > 0;
  const labels = surface.labels.join(' ');
  const formText = surface.forms.join(' ');
  const headings = surface.headings.join(' ');
  const formDomain = isKnownForm(new URL(url));
  const strongContext = /(?:pitch\s+(?:us|your|a)|submit\s+(?:your\s+)?(?:pitch|startup|company|application)|apply\s+(?:for|to|now)|startup\s+application|funding\s+application|fundraise\s+with|inbound\s+dealflow|get\s+funded|raise\s+(?:your\s+)?(?:first\s+)?round|founder\s+application)/i.test(`${headings} ${formText} ${surface.text.slice(0, 2500)}`);
  const founderFields = /(?:company\s*(?:name|website|description)|startup|pitch|deck|founder|fundraising|revenue|traction|solution|co.?founder)/i.test(labels);
  const onlyNewsletter = /(?:newsletter|subscribe|stay\s+updated|mailing\s+list)/i.test(formText) && !/(?:submit\s+(?:your\s+)?pitch|funding\s+application|startup\s+application|founder\s+application)/i.test(formText);
  const login = /(?:sign\s+in|log\s+in|password)/i.test(`${headings} ${labels}`) && !founderFields;
  const employment = /(?:job\s+application|join\s+our\s+team|apply\s+for\s+(?:a\s+)?(?:role|position)|resume|curriculum\s+vitae|\bCV\b)/i.test(`${headings} ${labels} ${formText}`);
  const applyPath = /\/(?:apply|application|pitch|funding)(?:\/|$)/i.test(new URL(url).pathname);
  // A funding headline elsewhere on a homepage cannot turn its newsletter
  // email field into an application. Require a startup field, or an actual
  // form destination with explicit intake context.
  const formIntakeContext = /(?:pitch|startup|founder|funding\s+application|company\s+name)/i.test(formText);
  const intake = formPresent && !onlyNewsletter && !login && !employment && ((founderFields && (strongContext || applyPath || formDomain)) || (strongContext && (formDomain || (applyPath && formIntakeContext))));
  return { formPresent, intake };
}

export function visibleLoginRequired(surface: Pick<VisibleSurface, 'text' | 'labels' | 'forms' | 'headings'>, url: string): boolean {
  const pathname = new URL(url).pathname;
  if (/\/(?:login|log-in|signin|sign-in)(?:\/|$)/i.test(pathname)) return true;
  // A navbar's generic "Sign in" link is not an authentication requirement.
  const promptHeading = surface.headings.some(heading => /^(?:sign\s*in|log\s*in|login)(?:\s|$)/i.test(heading.trim()));
  const password = surface.labels.some(label => /\bpassword\b/i.test(label));
  const loginForm = password && surface.forms.some(form => /\b(?:sign\s*in|log\s*in|login)\b/i.test(form));
  const requiredPrompt = /\b(?:please|you\s+must|you\s+need\s+to|required\s+to)\s+(?:sign\s*in|log\s*in)\b|\b(?:sign\s*in|log\s*in)\s+to\s+(?:apply|continue|submit\s+(?:your\s+)?(?:application|pitch))\b/i.test(surface.text);
  return promptHeading || loginForm || requiredPrompt;
}

async function installNavigationGuard(page: Page, initial: URL): Promise<void> {
  await page.route('**/*', async route => {
    const request = route.request();
    if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return route.continue();
    const url = request.url();
    if (!allowedNavigation(url, initial)) return route.abort('blockedbyclient');
    try { await assertPublicUrl(url); } catch { return route.abort('blockedbyclient'); }
    return route.continue();
  });
}

async function waitForRenderedContent(page: Page): Promise<void> {
  await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
  // A hydrated shell saying only "Loading…" is not a completed inspection.
  try {
    await page.waitForFunction(`(() => {
      const text = document.body?.innerText ?? '';
      return text.trim().length > 40 && !/(^|\\n)\\s*Loading[.\\u2026 ]*\\s*(\\n|$)/i.test(text);
    })()`, undefined, { timeout: 15000 });
  } catch (error) {
    // A reached login URL can prove the destination while still proving no
    // anonymous application form. It must carry requiresLogin in the result.
    if (!/\/(?:login|log-in|signin|sign-in)(?:\/|$)/i.test(new URL(page.url()).pathname)) throw error;
  }
}

/** Read public pitch intake in a real TinyBrowser. Never fill or submit fields. */
export async function inspectContact(client: TinyFishClient, route: { url: string; label: string }, investorName: string): Promise<ContactInspection> {
  await assertPublicUrl(route.url);
  const initial = new URL(route.url);
  const session = await client.createBrowser(route.url);
  let browser: Browser | undefined;
  let inspected = false;
  let inspectionDetail = '';
  let cleanupError: unknown;
  try {
    const cdp = new URL(session.cdp_url);
    // Only use provider-returned secure CDP; never send the REST key to CDP.
    if (cdp.protocol !== 'wss:' && cdp.protocol !== 'https:') throw new Error('TinyBrowser returned an insecure CDP URL.');
    browser = await chromium.connectOverCDP(session.cdp_url, { timeout: 45000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('TinyBrowser returned no browser context.');
    const page = context.pages().find(p => p.url() !== 'about:blank') ?? context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(45000);
    await installNavigationGuard(page, initial);
    if (page.url() === 'about:blank' || !allowedNavigation(page.url(), initial)) await page.goto(route.url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded', { timeout: 45000 });
    // Read rendered content rather than assuming the 201 allocation navigated.
    await waitForRenderedContent(page);
    if (!allowedNavigation(page.url(), initial)) throw new Error('Intake redirected outside the permitted investor and form domains.');
    await assertPublicUrl(page.url());
    let surface = await readVisible(page.mainFrame());
    surface.headings.unshift(await page.title());
    let outcome = assessIntake(surface, page.url());
    if (!outcome.intake) {
      const next = surface.links.find(link => /(?:apply(?:\s+now)?|start\s+(?:your\s+)?application|submit\s+(?:your\s+)?pitch|pitch\s+us|get\s+funded)/i.test(link.label) && allowedNavigation(link.url, initial) && new URL(link.url).href !== new URL(page.url()).href && /(?:apply|application|pitch|startup|forms|typeform|tally|jotform)/i.test(link.url));
      if (next) {
        await assertPublicUrl(next.url);
        await page.goto(next.url, { waitUntil: 'domcontentloaded' });
        await waitForRenderedContent(page);
        if (!allowedNavigation(page.url(), initial)) throw new Error('Application moved outside the permitted domains.');
        await assertPublicUrl(page.url());
        surface = await readVisible(page.mainFrame());
        surface.headings.unshift(await page.title());
        outcome = assessIntake(surface, page.url());
      }
    }
    // Typeform shows an introduction before its first field. "Start" only opens
    // the application; this code never advances an answered field or submits.
    if (!outcome.formPresent && isKnownForm(new URL(page.url()))) {
      const start = page.getByRole('button', { name: /^(?:Start|Get started|Start application)$/i }).first();
      if (await start.isVisible().catch(() => false)) {
        const introduction = surface;
        await start.click();
        await page.waitForFunction('document.querySelector(\'input:not([type="hidden"]), textarea, select, [role="textbox"]\') !== null', undefined, { timeout: 10000 }).catch(() => {});
        await waitForRenderedContent(page);
        const opened = await readVisible(page.mainFrame());
        surface = { ...opened, text: `${introduction.text}\n\nFirst application step:\n${opened.text}`.slice(0, 20000), headings: [...introduction.headings, ...opened.headings] };
        outcome = assessIntake(surface, page.url());
      }
    }
    // Embedded typeform/Google Forms need their rendered fields read as well.
    for (const frame of page.frames().filter(frame => frame !== page.mainFrame()).slice(0, 6)) {
      if (!allowedNavigation(frame.url(), initial) || !publicUrl(frame.url())) continue;
      await assertPublicUrl(frame.url());
      try {
        const embedded = await readVisible(frame);
        surface = { text: `${surface.text}\n\nEmbedded application:\n${embedded.text}`.slice(0, 20000), fields: surface.fields + embedded.fields, labels: [...surface.labels, ...embedded.labels], headings: [...surface.headings, ...embedded.headings], forms: [...surface.forms, ...embedded.forms], links: [...surface.links, ...embedded.links] };
        const embeddedOutcome = assessIntake(embedded, frame.url());
        outcome = { formPresent: outcome.formPresent || embeddedOutcome.formPresent, intake: outcome.intake || embeddedOutcome.intake };
      } catch { /* Optional inaccessible iframe is not evidence. */ }
    }
    const title = await page.title();
    if (!surface.text.trim()) throw new Error('Rendered intake page contained no readable text.');
    const labels = [...new Set(surface.labels)].slice(0, 30);
    const linkText = surface.links.filter(link => /(?:apply|pitch|startup|funding|application)/i.test(link.label)).slice(0, 8).map(link => `${link.label}: ${link.url}`).join('\n');
    const text = `${surface.text}\n\nVisible form labels: ${labels.join('; ')}${linkText ? `\nApplication links:\n${linkText}` : ''}`.trim();
    const hash = createHash('sha256').update(text).digest('hex');
    const requiresLogin = visibleLoginRequired(surface, page.url());
    if (requiresLogin) outcome.intake = false;
    inspected = true;
    inspectionDetail = `${investorName}: inspected rendered ${outcome.intake ? 'startup application' : 'public contact page'}; ${surface.fields} visible fields (${labels.join(', ').slice(0, 120)})`;
    return { url: page.url(), title, text, formPresent: outcome.formPresent, intake: outcome.intake, hash, labels, requiresLogin };
  } finally {
    // Closing this CDP connection first allows explicit provider cleanup to win.
    if (browser) try { await browser.close(); } catch { /* DELETE below is the authoritative cleanup check. */ }
    try { await client.closeBrowser(session.session_id); } catch (error) { cleanupError = error; }
    client.finishBrowser(session.session_id, inspected && !cleanupError, cleanupError ? 'Page inspection ended but TinyBrowser cleanup could not be confirmed.' : inspectionDetail || 'Browser inspection did not finish.');
    if (cleanupError) throw new Error(`TinyBrowser cleanup could not be confirmed: ${cleanupError instanceof Error ? cleanupError.message : 'unknown error'}`);
  }
}
