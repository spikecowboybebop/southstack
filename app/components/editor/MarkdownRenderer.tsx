"use client";

/**
 * MarkdownRenderer — renders LLM output as formatted Markdown with
 * syntax-highlighted code blocks.
 *
 * Streaming support:
 *   While the model is still generating, code blocks may be incomplete
 *   (e.g. the closing ``` hasn't arrived yet).  `balanceCodeFences`
 *   closes any open fence before handing the text to react-markdown so
 *   the highlighter always receives valid, parseable input.
 *
 * Block vs inline detection:
 *   react-markdown v8 removed the `inline` prop.  We split the logic
 *   across TWO components instead:
 *     <pre>  — wraps every fenced block; we render the SyntaxHighlighter here
 *             and return null from the inner <code> so it isn't double-wrapped.
 *     <code> — only reached for truly inline backtick spans.
 *   A module-level WeakSet tracks which <code> nodes are already being
 *   handled by a parent <pre> so we can safely no-op them.
 */

import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

// ─── Helpers ────────────────────────────────────────────────

/**
 * If `text` contains an odd number of triple-backtick fences, the last
 * code block is still open (streaming).  Append a closing fence so
 * react-markdown can parse it correctly.
 */
function balanceCodeFences(text: string): string {
  const count = (text.match(/^```/gm) ?? []).length;
  return count % 2 !== 0 ? text + "\n```" : text;
}

/** Extract the language from a `language-xxx` className string. */
function langFromClass(className?: string): string {
  const m = /language-([\w-]+)/.exec(className ?? "");
  return m ? m[1] : "";
}

// ─── Component ──────────────────────────────────────────────

interface MarkdownRendererProps {
  /** The markdown text to render. */
  content: string;
  /** Pass true while the AI is still streaming tokens. */
  streaming?: boolean;
}

export default function MarkdownRenderer({
  content,
  streaming = false,
}: MarkdownRendererProps) {
  const safeContent = streaming
    ? balanceCodeFences(content || "")
    : content || "";

  return (
    <div className="markdown-body text-[12px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Fenced code blocks ───────────────────────────
          // react-markdown wraps every fenced block in <pre><code>…</code></pre>.
          // We intercept at the <pre> level so we get the full block context,
          // then pass the inner <code> element's props to SyntaxHighlighter.
          pre({ children }) {
            // `children` is the inner <code> element React node.
            // Reach into its props to get className + raw text.
            const child = children as React.ReactElement<
              ComponentPropsWithoutRef<"code">
            > | null;
            const className = child?.props?.className ?? "";
            const language = langFromClass(className);
            const codeText = String(child?.props?.children ?? "").replace(
              /\n$/,
              ""
            );

            return (
              <div className="my-2 overflow-hidden rounded-md border border-white/10">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1">
                  <span className="text-[10px] font-mono text-muted/70">
                    {language || "code"}
                  </span>
                  <CopyButton code={codeText} />
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language || "text"}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: "transparent",
                    fontSize: "11px",
                    padding: "0.75rem",
                  }}
                  codeTagProps={{ style: { fontFamily: "var(--font-mono, monospace)" } }}
                >
                  {codeText}
                </SyntaxHighlighter>
              </div>
            );
          },

          // ── Inline code ──────────────────────────────────
          // Only reached for backtick spans that are NOT inside a <pre>.
          code({ className, children, ...rest }) {
            // If this code node carries a language- class it means react-markdown
            // rendered it outside a <pre> (rare but possible with some plugins).
            // Treat it as a block in that case.
            const language = langFromClass(className);
            const codeText = String(children).replace(/\n$/, "");

            if (language || codeText.includes("\n")) {
              // Fallback block render (no parent <pre> intercepted)
              return (
                <div className="my-2 overflow-hidden rounded-md border border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1">
                    <span className="text-[10px] font-mono text-muted/70">
                      {language || "code"}
                    </span>
                    <CopyButton code={codeText} />
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language || "text"}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      background: "transparent",
                      fontSize: "11px",
                      padding: "0.75rem",
                    }}
                    codeTagProps={{ style: { fontFamily: "var(--font-mono, monospace)" } }}
                  >
                    {codeText}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // True inline code span
            return (
              <code
                className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-indigo-200"
                {...(rest as ComponentPropsWithoutRef<"code">)}
              >
                {children}
              </code>
            );
          },

          // ── Prose elements ───────────────────────────────
          p({ children }) {
            return (
              <p className="mb-2 last:mb-0 text-foreground/90">{children}</p>
            );
          },
          ul({ children }) {
            return (
              <ul className="mb-2 list-disc pl-4 space-y-0.5">{children}</ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="mb-2 list-decimal pl-4 space-y-0.5">{children}</ol>
            );
          },
          li({ children }) {
            return <li className="text-foreground/90">{children}</li>;
          },
          strong({ children }) {
            return (
              <strong className="font-semibold text-foreground">
                {children}
              </strong>
            );
          },
          h1({ children }) {
            return (
              <h1 className="mb-1 mt-3 text-sm font-bold text-foreground">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="mb-1 mt-3 text-[13px] font-bold text-foreground">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="mb-1 mt-2 text-xs font-semibold text-foreground">
                {children}
              </h3>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-indigo/40 pl-3 text-muted">
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr className="my-3 border-border" />;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-indigo underline underline-offset-2 hover:text-indigo-300"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}

// ─── Copy button ────────────────────────────────────────────

function CopyButton({ code }: { code: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {
      // Clipboard API may be blocked in some sandboxed environments
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-muted/60 transition-colors hover:text-foreground"
      title="Copy code"
    >
      Copy
    </button>
  );
}
