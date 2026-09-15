import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { assertPublicHttpsUrl, type PublicAudioClient } from './public-audio-client.js';

const executeFile = promisify(execFile);
const PLATFORM_HOSTS = ['youtube.com', 'youtu.be', 'rutube.ru', 'vk.com', 'vkvideo.ru', 'ok.ru', 'max.ru'];

export class UniversalPublicAudioClient implements PublicAudioClient {
  public constructor(private readonly direct: PublicAudioClient, private readonly platform: PublicAudioClient) {}
  public download(url: string, maxBytes: number) {
    return isPlatformMediaUrl(url) ? this.platform.download(url, maxBytes) : this.direct.download(url, maxBytes);
  }
}

export class YtDlpAudioClient implements PublicAudioClient {
  public constructor(
    private readonly binary = 'yt-dlp',
    private readonly proxyUrl?: string,
    private readonly run: (args: string[]) => Promise<unknown> = (args) => executeFile(this.binary, args, { timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024 }),
    private readonly validate = assertPublicHttpsUrl,
  ) {}

  public async download(rawUrl: string, maxBytes: number): Promise<{ bytes: Uint8Array; fileName: string }> {
    const url = normalizePlatformUrl(new URL(rawUrl));
    await this.validate(url);
    if (!isPlatformMediaUrl(url.toString())) throw new Error('Unsupported media platform');
    const directory = await mkdtemp(join(tmpdir(), 'church-bot-media-'));
    try {
      const output = join(directory, 'sermon.%(ext)s');
      const commonArgs = [
        '--no-playlist', '--max-downloads', '1', '--no-warnings', '--no-update', '--extract-audio', '--audio-format', 'mp3',
        '--audio-quality', '5', '--max-filesize', String(maxBytes), '--output', output,
        ...(this.proxyUrl ? ['--proxy', this.proxyUrl] : []),
      ];
      try {
        await this.run([...commonArgs, url.toString()]);
      } catch (error) {
        if (!isYouTubeUrl(url) || !/403|forbidden/i.test(error instanceof Error ? error.message : String(error))) throw error;
        for (const file of await readdir(directory)) await rm(join(directory, file), { force: true });
        await this.run([...commonArgs, '--extractor-args', 'youtube:player_client=mweb', '--format', '18/best[height<=360]', url.toString()]);
      }
      const files = await readdir(directory);
      const fileName = files.find((name) => name.startsWith('sermon.'));
      if (!fileName) throw new Error('Platform did not provide downloadable audio');
      const path = join(directory, fileName);
      if ((await stat(path)).size > maxBytes) throw new Error('File exceeds the configured download limit');
      return { bytes: await readFile(path), fileName };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function isYouTubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  return host === 'youtube.com' || host === 'youtu.be';
}

export function normalizePlatformUrl(url: URL): URL {
  if (!isYouTubeUrl(url)) return url;
  const videoId = url.hostname.toLowerCase().includes('youtu.be') ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v');
  return videoId && /^[\w-]{6,20}$/.test(videoId) ? new URL(`https://www.youtube.com/watch?v=${videoId}`) : url;
}

export function isPlatformMediaUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    return PLATFORM_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}
