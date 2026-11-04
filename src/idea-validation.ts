export const STATUSES = ['inbox', 'refine', 'ready', 'progress', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type Status = typeof STATUSES[number];
export type Priority = typeof PRIORITIES[number];
export type IdeaInput = { title: string; description: string; status: Status; priority: Priority; tags: string[] };
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isTags(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 &&
    value.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 40 && tag.trim() === tag);
}
export function validateCreate(value: unknown): IdeaInput | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) return null;
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 10000)) return null;
  if (value.status !== undefined && !STATUSES.includes(value.status as Status)) return null;
  if (value.priority !== undefined && !PRIORITIES.includes(value.priority as Priority)) return null;
  if (value.tags !== undefined && !isTags(value.tags)) return null;
  return { title: value.title.trim(), description: (value.description as string | undefined) ?? '',
    status: (value.status as Status | undefined) ?? 'inbox', priority: (value.priority as Priority | undefined) ?? 'medium',
    tags: (value.tags as string[] | undefined) ?? [] };
}
export function validatePatch(value: unknown): Record<string, string | string[]> | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !['title','description','status','priority','tags'].includes(key))) return null;
  if (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200)) return null;
  if (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 10000)) return null;
  if (value.status !== undefined && !STATUSES.includes(value.status as Status)) return null;
  if (value.priority !== undefined && !PRIORITIES.includes(value.priority as Priority)) return null;
  if (value.tags !== undefined && !isTags(value.tags)) return null;
  const out: Record<string, string | string[]> = {};
  for (const key of keys) out[key] = key === 'title' ? (value[key] as string).trim() : value[key] as string | string[];
  return out;
}
