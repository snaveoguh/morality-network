export interface PopupOptions {
  width?: number;
  height?: number;
  name?: string;
}

interface PopupMediaSpec {
  kind: "youtube" | "video" | "audio" | "iframe";
  src: string;
  title: string;
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
  ].join(",");

  const popup = window.open("", options.name ?? "pooter_youtube_popup", features);
  if (!popup) return null;

  const media = resolvePopupMedia(url);
  popup.document.open();
  popup.document.write(buildPopupHtml(media));
  popup.document.close();
  popup.focus();
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

function resolvePopupMedia(url: string): PopupMediaSpec {
  const youtubeId = extractYouTubeId(url);
  if (youtubeId) {
    return {
      kind: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`,
      title: "YouTube mini window",
    };
  }

  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) {
    return { kind: "video", src: url, title: "Video mini window" };
  }

  if (/\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(url)) {
    return { kind: "audio", src: url, title: "Audio mini window" };
  }

  return { kind: "iframe", src: url, title: "Mini window" };
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const embedMatch = parsed.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embedMatch?.[1]) return embedMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

function buildPopupHtml(media: PopupMediaSpec): string {
  const title = escapeHtml(media.title);
  const source = escapeHtml(media.src);
  const renderedMedia =
    media.kind === "audio"
      ? `<audio class="media audio" controls autoplay preload="metadata" src="${source}"></audio>`
      : media.kind === "video"
        ? `<video class="media video" controls autoplay playsinline preload="metadata" src="${source}"></video>`
        : `<iframe class="media frame" src="${source}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="eager"></iframe>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #ebe6dc;
        --ink: #1f1a17;
        --faint: rgba(31, 26, 23, 0.62);
        --rule: rgba(31, 26, 23, 0.16);
        --panel: rgba(255, 255, 255, 0.18);
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.45), transparent 42%),
          linear-gradient(180deg, #f3efe7 0%, var(--paper) 100%);
        color: var(--ink);
        font-family: Georgia, "Times New Roman", serif;
      }
      body {
        display: flex;
        flex-direction: column;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--rule);
        font-family: "Courier New", monospace;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.24em;
      }
      header a {
        color: var(--ink);
        text-decoration: none;
        border-bottom: 1px solid var(--ink);
        opacity: 0.78;
      }
      main {
        flex: 1;
        padding: 14px;
      }
      .shell {
        position: relative;
        height: calc(100vh - 62px);
        min-height: 280px;
        overflow: hidden;
        border: 1px solid var(--rule);
        background: rgba(0, 0, 0, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.22);
      }
      .shell::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.05)),
          radial-gradient(circle at 20% 20%, rgba(255,255,255,0.10), transparent 35%);
        mix-blend-mode: luminosity;
      }
      .media {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: #000;
        filter: grayscale(1) contrast(1.04) saturate(0.72) brightness(0.96);
      }
      .audio {
        height: 120px;
        margin: auto 0;
        background: transparent;
        filter: none;
      }
      .note {
        margin-top: 8px;
        color: var(--faint);
        font-family: "Courier New", monospace;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <header>
      <div>Pooter mini window</div>
      <a href="${source}" target="_blank" rel="noopener noreferrer">Open source</a>
    </header>
    <main>
      <div class="shell">${renderedMedia}</div>
      <div class="note">Greyscale broadcast mode</div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
