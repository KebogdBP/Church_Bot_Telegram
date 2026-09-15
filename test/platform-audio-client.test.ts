import { writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { isPlatformMediaUrl, normalizePlatformUrl, UniversalPublicAudioClient, YtDlpAudioClient } from '../src/sermons/platform-audio-client.js';
import type { PublicAudioClient } from '../src/sermons/public-audio-client.js';

describe('platform audio download', () => {
  it('recognizes supported public video platforms without matching lookalike domains', () => {
    expect(isPlatformMediaUrl('https://youtu.be/video')).toBe(true);
    expect(isPlatformMediaUrl('https://rutube.ru/video/id')).toBe(true);
    expect(isPlatformMediaUrl('https://youtube.com.evil.example/video')).toBe(false);
    expect(normalizePlatformUrl(new URL('https://m.youtube.com/watch?v=EGJo_TpufvU&pp=noise')).toString()).toBe('https://www.youtube.com/watch?v=EGJo_TpufvU');
  });

  it('falls back to a compatible YouTube mobile stream after a 403', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (run.mock.calls.length === 1) throw new Error('HTTP Error 403: Forbidden');
      const output = args[args.indexOf('--output') + 1]!;
      await writeFile(output.replace('%(ext)s', 'mp3'), 'audio');
    });
    const client = new YtDlpAudioClient('yt-dlp', 'http://proxy:1080', run, vi.fn().mockResolvedValue(undefined));
    await expect(client.download('https://m.youtube.com/watch?v=EGJo_TpufvU&pp=noise', 1_000)).resolves.toMatchObject({ fileName: 'sermon.mp3' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toEqual(expect.arrayContaining(['youtube:player_client=mweb', '18/best[height<=360]', 'https://www.youtube.com/watch?v=EGJo_TpufvU']));
  });

  it('routes platform links to yt-dlp and direct links to the guarded HTTP client', async () => {
    const direct = { download: vi.fn().mockResolvedValue({ bytes: new Uint8Array(), fileName: 'direct.mp3' }) } satisfies PublicAudioClient;
    const platform = { download: vi.fn().mockResolvedValue({ bytes: new Uint8Array(), fileName: 'platform.mp3' }) } satisfies PublicAudioClient;
    const client = new UniversalPublicAudioClient(direct, platform);
    await client.download('https://youtube.com/watch?v=1', 100);
    await client.download('https://cdn.example.org/sermon.mp3', 100);
    expect(platform.download).toHaveBeenCalledTimes(1);
    expect(direct.download).toHaveBeenCalledTimes(1);
  });

  it('extracts one bounded mp3 through the configured proxy', async () => {
    const run = vi.fn(async (args: string[]) => {
      const output = args[args.indexOf('--output') + 1]!;
      await writeFile(output.replace('%(ext)s', 'mp3'), 'audio');
      return { stdout: '', stderr: '' };
    });
    const client = new YtDlpAudioClient('yt-dlp', 'http://proxy:1080', run, vi.fn().mockResolvedValue(undefined));
    await expect(client.download('https://rutube.ru/video/abc', 1_000)).resolves.toMatchObject({ fileName: 'sermon.mp3' });
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(['--no-playlist', '--proxy', 'http://proxy:1080', 'https://rutube.ru/video/abc']));
    expect(run.mock.calls[0]?.[0]).not.toContain('--max-downloads');
  });
});
