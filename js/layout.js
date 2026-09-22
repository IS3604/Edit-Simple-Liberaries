// Shared header, footer, cards, toast.
(async function(){await ES.ready;
const here=location.pathname.split('/').pop()||'index.html', qc=new URLSearchParams(location.search).get('cat');
const nav=[['index.html','Home',!qc&&here==='index.html'],...ES.CATS.map(c=>[`videos.html?cat=${c.slug}`,c.name,qc===c.slug])];
document.body.insertAdjacentHTML('afterbegin',`<header class="sticky top-0 z-50 w-full bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/40">
<div class="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
<a href="index.html" class="flex items-center gap-2 shrink-0"><img src="logo.png" alt="Edit Simple logo" class="h-9 w-9 rounded-lg object-cover"><span class="font-bold text-lg hidden sm:inline" style="font-family:'Plus Jakarta Sans'">Edit Simple Libraries</span></a>
<nav id="es-nav" class="hidden md:flex items-center gap-6 text-sm font-medium">${nav.map(([h,t,a])=>`<a href="${h}" class="${a?'text-primary':'text-on-surface-variant hover:text-primary'} transition-colors">${t}</a>`).join('')}</nav>
<div class="flex items-center gap-2"><button id="es-search" aria-label="Search videos" class="p-2 rounded-full hover:bg-surface-container"><span class="material-symbols-outlined">search</span></button>
<button id="es-menu" aria-label="Menu" class="md:hidden p-2 rounded-full hover:bg-surface-container"><span class="material-symbols-outlined">menu</span></button></div></div>
<nav id="es-mnav" class="hidden md:hidden border-t border-outline-variant/40 px-4 py-3 flex-col gap-3 text-sm font-medium">${nav.map(([h,t,a])=>`<a href="${h}" class="${a?'text-primary':''}">${t}</a>`).join('')}</nav></header>`);
document.body.insertAdjacentHTML('beforeend',`<footer class="mt-24 border-t border-outline-variant/40 bg-surface-container-low"><div class="max-w-7xl mx-auto px-4 md:px-8 py-12 grid gap-8 md:grid-cols-4">
<div class="md:col-span-2"><div class="flex items-center gap-2 mb-3"><img src="logo.png" class="h-8 w-8 rounded-md" alt=""><span class="font-bold" style="font-family:'Plus Jakarta Sans'">Edit Simple Libraries</span></div><p class="text-sm text-on-surface-variant max-w-sm">Royalty-free stock videos made for lawyers, doctors and professional practices.</p></div>
${ES.CATS.map(c=>`<div><h4 class="font-semibold mb-3 text-sm">${c.name}</h4><ul class="space-y-2 text-sm text-on-surface-variant">${c.subs.slice(0,4).map(([s,n])=>`<li><a class="hover:text-primary" href="videos.html?cat=${c.slug}&sub=${s}">${n}</a></li>`).join('')}</ul></div>`).slice(0,2).join('')}
</div><p class="text-center text-xs text-on-surface-variant pb-8">© ${new Date().getFullYear()} Edit Simple Libraries. All rights reserved.</p></footer>`);
document.getElementById('es-menu').onclick=()=>{const m=document.getElementById('es-mnav');m.classList.toggle('hidden');m.classList.toggle('flex')};
function openSearch(){const m=document.createElement('div');m.className='fixed inset-0 z-[60] bg-black/50 flex justify-center px-4 pt-[12vh]';m.innerHTML=`<form class="w-full max-w-xl"><input name="q" autofocus placeholder="Search videos — e.g. courtroom, surgery, handshake" class="w-full px-5 py-4 rounded-2xl border-0 shadow-2xl text-base outline-none"></form>`;document.body.appendChild(m);m.querySelector('input').focus();m.onclick=e=>{if(e.target===m)m.remove()};m.querySelector('form').onsubmit=e=>{e.preventDefault();location.href='videos.html?q='+encodeURIComponent(e.target.q.value)}}
document.getElementById('es-search').onclick=openSearch;
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch()}if(e.key==='Escape')document.querySelectorAll('.z-\\[60\\]').forEach(x=>x.remove())});
window.esToast=msg=>{const t=document.createElement('div');t.textContent=msg;t.className='fixed left-1/2 -translate-x-1/2 bottom-7 z-[70] bg-on-surface text-white px-5 py-3 rounded-xl text-sm shadow-xl';document.body.appendChild(t);setTimeout(()=>t.remove(),2400)};
const grads={lawyers:'from-orange-300 to-amber-600',doctors:'from-orange-200 to-rose-400',both:'from-amber-200 to-orange-500'};
window.esCard=v=>`<a href="video.html?id=${encodeURIComponent(v.id)}" class="group block rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant/40 hover:shadow-xl hover:-translate-y-0.5 transition-all">
<div class="relative aspect-video bg-gradient-to-br ${grads[v.category]||grads.both} overflow-hidden">
${v.thumbnail_url?`<img src="${v.thumbnail_url}" alt="${v.title}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`:`<span class="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-white/80 text-6xl">${ES.cat(v.category)?.icon||'movie'}</span>`}
${v.video_url?`<video muted loop playsinline preload="none" src="${v.video_url}" class="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"></video>`:''}
<div class="absolute top-3 left-3 flex gap-1.5 text-[11px] font-semibold"><span class="bg-black/60 text-white px-2 py-0.5 rounded">${ES.dur(v.duration_seconds||0)}</span><span class="bg-white/90 text-on-surface px-2 py-0.5 rounded">${v.resolution||'HD'}</span></div>
<span class="material-symbols-outlined absolute bottom-3 right-3 bg-white/90 text-primary rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition" style="font-variation-settings:'FILL' 1">play_arrow</span></div>
<div class="p-4"><h3 class="font-semibold leading-snug group-hover:text-primary transition-colors">${v.title}</h3><p class="text-xs text-on-surface-variant mt-1">${ES.cat(v.category)?.name||''} · ${ES.subName(v.category,v.subcategory)}</p></div></a>`;
window.esHoverPlay=root=>root.querySelectorAll('a.group').forEach(a=>{const vd=a.querySelector('video');if(!vd)return;a.onmouseenter=()=>vd.play().catch(()=>{});a.onmouseleave=()=>{vd.pause();vd.currentTime=0}});
})();
