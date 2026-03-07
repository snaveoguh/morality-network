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

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #27272a;">
        <div style="font-size: 10px; color: #52525b; text-align: center;">
          pooter world v0.1.0<br>
          ETH Mainnet · Onchain interactions<br>
          <a href="https://pooter.world" target="_blank" style="color: #2F80ED; text-decoration: none;">pooter.world</a>
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
