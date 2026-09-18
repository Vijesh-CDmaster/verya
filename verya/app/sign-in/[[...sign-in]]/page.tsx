import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn
        signUpUrl="/sign-up"
        appearance={{
          variables: {
            colorPrimary: "#6366f1",
            colorBackground: "#0b0b10",
          },
        }}
      />
    </main>
  );
}
