export function normalizeTags(input: string[]): string[] {
  return [...new Set(input.map(tag => tag.trim()).filter(Boolean))].slice(0, 20);
}
export function isValidTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= 200;
}
