export type Page = { page: number; pageSize: number };

export const limitOffset = ({ page, pageSize }: Page) => ({ limit: pageSize, offset: (page - 1) * pageSize });

export function paginated<T>(data: T[], total: number, { page, pageSize }: Page) {
  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

// Escapes LIKE wildcards so user search text is matched literally.
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
