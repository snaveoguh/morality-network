import { EXTENSION_VERSION, type ApiTarget, type NetworkId } from '../shared/constants';
import { sendMessageSafe, escapeAttr, escapeHtml } from './messaging';

interface Settings {
  rpcUrl: string;
  networkId: NetworkId;
  chainId: number;
  chainName: string;
  networks: { id: NetworkId; name: string; chainId: number }[];
  apiTarget: ApiTarget;
  version: string;
}

export function renderSettingsTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  void (async () => {
    const res = await sendMessageSafe<Settings>({ type: 'GET_SETTINGS' }, 8000);
    if (!res.ok || !res.data) {
      container.innerHTML = `<div class="empty">${escapeHtml(!res.ok ? res.error : 'Failed to load settings')}</div>`;
      return;
    }
    const s = res.data;

    const networkOptions = s.networks
      .map(n => `<option value="${n.id}" ${n.id === s.networkId ? 'selected' : ''}>${escapeHtml(n.name)} (${n.chainId})</option>`)
      .join('');

    container.innerHTML = `
      <div class="form-group" style="margin-bottom: 16px;">
        <label>Network</label>
        <select id="pw-network">${networkOptions}</select>
      </div>
      <div class="form-group" style="margin-bottom: 16px;">
        <label>RPC URL (${escapeHtml(s.chainName)})</label>
        <input type="text" id="pw-rpc-url" value="${escapeAttr(s.rpcUrl)}" placeholder="https://..." />
      </div>
      <button class="btn btn-secondary" id="pw-save-rpc">Save RPC</button>
      <div class="form-group" style="margin-top: 16px; margin-bottom: 16px;">
        <label>pooter.world API</label>
        <select id="pw-api-target">
          <option value="prod" ${s.apiTarget === 'prod' ? 'selected' : ''}>pooter.world</option>
          <option value="dev" ${s.apiTarget === 'dev' ? 'selected' : ''}>dev.pooter.world</option>
        </select>
      </div>
      <div id="pw-settings-status" style="margin-top: 8px;"></div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #C8C0B0;">
        <div style="font-size: 9px; color: #8A8A8A; text-align: center; font-family: monospace; text-transform: uppercase; letter-spacing: 0.12em;">
          pooter world v${escapeHtml(s.version || EXTENSION_VERSION)}<br>
          ${escapeHtml(s.chainName)} · Onchain<br>
          <a href="https://pooter.world" target="_blank" style="color: #1A1A1A; text-decoration: underline; text-underline-offset: 2px;">pooter.world</a>
        </div>
      </div>
    `;

    const showStatus = (message: string, isError: boolean) => {
      const statusEl = container.querySelector('#pw-settings-status');
      if (statusEl) {
        statusEl.className = `status ${isError ? 'error' : 'success'}`;
        statusEl.textContent = message;
      }
    };

    container.querySelector('#pw-network')?.addEventListener('change', () => {
      void (async () => {
        const networkId = (container.querySelector('#pw-network') as HTMLSelectElement).value as NetworkId;
        const setRes = await sendMessageSafe({ type: 'SET_NETWORK', networkId }, 8000);
        if (setRes.ok) {
          renderSettingsTab(container); // refresh — RPC field follows the network
        } else {
          showStatus(setRes.error || 'Failed to switch network', true);
        }
      })();
    });

    container.querySelector('#pw-api-target')?.addEventListener('change', () => {
      void (async () => {
        const target = (container.querySelector('#pw-api-target') as HTMLSelectElement).value as ApiTarget;
        const setRes = await sendMessageSafe({ type: 'SET_API_TARGET', target }, 8000);
        showStatus(setRes.ok ? 'API target saved' : setRes.error || 'Failed to save', !setRes.ok);
      })();
    });

    container.querySelector('#pw-save-rpc')?.addEventListener('click', () => {
      void (async () => {
        const url = (container.querySelector('#pw-rpc-url') as HTMLInputElement).value.trim();
        if (!url) return;
        const setRes = await sendMessageSafe({ type: 'SET_RPC_URL', url }, 8000);
        showStatus(setRes.ok ? 'RPC saved' : 'Failed to save', !setRes.ok);
      })();
    });
  })();
}
