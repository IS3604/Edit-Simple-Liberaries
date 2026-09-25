// Maintenance mode + shared status page (also used by 404.html).
// Reads public.site_settings (id=1). If the table is missing or unreachable the site stays up (fail-open).
(()=>{
const C=window.ES_CONFIG||{};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function page(kind,msg){
  const m=kind==='404'
    ?{icon:'travel_explore',code:'404',title:'This page took a different cut',text:msg||"The page you're looking for doesn't exist or was moved.",btn:true}
    :{icon:'construction',code:'Maintenance',title:"We'll be right back",text:msg||"We're making some improvements. Please check back shortly.",btn:false};
  document.documentElement.classList.remove('auth-wait','login-open');document.documentElement.style.overflow='';
  document.title=(kind==='404'?'Page not found':'Under maintenance')+' | Edit Simple Libraries';
  document.getElementById('es-status')?.remove();
  [...document.body.children].forEach(e=>{if(e.tagName!=='SCRIPT'){e.style.display='none';e.inert=true}});   // hide site/admin UI (kept in DOM so scripts don't error)
  document.body.insertAdjacentHTML('beforeend',`<div id="es-status" data-kind="${kind}" class="login-bg fixed inset-0 flex items-center justify-center px-5 overflow-hidden">
<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
<div class="login-card relative w-full max-w-md bg-white/90 backdrop-blur border border-white rounded-3xl p-8 sm:p-10 shadow-2xl text-center">
<img src="logo.png" width="64" height="64" class="logo-float h-16 w-16 rounded-2xl mx-auto mb-5 shadow-lg" alt="Edit Simple Libraries">
<span class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-primary-fixed text-on-primary-fixed-variant px-3 py-1 rounded-full"><span class="material-symbols-outlined !text-base">${m.icon}</span>${m.code}</span>
<h1 class="text-2xl sm:text-3xl font-bold mt-4">${m.title}</h1>
<p class="text-on-surface-variant mt-2">${esc(m.text)}</p>
${m.btn?'<a href="index.html" class="mt-7 inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:brightness-95"><span class="material-symbols-outlined !text-lg">home</span>Back to library</a>'
:'<p class="mt-7 text-xs text-on-surface-variant flex items-center justify-center gap-2"><span class="spinner !border-primary/30 !border-t-primary !w-4 !h-4"></span>This page refreshes automatically when we\'re back.</p>'}
</div></div>`);
}
async function state(){
  if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)return null;
  try{const r=await fetch(`${C.SUPABASE_URL}/rest/v1/site_settings?id=eq.1&select=maintenance,message`,{headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:'Bearer '+C.SUPABASE_ANON_KEY},cache:'no-store'});
    if(!r.ok)return null;const [row]=await r.json();return row||null}catch{return null}
}
let down=false;
function watch(){setInterval(async()=>{if(document.hidden&&!down)return;const s=await state();if(!s)return;
  if(s.maintenance&&!down){down=true;page('maintenance',s.message)}else if(!s.maintenance&&down)location.reload()},20000)}
window.esStatusPage=page;
// Every page waits on this before doing anything else. Never resolves while in maintenance.
window.ES_MAINT=state().then(s=>{watch();if(s?.maintenance){down=true;
  const go=()=>page('maintenance',s.message);document.readyState==='loading'?document.addEventListener('DOMContentLoaded',go):go();return new Promise(()=>{})}});
})();
