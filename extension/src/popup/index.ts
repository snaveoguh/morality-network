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

// Populate dateline with newspaper-style date
const dateline = document.getElementById('dateline');
if (dateline) {
  const now = new Date();
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  const dayName = days[now.getDay()];
  const monthName = months[now.getMonth()];
  const date = now.getDate();
  const year = now.getFullYear();
  dateline.textContent = `${dayName}, ${monthName} ${date}, ${year}`;
}

// Load initial tab
loadTab('entity');

// Pooter eye cursor tracking
const pupilL = document.getElementById('pupil-l');
const pupilR = document.getElementById('pupil-r');
if (pupilL && pupilR) {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    // Normalize to popup dimensions (360x480)
    const nx = (e.clientX / 360) * 2 - 1; // -1 to 1
    const ny = (e.clientY / 480) * 2 - 1;
    const tx = nx * 1.5; // px offset
    const ty = ny * 1;
    pupilL.style.transform = `translate(${tx}px, ${ty}px)`;
    pupilR.style.transform = `translate(${tx}px, ${ty}px)`;
  });
}
