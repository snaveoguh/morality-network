/**
 * Username registration + lookup client.
 */

const API_BASE = 'https://pooter.world/api/username';

const usernameCache = new Map<string, string>(); // address → username

export async function registerUsername(
  username: string,
  evmAddress: string,
  solanaAddress: string | null,
  signMessage: (msg: string) => Promise<string>,
): Promise<{ success: boolean; error?: string }> {
  const message = `Register username "${username}" for pooter world`;
  const signature = await signMessage(message);

  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, evmAddress, solanaAddress, signature, message }),
  });

  const data = await res.json();
  if (data.success) {
    usernameCache.set(evmAddress.toLowerCase(), username);
  }
  return data;
}

export async function lookupByAddress(address: string): Promise<string | null> {
  const cached = usernameCache.get(address.toLowerCase());
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/lookup?address=${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.username) {
      usernameCache.set(address.toLowerCase(), data.username);
    }
    return data.username || null;
  } catch {
    return null;
  }
}

export async function lookupByUsername(username: string): Promise<{
  evmAddress: string;
  solanaAddress: string | null;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/lookup?username=${username}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
