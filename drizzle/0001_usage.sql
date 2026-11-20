CREATE TABLE hall_visits (
  visit TEXT PRIMARY KEY,
  visitor TEXT NOT NULL,
  started INTEGER NOT NULL
);
CREATE INDEX hall_visits_started ON hall_visits(started);
CREATE TABLE hall_usage (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  active_ms INTEGER NOT NULL,
  PRIMARY KEY(day, visitor)
);
