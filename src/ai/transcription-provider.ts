export interface TranscriptionInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
}

export interface TranscriptionResult {
  text: string;
  model: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
