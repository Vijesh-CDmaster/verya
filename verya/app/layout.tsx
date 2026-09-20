import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Verya — Check the plan before the code",
  description:
    "Verya reads your whole project, flags what's wrong with it, picks the right stack, approach, and model for every piece — and shows its work.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "Verya — Check the plan before the code",
    description: "AI-governed planning, model routing, verification, and audit-ready proof.",
    type: "website",
    siteName: "Verya",
  },
  twitter: {
    card: "summary",
    title: "Verya — Check the plan before the code",
    description: "AI-governed planning, model routing, verification, and audit-ready proof.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. text-selection
          enablers) inject style="user-select: text" into <body> before React
          hydrates; that mismatch is harmless — silence the attribute diff. */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans min-h-screen bg-bg text-fg`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('verya-ui');if(t){var s=JSON.parse(t);var th=(s&&s.state&&s.state.theme)||'dark';if(th==='dark'){document.documentElement.classList.add('dark')}}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
        {clerkKey ? (
          <ClerkProvider
            publishableKey={clerkKey}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            appearance={{ variables: { colorPrimary: "#6366f1" } }}
          >
            <Providers>{children}</Providers>
          </ClerkProvider>
        ) : (
          <Providers>{children}</Providers>
        )}
      </body>
    </html>
  );
}