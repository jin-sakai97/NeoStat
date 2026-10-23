import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import type pg from "pg";

export const SESSION_COOKIE = "neostat.sid";
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export function sessionMiddleware(pool: pg.Pool, secret: string, secure: boolean) {
  const PgStore = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE,
    secret,
    store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: false }),
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_LIFETIME_MS },
  });
}
