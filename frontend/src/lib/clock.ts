"use client";

import { useSyncExternalStore } from "react";

// Countdowns must follow the SERVER clock (the one that decides if a bid is on
// time), not the visitor's computer clock, which may be wrong. Every API
// response/event with `serverTime` updates the offset between both clocks.
let offsetMs = 0;

export function syncServerTime(serverTime: string | Date) {
  offsetMs = new Date(serverTime).getTime() - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

// One shared 1-second ticker for every countdown on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// Current server time, refreshed every second. null during server rendering
// (the countdown text only appears after hydration, avoiding mismatches).
export function useServerNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(serverNow() / 1000) * 1000,
    () => null,
  );
}
