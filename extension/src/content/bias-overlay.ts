import { getSourceBias, BIAS_LABELS, BIAS_COLORS, FACTUALITY_LABELS, FACTUALITY_COLORS, BIAS_SHORT } from '../shared/bias';
import type { SourceBias } from '../shared/bias';
import CSS from './styles.css';

let shadow: ShadowRoot | null = null;

const BIAS_ORDER = ['far-left', 'left', 'lean-left', 'center', 'lean-right', 'right', 'far-right'] as const;

function renderBiasBar(bias: string): string {
  return BIAS_ORDER.map(b =>
    `<div class="pw-bias-bar-seg ${b === bias ? 'active' : ''}" style="background: ${BIAS_COLORS[b]};"></div>`
  ).join('');
}

export function setupBiasOverlay(): void {
  const hostname = window.location.hostname.replace(/^www\./, '');
  const source = getSourceBias(hostname);
  if (!source) return;

  const host = document.createElement('div');
  host.setAttribute('data-pw-root', 'bias');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'pw-bias-overlay';
  overlay.innerHTML = `
    <div>
      <div class="pw-bias-name">${source.name}</div>
      <div class="pw-bias-detail">${BIAS_LABELS[source.bias]} · ${FACTUALITY_LABELS[source.factuality]} factuality</div>
      ${source.ownership ? `<div class="pw-bias-detail">${source.ownership} · ${source.country || ''}</div>` : ''}
    </div>
    <div>
      <div class="pw-bias-bar">${renderBiasBar(source.bias)}</div>
      <div class="pw-bias-detail" style="text-align: center; margin-top: 2px; color: ${BIAS_COLORS[source.bias]}; font-weight: 600;">
        ${BIAS_SHORT[source.bias]}
      </div>
    </div>
  `;

  shadow.appendChild(overlay);
}
