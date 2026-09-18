"use client";

// Clerk-powered auth controls for the header: sign-in/sign-up actions when
// signed out, user button (avatar + account menu) when signed in. Renders
// nothing meaningful without a publishable key (Clerk stays unmounted).
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

export function AuthControls() {
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
  return (
    <Show when="signed-in">
      <UserButton />
    </Show>
  );
}
