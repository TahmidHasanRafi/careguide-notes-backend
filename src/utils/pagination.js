export function toSkip(page, limit) {
  return (page - 1) * limit;
}

export function paginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
