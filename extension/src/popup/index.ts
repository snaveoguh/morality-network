import { renderEntityTab } from './entity-ui';
import { renderWalletTab } from './wallet-ui';
import { renderSettingsTab } from './settings-ui';

// Tab switching
const tabs = document.querySelectorAll<HTMLButtonElement>('#tabs .tab');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (!target) return;

    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(`${target}-tab`)?.classList.add('active');

    loadTab(target);
  });
});

function loadTab(name: string): void {
  const container = document.getElementById(`${name}-tab`);
  if (!container) return;

  switch (name) {
    case 'entity':
      renderEntityTab(container);
      break;
    case 'wallet':
      renderWalletTab(container);
      break;
    case 'settings':
      renderSettingsTab(container);
      break;
  }
}

// Load initial tab
loadTab('entity');
