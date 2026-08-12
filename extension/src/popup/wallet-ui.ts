import { formatEth, shortenAddress } from '../shared/entity';
import { sendMessageSafe, escapeHtml } from './messaging';
import type { AuthStatus, WalletInfo } from '../shared/types';

const CONFIRM_COUNT = 3;

export function renderWalletTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  void (async () => {
    const response = await sendMessageSafe<WalletInfo>({ type: 'GET_WALLET_INFO' }, 12000);
    if (!response.ok || !response.data) {
      container.innerHTML = `<div class="empty">${escapeHtml(!response.ok ? response.error : 'Failed to load wallet')}</div>`;
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

// ============================================================================
// SETUP — new wallets are mnemonic-based
// ============================================================================

function renderSetup(container: HTMLElement): void {
  container.innerHTML = `
    <div class="wallet-section">
      <div class="empty" style="padding: 20px 0;">No wallet yet</div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="pw-setup-pass" placeholder="Choose a password" />
      </div>
      <button class="btn btn-primary" id="pw-create">Create New Wallet</button>
      <button class="btn btn-secondary" id="pw-show-import">Import Existing</button>
      <div id="pw-import-section" style="display: none; margin-top: 12px;">
        <div class="form-group">
          <label>Recovery phrase (12 words)</label>
          <textarea id="pw-import-mnemonic" rows="3" placeholder="witness paper ink …" autocapitalize="none" spellcheck="false"></textarea>
        </div>
        <button class="btn btn-primary" id="pw-import-mnemonic-btn">Import Phrase</button>
        <div class="form-group" style="margin-top: 12px;">
          <label>Or a raw private key (legacy)</label>
          <input type="password" id="pw-import-key" placeholder="0x..." />
        </div>
        <button class="btn btn-secondary" id="pw-import">Import Key</button>
      </div>
      <div id="pw-setup-status"></div>
    </div>
  `;

  const getPass = (): string | null => {
    const pass = (container.querySelector('#pw-setup-pass') as HTMLInputElement).value;
    if (!pass || pass.length < 6) {
      showStatus(container, 'Password must be 6+ characters', true);
      return null;
    }
    return pass;
  };

  container.querySelector('#pw-show-import')?.addEventListener('click', () => {
    const section = container.querySelector('#pw-import-section') as HTMLElement;
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
  });

  container.querySelector('#pw-create')?.addEventListener('click', () => {
    void (async () => {
      const pass = getPass();
      if (!pass) return;

      const btn = container.querySelector('#pw-create') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Creating…';

      const res = await sendMessageSafe<{ address: string; mnemonic: string }>(
        { type: 'CREATE_WALLET', password: pass }, 20000,
      );
      if (res.ok && res.data?.mnemonic) {
        renderBackupFlow(container, res.data.address, res.data.mnemonic.split(' '));
      } else {
        showStatus(container, !res.ok ? res.error : 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Create New Wallet';
      }
    })();
  });

  container.querySelector('#pw-import-mnemonic-btn')?.addEventListener('click', () => {
    void (async () => {
      const pass = getPass();
      if (!pass) return;
      const mnemonic = (container.querySelector('#pw-import-mnemonic') as HTMLTextAreaElement).value.trim();
      if (!mnemonic) {
        showStatus(container, 'Enter your 12 words', true);
        return;
      }

      const btn = container.querySelector('#pw-import-mnemonic-btn') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Importing…';

      const res = await sendMessageSafe<{ address: string }>(
        { type: 'IMPORT_MNEMONIC', mnemonic, password: pass }, 20000,
      );
      if (res.ok) {
        renderWalletTab(container);
      } else {
        showStatus(container, res.error || 'Failed', true);
        btn.disabled = false;
        btn.textContent = 'Import Phrase';
      }
    })();
  });

  container.querySelector('#pw-import')?.addEventListener('click', () => {
    void (async () => {
      const pass = getPass();
      if (!pass) return;
      const key = (container.querySelector('#pw-import-key') as HTMLInputElement).value;
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
        btn.textContent = 'Import Key';
      }
    })();
  });
}

// ============================================================================
// BACKUP FLOW — show the 12 words once, then a 3-word check
// (mirrors web's WalletSetup: the check is the only defence against a user
// discovering months later that they never wrote the phrase down)
// ============================================================================

function pickIndices(size: number, n: number): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

function renderBackupFlow(container: HTMLElement, address: string, words: string[]): void {
  const wordListHtml = words
    .map((w, i) => `<li><span class="word-num">${i + 1}</span> ${escapeHtml(w)}</li>`)
    .join('');

  container.innerHTML = `
    <div class="wallet-section backup-section">
      <div class="backup-warning">Write these 12 words down — now</div>
      <p class="backup-copy">This is the only copy. It is not sent anywhere. Lose it and the wallet is gone permanently — nobody can recover it, including us.</p>
      <ol class="mnemonic-grid">${wordListHtml}</ol>
      <div class="wallet-address" style="margin-top: 10px;">${escapeHtml(address)}</div>
      <button class="btn btn-secondary" id="pw-copy-words">Copy all 12 words</button>
      <label class="backup-ack">
        <input type="checkbox" id="pw-ack" />
        <span>I have saved all 12 words and understand they cannot be recovered.</span>
      </label>
      <button class="btn btn-primary" id="pw-backup-continue" disabled>Continue</button>
      <div id="pw-setup-status"></div>
    </div>
  `;

  container.querySelector('#pw-copy-words')?.addEventListener('click', () => {
    void (async () => {
      const btn = container.querySelector('#pw-copy-words') as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(words.join(' '));
        btn.textContent = 'Copied — paste it somewhere safe';
        setTimeout(() => { btn.textContent = 'Copy all 12 words'; }, 4000);
      } catch {
        showStatus(container, 'Clipboard blocked — write the words down instead', true);
      }
    })();
  });

  const ack = container.querySelector('#pw-ack') as HTMLInputElement;
  const cont = container.querySelector('#pw-backup-continue') as HTMLButtonElement;
  ack.addEventListener('change', () => { cont.disabled = !ack.checked; });

  cont.addEventListener('click', () => {
    renderBackupCheck(container, words);
  });
}

function renderBackupCheck(container: HTMLElement, words: string[]): void {
  const challenge = pickIndices(words.length, CONFIRM_COUNT);

  const inputsHtml = challenge
    .map((wordIndex, i) => `
      <div class="form-group">
        <label>Word ${wordIndex + 1}</label>
        <input type="text" class="pw-check-word" data-i="${i}" autocomplete="off" autocapitalize="none" spellcheck="false" />
      </div>`)
    .join('');

  container.innerHTML = `
    <div class="wallet-section backup-section">
      <div class="backup-warning">Check your backup</div>
      <p class="backup-copy">The phrase is hidden now. Type these three words from your copy — this is the only way to be sure you really have it.</p>
      ${inputsHtml}
      <button class="btn btn-primary" id="pw-check-confirm">Confirm</button>
      <button class="btn btn-secondary" id="pw-check-back">Show the words again</button>
      <div id="pw-setup-status"></div>
    </div>
  `;

  container.querySelector('#pw-check-back')?.addEventListener('click', () => {
    void (async () => {
      // Re-derive display from the words still held in this closure.
      const res = await sendMessageSafe<WalletInfo>({ type: 'GET_WALLET_INFO' }, 8000);
      const address = (res.ok && res.data?.address) || '';
      renderBackupFlow(container, address, words);
    })();
  });

  container.querySelector('#pw-check-confirm')?.addEventListener('click', () => {
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('.pw-check-word'));
    const allCorrect = challenge.every(
      (wordIndex, i) => inputs[i]?.value.trim().toLowerCase() === words[wordIndex],
    );
    if (!allCorrect) {
      showStatus(container, "Those don't match. Check your copy and try again.", true);
      return;
    }
    renderWalletTab(container);
  });
}

// ============================================================================
// LOCKED / UNLOCKED
// ============================================================================

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
  const balStr = formatEth(info.balance === '?' ? '0' : toWeiSafe(info.balance));
  const typeLabel = info.walletType === 'mnemonic'
    ? 'Recovery phrase wallet'
    : 'Legacy key wallet — create a phrase wallet when you can';

  container.innerHTML = `
    <div class="wallet-section">
      <div class="wallet-address">${info.address || ''}</div>
      <div class="wallet-type-label">${typeLabel}</div>
      <div class="wallet-balance">
        <div class="wallet-balance-value">${info.balance === '?' ? '?' : balStr}</div>
        <div class="wallet-balance-label">Balance</div>
      </div>
      <button class="btn btn-secondary" id="pw-lock">Lock Wallet</button>
    </div>
    <div class="wallet-link" id="pw-link-section">
      <div class="wallet-section-head">pooter.world account</div>
      <div id="pw-link-body"><div class="loading"><div class="spinner"></div></div></div>
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

  renderLinkSection(container);

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
        setTimeout(() => renderWalletTab(container), 2000);
      } else {
        showStatus(container, res.error || 'Failed to send', true);
        btn.disabled = false;
        btn.textContent = 'Send ETH';
      }
    })();
  });
}

// ============================================================================
// ACCOUNT LINK (SIWE → pat_ token)
// ============================================================================

function renderLinkSection(container: HTMLElement): void {
  const body = container.querySelector('#pw-link-body') as HTMLElement | null;
  if (!body) return;

  void (async () => {
    const res = await sendMessageSafe<AuthStatus>({ type: 'GET_AUTH_STATUS' }, 8000);
    const status = res.ok ? res.data ?? null : null;

    if (status?.linked) {
      body.innerHTML = `
        <div class="wallet-link-status">Linked as ${status.address ? shortenAddress(status.address, 5) : 'unknown'}</div>
        <button class="btn btn-secondary" id="pw-unlink">Unlink</button>
      `;
      body.querySelector('#pw-unlink')?.addEventListener('click', () => {
        void (async () => {
          await sendMessageSafe({ type: 'UNLINK_ACCOUNT' }, 8000);
          renderLinkSection(container);
        })();
      });
      return;
    }

    body.innerHTML = `
      <p class="wallet-link-copy">Sign a message to link this wallet to your pooter.world account. Free — no transaction.</p>
      <button class="btn btn-primary" id="pw-link">Link account</button>
      <div id="pw-link-status"></div>
    `;
    body.querySelector('#pw-link')?.addEventListener('click', () => {
      void (async () => {
        const btn = body.querySelector('#pw-link') as HTMLButtonElement;
        const statusEl = body.querySelector('#pw-link-status');
        btn.disabled = true;
        btn.textContent = 'Linking…';

        const linkRes = await sendMessageSafe<{ address: string }>({ type: 'LINK_ACCOUNT' }, 25000);
        if (linkRes.ok) {
          renderLinkSection(container);
        } else {
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = linkRes.error || 'Linking failed';
          }
          btn.disabled = false;
          btn.textContent = 'Link account';
        }
      })();
    });
  })();
}

// ============================================================================
// HELPERS
// ============================================================================

function toWeiSafe(eth: string): string {
  const v = Number.parseFloat(eth);
  if (!Number.isFinite(v) || v <= 0) return '0';
  return String(BigInt(Math.round(v * 1e6)) * 10n ** 12n);
}

function showStatus(container: HTMLElement, message: string, isError: boolean): void {
  const el = container.querySelector('#pw-setup-status');
  if (!el) return;
  el.className = `status ${isError ? 'error' : 'success'}`;
  el.textContent = message;
}
