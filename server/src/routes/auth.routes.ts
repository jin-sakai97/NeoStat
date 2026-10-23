import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import type pg from "pg";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../domain/passwords.js";
import { AppError, unauthenticated, validationError } from "../http/errors.js";
import { newCsrfToken } from "../http/csrf.js";
import { SESSION_COOKIE, SESSION_LIFETIME_MS } from "../http/session.js";
import { password as newPasswordSchema } from "../http/schemas.js";
import { parse } from "../http/validate.js";
import { findUserByEmail, findUserById, toUserDTO } from "../repos/users.repo.js";

const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

// Compared against when the email is unknown, so failures take similar time.
const dummyHash = hashPassword("timing-equalizer-password");

const regenerate = (req: Request) => new Promise<void>((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
const save = (req: Request) => new Promise<void>((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));

// Failed attempts only (successful logins are skipped), per IP, in a 15-minute window.
const tooManyAttempts = () => new AppError(429, "RATE_LIMITED", "Too many failed sign-in attempts. Try again in a few minutes.");
export const failedAttemptLimiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyAttempts()),
  });

export function authRoutes(pool: pg.Pool, loginAttemptLimit = 10) {
  const router = Router();

  router.get("/auth/csrf", async (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = newCsrfToken();
      await save(req);
    }
    res.json({ data: { csrfToken: req.session.csrfToken } });
  });

  router.post("/auth/login", failedAttemptLimiter(loginAttemptLimit), async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await findUserByEmail(pool, email);
    const valid = await verifyPassword(password, user?.password_hash ?? (await dummyHash));
    if (!user || !valid || !user.is_active) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    await regenerate(req);
    req.session.userId = user.id;
    req.session.authVersion = user.auth_version;
    req.session.authExpiresAt = Date.now() + SESSION_LIFETIME_MS;
    req.session.csrfToken = newCsrfToken();
    await save(req);
    res.json({ data: { user: toUserDTO(user), csrfToken: req.session.csrfToken } });
  });

  return router;
}

const passwordChangeSchema = z.strictObject({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema });

// Routes below require loadActor.
export function sessionRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/auth/me", async (req, res) => {
    const user = await findUserById(pool, req.actor!.id);
    if (!user) throw unauthenticated();
    res.json({ data: { user: toUserDTO(user), csrfToken: req.session.csrfToken } });
  });

  router.post("/auth/logout", async (req, res) => {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.patch("/profile", async (req, res) => {
    const { name } = parse(z.strictObject({ name: z.string().trim().min(1).max(80) }), req.body);
    const { rows } = await pool.query(
      "UPDATE users SET name = $2, updated_at = now() WHERE id = $1 RETURNING *",
      [req.actor!.id, name],
    );
    res.json({ data: toUserDTO(rows[0]) });
  });

  router.post("/profile/password", async (req, res) => {
    const { currentPassword, newPassword } = parse(passwordChangeSchema, req.body);
    const user = await findUserById(pool, req.actor!.id);
    if (!user) throw unauthenticated();
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw validationError({ currentPassword: ["Current password is incorrect."] });
    }
    if (currentPassword === newPassword) {
      throw validationError({ newPassword: ["Choose a password different from the current one."] });
    }
    // Bumping auth_version revokes every other session; keep this one signed in.
    const { rows } = await pool.query(
      "UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = now() WHERE id = $1 RETURNING auth_version",
      [user.id, await hashPassword(newPassword)],
    );
    req.session.authVersion = rows[0].auth_version;
    await save(req);
    res.status(204).end();
  });

  return router;
}
