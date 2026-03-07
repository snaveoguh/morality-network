import { shortenAddress, formatEth, timeAgo, computeEntityHash } from '../shared/entity';
import { deriveTagsFromIdentifier } from '../shared/known-entities';
import { showToast } from './toast';
import type { EntityData, CommentData } from '../shared/types';
import CSS from './styles.css';

let shadow: ShadowRoot | null = null;
let panelEl: HTMLElement | null = null;
let currentEntityHash: string | null = null;
let currentIdentifier: string | null = null;

const TIP_AMOUNTS = ['0.001', '0.005', '0.01', '0.05'];

function getShadow(): ShadowRoot {
  if (shadow) return shadow;

  const host = document.createElement('div');
  host.setAttribute('data-pw-root', 'panel');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  panelEl = document.createElement('div');
  panelEl.className = 'pw-panel';
  shadow.appendChild(panelEl);

  return shadow;
}

function renderPanel(data: EntityData, comments: CommentData[]): string {
  const score = data.compositeScore > 0 ? (data.compositeScore / 100).toFixed(1) : '—';
  const avgRating = data.avgRating > 0 ? (data.avgRating / 100).toFixed(1) : '—';
  const tipStr = formatEth(data.tipTotal);

  let displayId = data.identifier;
  if (displayId.startsWith('0x') && displayId.length === 42) {
    displayId = shortenAddress(displayId);
  } else if (displayId.length > 50) {
    try { displayId = new URL(displayId).hostname + new URL(displayId).pathname.slice(0, 20); }
    catch { displayId = displayId.slice(0, 50) + '…'; }
  }

  const commentsHtml = comments.length > 0
    ? comments.map(c => renderComment(c)).join('')
    : '<div class="pw-empty">No comments yet. Start the conversation.</div>';

  // Build tags from data-pw-tags if available
  const tagsHtml = data.identifier ? deriveTagsHtml(data.identifier) : '';

  const starsHtml = [1, 2, 3, 4, 5].map(i =>
    `<button class="pw-rate-star" data-score="${i}">☆</button>`
  ).join('');

  const tipBtns = TIP_AMOUNTS.map(amt =>
    `<button class="pw-tip-btn" data-tip="${amt}">${amt} ETH</button>`
  ).join('');

  return `
    <div class="pw-panel-header">
      <span class="pw-panel-title" title="${data.identifier}">${displayId}</span>
      <button class="pw-panel-close" id="pw-close">×</button>
    </div>
    ${tagsHtml}
    <div class="pw-panel-stats">
      <div class="pw-stat"><div class="pw-stat-value">${score}</div><div class="pw-stat-label">Score</div></div>
      <div class="pw-stat"><div class="pw-stat-value">${avgRating}</div><div class="pw-stat-label">Rating</div></div>
      <div class="pw-stat"><div class="pw-stat-value">${data.commentCount}</div><div class="pw-stat-label">Comments</div></div>
      <div class="pw-stat"><div class="pw-stat-value">${tipStr}</div><div class="pw-stat-label">Tips</div></div>
    </div>
    <div class="pw-rate-row">
      ${starsHtml}
      <span class="pw-rate-label">Rate this entity</span>
    </div>
    <div class="pw-rate-reason">
      <input type="text" id="pw-reason" placeholder="Add a reason for your rating (optional)" maxlength="500" />
    </div>
    <div class="pw-tip-row">
      ${tipBtns}
    </div>
    <div class="pw-comments" id="pw-comments">
      ${commentsHtml}
    </div>
    <div class="pw-compose">
      <textarea id="pw-input" placeholder="Add a comment (onchain, permanent)..." maxlength="2000"></textarea>
      <div class="pw-compose-footer">
        <span class="pw-compose-tip">Stored onchain · gas required</span>
        <button class="pw-compose-btn" id="pw-submit" disabled>Post</button>
      </div>
    </div>
  `;
}

