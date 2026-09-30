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
const loginCap = esCaptcha.mount($('#loginCap'));
$('#forgotBtn').onclick = async () => {
  const err = $('#loginErr'); err.textContent = ''; err.classList.replace('text-green-700', 'text-error');
  let r; try { r = await esReset.send(async e => { const captchaToken = await loginCap.token(); const out = await sb.auth.resetPasswordForEmail(e, { redirectTo: ADMIN_URL, captchaToken }); if (out.error) out.error.message = esCaptcha.friendly(out.error.message); return out; }, $('#loginForm').email.value); }
  catch (x) { r = { ok: false, msg: x.message }; } finally { loginCap.reset(); }
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
  await window.ES_MAINT;
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
  await loadAll(); live(); setTimeout(backfillHashes, 1500); if (isSuper()) setTimeout(cleanStorage, 2500);
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
    const captchaToken = await loginCap.token();
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value, options: { captchaToken } });
    if (error) msg = esLock.fail(esCaptcha.friendly(error.message));
    else { const { data: r } = await sb.rpc('my_role'); if (!r) { await sb.auth.signOut(); msg = 'This account has no admin access. Ask a superadmin to add you.'; } else esLock.reset(); }
  } catch (x) { msg = /security check/i.test(x?.message || '') ? x.message : 'Could not reach the server. Check your connection and try again.'; }
  loginCap.reset(); b.disabled = false; b.querySelector('.lbl').classList.remove('invisible'); b.querySelector('.spin').classList.add('hidden');
  if (msg) return fail(msg);
  card.classList.add('hidden'); $('#loginOk').classList.remove('hidden');
  setTimeout(() => { show('boot'); boot(true).then(() => { card.classList.remove('hidden'); $('#loginOk').classList.add('hidden'); f.reset(); }); }, 1100);
};

const logout = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
$('#logout').onclick = logout; $('#logoutM').onclick = logout;

// ---------------- TABS ----------------
function buildTabs() {
  const t = isSuper()
    ? [['dash', 'dashboard', 'Dashboard'], ['videos', 'movie', 'Videos'], ['usage', 'monitoring', 'Usage'], ['cats', 'category', 'Categories'], ['team', 'group', 'Team']]
    : [['videos', 'movie', 'Videos'], ['requests', 'pending_actions', 'My requests'], ['guide', 'menu_book', 'Upload guide']];
  $('#tabs').innerHTML = t.map(([k, i, l]) => `<button data-tab="${k}" class="tab flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"><span class="material-symbols-outlined">${i}</span><span class="hidden sm:inline">${l}</span><span data-badge="${k}" class="hidden ml-auto text-[11px] font-bold bg-error text-white rounded-full px-1.5 min-w-[20px] text-center"></span></button>`).join('');
  $$('.tab').forEach(b => b.onclick = () => tab(b.dataset.tab));
}
function tab(t) {
  let [name, filter] = String(t || '').split(':'); t = name;
  if (!$('#t-' + t) || !$(`.tab[data-tab="${t}"]`)) t = $('.tab')?.dataset.tab || 'videos'; history.replaceState(null, '', '#' + t);
  if (t === 'videos' && filter !== undefined) { $('#vstat').value = filter; renderVideos(); }
  $$('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 't-' + t));
  if (t === 'usage') loadUsage();
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
  renderDash(); renderVideos(); renderCats(); fillCatSelects(); renderReview(); renderGuide(); renderMyReq(); renderTeam(); if (isSuper()) renderInvites(); paintUsageLists(); renderStorage();
}
// roles above 'admin' are all shown as superadmin
const lvl = r => r === 'admin' ? 'admin' : r ? 'superadmin' : null;
// Private bucket → short-lived signed links for thumbnails / players
const signCache = new Map();
async function signVideos(list) {
  const now = Date.now(), need = [...new Set(list.flatMap(v => [storagePath(v.video_url), storagePath(v.thumbnail_url)]).filter(p => p && !(signCache.get(p)?.exp > now)))];
  for (let i = 0; i < need.length; i += 500) { const { data } = await sb.storage.from('videos').createSignedUrls(need.slice(i, i + 500), 3600); (data || []).forEach(d => d.signedUrl && signCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60e3 })); }
  // B2 videos ("b2:videos/…") get links from the b2-sign server function
  const b2 = [...new Set(list.map(v => v.video_url).filter(u => isB2(u) && !(signCache.get(u)?.exp > now)))];
  for (let i = 0; i < b2.length; i += 200) { try { const { data } = await sb.functions.invoke('b2-sign', { body: { action: 'view', paths: b2.slice(i, i + 200) } }); Object.entries(data?.urls || {}).forEach(([p, u]) => signCache.set(p, { url: u, exp: now + 50 * 60e3 })); } catch (e) { console.warn('b2-sign', e); } }
  return list.map(v => ({ ...v, _b2: isB2(v.video_url) ? v.video_url : null, video_url: (isB2(v.video_url) ? signCache.get(v.video_url)?.url : signCache.get(storagePath(v.video_url))?.url) || (isB2(v.video_url) ? null : v.video_url), thumbnail_url: signCache.get(storagePath(v.thumbnail_url))?.url || v.thumbnail_url }));
}
const isB2 = u => typeof u === 'string' && u.startsWith('b2:');
const useB2 = () => (window.ES_CONFIG || {}).VIDEO_STORAGE === 'b2';
const mains = () => cats.filter(c => !c.parent_slug);
const subsOf = m => cats.filter(c => c.parent_slug === m);
const cname = s => cats.find(c => c.slug === s)?.name || (s === 'both' ? 'Both (removed)' : s);
const who = id => team.find(t => t.user_id === id)?.email || (id === me.id ? me.email : 'Superadmin');
const isLive = v => v.status === 'approved' && v.published;
const pendReqFor = (entity, target) => reqs.find(r => r.status === 'pending' && r.entity === entity && r.target === target);

