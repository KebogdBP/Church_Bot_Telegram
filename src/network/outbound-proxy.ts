import { ProxyAgent, setGlobalDispatcher } from 'undici';

let proxyAgent: ProxyAgent | undefined;

export function configureOutboundProxy(proxyUrl: string | undefined): void {
  if (!proxyUrl) return;
  const url = new URL(proxyUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('OUTBOUND_PROXY_URL must use http or https');
  proxyAgent?.close().catch(() => undefined);
  proxyAgent = new ProxyAgent(url.href);
  setGlobalDispatcher(proxyAgent);
}
