import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const newCsrfToken = () => randomBytes(32).toString("base64url");

function sameToken(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Every mutation must come from the configured frontend origin and carry the session's token.
export function csrfProtection(clientOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("Origin");
    const token = req.get("X-CSRF-Token");
    const expected = req.session?.csrfToken;
    if ((origin && origin !== clientOrigin) || !token || !expected || !sameToken(token, expected)) {
      return next(new AppError(403, "CSRF_FAILED", "Your session security token is missing or invalid. Reload the page and try again."));
    }
    next();
  };
}
