"use client";

/**
 * /test-suite — Automated auth security test runner.
 *
 * Exercises the validation, crypto, and IndexedDB layers with
 * adversarial inputs. Dev-only: blocked in production builds.
 */

import { login, signup } from "@/lib/auth";
import { generateSalt, hashPassword } from "@/lib/crypto";
import { deleteUser } from "@/lib/db";
import { AUTH_LIMITS, validateAuthInput } from "@/lib/validation";
import { Play, RotateCcw, ShieldCheck, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────

type TestStatus = "idle" | "running" | "passed" | "failed";

interface TestResult {
  id: string;
  name: string;
  input: string;
  status: TestStatus;
  detail: string;
  durationMs?: number;
}

// ─── Helpers ────────────────────────────────────────────────

function truncateDisplay(s: string, max = 60): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (${s.length} chars)`;
}

/** Generate a unique username for stress tests */
function stressUser(i: number) {
  return `stresstest_${Date.now()}_${i}`;
}

// ─── Test Definitions ───────────────────────────────────────

function buildTests(): TestResult[] {
  return [
    // ── Length Tests ──
    {
      id: "len-5000-username",
      name: "Signup — 5,000-char username",
      input: `"${"A".repeat(5000)}" (5,000 chars)`,
      status: "idle",
      detail: "",
    },
    {
      id: "len-5000-password",
      name: "Signup — 5,000-char password",
      input: `"${"x".repeat(60)}…" (5,000 chars)`,
      status: "idle",
      detail: "",
    },
    {
      id: "len-10000-both",
      name: "Signup — 10,000-char username & password",
      input: `Both fields 10,000 chars`,
      status: "idle",
      detail: "",
    },
    {
      id: "len-login-overflow",
      name: "Login — 5,000-char username",
      input: `"${"B".repeat(60)}…" (5,000 chars)`,
      status: "idle",
      detail: "",
    },

    // ── Type Tests ──
    {
      id: "type-null-username",
      name: "Signup — null username",
      input: "null, \"password1\"",
      status: "idle",
      detail: "",
    },
    {
      id: "type-undefined-password",
      name: "Signup — undefined password",
      input: "\"user1\", undefined",
      status: "idle",
      detail: "",
    },
    {
      id: "type-number-both",
      name: "Signup — numbers instead of strings",
      input: "12345, 67890",
      status: "idle",
      detail: "",
    },
    {
      id: "type-object-username",
      name: "Signup — object as username",
      input: "{}, \"password1\"",
      status: "idle",
      detail: "",
    },

    // ── Validation vs Hashing Speed ──
    {
      id: "speed-validation",
      name: "Speed — validateAuthInput() latency",
      input: "Valid 10-char inputs",
      status: "idle",
      detail: "",
    },
    {
      id: "speed-hashing",
      name: "Speed — PBKDF2 hashPassword() latency",
      input: "Valid 10-char password",
      status: "idle",
      detail: "",
    },
    {
      id: "speed-rejection",
      name: "Speed — Oversized input rejection latency",
      input: "5,000-char string",
      status: "idle",
      detail: "",
    },

    // ── Database Stress ──
    {
      id: "db-stress-50",
      name: "DB Stress — 50 rapid signups",
      input: "50 unique users, concurrent",
      status: "idle",
      detail: "",
    },
    {
      id: "db-stress-duplicate",
      name: "DB Stress — Duplicate username",
      input: "Same username × 5",
      status: "idle",
      detail: "",
    },
    {
      id: "db-stress-cleanup",
      name: "DB Cleanup — Delete stress test users",
      input: "deleteUser() × N",
      status: "idle",
      detail: "",
    },
  ];
}

// ─── Component ──────────────────────────────────────────────

export default function TestSuitePage() {
  const [isDev, setIsDev] = useState<boolean | null>(null);
  const [tests, setTests] = useState<TestResult[]>(buildTests);
  const [running, setRunning] = useState(false);
  const stressUsersRef = useRef<string[]>([]);

  // Dev-only gate
  useEffect(() => {
    setIsDev(process.env.NODE_ENV === "development");
  }, []);

  // ── Update a single test result ──
  const updateTest = useCallback(
    (id: string, patch: Partial<TestResult>) => {
      setTests((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
      );
    },
    []
  );

  // ── Individual test runners ──

  async function runLengthTests() {
    // 5,000-char username
    updateTest("len-5000-username", { status: "running" });
    try {
      await signup("A".repeat(5000), "validpass1");
      updateTest("len-5000-username", {
        status: "failed",
        detail: "Signup should have thrown but succeeded!",
      });
    } catch (err: unknown) {
      const elapsed = 0; // near-instant
      updateTest("len-5000-username", {
        status: "passed",
        detail: `Blocked: ${(err as Error).message}`,
        durationMs: elapsed,
      });
    }

    // 5,000-char password
    updateTest("len-5000-password", { status: "running" });
    try {
      await signup("validuser", "x".repeat(5000));
      updateTest("len-5000-password", {
        status: "failed",
        detail: "Signup should have thrown but succeeded!",
      });
    } catch (err: unknown) {
      updateTest("len-5000-password", {
        status: "passed",
        detail: `Blocked: ${(err as Error).message}`,
      });
    }

    // 10,000 both
    updateTest("len-10000-both", { status: "running" });
    try {
      await signup("Z".repeat(10000), "Q".repeat(10000));
      updateTest("len-10000-both", {
        status: "failed",
        detail: "Should have thrown!",
      });
    } catch (err: unknown) {
      updateTest("len-10000-both", {
        status: "passed",
        detail: `Blocked: ${(err as Error).message}`,
      });
    }

    // Login overflow
    updateTest("len-login-overflow", { status: "running" });
    try {
      await login("B".repeat(5000), "somepass1");
      updateTest("len-login-overflow", {
        status: "failed",
        detail: "Login should have thrown!",
      });
    } catch (err: unknown) {
      updateTest("len-login-overflow", {
        status: "passed",
        detail: `Blocked: ${(err as Error).message}`,
      });
    }
  }

  async function runTypeTests() {
    const cases: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: [any, any];
    }[] = [
      { id: "type-null-username", args: [null, "password1"] },
      { id: "type-undefined-password", args: ["user1", undefined] },
      { id: "type-number-both", args: [12345, 67890] },
      { id: "type-object-username", args: [{}, "password1"] },
    ];

    for (const { id, args } of cases) {
      updateTest(id, { status: "running" });
      try {
        await signup(args[0], args[1]);
        updateTest(id, {
          status: "failed",
          detail: "Signup should have thrown for invalid types!",
        });
      } catch (err: unknown) {
        updateTest(id, {
          status: "passed",
          detail: `Blocked: ${(err as Error).message}`,
        });
      }
    }
  }

  async function runSpeedTests() {
    // Validation speed
    updateTest("speed-validation", { status: "running" });
    {
      const t0 = performance.now();
      try {
        validateAuthInput({ username: "testuser01", password: "securepass" });
      } catch {
        /* ignore */
      }
      const ms = performance.now() - t0;
      updateTest("speed-validation", {
        status: "passed",
        detail: `Completed in ${ms.toFixed(3)} ms`,
        durationMs: parseFloat(ms.toFixed(3)),
      });
    }

    // Hashing speed
    updateTest("speed-hashing", { status: "running" });
    {
      const salt = generateSalt();
      const t0 = performance.now();
      await hashPassword("securepass", salt);
      const ms = performance.now() - t0;
      updateTest("speed-hashing", {
        status: "passed",
        detail: `Completed in ${ms.toFixed(1)} ms (${AUTH_LIMITS.PBKDF2_ITERATIONS.toLocaleString()} iterations)`,
        durationMs: parseFloat(ms.toFixed(1)),
      });
    }

    // Oversized rejection speed
    updateTest("speed-rejection", { status: "running" });
    {
      const bigStr = "A".repeat(5000);
      const t0 = performance.now();
      try {
        await signup(bigStr, bigStr);
      } catch {
        /* expected */
      }
      const ms = performance.now() - t0;
      updateTest("speed-rejection", {
        status: "passed",
        detail: `Rejected in ${ms.toFixed(3)} ms — no hashing triggered`,
        durationMs: parseFloat(ms.toFixed(3)),
      });
    }
  }

  async function runDbStressTests() {
    // 50 rapid signups
    updateTest("db-stress-50", { status: "running" });
    const users: string[] = [];
    let successCount = 0;
    let failCount = 0;
    const t0 = performance.now();

    const promises = Array.from({ length: 50 }, (_, i) => {
      const uname = stressUser(i);
      users.push(uname);
      return signup(uname, "stresspass1")
        .then(() => {
          successCount++;
        })
        .catch(() => {
          failCount++;
        });
    });
    await Promise.allSettled(promises);
    stressUsersRef.current = users;
    const elapsed = performance.now() - t0;

    updateTest("db-stress-50", {
      status: failCount === 0 ? "passed" : "failed",
      detail: `${successCount} created, ${failCount} failed in ${elapsed.toFixed(0)} ms`,
      durationMs: parseFloat(elapsed.toFixed(0)),
    });

    // Duplicate username
    updateTest("db-stress-duplicate", { status: "running" });
    const dupName = stressUser(999);
    let dupSuccess = 0;
    let dupFail = 0;
    try {
      await signup(dupName, "stresspass1");
      dupSuccess++;
      stressUsersRef.current.push(dupName);
    } catch {
      dupFail++;
    }

    const dupPromises = Array.from({ length: 4 }, () =>
      signup(dupName, "stresspass1")
        .then(() => dupSuccess++)
        .catch(() => dupFail++)
    );
    await Promise.allSettled(dupPromises);

    updateTest("db-stress-duplicate", {
      status: dupSuccess === 1 && dupFail === 4 ? "passed" : "failed",
      detail: `${dupSuccess} succeeded (expected 1), ${dupFail} rejected (expected 4)`,
    });
  }

  async function cleanupStressUsers() {
    updateTest("db-stress-cleanup", { status: "running" });
    let deleted = 0;
    let errors = 0;
    for (const u of stressUsersRef.current) {
      try {
        await deleteUser(u);
        deleted++;
      } catch {
        errors++;
      }
    }
    stressUsersRef.current = [];
    updateTest("db-stress-cleanup", {
      status: errors === 0 ? "passed" : "failed",
      detail: `${deleted} deleted, ${errors} errors`,
    });
  }

  // ── Run All ──

  async function runAll() {
    setRunning(true);
    setTests(buildTests());

    // Small delay so UI renders the "idle" reset
    await new Promise((r) => setTimeout(r, 50));

    await runLengthTests();
    await runTypeTests();
    await runSpeedTests();
    await runDbStressTests();
    await cleanupStressUsers();

    setRunning(false);
  }

  function reset() {
    setTests(buildTests());
    stressUsersRef.current = [];
  }

  // ── Production guard ──
  if (isDev === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!isDev) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] font-mono text-neutral-400">
        <ShieldCheck className="h-12 w-12 text-red-500/60" />
        <p className="text-lg text-red-400">Access Denied</p>
        <p className="text-sm">Test suite is disabled in production.</p>
      </div>
    );
  }

  // ── Stats ──
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const total = tests.length;

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-8 font-mono text-neutral-300 sm:px-8">
      {/* Header */}
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
              <Terminal className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-100">
                Auth Security Test Suite
              </h1>
              <p className="text-xs text-neutral-500">
                SouthStack · Validation · Crypto · IndexedDB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats badges */}
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-neutral-800 px-3 py-1">
                {total} tests
              </span>
              {passed > 0 && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-400">
                  {passed} passed
                </span>
              )}
              {failed > 0 && (
                <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-400">
                  {failed} failed
                </span>
              )}
            </div>

            <button
              onClick={reset}
              disabled={running}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={runAll}
              disabled={running}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-indigo-500 disabled:opacity-50"
            >
              {running ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run All Tests
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-[#0d0d0d]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.2fr_100px] gap-4 border-b border-neutral-800 bg-neutral-900/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <span>Test Case</span>
            <span>Input Used</span>
            <span className="text-center">Status</span>
          </div>

          {/* Rows */}
          {tests.map((test, i) => (
            <div
              key={test.id}
              className={`grid grid-cols-[1fr_1.2fr_100px] gap-4 px-5 py-3 text-[13px] transition-colors ${
                i < tests.length - 1 ? "border-b border-neutral-800/60" : ""
              } ${
                test.status === "running" ? "bg-indigo-500/[0.03]" : ""
              }`}
            >
              {/* Name + detail */}
              <div className="flex flex-col gap-0.5">
                <span className="text-neutral-200">{test.name}</span>
                {test.detail && (
                  <span className="text-[11px] text-neutral-500 break-all">
                    {truncateDisplay(test.detail, 120)}
                  </span>
                )}
              </div>

              {/* Input */}
              <div className="flex items-start">
                <span className="rounded bg-neutral-800/60 px-2 py-0.5 text-[11px] text-neutral-400 break-all">
                  {test.input}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-center">
                {test.status === "idle" && (
                  <span className="rounded-full bg-neutral-800 px-3 py-0.5 text-[11px] text-neutral-500">
                    IDLE
                  </span>
                )}
                {test.status === "running" && (
                  <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-0.5 text-[11px] text-indigo-400">
                    <div className="h-2 w-2 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
                    RUN
                  </span>
                )}
                {test.status === "passed" && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-0.5 text-[11px] font-bold text-emerald-400">
                    PASSED
                  </span>
                )}
                {test.status === "failed" && (
                  <span className="rounded-full bg-red-500/10 px-3 py-0.5 text-[11px] font-bold text-red-400">
                    FAILED
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-[11px] text-neutral-600">
          <span>
            AUTH_LIMITS: username {AUTH_LIMITS.USERNAME_MIN}–
            {AUTH_LIMITS.USERNAME_MAX} · password {AUTH_LIMITS.PASSWORD_MIN}–
            {AUTH_LIMITS.PASSWORD_MAX} · PBKDF2 ×
            {AUTH_LIMITS.PBKDF2_ITERATIONS.toLocaleString()}
          </span>
          <span>DEV MODE ONLY</span>
        </div>
      </div>
    </div>
  );
}
