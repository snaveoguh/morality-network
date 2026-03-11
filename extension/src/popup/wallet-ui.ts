import { formatEth, shortenAddress } from '../shared/entity';
import type { WalletInfo } from '../shared/types';

export function renderWalletTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  void (async () => {
    const response = await sendMessageSafe<WalletInfo>({ type: 'GET_WALLET_INFO' }, 12000);
    if (!response.ok || !response.data) {
      container.innerHTML = `<div class="empty">${escapeHtml(response.error || 'Failed to load wallet')}</div>`;
      return;
    }

    const info = response.data;
    if (!info.hasWallet) {
      renderSetup(container);
    } else if (info.isLocked) {
      renderLocked(container, info);
    } else {
      renderUnlocked(container, info);
    }
  })();
}

function renderSetup(container: HTMLElement): void {
  container.innerHTML = `
    <div class="wallet-section">
      <div class="empty" style="padding: 20px 0;">No wallet yet</div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="pw-setup-pass" placeholder="Choose a password" />
      </div>
      <button class="btn btn-primary" id="pw-create">Create New Wallet</button>
      <button class="btn btn-secondary" id="pw-show-import">Import Private Key</button>
      <div id="pw-import-section" style="display: none; margin-top: 12px;">
        <div class="form-group">
          <label>Private Key</label>
          <input type="password" id="pw-import-key" placeholder="0x..." />
        </div>
        <button class="btn btn-primary" id="pw-import">Import</button>
      </div>
      <div id="pw-setup-status"></div>
    </div>
  `;

  container.querySelector('#pw-show-import')?.addEventListener('click', () => {
    const section = container.querySelector('#pw-import-section') as HTMLElement;
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
  });

  container.querySelector('#pw-create')?.addEventListener('click', () => {
    void (async () => {
    const pass = (container.querySelector('#pw-setup-pass') as HTMLInputElement).value;
    if (!pass || pass.length < 6) {
      showStatus(container, 'Password must be 6+ characters', true);
      return;
    }

    const btn = container.querySelector('#pw-create') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Creating…';

      const res = await sendMessageSafe<{ address: string }>({ type: 'CREATE_WALLET', password: pass }, 20000);
      if (res.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res.error || 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Create New Wallet';
      }
    })();
  });

  container.querySelector('#pw-import')?.addEventListener('click', () => {
    void (async () => {
    const pass = (container.querySelector('#pw-setup-pass') as HTMLInputElement).value;
    const key = (container.querySelector('#pw-import-key') as HTMLInputElement).value;
    if (!pass || pass.length < 6) {
      showStatus(container, 'Password must be 6+ characters', true);
      return;
    }
    if (!key || !key.startsWith('0x')) {
      showStatus(container, 'Invalid private key', true);
      return;
    }

    const btn = container.querySelector('#pw-import') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Importing…';

      const res = await sendMessageSafe<{ address: string }>({
        type: 'IMPORT_WALLET',
        privateKey: key,
        password: pass,
      }, 20000);
      if (res.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res.error || 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    })();
  });
}

function renderLocked(container: HTMLElement, info: WalletInfo): void {
  container.innerHTML = `
    <div class="wallet-section">
      <div class="wallet-address">${info.address ? shortenAddress(info.address, 6) : 'Locked'}</div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="pw-unlock-pass" placeholder="Enter password" />
      </div>
      <button class="btn btn-primary" id="pw-unlock">Unlock</button>
      <div id="pw-setup-status"></div>
    </div>
  `;

  const passInput = container.querySelector('#pw-unlock-pass') as HTMLInputElement;
  const unlockBtn = container.querySelector('#pw-unlock') as HTMLButtonElement;

  const doUnlock = () => {
    void (async () => {
    const pass = passInput.value;
    if (!pass) return;

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Unlocking…';

      const res = await sendMessageSafe<{ address: string }>({ type: 'UNLOCK_WALLET', password: pass }, 20000);
      if (res.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res.error || 'Wrong password', true);
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock';
      }
    })();
  };

  unlockBtn.addEventListener('click', doUnlock);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
}

function renderUnlocked(container: HTMLElement, info: WalletInfo): void {
  const balStr = formatEth(info.balance);

  container.innerHTML = `
    <div class="wallet-section">
      <div class="wallet-address">${info.address || ''}</div>
      <div class="wallet-balance">
        <div class="wallet-balance-value">${balStr}</div>
        <div class="wallet-balance-label">Balance</div>
      </div>
      <button class="btn btn-secondary" id="pw-lock">Lock Wallet</button>
    </div>
    <div class="wallet-send">
      <div class="form-group">
        <label>Send To</label>
        <input type="text" id="pw-send-to" placeholder="0x..." />
      </div>
      <div class="form-group">
        <label>Amount (ETH)</label>
        <input type="text" id="pw-send-amt" placeholder="0.01" />
      </div>
      <button class="btn btn-primary" id="pw-send">Send ETH</button>
      <div id="pw-setup-status"></div>
    </div>
  `;

  container.querySelector('#pw-lock')?.addEventListener('click', () => {
    void (async () => {
      await sendMessageSafe({ type: 'LOCK_WALLET' }, 8000);
      renderWalletTab(container);
    })();
  });

  container.querySelector('#pw-send')?.addEventListener('click', () => {
    void (async () => {
    const to = (container.querySelector('#pw-send-to') as HTMLInputElement).value;
    const amt = (container.querySelector('#pw-send-amt') as HTMLInputElement).value;

    if (!to || !to.startsWith('0x') || to.length !== 42) {
      showStatus(container, 'Invalid address', true);
      return;
    }

    const ethVal = parseFloat(amt);
    if (isNaN(ethVal) || ethVal <= 0) {
      showStatus(container, 'Invalid amount', true);
      return;
    }

    const weiStr = String(BigInt(Math.floor(ethVal * 1e18)));
    const btn = container.querySelector('#pw-send') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Sending…';

      const res = await sendMessageSafe<{ txHash: string }>({ type: 'SEND_ETH', to, amountWei: weiStr }, 20000);
      if (res.ok) {
        showStatus(container, 'Transaction sent!', false);
        btn.textContent = 'Send ETH';
        btn.disabled = false;
        // Refresh balance
        setTimeout(() => renderWalletTab(container), 2000);
      } else {
        showStatus(container, res.error || 'Failed to send', true);
        btn.disabled = false;
        btn.textContent = 'Send ETH';
      }
    })();
  });
}

function showStatus(container: HTMLElement, message: string, isError: boolean): void {
  const el = container.querySelector('#pw-setup-status');
  if (!el) return;
  el.className = `status ${isError ? 'error' : 'success'}`;
  el.textContent = message;
}

type BgResponse<T> = { ok: true; data?: T } | { ok: false; error: string };

function sendMessageSafe<T = unknown>(message: unknown, timeoutMs = 10000): Promise<BgResponse<T>> {
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
