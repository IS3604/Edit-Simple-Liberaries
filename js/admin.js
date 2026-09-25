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

let topLevel = false, myTitle = null, status = [], me = null, role = null, cats = [], videos = [], reqs = [], team = [], invites = [];
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
const forgotTick = esReset.bind($('#forgotBtn'));
$('#forgotBtn').onclick = async () => {
  const err = $('#loginErr'); err.textContent = ''; err.classList.replace('text-green-700', 'text-error');
  const r = await esReset.send(e => sb.auth.resetPasswordForEmail(e, { redirectTo: ADMIN_URL }), $('#loginForm').email.value);
  err.textContent = r.msg; if (r.ok) err.classList.replace('text-error', 'text-green-700'); forgotTick();
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
  role = lvl(r); topLevel = !!(await sb.rpc('can_manage_all')).data; myTitle = (await sb.rpc('my_title')).data || null;
  $('#meEmail').textContent = me.email;
  $('#meRole').textContent = myTitle || role; $('#meRole').className += isSuper() ? ' bg-primary text-on-primary' : ' bg-surface-container text-on-surface-variant';
  buildTabs(); show('app');
  paintSkeletons(); tab(location.hash.slice(1));
  await loadAll(); live(); setTimeout(backfillHashes, 1500);
}
// ---------------- LIVE UPDATES ----------------
let liveCh = null, liveT = null;
const refresh = () => { clearTimeout(liveT); liveT = setTimeout(loadAll, 400); };
function live() {
  if (liveCh) return;
  liveCh = sb.channel('admin-live');
  ['videos', 'categories', 'change_requests', 'admins', 'admin_invites'].forEach(t => liveCh.on('postgres_changes', { event: '*', schema: 'public', table: t }, refresh));
  liveCh.subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);   // safety net
}
$('#pwEye').onclick = e => { const i = $('#loginForm').password; i.type = i.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = i.type === 'password' ? 'visibility' : 'visibility_off'; };
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); const f = e.target, b = $('#loginBtn'), card = f, err = $('#loginErr'); err.textContent = ''; err.classList.replace('text-green-700', 'text-error');
  if (esLock.left() > 0) { err.textContent = `Too many attempts. Try again in ${esLock.left()}s.`; return; }
  const fail = m => { err.textContent = m; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };
  b.disabled = true; b.querySelector('.lbl').classList.add('invisible'); b.querySelector('.spin').classList.remove('hidden');
  let msg = null;
  try {
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) msg = esLock.fail(error.message);
    else { const { data: r } = await sb.rpc('my_role'); if (!r) { await sb.auth.signOut(); msg = 'This account has no admin access. Ask a superadmin to add you.'; } else esLock.reset(); }
  } catch { msg = 'Could not reach the server. Check your connection and try again.'; }
  b.disabled = false; b.querySelector('.lbl').classList.remove('invisible'); b.querySelector('.spin').classList.add('hidden');
  if (msg) return fail(msg);
  card.classList.add('hidden'); $('#loginOk').classList.remove('hidden');
  setTimeout(() => { show('boot'); boot(true).then(() => { card.classList.remove('hidden'); $('#loginOk').classList.add('hidden'); f.reset(); }); }, 1100);
};

const logout = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
$('#logout').onclick = logout; $('#logoutM').onclick = logout;

// ---------------- TABS ----------------
function buildTabs() {
  const t = isSuper()
    ? [['dash', 'dashboard', 'Dashboard'], ['videos', 'movie', 'Videos'], ['cats', 'category', 'Categories'], ['team', 'group', 'Team']]
    : [['videos', 'movie', 'Videos'], ['requests', 'pending_actions', 'My requests'], ['guide', 'menu_book', 'Upload guide']];
  $('#tabs').innerHTML = t.map(([k, i, l]) => `<button data-tab="${k}" class="tab flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"><span class="material-symbols-outlined">${i}</span><span class="hidden sm:inline">${l}</span><span data-badge="${k}" class="hidden ml-auto text-[11px] font-bold bg-error text-white rounded-full px-1.5 min-w-[20px] text-center"></span></button>`).join('');
  $$('.tab').forEach(b => b.onclick = () => tab(b.dataset.tab));
}
function tab(t) {
  let [name, filter] = String(t || '').split(':'); t = name;
  if (!$('#t-' + t) || !$(`.tab[data-tab="${t}"]`)) t = $('.tab')?.dataset.tab || 'videos'; history.replaceState(null, '', '#' + t);
  if (t === 'videos' && filter !== undefined) { $('#vstat').value = filter; renderVideos(); }
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 't-' + t));
  $$('.tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('bg-primary', on); b.classList.toggle('text-on-primary', on); b.classList.toggle('hover:bg-surface-container', !on); });
}
function badge(k, n) { const b = $(`[data-badge="${k}"]`); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); }

function paintSkeletons() {
  $('#stats').innerHTML = skCards(4); $('#bySub').innerHTML = skCards(3, 40);
  $('#vrows').innerHTML = skRows(5, 5); $('#catList').innerHTML = skCards(3, 64);
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
  const myNew = (a.data || []).find(t => t.user_id === me.id)?.role; if (a.data && lvl(myNew) !== role) { location.reload(); return; }
  cats = c.data || []; videos = await signVideos(v.data || []); reqs = r.data || []; team = a.data || []; invites = inv?.data || [];
  status = topLevel ? ((await sb.rpc('team_status')).data || []) : [];
  renderDash(); renderVideos(); renderCats(); fillCatSelects(); renderReview(); renderGuide(); renderMyReq(); renderTeam(); if (isSuper()) renderInvites();
}
// roles above 'admin' are all shown as superadmin
const lvl = r => r === 'admin' ? 'admin' : r ? 'superadmin' : null;
// Private bucket → short-lived signed links for thumbnails / players
const signCache = new Map();
async function signVideos(list) {
  const now = Date.now(), need = [...new Set(list.flatMap(v => [storagePath(v.video_url), storagePath(v.thumbnail_url)]).filter(p => p && !(signCache.get(p)?.exp > now)))];
  for (let i = 0; i < need.length; i += 500) { const { data } = await sb.storage.from('videos').createSignedUrls(need.slice(i, i + 500), 3600); (data || []).forEach(d => d.signedUrl && signCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60e3 })); }
  return list.map(v => ({ ...v, video_url: signCache.get(storagePath(v.video_url))?.url || v.video_url, thumbnail_url: signCache.get(storagePath(v.thumbnail_url))?.url || v.thumbnail_url }));
}
const mains = () => cats.filter(c => !c.parent_slug);
const subsOf = m => cats.filter(c => c.parent_slug === m);
const cname = s => cats.find(c => c.slug === s)?.name || s;
const who = id => team.find(t => t.user_id === id)?.email || (id === me.id ? me.email : 'Superadmin');
const isLive = v => v.status === 'approved' && v.published;
const pendReqFor = (entity, target) => reqs.find(r => r.status === 'pending' && r.entity === entity && r.target === target);