function renderComment(c: CommentData): string {
  return `
    <div class="pw-comment" data-comment-id="${c.id}">
      <div class="pw-comment-header">
        <span class="pw-comment-author">${shortenAddress(c.author)}</span>
        <span class="pw-comment-time">${timeAgo(c.timestamp)}</span>
      </div>
      <div class="pw-comment-text">${escapeHtml(c.content)}</div>
      <div class="pw-comment-actions">
        <button class="pw-comment-btn" data-vote="1">▲</button>
        <span class="pw-comment-score">${c.score}</span>
        <button class="pw-comment-btn" data-vote="-1">▼</button>
        <button class="pw-comment-btn" data-tip-comment="${c.id}">tip</button>
        ${c.tipTotal !== '0' ? `<span style="color: #31F387; font-size: 10px;">${formatEth(c.tipTotal)}</span>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function wireEvents(): void {
  if (!panelEl || !shadow) return;

  // Close button
  shadow.getElementById('pw-close')?.addEventListener('click', closePanel);

  // Submit comment
  const input = shadow.getElementById('pw-input') as HTMLTextAreaElement | null;
  const submitBtn = shadow.getElementById('pw-submit') as HTMLButtonElement | null;

  input?.addEventListener('input', () => {
    if (submitBtn) submitBtn.disabled = !input.value.trim();
  });

  submitBtn?.addEventListener('click', async () => {
    if (!input || !currentEntityHash || !input.value.trim()) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting…';

      chrome.runtime.sendMessage(
      { type: 'SUBMIT_COMMENT', entityHash: currentEntityHash, content: input.value.trim(), parentId: 0 },
      (response) => {
        if (response?.ok) {
          showToast('Comment posted onchain');
          input.value = '';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Post';
          refreshComments();
        } else {
          showToast(response?.error || 'Failed to post', true);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post';
        }
      }
    );
  });

  // Rating stars
  shadow.querySelectorAll('.pw-rate-star').forEach((star) => {
    star.addEventListener('click', () => {
      const score = Number((star as HTMLElement).dataset.score);
      if (!currentEntityHash || !score) return;

      const reasonInput = shadow!.getElementById('pw-reason') as HTMLInputElement | null;
      const reason = reasonInput?.value?.trim() || '';
      if (reason.length > 500) {
        showToast('Reason too long (max 500 chars)', true);
        return;
      }

      const msg = reason
        ? { type: 'RATE_WITH_REASON' as const, entityHash: currentEntityHash, score, reason }
        : { type: 'RATE_ENTITY' as const, entityHash: currentEntityHash, score };

      chrome.runtime.sendMessage(msg, (response) => {
          if (response?.ok) {
            showToast(`Rated ${score}/5 onchain${reason ? ' with reason' : ''}`);
            if (reasonInput) reasonInput.value = '';
            // Highlight stars
            shadow!.querySelectorAll('.pw-rate-star').forEach((s, i) => {
              s.textContent = i < score ? '★' : '☆';
              s.classList.toggle('active', i < score);
            });
          } else {
            showToast(response?.error || 'Failed to rate', true);
          }
        }
      );
    });

    // Hover preview
    star.addEventListener('mouseenter', () => {
      const score = Number((star as HTMLElement).dataset.score);
      shadow!.querySelectorAll('.pw-rate-star').forEach((s, i) => {
        s.textContent = i < score ? '★' : '☆';
      });
    });

    star.addEventListener('mouseleave', () => {
      shadow!.querySelectorAll('.pw-rate-star').forEach((s) => {
        s.textContent = s.classList.contains('active') ? '★' : '☆';
      });
    });
  });

  // Tip entity buttons
  shadow.querySelectorAll('.pw-tip-btn[data-tip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const amt = (btn as HTMLElement).dataset.tip;
      if (!currentEntityHash || !amt) return;

      const weiStr = String(BigInt(Math.floor(parseFloat(amt) * 1e18)));

      chrome.runtime.sendMessage(
        { type: 'TIP_ENTITY', entityHash: currentEntityHash, amountWei: weiStr },
        (response) => {
          if (response?.ok) {
            showToast(`Tipped ${amt} ETH`);
          } else {
            showToast(response?.error || 'Failed to tip', true);
          }
        }
      );
    });
  });

  // Comment vote + tip buttons (delegated)
  shadow.getElementById('pw-comments')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Vote
    if (target.dataset.vote) {
      const commentEl = target.closest('.pw-comment') as HTMLElement;
      const commentId = Number(commentEl?.dataset.commentId);
      const vote = Number(target.dataset.vote);
      if (!commentId) return;

      chrome.runtime.sendMessage(
        { type: 'VOTE_COMMENT', commentId, vote },
        (response) => {
          if (response?.ok) {
            showToast(vote > 0 ? 'Upvoted' : 'Downvoted');
            refreshComments();
          } else {
            showToast(response?.error || 'Failed to vote', true);
          }
        }
      );
    }

    // Tip comment
    if (target.dataset.tipComment) {
      const commentId = Number(target.dataset.tipComment);
      const weiStr = String(BigInt(Math.floor(0.001 * 1e18))); // 0.001 ETH default tip

      chrome.runtime.sendMessage(
        { type: 'TIP_COMMENT', commentId, amountWei: weiStr },
        (response) => {
          if (response?.ok) {
            showToast('Tipped 0.001 ETH');
            refreshComments();
          } else {
            showToast(response?.error || 'Failed to tip', true);
          }
        }
      );
    }
  });
}

