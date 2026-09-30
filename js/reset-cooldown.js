// Forgot-password cooldown shared by the website and admin login (same browser, 60 s)
window.esReset = (() => {
  const KEY = 'es_reset_until', SECS = 60, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const left = () => { try { const u = +localStorage.getItem(KEY) || 0, l = Math.ceil((u - Date.now()) / 1000); return l > SECS ? SECS : Math.max(0, l); } catch { return 0; } };
  const start = () => { try { localStorage.setItem(KEY, String(Date.now() + SECS * 1000)); } catch { } };
  function bind(btn, label = 'Forgot password?') {
    const tick = () => { const l = left(); btn.disabled = l > 0; btn.textContent = l > 0 ? `Resend link in ${l}s` : label; btn.classList.toggle('opacity-60', l > 0); btn.classList.toggle('cursor-not-allowed', l > 0); if (l > 0) setTimeout(tick, 1000); };
    tick(); return tick;
  }
  // send(email) → {ok, msg}. Never reveals whether an account exists.
  async function send(sendFn, email) {
    email = (email || '').trim();
    if (!EMAIL.test(email)) return { ok: false, msg: 'Enter your email address above first.' };
    if (left() > 0) return { ok: false, msg: `Please wait ${left()}s before requesting another link.` };
    const { error } = await sendFn(email);
    if (error && !/rate|security purposes|seconds/i.test(error.message)) return { ok: false, msg: error.message };
    start();
    return { ok: true, msg: 'If this email has an account, a reset link is on its way. Check your inbox.' };
  }
  return { left, bind, send };
})();

// Slow down password guessing: 5 wrong attempts → 30 s pause (per browser)
window.esLock = (() => {
  const K = 'es_login_fail', MAX = 5, WAIT = 30;
  const get = () => { try { return JSON.parse(localStorage.getItem(K)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
  const set = v => { try { localStorage.setItem(K, JSON.stringify(v)); } catch { } };
  const left = () => Math.max(0, Math.ceil((get().until - Date.now()) / 1000));
  function fail(message) { const s = get(); s.n = (left() ? s.n : s.n) + 1; if (s.n >= MAX) { s.until = Date.now() + WAIT * 1000; s.n = 0; set(s); return `Too many attempts. Try again in ${WAIT}s.`; } set(s);
    return /invalid login/i.test(message) ? `Wrong email or password. ${MAX - s.n} attempt${MAX - s.n === 1 ? '' : 's'} left before a short pause.` : message; }
  const reset = () => set({ n: 0, until: 0 });
  return { left, fail, reset };
})();
