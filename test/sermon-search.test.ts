import { describe, expect, it } from 'vitest';
import { excerptAround } from '../src/sermons/sermon-search-service.js';

describe('sermon archive excerpts', () => {
  it('returns a bounded verbatim fragment around the query', () => {
    const text = `${'Начало '.repeat(80)}надежда не постыжает${' конец'.repeat(80)}`;
    const excerpt = excerptAround(text, 'НАДЕЖДА', 30);
    expect(excerpt).toContain('надежда не постыжает');
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThan(100);
  });
});
