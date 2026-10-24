"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false on the server AND during this component's hydration, true afterwards.
// Lets a component render exactly the server HTML first, even when it
// hydrates later (inside Suspense) than the providers above it.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
