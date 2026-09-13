import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface PublicAudioClient {
  download(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; fileName: string }>;
}

export class SafePublicAudioClient implements PublicAudioClient {
  public async download(rawUrl: string, maxBytes: number): Promise<{ bytes: Uint8Array; fileName: string }> {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only public HTTPS links are accepted');
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Private network addresses are not allowed');

    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) throw new Error(`Audio link returned HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new Error('File exceeds the configured download limit');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      size += bytes.byteLength;
      if (size > maxBytes) throw new Error('File exceeds the configured download limit');
      chunks.push(bytes);
    }
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes: combined, fileName: url.pathname.split('/').pop() || 'sermon.audio' };
  }
}

export function isPrivateAddress(address: string): boolean {
  if (!isIP(address)) return true;
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(address) === 4 ? address : undefined);
  if (!ipv4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  if (a === undefined || b === undefined) return true;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
