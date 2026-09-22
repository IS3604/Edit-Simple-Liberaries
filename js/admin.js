import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const C = window.ES_CONFIG;
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast = (m, err) => { const t = document.createElement('div'); t.textContent = m; t.className = `fixed left-1/2 -translate-x-1/2 bottom-6 z-[80] px-5 py-3 rounded-xl text-sm shadow-xl text-white ${err ? 'bg-red-700' : 'bg-neutral-900'}`; document.body.appendChild(t); setTimeout(() => t.remove(), 3500); };
let cats = [], videos = [];

// ---------- AUTH ----------
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('login');
  const { data: ok } = await sb.rpc('is_admin');
  if (!ok) { await sb.auth.signOut(); $('#loginErr').textContent = 'This account is not an admin. Add it to the admins table.'; return show('login'); }
  show('app'); await loadAll(); tab(location.hash.slice(1) || 'dash');
}
function show(w) { $('#login').classList.toggle('hidden', w !== 'login'); $('#app').classList.toggle('hidden', w !== 'app'); }
$('#loginForm').onsubmit = async e => { e.preventDefault(); $('#loginErr').textContent = '';
  const f = new FormData(e.target); const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  if (error) $('#loginErr').textContent = error.message; else boot(); };
$('#logout').onclick = async () => { await sb.auth.signOut(); show('login'); };

