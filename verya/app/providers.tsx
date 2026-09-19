"use client";

// App providers: TanStack Query (server state), Clerk (auth), theme hydration.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { setTokenGetter } from "@/lib/auth-bridge";

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ThemeSync() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}

function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
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
