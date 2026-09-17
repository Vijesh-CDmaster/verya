"use client";

// App providers: TanStack Query (server state), Clerk (auth), theme hydration.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useIntakeStore } from "@/stores/intake-store";

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ThemeSync() {
  const theme = useIntakeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
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
  // auth UI (backend stays in development mode) instead of crashing.
  if (CLERK_KEY) {
    return (
      <ClerkProvider>
        <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
      </ClerkProvider>
    );
  }
  return <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>;
}
