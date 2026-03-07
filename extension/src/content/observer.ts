import { scanNode } from './detector';
import { OBSERVER_DEBOUNCE_MS } from '../shared/constants';

export function startObserver(): void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver((mutations) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && !node.closest('[data-pw-root]')) {
            scanNode(node);
          }
        }
      }
    }, OBSERVER_DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