// ---------------- DASHBOARD ----------------
function renderDash() {
  const live = videos.filter(isLive).length, pend = videos.filter(v => v.status === 'pending').length, preq = reqs.filter(r => r.status === 'pending').length;
  const stat = (i, n, l, tabk) => `<button ${tabk ? `data-go="${tabk}"` : ''} class="text-left bg-white rounded-xl border border-outline-variant/40 p-5 hover:border-primary/50 transition"><span class="material-symbols-outlined text-primary">${i}</span><p class="text-3xl font-bold mt-2">${n}</p><p class="text-sm text-on-surface-variant">${l}</p></button>`;
  const mine = videos.filter(v => v.submitted_by === me.id);
  $('#stats').innerHTML = isSuper()
    ? stat('movie', videos.length, 'Total videos', 'videos:') + stat('public', live, 'Live on website', 'videos:live') + stat('hourglass_top', pend, 'Waiting for approval', 'videos:pending') + stat('content_copy', videos.filter(v => dupSet().has(v.file_hash)).length, 'Duplicate videos', 'videos:dup')
    : stat('upload', mine.length, 'My uploads', 'requests') + stat('hourglass_top', mine.filter(v => v.status === 'pending').length, 'Waiting for review', 'requests') + stat('public', mine.filter(isLive).length, 'Approved & live', 'requests') + stat('block', mine.filter(v => v.status === 'rejected').length, 'Rejected', 'requests');
  $$('[data-go]').forEach(b => b.onclick = () => tab(b.dataset.go));
  $('#dashNote').innerHTML = isSuper()
    ? (pend ? `<div class="rounded-xl bg-primary-fixed text-on-primary-fixed p-4 flex items-center gap-3"><span class="material-symbols-outlined">notifications_active</span><p class="flex-1 text-sm"><b>${pend}</b> video(s) waiting for your approval.</p><button data-go2 class="text-sm font-semibold underline">Show them</button></div>` : '')
    : `<div class="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant flex gap-3"><span class="material-symbols-outlined text-primary">info</span>You're an <b>&nbsp;admin&nbsp;</b>: upload videos with “Add video” — they go live only after a superadmin approves them.</div>`;
  $('[data-go2]')?.addEventListener('click', () => tab('videos:pending'));
  $('#bySub').innerHTML = mains().map(m => `<div class="bg-white rounded-xl border border-outline-variant/40 p-5"><p class="font-semibold mb-3">${esc(m.name)} <span class="text-on-surface-variant font-normal">(${videos.filter(v => isLive(v) && v.category === m.slug).length})</span></p>
    ${subsOf(m.slug).map(s => { const n = videos.filter(v => isLive(v) && v.subcategory === s.slug).length; return `<div class="flex justify-between text-sm py-1"><span>${esc(s.name)}</span><span class="${n ? '' : 'text-error font-medium'}">${n}</span></div>`; }).join('')}</div>`).join('') || '<p class="text-on-surface-variant">No categories yet.</p>';
  badge(isSuper() ? 'videos' : 'requests', isSuper() ? pend : videos.filter(v => v.submitted_by === me.id && v.status === 'pending').length);
}