function refreshComments(): void {
  if (!currentEntityHash) return;

  chrome.runtime.sendMessage(
    { type: 'GET_COMMENTS', entityHash: currentEntityHash, offset: 0, limit: 50 },
    (response) => {
      if (!response?.ok || !shadow) return;
      const comments = (response.data || []) as CommentData[];
      const container = shadow.getElementById('pw-comments');
      if (container) {
        container.innerHTML = comments.length > 0
          ? comments.map(c => renderComment(c)).join('')
          : '<div class="pw-empty">No comments yet. Start the conversation.</div>';
      }
    }
  );
}

export function openPanel(identifier: string): void {
  getShadow();
  if (!panelEl) return;

  currentIdentifier = identifier;
  currentEntityHash = computeEntityHash(identifier);

  // Show loading state
  panelEl.innerHTML = `
    <div class="pw-panel-header">
      <span class="pw-panel-title">Loading…</span>
      <button class="pw-panel-close" id="pw-close">×</button>
    </div>
    <div class="pw-loading"><div class="pw-spinner"></div></div>
  `;
  panelEl.classList.add('open');

  // Wire close button even in loading state
  shadow!.getElementById('pw-close')?.addEventListener('click', closePanel);

  // Fetch data
  chrome.runtime.sendMessage(
    { type: 'GET_ENTITY_DATA', identifier },
    (entityResponse) => {
      if (!entityResponse?.ok) {
        panelEl!.innerHTML = '<div class="pw-empty">Failed to load entity data</div>';
        return;
      }

      const entityData = entityResponse.data as EntityData;

      chrome.runtime.sendMessage(
        { type: 'GET_COMMENTS', entityHash: currentEntityHash!, offset: 0, limit: 50 },
        (commentsResponse) => {
          const comments = (commentsResponse?.ok ? commentsResponse.data : []) as CommentData[];
          panelEl!.innerHTML = renderPanel(entityData, comments);
          wireEvents();
        }
      );
    }
  );
}

export function closePanel(): void {
  panelEl?.classList.remove('open');
  currentEntityHash = null;
  currentIdentifier = null;
}

export function setupPanel(): void {
  // Click on any detected entity to open panel
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;

    const clickTarget = e.target as HTMLElement | null;
    if (!clickTarget) return;
    if (clickTarget.closest?.('[data-pw-root]')) return;
    if (window.getSelection()?.type === 'Range') return;

    const target = clickTarget.closest?.('[data-pw-id]') as HTMLElement | null;
    if (!target) return;

    const identifier = target.dataset.pwId;
    if (!identifier) return;
    const openMode = target.dataset.pwOpenMode ?? 'direct';

    // Never hijack normal link navigation.
    // Use Alt+Click on highlighted links/keywords to open the panel.
    const anchor = clickTarget.closest?.('a[href]') as HTMLAnchorElement | null;
    if (anchor && !e.altKey) return;
    if (openMode === 'modifier' && !e.altKey) return;

    e.preventDefault();
    e.stopPropagation();
    openPanel(identifier);
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });
}

function deriveTagsHtml(identifier: string): string {
  const tags = deriveTagsFromIdentifier(identifier);
  if (tags.length === 0) return '';
  return `<div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 16px; border-bottom: 1px solid #27272a;">${
    tags.map(t => `<span style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 2px 8px; font-size: 10px; color: #2F80ED; font-weight: 600;">#${t}</span>`).join('')
  }</div>`;
}
