import { mkdir } from 'node:fs/promises';
const STOP = new Set('a an the and or for to of in on with by from is are that this its their companies company startup startups platform software solutions solution helps using use businesses business technology technologies based develops developing offers provide provides'.split(' '));
export function tokens(s: string): string[] {
  return [...new Set(s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>2&&!STOP.has(x)).map(x=>x.endsWith('s')?x.slice(0,-1):x))];
}
export function lexicalSimilarity(a: string, b: string): number {
  const aa = tokens(a), bb = new Set(tokens(b));
  if (!aa.length || !bb.size) return 0;
  const overlap = aa.filter(t=>bb.has(t)).length;
  return Math.min(1, overlap / Math.sqrt(aa.length * Math.min(bb.size, aa.length * 2)));
}
let extractor: Promise<any> | null = null;
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
async function getExtractor() {
  if (!extractor) extractor = (async()=>{
    const { pipeline, env } = await import('@huggingface/transformers');
    await mkdir('.cache/embeddings',{recursive:true});
    env.cacheDir = '.cache/embeddings';
    return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  })();
  return extractor;
}
export async function warmEmbeddings() { if (process.env.RADAR_EMBEDDINGS !== 'false') await getExtractor(); }
export async function compareDescriptions(description: string, candidates: string[]) {
  if (process.env.RADAR_EMBEDDINGS !== 'false') {
    try {
      const extract = await getExtractor();
      const output = await extract([description,...candidates],{pooling:'mean',normalize:true});
      const vectors: number[][] = output.tolist();
      const seed = vectors[0];
      return candidates.map((text,i)=>{
        const cos = seed.reduce((sum,v,k)=>sum+v*vectors[i+1][k],0);
        // Sentence cosine is a retrieval signal, not a probability or investment prediction.
        const score = Math.max(0,Math.min(1,(cos-0.18)/0.62));
        const shared=tokens(description).filter(term=>tokens(text).includes(term));
        return { score, rawCosine:cos, method:'sentence-embedding' as const, reason:`Compared the companies' products and buyers with sentence embeddings (cosine ${cos.toFixed(2)}). Shared terms: ${shared.join(', ') || 'no direct lexical overlap; inspect the product description for adjacent fit'}. This is a similarity signal, not a funding prediction.` };
      });
    } catch { /* Explicitly expose lexical fallback in the result; never claim model verification. */ }
  }
  return candidates.map(text=>({score:lexicalSimilarity(description,text),rawCosine:null,method:'lexical' as const,reason:`Shared product/customer language: ${tokens(description).filter(t=>tokens(text).includes(t)).join(', ') || 'no substantive shared terms'}. Lexical fallback; review semantic fit.`}));
}
