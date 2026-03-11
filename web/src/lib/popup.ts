export interface PopupOptions {
  width?: number;
  height?: number;
  name?: string;
}

/**
 * Open a centered popup window for media links.
 * Falls back to a normal tab if popup blockers intervene.
 */
export function openCenteredPopup(url: string, options: PopupOptions = {}): Window | null {
  if (typeof window === "undefined") return null;

  const width = Math.max(520, Math.min(options.width ?? 960, window.screen.availWidth - 80));
  const height = Math.max(360, Math.min(options.height ?? 620, window.screen.availHeight - 80));
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "noopener=yes",
    "noreferrer=yes",
  ].join(",");

  const popup = window.open(url, options.name ?? "pooter_youtube_popup", features);
  popup?.focus();
  return popup;
}

export function shouldKeepDefaultLinkBehavior(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
