import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const C = window.ES_CONFIG;
// Read email-link params BEFORE the client consumes the URL hash
const QS = new URLSearchParams(location.search), HP = new URLSearchParams(location.hash.slice(1));
const LINK = { hash: QS.get('token_hash'), type: QS.get('type') || HP.get('type'), err: QS.get('error_description') || HP.get('error_description') };
const sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const ADMIN_URL = location.origin + location.pathname;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m, err) => { const t = document.createElement('div'); t.textContent = m; t.setAttribute('role', 'status'); t.className = `fixed left-1/2 -translate-x-1/2 bottom-6 z-[80] px-5 py-3 rounded-xl text-sm shadow-xl text-white max-w-[90vw] ${err ? 'bg-red-700' : 'bg-neutral-900'}`; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
const dur = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;
const skRows = (n, cols) => Array.from({ length: n }, () => `<tr>${Array.from({ length: cols }, (_, i) => `<td class="p-3"><div class="sk h-${i ? 4 : 12} ${i ? 'w-20' : 'w-48'}"></div></td>`).join('')}</tr>`).join('');
const skCards = (n, h = 28) => Array.from({ length: n }, () => `<div class="sk h-${h} !rounded-xl"></div>`).join('');

let me = null, role = null, cats = [], videos = [], reqs = [], team = [], invites = [];
const isSuper = () => role === 'superadmin';

// ---------------- AUTH ----------------
function show(w) { ['boot', 'login', 'app', 'setpw', 'linkmsg'].forEach(id => { const el = $('#' + id); el.classList.remove('hidden'); el.style.display = id === w ? '' : 'none'; }); }
const cleanUrl = () => history.replaceState(null, '', ADMIN_URL);
function linkMsg(t, m) { $('#linkTitle').textContent = t; $('#linkText').textContent = m; show('linkmsg'); }
function askPassword(user, mode) {
  $('#setpwEmail').value = user.email;
  $('#setpwTitle').textContent = mode === 'recovery' ? 'Reset your password' : 'Create your password';
  $('#setpwSub').textContent = mode === 'recovery' ? 'Choose a new password for your account.' : 'Welcome to Edit Simple Libraries! Set a password to finish creating your admin account.';
  show('setpw');
}
$('#setpwForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, err = $('#setpwErr'), b = f.querySelector('button'); err.textContent = '';
  if (f.pw.value !== f.pw2.value) return err.textContent = 'Passwords do not match.';
  b.disabled = true; b.textContent = 'Saving…';
  const { error } = await sb.auth.updateUser({ password: f.pw.value, data: { password_set: true } });
  b.disabled = false; b.textContent = 'Save password & continue';
  if (error) return err.textContent = error.message;
  toast('Password saved'); show('boot'); boot(true);
};
$('#forgotBtn').onclick = async () => {
  const email = $('#loginForm').email.value.trim(); if (!email) { $('#loginErr').textContent = 'Enter your email above first.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: ADMIN_URL });
  if (error) $('#loginErr').textContent = error.message; else toast('Reset link sent — check your inbox');
};
// Handles links from Supabase emails (invite, signup, magic link, reset, email change)
async function handleLink() {
  const LINK0 = { ...LINK }; LINK.hash = LINK.type = LINK.err = null; { const LINK = LINK0;
  if (LINK.err) { cleanUrl(); linkMsg('Link expired or invalid', LINK.err.replace(/\+/g, ' ') + '. Ask for a new link or use "Forgot password".'); return 'stop'; }
  if (LINK.hash && LINK.type) {
    const { error } = await sb.auth.verifyOtp({ token_hash: LINK.hash, type: LINK.type });
    cleanUrl();
    if (error) { linkMsg('Link expired or invalid', error.message + '. Ask for a new link or use "Forgot password".'); return 'stop'; }
  } else if (LINK.type) { await sb.auth.getSession(); cleanUrl(); }
  if (LINK.type === 'email_change') toast('Email address updated');
  if (LINK.type === 'signup' || LINK.type === 'email') toast('Email confirmed');
  return LINK.type; }
}
let linkType = null;
async function boot(skipLink) {
  if (!skipLink) { linkType = await handleLink(); if (linkType === 'stop') return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('login');
  me = session.user;
  if (!skipLink && (linkType === 'invite' || linkType === 'recovery' || (['magiclink', 'signup', 'email'].includes(linkType) && !me.user_metadata?.password_set))) return askPassword(me, linkType);
  const { data: r } = await sb.rpc('my_role');
  if (!r) { await sb.auth.signOut(); $('#loginErr').textContent = 'This account has no admin access yet. Ask a superadmin to add you in Team.'; return show('login'); }
  role = r;
  $('#meEmail').textContent = me.email;
  $('#meRole').textContent = role; $('#meRole').className += isSuper() ? ' bg-primary text-on-primary' : ' bg-surface-container text-on-surface-variant';
  buildTabs(); show('app');
  paintSkeletons(); tab(location.hash.slice(1) || 'dash');
  await loadAll();
}
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#loginErr').textContent = ''; const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Logging in…';
  const f = new FormData(e.target); const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  b.disabled = false; b.textContent = 'Log in';
  if (error) $('#loginErr').textContent = error.message; else { show('boot'); boot(); }
};
const logout = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
$('#logout').onclick = logout; $('#logoutM').onclick = logout;

// ---------------- TABS ----------------
function buildTabs() {
  const t = [['dash', 'dashboard', 'Dashboard'], ['videos', 'movie', 'Videos'],
    isSuper() ? ['review', 'fact_check', 'Review'] : ['requests', 'pending_actions', 'My requests'],
    ['cats', 'category', 'Categories'], ...(isSuper() ? [['team', 'group', 'Team']] : [])];
  $('#tabs').innerHTML = t.map(([k, i, l]) => `<button data-tab="${k}" class="tab flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"><span class="material-symbols-outlined">${i}</span><span class="hidden sm:inline">${l}</span><span data-badge="${k}" class="hidden ml-auto text-[11px] font-bold bg-error text-white rounded-full px-1.5 min-w-[20px] text-center"></span></button>`).join('');
  $$('.tab').forEach(b => b.onclick = () => tab(b.dataset.tab));
}
function tab(t) {
  if (!$('#t-' + t) || !$(`.tab[data-tab="${t}"]`)) t = 'dash'; history.replaceState(null, '', '#' + t);
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 't-' + t));
  $$('.tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('bg-primary', on); b.classList.toggle('text-on-primary', on); b.classList.toggle('hover:bg-surface-container', !on); });
}
function badge(k, n) { const b = $(`[data-badge="${k}"]`); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); }

