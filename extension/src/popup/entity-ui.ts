import { shortenAddress, formatEth } from '../shared/entity';
import { BIAS_LABELS, BIAS_COLORS, FACTUALITY_LABELS, FACTUALITY_COLORS } from '../shared/bias';
import type { EntityData } from '../shared/types';

export function renderEntityTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  chrome.runtime.sendMessage({ type: 'GET_CURRENT_PAGE_DATA' }, (response) => {
    if (!response?.ok || !response.data) {
      container.innerHTML = '<div class="empty">No page data available</div>';
      return;
    }

    const data = response.data as EntityData;
    const score = data.compositeScore > 0 ? (data.compositeScore / 100).toFixed(1) : '—';
    const avgRating = data.avgRating > 0 ? (data.avgRating / 100).toFixed(1) : '—';
    const tipStr = formatEth(data.tipTotal);

    let displayId = data.identifier;
    try { displayId = new URL(displayId).hostname; } catch { /* keep as-is */ }

    let biasHtml = '';
    if (data.bias) {
      const color = BIAS_COLORS[data.bias.bias];
      const factColor = FACTUALITY_COLORS[data.bias.factuality];
      biasHtml = `
        <div class="entity-bias">
          <div class="entity-bias-label">Media Bias</div>
          <div class="entity-bias-value" style="color: ${color};">${BIAS_LABELS[data.bias.bias]}</div>
          <div style="font-size: 11px; color: #71717a; margin-top: 2px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${factColor}; margin-right: 4px;"></span>
            ${FACTUALITY_LABELS[data.bias.factuality]} factuality
          </div>
          ${data.bias.ownership ? `<div style="font-size: 10px; color: #52525b; margin-top: 4px;">${data.bias.ownership}</div>` : ''}
        </div>`;
    }

    const starsHtml = [1, 2, 3, 4, 5].map(i =>
      `<button class="star-btn" data-score="${i}">☆</button>`
    ).join('');

    container.innerHTML = `
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
      <div class="entity-stars">${starsHtml}</div>
      ${biasHtml}
    `;

    // Wire rating stars
    container.querySelectorAll('.star-btn').forEach((star) => {
      star.addEventListener('click', () => {
        const scoreVal = Number((star as HTMLElement).dataset.score);
        if (!scoreVal || !data.entityHash) return;

        chrome.runtime.sendMessage(
          { type: 'RATE_ENTITY', entityHash: data.entityHash, score: scoreVal },
          (res) => {
            if (res?.ok) {
              container.querySelectorAll('.star-btn').forEach((s, i) => {
                s.textContent = i < scoreVal ? '★' : '☆';
                s.classList.toggle('active', i < scoreVal);
              });
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
