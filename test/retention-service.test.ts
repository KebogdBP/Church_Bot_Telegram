import { describe, expect, it } from 'vitest';
import { parseRetentionSetting } from '../src/retention/retention-service.js';

describe('retention command parser', () => {
  it('accepts supported categories and safe day limits', () => {
    expect(parseRetentionSetting('/retention_set audio 90')).toEqual({ kind: 'audio', days: 90 });
    expect(parseRetentionSetting('/retention_set@churchbot transcripts 3650')).toEqual({ kind: 'transcripts', days: 3650 });
    expect(parseRetentionSetting('/retention_set prayers 1')).toEqual({ kind: 'prayers', days: 1 });
  });

  it('rejects unsupported categories and unsafe limits', () => {
    expect(parseRetentionSetting('/retention_set messages 30')).toBeNull();
    expect(parseRetentionSetting('/retention_set audio 0')).toBeNull();
    expect(parseRetentionSetting('/retention_set prayers 3651')).toBeNull();
  });
});