// ---------- TABS ----------
function tab(t) { if (!['dash','videos','cats'].includes(t)) t = 'dash'; location.hash = t;
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 't-' + t));
  $$('.tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('bg-primary', on); b.classList.toggle('text-on-primary', on); b.classList.toggle('hover:bg-surface-container', !on); }); }
$$('.tab').forEach(b => b.onclick = () => tab(b.dataset.tab));

// ---------- DATA ----------
async function loadAll() {
  const [c, v] = await Promise.all([sb.from('categories').select('*').order('sort'), sb.from('videos').select('*').order('created_at', { ascending: false })]);
  if (c.error) toast('Categories: ' + c.error.message + ' — did you run admin.sql?', 1);
  if (v.error) toast('Videos: ' + v.error.message, 1);
  cats = c.data || []; videos = v.data || []; renderDash(); renderVideos(); renderCats(); fillCatSelects();
}
const mains = () => cats.filter(c => !c.parent_slug);
const subsOf = m => cats.filter(c => c.parent_slug === m);
const cname = s => cats.find(c => c.slug === s)?.name || s;

// ---------- DASHBOARD ----------
function renderDash() {
  const pub = videos.filter(v => v.published).length;
  const stat = (i, n, l) => `<div class="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5"><span class="material-symbols-outlined text-primary">${i}</span><p class="text-3xl font-bold mt-2">${n}</p><p class="text-sm text-on-surface-variant">${l}</p></div>`;
  $('#stats').innerHTML = stat('movie', videos.length, 'Total videos') + stat('public', pub, 'Published') + stat('edit_note', videos.length - pub, 'Drafts') + stat('category', cats.length, 'Categories');
  $('#bySub').innerHTML = mains().map(m => `<div class="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5"><p class="font-semibold mb-3">${esc(m.name)} <span class="text-on-surface-variant font-normal">(${videos.filter(v => v.category === m.slug).length})</span></p>
    ${subsOf(m.slug).map(s => { const n = videos.filter(v => v.subcategory === s.slug).length; return `<div class="flex justify-between text-sm py-1"><span>${esc(s.name)}</span><span class="${n ? '' : 'text-error'}">${n}</span></div>`; }).join('')}</div>`).join('');
}

// ---------- VIDEOS ----------
function renderVideos() {
  const q = $('#vq').value.toLowerCase(), c = $('#vcat').value, p = $('#vpub').value;
  const list = videos.filter(v => (!q || v.title.toLowerCase().includes(q)) && (!c || v.category === c || v.subcategory === c) && (!p || String(+v.published) === p));
  $('#vempty').classList.toggle('hidden', list.length > 0);
  $('#vrows').innerHTML = list.map(v => `<tr class="border-b border-outline-variant/30 last:border-0">
    <td class="p-3"><div class="flex items-center gap-3"><div class="w-24 aspect-video rounded-md bg-surface-container overflow-hidden shrink-0">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : ''}</div><div class="min-w-0"><p class="font-medium truncate max-w-[240px]">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${new Date(v.created_at).toLocaleDateString()}</p></div></div></td>
    <td class="p-3 whitespace-nowrap">${esc(cname(v.category))}<br><span class="text-xs text-on-surface-variant">${esc(cname(v.subcategory))}</span></td>
    <td class="p-3 whitespace-nowrap text-xs">${esc(v.resolution)} · ${v.fps}fps<br>${Math.floor(v.duration_seconds / 60)}:${String(v.duration_seconds % 60).padStart(2, '0')} · ${esc(v.orientation)}</td>
    <td class="p-3"><button data-pub="${v.id}" class="text-xs font-semibold px-2.5 py-1 rounded-full ${v.published ? 'bg-green-100 text-green-800' : 'bg-surface-container text-on-surface-variant'}">${v.published ? 'Published' : 'Draft'}</button></td>
    <td class="p-3 text-right whitespace-nowrap"><a href="video.html?id=${v.id}" target="_blank" title="View" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">visibility</a><button data-edit="${v.id}" title="Edit" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">edit</button><button data-del="${v.id}" title="Delete" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">delete</button></td></tr>`).join('');
}
['#vq', '#vcat', '#vpub'].forEach(s => $(s).addEventListener('input', renderVideos));
$('#vrows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) openVideo(videos.find(v => v.id === b.dataset.edit));
  if (b.dataset.pub) { const v = videos.find(x => x.id === b.dataset.pub); const { error } = await sb.from('videos').update({ published: !v.published }).eq('id', v.id); if (error) return toast(error.message, 1); v.published = !v.published; renderVideos(); renderDash(); }
  if (b.dataset.del) { const v = videos.find(x => x.id === b.dataset.del); if (!confirm(`Delete "${v.title}"? This also removes its uploaded files.`)) return;
    const paths = [v.video_url, v.thumbnail_url].map(storagePath).filter(Boolean); if (paths.length) await sb.storage.from('videos').remove(paths);
    const { error } = await sb.from('videos').delete().eq('id', v.id); if (error) return toast(error.message, 1); toast('Deleted'); loadAll(); }
};
const storagePath = url => { const m = String(url || '').match(/\/storage\/v1\/object\/public\/videos\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };

function fillCatSelects() {
  const opts = mains().map(m => `<option value="${m.slug}">${esc(m.name)}</option>`).join('');
  $('#vcat').innerHTML = '<option value="">All categories</option>' + mains().map(m => `<option value="${m.slug}">${esc(m.name)}</option>` + subsOf(m.slug).map(s => `<option value="${s.slug}">&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('');
  $('#vform').category.innerHTML = opts;
  $('#cform').parent_slug.innerHTML = '<option value="">— None (main category) —</option>' + opts;
}
function fillSubs(sel) { const f = $('#vform'); f.subcategory.innerHTML = subsOf(f.category.value).map(s => `<option value="${s.slug}">${esc(s.name)}</option>`).join(''); if (sel) f.subcategory.value = sel; }
$('#vform').category.onchange = () => fillSubs();

let editing = null, thumbBlob = null;
function openVideo(v) {
  editing = v || null; thumbBlob = null; const f = $('#vform'); f.reset(); $('#vtitle').textContent = v ? 'Edit video' : 'Add video';
  $('#vprev').classList.add('hidden'); $('#tprev').classList.add('hidden'); $('#progress').classList.add('hidden');
  if (v) { ['title', 'description', 'video_url', 'thumbnail_url', 'duration_seconds', 'resolution', 'fps', 'orientation'].forEach(k => f[k].value = v[k] ?? ''); f.category.value = v.category; f.tags.value = (v.tags || []).join(', '); f.published.checked = v.published;
    if (v.thumbnail_url) { $('#tprev').src = v.thumbnail_url; $('#tprev').classList.remove('hidden'); } }
  fillSubs(v?.subcategory); $('#vmodal').classList.remove('hidden');
}
$('#newVideo').onclick = () => openVideo();
$$('[data-close]').forEach(b => b.onclick = () => b.closest('.fixed').classList.add('hidden'));

// Auto-detect metadata + thumbnail from selected video
$('#vform').vfile.onchange = e => {
  const file = e.target.files[0]; if (!file) return; const f = $('#vform'), vid = $('#vprev');
  vid.src = URL.createObjectURL(file); vid.classList.remove('hidden');
  if (!f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  vid.onloadedmetadata = () => { f.duration_seconds.value = Math.round(vid.duration); const w = vid.videoWidth, h = vid.videoHeight, big = Math.max(w, h);
    f.resolution.value = big >= 3000 ? '4K' : big >= 1800 ? '1080p' : '720p'; f.orientation.value = w > h ? 'horizontal' : w < h ? 'vertical' : 'square';
    vid.currentTime = Math.min(1, vid.duration / 3); };
  vid.onseeked = () => { if (f.tfile.files[0]) return; const cv = document.createElement('canvas'); const sc = Math.min(1, 1280 / vid.videoWidth); cv.width = vid.videoWidth * sc; cv.height = vid.videoHeight * sc;
    cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height); cv.toBlob(b => { thumbBlob = b; $('#tprev').src = URL.createObjectURL(b); $('#tprev').classList.remove('hidden'); }, 'image/jpeg', 0.85); vid.onseeked = null; };
};
$('#vform').tfile.onchange = e => { const t = e.target.files[0]; if (t) { thumbBlob = null; $('#tprev').src = URL.createObjectURL(t); $('#tprev').classList.remove('hidden'); } };

async function upload(fileOrBlob, name, label) {
  $('#ptext').textContent = 'Uploading ' + label + '…';
  const path = `${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const { error } = await sb.storage.from('videos').upload(path, fileOrBlob, { upsert: false, contentType: fileOrBlob.type || undefined });
  if (error) throw new Error(label + ': ' + error.message);
  return sb.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
$('#vform').onsubmit = async e => {
  e.preventDefault(); const f = e.target, btn = $('#vsave'); btn.disabled = true; btn.textContent = 'Saving…'; $('#progress').classList.remove('hidden'); $('#bar').style.width = '10%';
  try {
    const row = { title: f.title.value.trim(), description: f.description.value.trim(), category: f.category.value, subcategory: f.subcategory.value, video_url: f.video_url.value.trim() || null,
      thumbnail_url: f.thumbnail_url.value || null, duration_seconds: +f.duration_seconds.value || 0, resolution: f.resolution.value, fps: +f.fps.value, orientation: f.orientation.value,
      tags: f.tags.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean), published: f.published.checked };
    const old = editing ? { v: editing.video_url, t: editing.thumbnail_url } : {};
    const vf = f.vfile.files[0], tf = f.tfile.files[0];
    if (vf) { row.video_url = await upload(vf, vf.name, 'video'); $('#bar').style.width = '70%'; }
    if (tf) row.thumbnail_url = await upload(tf, tf.name, 'thumbnail'); else if (thumbBlob) row.thumbnail_url = await upload(thumbBlob, 'thumb.jpg', 'thumbnail');
    $('#bar').style.width = '90%'; $('#ptext').textContent = 'Saving details…';
    const { error } = editing ? await sb.from('videos').update(row).eq('id', editing.id) : await sb.from('videos').insert(row);
    if (error) throw error;
    const stale = [old.v !== row.video_url && old.v, old.t !== row.thumbnail_url && old.t].map(storagePath).filter(Boolean); if (stale.length) await sb.storage.from('videos').remove(stale);
    $('#bar').style.width = '100%'; toast(editing ? 'Video updated' : 'Video added'); $('#vmodal').classList.add('hidden'); loadAll();
  } catch (err) { toast(err.message, 1); $('#ptext').textContent = err.message; }
  btn.disabled = false; btn.textContent = 'Save';
};

// ---------- CATEGORIES ----------
function renderCats() {
  $('#catList').innerHTML = mains().map(m => `<div class="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5">
    <div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-primary">${esc(m.icon || 'movie')}</span><p class="font-semibold flex-1">${esc(m.name)}</p>
    <button data-cedit="${m.slug}" class="material-symbols-outlined text-lg p-1 rounded hover:bg-surface-container">edit</button><button data-cdel="${m.slug}" class="material-symbols-outlined text-lg p-1 rounded hover:bg-red-50 text-error">delete</button></div>
    <p class="text-xs text-on-surface-variant mb-3">/${esc(m.slug)} · ${esc(m.blurb || '')}</p>
    ${subsOf(m.slug).map(s => `<div class="flex items-center text-sm py-1.5 border-t border-outline-variant/30"><span class="flex-1">${esc(s.name)} <span class="text-xs text-on-surface-variant">/${esc(s.slug)}</span></span>
      <button data-cedit="${s.slug}" class="material-symbols-outlined text-base p-1 rounded hover:bg-surface-container">edit</button><button data-cdel="${s.slug}" class="material-symbols-outlined text-base p-1 rounded hover:bg-red-50 text-error">delete</button></div>`).join('')}
    <button data-cadd="${m.slug}" class="mt-3 text-sm text-primary font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-base">add</span>Add subcategory</button></div>`).join('');
}
function openCat(c, parent) { const f = $('#cform'); f.reset(); $('#ctitle').textContent = c ? 'Edit category' : 'Add category';
  f.orig.value = c?.slug || ''; ['name', 'slug', 'icon', 'blurb', 'sort'].forEach(k => f[k].value = c?.[k] ?? (k === 'sort' ? 0 : '')); f.parent_slug.value = c ? (c.parent_slug || '') : (parent || '');
  $('#mainOnly').classList.toggle('hidden', !!f.parent_slug.value); $('#cmodal').classList.remove('hidden'); }
$('#cform').parent_slug.onchange = e => $('#mainOnly').classList.toggle('hidden', !!e.target.value);
$('#cform').name.oninput = e => { const f = $('#cform'); if (!f.orig.value) f.slug.value = e.target.value.toLowerCase().replace(/^for\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
$('#newCat').onclick = () => openCat();
$('#catList').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.cadd) openCat(null, b.dataset.cadd);
  if (b.dataset.cedit) openCat(cats.find(c => c.slug === b.dataset.cedit));
  if (b.dataset.cdel) { const s = b.dataset.cdel, n = videos.filter(v => v.category === s || v.subcategory === s).length;
    if (n) return toast(`Can't delete: ${n} video(s) use this category. Move them first.`, 1);
    if (!confirm('Delete this category' + (subsOf(s).length ? ' and its subcategories' : '') + '?')) return;
    const { error } = await sb.from('categories').delete().eq('slug', s); if (error) return toast(error.message, 1); toast('Deleted'); loadAll(); } };
$('#cform').onsubmit = async e => { e.preventDefault(); const f = e.target;
  const row = { name: f.name.value.trim(), slug: f.slug.value.trim(), parent_slug: f.parent_slug.value || null, icon: f.icon.value.trim() || null, blurb: f.blurb.value.trim() || null, sort: +f.sort.value || 0 };
  if (row.parent_slug === row.slug) return toast('A category cannot be its own parent', 1);
  const { error } = f.orig.value ? await sb.from('categories').update(row).eq('slug', f.orig.value) : await sb.from('categories').insert(row);
  if (error) return toast(error.message, 1);
  if (f.orig.value && f.orig.value !== row.slug) { await sb.from('videos').update({ category: row.slug }).eq('category', f.orig.value); await sb.from('videos').update({ subcategory: row.slug }).eq('subcategory', f.orig.value); }
  toast('Saved'); $('#cmodal').classList.add('hidden'); loadAll(); };

boot();