function paintSkeletons() {
  $('#stats').innerHTML = skCards(4); $('#bySub').innerHTML = skCards(3, 40);
  $('#vrows').innerHTML = skRows(5, 5); $('#catList').innerHTML = skCards(3, 64);
  if ($('#rvList')) { $('#rvList').innerHTML = skCards(2, 64); $('#rcList').innerHTML = skCards(2, 16); }
  $('#myReq').innerHTML = skCards(3, 16); $('#teamRows').innerHTML = skRows(3, 3);
}

// ---------------- DATA ----------------
async function loadAll() {
  const [c, v, r, a, inv] = await Promise.all([
    sb.from('categories').select('*').order('sort'),
    sb.from('videos').select('*').order('created_at', { ascending: false }),
    sb.from('change_requests').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('admins').select('user_id,email,role'), sb.from('admin_invites').select('*').order('created_at', { ascending: false })]);
  for (const [n, x] of [['Categories', c], ['Videos', v], ['Requests', r], ['Team', a]]) if (x.error) toast(`${n}: ${x.error.message}${/does not exist|column/.test(x.error.message) ? ' — run roles.sql' : ''}`, 1);
  cats = c.data || []; videos = v.data || []; reqs = r.data || []; team = a.data || []; invites = inv?.data || [];
  renderDash(); renderVideos(); renderCats(); fillCatSelects(); renderReview(); renderMyReq(); renderTeam(); if (isSuper()) renderInvites();
}
const mains = () => cats.filter(c => !c.parent_slug);
const subsOf = m => cats.filter(c => c.parent_slug === m);
const cname = s => cats.find(c => c.slug === s)?.name || s;
const who = id => team.find(t => t.user_id === id)?.email || (id === me.id ? me.email : 'unknown');
const isLive = v => v.status === 'approved' && v.published;
const pendReqFor = (entity, target) => reqs.find(r => r.status === 'pending' && r.entity === entity && r.target === target);

// ---------------- DASHBOARD ----------------
function renderDash() {
  const live = videos.filter(isLive).length, pend = videos.filter(v => v.status === 'pending').length, preq = reqs.filter(r => r.status === 'pending').length;
  const stat = (i, n, l, tabk) => `<button ${tabk ? `data-go="${tabk}"` : ''} class="text-left bg-white rounded-xl border border-outline-variant/40 p-5 hover:border-primary/50 transition"><span class="material-symbols-outlined text-primary">${i}</span><p class="text-3xl font-bold mt-2">${n}</p><p class="text-sm text-on-surface-variant">${l}</p></button>`;
  $('#stats').innerHTML = stat('movie', videos.length, 'Total videos', 'videos') + stat('public', live, 'Live on website', 'videos') + stat('hourglass_top', pend, 'Videos awaiting review', isSuper() ? 'review' : 'requests') + stat('edit_note', preq, 'Pending changes', isSuper() ? 'review' : 'requests');
  $$('[data-go]').forEach(b => b.onclick = () => tab(b.dataset.go));
  $('#dashNote').innerHTML = isSuper()
    ? (pend + preq ? `<div class="rounded-xl bg-primary-fixed text-on-primary-fixed p-4 flex items-center gap-3"><span class="material-symbols-outlined">notifications_active</span><p class="flex-1 text-sm"><b>${pend + preq}</b> item(s) waiting for your review.</p><button data-go2 class="text-sm font-semibold underline">Open review</button></div>` : '')
    : `<div class="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant flex gap-3"><span class="material-symbols-outlined text-primary">info</span>You're a <b>&nbsp;normal admin&nbsp;</b>: your uploads and changes go live only after a superadmin approves them.</div>`;
  $('[data-go2]')?.addEventListener('click', () => tab('review'));
  $('#bySub').innerHTML = mains().map(m => `<div class="bg-white rounded-xl border border-outline-variant/40 p-5"><p class="font-semibold mb-3">${esc(m.name)} <span class="text-on-surface-variant font-normal">(${videos.filter(v => isLive(v) && v.category === m.slug).length})</span></p>
    ${subsOf(m.slug).map(s => { const n = videos.filter(v => isLive(v) && v.subcategory === s.slug).length; return `<div class="flex justify-between text-sm py-1"><span>${esc(s.name)}</span><span class="${n ? '' : 'text-error font-medium'}">${n}</span></div>`; }).join('')}</div>`).join('') || '<p class="text-on-surface-variant">No categories yet.</p>';
  badge(isSuper() ? 'review' : 'requests', isSuper() ? pend + preq : reqs.filter(r => r.requested_by === me.id && r.status === 'pending').length + videos.filter(v => v.submitted_by === me.id && v.status === 'pending').length);
}

