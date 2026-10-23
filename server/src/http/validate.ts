import { z } from "zod";
import { validationError } from "./errors.js";

// Parses input with a Zod schema, turning failures into a 400 VALIDATION_ERROR envelope.
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const flat = z.flattenError(result.error);
    const fieldErrors = { ...(flat.fieldErrors as Record<string, string[]>) };
    if (flat.formErrors.length) fieldErrors._ = flat.formErrors;
    throw validationError(fieldErrors);
  }
  return result.data;
}
