import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, z } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR" | "INVALID_JSON" | "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "CSRF_FAILED"
  | "FORBIDDEN" | "NOT_FOUND" | "TASK_VERSION_CONFLICT" | "PROJECT_ARCHIVED" | "EMAIL_EXISTS"
  | "MEMBER_EXISTS" | "MANAGER_REQUIRED" | "ROLE_CONFLICT" | "LAST_ADMIN" | "SELF_LOCKOUT"
  | "PAYLOAD_TOO_LARGE" | "RATE_LIMITED" | "INTERNAL" | "DB_UNAVAILABLE";

type Extra = { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> };

export class AppError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public extra: Extra = {}) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const forbidden = (message = "You don't have permission to do that.") => new AppError(403, "FORBIDDEN", message);
export const archived = () => new AppError(409, "PROJECT_ARCHIVED", "This project is archived and read-only.");
export const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");

export function validationError(fieldErrors: Record<string, string[]>, message = "Check the highlighted fields.") {
  return new AppError(400, "VALIDATION_ERROR", message, { fieldErrors });
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
};

const DB_DOWN_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03", "08006", "08001", "40P01", "40001"]);

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const send = (status: number, code: ErrorCode, message: string, extra: Extra = {}) =>
    res.status(status).json({ error: { code, message, ...extra } });

  if (error instanceof AppError) return send(error.status, error.code, error.message, error.extra);
  if (error instanceof ZodError) {
    return send(400, "VALIDATION_ERROR", "Check the highlighted fields.", { fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> });
  }
  if (error?.type === "entity.parse.failed") return send(400, "INVALID_JSON", "Request body must be valid JSON.");
  if (error?.type === "entity.too.large") return send(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  if (DB_DOWN_CODES.has(error?.code) || /connect|Connection terminated/i.test(error?.message ?? "")) {
    return send(503, "DB_UNAVAILABLE", "The database is unavailable. Try again shortly.");
  }
  if (process.env.NODE_ENV !== "test") console.error("Unexpected error:", error?.code ?? "", error?.message ?? error);
  return send(500, "INTERNAL", "Something went wrong. Try again.");
};
