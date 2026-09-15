export function toModuleNameSearchPattern(query: string) {
  const escaped = query
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");

  return `%${escaped}%`;
}
