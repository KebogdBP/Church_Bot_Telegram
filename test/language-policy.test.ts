import { describe, expect, it } from 'vitest';
import { isReadableRussian, needsRussianRewrite, prefersRussian } from '../src/ai/language-policy.js';

describe('AI language policy', () => {
  it('recognizes Russian questions even with a short English term', () => {
    expect(prefersRussian('Как AI может помочь изучать Библию?')).toBe(true);
  });

  it('detects English and heavily mixed responses to Russian questions', () => {
    expect(needsRussianRewrite('Что такое благодать?', 'Grace is the undeserved favor of God.')).toBe(true);
    expect(needsRussianRewrite('Что такое благодать?', 'Благодать — это дар Бога, который невозможно заслужить.')).toBe(false);
    expect(isReadableRussian('Размышление о вере. This whole second part is written in English and should not remain.')).toBe(false);
  });
});
