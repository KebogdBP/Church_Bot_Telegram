import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from './transcription-provider.js';

interface OpenAITranscriptionResponse {
  text?: string;
  error?: { message?: string };
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly language: string,
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const form = new FormData();
    const audioBuffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(audioBuffer).set(input.bytes);
    const blob = new Blob([audioBuffer], { type: input.mimeType ?? 'application/octet-stream' });
    form.set('file', blob, input.fileName);
    form.set('model', this.model);
    form.set('language', this.language);
    form.set('response_format', 'json');

    const response = await this.request(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(`OpenAI transcription returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
    }
    const text = body.text?.trim();
    if (!text) throw new Error('OpenAI transcription response did not contain text');
    return { text, model: this.model };
  }
}

async function readResponse(response: Response): Promise<OpenAITranscriptionResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as OpenAITranscriptionResponse;
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}
