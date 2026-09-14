import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface AudioSegment {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface AudioSegmenter {
  segment(inputPath: string): Promise<AudioSegment[]>;
}

export class FfmpegAudioSegmenter implements AudioSegmenter {
  public constructor(private readonly segmentSeconds = 3_600) {}
  public async segment(inputPath: string): Promise<AudioSegment[]> {
    const directory = await mkdtemp(join(tmpdir(), 'church-bot-audio-'));
    const outputPattern = join(directory, 'segment-%03d.ogg');
    try {
      await runFfmpeg(inputPath, outputPattern, this.segmentSeconds);
      const names = (await readdir(directory)).filter((name) => name.endsWith('.ogg')).sort();
      if (!names.length) throw new Error('ffmpeg produced no audio segments');
      return Promise.all(names.map(async (fileName) => ({
        bytes: await readFile(join(directory, fileName)),
        fileName,
        mimeType: 'audio/ogg',
      })));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function runFfmpeg(inputPath: string, outputPattern: string, segmentSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '24k',
      '-f', 'segment', '-segment_time', String(segmentSeconds), '-reset_timestamps', '1', outputPattern,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    process.stderr.setEncoding('utf8');
    process.stderr.on('data', (chunk: string) => { errorOutput = `${errorOutput}${chunk}`.slice(-2_000); });
    process.once('error', (error) => reject(new Error(`Unable to start ffmpeg: ${error.message}`)));
    process.once('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code ?? 'unknown'}): ${errorOutput.trim()}`)));
  });
}
