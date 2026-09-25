export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageProvider {
  generate(prompt: string): Promise<GeneratedImage>;
}

export class FallbackImageProvider implements ImageProvider {
  public constructor(
    private readonly providers: ImageProvider[],
    private readonly onFallback?: (error: unknown) => void,
  ) {}

  public async generate(prompt: string): Promise<GeneratedImage> {
    let lastError: unknown = new Error('No image provider is configured');
    for (const provider of this.providers) {
      try {
        return await provider.generate(prompt);
      } catch (error) {
        lastError = error;
        this.onFallback?.(error);
      }
    }
    throw lastError;
  }
}
