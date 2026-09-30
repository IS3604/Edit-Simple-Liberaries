// Maintenance mode + shared status page (also used by 404.html).
// Reads public.site_settings (id=1). Listens with Supabase Realtime, so flipping the switch in Supabase
// takes the site down / brings it back instantly, without reloading. Falls back to polling.
// If the table is missing or unreachable the site stays up (fail-open).
(()=>{
const C=window.ES_CONFIG||{};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let down=false,wasWaiting=false,hidden=[],title0=document.title,release=null;
function card(kind,msg){
  const m=kind==='404'
    ?{icon:'travel_explore',code:'404',title:'This page took a different cut',text:msg||"The page you're looking for doesn't exist or was moved.",btn:true}
    :{icon:'construction',code:'Maintenance',title:"We'll be right back",text:msg||"We're making some improvements. Please check back shortly.",btn:false};
  return `<div id="es-status" data-kind="${kind}" role="alert" class="login-bg fixed inset-0 z-[200] flex items-center justify-center px-5 overflow-hidden">
<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
<div class="login-card relative w-full max-w-md bg-white/90 backdrop-blur border border-white rounded-3xl p-8 sm:p-10 shadow-2xl text-center">
<img src="logo.png" width="64" height="64" class="logo-float h-16 w-16 rounded-2xl mx-auto mb-5 shadow-lg" alt="Edit Simple Libraries">
<span class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-primary-fixed text-on-primary-fixed-variant px-3 py-1 rounded-full"><span class="material-symbols-outlined !text-base">${m.icon}</span>${m.code}</span>
<h1 class="text-2xl sm:text-3xl font-bold mt-4">${m.title}</h1>
<p class="es-msg text-on-surface-variant mt-2">${esc(m.text)}</p>
${m.btn?'<a href="index.html" class="mt-7 inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:brightness-95"><span class="material-symbols-outlined !text-lg">home</span>Back to library</a>'
:'<p class="mt-7 text-xs text-on-surface-variant flex items-center justify-center gap-2"><span class="spinner !border-primary/30 !border-t-primary !w-4 !h-4"></span>This page comes back on its own when we\'re done.</p>'}
</div></div>`;
}
// Show: hide every UI element (kept in DOM so running scripts don't break), stop media, overlay the card.
function page(kind,msg){
  const cur=document.getElementById('es-status');
  if(cur&&cur.dataset.kind===kind){cur.querySelector('.es-msg').textContent=msg||cur.querySelector('.es-msg').textContent;return}
  cur?.remove();
  document.querySelectorAll('video,audio').forEach(v=>{try{v.pause()}catch{}});
  [...document.body.children].forEach(e=>{if(e.tagName==='SCRIPT'||e.id==='es-status'||e.dataset.esHidden)return;hidden.push([e,e.style.display,e.inert]);e.dataset.esHidden='1';e.style.display='none';e.inert=true});
  const H=document.documentElement;if(H.classList.contains('auth-wait')){wasWaiting=true;H.classList.remove('auth-wait')}
  H.classList.remove('login-open');H.classList.add('es-down');
  if(kind!=='404')title0=document.title;
  document.title=(kind==='404'?'Page not found':'Under maintenance')+' | Edit Simple Libraries';
  document.body.insertAdjacentHTML('beforeend',card(kind,msg));
}
// Restore: put the UI back exactly as it was — no reload.
function restore(){
  document.getElementById('es-status')?.remove();
  hidden.forEach(([e,d,i])=>{e.style.display=d;e.inert=i;delete e.dataset.esHidden});hidden=[];
  document.documentElement.classList.remove('es-down');document.title=title0;
  if(wasWaiting&&!window.ES?.user&&!document.getElementById('app')){document.documentElement.classList.add('auth-wait')}wasWaiting=false;
  if(document.getElementById('es-login'))document.documentElement.classList.add('login-open');
  if(document.body.hasAttribute('data-es404'))page('404');
}
async function state(){
  if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)return null;
  try{const r=await fetch(`${C.SUPABASE_URL}/rest/v1/site_settings?id=eq.1&select=maintenance,message`,{headers:{apikey:C.SUPABASE_ANON_KEY,Authorization:'Bearer '+C.SUPABASE_ANON_KEY},cache:'no-store'});
    if(!r.ok)return null;const [row]=await r.json();return row||null}catch{return null}
}
function apply(s){
  if(!s)return;
  if(s.maintenance){down=true;const go=()=>page('maintenance',s.message);document.body?go():document.addEventListener('DOMContentLoaded',go)}
  else if(down){down=false;restore();if(release){const r=release;release=null;r()}}   // page that loaded during maintenance now boots normally
}
let busy=false;const check=async()=>{if(busy)return;busy=true;try{apply(await state())}finally{busy=false}};
// ---- Realtime (Phoenix websocket, no library needed) ----
function realtime(){
  if(!C.SUPABASE_URL||!window.WebSocket)return;
  let ws,hb,ref=0,retry=1000;
  const send=(topic,event,payload)=>ws.readyState===1&&ws.send(JSON.stringify({topic,event,payload,ref:String(++ref)}));
  const open=()=>{
    try{ws=new WebSocket(C.SUPABASE_URL.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(C.SUPABASE_ANON_KEY)+'&vsn=1.0.0')}catch{return}
    ws.onopen=()=>{retry=1000;send('realtime:es-maint','phx_join',{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'site_settings'}]},access_token:C.SUPABASE_ANON_KEY});
      hb=setInterval(()=>send('phoenix','heartbeat',{}),25000);check()};
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.event==='postgres_changes'){const rec=m.payload?.data?.record;rec&&'maintenance' in rec?apply(rec):check()}};
    ws.onclose=()=>{clearInterval(hb);setTimeout(open,retry);retry=Math.min(retry*2,30000)};
    ws.onerror=()=>{try{ws.close()}catch{}};
  };
  open();
}
window.esStatusPage=page;
// Every page waits on this before doing anything else. While in maintenance it stays pending,
// and resolves the moment maintenance is switched off (so the page boots without a reload).
window.ES_MAINT=state().then(s=>{
  realtime();
  setInterval(()=>{if(!document.hidden||down)check()},window.ES_MAINT_POLL||15000);   // safety net if realtime is blocked
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
  if(s?.maintenance){apply(s);return new Promise(r=>release=r)}
});
})();
