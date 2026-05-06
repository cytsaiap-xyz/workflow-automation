const LOOPBACK = ['localhost', '127.0.0.1', '::1'];

export function parseAllowlist(value: string | undefined): string[] {
  if (!value || value.trim() === '') return [...LOOPBACK];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null || !Number.isInteger(bits)) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isHostAllowed(url: string, allowlist: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      if (ipMatchesCidr(host, entry)) return true;
    } else {
      if (host === entry || host.endsWith('.' + entry)) return true;
    }
  }
  return false;
}

export function getEnvAllowlist(): string[] {
  const list = parseAllowlist(process.env.HTTP_ALLOWLIST);
  // Always allow vLLM if its host isn't already on the list.
  const vllm = process.env.VLLM_BASE_URL;
  if (vllm) {
    try {
      const h = new URL(vllm).hostname;
      if (!list.includes(h)) list.push(h);
    } catch { /* ignore */ }
  }
  return list;
}
