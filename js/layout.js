// Shared header, footer, cards, skeletons, toast.
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
window.esEsc=esc;
window.esSkel=(n=6)=>Array.from({length:n},()=>`<div class="rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant/40" aria-hidden="true"><div class="sk aspect-video !rounded-none"></div><div class="p-4 space-y-2"><div class="sk h-4 w-3/4"></div><div class="sk h-3 w-1/2"></div></div></div>`).join('');
window.esToast=msg=>{const t=document.createElement('div');t.textContent=msg;t.setAttribute('role','status');t.className='fixed left-1/2 -translate-x-1/2 bottom-7 z-[70] bg-on-surface text-white px-5 py-3 rounded-xl text-sm shadow-xl';document.body.appendChild(t);setTimeout(()=>t.remove(),2400)};
const grads={lawyers:'from-orange-300 to-amber-600',doctors:'from-orange-200 to-rose-400'};
window.esCard=v=>`<a href="video.html?id=${encodeURIComponent(v.id)}" class="group block rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant/40 hover:shadow-xl hover:-translate-y-0.5 transition-all">
<div class="relative aspect-video bg-gradient-to-br ${grads[v.category]||grads.lawyers} overflow-hidden">
${v.thumbnail_url?`<img src="${esc(v.thumbnail_url)}" alt="${esc(v.title)}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`:`<span class="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-white/80 !text-4xl sm:!text-6xl">${ES.cat(v.category)?.icon||'movie'}</span>`}
${v.video_url?`<video muted loop playsinline preload="none" data-src="${esc(v.video_url)}" class="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"></video>`:''}
<div class="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-semibold"><span class="bg-black/60 text-white px-2 py-0.5 rounded">${ES.dur(v.duration_seconds||0)}</span><span class="bg-white/90 text-on-surface px-2 py-0.5 rounded">${esc(v.resolution||'HD')}</span></div>
<span class="material-symbols-outlined absolute bottom-3 right-3 bg-white/90 text-primary rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition" style="font-variation-settings:'FILL' 1">play_arrow</span></div>
<div class="p-2.5 sm:p-4"><h3 class="text-sm sm:text-base font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">${esc(v.title)}</h3><p class="text-[11px] sm:text-xs text-on-surface-variant mt-1 line-clamp-1">${esc(ES.cat(v.category)?.name||'')} · ${esc(ES.subName(v.category,v.subcategory))}</p></div></a>`;
// hover preview: video src only attached on first hover (saves bandwidth)
window.esHoverPlay=root=>{if(!matchMedia('(hover:hover)').matches)return;root.querySelectorAll('a.group').forEach(a=>{const vd=a.querySelector('video');if(!vd)return;
  a.onmouseenter=()=>{if(!vd.src)vd.src=vd.dataset.src;vd.play().catch(()=>{})};a.onmouseleave=()=>{vd.pause();vd.currentTime=0}})};

// Header renders immediately (from default/cached categories), refreshed when DB categories arrive
const here=location.pathname.split('/').pop()||'index.html', qc=new URLSearchParams(location.search).get('cat');
function header(){
  const nav=[['index.html','Home','home',!qc&&(here===''||here==='index.html')],['videos.html','All videos','video_library',!qc&&here==='videos.html'],...ES.CATS.map(c=>[`videos.html?cat=${c.slug}`,c.name,c.icon,qc===c.slug])];
  const link=([h,t,i,a])=>`<a href="${h}" ${a?'aria-current="page"':''} class="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${a?'bg-primary text-white shadow-sm':'text-on-surface hover:bg-white/70 hover:text-primary'}"><span class="material-symbols-outlined !text-[18px]">${i}</span>${esc(t)}</a>`;
  const html=`<div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center gap-4">
