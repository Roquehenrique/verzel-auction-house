"use client";

import { useEffect, useRef } from "react";
import { useServerNow } from "@/lib/clock";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Same window as the anti-sniping rule on the server.
const LAST_MINUTES_MS = 2 * MINUTE;

const pad = (value: number) => String(value).padStart(2, "0");

export function formatRemaining(ms: number): string {
  if (ms >= DAY) {
    return `${Math.floor(ms / DAY)}d ${pad(Math.floor((ms % DAY) / HOUR))}h`;
  }
  if (ms >= HOUR) {
    return `${pad(Math.floor(ms / HOUR))}h ${pad(Math.floor((ms % HOUR) / MINUTE))}m`;
  }
  return `${pad(Math.floor(ms / MINUTE))}:${pad(Math.floor((ms % MINUTE) / SECOND))}`;
}

interface CountdownProps {
  target: string;
  // Called once when the target is reached (e.g. to reload the lot).
  onExpire?: () => void;
  className?: string;
}

export function Countdown({ target, onExpire, className = "" }: CountdownProps) {
  const now = useServerNow();
  const remaining = now === null ? null : new Date(target).getTime() - now;

  const expired = remaining !== null && remaining <= 0;
  const notified = useRef(false);
  useEffect(() => {
    if (!expired) notified.current = false;
    else if (!notified.current) {
      notified.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  if (remaining === null) return <span className={className}>--:--</span>;
  if (expired) return <span className={className}>00:00</span>;

  const urgent = remaining <= LAST_MINUTES_MS;
  return (
    <span
      className={`tabular-nums ${urgent ? "font-bold text-danger" : ""} ${className}`}
      title={urgent ? "Últimos minutos: um novo lance prorroga o fim em 2 minutos" : undefined}
    >
      {formatRemaining(remaining)}
    </span>
  );
}
