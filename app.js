(function(){
const P={home:'index.html',videos:'videos.html',images:'videos.html?cat=images',music:'videos.html?cat=music',templates:'videos.html?cat=templates',collections:'videos.html?cat=collections',pricing:'pricing.html'};
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const qs=new URLSearchParams(location.search);
function toast(msg){let t=document.createElement('div');t.textContent=msg;t.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#2a1f17;color:#fff;padding:12px 20px;border-radius:12px;font:500 14px Inter,sans-serif;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .3s';document.body.appendChild(t);setTimeout(()=>{t.style.opacity=0;setTimeout(()=>t.remove(),300)},2200)}
window.esToast=toast;
// Link routing
const textMap={'home':'home','videos':'videos','images':'images','music':'music','templates':'templates','collections':'collections','libraries':'videos','pricing':'pricing','plans':'pricing'};
document.querySelectorAll('a').forEach(a=>{
  const dp=a.dataset.path, txt=a.textContent.trim().toLowerCase();
  if(dp&&P[dp]){a.href=P[dp];return}
  if(dp==='login'||dp==='signup'){a.href='#';a.addEventListener('click',e=>{e.preventDefault();openAuth(dp)});return}
  if(a.getAttribute('href')!=='#')return;
  let key=Object.keys(textMap).find(k=>txt===k||txt.startsWith(k+' ')||txt.endsWith(' '+k));
  if(key){a.href=P[textMap[key]];return}
  if(/free account|sign up|get started|create account/.test(txt)){a.addEventListener('click',e=>{e.preventDefault();openAuth('signup')});return}
  if(/trial|get pro|subscribe|upgrade/.test(txt)){a.addEventListener('click',e=>{e.preventDefault();openAuth('signup',txt)});return}
  if(/pricing|plan/.test(txt)){a.href=P.pricing;return}
  if(/browse|directory|view all|see all|explore/.test(txt)){a.href=P.videos;return}
  if(a.querySelector('img')||a.closest('article')){a.href='asset.html';return}
  a.addEventListener('click',e=>{e.preventDefault();toast('Coming soon')});
});
// Add Pricing to nav
document.querySelectorAll('header nav').forEach(n=>{if(![...n.querySelectorAll('a')].some(a=>/pricing/i.test(a.textContent))){const last=n.querySelector('a:last-child');const a=last.cloneNode(true);a.textContent='Pricing';a.href=P.pricing;a.removeAttribute('aria-current');n.appendChild(a)}});
// Active nav
const page=location.pathname.split('/').pop()||'index.html';const cat=qs.get('cat');
document.querySelectorAll('header nav a').forEach(a=>{const h=a.getAttribute('href');const on=(h===page+(cat?'?cat='+cat:''))||(page==='index.html'&&h==='index.html')||(page==='asset.html'&&h==='videos.html');
  if(on){a.setAttribute('aria-current','page');a.classList.add('text-primary')}else{a.removeAttribute('aria-current');a.classList.remove('text-primary')}});
// Auth modal
const user=store.get('es_user',null);
function renderUser(){const u=store.get('es_user',null);document.querySelectorAll('a[data-path=login],a[data-path=signup]').forEach(a=>a.style.display=u?'none':'');const av=document.querySelector('header span.material-symbols-outlined:last-child');document.querySelectorAll('header [data-es-logout]').forEach(x=>x.remove());
  if(u){const b=document.createElement('button');b.dataset.esLogout=1;b.className='text-sm font-medium text-on-surface-variant hover:text-primary';b.textContent='Hi, '+u.name.split(' ')[0]+' · Log out';b.onclick=()=>{store.set('es_user',null);renderUser();toast('Logged out')};const tgt=document.querySelector('a[data-path=login]');tgt&&tgt.parentNode.insertBefore(b,tgt)}}
function openAuth(mode,plan){
  const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;background:rgba(19,27,46,.55);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px';
  const su=mode==='signup';
  m.innerHTML=`<form class="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl font-body-md" style="font-family:Inter,sans-serif"><div class="flex justify-between items-center mb-6"><h2 class="text-2xl font-bold" style="font-family:'Plus Jakarta Sans'">${su?'Create your account':'Welcome back'}</h2><button type="button" data-x class="material-symbols-outlined text-on-surface-variant">close</button></div>${plan?`<p class="mb-4 text-sm text-primary font-semibold">Plan: ${plan}</p>`:''}${su?'<label class="block text-sm font-medium mb-1">Name</label><input name="name" required class="w-full border border-outline-variant rounded-lg px-3 py-2 mb-4">':''}<label class="block text-sm font-medium mb-1">Email</label><input name="email" type="email" required class="w-full border border-outline-variant rounded-lg px-3 py-2 mb-4"><label class="block text-sm font-medium mb-1">Password</label><input name="pw" type="password" minlength="6" required class="w-full border border-outline-variant rounded-lg px-3 py-2 mb-6"><button class="w-full bg-primary text-white rounded-lg py-3 font-semibold hover:opacity-90">${su?'Sign Up':'Log In'}</button><p class="text-sm text-center mt-4 text-on-surface-variant">${su?'Have an account?':'New here?'} <a href="#" data-sw class="text-primary font-semibold">${su?'Log in':'Sign up'}</a></p></form>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{if(e.target===m||e.target.dataset.x!==undefined)m.remove()});
  m.querySelector('[data-sw]').onclick=e=>{e.preventDefault();m.remove();openAuth(su?'login':'signup',plan)};
  m.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const name=f.get('name')||f.get('email').split('@')[0];store.set('es_user',{name,email:f.get('email'),plan:plan||'Free'});m.remove();renderUser();toast(su?'Account created — welcome, '+name+'!':'Logged in')};
}
window.esAuth=openAuth;renderUser();
// Header search overlay
document.querySelectorAll('header button[aria-label="Search assets"]').forEach(b=>b.onclick=()=>{const q=prompt?null:null;const m=document.createElement('div');m.style.cssText='position:fixed;inset:0;background:rgba(19,27,46,.55);z-index:9998;display:flex;justify-content:center;padding:12vh 16px';m.innerHTML='<form style="width:100%;max-width:640px"><input autofocus name="q" placeholder="Search videos, images, music, templates..." style="width:100%;padding:18px 22px;border-radius:14px;border:0;font:16px Inter,sans-serif;outline:none;box-shadow:0 10px 40px rgba(0,0,0,.3)"></form>';document.body.appendChild(m);m.querySelector('input').focus();m.onclick=e=>{if(e.target===m)m.remove()};m.querySelector('form').onsubmit=e=>{e.preventDefault();location.href='videos.html?q='+encodeURIComponent(e.target.q.value)}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();const i=document.querySelector('main input[type=text]');i?i.focus():document.querySelector('header button[aria-label="Search assets"]')?.click()}if(e.key==='Escape')document.querySelectorAll('body>div[style*="z-index:9998"]').forEach(x=>x.remove())});
// Home search
const hf=document.querySelector('main form');
if(page==='index.html'&&hf){hf.onsubmit=e=>{e.preventDefault();const q=hf.querySelector('input').value;const c=hf.querySelector('select')?.value;location.href='videos.html?'+(c&&c!=='all'&&c!=='videos'?'cat='+c+'&':'')+'q='+encodeURIComponent(q)};
  hf.parentElement.querySelectorAll('button[type=button]').forEach(b=>b.onclick=()=>location.href='videos.html?q='+encodeURIComponent(b.textContent.trim()))}
// Generic buttons
document.querySelectorAll('button[title="Instant Download"],button[title*="ownload"]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toast('Download started (demo)')}));
document.querySelectorAll('button[title="Add to collection"]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const c=store.get('es_col',0)+1;store.set('es_col',c);toast('Added to collection ('+c+' saved)')}));
document.querySelectorAll('button').forEach(b=>{const t=b.textContent.trim().toLowerCase();if(b.onclick||b.id)return;
  if(/follow creator/.test(t))b.addEventListener('click',()=>{const s=b.querySelector('span:last-child');s.textContent=s.textContent==='Following'?'Follow Creator':'Following'});
  else if(b.getAttribute('aria-label')==='Share Media')b.addEventListener('click',()=>{navigator.clipboard?.writeText(location.href);toast('Link copied')});
  else if(/fullscreen/.test(t))b.addEventListener('click',()=>{const el=b.closest('.relative')||document.documentElement;el.requestFullscreen?.()});
});
// Browse page: cards → asset, search filter, category heading
if(page==='videos.html'){
  const grid=[...document.querySelectorAll('main h3')].map(h=>h.closest('div.group')||h.parentElement.parentElement.parentElement.parentElement);
  const cards=[...new Set(grid)].filter(Boolean);
  cards.forEach(c=>{c.style.cursor='pointer';c.addEventListener('click',()=>location.href='asset.html')});
  const inp=document.querySelector('main input[type=text]');const count=[...document.querySelectorAll('main span')].find(s=>s.textContent.trim()==='24');
  function filter(){const q=(inp.value||'').toLowerCase().trim();let n=0;cards.forEach(c=>{const show=!q||q.split(/\s+/).some(w=>c.textContent.toLowerCase().includes(w)||(c.querySelector('img')?.dataset.alt||'').toLowerCase().includes(w));c.style.display=show?'':'none';if(show)n++});if(count)count.textContent=n}
  if(inp){inp.value=qs.get('q')||'';inp.addEventListener('input',filter);inp.parentElement.querySelector('button')?.addEventListener('click',filter);filter()}
  if(cat){const names={images:'Stock Photos & Images',music:'Royalty-Free Music & Stems',templates:'Editing Templates & Presets',collections:'Curated Collections'};const h=document.querySelector('main h1');if(h&&names[cat])h.textContent=names[cat];document.title=(names[cat]||'Browse')+' | Edit Simple Libraries'}
  document.querySelectorAll('main span > button').forEach(b=>b.addEventListener('click',()=>b.parentElement.remove()));
  [...document.querySelectorAll('main button')].filter(b=>b.textContent.trim()==='Clear all').forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll(':scope > span:not(:first-child)').forEach(s=>s.remove());if(inp){inp.value='';filter()}});
  document.querySelectorAll('main select').forEach(s=>s.addEventListener('change',()=>toast('Filter: '+s.value)));
}
if(page==='index.html'){document.querySelectorAll('main img').forEach(i=>{const a=i.closest('a');if(!a){const card=i.closest('div.group');if(card){card.style.cursor='pointer';card.addEventListener('click',()=>location.href='asset.html')}}})}
// Newsletter / other forms
document.querySelectorAll('form').forEach(f=>{if(!f.onsubmit&&f!==hf){f.addEventListener('submit',e=>{e.preventDefault();toast('Thanks! You\'re subscribed.');f.reset()})}});
})();
