export interface GeminiJsonClientOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  request?: typeof fetch;
}

export async function generateGeminiJson(
  options: GeminiJsonClientOptions,
  systemInstruction: string,
  input: string,
  responseSchema: Record<string, unknown>,
): Promise<unknown> {
  const request = options.request ?? fetch;
  const response = await request(`${options.baseUrl}/models/${encodeURIComponent(options.model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': options.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema },
    }),
  });
  const raw = await response.text();
  let body: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
  try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
  if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini response did not contain text');
  try { return JSON.parse(text) as unknown; } catch { throw new Error('Gemini response was not valid JSON'); }
}
