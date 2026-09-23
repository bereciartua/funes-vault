export function pluralNoun(
  count: number,
  singular: string,
  plural = singular.endsWith("y") && !/[aeiou]y$/.test(singular)
    ? `${singular.slice(0, -1)}ies`
    : `${singular}s`
) {
  return count === 1 ? singular : plural;
}
export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${pluralNoun(count, singular, plural)}`;
}
