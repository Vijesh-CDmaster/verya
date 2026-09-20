"use client";

// App providers: TanStack Query (server state), Clerk (auth), theme hydration.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { setTokenGetter } from "@/lib/auth-bridge";
import { api } from "@/services/api";

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}

function AuthBridge() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const key = `verya-auth-event:${userId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "recording");
    void api.recordAuthEvent({ eventType: "sign_in" }).then(
      () => sessionStorage.setItem(key, "recorded"),
      () => sessionStorage.removeItem(key)
    );
  }, [isLoaded, isSignedIn, userId]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false },
        },
      })
  );

  const app = (
    <>
      <ThemeSync />
      {children}
    </>
  );

  // Clerk is optional at runtime: without a publishable key the app renders without
  // auth UI (backend stays in development mode) instead of crashing. Routes point at
  // the dedicated sign-in/sign-up pages (F38).
  return (
    <QueryClientProvider client={queryClient}>
      {CLERK_KEY && <AuthBridge />}
      {app}
    </QueryClientProvider>
  );
}
