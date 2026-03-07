import { formatEth, shortenAddress } from '../shared/entity';
import type { WalletInfo } from '../shared/types';

export function renderWalletTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  chrome.runtime.sendMessage({ type: 'GET_WALLET_INFO' }, (response) => {
    if (!response?.ok) {
      container.innerHTML = '<div class="empty">Failed to load wallet</div>';
      return;
    }

    const info = response.data as WalletInfo;

    if (!info.hasWallet) {
      renderSetup(container);
    } else if (info.isLocked) {
      renderLocked(container, info);
    } else {
      renderUnlocked(container, info);
    }
  });
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
    const pass = (container.querySelector('#pw-setup-pass') as HTMLInputElement).value;
    if (!pass || pass.length < 6) {
      showStatus(container, 'Password must be 6+ characters', true);
      return;
    }

    const btn = container.querySelector('#pw-create') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Creating…';

    chrome.runtime.sendMessage({ type: 'CREATE_WALLET', password: pass }, (res) => {
      if (res?.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res?.error || 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Create New Wallet';
      }
    });
  });

  container.querySelector('#pw-import')?.addEventListener('click', () => {
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

    chrome.runtime.sendMessage({ type: 'IMPORT_WALLET', privateKey: key, password: pass }, (res) => {
      if (res?.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res?.error || 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    });
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
    const pass = passInput.value;
    if (!pass) return;

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Unlocking…';

    chrome.runtime.sendMessage({ type: 'UNLOCK_WALLET', password: pass }, (res) => {
      if (res?.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res?.error || 'Wrong password', true);
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock';
      }
    });
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
    chrome.runtime.sendMessage({ type: 'LOCK_WALLET' }, () => {
      renderWalletTab(container);
    });
  });

  container.querySelector('#pw-send')?.addEventListener('click', () => {
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

    chrome.runtime.sendMessage({ type: 'SEND_ETH', to, amountWei: weiStr }, (res) => {
      if (res?.ok) {
        showStatus(container, 'Transaction sent!', false);
        btn.textContent = 'Send ETH';
        btn.disabled = false;
        // Refresh balance
        setTimeout(() => renderWalletTab(container), 2000);
      } else {
        showStatus(container, res?.error || 'Failed to send', true);
        btn.disabled = false;
        btn.textContent = 'Send ETH';
      }
    });
  });
}

function showStatus(container: HTMLElement, message: string, isError: boolean): void {
  const el = container.querySelector('#pw-setup-status');
  if (!el) return;
  el.className = `status ${isError ? 'error' : 'success'}`;
  el.textContent = message;
}
