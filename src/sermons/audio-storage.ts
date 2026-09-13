import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export interface AudioStorage {
  save(sermonId: string, originalName: string | undefined, bytes: Uint8Array): Promise<string>;
}

export class LocalAudioStorage implements AudioStorage {
  public constructor(private readonly directory: string) {}

  public async save(sermonId: string, originalName: string | undefined, bytes: Uint8Array): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const extension = safeExtension(originalName);
    const finalPath = join(this.directory, `${sermonId}${extension}`);
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, bytes, { flag: 'wx' });
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    return finalPath;
  }
}

function safeExtension(fileName: string | undefined): string {
  const extension = extname(fileName ?? '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : '.audio';
}
