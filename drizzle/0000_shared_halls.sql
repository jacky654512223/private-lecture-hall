CREATE TABLE hall_rooms (id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE hall_sessions (token TEXT PRIMARY KEY NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, room TEXT, last INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX hall_sessions_last ON hall_sessions(last);
--> statement-breakpoint
CREATE TABLE hall_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL);
