export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function escapeHtmlWithin(value: string, maxLength: number): string {
  let result = '';
  for (const character of value) {
    const escaped = escapeHtml(character);
    if (result.length + escaped.length > maxLength) break;
    result += escaped;
  }
  return result;
}
