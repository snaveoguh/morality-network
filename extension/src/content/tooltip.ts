import { TOOLTIP_DELAY_MS } from '../shared/constants';
import { shortenAddress, formatEth } from '../shared/entity';
import { BIAS_LABELS, BIAS_COLORS, FACTUALITY_COLORS } from '../shared/bias';
import type { EntityData } from '../shared/types';
import CSS from './styles.css';

let shadow: ShadowRoot | null = null;
let tooltipEl: HTMLElement | null = null;
let currentTarget: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function getShadow(): ShadowRoot {
  if (shadow) return shadow;

  const host = document.createElement('div');
  host.setAttribute('data-pw-root', 'tooltip');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'pw-tooltip';
  shadow.appendChild(tooltipEl);

  return shadow;
}

function renderTooltip(data: EntityData): string {
  const score = data.compositeScore > 0
    ? (data.compositeScore / 100).toFixed(1)
    : '—';

  const avgRating = data.avgRating > 0
    ? (data.avgRating / 100).toFixed(1)
    : '—';

  const stars = data.avgRating > 0
    ? renderStars(data.avgRating / 100)
    : '<span class="pw-stars">☆☆☆☆☆</span>';

  const tipStr = formatEth(data.tipTotal);

  // Shorten identifier for display
  let displayId = data.identifier;
  if (displayId.startsWith('0x') && displayId.length === 42) {
    displayId = shortenAddress(displayId);
  } else if (displayId.length > 40) {
    try {
      displayId = new URL(displayId).hostname;
    } catch {
      displayId = displayId.slice(0, 40) + '…';
    }
  }

  let biasHtml = '';
  if (data.bias) {
    const color = BIAS_COLORS[data.bias.bias];
    const factColor = FACTUALITY_COLORS[data.bias.factuality];
    biasHtml = `
      <div class="pw-tooltip-row" style="margin-top: 4px;">
        <span class="pw-tooltip-bias" style="background: ${color}22; color: ${color};">
          <span class="pw-tooltip-factuality" style="background: ${factColor};"></span>
          ${BIAS_LABELS[data.bias.bias]}
        </span>
        <span class="pw-tooltip-value" style="font-size: 10px; color: #71717a;">${data.bias.name}</span>
      </div>`;
  }

  return `
    <div class="pw-tooltip-header">
      <span class="pw-tooltip-score">${score}</span>
      <span class="pw-tooltip-id" title="${data.identifier}">${displayId}</span>
    </div>
    <div class="pw-tooltip-row">
      <span class="pw-tooltip-label">Rating</span>
      <span>${stars} <span class="pw-tooltip-value">${avgRating}</span></span>
    </div>
    <div class="pw-tooltip-row">
      <span class="pw-tooltip-label">Reviews</span>
      <span class="pw-tooltip-value">${data.ratingCount}</span>
    </div>
    <div class="pw-tooltip-row">
      <span class="pw-tooltip-label">Comments</span>
      <span class="pw-tooltip-value">${data.commentCount}</span>
    </div>
    <div class="pw-tooltip-row">
      <span class="pw-tooltip-label">Tips</span>
      <span class="pw-tooltip-value">${tipStr}</span>
    </div>
    ${biasHtml}
  `;
}

function renderStars(rating: number): string {
  let html = '<span class="pw-stars">';
  for (let i = 1; i <= 5; i++) {
    html += i <= Math.round(rating) ? '★' : '☆';
  }
  html += '</span>';
  return html;
}

function positionTooltip(target: HTMLElement): void {
  if (!tooltipEl) return;

  const rect = target.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left;

  // Keep within viewport
  const tooltipRect = tooltipEl.getBoundingClientRect();
  if (top + tooltipRect.height > window.innerHeight) {
    top = rect.top - tooltipRect.height - 8;
  }
  if (left + tooltipRect.width > window.innerWidth) {
    left = window.innerWidth - tooltipRect.width - 12;
  }
  if (left < 12) left = 12;

  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.left = `${left}px`;
}

function showTooltip(target: HTMLElement, data: EntityData): void {
  getShadow();
  if (!tooltipEl) return;

  tooltipEl.innerHTML = renderTooltip(data);
  positionTooltip(target);

  // Force reflow before adding visible class
  tooltipEl.offsetHeight;
  tooltipEl.classList.add('visible');
  currentTarget = target;
}

function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
  }
  currentTarget = null;
}

export function setupTooltip(): void {
  document.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement).closest?.('[data-pw-id]') as HTMLElement | null;
    if (!target || target === currentTarget) return;

    // Clear any pending hide
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    // Delay show
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      const identifier = target.dataset.pwId;
      if (!identifier) return;

      chrome.runtime.sendMessage(
        { type: 'GET_ENTITY_DATA', identifier },
        (response) => {
          if (response?.ok && response.data) {
            showTooltip(target, response.data as EntityData);
          }
        }
      );
    }, TOOLTIP_DELAY_MS);
  });

  document.addEventListener('mouseout', (e) => {
    const target = (e.target as HTMLElement).closest?.('[data-pw-id]') as HTMLElement | null;
    if (!target) return;

    if (showTimer) { clearTimeout(showTimer); showTimer = null; }

    hideTimer = setTimeout(() => {
      hideTooltip();
    }, 100);
  });
}
