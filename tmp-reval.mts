process.loadEnvFile('.env.local')
const { db } = await import('./server/utils/db')
const { sql } = await import('drizzle-orm')
function normalize(v:string){return v.toLowerCase().replace(/[^a-z0-9]/g,'')}
function lev(a:string,b:string){const dp=Array.from({length:b.length+1},(_,j)=>j);for(let i=1;i<=a.length;i++){let p=dp[0]!;dp[0]=i;for(let j=1;j<=b.length;j++){const t=dp[j]!;dp[j]=Math.min(dp[j]!+1,dp[j-1]!+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return dp[b.length]!}
function sim(a:string,b:string){const l=Math.max(a.length,b.length);return l?1-lev(a,b)/l:1}
const STRONG=['petit','chibi','mini anime','minianime','picture drama','soumatou','recap','bonus stage','additional time','gift','pilot','collage','specials']
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function exec(s:string){ let last:any; for(let i=0;i<10;i++){ try { return await db().execute(sql.raw(s)) } catch(e){ last=e; await sleep(2500) } } throw new Error('db fail: '+(last?.message||'').slice(0,60)) }
async function media(idMal:number){
  for(let i=0;i<5;i++){
    try {
      const res=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($idMal:Int){Media(idMal:$idMal,type:ANIME){idMal format title{romaji english native} synonyms}}',variables:{idMal}})})
      if(res.status===429){await sleep((Number(res.headers.get('retry-after'))||5)*1000);continue}
      const j:any=await res.json(); return j?.data?.Media ?? null
    } catch { await sleep(1500) }
  }
  return null
}
const rows = ((await exec("select slug, title, mal_id from anime where mal_id is not null")).rows) as any[]
console.log('checking', rows.length, 'resolved rows')
let cleared=0
for(const r of rows){
  const m=await media(r.mal_id); await sleep(600)
  if(!m) continue
  const cands=[m.title.romaji,m.title.english,m.title.native,...(m.synonyms||[])].filter(Boolean) as string[]
  const best=Math.max(...cands.map(c=>sim(normalize(r.title),normalize(c))))
  const site=r.title.toLowerCase()
  const spinoff=cands.some(c=>STRONG.some(h=>c.toLowerCase().includes(h)) && STRONG.some(h=>!site.includes(h)))
  if(best<0.6 || spinoff){
    await exec(`update anime set mal_id=null, metadata_synced_at=null, metadata_attempts=0, metadata_retry_at=null where slug='${r.slug.replace(/'/g,"''")}'`)
    cleared++
    console.log('CLEAR', r.slug, '|', r.title, '-> id'+r.mal_id, best.toFixed(2), spinoff?'spinoff':'', cands[0])
  }
}
console.log('cleared', cleared, 'of', rows.length)
process.exit(0)
