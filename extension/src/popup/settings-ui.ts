import { DEFAULT_RPC } from '../shared/constants';

export function renderSettingsTab(container: HTMLElement): void {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
    const rpcUrl = response?.ok ? (response.data as { rpcUrl: string }).rpcUrl : DEFAULT_RPC;

    container.innerHTML = `
      <div class="form-group" style="margin-bottom: 16px;">
        <label>RPC URL</label>
        <input type="text" id="pw-rpc-url" value="${escapeAttr(rpcUrl)}" placeholder="https://..." />
      </div>
      <button class="btn btn-secondary" id="pw-save-rpc">Save RPC</button>
      <div id="pw-settings-status" style="margin-top: 8px;"></div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #C8C0B0;">
        <div style="font-size: 9px; color: #8A8A8A; text-align: center; font-family: monospace; text-transform: uppercase; letter-spacing: 0.12em;">
          pooter world v0.1.0<br>
          Base Sepolia · Onchain<br>
          <a href="https://pooter.world" target="_blank" style="color: #1A1A1A; text-decoration: underline; text-underline-offset: 2px;">pooter.world</a>
        </div>
      </div>
    `;

    container.querySelector('#pw-save-rpc')?.addEventListener('click', () => {
      const url = (container.querySelector('#pw-rpc-url') as HTMLInputElement).value.trim();
      if (!url) return;

      chrome.runtime.sendMessage({ type: 'SET_RPC_URL', url }, (res) => {
        const statusEl = container.querySelector('#pw-settings-status');
        if (statusEl) {
          statusEl.className = `status ${res?.ok ? 'success' : 'error'}`;
          statusEl.textContent = res?.ok ? 'RPC saved' : 'Failed to save';
        }
      });
    });
  });
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
