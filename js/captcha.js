// Cloudflare Turnstile CAPTCHA for login + password reset.
// Off until TURNSTILE_SITE_KEY is set in js/config.js (and the secret is added in Supabase → Auth → Bot and Abuse Protection).
window.esCaptcha = (() => {
  const KEY = (window.ES_CONFIG || {}).TURNSTILE_SITE_KEY || '';
  let loading = null;
  const load = () => loading || (loading = new Promise((ok, bad) => {
    if (window.turnstile) return ok(window.turnstile);
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = () => ok(window.turnstile); s.onerror = () => { loading = null; bad(new Error('Security check could not load. Check your connection and refresh.')); };
    document.head.appendChild(s);
  }));
  // mount(el) → { token(): Promise<string|undefined>, reset() }. With no key it is a no-op (token() → undefined).
  function mount(el) {
    if (!KEY || !el) return { token: async () => undefined, reset() {} };
    let id = null, tok = null, waiters = [];
    const settle = t => { tok = t; waiters.splice(0).forEach(w => w(t)); };
    const ready = load().then(ts => { id = ts.render(el, { sitekey: KEY, appearance: 'interaction-only', 'refresh-expired': 'auto',
      callback: settle, 'expired-callback': () => { tok = null; }, 'error-callback': () => { tok = null; } }); }).catch(() => {});
    return {
      async token() {
        await ready; if (tok) return tok;
        if (id === null) throw new Error('Security check could not load. Check your connection and refresh.');
        return await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('Please complete the security check.')), 20000); waiters.push(v => { clearTimeout(t); ok(v); }); });
      },
      reset() { tok = null; try { if (id !== null) window.turnstile.reset(id); } catch { } }     // tokens are single-use
    };
  }
  const friendly = m => /captcha/i.test(m || '') ? 'Security check failed — please try again.' : m;
  return { enabled: !!KEY, mount, friendly };
})();
