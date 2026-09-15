import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from './transcription-provider.js';

export class GroqTranscriptionProvider implements TranscriptionProvider {
  public constructor(private readonly apiKey: string, private readonly model: string, private readonly language: string, private readonly baseUrl: string, private readonly request: typeof fetch = fetch) {}
  public async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const form = new FormData();
    const buffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(buffer).set(input.bytes);
    form.set('file', new Blob([buffer], { type: input.mimeType ?? 'application/octet-stream' }), input.fileName);
    form.set('model', this.model);
    form.set('language', this.language);
    form.set('response_format', 'json');
    const response = await this.request(`${this.baseUrl}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: AbortSignal.timeout(10 * 60_000) });
    const raw = await response.text();
    let body: { text?: string; error?: { message?: string } };
    try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
    if (!response.ok) throw new Error(`Groq transcription returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
    const text = body.text?.trim();
    if (!text) throw new Error('Groq transcription response did not contain text');
    return { text, model: this.model };
  }
}
