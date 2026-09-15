import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeHtmlWithin } from '../src/messaging/html.js';

describe('Telegram HTML helpers', () => {
  it('escapes reserved characters', () => {
    expect(escapeHtml('<hope & faith>')).toBe('&lt;hope &amp; faith&gt;');
  });

  it('never cuts an escaped entity at the length boundary', () => {
    expect(escapeHtmlWithin('ab&cd', 6)).toBe('ab');
    expect(escapeHtmlWithin('ab&cd', 7)).toBe('ab&amp;');
  });
});
