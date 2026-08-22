export function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pl");
}

export function titlesAreEqual(first: string, second: string) {
  return normalizeTitle(first) === normalizeTitle(second);
}
