// Data layer: Supabase if configured, otherwise sample data.
let CATS = [
  { slug:'lawyers', name:'For Lawyers', icon:'gavel', blurb:'Courtroom, consultation and legal-practice footage for law firms and advocates.',
    subs:[['courtroom','Courtroom'],['consultation','Client Consultation'],['documents','Contracts & Documents'],['law-office','Law Office'],['justice','Justice & Symbols']] },
  { slug:'doctors', name:'For Doctors', icon:'stethoscope', blurb:'Clinic, hospital and patient-care footage for doctors and healthcare brands.',
    subs:[['hospital','Hospital & Clinic'],['surgery','Surgery & Procedures'],['patient-care','Patient Care'],['med-tech','Medical Technology'],['lab','Pharmacy & Lab']] },
  { slug:'both', name:'For Both', icon:'handshake', blurb:'Professional b-roll that works for legal and medical practices alike.',
    subs:[['meetings','Office & Meetings'],['testimonials','Testimonials & Interviews'],['backgrounds','Explainer Backgrounds'],['trust','Trust & Professionalism'],['social','Social Media Reels']] }
];
const SAMPLE = (() => {
  const t = {courtroom:['Judge Gavel Close-Up','Empty Courtroom Pan'],consultation:['Lawyer Meets Client','Signing With Attorney'],documents:['Contract Signing Macro','Flipping Legal Files'],'law-office':['Law Library Shelves','Attorney at Desk'],justice:['Scales of Justice Rotate','Lady Justice Statue'],
    hospital:['Clinic Reception Walkthrough','Hospital Corridor Dolly'],surgery:['Surgeons Preparing','Operating Room Lights'],'patient-care':['Doctor Talks With Patient','Nurse Checks Vitals'],'med-tech':['MRI Scanner Slow Push','Digital X-Ray Review'],lab:['Lab Pipette Macro','Pharmacy Shelf Pan'],
    meetings:['Team Meeting Timelapse','Handshake in Office'],testimonials:['Interview Setup Two-Shot','Happy Client Smile'],backgrounds:['Soft Bokeh Office Loop','Abstract Clean Gradient Loop'],trust:['Professional Walks to Camera','Confident Portrait Push-In'],social:['Vertical Talking Head Frame','Phone Scroll Hand Shot']};
  let out=[],i=0;
  for (const c of CATS) for (const [s] of c.subs) for (const title of t[s]) { i++;
    out.push({id:String(i),title,category:c.slug,subcategory:s,description:`Royalty-free ${title.toLowerCase()} clip, ready for ${c.name.toLowerCase().replace('for ','')} marketing, websites and social media.`,content:`${title}. Professional ${s.replace('-',' ')} scene with people, natural light, office interior.`,
      video_url:'',thumbnail_url:'',duration_seconds:10+(i*7)%40,resolution:i%3?'4K':'1080p',fps:i%2?30:24,orientation:s==='social'?'vertical':'horizontal',tags:[c.slug,s,...title.toLowerCase().split(' ')],created_at:new Date(Date.now()-i*864e5).toISOString()}); }
  return out;
})();

let sb=null;
async function client(){
  const c=window.ES_CONFIG||{}; if(!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY) return null;
  if(!sb){const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); sb=createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{auth:{persistSession:false}});}
  return sb;
}
const COLS='id,title,description,content,category,subcategory,video_url,thumbnail_url,duration_seconds,resolution,fps,orientation,tags,created_at';
const words=q=>(q||'').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,' ').split(/\s+/).filter(w=>w.length>1).slice(0,6);
// Relevance: title > tags > content/description
function rank(list,q){const w=words(q);if(!w.length)return list;
  const sc=v=>w.reduce((n,x)=>n+(v.title.toLowerCase().includes(x)?5:0)+((v.tags||[]).some(t=>t.includes(x))?3:0)+((v.content||'').toLowerCase().includes(x)?2:0)+((v.description||'').toLowerCase().includes(x)?1:0),0);
  return list.map(v=>[v,sc(v)]).filter(a=>a[1]>0).sort((a,b)=>b[1]-a[1]).map(a=>a[0]);}
const cache=new Map();
async function listVideos({category,subcategory,q,limit}={}){
  const key=JSON.stringify([category,subcategory,q,limit]);if(cache.has(key))return cache.get(key);
  const s=await client(); let out;
  if(s){ let r=s.from('videos').select(COLS).eq('published',true).eq('status','approved').order('created_at',{ascending:false});
    if(category) r=r.eq('category',category); if(subcategory) r=r.eq('subcategory',subcategory);
    for(const w of words(q)) r=r.ilike('search_text',`%${w}%`);
    if(limit) r=r.limit(limit);
    const {data,error}=await r; if(error){console.error(error);return[]} out=rank(data,q); }
  else { out=rank(SAMPLE.filter(v=>(!category||v.category===category)&&(!subcategory||v.subcategory===subcategory)),q);
    const w=words(q); if(w.length) out=out.filter(v=>w.every(x=>(v.title+' '+v.description+' '+v.content+' '+v.tags.join(' ')).toLowerCase().includes(x))); if(limit) out=out.slice(0,limit); }
  cache.set(key,out); return out;
}
async function getVideo(id){
  const s=await client();
  if(s){const {data}=await s.from('videos').select(COLS).eq('id',id).eq('published',true).eq('status','approved').maybeSingle();return data}
  return SAMPLE.find(v=>v.id===id);
}
async function counts(){const s=await client();const m={};
  if(s){const {data}=await s.from('videos').select('category').eq('published',true).eq('status','approved');(data||[]).forEach(v=>m[v.category]=(m[v.category]||0)+1)}
  else SAMPLE.forEach(v=>m[v.category]=(m[v.category]||0)+1);return m;}
async function loadCats(){const s=await client();if(!s)return;const {data,error}=await s.from('categories').select('slug,name,parent_slug,icon,blurb,sort').order('sort');if(error||!data?.length)return;
  const main=data.filter(c=>!c.parent_slug);CATS.length=0;main.forEach(m=>CATS.push({slug:m.slug,name:m.name,icon:m.icon||'movie',blurb:m.blurb||'',subs:data.filter(c=>c.parent_slug===m.slug).map(c=>[c.slug,c.name])}));}
// Live updates: re-render when videos/categories change (realtime + tab focus + 60s safety poll)
const subs=[];let lt=null,ch=null;
async function fire(){cache.clear();try{await loadCats()}catch{};subs.forEach(f=>{try{f()}catch(e){console.error(e)}})}
const bump=()=>{clearTimeout(lt);lt=setTimeout(fire,500)};
async function onChange(cb){subs.push(cb);if(subs.length>1)return;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)bump()});setInterval(()=>{if(!document.hidden)bump()},60000);
  const s=await client();if(!s)return;ch=s.channel('site-live');['videos','categories'].forEach(t=>ch.on('postgres_changes',{event:'*',schema:'public',table:t},bump));ch.subscribe();}
window.ES={CATS,client,onChange,ready:loadCats().catch(e=>console.error(e)),listVideos,getVideo,counts,
  cat:slug=>CATS.find(c=>c.slug===slug),
  subName:(c,s)=>(CATS.find(x=>x.slug===c)?.subs.find(x=>x[0]===s)||[,s])[1],
  dur:s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
