"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../components/AuthProvider";

/**
 * /editor — Redirects to /dashboard (project selection).
 * Kept as a catch-all so existing /editor links still work.
 */
export default function EditorIndexPage() {
  const { isLoggedIn, mounted } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!mounted) return;
    if (isLoggedIn) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [mounted, isLoggedIn, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
    </div>
  );
}