// ---------------- VIDEOS ----------------
function statusChip(v) {
  const pr = pendReqFor('video', v.id);
  const map = { approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Hidden', 'bg-surface-container text-on-surface-variant'], pending: ['Pending review', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'] };
  const [l, c] = map[v.status] || map.pending;
  return `<span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${c}">${l}</span>${pr ? `<span class="block mt-1 text-[11px] text-amber-700">Change ${pr.action} pending</span>` : ''}${v.status === 'rejected' && v.review_note ? `<span class="block mt-1 text-[11px] text-red-700 max-w-[160px]">“${esc(v.review_note)}”</span>` : ''}`;
}
function canDirect(v) { return isSuper(); }
const dupSet = () => { const n = {}; videos.forEach(v => v.file_hash && (n[v.file_hash] = (n[v.file_hash] || 0) + 1)); return new Set(Object.keys(n).filter(h => n[h] > 1)); };
function renderVideos() {
  const q = $('#vq').value.toLowerCase().trim(), c = $('#vcat').value, s = $('#vstat').value, dups = dupSet();
  const list = videos.filter(v => (!q || (v.search_text || (v.title + ' ' + (v.tags || []).join(' '))).toLowerCase().includes(q)) && (!c || v.category === c || v.subcategory === c) &&
    (!s || (s === 'live' && isLive(v)) || (s === 'hidden' && v.status === 'approved' && !v.published) || s === v.status || (s === 'mine' && v.submitted_by === me.id) || (s === 'dup' && dups.has(v.file_hash))));
  $('#vempty').classList.toggle('hidden', list.length > 0);
  $('#vrows').innerHTML = list.map(v => `<tr class="border-b border-outline-variant/30 last:border-0 align-top">
    <td class="p-3"><div class="flex items-center gap-3"><button data-play="${v.id}" class="relative w-24 aspect-video rounded-md bg-surface-container overflow-hidden shrink-0" aria-label="Preview">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" loading="lazy" class="w-full h-full object-cover" alt="">` : ''}<span class="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-white drop-shadow !text-xl">play_circle</span></button>
      <div class="min-w-0"><p class="font-medium truncate max-w-[240px]">${esc(v.title)}</p>${dups.has(v.file_hash) ? '<span class="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded mt-0.5"><span class="material-symbols-outlined !text-xs">content_copy</span>Duplicate</span>' : ''}<p class="text-xs text-on-surface-variant">by ${esc(who(v.submitted_by))} · ${new Date(v.created_at).toLocaleDateString()}</p></div></div></td>
    <td class="p-3 whitespace-nowrap">${esc(cname(v.category))}<br><span class="text-xs text-on-surface-variant">${esc(cname(v.subcategory))}</span></td>
    <td class="p-3 whitespace-nowrap text-xs">${esc(v.resolution)} · ${v.fps}fps<br>${dur(v.duration_seconds)} · ${esc(v.orientation)}</td>
    <td class="p-3">${statusChip(v)}</td>
    ${isSuper() ? `<td class="p-3 text-right whitespace-nowrap">
      ${v.status === 'pending' ? `<button data-approve="${v.id}" title="Approve" class="material-symbols-outlined p-1.5 rounded hover:bg-green-50 text-green-700">check_circle</button><button data-reject="${v.id}" title="Reject" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">cancel</button>` : ''}
      ${v.status === 'approved' ? `<button data-pub="${v.id}" title="${v.published ? 'Hide from site' : 'Show on site'}" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">${v.published ? 'visibility_off' : 'visibility'}</button>` : ''}
      <button data-edit="${v.id}" title="Edit" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">edit</button>
      <button data-del="${v.id}" title="Delete" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">delete</button>
</td>` : ''}</tr>`).join('');
  $('#vActTh').classList.toggle('hidden', !isSuper());
}
['#vq', '#vcat', '#vstat'].forEach(s => $(s).addEventListener('input', renderVideos));
$('#vrows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset; const v = videos.find(x => x.id === (d.edit || d.del || d.pub || d.approve || d.reject || d.play));
  if (d.play) return preview(v);
  if (!isSuper()) return;
  if (d.edit) return openVideo(v);
  if (d.approve) return reviewVideo(v, true);
  if (d.reject) return reviewVideo(v, false);
  if (d.pub) { const { error } = await sb.from('videos').update({ published: !v.published }).eq('id', v.id); if (error) return toast(error.message, 1); toast(v.published ? 'Hidden from website' : 'Now visible on website'); return loadAll(); }
  if (d.del) {
    if (!confirm(`Delete "${v.title}"? This also removes its uploaded files.`)) return;
    const paths = [v.video_url, v.thumbnail_url].map(storagePath).filter(Boolean); if (paths.length) await sb.storage.from('videos').remove(paths);
    const { error } = await sb.from('videos').delete().eq('id', v.id); if (error) return toast(error.message, 1); toast('Deleted'); return loadAll();
  }
};
function preview(v) { if (!v?.video_url) return toast('No video file', 1); $('#pvid').src = v.video_url; $('#pmodal').classList.remove('hidden'); $('#pvid').play().catch(() => { }); }
$('#pmodal').addEventListener('click', e => { if (e.target.id === 'pmodal' || e.target.closest('[data-close]')) { $('#pvid').pause(); $('#pvid').removeAttribute('src'); $('#pmodal').classList.add('hidden'); } });
function storagePath(url) { const m = String(url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/videos\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; }

async function request(entity, action, target, payload, summary) {
  const { error } = await sb.from('change_requests').insert({ entity, action, target, payload, summary, requested_by: me.id, requested_email: me.email });
  if (error) { toast(error.message, 1); return false; }
  toast('Sent to superadmin for approval'); loadAll(); return true;
}

// ---- Reject dialog (returns note or null) ----
const REASONS = ['Poor video quality', 'Wrong category', 'Title / tags need work', 'Duplicate video', 'Copyright concern', 'Not relevant for lawyers/doctors'];
function askReject(what) {
  return new Promise(res => {
    const m = $('#rjmodal'), f = $('#rjform'); f.reset(); $('#rjwhat').textContent = what;
    $('#rjchips').innerHTML = REASONS.map(r => `<button type="button" class="text-xs px-3 py-1.5 rounded-full border border-outline-variant hover:border-red-400 hover:text-red-700">${r}</button>`).join('');
    $('#rjchips').onclick = e => { const b = e.target.closest('button'); if (!b) return; const t = f.note.value.trim(); f.note.value = t ? t + (t.endsWith('.') ? ' ' : '. ') + b.textContent + '.' : b.textContent + '.'; f.note.focus(); };
    const close = v => { m.classList.add('hidden'); f.onsubmit = null; m.onclick = null; document.removeEventListener('keydown', esc_); res(v); };
    const esc_ = e => { if (e.key === 'Escape') close(null); };
    f.onsubmit = e => { e.preventDefault(); const n = f.note.value.trim(); if (n) close(n); };
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(null); };
    document.addEventListener('keydown', esc_);
    m.classList.remove('hidden'); setTimeout(() => f.note.focus(), 50);
  });
}
async function reviewVideo(v, ok) {
  let note = null; if (!ok) { note = await askReject(v.title); if (note === null) return; }
  const { error } = await sb.from('videos').update({ status: ok ? 'approved' : 'rejected', published: ok ? true : v.published, reviewed_by: me.id, review_note: note }).eq('id', v.id);
  if (error) return toast(error.message, 1); toast(ok ? 'Approved — now live' : 'Rejected'); loadAll();
}

