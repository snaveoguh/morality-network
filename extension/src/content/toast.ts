import CSS from './styles.css';

let shadow: ShadowRoot | null = null;
let toastEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function getShadow(): ShadowRoot {
  if (shadow) return shadow;

  const host = document.createElement('div');
  host.setAttribute('data-pw-root', 'toast');
  document.body.appendChild(host);
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  toastEl = document.createElement('div');
  toastEl.className = 'pw-toast';
  shadow.appendChild(toastEl);

  return shadow;
}

export function showToast(message: string, isError = false, duration = 3000): void {
  getShadow();
  if (!toastEl) return;

  if (hideTimer) clearTimeout(hideTimer);

  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);

  // Force reflow
  toastEl.offsetHeight;
  toastEl.classList.add('visible');

  hideTimer = setTimeout(() => {
    toastEl?.classList.remove('visible');
  }, duration);
}
