export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Uniform list-response envelope: `{ data: T[], meta: { total, page, limit, totalPages } }`. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Build the standard paginated envelope from a page of rows + the total count. */
export function paginate<T>(
  data: T[],
  total: number,
  query: { page: number; limit: number },
): Paginated<T> {
  return {
    data,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    },
  };
}
