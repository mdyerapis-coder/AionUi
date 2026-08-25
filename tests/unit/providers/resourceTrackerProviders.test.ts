import { describe, expect, it, vi } from 'vitest';
import { createProviderAdapters } from '@/process/services/resource-tracker/providers';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('resource tracker provider adapters', () => {
  it('reports OpenRouter remaining credits, usage and available models', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'a' }, { id: 'b' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { total_credits: 10, total_usage: 3.5 } }));
    const adapter = createProviderAdapters(fetchClient).find(({ id }) => id === 'openrouter');

    const result = await adapter?.inspect('secret', new AbortController().signal);

    expect(result?.balances).toEqual([{ currency: 'USD', amount: 6.5 }]);
    expect(result?.usage).toEqual({ currency: 'USD', amount: 3.5 });
    expect(result?.modelCount).toBe(2);
  });

  it('keeps OpenRouter available when a regular key cannot use the management-key credits endpoint', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'a' }] }))
      .mockResolvedValueOnce(jsonResponse({}, 403));
    const adapter = createProviderAdapters(fetchClient).find(({ id }) => id === 'openrouter');

    const result = await adapter?.inspect('secret', new AbortController().signal);

    expect(result).toMatchObject({ status: 'available', detail: 'balanceUnavailable', modelCount: 1 });
  });

  it('rejects an invalid OpenRouter key instead of masking it as a missing balance', async () => {
    const fetchClient = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401));
    const adapter = createProviderAdapters(fetchClient).find(({ id }) => id === 'openrouter');

    await expect(adapter?.inspect('bad-secret', new AbortController().signal)).rejects.toMatchObject({ status: 401 });
  });

  it('reports DeepSeek availability from its balance response', async () => {
    const fetchClient = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'deepseek-chat' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          is_available: false,
          balance_infos: [{ currency: 'USD', total_balance: '1.25' }],
        })
      );
    const adapter = createProviderAdapters(fetchClient).find(({ id }) => id === 'deepseek');

    const result = await adapter?.inspect('secret', new AbortController().signal);

    expect(result).toMatchObject({ status: 'unavailable', modelCount: 1 });
    expect(result?.balances).toEqual([{ currency: 'USD', amount: 1.25 }]);
  });
});