<a href="index.html" class="flex items-center gap-2.5 shrink-0" aria-label="Edit Simple Libraries home"><img src="logo.png" alt="" width="36" height="36" class="h-9 w-9 rounded-lg object-cover ring-2 ring-white"><span class="font-display font-bold text-on-surface text-[15px] sm:text-[17px] leading-tight whitespace-nowrap">Edit Simple<span class="block text-[11px] font-medium text-on-surface-variant tracking-wide uppercase">Libraries</span></span></a>
<nav class="hidden lg:flex items-center gap-1 mx-auto min-w-0 overflow-x-auto no-scrollbar">${nav.map(link).join('')}</nav>
<div class="flex items-center gap-2 ml-auto lg:ml-0 shrink-0"><button id="es-search" class="flex items-center gap-2 h-9 pl-3 pr-2 rounded-full bg-white/80 hover:bg-white text-on-surface text-sm border border-orange-200 transition" aria-label="Search videos"><span class="material-symbols-outlined !text-[20px]">search</span><span class="hidden md:inline lg:hidden xl:inline whitespace-nowrap text-on-surface-variant pr-1">Search videos</span></button>
${ES.user?`<a href="admin.html" title="Admin panel" class="hidden sm:flex items-center gap-1.5 h-9 px-3.5 lg:px-2.5 xl:px-3.5 rounded-full bg-primary text-white text-sm font-semibold hover:brightness-95 transition shadow-sm"><span class="material-symbols-outlined !text-[18px]">dashboard</span><span class="lg:hidden xl:inline whitespace-nowrap">Admin panel</span></a>
<button id="es-out" title="Log out (${esc(ES.user.email)})" aria-label="Log out" class="h-9 w-9 grid place-items-center rounded-full bg-white/80 hover:bg-white text-on-surface border border-orange-200"><span class="material-symbols-outlined !text-[20px]">logout</span></button>`
:`<a href="admin.html" title="Admin login" class="hidden sm:flex items-center gap-1.5 h-9 px-3.5 lg:px-2.5 xl:px-3.5 rounded-full bg-primary text-white text-sm font-semibold hover:brightness-95 transition shadow-sm"><span class="material-symbols-outlined !text-[18px]">login</span><span class="lg:hidden xl:inline whitespace-nowrap">Admin login</span></a>`}
<button id="es-menu" class="lg:hidden h-9 w-9 grid place-items-center rounded-full bg-white/80 hover:bg-white text-on-surface border border-orange-200" aria-label="Open menu" aria-expanded="false"><span class="material-symbols-outlined">menu</span></button></div></div>
<nav id="es-mnav" class="hidden lg:hidden absolute left-0 right-0 top-full z-50 bg-primary-fixed border-y border-orange-200 shadow-xl px-4 py-3 flex-col gap-1 max-h-[calc(100vh-4rem)] overflow-y-auto">${nav.map(link).join('')}<a href="admin.html" class="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-semibold text-primary"><span class="material-symbols-outlined !text-[18px]">${ES.user?'dashboard':'login'}</span>${ES.user?'Admin panel':'Admin login'}</a></nav>`;
  let h=document.getElementById('es-header');
  if(!h){h=document.createElement('header');h.id='es-header';h.className='sticky top-0 z-50 w-full bg-primary-fixed border-b border-orange-200';document.body.prepend(h)}
  h.innerHTML=html;
  document.getElementById('es-menu').onclick=e=>{const m=document.getElementById('es-mnav');const open=m.classList.toggle('hidden');m.classList.toggle('flex',!open);e.currentTarget.setAttribute('aria-expanded',String(!open))};
  document.getElementById('es-search').onclick=openSearch;
  const out=document.getElementById('es-out');if(out)out.onclick=()=>ES.logout();
}
function footer(){let f=document.getElementById('es-footer');if(!f){f=document.createElement('footer');f.id='es-footer';f.className='mt-16 sm:mt-24 border-t border-outline-variant/40 bg-surface-container-low';document.body.append(f)}
  if(f.dataset.done)return;f.dataset.done='1';
  f.innerHTML=`<div class="max-w-7xl mx-auto px-4 md:px-6 py-10 flex flex-col items-center text-center gap-3"><div class="flex items-center gap-2"><img src="logo.png" width="32" height="32" class="h-8 w-8 rounded-md" alt=""><span class="font-display font-bold">Edit Simple Libraries</span></div><p class="text-sm text-on-surface-variant max-w-xs">Royalty-free stock videos made for lawyers, doctors and professional practices.</p></div><p class="text-center text-xs text-on-surface-variant pb-8">© ${new Date().getFullYear()} Edit Simple Libraries. All rights reserved.</p>`}
// ---- Search suggestions (used by hero search, videos page and the header search) ----
// Shows: recent searches · matching categories/subcategories (jump straight there) · matching videos · popular ideas.
const RKEY='es_recent_q';
const recent=()=>{try{return JSON.parse(localStorage.getItem(RKEY)||'[]').filter(x=>typeof x==='string').slice(0,5)}catch{return[]}};
window.esRemember=q=>{q=String(q||'').trim();if(q.length<2)return;try{localStorage.setItem(RKEY,JSON.stringify([q,...recent().filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,5)))}catch{}};
const IDEAS=['doctor talking to patient','courtroom','gavel','handshake','hospital hallway','signing contract'];
window.esSuggest=(input,{onSearch,cat}={})=>{
  if(!input||input.dataset.sug)return;input.dataset.sug='1';input.setAttribute('autocomplete','off');input.setAttribute('role','combobox');input.setAttribute('aria-expanded','false');
  const box=document.createElement('div');box.className='es-sug hidden absolute left-0 right-0 top-full mt-1 z-[65] bg-white rounded-xl shadow-2xl border border-outline-variant/50 overflow-hidden text-left text-sm max-h-[60vh] overflow-y-auto';box.setAttribute('role','listbox');
  const host=input.closest('.es-sug-host')||input.parentElement;host.classList.add('relative');host.appendChild(box);
  let items=[],act=-1,seq=0,t;
  const hl=(txt,q)=>{const e=esc(txt);const w=q.trim().toLowerCase().split(/\s+/).filter(x=>x.length>1);if(!w.length)return e;return e.replace(new RegExp('('+w.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi'),'<b class="text-on-surface">$1</b>')};
  const row=(it,i)=>`<a href="${it.href||'#'}" data-i="${i}" role="option" class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container ${i===act?'bg-surface-container':''}"><span class="material-symbols-outlined !text-[20px] text-on-surface-variant">${it.icon}</span><span class="flex-1 min-w-0 truncate text-on-surface-variant">${it.html}</span>${it.tag?`<span class="text-[11px] text-on-surface-variant shrink-0">${esc(it.tag)}</span>`:''}</a>`;
  const head=h=>`<p class="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">${h}</p>`;
  const paint=groups=>{items=[];let html='';groups.forEach(([h,list])=>{if(!list.length)return;html+=head(h)+list.map(x=>{items.push(x);return row(x,items.length-1)}).join('')});
    box.innerHTML=html;box.classList.toggle('hidden',!items.length);input.setAttribute('aria-expanded',String(!!items.length))};
  const close=()=>{box.classList.add('hidden');input.setAttribute('aria-expanded','false');act=-1};
  const go=q=>{esRemember(q);close();onSearch?onSearch(q):location.href='videos.html?q='+encodeURIComponent(q)};
  async function update(){const q=input.value.trim(),my=++seq,lq=q.toLowerCase();act=-1;
    if(!q){const r=recent();return paint([['Recent searches',r.map(x=>({icon:'history',html:esc(x),q:x}))],['Try',IDEAS.filter(x=>!r.includes(x)).slice(0,r.length?3:6).map(x=>({icon:'search',html:esc(x),q:x}))]])}
    const places=[];ES.CATS.forEach(c=>{if(c.name.toLowerCase().includes(lq)||c.slug.includes(lq))places.push({icon:c.icon,html:hl(c.name,q),href:'videos.html?cat='+c.slug,tag:'Category'});
      c.subs.forEach(([s,n])=>{if(n.toLowerCase().includes(lq)||lq.split(/\s+/).every(w=>w.length>2&&n.toLowerCase().includes(w)))places.push({icon:'subdirectory_arrow_right',html:hl(n,q),href:`videos.html?cat=${c.slug}&sub=${s}`,tag:c.name.replace(/^For /,'')})})});
    const base=[{icon:'search',html:`Search for “<b class="text-on-surface">${esc(q)}</b>”`,q}];
    paint([['',base],['Categories',places.slice(0,5)]]);
    if(q.length<2)return;clearTimeout(t);t=setTimeout(async()=>{const cf=typeof cat==='function'?cat():'';const v=await ES.listVideos({q,category:cf||undefined,limit:5}).catch(()=>[]);if(my!==seq)return;
      paint([['',base],['Categories',places.slice(0,5)],['Videos',v.map(x=>({icon:'movie',html:hl(x.title,q),href:'video.html?id='+encodeURIComponent(x.id),tag:ES.subName(x.category,x.subcategory)||''}))]])},220)}
  input.addEventListener('focus',update);input.addEventListener('input',update);
  input.addEventListener('keydown',e=>{if(box.classList.contains('hidden'))return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const n=items.length;act=e.key==='ArrowDown'?(act+1>=n?-1:act+1):(act<=-1?n-1:act-1);box.querySelectorAll('[data-i]').forEach(a=>a.classList.toggle('bg-surface-container',+a.dataset.i===act));box.querySelector(`[data-i="${act}"]`)?.scrollIntoView({block:'nearest'})}
    else if(e.key==='Enter'&&act>=0){e.preventDefault();const it=items[act];if(it.href){esRemember(input.value);location.href=it.href}else{input.value=it.q;go(it.q)}}
    else if(e.key==='Enter')close();else if(e.key==='Escape'){e.stopPropagation();close()}});
  box.addEventListener('mousedown',e=>e.preventDefault());   // keep focus in the input
  box.addEventListener('click',e=>{const a=e.target.closest('[data-i]');if(!a)return;const it=items[+a.dataset.i];if(it.href){esRemember(input.value);return}e.preventDefault();input.value=it.q;go(it.q)});
  input.addEventListener('blur',()=>setTimeout(close,120));
  return{close};
};
function openSearch(){if(document.getElementById('es-sov')||document.getElementById('es-login'))return;const m=document.createElement('div');m.id='es-sov';m.className='fixed inset-0 z-[60] bg-black/50 flex justify-center px-4 pt-[12vh]';
  m.innerHTML=`<form class="w-full max-w-xl" role="search"><input name="q" aria-label="Search videos" placeholder="Describe the shot — e.g. doctor talking to patient, gavel, handshake" class="w-full px-5 py-4 rounded-2xl border-0 shadow-2xl text-base focus:ring-2 focus:ring-primary"></form>`;
  document.body.appendChild(m);const si=m.querySelector('input');si.parentElement.classList.add('es-sug-host');esSuggest(si);si.focus();m.onclick=e=>{if(e.target===m)m.remove()};m.querySelector('form').onsubmit=e=>{e.preventDefault();const q=e.target.q.value.trim();esRemember(q);location.href='videos.html?q='+encodeURIComponent(q)}}
