import type { TinyFetchPage } from './tinyfish.js';
import { entityMention, normalizeText, normalizedIdentity } from './verification.js';
import { publicUrl } from './security.js';

const INSTITUTION_WORD = /\b(?:team|capital|ventures?|partners?|funds?|investments?|holdings|combinator|labs?|bank|corporation|inc|llc|ltd)\b/i;
function personName(value: string): string | null {
  const name = normalizeText(value).replace(/^[*•>\-\s]+/, '').trim();
  if (name.length < 5 || name.length > 100 || INSTITUTION_WORD.test(name)) return null;
  const parts = name.split(/\s+/);
  if (parts.length < 2 || parts.length > 4 || !parts.every(part => /^[\p{Lu}][\p{L}'’.-]*$/u.test(part))) return null;
  if (parts.some(part => /^[A-Z]{2,}$/.test(part))) return null;
  return name;
}

/** The caller supplies a sentence already selected for the actual financing. */
export function extractRoundLead(quote: string, investorName: string): { name: string; quote: string } | null {
  const text = normalizeText(quote);
  if (!/\b(?:round|pre[- ]seed|seed|series\s+[a-f]|funding|financing|investment)\b/i.test(text)) return null;
  const investor = normalizeText(investorName);
  if (!investor) return null;
  const escaped = investor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = "([\\p{Lu}][\\p{L}'’.-]*(?:\\s+[\\p{Lu}][\\p{L}'’.-]*){1,3})";
  const pattern = new RegExp(`\\b(?:co[- ]led|led)\\s+by\\s+${name}(?:,\\s*(?:(?:a|the)\\s+)?(?:general\\s+partner|managing\\s+partner|investment\\s+partner|partner))?\\s+(?:at|of|from)\\s+${escaped}(?![\\p{L}\\p{N}])`, 'giu');
  for (const match of text.matchAll(pattern)) {
    const person = personName(match[1]);
    if (person && !entityMention(person, investorName)) return { name: person, quote: match[0] };
  }
  return null;
}

function ownedBy(value: string, officialOrigin: string): boolean {
  const target = publicUrl(value), official = publicUrl(officialOrigin);
  if (!target || !official) return false;
  const host = new URL(target).hostname.replace(/^www\./, '').toLowerCase();
  const owner = new URL(official).hostname.replace(/^www\./, '').toLowerCase();
  return host === owner || host.endsWith(`.${owner}`);
}

/** Company portfolio ownership is useful, but does not date a round's lead. */
export function extractPortfolioLead(page: TinyFetchPage, companyName: string, officialOrigin: string): { name: string; quote: string; scope: 'company' } | null {
  if (!ownedBy(page.final_url || page.url, officialOrigin) || !page.text) return null;
  const lines = page.text.split(/\r?\n/);
  const headings = lines.filter(line => /^\s*#{1,3}\s+/.test(line));
  const companyPage = entityMention(page.title || '', companyName)
    || (headings.length > 0 && normalizedIdentity(normalizeText(headings[0])) === normalizedIdentity(companyName));
  if (!companyPage) return null;
  for (let index = 0; index < lines.length; index++) {
    const heading = normalizeText(lines[index]).replace(/:$/, '').trim();
    if (!/^(?:[\p{L}\p{N}.&'-]+\s+){0,3}(?:Investment\s+Lead|Deal\s+Lead)$/iu.test(heading)) continue;
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (next >= lines.length) continue;
    const raw = lines[next].trim().replace(/^[*•>\-]\s*/, '');
    const linked = raw.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    const person = personName(linked?.[1] ?? raw);
    if (!person) continue;
    const target = linked?.[2];
    // Fetch may keep link targets in links[] rather than inline markdown.
    // Require the immediately labeled person to have a matching owned link.
    const personLinked = target ? (() => { try { return ownedBy(new URL(target, page.final_url || page.url).href, officialOrigin); } catch { return false; } })()
      : (page.links || []).some(link => {
        if (!ownedBy(link, officialOrigin)) return false;
        try {
          const segment = decodeURIComponent(new URL(link).pathname.split('/').filter(Boolean).at(-1) || '');
          return normalizedIdentity(segment) === normalizedIdentity(person);
        } catch { return false; }
      });
    if (personLinked) return { name: person, quote: `${heading} ${person}`, scope: 'company' };
  }
  return null;
}
