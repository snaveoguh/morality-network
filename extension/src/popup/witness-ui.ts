/**
 * Daily Witness — the popup's default tab.
 *
 * Shows one open claim from pooter.world's staked review queue with
 * Support / Dispute / Can't verify. Degrades gracefully:
 * - endpoint 404s → "opens soon" notice (feature not live yet)
 * - 401 → prompt to link the account (Wallet tab)
 * - empty → "nothing awaiting review"
 */

import { sendMessageSafe, escapeHtml } from './messaging';
import type { AuthStatus, WitnessFeed, WitnessRound, WitnessVoteChoice } from '../shared/types';

export function renderWitnessTab(container: HTMLElement): void {
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  void (async () => {
    const [feedRes, authRes] = await Promise.all([
      sendMessageSafe<WitnessFeed>({ type: 'GET_OPEN_ROUNDS' }, 15000),
      sendMessageSafe<AuthStatus>({ type: 'GET_AUTH_STATUS' }, 8000),
    ]);

    if (!feedRes.ok || !feedRes.data) {
      container.innerHTML = `<div class="empty">${escapeHtml(!feedRes.ok ? feedRes.error : 'Could not load the review queue')}</div>`;
      return;
    }

    const feed = feedRes.data;
    const auth = authRes.ok ? authRes.data ?? null : null;

    if (!feed.available) {
      container.innerHTML = `
        <div class="witness-notice">
          <div class="witness-notice-head">The Daily Witness</div>
          <p>Claim review opens soon. One claim a day, three blind reviewers, two agreeing votes publish.</p>
        </div>`;
      return;
    }

    if (feed.authRequired || (!auth?.linked && feed.rounds.length === 0 && !feed.error)) {
      container.innerHTML = `
        <div class="witness-notice">
          <div class="witness-notice-head">The Daily Witness</div>
          <p>Link your account to review claims and build a streak.</p>
          <button class="btn btn-primary" id="witness-goto-wallet">Link account</button>
        </div>`;
      container.querySelector('#witness-goto-wallet')?.addEventListener('click', () => {
        document.querySelector<HTMLButtonElement>('#tabs .tab[data-tab="wallet"]')?.click();
      });
      return;
    }

    if (feed.error) {
      container.innerHTML = `<div class="empty">${escapeHtml(feed.error)}</div>`;
      return;
    }

    if (feed.rounds.length === 0) {
      container.innerHTML = `
        <div class="witness-notice">
          <div class="witness-notice-head">The Daily Witness</div>
          <p>Nothing awaiting review right now. Come back with the next edition.</p>
          ${statsHtml(feed)}
        </div>`;
      return;
    }

    renderRound(container, feed, feed.rounds[0], 0);
  })();
}

function statsHtml(feed: WitnessFeed): string {
  if (feed.streak === null && feed.points === null) return '';
  const bits: string[] = [];
  if (feed.streak !== null) bits.push(`<span class="witness-stat"><b>${feed.streak}</b> day streak</span>`);
  if (feed.points !== null) bits.push(`<span class="witness-stat"><b>${feed.points}</b> points</span>`);
  return `<div class="witness-stats">${bits.join('<span class="witness-stat-sep">·</span>')}</div>`;
}

function renderRound(container: HTMLElement, feed: WitnessFeed, round: WitnessRound, index: number): void {
  const remaining = feed.rounds.length - index - 1;

  container.innerHTML = `
    <div class="witness-round">
      <div class="witness-kicker">Claim under review${round.entity ? ` — ${escapeHtml(round.entity)}` : ''}</div>
      <blockquote class="witness-claim">${escapeHtml(round.claimText)}</blockquote>
      <div class="witness-actions">
        <button class="btn btn-primary witness-vote" data-vote="approve">Support</button>
        <button class="btn btn-primary witness-vote witness-vote-dispute" data-vote="reject">Dispute</button>
        <button class="btn btn-secondary witness-vote" data-vote="more_evidence">Can't verify</button>
      </div>
      <div id="witness-status"></div>
      ${statsHtml(feed)}
      ${remaining > 0 ? `<div class="witness-remaining">${remaining} more claim${remaining === 1 ? '' : 's'} waiting</div>` : ''}
    </div>
  `;

  const statusEl = container.querySelector('#witness-status');
  const buttons = container.querySelectorAll<HTMLButtonElement>('.witness-vote');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      void (async () => {
        const vote = btn.dataset.vote as WitnessVoteChoice;
        buttons.forEach(b => { b.disabled = true; });
        if (statusEl) {
          statusEl.className = 'status';
          statusEl.textContent = 'Recording your verdict…';
        }

        const res = await sendMessageSafe<{ settled: boolean | null; streak: number | null; points: number | null }>(
          { type: 'WITNESS_VOTE', roundId: round.roundId, assignmentId: round.assignmentId, vote },
          20000,
        );

        if (!res.ok) {
          if (statusEl) {
            statusEl.className = 'status error';
            statusEl.textContent = res.error;
          }
          buttons.forEach(b => { b.disabled = false; });
          return;
        }

        if (statusEl) {
          statusEl.className = 'status success';
          const settled = res.data?.settled;
          statusEl.textContent = settled
            ? 'Verdict recorded — the round has settled.'
            : 'Verdict recorded. The round settles when three reviewers have voted.';
        }

        // Advance to the next claim after a beat, or refresh the feed.
        setTimeout(() => {
          if (index + 1 < feed.rounds.length) {
            renderRound(container, feed, feed.rounds[index + 1], index + 1);
          } else {
            renderWitnessTab(container);
          }
        }, 1600);
      })();
    });
  });
}
