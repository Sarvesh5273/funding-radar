import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPrivateAddress(ip: string): boolean {
  const address = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (address.includes(':')) {
    let hex=address;
    if(hex.includes('.')){
      const split=hex.lastIndexOf(':'),v4=hex.slice(split+1);
      if(isIP(v4)!==4)return true;
      const n=v4.split('.').map(Number);
      hex=`${hex.slice(0,split+1)}${((n[0]<<8)|n[1]).toString(16)}:${((n[2]<<8)|n[3]).toString(16)}`;
    }
    const pieces=hex.split('::');if(pieces.length>2)return true;
    const left=pieces[0]?pieces[0].split(':'):[],right=pieces[1]?pieces[1].split(':'):[];
    const missing=8-left.length-right.length;
    if((pieces.length===1&&missing!==0)||(pieces.length===2&&missing<1))return true;
    const groups=[...left,...Array.from({length:missing},()=> '0'),...right];
    if(groups.length!==8||groups.some(group=>!/^[\da-f]{1,4}$/.test(group)))return true;
    const words=groups.map(group=>Number.parseInt(group,16));
    if(words.slice(0,7).every(word=>word===0)&&words[7]<=1)return true;
    if((words[0]&0xfe00)===0xfc00||(words[0]&0xff00)===0xff00||(words[0]>=0xfe80&&words[0]<=0xfeff)||(words[0]===0x2001&&words[1]===0xdb8))return true;
    const mapped=words.slice(0,5).every(word=>word===0)&&words[5]===0xffff;
    const compatible=words.slice(0,6).every(word=>word===0);
    const nat64=words[0]===0x64&&words[1]===0xff9b&&words.slice(2,6).every(word=>word===0);
    if(mapped||compatible||nat64)return isPrivateAddress(`${words[6]>>8}.${words[6]&255}.${words[7]>>8}.${words[7]&255}`);
    return false;
  }
  const octets = address.split('.').map(Number);
  const [a,b] = octets;
  return octets.length !== 4 || octets.some(n=>!Number.isInteger(n)||n<0||n>255) || a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}
export function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2500) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || (isIP(host) && isPrivateAddress(host))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
export async function assertPublicUrl(value: string): Promise<void> {
  const clean = publicUrl(value);
  if (!clean) throw new Error('Only public HTTPS source URLs are accepted.');
  const addresses = await lookup(new URL(clean).hostname, { all: true });
  if (!addresses.length || addresses.some(a=>isPrivateAddress(a.address))) throw new Error('Source hostname resolves to a restricted address.');
}
export function csvCell(value: unknown): string {
  let s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}
