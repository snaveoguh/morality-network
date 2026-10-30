#!/usr/bin/env node
/**
 * verify-music-playlist.ts — checks every UNDERGROUND_PLAYLIST entry against
 * YouTube's keyless oEmbed endpoint.
 *
 * Usage (from web/):
 *   npm run music:verify
 *
 * A track passes when oEmbed returns 200, the video title or channel names the
 * artist, the video title contains the listed title (minus any parenthetical),
 * and session tracks come from that session's own channel. Exits 1 on any
 * failure. Network only; no keys.
 */

import { UNDERGROUND_PLAYLIST, type MusicSource, type YouTubeTrack } from "../src/lib/music";

// Normalised channel names allowed for each session source.
const SESSION_CHANNELS: Partial<Record<MusicSource, string[]>> = {
  KEXP: ["kexp"],
  "NPR Tiny Desk": ["nprmusic"],
  COLORS: ["colors"],
  Audiotree: ["audiotree"],
  "BBC 6 Music": ["bbcmusic", "bbcradio6music"],
  "Boiler Room": ["boilerroom"],
  Cercle: ["cercle"],
  KCRW: ["kcrw"],
  "La Blogothèque": ["blogotheque"],
};

function norm(s: string): string {
  return s
    .replace(/ı/g, "i")
    .replace(/ə/gi, "e")
    .replace(/&/g, "and")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function check(track: YouTubeTrack): Promise<string | null> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${track.videoId}&format=json`;
  const res = await fetch(url);
  if (res.status !== 200) return `oEmbed ${res.status}`;
  const { title, author_name: author } = (await res.json()) as { title: string; author_name: string };
  const t = norm(title);
  const bareTitle = norm(title.replace(/\([^)]*\)/g, ""));
  const a = norm(author);
  const artist = norm(track.artist);
  if (!t.includes(artist) && !a.includes(artist)) return `artist not in "${title}" / "${author}"`;
  const core = norm(track.title.replace(/\([^)]*\)/g, ""));
  if (core && !t.includes(core) && !bareTitle.includes(core)) return `title not in "${title}"`;
  const channels = SESSION_CHANNELS[track.source];
  if (channels && !channels.includes(a)) return `channel "${author}" is not ${track.source}`;
  return null;
}

async function main() {
  let failed = 0;
  for (const track of UNDERGROUND_PLAYLIST) {
    const problem = await check(track).catch((err: unknown) => String(err));
    if (problem) {
      failed++;
      console.log(`FAIL ${track.videoId} ${track.artist} — ${track.title}: ${problem}`);
    }
  }
  console.log(`${UNDERGROUND_PLAYLIST.length - failed}/${UNDERGROUND_PLAYLIST.length} tracks verified`);
  if (failed) process.exit(1);
}

void main();
