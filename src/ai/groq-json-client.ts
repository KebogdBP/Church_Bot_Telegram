export interface GroqJsonClientOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  request?: typeof fetch;
}

export async function generateGroqJson(options: GroqJsonClientOptions, systemInstruction: string, input: string): Promise<unknown> {
  const response = await (options.request ?? fetch)(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: 'system', content: `${systemInstruction}\nВерни только один корректный JSON-объект без markdown.` }, { role: 'user', content: input }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  const raw = await response.text();
  let body: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
  if (!response.ok) throw new Error(`Groq returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq response did not contain text');
  try { return JSON.parse(content) as unknown; } catch { throw new Error('Groq response was not valid JSON'); }
}
