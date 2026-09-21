export function requestReference(id: string) {
  const compact = id.replaceAll("-", "").slice(0, 8).toUpperCase();
  return compact ? `MF-${compact}` : "—";
}
