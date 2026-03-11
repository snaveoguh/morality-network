import { shortenAddress, formatEth } from '../shared/entity';
import { BIAS_LABELS, BIAS_COLORS, FACTUALITY_LABELS, FACTUALITY_COLORS } from '../shared/bias';
import type { EntityData, WalletInfo } from '../shared/types';

export function renderEntityTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  // Fetch wallet status + page data in parallel
  Promise.all([
    new Promise<WalletInfo | null>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_WALLET_INFO' }, (res) => {
        resolve(res?.ok ? res.data as WalletInfo : null);
      });
    }),
    new Promise<{ data: EntityData | null; tab: chrome.tabs.Tab | null }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_PAGE_DATA' }, (res) => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          resolve({
            data: res?.ok ? res.data as EntityData : null,
            tab: tab ?? null,
          });
        });
      });
    }),
  ]).then(([wallet, { data, tab }]) => {
    if (!data) {
      container.innerHTML = '<div class="empty">No page data available</div>';
      return;
    }

    const score = data.compositeScore > 0 ? (data.compositeScore / 100).toFixed(1) : '—';
    const avgRating = data.avgRating > 0 ? (data.avgRating / 100).toFixed(1) : '—';
    const tipStr = formatEth(data.tipTotal);

    // Richer page context
    const pageTitle = tab?.title || '';
    let displayId = data.identifier;
    let pageHost = '';
    try {
      const url = new URL(displayId);
      pageHost = url.hostname;
      displayId = url.hostname;
    } catch { /* keep as-is */ }

    const isPooterWorld = pageHost === 'pooter.world' || pageHost === 'www.pooter.world';
    const isOnArticle = tab?.url?.includes('/article/') ?? false;

    // Page context section — shows more info about where you are
    let contextHtml = '';
    if (pageTitle && pageTitle !== displayId) {
      contextHtml = `<div class="entity-context">${escapeHtml(pageTitle)}</div>`;
    }

    // Pooter.world badge when on site
    if (isPooterWorld) {
      contextHtml += `<div class="entity-site-badge">
        <span class="site-badge-dot"></span>
        pooter.world${isOnArticle ? ' · article' : ''}
      </div>`;
    }

    // Wallet status bar
    let walletBarHtml = '';
    if (!wallet?.hasWallet) {
      walletBarHtml = `<div class="entity-wallet-bar warning">No wallet — create one in the Wallet tab to rate</div>`;
    } else if (wallet.isLocked) {
      walletBarHtml = `<div class="entity-wallet-bar warning">Wallet locked — unlock to rate</div>`;
    }

    let biasHtml = '';
    if (data.bias) {
      const color = BIAS_COLORS[data.bias.bias];
      const factColor = FACTUALITY_COLORS[data.bias.factuality];
      biasHtml = `
        <div class="entity-bias">
          <div class="entity-bias-label">Media Bias</div>
          <div class="entity-bias-value" style="color: ${color};">${BIAS_LABELS[data.bias.bias]}</div>
          <div style="font-size: 11px; color: #8A8A8A; margin-top: 2px; font-family: monospace;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 0; background: ${factColor}; margin-right: 4px;"></span>
            ${FACTUALITY_LABELS[data.bias.factuality]} factuality
          </div>
          ${data.bias.ownership ? `<div style="font-size: 10px; color: #8A8A8A; margin-top: 4px; font-family: monospace;">${data.bias.ownership}</div>` : ''}
        </div>`;
    }

    const starsHtml = [1, 2, 3, 4, 5].map(i =>
      `<button class="star-btn" data-score="${i}">☆</button>`
    ).join('');

    container.innerHTML = `
      ${contextHtml}
      <div class="entity-score">
        <div class="entity-score-value">${score}</div>
        <div class="entity-score-label">MO Score</div>
      </div>
      <div class="entity-id">${displayId}</div>
      <div class="entity-stats">
        <div class="entity-stat">
          <div class="entity-stat-value">${avgRating}</div>
          <div class="entity-stat-label">Avg Rating</div>
        </div>
        <div class="entity-stat">
          <div class="entity-stat-value">${data.ratingCount}</div>
          <div class="entity-stat-label">Reviews</div>
        </div>
        <div class="entity-stat">
          <div class="entity-stat-value">${data.commentCount}</div>
          <div class="entity-stat-label">Comments</div>
        </div>
        <div class="entity-stat">
          <div class="entity-stat-value">${tipStr}</div>
          <div class="entity-stat-label">Tips</div>
        </div>
      </div>
      ${walletBarHtml}
      <div class="entity-stars">${starsHtml}</div>
      <div id="rating-status"></div>
      ${biasHtml}
    `;

    // Wire rating stars
    container.querySelectorAll('.star-btn').forEach((star) => {
      star.addEventListener('click', () => {
        const scoreVal = Number((star as HTMLElement).dataset.score);
        if (!scoreVal || !data.entityHash) return;

        const statusEl = container.querySelector('#rating-status');

        // Pre-check wallet status
        if (!wallet?.hasWallet) {
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = 'Create a wallet first (Wallet tab)';
          }
          return;
        }
        if (wallet.isLocked) {
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = 'Unlock your wallet first (Wallet tab)';
          }
          return;
        }

        // Show pending state
        if (statusEl) {
          statusEl.className = 'status';
          statusEl.textContent = 'Submitting rating onchain...';
        }

        chrome.runtime.sendMessage(
          { type: 'RATE_ENTITY', entityHash: data.entityHash, score: scoreVal },
          (res) => {
            if (res?.ok) {
              container.querySelectorAll('.star-btn').forEach((s, i) => {
                s.textContent = i < scoreVal ? '★' : '☆';
                s.classList.toggle('active', i < scoreVal);
              });
              if (statusEl) {
                statusEl.className = 'status success';
                statusEl.textContent = `Rated ${scoreVal}/5 onchain`;
              }

              // Notify pooter.world if we're on it — site can refresh its data
              if (isPooterWorld) {
                chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
                  if (activeTab?.id) {
                    chrome.tabs.sendMessage(activeTab.id, {
                      type: 'POOTER_EXTENSION_RATED',
                      entityHash: data.entityHash,
                      score: scoreVal,
                    });
                  }
                });
              }
            } else {
              if (statusEl) {
                statusEl.className = 'status error';
                statusEl.textContent = res?.error || 'Rating failed';
              }
            }
          }
        );
      });

      star.addEventListener('mouseenter', () => {
        const scoreVal = Number((star as HTMLElement).dataset.score);
        container.querySelectorAll('.star-btn').forEach((s, i) => {
          s.textContent = i < scoreVal ? '★' : '☆';
        });
      });

      star.addEventListener('mouseleave', () => {
        container.querySelectorAll('.star-btn').forEach((s) => {
          s.textContent = s.classList.contains('active') ? '★' : '☆';
        });
      });
    });
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
