export function prefersRussian(text: string): boolean {
  const cyrillic = letterCount(text, /[А-ЯЁ]/giu);
  const latin = letterCount(text, /[A-Z]/giu);
  return cyrillic >= 2 && cyrillic >= latin;
}

export function isReadableRussian(text: string): boolean {
  const cyrillic = letterCount(text, /[А-ЯЁ]/giu);
  const latin = letterCount(text, /[A-Z]/giu);
  return cyrillic >= 2 && (latin <= 12 || cyrillic >= latin * 2);
}

export function needsRussianRewrite(source: string, result: string): boolean {
  return prefersRussian(source) && !isReadableRussian(result);
}

function letterCount(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
