/** Short, sortable-ish ids. Prefixed so they're readable in devtools. */
export function newId(prefix = 'id') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/** Deterministic id for imported records so re-syncing updates in place. */
export function stableId(prefix: string, ...parts: (string | number | undefined)[]) {
  const key = parts.filter(Boolean).join('|');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}_${(h >>> 0).toString(36)}`;
}
