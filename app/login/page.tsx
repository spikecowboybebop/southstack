"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthGate from "../components/AuthGate";
import { useAuth } from "../components/AuthProvider";

/**
 * /login — Redirect to home if already logged in,
 * otherwise show the AuthGate in login mode.
 */
export default function LoginPage() {
  const { isLoggedIn, mounted } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (mounted && isLoggedIn) {
      router.replace("/editor");
    }
  }, [mounted, isLoggedIn, router]);

  if (!mounted || isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      </div>
    );
  }

  return <AuthGate defaultMode="login">{null}</AuthGate>;
}