// ---------------- DASHBOARD ----------------
function renderDash() {
  const live = videos.filter(isLive).length, pend = videos.filter(v => v.status === 'pending').length, preq = reqs.filter(r => r.status === 'pending').length;
  const stat = (i, n, l, tabk) => `<button ${tabk ? `data-go="${tabk}"` : ''} class="text-left bg-white rounded-xl border border-outline-variant/40 p-5 hover:border-primary/50 transition"><span class="material-symbols-outlined text-primary">${i}</span><p class="text-3xl font-bold mt-2">${n}</p><p class="text-sm text-on-surface-variant">${l}</p></button>`;
  const mine = videos.filter(v => v.submitted_by === me.id);
  $('#stats').innerHTML = isSuper()
    ? stat('movie', videos.length, 'Total videos', 'videos:') + stat('public', live, 'Live on website', 'videos:live') + stat('hourglass_top', pend, 'Waiting for approval', 'videos:pending') + stat('content_copy', dupCopies().size, 'Duplicate videos', 'videos:dup')
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

// ---------------- VIDEO STORAGE (owner only): move old Supabase videos to B2 ----------------
let migrating = false, stopMigrate = false;
function renderStorage() {
  const box = $('#storageBox'); if (!topLevel) return box.classList.add('hidden');
  const onSup = videos.filter(v => v.video_url && !v._b2 && storagePath(v.video_url)), onB2 = videos.filter(v => v._b2);
  box.classList.remove('hidden');
  if (migrating) return;
  box.innerHTML = `<div class="flex flex-wrap items-center gap-3"><span class="material-symbols-outlined text-primary">cloud_sync</span><div class="flex-1 min-w-[200px]"><p class="font-semibold">Video storage</p><p class="text-sm text-on-surface-variant"><b>${onB2.length}</b> in Backblaze B2 · <b>${onSup.length}</b> still in Supabase</p></div>
    ${!useB2() ? '' : onSup.length ? `<button id="migBtn" class="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-semibold">Move ${onSup.length} to B2</button>` : '<span class="text-sm text-green-700 font-medium">✓ All videos are in B2</span>'}
    <button id="sweepBtn" class="border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary">Clean up unused files</button></div><p id="migStat" class="text-sm mt-3 empty:hidden"></p><div id="usageMeters" class="grid gap-3 sm:grid-cols-3 mt-4"></div>`;
  paintUsage(); loadStorageUsage();
  const b = $('#migBtn'); if (b) b.onclick = () => migrateAll(onSup);
  $('#sweepBtn').onclick = sweepStorage;
}
// Owner: how much of each plan is used / left (database, Supabase Storage, B2)
let storageUse = null, storageUseAt = 0;
async function loadStorageUsage(force) {
  if (!topLevel || (!force && Date.now() - storageUseAt < 120e3)) return; storageUseAt = Date.now();
  const [a, b] = await Promise.all([sb.rpc('storage_usage'), useB2() ? sb.functions.invoke('b2-sign', { body: { action: 'usage' } }).catch(e => ({ error: e })) : Promise.resolve({ data: { configured: false } })]);
  storageUse = { db: a.error ? null : a.data, dbErr: a.error?.message, b2: b.error || b.data?.error ? null : b.data };
  paintUsage();
}
function paintUsage() { const el = $('#usageMeters'); if (!el) return; const L = (window.ES_CONFIG || {}).LIMITS || {}, u = storageUse;
  const meter = (icon, label, used, limit, sub) => { if (used == null) return `<div class="rounded-xl bg-surface-container-low p-4 text-sm"><p class="font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined !text-lg text-primary">${icon}</span>${label}</p><p class="text-on-surface-variant mt-2">${sub}</p></div>`;
    const pc = limit ? Math.min(100, used / limit * 100) : 0, left = Math.max(0, limit - used), col = pc > 90 ? 'bg-error' : pc > 70 ? 'bg-amber-500' : 'bg-[#e0701f]';
    return `<div class="rounded-xl bg-surface-container-low p-4"><p class="text-sm font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined !text-lg text-primary">${icon}</span>${label}</p>
      <p class="mt-2"><span class="text-xl font-bold tabular-nums">${mb(left)}</span> <span class="text-sm text-on-surface-variant">left of ${mb(limit)}</span></p>
      <div class="h-2 mt-2 rounded-full bg-surface-container overflow-hidden" role="meter" aria-valuenow="${pc.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="${label} used"><div class="h-full rounded-full ${col}" style="width:${pc.toFixed(1)}%"></div></div>
      <p class="text-xs text-on-surface-variant mt-1.5">${mb(used)} used (${pc.toFixed(0)}%)${sub ? ' · ' + sub : ''}</p></div>`; };
  if (!u) { el.innerHTML = skCards(3, 24); return; }
  el.innerHTML = meter('database', 'Database', u.db?.db_bytes ?? null, (L.DATABASE_MB || 500) * 1048576, u.db ? `${u.db.videos} videos` : (/storage_usage|function/.test(u.dbErr || '') ? 'run usage-v7.sql' : 'unavailable'))
    + meter('photo_library', 'Supabase Storage', u.db?.storage_bytes ?? null, (L.SUPABASE_STORAGE_MB || 1024) * 1048576, u.db ? `${u.db.storage_files} files (thumbnails${u.db.videos - u.db.videos_b2 ? ' + older videos' : ''})` : 'unavailable')
    + meter('cloud', 'Backblaze B2 (videos)', u.b2?.configured ? u.b2.bytes : null, (L.B2_GB || 10) * 1073741824, u.b2?.configured ? `${u.b2.files} files` : useB2() ? 'could not reach B2' : 'not in use');
}
const mb = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
async function sweepStorage() {
  const btn = $('#sweepBtn'), st = $('#migStat'); btn.disabled = true; st.textContent = 'Checking storage for files no video uses…';
  const run = async dryRun => { const { data, error } = await sb.functions.invoke('b2-sign', { body: { action: 'sweep', dryRun } }); if (error || data?.error) throw new Error(data?.error || await fnError(error)); return data; };
  try {
    const d = await run(true), n = d.supabase + d.b2;
    if (!n) { st.textContent = '✓ No unused files found' + (d.b2Checked ? '' : ' (B2 not set up — only Supabase checked)') + '.'; return; }
    st.textContent = `Found ${n} unused file(s) — ${d.supabase} in Supabase, ${d.b2} in B2 (${mb(d.bytes)}).`;
    if (!await ask({ title: `Delete ${n} unused file${n === 1 ? '' : 's'}?`, message: `This frees ${mb(d.bytes)}. Files used by any video are never touched.`, ok: 'Delete files', tone: 'danger' })) return;
    st.textContent = 'Deleting…'; const r = await run(false);
    st.textContent = `✓ Deleted ${r.supabase + r.b2} unused file(s), freed ${mb(r.bytes)}.`; toast('Storage cleaned up');
  } catch (e) { st.innerHTML = `<span class="text-error">${esc(e.message)}</span>`; } finally { btn.disabled = false; }
}
async function migrateAll(list) {
  if (!await ask({ title: `Move ${list.length} video${list.length === 1 ? '' : 's'} to B2?`, message: 'Keep this tab open until it finishes. You can stop at any time.', ok: 'Start moving', icon: 'cloud_sync' })) return;
  migrating = true; stopMigrate = false; let ok = 0, bad = 0; const errs = [];
  $('#migBtn').outerHTML = '<button id="migStop" class="border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold">Stop</button>';
  $('#migStop').onclick = () => { stopMigrate = true; $('#migStop').disabled = true; $('#migStop').textContent = 'Stopping…'; };
  for (const [i, v] of list.entries()) {
    if (stopMigrate) break;
    $('#migStat').textContent = `Moving ${i + 1} of ${list.length}: ${v.title}…`;
    try { const { data, error } = await sb.functions.invoke('b2-sign', { body: { action: 'migrate', id: v.id } }); if (error || data?.error) throw new Error(data?.error || await fnError(error)); ok++; }
    catch (e) { bad++; errs.push(`${v.title}: ${e.message}`); }
  }
  migrating = false; await cleanStorage();
  toast(`Moved ${ok} video(s) to B2${bad ? ` · ${bad} failed` : ''}${stopMigrate ? ' · stopped' : ''}`, bad > 0);
  await loadAll(); if (errs.length) $('#migStat').innerHTML = '<span class="text-error">' + errs.slice(0, 5).map(esc).join('<br>') + '</span>';
}

// ---------------- USAGE (downloads) — superadmin / owner only; the server refuses everyone else ----------------
let usageSeq = 0;
const fmtDay = (d, long) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
function barList(rows, label) { const max = Math.max(1, ...rows.map(r => r.n));
  return rows.length ? rows.map(r => `<div class="py-1.5"><div class="flex justify-between gap-3 text-sm"><span class="truncate">${label(r)}</span><span class="font-semibold tabular-nums">${r.n}</span></div><div class="h-1.5 mt-1 rounded-full bg-surface-container overflow-hidden"><div class="h-full rounded-full bg-[#e0701f]" style="width:${(r.n / max * 100).toFixed(1)}%"></div></div></div>`).join('')
    : '<p class="text-sm text-on-surface-variant py-6 text-center">No downloads in this period.</p>'; }
function usageChart(daily) {
  const W = 720, H = 220, L = 34, B = 26, T = 10, n = daily.length, max = Math.max(1, ...daily.map(d => d.n));
  const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step || 1;
  const bw = (W - L) / n, gap = Math.min(2, bw * .25), y = v => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top].filter((v, i, a) => a.indexOf(v) === i && Number.isInteger(v));
  const every = Math.ceil(n / 8);
  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" role="img" aria-label="Downloads per day, ${n} days, max ${max}">
  ${ticks.map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#eadfd5" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6b5a4d">${v}</text>`).join('')}
  ${daily.map((d, i) => { const w = Math.max(1, Math.min(bw - gap, 36)), x = L + i * bw + (bw - w) / 2, h = Math.max(0, y(0) - y(d.n));
    return `<g class="ubar" data-i="${i}"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>${d.n ? (() => { const r = Math.min(4, w / 2, h); return `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="#e0701f"/>`; })() : ''}</g>`; }).join('')}
  <line x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#cdbfb2"/>
  ${daily.map((d, i) => i % every === 0 || i === n - 1 ? `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b5a4d">${fmtDay(d.day)}</text>` : '').join('')}
</svg><div id="uTip" class="hidden absolute pointer-events-none bg-neutral-900 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"></div>`;
}
async function loadUsage() {
  if (!isSuper()) return; const my = ++usageSeq, days = +$('#uDays').value;
  $('#uStats').innerHTML = skCards(4); $('#uChart').innerHTML = '<div class="sk h-48"></div>'; $('#uTop').innerHTML = skCards(3, 12); $('#uCat').innerHTML = skCards(3, 12);
  const { data: d, error } = await sb.rpc('download_stats', { p_days: days });
  if (my !== usageSeq) return;
  if (error || !d) { $('#uStats').innerHTML = ''; $('#uChart').innerHTML = `<p class="text-sm text-error py-8 text-center">Could not load usage: ${esc(error?.message || 'no data')}${/download_stats|function/.test(error?.message || '') ? ' — run downloads-v4.sql' : ''}</p>`; $('#uTop').innerHTML = $('#uCat').innerHTML = ''; return; }
  const tile = (i, n, l) => `<div class="bg-white rounded-xl border border-outline-variant/40 p-5"><span class="material-symbols-outlined text-primary">${i}</span><p class="text-3xl font-bold mt-2 tabular-nums">${n}</p><p class="text-sm text-on-surface-variant">${l}</p></div>`;
  $('#uStats').innerHTML = tile('download', d.in_range, `Downloads · last ${d.days} days`) + tile('today', d.today, 'Today') + tile('movie', d.videos, 'Different videos downloaded') + tile('all_inclusive', d.total, 'All-time downloads');
  $('#uChart').innerHTML = usageChart(d.daily);
  const tip = $('#uTip'), box = $('#uChart');
  $$('#uChart .ubar').forEach(g => { g.onmouseenter = g.onclick = () => { const x = d.daily[+g.dataset.i], r = g.getBoundingClientRect(), b = box.getBoundingClientRect();
      tip.innerHTML = `<b>${x.n}</b> download${x.n === 1 ? '' : 's'} · ${fmtDay(x.day, 1)}`; tip.classList.remove('hidden');
      tip.style.left = Math.min(Math.max(0, r.left - b.left + r.width / 2 - tip.offsetWidth / 2), b.width - tip.offsetWidth) + 'px'; tip.style.top = '-6px'; g.querySelector('path')?.setAttribute('fill', '#b8551a'); };
    g.onmouseleave = () => { tip.classList.add('hidden'); g.querySelector('path')?.setAttribute('fill', '#e0701f'); }; });
  $('#uTable').innerHTML = `<table class="w-full"><thead><tr class="text-left text-on-surface-variant"><th class="py-1">Day</th><th class="py-1 text-right">Downloads</th></tr></thead><tbody>${[...d.daily].reverse().map(x => `<tr class="border-t border-outline-variant/30"><td class="py-1">${fmtDay(x.day, 1)}</td><td class="py-1 text-right tabular-nums">${x.n}</td></tr>`).join('')}</tbody></table>`;
  lastUsage = d; paintUsageLists();
}
let lastUsage = null;
function paintUsageLists() { const d = lastUsage; if (!d) return;       // category names need `cats`, so this re-runs after loadAll too
  $('#uTop').innerHTML = barList(d.top, r => `${esc(r.title || 'Deleted video')} <span class="text-xs text-on-surface-variant">· ${esc(cname(r.category))}</span>`);
  $('#uCat').innerHTML = barList(d.by_category, r => esc(cname(r.category)));
  $('#uMemberWrap').classList.toggle('hidden', !Array.isArray(d.by_member));
  if (Array.isArray(d.by_member)) $('#uMember').innerHTML = barList(d.by_member, r => esc(r.email));
}
$('#uDays').onchange = loadUsage;
$('#uTableBtn').onclick = () => { const t = $('#uTable'); t.classList.toggle('hidden'); $('#uTableBtn').textContent = t.classList.contains('hidden') ? 'Show table' : 'Hide table'; };

// ---------------- VIDEOS ----------------
function statusChip(v) {
  const pr = pendReqFor('video', v.id);
  const map = { approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Draft', 'bg-surface-container text-on-surface-variant'], pending: ['Pending review', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'] };
  const [l, c] = map[v.status] || map.pending;
  return `<span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${c}">${l}</span>${pr ? `<span class="block mt-1 text-[11px] text-amber-700">Change ${pr.action} pending</span>` : ''}${v.status === 'rejected' && v.review_note ? `<span class="block mt-1 text-[11px] text-red-700 max-w-[160px]">“${esc(v.review_note)}”</span>` : ''}`;
}
function canDirect(v) { return isSuper(); }
const dupSet = () => { const n = {}; videos.forEach(v => v.file_hash && (n[v.file_hash] = (n[v.file_hash] || 0) + 1)); return new Set(Object.keys(n).filter(h => n[h] > 1)); };
// First upload of each file = the Original; only later uploads are "duplicates"
const originals = () => { const o = {}; videos.forEach(v => { if (!v.file_hash) return; const c = o[v.file_hash]; if (!c || new Date(v.created_at) - new Date(c.created_at) < 0 || (v.created_at === c.created_at && v.id < c.id)) o[v.file_hash] = v; }); return o; };
const dupCopies = () => { const d = dupSet(), o = originals(); return new Set(videos.filter(v => d.has(v.file_hash) && o[v.file_hash].id !== v.id).map(v => v.id)); };
function renderVideos() {
  const q = $('#vq').value.toLowerCase().trim(), c = $('#vcat').value, s = $('#vstat').value, dups = dupSet(), copies = dupCopies();
  const list = videos.filter(v => (!q || (v.search_text || (v.title + ' ' + (v.tags || []).join(' '))).toLowerCase().includes(q)) && (!c || v.category === c || v.subcategory === c) &&
    (!s || (s === 'live' && isLive(v)) || (s === 'draft' && v.status === 'approved' && !v.published) || s === v.status || (s === 'mine' && v.submitted_by === me.id) || (s === 'dup' && dups.has(v.file_hash))));
  // Duplicates view: group each file together — Original (first upload) then its variants in upload order
  const grp = {};
  if (s === 'dup') {
    const first = {}; list.forEach(v => { const t = +new Date(v.created_at); if (!(v.file_hash in first) || t < first[v.file_hash]) first[v.file_hash] = t; });
    list.sort((a, b) => first[a.file_hash] - first[b.file_hash] || String(a.file_hash).localeCompare(String(b.file_hash)) || new Date(a.created_at) - new Date(b.created_at) || (a.id < b.id ? -1 : 1));
    list.forEach(v => (grp[v.file_hash] = grp[v.file_hash] || []).push(v));
  }
  const cols = (isSuper() ? 5 : 4) + (topLevel && selMode ? 1 : 0);
  const groupHead = v => { const g = grp[v.file_hash]; if (!g || g[0] !== v) return '';
    return `<tr class="bg-amber-50/70 border-b border-amber-200"><td colspan="${cols}" class="px-3 py-2 text-xs font-semibold text-amber-900"><span class="material-symbols-outlined !text-sm align-middle mr-1">content_copy</span>Same file · ${g.length} copies · original: “${esc(v.title)}”</td></tr>`; };
  const role_ = v => { const g = grp[v.file_hash]; if (!g) return ''; const i = g.indexOf(v);
    return i === 0 ? '<span class="inline-block text-[10px] font-bold uppercase bg-green-100 text-green-800 px-1.5 py-0.5 rounded mr-1">Original</span>' : `<span class="inline-block text-[10px] font-bold uppercase bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded mr-1">Variant ${i}</span>`; };
  $('#vempty').classList.toggle('hidden', list.length > 0);
  $('#vrows').innerHTML = list.map(v => groupHead(v) + `<tr data-vrow="${v.id}" class="${grp[v.file_hash] && grp[v.file_hash][0] !== v ? 'dupvar ' : ''}border-b border-outline-variant/30 last:border-0 align-top ${vsel.has(v.id) ? 'bg-primary-fixed/40' : ''}">
    ${topLevel && selMode ? `<td class="p-3 w-10 vselcell"><input type="checkbox" data-sel="${v.id}" ${vsel.has(v.id) ? 'checked' : ''} aria-label="Select ${esc(v.title)}" class="rounded text-primary focus:ring-primary mt-1"></td>` : ''}
    <td class="p-3"><div class="flex items-center gap-3"><button data-play="${v.id}" class="relative w-24 aspect-video rounded-md bg-surface-container overflow-hidden shrink-0" aria-label="Preview">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" loading="lazy" class="w-full h-full object-cover" alt="">` : ''}<span class="material-symbols-outlined absolute inset-0 m-auto h-fit w-fit text-white drop-shadow !text-xl">play_circle</span></button>
      <div class="min-w-0"><p class="font-medium truncate max-w-[240px]">${role_(v)}${esc(v.title)}</p>${copies.has(v.id) && s !== 'dup' ? '<span class="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded mt-0.5"><span class="material-symbols-outlined !text-xs">content_copy</span>Duplicate</span>' : ''}<p class="text-xs text-on-surface-variant">by ${esc(who(v.submitted_by))} · ${new Date(v.created_at).toLocaleDateString()}</p></div></div></td>
    <td class="p-3 whitespace-nowrap">${esc(cname(v.category))}<br><span class="text-xs text-on-surface-variant">${esc(cname(v.subcategory))}</span></td>
    <td class="p-3 whitespace-nowrap text-xs">${esc(v.resolution)} · ${v.fps}fps<br>${dur(v.duration_seconds)} · ${esc(v.orientation)}</td>
    <td class="p-3">${statusChip(v)}</td>
    ${isSuper() ? `<td class="p-3 text-right whitespace-nowrap">
      ${v.status === 'pending' ? `<button data-approve="${v.id}" title="Approve" class="material-symbols-outlined p-1.5 rounded hover:bg-green-50 text-green-700">check_circle</button><button data-reject="${v.id}" title="Reject" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">cancel</button>` : ''}
      ${v.status === 'approved' ? `<button data-pub="${v.id}" title="${v.published ? 'Move to draft (hide from site)' : 'Publish on site'}" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">${v.published ? 'visibility_off' : 'visibility'}</button>` : ''}
      <button data-edit="${v.id}" title="Edit" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container">edit</button>
      <button data-del="${v.id}" title="Delete" class="material-symbols-outlined p-1.5 rounded hover:bg-red-50 text-error">delete</button>
</td>` : ''}</tr>`).join('');
  $('#vActTh').classList.toggle('hidden', !isSuper());
  shownIds = list.map(v => v.id); paintBulk();
}
// ---------------- BULK ACTIONS (owner only): select many videos → approve / make live / draft / delete ----------------
const vsel = new Set(); let shownIds = [], lastPick = null, bulkBusy = false;
function paintBulk() {
  $('#selMode').classList.toggle('hidden', !topLevel);
  const on = topLevel && selMode; $('#vSelTh').classList.toggle('hidden', !on);
  $('#selMode').setAttribute('aria-pressed', String(on)); $('#selMode .lbl').textContent = on ? 'Cancel' : 'Select';
  $('#selMode').classList.toggle('bg-on-surface', on); $('#selMode').classList.toggle('text-white', on);
  if (!on) { $('#vbulk').classList.add('hidden'); return; }
  for (const id of [...vsel]) if (!videos.some(v => v.id === id)) vsel.delete(id);          // gone after a refresh
  const n = vsel.size, shownSel = shownIds.filter(id => vsel.has(id)).length, all = $('#vSelAll');
  all.checked = shownIds.length > 0 && shownSel === shownIds.length; all.indeterminate = shownSel > 0 && shownSel < shownIds.length;
  $('#vbulk').classList.remove('hidden');
  $('#vbCount').textContent = n ? `${n} selected` : 'Tick videos to select them';
  const hidden = n - shownSel;
  $('#vbAll').textContent = shownSel < shownIds.length ? `Select all ${shownIds.length} shown` : hidden ? `${hidden} selected outside this filter` : '';
  $('#vbAll').dataset.mode = shownSel < shownIds.length ? 'all' : '';
  $$('#vbulk [data-bulk]').forEach(b => b.disabled = bulkBusy || (!n && b.dataset.bulk !== 'clear'));
}
let selMode = false;
$('#selMode').onclick = () => { selMode = !selMode; vsel.clear(); lastPick = null; renderVideos(); };
$('#vSelAll').onchange = e => { shownIds.forEach(id => e.target.checked ? vsel.add(id) : vsel.delete(id)); renderVideos(); };
$('#vbAll').onclick = () => { if ($('#vbAll').dataset.mode === 'all') { shownIds.forEach(id => vsel.add(id)); renderVideos(); } };
$('#vrows').addEventListener('click', e => {
  const cb = e.target.closest('input[data-sel]'); if (!cb) return; const id = cb.dataset.sel;
  if (e.shiftKey && lastPick && shownIds.includes(lastPick)) {                                 // shift-click: select a range
    const [a, z] = [shownIds.indexOf(lastPick), shownIds.indexOf(id)].sort((x, y) => x - y);
    shownIds.slice(a, z + 1).forEach(x => cb.checked ? vsel.add(x) : vsel.delete(x));
  } else cb.checked ? vsel.add(id) : vsel.delete(id);
  lastPick = id; renderVideos();
});
$('#vbulk').onclick = async e => {
  const b = e.target.closest('[data-bulk]'); if (!b || bulkBusy) return; const kind = b.dataset.bulk;
  if (kind === 'clear') { vsel.clear(); selMode = false; return renderVideos(); }
  const sel = videos.filter(v => vsel.has(v.id));
  const target = { approve: sel.filter(v => v.status === 'pending'), live: sel.filter(v => v.status === 'approved' && !v.published), draft: sel.filter(v => v.status === 'approved' && v.published), delete: sel }[kind];
  const label = { approve: 'approve', live: 'make live', draft: 'move to draft', delete: 'delete' }[kind];
  const skip = sel.length - target.length;
  if (!target.length) return toast(`Nothing to ${label} — ${{ approve: 'none of the selected videos are pending', live: 'none are approved drafts', draft: 'none are live' }[kind]}.`, 1);
  const nm = x => `${x} video${x === 1 ? '' : 's'}`;
  if (kind === 'delete') {
    const live = target.filter(isLive).length;
    if (!await ask({ title: `Delete ${nm(target.length)}?`, tone: 'danger', ok: `Delete ${nm(target.length)}`,
      message: `Their files are removed too. This can't be undone.${live ? `\n${live} of them ${live === 1 ? 'is' : 'are'} live on the website.` : ''}`,
      details: target.map(v => v.title), typeWord: target.length >= 10 ? 'DELETE' : null })) return;
  } else {
    const t = { approve: ['Approve', 'check_circle', 'They go live on the website.'], live: ['Make live', 'visibility', 'They become visible on the website.'], draft: ['Move to draft', 'visibility_off', 'They are hidden from the website.'] }[kind];
    if (!await ask({ title: `${t[0]} ${nm(target.length)}?`, icon: t[1], ok: t[0], message: t[2] + (skip ? `\n${nm(skip)} in your selection ${skip === 1 ? "doesn't" : "don't"} apply and will be left as ${skip === 1 ? 'it is' : 'they are'}.` : ''), details: target.map(v => v.title) })) return;
  }
  bulkBusy = true; paintBulk(); const ids = target.map(v => v.id); let done = 0; const fails = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100); $('#vbCount').textContent = `Working… ${done}/${ids.length}`;
    const q = kind === 'delete' ? sb.from('videos').delete() : sb.from('videos').update(kind === 'approve' ? { status: 'approved', published: true, reviewed_by: me.id, review_note: null } : { published: kind === 'live' });
    const { data, error } = await q.in('id', chunk).select('id');
    if (error) fails.push(error.message); else { done += (data || []).length; (data || []).forEach(r => vsel.delete(r.id)); if ((data || []).length < chunk.length) fails.push(`${chunk.length - data.length} not allowed`); }
  }
  bulkBusy = false;
  if (kind === 'delete' && done) cleanStorage();                                                  // files of deleted videos are queued by the database
  const past = { approve: 'approved', live: 'made live', draft: 'moved to draft', delete: 'deleted' }[kind];
  toast(fails.length ? `${done} ${past}; ${ids.length - done} failed — ${explainError(new Error(fails[0]), 'Some').replace(/^Some failed: /, '')}` : `${done} video${done === 1 ? '' : 's'} ${past}${skip ? ` · ${skip} skipped` : ''}`, fails.length > 0);
  await loadAll();
};
['#vq', '#vcat', '#vstat'].forEach(s => $(s).addEventListener('input', renderVideos));
$('#vrows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset; const v = videos.find(x => x.id === (d.edit || d.del || d.pub || d.approve || d.reject || d.play));
  if (d.play) return preview(v);
  if (!isSuper()) return;
  if (d.edit) return openVideo(v);
  if (d.approve) return reviewVideo(v, true);
  if (d.reject) return reviewVideo(v, false);
  if (d.pub) { const { error } = await sb.from('videos').update({ published: !v.published }).eq('id', v.id); if (error) return toast(error.message, 1); toast(v.published ? 'Moved to Draft — hidden from website' : 'Now live on website'); return loadAll(); }
  if (d.del) {
    if (!await ask({ title: 'Delete this video?', message: `“${v.title}” and its files will be removed${isLive(v) ? ' — it is live on the website' : ''}. This can't be undone.`, ok: 'Delete', tone: 'danger' })) return;
    const paths = [v.video_url, v.thumbnail_url].map(storagePath).filter(Boolean); if (paths.length) await sb.storage.from('videos').remove(paths);
    const { error } = await sb.from('videos').delete().eq('id', v.id); if (error) return toast(error.message, 1); toast('Deleted'); cleanStorage(); return loadAll();
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
// ---- In-page confirmation box (replaces the browser's plain "site says" pop-ups) ----
// ask({ title, message, ok, cancel, tone: 'danger'|'primary'|'warning', icon, typeWord, details }) → Promise<boolean>
function ask(o) {
  return new Promise(res => {
    const tone = o.tone || 'primary', col = { danger: ['bg-red-100 text-red-700', 'bg-red-600 hover:bg-red-700 text-white'], warning: ['bg-amber-100 text-amber-800', 'bg-primary hover:brightness-95 text-on-primary'], primary: ['bg-primary-fixed text-primary', 'bg-primary hover:brightness-95 text-on-primary'] }[tone];
    const icon = o.icon || { danger: 'delete', warning: 'warning', primary: 'help' }[tone];
    const w = document.createElement('div'); w.className = 'fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4 askbox'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
    w.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 login-card">
      <div class="flex gap-4"><span class="w-11 h-11 shrink-0 rounded-full grid place-items-center ${col[0]}"><span class="material-symbols-outlined">${icon}</span></span>
      <div class="min-w-0 flex-1"><h2 class="text-lg font-bold" id="askT">${esc(o.title || 'Are you sure?')}</h2>${o.message ? `<p class="text-sm text-on-surface-variant mt-1 whitespace-pre-line">${esc(o.message)}</p>` : ''}
      ${o.details?.length ? `<ul class="mt-3 max-h-40 overflow-y-auto text-sm bg-surface-container-low rounded-lg px-3 py-2 space-y-1">${o.details.slice(0, 50).map(d => `<li class="truncate">• ${esc(d)}</li>`).join('')}${o.details.length > 50 ? `<li class="text-on-surface-variant">…and ${o.details.length - 50} more</li>` : ''}</ul>` : ''}
      ${o.typeWord ? `<label class="block text-sm mt-4">Type <b>${esc(o.typeWord)}</b> to confirm<input data-type class="w-full mt-1 rounded-lg border-outline-variant focus:ring-red-500 focus:border-red-500" autocomplete="off" spellcheck="false"></label>` : ''}</div></div>
      <div class="flex justify-end gap-2 mt-6"><button data-no class="px-4 py-2 rounded-lg font-semibold border border-outline-variant hover:bg-surface-container">${esc(o.cancel || 'Cancel')}</button><button data-yes class="px-4 py-2 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${col[1]}">${esc(o.ok || 'OK')}</button></div></div>`;
    document.body.appendChild(w);
    const yes = w.querySelector('[data-yes]'), no = w.querySelector('[data-no]'), inp = w.querySelector('[data-type]');
    const done = v => { w.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } else if (e.key === 'Enter' && !yes.disabled && document.activeElement !== no) { e.preventDefault(); done(true); } };
    if (inp) { yes.disabled = true; inp.oninput = () => yes.disabled = inp.value.trim().toUpperCase() !== o.typeWord.toUpperCase(); }
    yes.onclick = () => done(true); no.onclick = () => done(false); w.onclick = e => { if (e.target === w) done(false); };
    document.addEventListener('keydown', key, true);
    setTimeout(() => (inp || (tone === 'danger' ? no : yes)).focus(), 30);
  });
}
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
$('#vform').category.onchange = () => { fillSubs(); };

let aiFrame = null, aiSeq = 0, lastAi = null, lastAiTitle = null, editing = null, thumbBlob = null, submitMode = 'submit', fileHash = null, dupState = 'ok', hashing = null, newBlobUrl = null;
// Turn a failed function call into a readable reason
async function aiReason(res) {
  const e = res?.error, d = res?.data; if (d?.error) return d.error;
  let msg = e?.message || String(e || '');
  try { const j = await e?.context?.json?.(); if (j?.error) msg = j.error; else if (j?.message) msg = j.message; } catch { try { const t = await e?.context?.text?.(); if (t) msg = t.slice(0, 160); } catch { } }
  const st = e?.context?.status;
  if (st === 404 || /not found|FunctionsRelayError/i.test(msg)) return 'function "ai-describe" is not deployed (check the name in Supabase → Edge Functions)';
  if (/Failed to send a request|FunctionsFetchError|Failed to fetch/i.test(msg)) return 'could not reach the ai-describe function (not deployed, or blocked)';
  if (st === 401) return 'not signed in / session expired — log in again';
  return msg.replace(/^Edge Function returned a non-2xx status code$/, `server error ${st || ''}`).slice(0, 200);
}
// ---- Unique titles: the FILE decides duplicates; the TITLE just has to be unique ----
let titleSeq = 0, titleT = null;
function sameFileOriginal() { return fileHash && videos.filter(v => v.file_hash === fileHash && v.id !== editing?.id).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]; }
async function checkTitle() {
  const f = $('#vform'), el = $('#titleHint'), t = f.title.value.trim(), my = ++titleSeq;
  const hide = () => { el.classList.add('hidden'); el.textContent = ''; };
  if (!t) return hide();
  const orig = f.vfile.files[0] && sameFileOriginal();
  if (orig) { el.className = 'mt-1 text-xs text-amber-800'; el.textContent = `Same video file as “${orig.title}” — it will be saved as a Variant of it.`; return; }
  if (editing && t === editing.title) return hide();
  const { data, error } = await sb.rpc('unique_video_title', { t, except_id: editing?.id || null });
  if (my !== titleSeq) return;
  if (error || !data || data === t) return hide();
  el.className = 'mt-1 text-xs text-amber-800'; el.innerHTML = `<span class="material-symbols-outlined !text-sm align-[-3px]">warning</span> Title already used by another video — it will be saved as “<b>${esc(data)}</b>”.`;
}
const queueTitle = () => { clearTimeout(titleT); titleT = setTimeout(checkTitle, 350); };
// ---- AI suggestions (description + tags) via the ai-describe server function (Groq) ----
async function aiSuggest(force) {
  const f = $('#vform'), stat = $('#aiStat'), btn = $('#aiBtn');
  const untouched = lastAi && f.description.value === lastAi.d && f.tags.value === lastAi.t;   // still exactly what AI wrote
  if (!force && !untouched && (f.description.value.trim() || f.tags.value.trim())) return;       // never overwrite what the user typed
  const title = f.title.value.trim(); if (!title) { stat.textContent = force ? 'Add a title first' : ''; return; }
  if (!force && title === lastAiTitle && untouched) return;                 // already done for this title
  const my = ++aiSeq; btn.disabled = true; stat.innerHTML = '<span class="inline-block w-3 h-3 mr-1 align-[-1px] rounded-full border-2 border-primary/30 border-t-primary animate-spin"></span>Writing description & tags…';
  const body = { title };
  let res, why = '';
  for (let attempt = 0; attempt < 2; attempt++) {                       // one automatic retry
    try { res = await sb.functions.invoke('ai-describe', { body }); } catch (e) { res = { error: e }; }
    if (!res?.error && res?.data && !res.data.error) break;
    why = await aiReason(res); if (/not deployed|GROQ_API_KEY|Invalid API Key|Not allowed/i.test(why)) break;
    await new Promise(r => setTimeout(r, 1200));
  }
  if (my !== aiSeq) return; btn.disabled = false;
  const d = res?.data; if (res?.error || !d || d.error) { stat.innerHTML = `<span class="text-error">AI unavailable:</span> ${esc(why || 'unknown error')}`; stat.title = why; console.warn('[ai-describe]', why, res); return; }
  const ow = force || (lastAi && f.description.value === lastAi.d && f.tags.value === lastAi.t);
  if (ow || !f.description.value.trim()) f.description.value = d.description || f.description.value;
  if (ow || !f.tags.value.trim()) f.tags.value = (d.tags || []).join(', ');
  lastAi = { d: f.description.value, t: f.tags.value }; lastAiTitle = title;
  stat.textContent = '✓ Suggested — edit if needed'; [f.description, f.tags].forEach(el => { el.classList.add('ring-2', 'ring-primary/40'); setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40'), 1500); });
}
$('#aiBtn').onclick = () => aiSuggest(true);
// When the title is changed by hand, refresh the AI text (only if the user hasn't edited it)
$('#vform').title.addEventListener('input', queueTitle);
$('#vform').title.addEventListener('change', () => { if ($('#vform').title.value.trim() !== lastAiTitle) aiSuggest(false); });
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
const stLabel = v => ({ pending: ['Pending', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'], approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Draft', 'bg-surface-container text-on-surface-variant'] }[v.status] || ['', '']);
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
function clearFile() { const f = $('#vform'); f.vfile.value = ''; setTimeout(checkTitle); aiFrame = null; fileHash = null; dupState = 'ok'; thumbBlob = null; hashing = null; ['duration_seconds', 'resolution', 'fps', 'orientation'].forEach(k => f[k].value = editing?.[k] ?? '');
  if (editing?.video_url) showPicked(editing.video_url, 'Current video', `${editing.resolution} · ${dur(editing.duration_seconds)}`); else showPicked(null);}
const closeDup = () => { const dv = $('#dupvid'); dv.pause(); dv.removeAttribute('src'); $('#dupmodal').classList.add('hidden'); };
$('#dupCancel').onclick = () => { closeDup(); clearFile(); };
$('#dupGo').onclick = () => { closeDup(); dupState = 'ok'; toast('OK — it will be saved as a new variant');};
// Drag & drop onto the file box
(() => { const z = $('#vdrop'), inp = $('#vform').vfile, on = x => { z.classList.toggle('border-primary', x); z.classList.toggle('bg-primary-fixed/40', x); };
  ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); on(true); }));
  ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); on(false); }));
  z.addEventListener('drop', e => { const file = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('video/')); if (!file) return toast('Please drop a video file', 1);
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }); })();
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
// Files left behind by removed videos (e.g. the old "Both" category) — deleted once by a superadmin session
async function cleanStorage() {
  const { data, error } = await sb.from('storage_cleanup').select('path').limit(200);
  if (error || !data?.length) return;
  const all = data.map(r => r.path).filter(Boolean), b2 = all.filter(isB2), sup = all.filter(p => !isB2(p));
  if (sup.length) { const { error: e2 } = await sb.storage.from('videos').remove(sup); if (e2) console.warn('cleanup', e2.message); else await sb.from('storage_cleanup').delete().in('path', sup); }
  if (b2.length) { try { await sb.functions.invoke('b2-sign', { body: { action: 'delete', paths: b2 } }); } catch (e) { console.warn('b2 cleanup', e); } }   // server removes them from the queue
}
async function backfillHashes() {
  if (!isSuper() || backfilling) return; backfilling = true;
  const todo = videos.filter(v => !v.file_hash && v.video_url && (storagePath(v.video_url) || v._b2)).slice(0, 25); let n = 0;
  for (const v of todo) { try { const h = await remoteFingerprint(v.video_url); const { error } = await sb.from('videos').update({ file_hash: h }).eq('id', v.id); if (!error) n++; } catch { } }
  backfilling = false; if (n) { toast(`Checked ${n} older video(s) for duplicates`); loadAll(); }
}
const BTN = (mode, label, cls) => `<button ${mode ? `data-mode="${mode}"` : 'type="button" data-close'} class="px-4 py-2.5 rounded-lg ${cls}">${label}</button>`;
function openVideo(v) {
  if (v && !isSuper()) return;
  editing = v || null; titleSeq++; $('#titleHint').classList.add('hidden'); thumbBlob = null; aiFrame = null; lastAi = null; lastAiTitle = null; aiSeq++; $('#aiStat').textContent = ''; fileHash = null; dupState = 'ok'; hashing = null; const f = $('#vform'); f.reset(); $('#vtitle').textContent = v ? 'Edit video' : 'Add video';
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
  fillSubs(v?.subcategory); $('#vmodal').classList.remove('hidden'); f.title.focus();
}
$('#newVideo').onclick = () => openVideo();
$$('#vmodal [data-close], #cmodal [data-close]').forEach(b => b.onclick = () => b.closest('.fixed').classList.add('hidden'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') ['#vmodal', '#cmodal', '#mdrawer'].forEach(s => $(s)?.classList.add('hidden')); });

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
  if (!useB2() && file.size > 50 * 1024 * 1024) toast('Warning: file is over 50 MB — Supabase free plan may reject it', 1);
  if (useB2() && file.size > 500 * 1024 * 1024) toast('Warning: file is over 500 MB — it will be refused', 1);
  newBlobUrl = URL.createObjectURL(file); showPicked(newBlobUrl, file.name, 'Analysing…');
  fileHash = null; dupState = 'checking'; hashing = fingerprint(file).then(async h => { fileHash = h; await checkDuplicate(h); checkTitle(); }).catch(() => { dupState = 'ok'; });
  let weakName = false; if (!f.title.value) { const ct = cleanTitle(file.name); f.title.value = ct.title; weakName = ct.weak; }
  queueTitle();
  aiSuggest(false);                                                         // description + tags from the title
  if (weakName) { $('#aiStat').textContent = 'File name has no words — type a title and AI will write the description.'; f.title.focus(); }
  vid.onloadedmetadata = async () => {
    f.duration_seconds.value = Math.round(vid.duration); const w = vid.videoWidth, h = vid.videoHeight, big = Math.max(w, h);
    f.resolution.value = big >= 3000 ? '4K' : big >= 1800 ? '1080p' : '720p'; f.orientation.value = w > h ? 'horizontal' : w < h ? 'vertical' : 'square';
    f.fps.value = await detectFps(vid);
    vid.onseeked = () => {
      const cv = document.createElement('canvas'); const sc = Math.min(1, 1280 / vid.videoWidth); cv.width = vid.videoWidth * sc; cv.height = vid.videoHeight * sc;
      cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height); cv.toBlob(b => { thumbBlob = b; }, 'image/jpeg', 0.82); vid.onseeked = null;
    };
    vid.currentTime = Math.min(1, vid.duration / 3);
    $('#vmeta').textContent = `${f.resolution.value} · ${dur(+f.duration_seconds.value)}`;
  };
};

// onProgress(fraction 0..1) is optional; without it the single-upload form's progress bar is used
async function upload(fileOrBlob, name, label, onProgress) {
  if (!onProgress) $('#ptext').textContent = 'Uploading ' + label + '…';
  if (label === 'video' && useB2()) return uploadB2(fileOrBlob, name, onProgress);
  const path = `${me.id.slice(0, 8)}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const { error } = await sb.storage.from('videos').upload(path, fileOrBlob, { upsert: false, contentType: fileOrBlob.type || undefined, cacheControl: '31536000' });
  if (error) throw new Error(label + ': ' + error.message);
  onProgress?.(1);
  return sb.storage.from('videos').getPublicUrl(path).data.publicUrl;
}
// Browser → B2 directly (the server only signs a 15-minute upload link), with a real progress bar
async function uploadB2(file, name, onProgress) {
  const { data, error } = await sb.functions.invoke('b2-sign', { body: { action: 'upload', name, size: file.size } });
  if (error || !data?.url) throw new Error('video: ' + (data?.error || await fnError(error) || 'could not start upload'));
  await new Promise((ok, bad) => {
    const x = new XMLHttpRequest(); x.open('PUT', data.url); x.setRequestHeader('Content-Type', data.contentType || file.type || 'application/octet-stream');
    x.upload.onprogress = e => { if (!e.lengthComputable) return; const pc = e.loaded / e.total;
      if (onProgress) onProgress(pc); else { $('#bar').style.width = (10 + pc * 60).toFixed(0) + '%'; $('#ptext').textContent = `Uploading video… ${Math.round(pc * 100)}%`; } };
    x.onload = () => x.status >= 200 && x.status < 300 ? ok() : bad(new Error(x.status === 413 ? 'Payload too large (413)' : x.status >= 500 ? `storage server error (${x.status})` : `storage refused the upload (${x.status})`));
    x.onerror = () => bad(new Error('network: upload failed — no connection to storage (or blocked by CORS)'));
    x.ontimeout = () => bad(new Error('network: upload timed out'));
    x.send(file);
  });
  return data.path;
}
async function fnError(e) { try { const b = await e?.context?.json?.(); return b?.error || e?.message; } catch { return e?.message; } }
$('#vform').onsubmit = async e => {
  e.preventDefault(); const f = e.target, mode = isSuper() ? (e.submitter?.dataset.mode || submitMode) : 'submit';
  const btns = $$('#vbtns button'); btns.forEach(b => b.disabled = true); $('#progress').classList.remove('hidden'); $('#bar').style.width = '10%'; $('#ptext').classList.remove('text-error');
  let stage = 'Checking the form';
  try {
    const vf = f.vfile.files[0];
    if (!editing && !vf) throw new Error('Choose a video file to upload');
    if (!f.category.value) throw new Error('Please select a category');
    if (!f.subcategory.value) throw new Error('Please select a subcategory');
    if (vf && hashing) { $('#ptext').textContent = 'Checking for duplicates…'; await hashing; }
    if (vf && dupState === 'ask') { $('#dupmodal').classList.remove('hidden'); throw new Error('Confirm the duplicate warning first'); }
    if (vf && !f.duration_seconds.value) throw new Error('Still analysing the video — try again in a second');
    const row = {
      title: f.title.value.trim(), description: f.description.value.trim(), category: f.category.value, subcategory: f.subcategory.value,
      duration_seconds: +f.duration_seconds.value || 0, resolution: f.resolution.value || '1080p', fps: +f.fps.value || 30, orientation: f.orientation.value || 'horizontal',
      tags: [...new Set(f.tags.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]
    };
    if (isSuper()) { row.status = 'approved'; row.published = mode === 'approve'; } else { row.published = true; }
    if (vf) { row.file_hash = fileHash || await fingerprint(vf).catch(() => null); stage = 'Uploading the video'; row.video_url = await upload(vf, vf.name, 'video'); $('#bar').style.width = '75%'; stage = 'Uploading the thumbnail'; if (thumbBlob) row.thumbnail_url = await upload(thumbBlob, 'thumb.jpg', 'thumbnail'); }
    $('#bar').style.width = '90%'; $('#ptext').textContent = 'Saving details…'; stage = 'Saving the video details';
    const old = editing ? { v: editing.video_url, t: editing.thumbnail_url } : {};
    if (editing && row.status === 'approved') { row.reviewed_by = me.id; row.review_note = null; }
    const { data: saved, error } = editing ? await sb.from('videos').update(row).eq('id', editing.id).select('title').maybeSingle() : await sb.from('videos').insert(row).select('title').maybeSingle();
    if (error) throw error;
    const renamed = saved && saved.title !== row.title ? (/Variant \d+$/.test(saved.title) ? `Same video was uploaded before — saved as “${saved.title}”. ` : `Title already used — saved as “${saved.title}”. `) : '';
    if (vf) { const stale = [old.v, old.t].map(storagePath).filter(Boolean); if (stale.length) await sb.storage.from('videos').remove(stale); if (isSuper()) cleanStorage(); }
    toast(renamed + (!isSuper() ? 'Submitted — waiting for superadmin approval' : mode === 'approve' ? 'Approved — live on website' : 'Saved as draft (hidden from website)'));
    $('#bar').style.width = '100%'; $('#vmodal').classList.add('hidden'); loadAll();
  } catch (err) { const why = stage === 'Checking the form' ? err.message : explainError(err, stage); toast(why, 1); $('#ptext').textContent = why; $('#ptext').classList.add('text-error'); $('#bar').style.width = '0%'; }
  btns.forEach(b => b.disabled = false);
};

// ---------------- UPLOAD HELPERS: clean titles, category guessing, readable errors ----------------
// Camera / stock-site file names ("8132021-hd_1920_1080_25fps") carry no meaning. Strip the technical bits;
// if no real words are left the title is "weak": the AI can't describe it and a person must type a title.
const NOISE = /^(\d+|\d+x\d+|\d{3,4}p|\d+fps|fps|hd|fhd|uhd|4k|8k|sd|hq|lq|h26[45]|x26[45]|hevc|avc|prores|mp4|mov|webm|mkv|m4v|v\d+|final|edit(ed)?|copy|export(ed)?|clip|video|footage|stock|pexels|pixabay|videvo|shutterstock|istock|img|mvi|dji|gopr\d*|dsc|vid|raw|cam|camera|untitled|new|file|temp|tmp)$/i;
function cleanTitle(fileName) {
  const words = String(fileName || '').replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_\-.()[\]{}+,]+/).filter(Boolean);
  const keep = words.filter(w => /^\d{1,3}$/.test(w) || (!NOISE.test(w) && /[a-z]{2,}/i.test(w) && !/^[a-z]?\d+[a-z]?$/i.test(w)));   // short numbers ("Scene 2") stay
  const real = keep.filter(w => /[aeiou]/i.test(w) && w.replace(/\d/g, '').length >= 3);
  const title = keep.join(' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()).slice(0, 120);
  return real.length ? { title, weak: false } : { title: '', weak: true };
}
// Local fallback when the AI can't choose: score each subcategory by matching words (+ a few synonyms per main category)
const CAT_HINTS = { lawyers: 'law legal lawyer lawyers attorney attorneys court courtroom judge gavel justice contract contracts signing notary firm advocate verdict trial jury scales document documents legal-office', doctors: 'doctor doctors medical medicine hospital clinic nurse nurses patient patients surgery surgeon health healthcare stethoscope pharmacy lab laboratory xray x-ray mri scan dentist therapy care' };
function guessCategory(text, onlyCat) {
  const w = new Set(String(text || '').toLowerCase().split(/[^a-z0-9-]+/).filter(x => x.length > 2)); if (!w.size) return null;
  const hit = str => String(str || '').toLowerCase().split(/[^a-z0-9-]+/).filter(x => x.length > 2 && w.has(x)).length;
  let best = null;
  for (const m of mains()) { if (onlyCat && m.slug !== onlyCat) continue;
    const base = hit(m.name + ' ' + m.slug + ' ' + (CAT_HINTS[m.slug] || ''));
    for (const sb_ of subsOf(m.slug)) { const sc = base + 2 * hit(sb_.name + ' ' + sb_.slug); if (sc > 0 && (!best || sc > best.sc)) best = { cat: m.slug, sub: sb_.slug, sc }; }
    if (base > 0 && (!best || base > best.sc)) best = { cat: m.slug, sub: subsOf(m.slug)[0]?.slug || '', sc: base };
  }
  return best && best.sub ? best : null;
}
const catTree = () => mains().map(m => ({ slug: m.slug, name: m.name, subs: subsOf(m.slug).map(x => ({ slug: x.slug, name: x.name })) }));
// Turn any error into a sentence a person can act on, saying WHICH step failed
function explainError(err, stage) {
  const m = String(err?.message || err || 'Unknown error'), has = r => r.test(m);
  const why = has(/B2 is not set up/) ? m
    : has(/can't read this video/) ? "the browser can't read this video (unusual format or codec). Convert it to MP4 (H.264) and try again."
    : has(/Only video files|Only video/) ? 'only MP4, MOV, WebM, M4V or MKV files can be uploaded.'
    : has(/over \d+ MB|too large|Payload too large|maximum allowed size|\(413\)/i) ? `the file is too large (max ${useB2() ? 500 : 50} MB).`
    : has(/quota|storage.*(full|limit)|exceeded/i) ? 'storage is full. Ask the owner to free space (Dashboard → Clean up unused files) or upgrade the plan.'
    : has(/\(403\)/) ? 'video storage refused the upload (403). The B2 key or CORS settings are wrong — ask the owner to check the Supabase secrets.'
    : has(/\(5\d\d\)/) ? 'the storage server had a problem. Wait a minute and retry.'
    : has(/JWT|expired|not signed in|401|invalid claim/i) ? 'your login has expired. Log in again, then retry.'
    : has(/row-level security|permission denied|Not allowed|violates row/i) ? "you don't have permission to do this."
    : has(/For Both|category/i) && has(/only|allowed/) ? m
    : has(/Failed to fetch|NetworkError|network|connection|Load failed|timed? ?out/i) ? 'no connection to the server. Check your internet and retry.'
    : has(/duplicate key|already exists/i) ? 'a video with the same file already exists.'
    : has(/check constraint|invalid input/i) ? 'some details were not accepted (' + m.slice(0, 120) + ').'
    : m.replace(/^video: |^thumbnail: /, '');
  return `${stage} failed: ${/^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why}`;
}

// ---------------- BULK UPLOAD ----------------
// Many files (or a whole folder) at once. Per file: read metadata + thumbnail → fingerprint (skip/variant duplicates)
// → AI description & tags from the title → upload video + thumbnail → save. Two files at a time; errors don't stop the rest.
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv)$/i;
let bq = [], bRunning = false, bStop = false;
const bRow = it => { const col = { waiting: 'text-on-surface-variant', done: 'text-green-700', skipped: 'text-on-surface-variant', failed: 'text-error' }[it.state] || 'text-primary';
  const editable = !bRunning && (it.state === 'waiting' || it.state === 'failed'), weak = !String(it.title || '').trim();
  return `<li data-b="${it.id}" class="px-3 py-2.5 flex items-start gap-3 text-sm ${weak && editable ? 'bg-amber-50' : ''}">
    <span class="material-symbols-outlined !text-xl mt-1 ${col}">${{ done: 'check_circle', failed: 'error', skipped: 'block', waiting: 'movie' }[it.state] || 'progress_activity'}</span>
    <div class="flex-1 min-w-0">${editable ? `<input data-bt="${it.id}" value="${esc(it.title || '')}" placeholder="Type a title — the file name has no words" aria-label="Title for ${esc(it.file.name)}" class="w-full rounded-md border-outline-variant text-sm py-1 px-2 focus:ring-primary ${weak ? 'border-amber-400' : ''}">`
      : `<p class="font-medium truncate">${esc(it.saved || it.title || it.file.name)}</p>`}
      <p class="text-xs mt-0.5 ${it.state === 'failed' ? 'text-error' : col} ${it.state === 'failed' ? '' : 'truncate'}">${esc(it.path || it.file.name)} · ${mb(it.file.size)}${it.cat ? ` · ${esc(cname(it.cat))} › ${esc(cname(it.sub))}` : ''}${it.msg ? ' · ' + esc(it.msg) : weak && editable ? ' · no title: will be saved as draft without AI text' : ''}</p>
      ${it.state === 'working' ? `<div class="h-1 mt-1 rounded-full bg-surface-container overflow-hidden"><div class="h-full bg-primary" style="width:${Math.round((it.pc || 0) * 100)}%"></div></div>` : ''}</div>
    ${!bRunning && it.state === 'waiting' ? `<button data-brm="${it.id}" class="material-symbols-outlined !text-lg text-on-surface-variant hover:text-error mt-1" aria-label="Remove">close</button>` : ''}</li>`; };
function bPaint(one) {
  if (one) { const li = $(`#blist [data-b="${one.id}"]`); if (li) { li.outerHTML = bRow(one); } }
  else $('#blist').innerHTML = bq.map(bRow).join('');
  const n = k => bq.filter(x => x.state === k).length, done = n('done') + n('skipped') + n('failed');
  $('#bsum').textContent = !bq.length ? 'No videos chosen' : bRunning ? `Uploading… ${done} of ${bq.length} finished` :
    done ? `${n('done')} uploaded · ${n('skipped')} skipped · ${n('failed')} failed${n('waiting') ? ` · ${n('waiting')} waiting` : ''}` : `${bq.length} video${bq.length === 1 ? '' : 's'} ready (${mb(bq.reduce((a, x) => a + x.file.size, 0))})${bq.filter(x => !String(x.title || '').trim()).length ? ` · ${bq.filter(x => !String(x.title || '').trim()).length} need a title` : ''}`;
  $('#bbar').classList.toggle('hidden', !bRunning && !done); $('#bbar > div').style.width = (bq.length ? done / bq.length * 100 : 0) + '%';
  $('#bstart').disabled = bRunning || !n('waiting'); $('#bstart').textContent = done && n('waiting') ? 'Upload remaining' : 'Upload';
  const finished = !bRunning && done > 0; $('#bdone').classList.toggle('hidden', !finished); $('#bstart').classList.toggle('hidden', finished && !n('waiting'));
  $('#bstop').classList.toggle('hidden', !bRunning); $('#bretry').classList.toggle('hidden', bRunning || !n('failed'));
  $('#bclear').classList.toggle('hidden', bRunning || !bq.length); $$('#bSetup select, #bSetup input').forEach(x => x.disabled = bRunning || (x.id === 'bsub' && (!$('#bcat').value || $('#bcat').value === 'auto')));
}
function bAdd(files) {
  let skipped = 0; const have = new Set(bq.map(x => x.file.name + '|' + x.file.size));
  for (const f of files) { if (!VIDEO_EXT.test(f.name) && !/^video\//.test(f.type)) { skipped++; continue; } const k = f.name + '|' + f.size; if (have.has(k)) continue; have.add(k);
    const ct = cleanTitle(f.name); bq.push({ id: Math.random().toString(36).slice(2, 9), file: f, path: f.webkitRelativePath || f._path || '', state: 'waiting', title: ct.title, weak: ct.weak }); }
  bq.sort((a, b) => a.state !== 'waiting' || b.state !== 'waiting' ? 0 : (a.path || a.file.name).localeCompare(b.path || b.file.name, undefined, { numeric: true }));
  if (skipped) toast(`${skipped} non-video file(s) ignored`); bPaint();
}
async function entryFiles(entry, path = '') {                                   // drag & drop folders
  if (entry.isFile) return new Promise(r => entry.file(f => { f._path = path + f.name; r([f]); }, () => r([])));
  if (!entry.isDirectory) return [];
  const rd = entry.createReader(), all = []; let batch;
  do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); all.push(...batch); } while (batch.length);
  return (await Promise.all(all.map(e => entryFiles(e, path + entry.name + '/')))).flat();
}
function analyzeFile(file) {                                                    // duration, size class, orientation, fps, thumbnail
  return new Promise((ok, bad) => {
    const vid = document.createElement('video'), url = URL.createObjectURL(file); vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.src = url;
    const fail = () => { URL.revokeObjectURL(url); bad(new Error("can't read this video in the browser")); }; const t = setTimeout(fail, 30000);
    vid.onerror = () => { clearTimeout(t); fail(); };
    vid.onloadedmetadata = async () => {
      const w = vid.videoWidth, h = vid.videoHeight, big = Math.max(w, h), meta = { duration_seconds: Math.round(vid.duration) || 0, resolution: big >= 3000 ? '4K' : big >= 1800 ? '1080p' : '720p', orientation: w > h ? 'horizontal' : w < h ? 'vertical' : 'square' };
      meta.fps = await detectFps(vid).catch(() => 30);
      vid.onseeked = () => { const cv = document.createElement('canvas'), sc = Math.min(1, 1280 / (w || 1280)); cv.width = (w || 1280) * sc; cv.height = (h || 720) * sc;
        try { cv.getContext('2d').drawImage(vid, 0, 0, cv.width, cv.height); } catch { }
        cv.toBlob(b => { clearTimeout(t); URL.revokeObjectURL(url); ok({ ...meta, thumb: b }); }, 'image/jpeg', 0.82); };
      vid.pause(); vid.currentTime = Math.min(1, (vid.duration || 3) / 3);
    };
  });
}
async function aiFor(title, withCats) {                                         // same server function as the single form
  const body = withCats ? { title, categories: catTree() } : { title };
  for (let i = 0; i < 2; i++) { try { const { data, error } = await sb.functions.invoke('ai-describe', { body }); if (!error && data && !data.error) return data; } catch { } }
  return null;
}
async function bOne(it, opts, seen) {
  const set = (msg, pc) => { it.msg = msg; if (pc !== undefined) it.pc = pc; bPaint(it); };
  let stage = 'Reading the video';
  try {
    it.state = 'working'; it.cat = it.sub = ''; it.catGuess = false; set('Reading video…', 0.02);
    const ext = (it.file.name.match(/\.(\w+)$/) || [])[1] || '';
    if (!VIDEO_EXT.test(it.file.name)) throw new Error(`Only video files — .${ext || '?'} is not supported`);
    const max = (useB2() ? 500 : 50) * 1024 * 1024; if (it.file.size > max) throw new Error(`over ${useB2() ? 500 : 50} MB (this file is ${mb(it.file.size)})`);
    if (!it.file.size) throw new Error("can't read this video — the file is empty");
    const meta = await analyzeFile(it.file);
    stage = 'Checking for duplicates'; set('Checking for duplicates…', 0.05); const hash = await fingerprint(it.file).catch(() => null);
    if (hash) {
      if (seen.has(hash) && opts.skip) { it.state = 'skipped'; return set('same file twice in this batch'); }
      seen.add(hash);
      const { data: hit } = await sb.from('videos').select('id,title').eq('file_hash', hash).limit(1);
      if (hit?.length && opts.skip) { it.state = 'skipped'; return set(`already in library as “${hit[0].title}”`); }
    }
    const typed = String(it.title || '').trim(), title = typed || `Untitled clip ${(it.file.name.match(/\d{4,}/) || [''])[0]}`.trim(), weak = !typed;
    const auto = opts.cat === 'auto';
    stage = 'Writing description & tags'; set(weak ? 'No title — skipping AI text' : auto ? 'Writing description, tags & choosing category…' : 'Writing description & tags…', 0.08);
    const ai = weak ? null : await aiFor(title, auto);
    let cat = opts.cat, sub = opts.sub;
    if (auto) {
      stage = 'Choosing the category';
      const txt = [title, ...(ai?.tags || [])].join(' ');                   // title + tags only (descriptions are too generic to trust)
      if (ai?.category && subsOf(ai.category).length) { cat = ai.category; sub = subsOf(cat).some(x => x.slug === ai.subcategory) ? ai.subcategory : (guessCategory(txt, cat)?.sub || subsOf(cat)[0].slug); }
      else { const g = guessCategory(txt) || (weak ? guessCategory((it.path || '').split('/').slice(0, -1).join(' ')) : null);   // nameless file: try its folder name
        if (g) { cat = g.cat; sub = g.sub; }
        else if (weak) { cat = mains()[0]?.slug; sub = subsOf(cat)[0]?.slug; it.catGuess = true; if (!cat || !sub) throw new Error('NOCAT_WEAK'); }   // draft anyway; category must be checked
        else throw new Error('NOCAT'); }
      it.cat = cat; it.sub = sub;
    }
    stage = 'Uploading the video'; set('Uploading video…', 0.1);
    const video_url = await upload(it.file, it.file.name, 'video', pc => set(`Uploading video… ${Math.round(pc * 100)}%`, 0.1 + pc * 0.8));
    stage = 'Uploading the thumbnail'; set('Uploading thumbnail…', 0.92); const thumbnail_url = meta.thumb ? await upload(meta.thumb, 'thumb.jpg', 'thumbnail', () => { }) : null;
    const row = { title, description: ai?.description || '', tags: ai?.tags || [], category: cat, subcategory: sub, duration_seconds: meta.duration_seconds, resolution: meta.resolution, fps: meta.fps || 30, orientation: meta.orientation, file_hash: hash, video_url, thumbnail_url };
    if (isSuper()) { row.status = 'approved'; row.published = opts.mode === 'approve' && !weak; } else row.published = true;
    stage = 'Saving the video details'; set('Saving…', 0.97);
    const { data: saved, error } = await sb.from('videos').insert(row).select('title').maybeSingle();
    if (error) { if (isSuper()) cleanStorage(); throw new Error(error.message); }
    it.saved = saved?.title || title; it.state = 'done'; it.pc = 1;
    set([saved && saved.title !== title ? (/Variant \d+$/.test(saved.title) ? 'saved as a variant' : 'title was taken — renamed') : '',
      weak ? `no title — saved as DRAFT${it.catGuess ? ' in a placeholder category' : ''}: add a title, category & description in Videos` : ai ? '' : 'AI unavailable — add description later'].filter(Boolean).join(' · ')
      || (isSuper() ? (opts.mode === 'approve' ? 'live' : 'draft') : 'sent for review'));
  } catch (e) {
    it.state = 'failed';
    const m = String(e?.message || e);
    it.msg = m === 'NOCAT' ? "Couldn't choose a category from the title. Pick a category for this batch, or make the title more descriptive, then Retry."
      : m === 'NOCAT_WEAK' ? 'No title, so no category could be chosen. Type a title (or pick a category for the batch), then Retry.'
      : explainError(e, stage);
    bPaint(it);
  }
}
async function bRun() {
  const opts = { cat: $('#bcat').value, sub: $('#bsub').value, mode: $('#bpub').value, skip: $('#bskip').checked };
  if (!opts.cat || (opts.cat !== 'auto' && !opts.sub)) return toast('Choose a category (or Auto) and a subcategory first', 1);
  const nameless = bq.filter(x => x.state === 'waiting' && !String(x.title || '').trim());
  if (nameless.length && !await ask({ title: `${nameless.length} video${nameless.length === 1 ? ' has' : 's have'} no title`, tone: 'warning', icon: 'title',
    message: `Their file names contain no words, so the AI can't describe them.\nIf you continue they are uploaded as DRAFTS (not on the website) without description or tags${opts.cat === 'auto' ? ', and Auto may not find the right category' : ''}. You can fix them later in Videos.`,
    details: nameless.map(x => x.path || x.file.name), ok: 'Upload anyway as drafts', cancel: 'Add titles first' })) { $('#blist input[data-bt]:placeholder-shown')?.focus(); return; }
  bRunning = true; bStop = false; $('#bstop').textContent = 'Stop'; bPaint(); const seen = new Set();
  const next = () => bq.find(x => x.state === 'waiting');
  const worker = async () => { let it; while (!bStop && (it = next())) { it.state = 'working'; await bOne(it, opts, seen); } };
  await Promise.all([worker(), worker()]);
  bRunning = false; bPaint(); loadAll();
  const n = k => bq.filter(x => x.state === k).length;
  toast(`Bulk upload: ${n('done')} uploaded${n('skipped') ? `, ${n('skipped')} skipped` : ''}${n('failed') ? `, ${n('failed')} failed` : ''}${bStop ? ' (stopped)' : ''}`, n('failed') > 0);
}
function openBulk() {
  if (bRunning) return $('#bmodal').classList.remove('hidden');
  bq = []; $('#bcat').innerHTML = '<option value="">Select category</option><option value="auto">✨ Auto — pick for each video</option>' + mains().map(m => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`).join('');
  $('#bsub').innerHTML = '<option value="">Select subcategory</option>'; $('#bpubWrap').classList.toggle('hidden', !isSuper()); $('#bnote').classList.toggle('hidden', isSuper());
  $('#bfiles').value = ''; $('#bfolder').value = ''; bPaint(); $('#bmodal').classList.remove('hidden');
}
$('#bulkVideo').onclick = openBulk;
$('#bcat').onchange = () => { const c = $('#bcat').value; $('#bsub').innerHTML = c === 'auto' ? '<option value="auto">Auto</option>' : '<option value="">Select subcategory</option>' + subsOf(c).map(x => `<option value="${esc(x.slug)}">${esc(x.name)}</option>`).join(''); $('#bautoHint').classList.toggle('hidden', c !== 'auto'); bPaint(); };
$('#blist').addEventListener('input', e => { const id = e.target.dataset.bt; if (!id) return; const it = bq.find(x => x.id === id); if (it) { it.title = e.target.value; it.weak = !e.target.value.trim(); e.target.classList.toggle('border-amber-400', it.weak); const n = bq.filter(x => !String(x.title || '').trim()).length; $('#bsum').textContent = `${bq.length} video${bq.length === 1 ? '' : 's'} ready (${mb(bq.reduce((a, x) => a + x.file.size, 0))})${n ? ` · ${n} need a title` : ''}`; } });
$('#bfiles').onchange = e => { bAdd([...e.target.files]); e.target.value = ''; };
$('#bfolder').onchange = e => { bAdd([...e.target.files]); e.target.value = ''; };
$('#bdrop').ondragover = e => { e.preventDefault(); $('#bdrop').classList.add('border-primary', 'bg-primary-fixed/30'); };
$('#bdrop').ondragleave = () => $('#bdrop').classList.remove('border-primary', 'bg-primary-fixed/30');
$('#bdrop').ondrop = async e => { e.preventDefault(); $('#bdrop').classList.remove('border-primary', 'bg-primary-fixed/30'); if (bRunning) return;
  const items = [...(e.dataTransfer.items || [])].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  bAdd(items.length ? (await Promise.all(items.map(x => entryFiles(x)))).flat() : [...e.dataTransfer.files]); };
$('#blist').onclick = e => { const id = e.target.closest('[data-brm]')?.dataset.brm; if (id) { bq = bq.filter(x => x.id !== id); bPaint(); } };
$('#bclear').onclick = () => { bq = []; bPaint(); };
$('#bstart').onclick = bRun;
$('#bdone').onclick = () => { $('#bmodal').classList.add('hidden'); bq = []; bPaint(); tab('videos'); };
$('#bstop').onclick = () => { bStop = true; $('#bstop').textContent = 'Stopping after current…'; };
$('#bretry').onclick = () => { bq.forEach(x => { if (x.state === 'failed') { x.state = 'waiting'; x.msg = ''; x.pc = 0; } }); bRun(); };
$('#bClose').onclick = async () => { if (bRunning && !await ask({ title: 'Uploads are still running', message: 'Hide this window? The uploads keep going in the background — reopen Bulk upload to see progress.', ok: 'Hide window', cancel: 'Keep watching', icon: 'cloud_upload' })) return; $('#bmodal').classList.add('hidden'); };
window.addEventListener('beforeunload', e => { if (bRunning) { e.preventDefault(); e.returnValue = ''; } });

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
  ${card('checklist', 'Before you upload', `<p>• One clip per upload, max <b>${useB2() ? 500 : 50} MB</b>.</p><p>• Use a descriptive title (what is happening in the clip).</p><p>• Add 3–6 tags people would search for, e.g. <i>court, judge, gavel</i>.</p><p>• Horizontal clips work best on the website.</p>`)}
  ${card('content_copy', 'Duplicates', `<p>If you upload a file that is already in the library you'll see a warning with a preview. Continuing saves it as “Title - Variant N”.</p>`)}
  ${card('category', 'Categories', mains().map(m => `<p><b>${esc(m.name)}</b>: ${subsOf(m.slug).map(x => esc(x.name)).join(', ') || '—'}</p>`).join(''))}
  ${card('insights', 'Your results', `<p>${mine.length} uploaded · <span class="text-green-700">${mine.filter(isLive).length} live</span> · <span class="text-amber-700">${mine.filter(v => v.status === 'pending').length} waiting</span> · <span class="text-red-700">${rej.length} rejected</span></p>${topR.length ? `<p class="pt-1">Most common rejection reasons:</p>${topR.map(([r, n]) => `<p>• ${esc(r)} <span class="text-xs">(${n}×)</span></p>`).join('')}` : ''}`)}
  </div>`;
}

// ---------------- MY REQUESTS (admin) ----------------
function renderMyReq() {
  if (isSuper()) return;
  const mv = videos.filter(v => v.submitted_by === me.id);
  const chip = v => ({ pending: ['Waiting for review', 'bg-amber-100 text-amber-800', 'hourglass_top'], approved: [v.published ? 'Approved · Live' : 'Approved · Draft', 'bg-green-100 text-green-800', 'check_circle'], rejected: ['Rejected', 'bg-red-100 text-red-800', 'block'] }[v.status] || ['Pending', 'bg-amber-100 text-amber-800', 'hourglass_top']);
  $('#myReq').innerHTML = mv.map(v => { const [l, c, i] = chip(v); return `<div class="bg-white rounded-xl border border-outline-variant/40 p-4">
    <div class="flex items-center gap-3"><button data-play="${v.id}" class="w-24 aspect-video rounded bg-surface-container overflow-hidden shrink-0">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : ''}</button>
    <div class="flex-1 min-w-0"><p class="font-medium truncate">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${esc(cname(v.category))} › ${esc(cname(v.subcategory))} · ${new Date(v.created_at).toLocaleString()}</p></div>
    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${c}"><span class="material-symbols-outlined !text-sm">${i}</span>${l}</span></div>
    ${v.status === 'rejected' && v.review_note ? `<div class="mt-3 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-800"><b>Reason:</b> ${esc(v.review_note)}</div>` : ''}</div>`; }).join('')
    || '<div class="text-center py-12 text-on-surface-variant"><span class="material-symbols-outlined !text-5xl">video_library</span><p class="mt-2">You haven\'t uploaded any videos yet.</p></div>';
}
$('#myReq').onclick = async e => { const pl = e.target.closest('[data-play]')?.dataset.play; if (pl) return preview(videos.find(v => v.id === pl)); const id = e.target.closest('[data-rcancel]')?.dataset.rcancel; if (!id || !await ask({ title: 'Cancel this request?', message: 'The superadmin will no longer see it.', ok: 'Cancel request', cancel: 'Keep it', tone: 'danger', icon: 'undo' })) return; const { error } = await sb.from('change_requests').delete().eq('id', id); if (error) return toast(error.message, 1); toast('Cancelled'); loadAll(); };

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
    if (!await ask({ title: 'Delete this category?', message: (subsOf(s).length ? `Its ${subsOf(s).length} subcategories are deleted too.` : 'Videos in it keep their files.') + (isSuper() ? '' : ' This needs a superadmin\'s approval.'), ok: isSuper() ? 'Delete' : 'Request delete', tone: 'danger' })) return;
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
// ---- Owner view: one searchable table of members + invites, inline role change, detail drawer ----
let tq = { q: '', f: 'all', sort: 'active' }, memberDl = {}, memberDlAt = 0;
async function loadMemberDownloads() { if (!topLevel || Date.now() - memberDlAt < 120e3) return; memberDlAt = Date.now();
  const { data } = await sb.rpc('download_stats', { p_days: 30 }); memberDl = {}; (data?.by_member || []).forEach(m => memberDl[m.email] = m.n); if (!$('#t-team').classList.contains('hidden')) renderTeamMaster(); }
function renderTeamMaster() {
  const box = $('#teamFull'); if (!box.dataset.ready) {
    box.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-3"><label class="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-outline-variant rounded-lg px-3"><span class="material-symbols-outlined text-on-surface-variant !text-xl">search</span><input id="tmq" type="search" placeholder="Search by email" class="flex-1 border-0 focus:ring-0 py-2 text-sm"></label>
      <select id="tmf" aria-label="Filter" class="rounded-lg border-outline-variant text-sm"><option value="all">Everyone</option><option value="superadmin">Superadmins</option><option value="admin">Admins</option><option value="invited">Invited / not joined</option><option value="idle">Inactive 30+ days</option></select>
      <select id="tms" aria-label="Sort" class="rounded-lg border-outline-variant text-sm"><option value="active">Recently active</option><option value="uploads">Most uploads</option><option value="downloads">Most downloads</option><option value="name">Email A–Z</option></select>
      <button id="tmInv" class="bg-primary text-on-primary rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined !text-lg">person_add</span>Invite member</button></div>
      <div id="tmForm" class="hidden mb-4"></div>
      <div class="bg-white rounded-xl border border-outline-variant/40 overflow-x-auto"><table class="mtable w-full text-sm"><thead class="text-left text-on-surface-variant border-b border-outline-variant/40"><tr><th class="p-3">Member</th><th class="p-3">Role</th><th class="p-3">Status</th><th class="p-3">Last sign-in</th><th class="p-3">Uploads</th><th class="p-3 text-right">Downloads <span class="font-normal">(30d)</span></th><th class="p-3"></th></tr></thead><tbody id="tmRows"></tbody></table>
      <p id="tmEmpty" class="hidden p-6 text-center text-sm text-on-surface-variant">No members match.</p></div>`;
    box.dataset.ready = '1'; $('#tmForm').appendChild($('#addAdmin'));
    $('#tmq').oninput = e => { tq.q = e.target.value.toLowerCase(); renderTeamMaster(); };
    $('#tmf').onchange = e => { tq.f = e.target.value; renderTeamMaster(); };
    $('#tms').onchange = e => { tq.sort = e.target.value; renderTeamMaster(); };
    $('#tmInv').onclick = () => { const f = $('#tmForm'); f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) $('#addAdmin').email.focus(); };
    $('#tmRows').onclick = tmClick; $('#tmRows').onchange = tmRole;
  }
  const idle = m => !m.last_sign_in || Date.now() - new Date(m.last_sign_in) > 30 * 864e5;
  const rows = [...status.map(m => ({ ...m, kind: 'member', dl: memberDl[m.email] || 0 })),
    ...invites.filter(i => !status.some(m => (m.email || '').toLowerCase() === i.email.toLowerCase())).map(i => ({ kind: 'invite', email: i.email, role_label: i.role === 'superadmin' ? 'Superadmin' : 'Admin', account: 'Invited', joined: i.created_at, uploads: 0, live: 0, pending: 0, rejected: 0, dl: 0, invRole: i.role }))]
    .filter(m => !tq.q || (m.email || '').toLowerCase().includes(tq.q))
    .filter(m => tq.f === 'all' || (tq.f === 'invited' ? m.kind === 'invite' || m.account !== 'Active' : tq.f === 'idle' ? m.kind === 'member' && idle(m) : m.kind === 'member' && (tq.f === 'superadmin' ? m.role_label !== 'Admin' : m.role_label === 'Admin')));
  const t = x => x ? +new Date(x) : 0;
  rows.sort((a, b) => (b.user_id === me.id) - (a.user_id === me.id) || ({ active: t(b.last_sign_in) - t(a.last_sign_in), uploads: b.uploads - a.uploads, downloads: b.dl - a.dl, name: (a.email || '').localeCompare(b.email || '') })[tq.sort]);
  const chip = a => ({ Active: 'bg-green-100 text-green-800', Invited: 'bg-amber-100 text-amber-800', 'Invite not accepted': 'bg-amber-100 text-amber-800' }[a] || 'bg-red-100 text-red-800');
  $('#tmRows').innerHTML = rows.map(m => { const you = m.user_id === me.id, owner = m.role_label === 'Master admin';
    return `<tr data-m="${esc(m.user_id || '')}" class="border-b border-outline-variant/30 last:border-0 hover:bg-surface-container-lowest">
    <td class="p-3"><button data-view="${esc(m.user_id || '')}" class="flex items-center gap-2 text-left" ${m.kind === 'invite' ? 'disabled' : ''}><span class="w-9 h-9 shrink-0 rounded-full grid place-items-center text-xs font-bold ${m.role_label === 'Admin' ? 'bg-surface-container' : 'bg-primary text-on-primary'}">${initials(m.email)}</span><span class="min-w-0"><span class="block font-medium truncate max-w-[220px] ${m.kind === 'member' ? 'hover:text-primary' : ''}">${esc(m.email)}</span><span class="block text-xs text-on-surface-variant">${[you ? 'You' : '', m.kind === 'invite' ? 'invited ' + ago(m.joined) : m.joined ? 'joined ' + new Date(m.joined).toLocaleDateString() : ''].filter(Boolean).join(' · ')}</span></span></button></td>
    <td class="p-3">${you || owner || m.kind === 'invite' ? `<span class="text-sm">${esc(you && myTitle ? myTitle : m.role_label)}</span>` : `<select data-role="${esc(m.user_id)}" aria-label="Role for ${esc(m.email)}" class="rounded-lg border-outline-variant text-sm py-1"><option value="admin" ${m.role_label === 'Admin' ? 'selected' : ''}>Admin</option><option value="superadmin" ${m.role_label === 'Superadmin' ? 'selected' : ''}>Superadmin</option></select>`}</td>
    <td class="p-3"><span class="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${chip(m.account)}">${esc(m.account)}</span></td>
    <td class="p-3 whitespace-nowrap text-on-surface-variant">${m.last_sign_in ? ago(m.last_sign_in) : '—'}</td>
    <td class="p-3 whitespace-nowrap"><b>${m.uploads}</b> <span class="text-xs text-on-surface-variant">(<span class="text-green-700">${m.live} live</span>${m.pending ? ` · <span class="text-amber-700">${m.pending} pending</span>` : ''}${m.rejected ? ` · <span class="text-red-700">${m.rejected} rejected</span>` : ''})</span></td>
    <td class="p-3 text-right tabular-nums">${m.dl}</td>
    <td class="p-3 text-right whitespace-nowrap">${m.kind === 'invite' ? `<button data-resend="${esc(m.email)}" data-irole="${esc(m.invRole)}" class="px-2 py-1 rounded text-primary font-medium hover:bg-primary-fixed/50">Resend</button><button data-uninv="${esc(m.email)}" class="px-2 py-1 rounded text-error font-medium hover:bg-red-50">Cancel</button>`
      : `${m.account === 'Invite not accepted' ? `<button data-resend="${esc(m.email)}" data-irole="${m.role_label === 'Admin' ? 'admin' : 'superadmin'}" class="px-2 py-1 rounded text-primary font-medium hover:bg-primary-fixed/50">Resend invite</button>` : ''}<button data-view="${esc(m.user_id)}" class="material-symbols-outlined p-1.5 rounded hover:bg-surface-container" title="Details">visibility</button>${you || owner ? '' : `<button data-rm="${esc(m.user_id)}" data-em="${esc(m.email)}" class="material-symbols-outlined p-1.5 rounded text-error hover:bg-red-50" title="Remove">person_remove</button>`}`}</td></tr>`; }).join('');
  $('#tmEmpty').classList.toggle('hidden', rows.length > 0);
}
async function tmRole(e) { const id = e.target.dataset.role; if (!id) return; const { data, error } = await sb.from('admins').update({ role: e.target.value }).eq('user_id', id).select('user_id'); if (error || !data?.length) { toast(error?.message || "You don't have permission to change this member", 1); return loadAll(); } toast('Role updated'); loadAll(); }
async function tmClick(e) { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) return openMember(b.dataset.view);
  if (b.dataset.rm) { if (!await ask({ title: 'Remove this member?', message: `${b.dataset.em} will lose access to the library and admin. Their uploaded videos stay.`, ok: 'Remove', tone: 'danger', icon: 'person_remove' })) return; const { data, error } = await sb.from('admins').delete().eq('user_id', b.dataset.rm).select('user_id'); if (error || !data?.length) return toast(error?.message || "Couldn't remove this member", 1); toast('Removed'); return loadAll(); }
  if (b.dataset.resend) { b.disabled = true; await sendInvite(b.dataset.resend, b.dataset.irole); b.disabled = false; return loadAll(); }
  if (b.dataset.uninv) { if (!await ask({ title: 'Cancel this invite?', message: `${b.dataset.uninv} won't be able to join with the link they received.`, ok: 'Cancel invite', cancel: 'Keep invite', tone: 'danger', icon: 'mail' })) return; const { error } = await sb.from('admin_invites').delete().eq('email', b.dataset.uninv); if (error) return toast(error.message, 1); loadAll(); } }