function fillCatSelects() {
  const opts = mains().map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  const cur = $('#vcat').value;
  $('#vcat').innerHTML = '<option value="">All categories</option>' + mains().map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>` + subsOf(m.slug).map(s => `<option value="${esc(s.slug)}">&nbsp;&nbsp;↳ ${esc(s.name)}</option>`).join('')).join('');
  $('#vcat').value = cur;
  if ($('#vmodal').classList.contains('hidden')) $('#vform').category.innerHTML = '<option value="">Select category</option>' + opts;
  $('#cform').parent_slug.innerHTML = '<option value="">— None (main category) —</option>' + opts;
}
function fillSubs(sel) { const f = $('#vform'), c = f.category.value; f.subcategory.disabled = !c;
  f.subcategory.innerHTML = `<option value="">${c ? 'Select subcategory' : 'Select category first'}</option>` + subsOf(c).map(s => `<option value="${esc(s.slug)}">${esc(s.name)}</option>`).join(''); f.subcategory.value = sel || ''; }
$('#vform').category.onchange = () => { fillSubs(); updateBothHint(); };

let aiFrame = null, aiSeq = 0, lastAi = null, editing = null, thumbBlob = null, submitMode = 'submit', fileHash = null, dupState = 'ok', hashing = null, newBlobUrl = null;
// ---- AI suggestions (description + tags) via the ai-describe server function (Groq) ----
async function aiSuggest(force) {
  const f = $('#vform'), stat = $('#aiStat'), btn = $('#aiBtn');
  const untouched = lastAi && f.description.value === lastAi.d && f.tags.value === lastAi.t;   // still exactly what AI wrote
  if (!force && !untouched && (f.description.value.trim() || f.tags.value.trim())) return;       // never overwrite what the user typed
  const title = f.title.value.trim(); if (!title && !aiFrame) { stat.textContent = 'Add a title or a video first'; return; }
  const my = ++aiSeq; btn.disabled = true; stat.innerHTML = '<span class="inline-block w-3 h-3 mr-1 align-[-1px] rounded-full border-2 border-primary/30 border-t-primary animate-spin"></span>Writing description & tags…';
  const sel = x => x.value ? x.options[x.selectedIndex]?.text : '';
  let res; try { res = await sb.functions.invoke('ai-describe', { body: { title, category: sel(f.category), subcategory: sel(f.subcategory), image: aiFrame || '' } }); } catch (e) { res = { error: e }; }
  if (my !== aiSeq) return; btn.disabled = false;
  const d = res?.data; if (res?.error || !d || d.error) { stat.textContent = 'AI suggestions unavailable right now'; return; }
  const ow = force || (lastAi && f.description.value === lastAi.d && f.tags.value === lastAi.t);
  if (ow || !f.description.value.trim()) f.description.value = d.description || f.description.value;
  if (ow || !f.tags.value.trim()) f.tags.value = (d.tags || []).join(', ');
  lastAi = { d: f.description.value, t: f.tags.value };
  stat.textContent = '✓ Suggested — edit if needed'; [f.description, f.tags].forEach(el => { el.classList.add('ring-2', 'ring-primary/40'); setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 1500); });
}
$('#aiBtn').onclick = () => aiSuggest(true);
// ---- File box: empty state ↔ chosen file ----
function showPicked(src, name, meta) {
  const vid = $('#vprev'); vid.pause(); if (src) vid.src = src; else vid.removeAttribute('src');
  $('#vpick').classList.toggle('hidden', !!src); $('#vchosen').classList.toggle('hidden', !src);
  $('#vname').textContent = name || ''; $('#vmeta').textContent = meta || '';
}
$('#vdrop').addEventListener('click', e => { if (e.target.closest('video') || e.target.closest('#vchosen') && !e.target.closest('#vchange')) return; $('#vform').vfile.click(); });
$('#vchange').onclick = e => { e.stopPropagation(); $('#vform').vfile.click(); };
// ---- Duplicate warning (same file already uploaded) ----
const catLabel = v => `${cname(v.category)} › ${cname(v.subcategory)}`;
const stLabel = v => ({ pending: ['Pending', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'], approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Hidden', 'bg-surface-container text-on-surface-variant'] }[v.status] || ['', '']);
async function checkDuplicate(h) {
  const { data } = await sb.from('videos').select('id,title,category,subcategory,status,published,thumbnail_url,video_url,created_at,submitted_by').eq('file_hash', h);
  const hits = (data || []).filter(v => v.id !== editing?.id);
  if (!hits.length) { dupState = 'ok'; return; }
  const list = (await signVideos(hits)).sort((a, b) => a.created_at.localeCompare(b.created_at)); dupState = 'ask';
  const items = [{ id: '__new', title: 'Your new file', video_url: newBlobUrl, isNew: true }, ...list.map((v, i) => ({ ...v, tag: i ? 'Duplicate' : 'Original' }))];
  const play = it => { const dv = $('#dupvid'); dv.src = it.video_url || ''; dv.play().catch(() => { }); $('#duptitle').textContent = it.isNew ? 'Previewing: your new file' : `Previewing: ${it.title}`;
    $$('#duplist [data-dup]').forEach(b => { const on = b.dataset.dup === it.id; b.classList.toggle('border-primary', on); b.classList.toggle('bg-primary-fixed/40', on); }); };
  $('#duplist').innerHTML = items.map(v => { const [l, c] = v.isNew ? ['New', 'bg-primary text-on-primary'] : stLabel(v); return `<button type="button" data-dup="${v.id}" class="w-full text-left flex items-center gap-3 p-2 rounded-xl border border-outline-variant/50 hover:border-primary/60 transition">
    <div class="w-20 aspect-video rounded-lg bg-surface-container overflow-hidden shrink-0 grid place-items-center">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : '<span class="material-symbols-outlined text-on-surface-variant">play_circle</span>'}</div>
    <div class="flex-1 min-w-0"><p class="text-sm font-semibold truncate">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${v.isNew ? 'Not saved yet' : `${esc(catLabel(v))} · ${new Date(v.created_at).toLocaleDateString()}`}</p></div>
    ${v.tag ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${v.tag === 'Original' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}">${v.tag}</span>` : ''}<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${c}">${l}</span></button>`; }).join('');
  $$('#duplist [data-dup]').forEach(b => b.onclick = () => play(items.find(x => x.id === b.dataset.dup)));
  play(items[1] || items[0]);
  $('#dupmodal').classList.remove('hidden');
}
function clearFile() { const f = $('#vform'); f.vfile.value = ''; aiFrame = null; fileHash = null; dupState = 'ok'; thumbBlob = null; hashing = null; ['duration_seconds', 'resolution', 'fps', 'orientation'].forEach(k => f[k].value = editing?.[k] ?? '');
  if (editing?.video_url) showPicked(editing.video_url, 'Current video', `${editing.resolution} · ${dur(editing.duration_seconds)}`); else showPicked(null); updateBothHint(); }
const closeDup = () => { const dv = $('#dupvid'); dv.pause(); dv.removeAttribute('src'); $('#dupmodal').classList.add('hidden'); };
$('#dupCancel').onclick = () => { closeDup(); clearFile(); };
$('#dupGo').onclick = () => { closeDup(); dupState = 'ok'; toast('OK — it will be saved as a new variant'); updateBothHint(); };
// Drag & drop onto the file box
(() => { const z = $('#vdrop'), inp = $('#vform').vfile, on = x => { z.classList.toggle('border-primary', x); z.classList.toggle('bg-primary-fixed/40', x); };
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); on(true); }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); on(false); }));
  z.addEventListener('drop', e => { const file = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('video/')); if (!file) return toast('Please drop a video file', 1);
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }); })();
// ---- "For Both" rule: the same video must already be in For Lawyers AND For Doctors ----
function bothAllowed(h, exceptId) { if (!h) return false; const ok = c => videos.some(v => v.file_hash === h && v.category === c && v.status !== 'rejected' && v.id !== exceptId); return ok('lawyers') && ok('doctors'); }
function updateBothHint() { const f = $('#vform'), el = $('#bothHint'); if (f.category.value !== 'both') return el.classList.add('hidden');
  const h = fileHash || (!f.vfile.files[0] && editing?.file_hash);
  el.className = 'sm:col-span-2 -mt-2 text-xs rounded-lg px-3 py-2 border ' + (h && bothAllowed(h, editing?.id) ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200');
  el.textContent = h && bothAllowed(h, editing?.id) ? '✓ This video is already in For Lawyers and For Doctors — it can be added to For Both.' : 'For Both is only allowed when this same video is already in For Lawyers and For Doctors.'; }
// Fingerprint of the file (size + SHA-256 of first/last 4 MB) to detect re-uploads of the same video
async function fingerprint(file) {
  const MB = 4 * 1024 * 1024, parts = file.size <= 2 * MB ? [file] : [file.slice(0, MB), file.slice(file.size - MB)];
  const buf = await new Blob([String(file.size), ...parts]).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Same fingerprint for an already-uploaded file (HTTP Range requests, no full download)
async function remoteFingerprint(url) {
  const MB = 4 * 1024 * 1024;
  const r0 = await fetch(url, { headers: { Range: 'bytes=0-0' } }); const size = +(r0.headers.get('content-range') || '').split('/')[1];
  if (!size) throw new Error('no size');
  const get = async (a, b) => new Uint8Array(await (await fetch(url, { headers: { Range: `bytes=${a}-${b}` } })).arrayBuffer());
  const parts = size <= 2 * MB ? [await get(0, size - 1)] : [await get(0, MB - 1), await get(size - MB, size - 1)];
  const buf = await new Blob([String(size), ...parts]).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Superadmin: fingerprint older videos (uploaded before duplicate detection) in the background
let backfilling = false;
async function backfillHashes() {
  if (!isSuper() || backfilling) return; backfilling = true;
  const todo = videos.filter(v => !v.file_hash && storagePath(v.video_url)).slice(0, 25); let n = 0;
  for (const v of todo) { try { const h = await remoteFingerprint(v.video_url); const { error } = await sb.from('videos').update({ file_hash: h }).eq('id', v.id); if (!error) n++; } catch { } }
  backfilling = false; if (n) { toast(`Checked ${n} older video(s) for duplicates`); loadAll(); }
}
const BTN = (mode, label, cls) => `<button ${mode ? `data-mode="${mode}"` : 'type="button" data-close'} class="px-4 py-2.5 rounded-lg ${cls}">${label}</button>`;
function openVideo(v) {
  if (v && !isSuper()) return;
  editing = v || null; thumbBlob = null; aiFrame = null; lastAi = null; aiSeq++; $('#aiStat').textContent = ''; fileHash = null; dupState = 'ok'; hashing = null; const f = $('#vform'); f.reset(); $('#vtitle').textContent = v ? 'Edit video' : 'Add video';
  showPicked(null); $('#progress').classList.add('hidden'); f.category.value = '';
  const n = $('#vnote'); n.classList.toggle('hidden', isSuper()); n.textContent = 'Your video will be sent to a superadmin for review. It appears on the website only after approval.';
  $('#vbtns').innerHTML = isSuper()
    ? BTN(null, 'Cancel', 'border border-outline-variant') + BTN('draft', 'Save draft', 'border border-primary text-primary font-semibold') + BTN('approve', 'Approve', 'bg-primary text-on-primary font-semibold')
    : BTN(null, 'Cancel', 'border border-outline-variant') + BTN('submit', 'Save', 'bg-primary text-on-primary font-semibold');
  $$('#vbtns [data-close]').forEach(b => b.onclick = () => $('#vmodal').classList.add('hidden'));
  $$('#vbtns [data-mode]').forEach(b => b.onclick = () => submitMode = b.dataset.mode);
  if (v) {
    ['title', 'description', 'duration_seconds', 'resolution', 'fps', 'orientation'].forEach(k => f[k].value = v[k] ?? '');
    f.category.value = v.category; f.tags.value = (v.tags || []).join(', ');
    if (v.video_url) showPicked(v.video_url, 'Current video', `${v.resolution} · ${dur(v.duration_seconds)}`);
  }
  fillSubs(v?.subcategory); updateBothHint(); $('#vmodal').classList.remove('hidden'); f.title.focus();
}
$('#newVideo').onclick = () => openVideo();
$$('#vmodal [data-close], #cmodal [data-close]').forEach(b => b.onclick = () => b.closest('.fixed').classList.add('hidden'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['#vmodal', '#cmodal'].forEach(s => $(s).classList.add('hidden')); });

// Estimate frame rate by sampling decoded frames (Chrome/Edge/Safari); falls back to 30
function detectFps(vid) {
  return new Promise(res => {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return res(30);
    const t = []; let done = false; const finish = () => {
      if (done) return; done = true; vid.pause();
      const d = []; for (let i = 1; i < t.length; i++) { const x = t[i] - t[i - 1]; if (x > 0.001 && x < 0.2) d.push(x); }
      if (d.length < 5) return res(30); d.sort((a, b) => a - b); const raw = 1 / d[Math.floor(d.length / 2)];
      res([24, 25, 30, 48, 50, 60, 120].reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
    };
    const cb = (_, m) => { t.push(m.mediaTime); if (t.length > 40) finish(); else vid.requestVideoFrameCallback(cb); };
    vid.requestVideoFrameCallback(cb); vid.muted = true; vid.playbackRate = 1; vid.play().catch(() => res(30)); setTimeout(finish, 2500);
  });
}
$('#vform').vfile.onchange = e => {
  const file = e.target.files[0]; if (!file) return; const f = $('#vform'), vid = $('#vprev');
  if (file.size > 50 * 1024 * 1024) toast('Warning: file is over 50 MB — Supabase free plan may reject it', 1);
  newBlobUrl = URL.createObjectURL(file); showPicked(newBlobUrl, file.name, 'Analysing…');
  fileHash = null; dupState = 'checking'; hashing = fingerprint(file).then(async h => { fileHash = h; await checkDuplicate(h); updateBothHint(); }).catch(() => { dupState = 'ok'; });
  if (!f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  vid.onloadedmetadata = async () => {
    f.duration_seconds.value = Math.round(vid.duration); const w = vid.videoWidth, h = vid.videoHeight, big = Math.max(w, h);
    f.resolution.value = big >= 3000 ? '4K' : big >= 1800 ? '1080p' : '720p'; f.orientation.value = w > h ? 'horizontal' : w < h ? 'vertical' : 'square';
    f.fps.value = await detectFps(vid);
    vid.onseeked = () => {
      const cv = document.createElement('canvas'); const sc = Math.min(1, 1280 / vid.videoWidth); cv.width = vid.videoWidth * sc; cv.height = vid.videoHeight * sc;
      cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height); cv.toBlob(b => { thumbBlob = b; }, 'image/jpeg', 0.82); vid.onseeked = null;
      const ac = document.createElement('canvas'), as = Math.min(1, 768 / vid.videoWidth); ac.width = vid.videoWidth * as; ac.height = vid.videoHeight * as;
      ac.getContext('2d').drawImage(vid, 0, 0, ac.width, ac.height); aiFrame = ac.toDataURL('image/jpeg', 0.7); aiSuggest(false);
    };
    vid.currentTime = Math.min(1, vid.duration / 3);
    $('#vmeta').textContent = `${f.resolution.value} · ${dur(+f.duration_seconds.value)}`;
  };
};

async function upload(fileOrBlob, name, label) {
  $('#ptext').textContent = 'Uploading ' + label + '…';
  const path = `${me.id.slice(0, 8)}/${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const { error } = await sb.storage.from('videos').upload(path, fileOrBlob, { upsert: false, contentType: fileOrBlob.type || undefined, cacheControl: '31536000' });
  if (error) throw new Error(label + ': ' + error.message);
  return sb.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
$('#vform').onsubmit = async e => {
  e.preventDefault(); const f = e.target, mode = isSuper() ? (e.submitter?.dataset.mode || submitMode) : 'submit';
  const btns = $$('#vbtns button'); btns.forEach(b => b.disabled = true); $('#progress').classList.remove('hidden'); $('#bar').style.width = '10%';
  try {
    const vf = f.vfile.files[0];
    if (!editing && !vf) throw new Error('Choose a video file to upload');
    if (!f.category.value) throw new Error('Please select a category');
    if (!f.subcategory.value) throw new Error('Please select a subcategory');
    if (vf && hashing) { $('#ptext').textContent = 'Checking for duplicates…'; await hashing; }
    if (vf && dupState === 'ask') { $('#dupmodal').classList.remove('hidden'); throw new Error('Confirm the duplicate warning first'); }
    const bothH = vf ? fileHash : editing?.file_hash, catChanged = !editing || vf || editing.category !== f.category.value;
    if (f.category.value === 'both' && catChanged && !bothAllowed(bothH, editing?.id)) throw new Error('For Both is only allowed when this same video is already in For Lawyers and For Doctors.');
    if (vf && !f.duration_seconds.value) throw new Error('Still analysing the video — try again in a second');
    const row = {
      title: f.title.value.trim(), description: f.description.value.trim(), category: f.category.value, subcategory: f.subcategory.value,
      duration_seconds: +f.duration_seconds.value || 0, resolution: f.resolution.value || '1080p', fps: +f.fps.value || 30, orientation: f.orientation.value || 'horizontal',
      tags: [...new Set(f.tags.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]
    };
    if (isSuper()) { row.status = 'approved'; row.published = mode === 'approve'; } else { row.published = true; }
    if (vf) { row.file_hash = fileHash || await fingerprint(vf).catch(() => null); row.video_url = await upload(vf, vf.name, 'video'); $('#bar').style.width = '70%'; if (thumbBlob) row.thumbnail_url = await upload(thumbBlob, 'thumb.jpg', 'thumbnail'); }
    $('#bar').style.width = '90%'; $('#ptext').textContent = 'Saving details…';
    const old = editing ? { v: editing.video_url, t: editing.thumbnail_url } : {};
    if (editing && row.status === 'approved') { row.reviewed_by = me.id; row.review_note = null; }
    const { data: saved, error } = editing ? await sb.from('videos').update(row).eq('id', editing.id).select('title').maybeSingle() : await sb.from('videos').insert(row).select('title').maybeSingle();
    if (error) throw error;
    if (saved && saved.title !== row.title && /Variant \d+$/.test(saved.title)) toast(`Same video was uploaded before — saved as “${saved.title}”`);
    if (vf) { const stale = [old.v, old.t].map(storagePath).filter(Boolean); if (stale.length) await sb.storage.from('videos').remove(stale); }
    toast(!isSuper() ? 'Submitted — waiting for superadmin approval' : mode === 'approve' ? 'Approved — live on website' : 'Saved as draft (hidden from website)');
    $('#bar').style.width = '100%'; $('#vmodal').classList.add('hidden'); loadAll();
  } catch (err) { toast(err.message, 1); $('#ptext').textContent = err.message; }
  btns.forEach(b => b.disabled = false);
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
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : s < 604800 ? Math.floor(s / 86400) + 'd ago' : new Date(d).toLocaleDateString(); };
const initials = e => (e || '?').split('@')[0].split(/[._-]/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
function reqCard(r, forReview) {
  const chip = { pending: 'bg-amber-100 text-amber-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800' }[r.status];
  const act = { insert: ['add_circle', 'text-green-700'], update: ['edit', 'text-primary'], delete: ['delete', 'text-error'] }[r.action] || ['edit', 'text-primary'];
  return `<div class="bg-white rounded-2xl border border-outline-variant/40 p-5"><div class="flex flex-wrap items-center gap-3">
  <span class="w-10 h-10 rounded-full bg-surface-container grid place-items-center ${act[1]}"><span class="material-symbols-outlined">${act[0]}</span></span>
  <div class="flex-1 min-w-[200px]"><p class="font-semibold">${esc(r.summary || `${r.action} ${r.entity}`)}</p><p class="text-xs text-on-surface-variant">${esc(r.requested_email || who(r.requested_by))} · ${ago(r.created_at)}</p></div>
  <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${chip}">${r.status}</span></div>
  ${r.status === 'pending' ? `<div class="mt-3 rounded-xl bg-surface-container-low p-3">${diff(r)}</div>` : ''}${r.review_note ? `<p class="text-sm mt-2 text-on-surface-variant">Note: “${esc(r.review_note)}”</p>` : ''}
  ${forReview && r.status === 'pending' ? `<div class="flex gap-2 mt-4 justify-end"><button data-rno="${r.id}" class="px-4 py-2 rounded-lg border border-outline-variant text-sm font-medium hover:border-red-400 hover:text-red-700">Reject</button><button data-rok="${r.id}" class="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800">Approve &amp; apply</button></div>` : ''}</div>`;
}
function renderReview() { }
// ---------------- UPLOAD GUIDE (admin) ----------------
function renderGuide() {
  if (isSuper()) return; const mine = videos.filter(v => v.submitted_by === me.id), rej = mine.filter(v => v.status === 'rejected');
  const card = (i, t, body) => `<div class="bg-white rounded-2xl border border-outline-variant/40 p-5"><div class="flex items-center gap-2 mb-2"><span class="material-symbols-outlined text-primary">${i}</span><h2 class="font-semibold">${t}</h2></div><div class="text-sm text-on-surface-variant space-y-1.5">${body}</div></div>`;
  const reasons = {}; rej.forEach(v => (v.review_note || '').split(/\.\s*/).map(x => x.trim()).filter(Boolean).forEach(r => reasons[r] = (reasons[r] || 0) + 1));
  const topR = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $('#guide').innerHTML = `<div class="grid gap-4 lg:grid-cols-2">
  ${card('route', 'How it works', `<p>1. Click <b>Add video</b> and drop your file.</p><p>2. Pick the category and subcategory, then add a clear title and tags.</p><p>3. Click <b>Save</b> — a superadmin reviews it.</p><p>4. Track the result in <b>My requests</b>. Approved videos go live on the website.</p>`)}
  ${card('checklist', 'Before you upload', `<p>• One clip per upload, max <b>50 MB</b>.</p><p>• Use a descriptive title (what is happening in the clip).</p><p>• Add 3–6 tags people would search for, e.g. <i>court, judge, gavel</i>.</p><p>• Horizontal clips work best on the website.</p>`)}
  ${card('handshake', '“For Both” rule', `<p>A video can be added to <b>For Both</b> only when the same video is already in <b>For Lawyers</b> and <b>For Doctors</b>.</p>`)}
  ${card('content_copy', 'Duplicates', `<p>If you upload a file that is already in the library you'll see a warning with a preview. Continuing saves it as “Title - Variant N”.</p>`)}
  ${card('category', 'Categories', mains().map(m => `<p><b>${esc(m.name)}</b>: ${subsOf(m.slug).map(x => esc(x.name)).join(', ') || '—'}</p>`).join(''))}
  ${card('insights', 'Your results', `<p>${mine.length} uploaded · <span class="text-green-700">${mine.filter(isLive).length} live</span> · <span class="text-amber-700">${mine.filter(v => v.status === 'pending').length} waiting</span> · <span class="text-red-700">${rej.length} rejected</span></p>${topR.length ? `<p class="pt-1">Most common rejection reasons:</p>${topR.map(([r, n]) => `<p>• ${esc(r)} <span class="text-xs">(${n}×)</span></p>`).join('')}` : ''}`)}
  </div>`;
}

// ---------------- MY REQUESTS (admin) ----------------
function renderMyReq() {
  if (isSuper()) return;
  const mv = videos.filter(v => v.submitted_by === me.id);
  const chip = v => ({ pending: ['Waiting for review', 'bg-amber-100 text-amber-800', 'hourglass_top'], approved: [v.published ? 'Approved · Live' : 'Approved · Hidden', 'bg-green-100 text-green-800', 'check_circle'], rejected: ['Rejected', 'bg-red-100 text-red-800', 'block'] }[v.status] || ['Pending', 'bg-amber-100 text-amber-800', 'hourglass_top']);
  $('#myReq').innerHTML = mv.map(v => { const [l, c, i] = chip(v); return `<div class="bg-white rounded-xl border border-outline-variant/40 p-4">
    <div class="flex items-center gap-3"><button data-play="${v.id}" class="w-24 aspect-video rounded bg-surface-container overflow-hidden shrink-0">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : ''}</button>
    <div class="flex-1 min-w-0"><p class="font-medium truncate">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${esc(cname(v.category))} › ${esc(cname(v.subcategory))} · ${new Date(v.created_at).toLocaleString()}</p></div>
    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${c}"><span class="material-symbols-outlined !text-sm">${i}</span>${l}</span></div>
    ${v.status === 'rejected' && v.review_note ? `<div class="mt-3 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-800"><b>Reason:</b> ${esc(v.review_note)}</div>` : ''}</div>`; }).join('')
    || '<div class="text-center py-12 text-on-surface-variant"><span class="material-symbols-outlined !text-5xl">video_library</span><p class="mt-2">You haven\'t uploaded any videos yet.</p></div>';
}
$('#myReq').onclick = async e => { const pl = e.target.closest('[data-play]')?.dataset.play; if (pl) return preview(videos.find(v => v.id === pl)); const id = e.target.closest('[data-rcancel]')?.dataset.rcancel; if (!id || !confirm('Cancel this request?')) return; const { error } = await sb.from('change_requests').delete().eq('id', id); if (error) return toast(error.message, 1); toast('Cancelled'); loadAll(); };

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
function renderStatus() {
  $('#statusWrap').classList.toggle('hidden', !topLevel || !status.length); if (!topLevel) return;
  const acc = a => ({ Active: 'bg-green-100 text-green-800', 'Invite not accepted': 'bg-amber-100 text-amber-800' }[a] || 'bg-red-100 text-red-800');
  $('#statusRows').innerHTML = status.map(m => `<tr class="border-b border-outline-variant/30 last:border-0">
    <td class="p-3"><div class="flex items-center gap-2"><span class="w-8 h-8 rounded-full bg-surface-container grid place-items-center text-xs font-bold">${initials(m.email)}</span><span class="font-medium">${esc(m.email)}</span>${m.user_id === me.id ? '<span class="text-xs text-on-surface-variant">(you)</span>' : ''}</div></td>
    <td class="p-3 whitespace-nowrap">${esc(m.role_label)}</td><td class="p-3"><span class="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${acc(m.account)}">${esc(m.account)}</span></td>
    <td class="p-3 whitespace-nowrap text-on-surface-variant">${m.last_sign_in ? ago(m.last_sign_in) : '—'}</td>
    <td class="p-3 text-right">${m.uploads}</td><td class="p-3 text-right text-green-700">${m.live}</td><td class="p-3 text-right text-amber-700">${m.pending}</td><td class="p-3 text-right text-red-700">${m.rejected}</td>
    <td class="p-3 whitespace-nowrap text-on-surface-variant">${m.last_upload ? ago(m.last_upload) : '—'}</td></tr>`).join('');
}
function renderTeam() {
  if (!isSuper()) return; renderStatus();
  const st = (i, n, l) => `<div class="bg-white rounded-xl border border-outline-variant/40 p-4 flex items-center gap-3"><span class="w-10 h-10 rounded-full bg-primary-fixed text-primary grid place-items-center"><span class="material-symbols-outlined">${i}</span></span><div><p class="text-2xl font-bold leading-none">${n}</p><p class="text-xs text-on-surface-variant mt-1">${l}</p></div></div>`;
  $('#teamStats').innerHTML = st('groups', team.length, 'Members') + st('shield_person', team.filter(t => lvl(t.role) === 'superadmin').length, 'Superadmins') + st('person', team.filter(t => t.role === 'admin').length, 'Admins') + st('mail', invites.length, 'Pending invites');
  const sorted = [...team].sort((a, b) => (b.user_id === me.id) - (a.user_id === me.id) || (lvl(a.role) === lvl(b.role) ? 0 : lvl(a.role) === 'superadmin' ? -1 : 1));
  $('#teamRows').innerHTML = sorted.map(t => { const up = videos.filter(v => v.submitted_by === t.user_id), you = t.user_id === me.id, sup = lvl(t.role) === 'superadmin', locked = !you && sup && !topLevel;
    return `<div class="bg-white rounded-2xl border border-outline-variant/40 p-4">
    <div class="flex items-center gap-3"><span class="w-11 h-11 rounded-full grid place-items-center font-bold text-sm ${sup ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}">${initials(t.email)}</span>
    <div class="flex-1 min-w-0"><p class="font-semibold truncate">${esc(t.email || t.user_id)}</p><p class="text-xs text-on-surface-variant">${you ? 'You · ' : ''}${up.length} uploads · ${up.filter(isLive).length} live</p></div>
    <span class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${sup ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container text-on-surface-variant'}">${you && myTitle ? esc(myTitle) : sup ? 'Superadmin' : 'Admin'}</span></div>
    ${locked ? `<p class="flex items-center gap-1.5 mt-4 pt-3 border-t border-outline-variant/40 text-xs text-on-surface-variant"><span class="material-symbols-outlined !text-base">lock</span>Protected — superadmins can't change other superadmins.</p>` : ''}
    ${you || locked ? '' : `<div class="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant/40"><select data-role="${t.user_id}" aria-label="Role" class="flex-1 rounded-lg border-outline-variant text-sm py-1.5 focus:ring-primary"><option value="admin" ${!sup ? 'selected' : ''}>Admin</option><option value="superadmin" ${sup ? 'selected' : ''}>Superadmin</option></select>
    <button data-rm="${t.user_id}" data-em="${esc(t.email)}" class="px-3 py-1.5 rounded-lg text-sm text-error font-medium hover:bg-red-50 flex items-center gap-1"><span class="material-symbols-outlined !text-base">person_remove</span>Remove</button></div>`}</div>`; }).join('');
}
$('#teamRows').onchange = async e => { const id = e.target.dataset.role; if (!id) return; const { data, error } = await sb.from('admins').update({ role: e.target.value }).eq('user_id', id).select('user_id'); if (error) { loadAll(); return toast(error.message, 1); } if (!data?.length) { loadAll(); return toast("You don't have permission to change this member", 1); } toast('Role updated'); loadAll(); };
$('#teamRows').onclick = async e => { const b = e.target.closest('[data-rm]'); if (!b || !confirm(`Remove admin access for ${b.dataset.em}?`)) return; const { data, error } = await sb.from('admins').delete().eq('user_id', b.dataset.rm).select('user_id'); if (error) return toast(error.message, 1); if (!data?.length) return toast("You don't have permission to remove this member", 1); toast('Removed'); loadAll(); };
async function sendInvite(email, role) {
  const { data, error } = await sb.functions.invoke('invite-admin', { body: { email, role, redirectTo: ADMIN_URL } });
  let msg = error?.message; if (error && error.context?.json) { try { msg = (await error.context.json()).error || msg; } catch { } }
  if (error) {
    if (/Failed to send|not found|404|FunctionsFetchError|FunctionsRelayError/i.test(msg || '')) {
      const r = await sb.rpc('add_admin', { p_email: email, p_role: role }); if (r.error) { toast(r.error.message, 1); return false; }
      toast(r.data === 'invited' ? 'Role saved. Invite function not deployed — send invite from Supabase → Users → Invite user' : 'Admin added'); return true;
    }
    toast(msg, 1); return false;
  }
  toast(data?.status === 'sent' ? 'Invite email sent to ' + email : (data?.note || 'Done')); return true;
}
$('#addAdmin').onsubmit = async e => {
  e.preventDefault(); const f = e.target, b = f.querySelector('button'), lbl = b.innerHTML; b.disabled = true; b.textContent = 'Sending…';
  const ok = await sendInvite(f.email.value.trim(), f.role.value); b.disabled = false; b.innerHTML = lbl; if (ok) { f.reset(); loadAll(); }
};
function renderInvites() { const el = $('#inviteRows'); if (!el) return;
  el.innerHTML = invites.map(i => `<div class="bg-white rounded-xl border border-dashed border-outline-variant p-3 flex flex-wrap items-center gap-3 text-sm"><span class="w-9 h-9 rounded-full bg-amber-100 text-amber-800 grid place-items-center"><span class="material-symbols-outlined !text-lg">schedule_send</span></span>
    <div class="flex-1 min-w-0"><p class="font-medium truncate">${esc(i.email)}</p><p class="text-xs text-on-surface-variant capitalize">${esc(i.role)} · invited ${ago(i.created_at)}</p></div>
    <button data-resend="${esc(i.email)}" data-role="${esc(i.role)}" class="px-3 py-1.5 rounded-lg text-primary font-medium hover:bg-primary-fixed/50">Resend</button><button data-uninv="${esc(i.email)}" class="px-3 py-1.5 rounded-lg text-error font-medium hover:bg-red-50">Cancel</button></div>`).join('') || '<p class="text-sm text-on-surface-variant bg-white rounded-xl border border-outline-variant/40 p-4">No pending invites.</p>'; }
$('#inviteRows').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.resend) { b.disabled = true; await sendInvite(b.dataset.resend, b.dataset.role); b.disabled = false; return; }
  const em = b.dataset.uninv; if (!em || !confirm(`Cancel invite for ${em}?`)) return; const { error } = await sb.from('admin_invites').delete().eq('email', em); if (error) return toast(error.message, 1); loadAll(); };

boot();
