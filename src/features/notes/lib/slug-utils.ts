const POLISH_CHARACTERS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

export function createSlug(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pl")
    .replace(/[ąćęłńóśźż]/g, (character) => POLISH_CHARACTERS[character])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createUniqueSlug(
  value: string,
  existingSlugs: Iterable<string>,
  fallback: string,
) {
  const used = new Set(existingSlugs);
  const base = createSlug(value) || fallback;
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