function openMember(id) { const m = status.find(x => x.user_id === id); if (!m) return;
  const up = videos.filter(v => v.submitted_by === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const st = (n, l, c = '') => `<div class="rounded-xl bg-surface-container-low p-3 text-center"><p class="text-xl font-bold ${c}">${n}</p><p class="text-xs text-on-surface-variant">${l}</p></div>`;
  $('#mbody').innerHTML = `<div class="flex items-center gap-3"><span class="w-14 h-14 rounded-full grid place-items-center text-lg font-bold ${m.role_label === 'Admin' ? 'bg-surface-container' : 'bg-primary text-on-primary'}">${initials(m.email)}</span><div class="min-w-0"><p class="font-bold text-lg truncate">${esc(m.email)}</p><p class="text-sm text-on-surface-variant">${esc(m.user_id === me.id && myTitle ? myTitle : m.role_label)} · ${esc(m.account)}</p></div></div>
    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-5"><dt class="text-on-surface-variant">Joined</dt><dd>${m.joined ? new Date(m.joined).toLocaleDateString() : '—'}</dd><dt class="text-on-surface-variant">Last sign-in</dt><dd>${m.last_sign_in ? new Date(m.last_sign_in).toLocaleString() : 'Never'}</dd><dt class="text-on-surface-variant">Last upload</dt><dd>${m.last_upload ? ago(m.last_upload) : '—'}</dd><dt class="text-on-surface-variant">Downloads (30 days)</dt><dd>${memberDl[m.email] || 0}</dd></dl>
    <div class="grid grid-cols-4 gap-2 mt-5">${st(m.uploads, 'Uploads')}${st(m.live, 'Live', 'text-green-700')}${st(m.pending, 'Pending', 'text-amber-700')}${st(m.rejected, 'Rejected', 'text-red-700')}</div>
    <h3 class="font-semibold mt-6 mb-2">Recent uploads</h3>
    <div class="space-y-2">${up.slice(0, 8).map(v => { const [l, c] = statusLabel(v); return `<div class="flex items-center gap-3"><div class="w-16 aspect-video rounded bg-surface-container overflow-hidden shrink-0">${v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" class="w-full h-full object-cover" alt="">` : ''}</div><div class="min-w-0 flex-1"><p class="text-sm font-medium truncate">${esc(v.title)}</p><p class="text-xs text-on-surface-variant">${ago(v.created_at)}</p></div><span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${c}">${l}</span></div>`; }).join('') || '<p class="text-sm text-on-surface-variant">No uploads yet.</p>'}</div>
    ${up.length > 8 ? `<p class="mt-3 text-xs text-on-surface-variant">Showing 8 of ${up.length}.</p>` : ''}`;
  $('#mdrawer').classList.remove('hidden');
}
const statusLabel = v => ({ pending: ['Pending', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'], approved: v.published ? ['Live', 'bg-green-100 text-green-800'] : ['Draft', 'bg-surface-container text-on-surface-variant'] }[v.status] || ['', '']);
$('#mdrawer').onclick = e => { if (e.target.id === 'mdrawer' || e.target.closest('[data-mclose]')) $('#mdrawer').classList.add('hidden'); };

function renderTeam() {
  if (!isSuper()) return;
  $('#teamFull').classList.toggle('hidden', !topLevel); $('#teamLeft').classList.toggle('hidden', topLevel); $('#statusWrap').classList.add('hidden');
  $('#teamGrid').classList.toggle('hidden', topLevel);
  if (topLevel) { const idle = status.filter(m => m.last_sign_in && Date.now() - new Date(m.last_sign_in) < 7 * 864e5).length;
    const st = (i, n, l) => `<div class="bg-white rounded-xl border border-outline-variant/40 p-4 flex items-center gap-3"><span class="w-10 h-10 rounded-full bg-primary-fixed text-primary grid place-items-center"><span class="material-symbols-outlined">${i}</span></span><div><p class="text-2xl font-bold leading-none">${n}</p><p class="text-xs text-on-surface-variant mt-1">${l}</p></div></div>`;
    $('#teamStats').innerHTML = st('groups', status.length, 'Members') + st('bolt', idle, 'Active this week') + st('shield_person', status.filter(m => m.role_label !== 'Admin').length, 'Superadmins & you') + st('mail', invites.length + status.filter(m => m.account === 'Invite not accepted').length, 'Not joined yet');
    renderTeamMaster(); loadMemberDownloads(); return; }
  renderStatus();
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
$('#teamRows').onclick = async e => { const b = e.target.closest('[data-rm]'); if (!b || !await ask({ title: 'Remove this member?', message: `${b.dataset.em} will lose access. Their uploaded videos stay.`, ok: 'Remove', tone: 'danger', icon: 'person_remove' })) return; const { data, error } = await sb.from('admins').delete().eq('user_id', b.dataset.rm).select('user_id'); if (error) return toast(error.message, 1); if (!data?.length) return toast("You don't have permission to remove this member", 1); toast('Removed'); loadAll(); };
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
  const em = b.dataset.uninv; if (!em || !await ask({ title: 'Cancel this invite?', message: `${em} won't be able to join with the link they received.`, ok: 'Cancel invite', cancel: 'Keep invite', tone: 'danger', icon: 'mail' })) return; const { error } = await sb.from('admin_invites').delete().eq('email', em); if (error) return toast(error.message, 1); loadAll(); };

boot();
