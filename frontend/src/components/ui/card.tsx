import type { HTMLAttributes } from "react";

const tones = {
  default: "bg-surface",
  muted: "bg-surface-muted",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Background variant. Do not pass bg-* in className: two background classes
  // would conflict and the result would depend on the CSS order.
  tone?: keyof typeof tones;
}

export function Card({ tone = "default", className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border shadow-sm ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