// ---------------- VIDEOS ----------------
function statusChip(v) {
  const pr = pendReqFor('video', v.id);
  const map = { approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Hidden', 'bg-surface-container text-on-surface-variant'], pending: ['Pending review', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'] };
  const [l, c] = map[v.status] || map.pending;
  return `<span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${c}">${l}</span>${pr ? `<span class="block mt-1 text-[11px] text-amber-700">Change ${pr.action} pending</span>` : ''}${v.status === 'rejected' && v.review_note ? `<span class="block mt-1 text-[11px] text-red-700 max-w-[160px]">“${esc(v.review_note)}”</span>` : ''}`;
}
function canDirect(v) { return isSuper() || (v.submitted_by === me.id && v.status !== 'approved'); }
function renderVideos() {
  const q = $('#vq').value.toLowerCase().trim(), c = $('#vcat').value, s = $('#vstat').value;
  const list = videos.filter(v => (!q || (v.search_text || (v.title + ' ' + (v.tags || []).join(' '))).toLowerCase().includes(q)) && (!c || v.category === c || v.subcategory === c) &&
    (!s || (s === 'live' && isLive(v)) || (s === 'hidden' && v.status === 'approved' && !v.published) || s === v.status || (s === 'mine' && v.submitted_by === me.id)));
  $('#vempty').classList.toggle('hidden', list.length > 0);
  $('#vrows').innerHTML = list.map(v => {
    const direct = canDirect(v), pr = pendReqFor('video', v.id);
    return `<tr class="border-b border-outline-variant/30 last:border-0 align-top">
    <td class="p-3"><div class="flex items-center gap-3"><button data-play="${v.id}" class="relative w-24 aspect-video rounded-md bg-surface-container overflow-hidden shrink-0" aria-label="Preview">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" loading="lazy" class="w-full h-full object-cover" alt="">` : ''}<span class="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-white drop-shadow !text-xl">play_circle</span></button>
      <div class="min-w-0"><p class="font-medium truncate max-w-[240px]">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">by ${esc(who(v.submitted_by))} · ${new Date(v.created_at).toLocaleDateString()}</p></div></div></td>
    <td class="p-3 whitespace-nowrap">${esc(cname(v.category))}<br><span class="text-xs text-on-surface-variant">${esc(cname(v.subcategory))}</span></td>
    <td class="p-3 whitespace-nowrap text-xs">${esc(v.resolution)} · ${v.fps}fps<br>${dur(v.duration_seconds)} · ${esc(v.orientation)}</td>
    <td class="p-3">${statusChip(v)}</td>
    <td class="p-3 text-right whitespace-nowrap">
      ${isSuper() && v.status === 'pending' ? `<button data-approve="${v.id}" title="Approve" class="material-symbols-outlined p-1.5 rounded hover:bg-green-50 text-green-700">check_circle</button><button data-reject="${v.id}" title="Reject" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">cancel</button>` : ''}
      ${isSuper() && v.status === 'approved' ? `<button data-pub="${v.id}" title="${v.published ? 'Hide from site' : 'Show on site'}" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">${v.published ? 'visibility_off' : 'visibility'}</button>` : ''}
      ${!pr ? `<button data-edit="${v.id}" title="${direct ? 'Edit' : 'Request edit'}" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">edit</button>
      <button data-del="${v.id}" title="${direct ? 'Delete' : 'Request deletion'}" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">delete</button>` : ''}</td></tr>`;
  }).join('');
}
['#vq', '#vcat', '#vstat'].forEach(s => $(s).addEventListener('input', renderVideos));
$('#vrows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset; const v = videos.find(x => x.id === (d.edit || d.del || d.pub || d.approve || d.reject || d.play));
  if (d.play) return preview(v);
  if (d.edit) return openVideo(v);
  if (d.approve) return reviewVideo(v, true);
  if (d.reject) return reviewVideo(v, false);
  if (d.pub) { const { error } = await sb.from('videos').update({ published: !v.published }).eq('id', v.id); if (error) return toast(error.message, 1); toast(v.published ? 'Hidden from website' : 'Now visible on website'); return loadAll(); }
  if (d.del) {
    if (canDirect(v)) {
      if (!confirm(`Delete "${v.title}"? This also removes its uploaded files.`)) return;
      const paths = [v.video_url, v.thumbnail_url].map(storagePath).filter(Boolean); if (paths.length) await sb.storage.from('videos').remove(paths);
      const { error } = await sb.from('videos').delete().eq('id', v.id); if (error) return toast(error.message, 1); toast('Deleted'); return loadAll();
    }
    if (!confirm(`Request deletion of "${v.title}"? A superadmin must approve it.`)) return;
    return request('video', 'delete', v.id, {}, `Delete video “${v.title}”`);
  }
};
function preview(v) { if (!v?.video_url) return toast('No video file', 1); $('#pvid').src = v.video_url; $('#pmodal').classList.remove('hidden'); $('#pvid').play().catch(() => { }); }
$('#pmodal').addEventListener('click', e => { if (e.target.id === 'pmodal' || e.target.closest('[data-close]')) { $('#pvid').pause(); $('#pvid').removeAttribute('src'); $('#pmodal').classList.add('hidden'); } });
const storagePath = url => { const m = String(url || '').match(/\/storage\/v1\/object\/public\/videos\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };

async function request(entity, action, target, payload, summary) {
  const { error } = await sb.from('change_requests').insert({ entity, action, target, payload, summary, requested_by: me.id, requested_email: me.email });
  if (error) { toast(error.message, 1); return false; }
  toast('Sent to superadmin for approval'); loadAll(); return true;
}
async function reviewVideo(v, ok) {
  let note = null; if (!ok) { note = prompt('Reason for rejection (shown to the uploader):'); if (note === null) return; }
  const { error } = await sb.from('videos').update({ status: ok ? 'approved' : 'rejected', reviewed_by: me.id, review_note: note }).eq('id', v.id);
  if (error) return toast(error.message, 1); toast(ok ? 'Approved — now live' : 'Rejected'); loadAll();
}

function fillCatSelects() {
  const opts = mains().map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  $('#vcat').innerHTML = '<option value="">All categories</option>' + mains().map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>` + subsOf(m.slug).map(s => `<option value="${esc(s.slug)}">&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('');
  $('#vform').category.innerHTML = opts;
  $('#cform').parent_slug.innerHTML = '<option value="">— None (main category) —</option>' + opts;
}
function fillSubs(sel) { const f = $('#vform'); f.subcategory.innerHTML = subsOf(f.category.value).map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join(''); if (sel) f.subcategory.value = sel; }
$('#vform').category.onchange = () => fillSubs();

let editing = null, thumbBlob = null;
function openVideo(v) {
  editing = v || null; thumbBlob = null; const f = $('#vform'); f.reset(); $('#vtitle').textContent = v ? 'Edit video' : 'Add video';
  $('#vprev').classList.add('hidden'); $('#tprev').classList.add('hidden'); $('#progress').classList.add('hidden');
  const direct = !v || canDirect(v), n = $('#vnote');
  n.classList.toggle('hidden', isSuper());
  n.textContent = !v ? 'This video will be sent to a superadmin for approval before it appears on the website.' : direct ? 'Saving will re-submit this video for approval.' : 'This video is live. Your edits will be sent as a change request — the live version stays until a superadmin approves.';
  $('#vsave').textContent = isSuper() ? 'Save' : v && !direct ? 'Request change' : 'Submit for review';
  if (v) {
    ['title', 'description', 'content', 'video_url', 'thumbnail_url', 'duration_seconds', 'resolution', 'fps', 'orientation'].forEach(k => f[k].value = v[k] ?? '');
    f.category.value = v.category; f.tags.value = (v.tags || []).join(', '); f.published.checked = v.published;
    if (v.thumbnail_url) { $('#tprev').src = v.thumbnail_url; $('#tprev').classList.remove('hidden'); }
  }
  fillSubs(v?.subcategory); $('#vmodal').classList.remove('hidden'); f.title.focus();
}
$('#newVideo').onclick = () => openVideo();
$$('#vmodal [data-close], #cmodal [data-close]').forEach(b => b.onclick = () => b.closest('.fixed').classList.add('hidden'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['#vmodal', '#cmodal'].forEach(s => $(s).classList.add('hidden')); });

$('#vform').vfile.onchange = e => {
  const file = e.target.files[0]; if (!file) return; const f = $('#vform'), vid = $('#vprev');
  if (file.size > 50 * 1024 * 1024) toast('Warning: file is over 50 MB — Supabase free plan may reject it', 1);
  vid.src = URL.createObjectURL(file); vid.classList.remove('hidden');
  if (!f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  vid.onloadedmetadata = () => {
    f.duration_seconds.value = Math.round(vid.duration); const w = vid.videoWidth, h = vid.videoHeight, big = Math.max(w, h);
    f.resolution.value = big >= 3000 ? '4K' : big >= 1800 ? '1080p' : '720p'; f.orientation.value = w > h ? 'horizontal' : w < h ? 'vertical' : 'square';
    vid.currentTime = Math.min(1, vid.duration / 3);
  };
  vid.onseeked = () => {
    if (f.tfile.files[0]) return; const cv = document.createElement('canvas'); const sc = Math.min(1, 1280 / vid.videoWidth); cv.width = vid.videoWidth * sc; cv.height = vid.videoHeight * sc;
    cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height); cv.toBlob(b => { thumbBlob = b; $('#tprev').src = URL.createObjectURL(b); $('#tprev').classList.remove('hidden'); }, 'image/jpeg', 0.82); vid.onseeked = null;
  };
};
$('#vform').tfile.onchange = e => { const t = e.target.files[0]; if (t) { thumbBlob = null; $('#tprev').src = URL.createObjectURL(t); $('#tprev').classList.remove('hidden'); } };

async function upload(fileOrBlob, name, label) {
  $('#ptext').textContent = 'Uploading ' + label + '…';
  const path = `${me.id.slice(0, 8)}/${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const { error } = await sb.storage.from('videos').upload(path, fileOrBlob, { upsert: false, contentType: fileOrBlob.type || undefined, cacheControl: '31536000' });
  if (error) throw new Error(label + ': ' + error.message);
  return sb.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
$('#vform').onsubmit = async e => {
  e.preventDefault(); const f = e.target, btn = $('#vsave'), label = btn.textContent; btn.disabled = true; btn.textContent = 'Saving…'; $('#progress').classList.remove('hidden'); $('#bar').style.width = '10%';
  try {
    const row = {
      title: f.title.value.trim(), description: f.description.value.trim(), content: f.content.value.trim(), category: f.category.value, subcategory: f.subcategory.value,
      video_url: f.video_url.value.trim() || null, thumbnail_url: f.thumbnail_url.value || null, duration_seconds: +f.duration_seconds.value || 0, resolution: f.resolution.value,
      fps: +f.fps.value, orientation: f.orientation.value, tags: [...new Set(f.tags.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))], published: f.published.checked
    };
    if (!row.subcategory) throw new Error('Pick a subcategory');
    const vf = f.vfile.files[0], tf = f.tfile.files[0];
    if (!editing && !vf && !row.video_url) throw new Error('Add a video file or URL');
    if (vf) { row.video_url = await upload(vf, vf.name, 'video'); $('#bar').style.width = '70%'; }
    if (tf) row.thumbnail_url = await upload(tf, tf.name, 'thumbnail'); else if (thumbBlob) row.thumbnail_url = await upload(thumbBlob, 'thumb.jpg', 'thumbnail');
    $('#bar').style.width = '90%'; $('#ptext').textContent = 'Saving details…';
    if (editing && !canDirect(editing)) {
      const ok = await request('video', 'update', editing.id, row, `Edit video “${editing.title}”`); if (!ok) throw new Error('Request failed');
    } else {
      const old = editing ? { v: editing.video_url, t: editing.thumbnail_url } : {};
      const { error } = editing ? await sb.from('videos').update(row).eq('id', editing.id) : await sb.from('videos').insert(row);
      if (error) throw error;
      const stale = [old.v !== row.video_url && old.v, old.t !== row.thumbnail_url && old.t].map(storagePath).filter(Boolean); if (stale.length) await sb.storage.from('videos').remove(stale);
      toast(isSuper() ? (editing ? 'Video updated' : 'Video published') : 'Submitted — waiting for superadmin approval'); loadAll();
    }
    $('#bar').style.width = '100%'; $('#vmodal').classList.add('hidden');
  } catch (err) { toast(err.message, 1); $('#ptext').textContent = err.message; }
  btn.disabled = false; btn.textContent = label;
};

// ---------------- REVIEW (superadmin) ----------------
const FIELDS = ['title', 'description', 'content', 'category', 'subcategory', 'tags', 'resolution', 'fps', 'orientation', 'duration_seconds', 'published', 'video_url', 'thumbnail_url', 'name', 'slug', 'parent_slug', 'icon', 'blurb', 'sort'];
function diff(r) {
  const cur = r.entity === 'video' ? videos.find(v => v.id === r.target) : cats.find(c => c.slug === r.target);
  if (r.action === 'delete') return `<p class="text-sm text-error">Will permanently delete ${r.entity} <b>${esc(cur?.title || cur?.name || r.target)}</b>.</p>`;
  const p = r.payload || {}; const fmt = x => Array.isArray(x) ? x.join(', ') : x === null || x === undefined ? '—' : String(x);
  const rows = FIELDS.filter(k => k in p && (r.action === 'insert' || fmt(p[k]) !== fmt(cur?.[k])));
  if (!rows.length) return '<p class="text-sm text-on-surface-variant">No field changes.</p>';
  return `<div class="overflow-x-auto"><table class="w-full text-xs mt-2"><thead class="text-on-surface-variant"><tr><th class="text-left p-1.5">Field</th>${r.action === 'update' ? '<th class="text-left p-1.5">Current</th>' : ''}<th class="text-left p-1.5">${r.action === 'update' ? 'Proposed' : 'Value'}</th></tr></thead><tbody>
    ${rows.map(k => `<tr class="border-t border-outline-variant/30"><td class="p-1.5 font-medium">${k}</td>${r.action === 'update' ? `<td class="p-1.5 text-on-surface-variant line-through break-all">${esc(fmt(cur?.[k]))}</td>` : ''}<td class="p-1.5 text-green-800 break-all">${esc(fmt(p[k]))}</td></tr>`).join('')}</tbody></table></div>`;
}
function reqCard(r, forReview) {
  const chip = { pending: 'bg-amber-100 text-amber-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' }[r.status];
  return `<div class="bg-white rounded-xl border border-outline-variant/40 p-4"><div class="flex flex-wrap items-center gap-2"><span class="material-symbols-outlined text-primary">${r.entity === 'video' ? 'movie' : 'category'}</span><p class="font-semibold flex-1 min-w-[200px]">${esc(r.summary || `${r.action} ${r.entity}`)}</p><span class="text-xs font-semibold px-2.5 py-1 rounded-full ${chip}">${r.status}</span></div>
  <p class="text-xs text-on-surface-variant mt-1">${esc(r.requested_email || who(r.requested_by))} · ${new Date(r.created_at).toLocaleString()}${r.review_note ? ` · Note: “${esc(r.review_note)}”` : ''}</p>
  ${r.status === 'pending' ? diff(r) : ''}
  ${forReview && r.status === 'pending' ? `<div class="flex gap-2 mt-3"><button data-rok="${r.id}" class="px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold">Approve</button><button data-rno="${r.id}" class="px-3 py-1.5 rounded-lg border border-outline-variant text-sm">Reject</button></div>` : ''}
  ${!forReview && r.status === 'pending' ? `<button data-rcancel="${r.id}" class="mt-3 text-sm text-error font-medium">Cancel request</button>` : ''}</div>`;
}
function renderReview() {
  if (!isSuper()) return;
  const pv = videos.filter(v => v.status === 'pending'), pr = reqs.filter(r => r.status === 'pending');
  $('#rvCount').textContent = `(${pv.length})`; $('#rcCount').textContent = `(${pr.length})`;
  $('#rvList').innerHTML = pv.map(v => `<div class="bg-white rounded-xl border border-outline-variant/40 overflow-hidden">
    <div class="aspect-video bg-black">${v.video_url ? `<video src="${esc(v.video_url)}" poster="${esc(v.thumbnail_url || '')}" controls preload="none" class="w-full h-full object-contain"></video>` : ''}</div>
    <div class="p-4"><p class="font-semibold">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${esc(cname(v.category))} › ${esc(cname(v.subcategory))} · ${esc(v.resolution)} · ${dur(v.duration_seconds)} · by ${esc(who(v.submitted_by))}</p>
    ${v.description ? `<p class="text-sm mt-2">${esc(v.description)}</p>` : ''}${v.content ? `<p class="text-sm mt-2 text-on-surface-variant"><b>Content:</b> ${esc(v.content)}</p>` : ''}
    <div class="flex flex-wrap gap-1 mt-2">${(v.tags || []).map(t => `<span class="text-[11px] px-2 py-0.5 rounded-full bg-surface-container">#${esc(t)}</span>`).join('')}</div>
    <div class="flex gap-2 mt-4"><button data-vok="${v.id}" class="px-3 py-1.5 rounded-lg bg-green-700 text-white text-sm font-semibold">Approve &amp; publish</button><button data-vno="${v.id}" class="px-3 py-1.5 rounded-lg border border-outline-variant text-sm">Reject</button><button data-vedit="${v.id}" class="px-3 py-1.5 rounded-lg text-sm text-primary font-medium">Edit first</button></div></div></div>`).join('') || '<p class="text-on-surface-variant text-sm">Nothing waiting. 🎉</p>';
  $('#rcList').innerHTML = pr.map(r => reqCard(r, true)).join('') || '<p class="text-on-surface-variant text-sm">No pending changes.</p>';
  $('#rcDone').innerHTML = reqs.filter(r => r.status !== 'pending').slice(0, 10).map(r => reqCard(r, false)).join('') || '<p class="text-on-surface-variant text-sm">—</p>';
}
$('#t-review').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.vok || d.vno) return reviewVideo(videos.find(v => v.id === (d.vok || d.vno)), !!d.vok);
  if (d.vedit) return openVideo(videos.find(v => v.id === d.vedit));
  if (d.rok || d.rno) {
    let note = null; if (d.rno) { note = prompt('Reason for rejection:'); if (note === null) return; }
    b.disabled = true; const { error } = await sb.rpc('review_change_request', { p_id: d.rok || d.rno, p_approve: !!d.rok, p_note: note });
    if (error) { b.disabled = false; return toast(error.message, 1); } toast(d.rok ? 'Approved & applied' : 'Rejected'); loadAll();
  }
};

// ---------------- MY REQUESTS (admin) ----------------
function renderMyReq() {
  if (isSuper()) return;
  const mv = videos.filter(v => v.submitted_by === me.id && v.status !== 'approved');
  const mr = reqs.filter(r => r.requested_by === me.id);
  $('#myReq').innerHTML = (mv.length ? `<h2 class="font-semibold">Uploads</h2>` + mv.map(v => `<div class="bg-white rounded-xl border border-outline-variant/40 p-4 flex items-center gap-3"><div class="w-20 aspect-video rounded bg-surface-container overflow-hidden shrink-0">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : ''}</div><div class="flex-1 min-w-0"><p class="font-medium truncate">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${new Date(v.created_at).toLocaleString()}</p></div>${statusChip(v)}</div>`).join('') : '')
    + (mr.length ? `<h2 class="font-semibold pt-4">Change requests</h2>` + mr.map(r => reqCard(r, false)).join('') : '')
    || '<p class="text-on-surface-variant">You have no pending uploads or requests.</p>';
}
$('#myReq').onclick = async e => { const id = e.target.closest('[data-rcancel]')?.dataset.rcancel; if (!id || !confirm('Cancel this request?')) return; const { error } = await sb.from('change_requests').delete().eq('id', id); if (error) return toast(error.message, 1); toast('Cancelled'); loadAll(); };

// ---------------- CATEGORIES ----------------
function renderCats() {
  $('#catHint').textContent = isSuper() ? 'Changes apply immediately.' : 'Your changes are sent to a superadmin for approval.';
  const pend = s => pendReqFor('category', s) ? '<span class="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full ml-1">change pending</span>' : '';
  const newReqs = reqs.filter(r => r.status === 'pending' && r.entity === 'category' && r.action === 'insert');
  $('#catList').innerHTML = mains().map(m => `<div class="bg-white rounded-xl border border-outline-variant/40 p-5">
    <div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-primary">${esc(m.icon || 'movie')}</span><p class="font-semibold flex-1">${esc(m.name)}${pend(m.slug)}</p>
    <button data-cedit="${esc(m.slug)}" class="material-symbols-outlined !text-lg p-1 rounded hover:bg-surface-container" aria-label="Edit">edit</button><button data-cdel="${esc(m.slug)}" class="material-symbols-outlined !text-lg p-1 rounded hover:bg-red-50 text-error" aria-label="Delete">delete</button></div>
    <p class="text-xs text-on-surface-variant mb-3">/${esc(m.slug)} · ${esc(m.blurb || '')}</p>
    ${subsOf(m.slug).map(s => `<div class="flex items-center text-sm py-1.5 border-t border-outline-variant/30"><span class="flex-1">${esc(s.name)} <span class="text-xs text-on-surface-variant">/${esc(s.slug)}</span>${pend(s.slug)}</span>
      <button data-cedit="${esc(s.slug)}" class="material-symbols-outlined !text-base p-1 rounded hover:bg-surface-container" aria-label="Edit">edit</button><button data-cdel="${esc(s.slug)}" class="material-symbols-outlined !text-base p-1 rounded hover:bg-red-50 text-error" aria-label="Delete">delete</button></div>`).join('')}
    ${newReqs.filter(r => r.payload.parent_slug === m.slug).map(r => `<div class="text-sm py-1.5 border-t border-outline-variant/30 text-on-surface-variant italic">${esc(r.payload.name)} <span class="text-[10px] not-italic font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">awaiting approval</span></div>`).join('')}
    <button data-cadd="${esc(m.slug)}" class="mt-3 text-sm text-primary font-semibold flex items-center gap-1"><span class="material-symbols-outlined !text-base">add</span>Add subcategory</button></div>`).join('')
    + newReqs.filter(r => !r.payload.parent_slug).map(r => `<div class="rounded-xl border-2 border-dashed border-outline-variant p-5 text-on-surface-variant"><p class="font-semibold">${esc(r.payload.name)}</p><p class="text-xs">New main category — awaiting approval</p></div>`).join('');
}
function openCat(c, parent) {
  const f = $('#cform'); f.reset(); $('#ctitle').textContent = c ? 'Edit category' : 'Add category';
  f.orig.value = c?.slug || ''; ['name', 'slug', 'icon', 'blurb', 'sort'].forEach(k => f[k].value = c?.[k] ?? (k === 'sort' ? 0 : '')); f.parent_slug.value = c ? (c.parent_slug || '') : (parent || '');
  $('#mainOnly').classList.toggle('hidden', !!f.parent_slug.value); $('#cmodal').classList.remove('hidden'); f.name.focus();
}
$('#cform').parent_slug.onchange = e => $('#mainOnly').classList.toggle('hidden', !!e.target.value);
$('#cform').name.oninput = e => { const f = $('#cform'); if (!f.orig.value) f.slug.value = e.target.value.toLowerCase().replace(/^for\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
$('#newCat').onclick = () => openCat();
$('#catList').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.cadd) return openCat(null, b.dataset.cadd);
  if (b.dataset.cedit) return openCat(cats.find(c => c.slug === b.dataset.cedit));
  if (b.dataset.cdel) {
    const s = b.dataset.cdel, n = videos.filter(v => v.category === s || v.subcategory === s).length;
    if (n) return toast(`Can't delete: ${n} video(s) use this category. Move them first.`, 1);
    if (pendReqFor('category', s)) return toast('A change for this category is already pending', 1);
    if (!confirm('Delete this category' + (subsOf(s).length ? ' and its subcategories' : '') + '?' + (isSuper() ? '' : ' (needs approval)'))) return;
    if (!isSuper()) return request('category', 'delete', s, {}, `Delete category “${cname(s)}”`);
    const { error } = await sb.from('categories').delete().eq('slug', s); if (error) return toast(error.message, 1); toast('Deleted'); loadAll();
  }
};
$('#cform').onsubmit = async e => {
  e.preventDefault(); const f = e.target;
  const row = { name: f.name.value.trim(), slug: f.slug.value.trim(), parent_slug: f.parent_slug.value || null, icon: f.icon.value.trim() || null, blurb: f.blurb.value.trim() || null, sort: +f.sort.value || 0 };
  if (row.parent_slug === row.slug) return toast('A category cannot be its own parent', 1);
  if (!isSuper()) {
    const ok = await request('category', f.orig.value ? 'update' : 'insert', f.orig.value || row.slug, row, `${f.orig.value ? 'Edit' : 'New'} category “${row.name}”`);
    if (ok) $('#cmodal').classList.add('hidden'); return;
  }
  const { error } = f.orig.value ? await sb.from('categories').update(row).eq('slug', f.orig.value) : await sb.from('categories').insert(row);
  if (error) return toast(error.message, 1);
  if (f.orig.value && f.orig.value !== row.slug) { await sb.from('videos').update({ category: row.slug }).eq('category', f.orig.value); await sb.from('videos').update({ subcategory: row.slug }).eq('subcategory', f.orig.value); }
  toast('Saved'); $('#cmodal').classList.add('hidden'); loadAll();
};

// ---------------- TEAM (superadmin) ----------------
function renderTeam() {
  if (!isSuper()) return;
  $('#teamRows').innerHTML = team.map(t => `<tr class="border-b border-outline-variant/30 last:border-0"><td class="p-3">${esc(t.email || t.user_id)}${t.user_id === me.id ? ' <span class="text-xs text-on-surface-variant">(you)</span>' : ''}</td>
    <td class="p-3"><select data-role="${t.user_id}" ${t.user_id === me.id ? 'disabled' : ''} class="rounded-lg border-outline-variant text-sm py-1.5"><option value="admin" ${t.role === 'admin' ? 'selected' : ''}>Admin</option><option value="superadmin" ${t.role === 'superadmin' ? 'selected' : ''}>Superadmin</option></select></td>
    <td class="p-3 text-right">${t.user_id === me.id ? '' : `<button data-rm="${t.user_id}" class="text-sm text-error font-medium">Remove</button>`}</td></tr>`).join('');
}
$('#teamRows').onchange = async e => { const id = e.target.dataset.role; if (!id) return; const { error } = await sb.from('admins').update({ role: e.target.value }).eq('user_id', id); if (error) return toast(error.message, 1); toast('Role updated'); loadAll(); };
$('#teamRows').onclick = async e => { const id = e.target.dataset.rm; if (!id || !confirm('Remove admin access for this user?')) return; const { error } = await sb.from('admins').delete().eq('user_id', id); if (error) return toast(error.message, 1); toast('Removed'); loadAll(); };
$('#addAdmin').onsubmit = async e => { e.preventDefault(); const f = e.target; const { data, error } = await sb.rpc('add_admin', { p_email: f.email.value.trim(), p_role: f.role.value }); if (error) return toast(error.message, 1);
  toast(data === 'invited' ? 'Saved. Now send the invite from Supabase → Authentication → Users → Invite user' : 'Admin added'); f.reset(); loadAll(); };
function renderInvites() { const el = $('#inviteRows'); if (!el) return;
  el.innerHTML = invites.map(i => `<div class="bg-white rounded-xl border border-outline-variant/40 p-3 flex items-center gap-3 text-sm"><span class="material-symbols-outlined text-primary">mail</span><span class="flex-1">${esc(i.email)} <span class="text-xs text-on-surface-variant">· ${esc(i.role)}</span></span><button data-uninv="${esc(i.email)}" class="text-error font-medium">Cancel</button></div>`).join('') || '<p class="text-sm text-on-surface-variant">No pending invites.</p>'; }
$('#inviteRows').onclick = async e => { const em = e.target.dataset.uninv; if (!em) return; const { error } = await sb.from('admin_invites').delete().eq('email', em); if (error) return toast(error.message, 1); loadAll(); };

boot();
