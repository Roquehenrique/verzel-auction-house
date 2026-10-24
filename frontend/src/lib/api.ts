// Thin client for the NestJS API. Every error becomes an ApiError carrying the
// messages (in Portuguese) and, for refused bids, the machine-readable code.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Socket.IO lives on the same server, without the /api prefix.
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    readonly code?: string,
  ) {
    super(messages.join("\n"));
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "leilao.token";

// The JWT is kept in localStorage: the API is on another domain, where
// cookies are often blocked as third-party cookies (trade-off in the README).
// Exposed as a small external store (for useSyncExternalStore): components are
// notified on login/logout, also when it happens in another tab.
const listeners = new Set<() => void>();
let memoryToken: string | null = null; // fallback when storage is blocked

export const tokenStorage = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return memoryToken;
    }
  },
  set(token: string) {
    memoryToken = token;
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // private mode / blocked storage: the session lasts until reload
    }
    listeners.forEach((listener) => listener());
  },
  clear() {
    memoryToken = null;
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
};

// Called when the API answers 401 to an authenticated request (expired token).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(
  path: string,
  { method = "GET", body, signal }: RequestOptions = {},
): Promise<T> {
  const token = tokenStorage.get();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, [
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
    ]);
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
    code?: string;
  } | null;
  const messages = Array.isArray(payload?.message)
    ? payload.message
    : [payload?.message ?? "Erro inesperado. Tente novamente."];

  if (response.status === 401 && token) onUnauthorized?.();
  throw new ApiError(response.status, messages, payload?.code);
}

export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) return error.messages;
  return ["Erro inesperado. Tente novamente."];
}
