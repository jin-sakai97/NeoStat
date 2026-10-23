import type { Actor } from "../domain/policy.js";

declare module "express-session" {
  interface SessionData {
    csrfToken: string;
    userId: string;
    authVersion: number;
    authExpiresAt: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

export {};
