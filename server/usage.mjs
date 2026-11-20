const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dayMs = 86400000;
const chinaOffset = 28800000;

export function usageHandler(db, origin) {
  const openVisit = db.prepare('INSERT OR IGNORE INTO hall_visits VALUES (?, ?, ?)');
  const getVisit = db.prepare('SELECT started FROM hall_visits WHERE visit=? AND visitor=?');
  const addTime = db.prepare(`INSERT INTO hall_usage VALUES (?, ?, ?)
    ON CONFLICT(day,visitor) DO UPDATE SET active_ms=active_ms+excluded.active_ms`);
  return async function record(req, res) {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (req.headers.origin !== origin) { res.writeHead(403).end(); return; }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 512) { res.writeHead(413).end(); return; }
    }
    let data;
    try { data = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    const {visitor, visit, start, duration} = data || {};
    if (typeof visitor !== 'string' || typeof visit !== 'string' ||
        !uuid.test(visitor) || !uuid.test(visit) ||
        !Number.isInteger(duration) || duration < 0 || duration > 16000) {
      res.writeHead(400).end(); return;
    }
    const now = Date.now();
    if (start === true) openVisit.run(visit, visitor, now);
    const row = getVisit.get(visit, visitor);
    if (row && duration > 0) {
      const end = now + chinaOffset;
      const begin = Math.max(end - duration, row.started + chinaOffset);
      const midnight = Math.floor(end / dayMs) * dayMs;
      const day = value => new Date(value).toISOString().slice(0, 10);
      if (begin < midnight) addTime.run(day(begin), visitor, midnight - begin);
      if (end > Math.max(begin, midnight)) addTime.run(day(end), visitor, end - Math.max(begin, midnight));
    }
    res.writeHead(204, {'Cache-Control': 'no-store'}).end();
  };
}
