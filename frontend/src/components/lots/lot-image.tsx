"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

interface LotImageProps {
  lotId: string;
  hasImage: boolean;
  alt: string;
  className?: string;
}

// Served by the API (copy stored in the database, or redirect to the original).
// A plain <img> is used on purpose: next/image would require configuring the
// API domain and routing every picture through the Next.js optimizer.
export function LotImage({ lotId, hasImage, alt, className = "" }: LotImageProps) {
  const [failed, setFailed] = useState(false);

  if (!hasImage || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-muted text-muted ${className}`}
        aria-label="Sem imagem"
      >
        <svg viewBox="0 0 24 24" className="size-12 opacity-50" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 13l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 8l2 5v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4z" />
          <path d="M3 13h18" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API_URL}/lots/${lotId}/image`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
