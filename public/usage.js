(() => {
  if (typeof crypto.randomUUID !== 'function') return;
  const key = 'lectureHall.visitor';
  let visitor = crypto.randomUUID();
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) visitor = saved;
    else localStorage.setItem(key, visitor);
  } catch {}
  const visit = crypto.randomUUID();
  let visibleSince = null;
  function send(start, duration = 0) {
    fetch('/api/usage', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({visitor, visit, start, duration}),
      keepalive: true
    }).catch(() => {});
  }
  function begin() {
    if (document.hidden || visibleSince !== null) return;
    visibleSince = performance.now();
    send(true);
  }
  function record(stop = false) {
    if (visibleSince === null) return;
    const now = performance.now();
    const duration = Math.min(16000, Math.round(now - visibleSince));
    visibleSince = stop ? null : now;
    if (duration > 0) send(false, duration);
  }
  document.addEventListener('visibilitychange', () => document.hidden ? record(true) : begin());
  window.addEventListener('pagehide', () => record(true));
  window.addEventListener('pageshow', begin);
  setInterval(() => { if (!document.hidden) record(); }, 15000);
  begin();
})();
