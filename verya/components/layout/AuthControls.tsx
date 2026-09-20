"use client";

// Clerk-powered auth controls for the header: sign-in/sign-up actions when
// signed out, user button (avatar + account menu) when signed in. Renders
// nothing meaningful without a publishable key (Clerk stays unmounted).
import { SignInButton, SignUpButton, Show, UserButton, useClerk } from "@clerk/nextjs";
import { api } from "@/services/api";

export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;

  return (
    <Show when="signed-out">
      <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button
          className="hidden rounded-md border border-line bg-bg px-4 py-1.5 text-sm transition-all hover:-translate-y-0.5 hover:bg-surface sm:block"
          type="button"
        >
          Sign In
        </button>
      </SignInButton>
      <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
        <button
          className="rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg transition-all hover:-translate-y-0.5 hover:opacity-90"
          type="button"
        >
          Get Started
        </button>
      </SignUpButton>
    </Show>
  );
}

export function UserMenu() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;

  return (
    <Show when="signed-in">
      <SignedInMenu />
    </Show>
  );
}

function SignedInMenu() {
  const { signOut } = useClerk();
  return (
    <div className="flex items-center gap-2">
      <UserButton />
      <button
        type="button"
        className="text-xs text-muted transition-colors hover:text-fg"
        onClick={async () => {
          await api.recordAuthEvent({ eventType: "sign_out" }).catch(() => undefined);
          await signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
