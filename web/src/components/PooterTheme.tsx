"use client";

import { useEffect, useRef } from "react";

/**
 * Plays the pooter world theme once per session when the homepage loads.
 * ~9 second track, plays in background at low volume, no user interaction needed.
 * Autoplay may be blocked by browser policy — that's fine, fails silently.
 */
export function PooterTheme() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const STORAGE_KEY = "pooter-theme-played";

    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }

    const audio = new Audio("/pooter-world-theme.m4a");
    audio.volume = 0.25;
    audioRef.current = audio;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          try {
            sessionStorage.setItem(STORAGE_KEY, "1");
          } catch {}
        })
        .catch(() => {
          // Autoplay blocked — no worries
        });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return null;
}
