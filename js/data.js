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
    out.push({id:String(i),title,category:c.slug,subcategory:s,description:`Royalty-free ${title.toLowerCase()} clip, ready for ${c.name.toLowerCase().replace('for ','')} marketing, websites and social media.`,
      video_url:'',thumbnail_url:'',duration_seconds:10+(i*7)%40,resolution:i%3?'4K':'1080p',fps:i%2?30:24,orientation:s==='social'?'vertical':'horizontal',tags:[c.slug,s,...title.toLowerCase().split(' ')],created_at:new Date(Date.now()-i*864e5).toISOString()}); }
  return out;
})();

let sb=null;
async function client(){
  const c=window.ES_CONFIG||{}; if(!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY) return null;
  if(!sb){const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); sb=createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);}
  return sb;
}
async function listVideos({category,subcategory,q}={}){
  const s=await client();
  if(s){ let r=s.from('videos').select('*').eq('published',true).order('created_at',{ascending:false});
    if(category) r=r.eq('category',category); if(subcategory) r=r.eq('subcategory',subcategory);
    if(q) r=r.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    const {data,error}=await r; if(error){console.error(error);return[]} return data; }
  const w=(q||'').toLowerCase().split(/\s+/).filter(Boolean);
  return SAMPLE.filter(v=>(!category||v.category===category)&&(!subcategory||v.subcategory===subcategory)&&(!w.length||w.every(x=>(v.title+' '+v.description+' '+v.tags.join(' ')).toLowerCase().includes(x))));
}
async function getVideo(id){
  const s=await client();
  if(s){const {data}=await s.from('videos').select('*').eq('id',id).single();return data}
  return SAMPLE.find(v=>v.id===id);
}
async function countVideos(category){return (await listVideos({category})).length}
async function loadCats(){const s=await client();if(!s)return;const {data,error}=await s.from('categories').select('*').order('sort');if(error||!data?.length)return;
  const main=data.filter(c=>!c.parent_slug);CATS.length=0;main.forEach(m=>CATS.push({slug:m.slug,name:m.name,icon:m.icon||'movie',blurb:m.blurb||'',subs:data.filter(c=>c.parent_slug===m.slug).map(c=>[c.slug,c.name])}));}
window.ES={CATS,client,ready:loadCats().catch(e=>console.error(e)),listVideos,getVideo,countVideos,
  cat:slug=>CATS.find(c=>c.slug===slug),
  subName:(c,s)=>(CATS.find(x=>x.slug===c)?.subs.find(x=>x[0]===s)||[,s])[1],
  dur:s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
