export interface GroqJsonClientOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  request?: typeof fetch;
}

export async function generateGroqJson(options: GroqJsonClientOptions, systemInstruction: string, input: string): Promise<unknown> {
  const request = options.request ?? fetch;
  const requestBody = {
      model: options.model,
      messages: [{ role: 'system', content: `${systemInstruction}\nВерни только один корректный JSON-объект без markdown.` }, { role: 'user', content: input }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
  };
  let response = await request(`${options.baseUrl}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90_000),
  });
  let raw = await response.text();
  if (response.status === 400 && /failed_generation|failed to validate json/i.test(raw)) {
    response = await request(`${options.baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody, response_format: undefined, temperature: 0 }), signal: AbortSignal.timeout(90_000),
    });
    raw = await response.text();
  }
  let body: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  try { body = JSON.parse(raw) as typeof body; } catch { body = { error: { message: raw.slice(0, 500) } }; }
  if (!response.ok) throw new Error(`Groq returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq response did not contain text');
  try { return JSON.parse(content) as unknown; } catch { throw new Error('Groq response was not valid JSON'); }
}
