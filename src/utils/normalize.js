/** Trim, lowercase and de-duplicate interests so grouping is consistent. */
export function normalizeInterests(list = []) {
  return [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
}
