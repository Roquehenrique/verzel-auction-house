"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, setUnauthorizedHandler, tokenStorage } from "@/lib/api";
import type { AuthResponse, Role, User } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // undefined while rendering on the server (no localStorage there).
  const token = useSyncExternalStore(
    tokenStorage.subscribe,
    tokenStorage.get,
    () => undefined,
  );

  const me = useQuery({
    queryKey: ["me", token],
    queryFn: () => api<User>("/auth/me"),
    enabled: typeof token === "string",
    staleTime: Infinity,
    retry: false,
  });

  const status: AuthStatus =
    token === undefined
      ? "loading"
      : token === null || me.isError
        ? "anonymous"
        : me.data
          ? "authenticated"
          : "loading";

  const logout = useCallback(() => {
    tokenStorage.clear();
    queryClient.clear(); // no data from the previous user stays cached
  }, [queryClient]);

  // Any 401 on an authenticated request (expired token) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const startSession = useCallback(
    (response: AuthResponse) => {
      queryClient.clear();
      // Seed the cache first so /auth/me is not requested again.
      queryClient.setQueryData(["me", response.accessToken], response.user);
      tokenStorage.set(response.accessToken);
      return response.user;
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) =>
      startSession(
        await api<AuthResponse>("/auth/login", {
          method: "POST",
          body: { email, password },
        }),
      ),
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterInput) =>
      startSession(
        await api<AuthResponse>("/auth/register", {
          method: "POST",
          body: input,
        }),
      ),
    [startSession],
  );

  const user = status === "authenticated" ? (me.data ?? null) : null;
  const value = useMemo(
    () => ({
      status,
      user,
      token: status === "authenticated" ? (token ?? null) : null,
      login,
      register,
      logout,
    }),
    [status, user, token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const loadingSession = { status: "loading", user: null, token: null } as const;

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  // While THIS component hydrates, report "loading" like the server did.
  // Components inside Suspense hydrate after the provider already knows the
  // session; rendering it straight away would not match the server HTML.
  const hydrated = useHydrated();
  return hydrated ? context : { ...context, ...loadingSession };
}

// Where each role lands after logging in.
export function homeFor(role: Role): string {
  return role === "AUCTIONEER" ? "/painel" : "/";
}
