// Hosts Stumble may show in an iframe. One list feeds both the /stumble
// frame-src CSP (middleware) and the server-side filter in lib/stumble, so
// a site is either shown and allowed, or not shown at all.
//
// Each host was checked on 2026-10-29 by loading it in an iframe from a
// pooter.world origin (phone UA): no X-Frame-Options / frame-ancestors block.
// Known to refuse framing (do NOT add): neal.fun, nts.live, news.ycombinator.com,
// windy.com, radiooooo.com, quickdraw.withgoogle.com, most news sites.
export const STUMBLE_FRAME_HOSTS = [
  // video / audio players
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "w.soundcloud.com",
  // reference
  "en.wikipedia.org",
  "en.m.wikipedia.org",
  // curated toys and tools
  "musiclab.chromeexperiments.com",
  "lines.chromeexperiments.com",
  "earth.nullschool.net",
  "radio.garden",
  "patatap.com",
  "thispersondoesnotexist.com",
  "asoftmurmur.com",
  "pointerpointer.com",
  "weavesilk.com",
  "thisissand.com",
  "www.koalastothemax.com",
  "stellarium-web.org",
] as const;

const HOST_SET = new Set<string>(STUMBLE_FRAME_HOSTS);

/** True when the browser will be allowed to frame this exact URL. */
export function isStumbleFrameable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOST_SET.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Space-separated origins for the /stumble CSP frame-src directive. */
export const STUMBLE_FRAME_SRC = STUMBLE_FRAME_HOSTS.map((h) => `https://${h}`).join(" ");
