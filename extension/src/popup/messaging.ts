// Shared popup → background messaging with timeouts, plus small HTML helpers.

export type BgResponse<T> = { ok: true; data?: T } | { ok: false; error: string };

export function sendMessageSafe<T = unknown>(message: unknown, timeoutMs = 10000): Promise<BgResponse<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'Request timed out. Try again.' });
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || 'Extension unavailable' });
          return;
        }

        if (!response) {
          resolve({ ok: false, error: 'No response from extension' });
          return;
        }

        resolve(response as BgResponse<T>);
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function errorOf(response: BgResponse<unknown>, fallback: string): string {
  return response.ok ? fallback : response.error || fallback;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
