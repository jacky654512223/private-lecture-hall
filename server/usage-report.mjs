import {DatabaseSync} from 'node:sqlite';

const db = new DatabaseSync(process.argv[2] || '/var/lib/lecture-hall/hall.sqlite', {readOnly: true});
const summary = db.prepare(`SELECT COUNT(*) visits, COUNT(DISTINCT visitor) browsers,
  datetime(MIN(started)/1000,'unixepoch','+8 hours') first_visit_bjt
  FROM hall_visits`).get();
const time = db.prepare('SELECT COALESCE(SUM(active_ms),0) AS total_ms FROM hall_usage').get();
const days = db.prepare(`WITH visits AS (
    SELECT date(started/1000,'unixepoch','+8 hours') day, COUNT(*) visits,
      COUNT(DISTINCT visitor) browsers FROM hall_visits GROUP BY 1
  ), usage AS (
    SELECT day, SUM(active_ms) active_ms FROM hall_usage GROUP BY day
  ), days AS (SELECT day FROM visits UNION SELECT day FROM usage)
  SELECT day, COALESCE(visits,0) visits, COALESCE(browsers,0) browsers,
    COALESCE(active_ms,0) active_ms FROM days LEFT JOIN visits USING(day)
    LEFT JOIN usage USING(day) ORDER BY day DESC LIMIT 30`).all();
console.log(JSON.stringify({...summary, ...time, days}, null, 2));
