"use client";

import { useEffect, useRef } from "react";
import { currentVideo, usePlayer } from "@/store/player";

/* Minimal typings for the YouTube IFrame Player API. */
interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Controls the rest of the UI can call without holding a player reference. */
export const playerControls = {
  player: null as YTPlayer | null,
  toggle() {
    const p = this.player;
    if (!p) return;
    if (p.getPlayerState() === PLAYING) p.pauseVideo();
    else p.playVideo();
  },
};

/**
 * Hosts the YouTube iframe. It stays mounted (and at least 200px tall, per YouTube's embed
 * rules) so playback carries on while the user browses and when the tab is in the background.
 */
export function YouTubePlayer() {
  const hostRef = useRef<HTMLDivElement>(null);
  const creating = useRef(false);
  const video = usePlayer(currentVideo);
  const nonce = usePlayer((s) => s.nonce);
  const videoId = video?.videoId ?? null;

  useEffect(() => {
    if (!videoId) return;
    if (playerControls.player) {
      playerControls.player.loadVideoById(videoId);
      return;
    }
    if (creating.current || !hostRef.current) return;
    creating.current = true;
    const mount = document.createElement("div");
    hostRef.current.appendChild(mount);
    loadApi().then((YT) => {
      const player = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (e) => {
            playerControls.player = e.target;
            // The user may have picked another track while the API was loading.
            const latest = currentVideo(usePlayer.getState());
            if (latest && latest.videoId !== videoId) e.target.loadVideoById(latest.videoId);
            else e.target.playVideo();
          },
          onStateChange: (e) => {
            const s = usePlayer.getState();
            if (e.data === PLAYING) s.setPlaying(true);
            else if (e.data === PAUSED) s.setPlaying(false);
            else if (e.data === ENDED) s.next();
          },
          // 2 bad id, 5 HTML5 error, 100 removed, 101/150 embedding disabled: skip it.
          onError: () => usePlayer.getState().reportError(),
        },
      });
      void player;
    });
    // nonce: replaying the same video (e.g. "prev" on the first track) should restart it.
  }, [videoId, nonce]);

  useEffect(() => {
    return () => {
      playerControls.player?.destroy();
      playerControls.player = null;
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" data-testid="yt-host" />;
}
