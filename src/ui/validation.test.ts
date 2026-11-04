import { describe, expect, it } from 'vitest';
import { isValidTitle, normalizeTags } from './validation';
describe('idea input', () => {
  it('rejects empty titles', () => expect(isValidTitle('  ')).toBe(false));
  it('accepts regular titles', () => expect(isValidTitle('New idea')).toBe(true));
  it('normalizes tags', () => expect(normalizeTags([' ai ', 'ai', '', 'work'])).toEqual(['ai','work']));
});