document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&!document.getElementById('es-login')){const i=document.querySelector('#hero-search [name=q],#q');e.preventDefault();i?i.focus():openSearch();return}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}if(e.key==='Escape')document.getElementById('es-sov')?.remove()});
header();footer();
ES.ready.then(()=>{header();footer()});
ES.onChange(()=>{header();footer()});

// ---- Login screen (same account as the admin panel) ----
window.esShowLogin=msg=>{
  if(document.getElementById('es-login'))return;
  const d=document.createElement('div');d.id='es-login';d.className='login-bg fixed inset-0 z-[100] flex items-center justify-center px-4 overflow-hidden';
  d.innerHTML=`<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
  <div class="relative w-full max-w-sm"><form class="login-card bg-white/90 backdrop-blur border border-white rounded-3xl p-8 shadow-2xl">
  <div class="text-center mb-6"><img src="logo.png" width="64" height="64" class="logo-float h-16 w-16 rounded-2xl mx-auto mb-4 shadow-lg" alt=""><h1 class="text-2xl font-bold">Welcome</h1><p class="text-sm text-on-surface-variant">Sign in to Edit Simple Libraries</p></div>
  <div class="stagger"><label class="text-sm font-medium">Email</label><div class="relative mt-1 mb-4"><span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-xl">mail</span><input name="email" type="email" autocomplete="username" required class="w-full rounded-lg border-outline-variant focus:border-primary focus:ring-primary pl-10"></div></div>
  <div class="stagger"><label class="text-sm font-medium">Password</label><div class="relative mt-1 mb-6"><span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-xl">lock</span><input name="password" type="password" autocomplete="current-password" required class="w-full rounded-lg border-outline-variant focus:border-primary focus:ring-primary pl-10 pr-10"><button type="button" class="eye material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant !text-xl" aria-label="Show password">visibility</button></div></div>
  <div class="cap w-full min-h-[65px] flex justify-center empty:hidden mb-4"></div>
  <div class="stagger"><button class="relative w-full bg-primary text-on-primary rounded-xl py-3 font-semibold hover:brightness-95 active:scale-[.98] transition"><span class="lbl">Log in</span><span class="spin hidden absolute inset-0 grid place-items-center"><span class="spinner"></span></span></button>
  <p class="err text-sm text-error mt-3 text-center min-h-[20px]" role="alert">${esc(msg||'')}</p></div></form>
  <div class="ok hidden login-card bg-white/90 backdrop-blur rounded-3xl p-10 shadow-2xl text-center"><svg class="check mx-auto" viewBox="0 0 52 52" width="72" height="72"><circle cx="26" cy="26" r="24" fill="none" stroke="#16a34a" stroke-width="3"/><path fill="none" stroke="#16a34a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M15 27l7 7 15-15"/></svg><p class="text-xl font-bold mt-4">Signed in</p><p class="text-sm text-on-surface-variant">Loading the library…</p></div></div>`;
  document.body.appendChild(d);document.documentElement.style.overflow='hidden';document.documentElement.classList.add('login-open');
  const f=d.querySelector('form'),b=f.querySelector('button.relative'),err=f.querySelector('.err');f.email.focus();const cap=esCaptcha.mount(f.querySelector('.cap'));
  const eye=f.querySelector('.eye');eye.onclick=()=>{const i=f.password;i.type=i.type==='password'?'text':'password';eye.textContent=i.type==='password'?'visibility':'visibility_off'};
  f.onsubmit=async e=>{e.preventDefault();err.textContent='';err.classList.replace('text-green-700','text-error');b.disabled=true;b.querySelector('.lbl').classList.add('invisible');b.querySelector('.spin').classList.remove('hidden');
    const m=await cap.token().then(t=>ES.login(f.email.value.trim(),f.password.value,t)).catch(e=>e?.message&&/security check/i.test(e.message)?e.message:'Could not reach the server. Check your connection and try again.');cap.reset();
    b.disabled=false;b.querySelector('.lbl').classList.remove('invisible');b.querySelector('.spin').classList.add('hidden');
    if(m){err.textContent=m;f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');return}
    f.classList.add('hidden');d.querySelector('.ok').classList.remove('hidden');setTimeout(()=>location.reload(),900)};
};
