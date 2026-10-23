import type { RequestHandler } from "express";
import type pg from "pg";
import { findUserById } from "../repos/users.repo.js";
import { unauthenticated } from "./errors.js";

// Loads the signed-in user fresh from the database on every request (specs/05-api.md §1).
export function loadActor(pool: pg.Pool): RequestHandler {
  return async (req, _res, next) => {
    const { userId, authVersion, authExpiresAt } = req.session ?? {};
    if (!userId) return next(unauthenticated());
    const expired = !authExpiresAt || Date.now() > authExpiresAt;
    const user = expired ? null : await findUserById(pool, userId);
    if (!user || !user.is_active || user.auth_version !== authVersion) {
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
      return next(unauthenticated());
    }
    req.actor = { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.is_active };
    next();
  };
}
