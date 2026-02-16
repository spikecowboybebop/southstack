export default function EditorMockup() {
  return (
    <section className="relative px-6 pb-28">
      <div className="mx-auto max-w-4xl">
        {/* Glow behind the editor */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-[400px] w-[600px] rounded-full bg-indigo/5 blur-3xl pointer-events-none" />

        {/* Editor Frame */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40">
          {/* Title Bar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="font-mono text-xs text-muted">index.tsx — SouthStack</span>
            <div className="w-14" />
          </div>

          {/* Editor Body */}
          <div className="flex">
            {/* Sidebar */}
            <div className="hidden w-48 shrink-0 border-r border-border bg-[#0d0d0d] p-3 md:block">
              <div className="mb-3 text-[10px] font-semibold tracking-wider text-muted uppercase">
                Explorer
              </div>
              <div className="space-y-0.5 font-mono text-xs">
                <FileItem name="src/" indent={0} isFolder />
                <FileItem name="components/" indent={1} isFolder />
                <FileItem name="App.tsx" indent={2} active />
                <FileItem name="Header.tsx" indent={2} />
                <FileItem name="utils/" indent={1} isFolder />
                <FileItem name="helpers.ts" indent={2} />
                <FileItem name="index.tsx" indent={1} />
                <FileItem name="package.json" indent={0} />
                <FileItem name="tsconfig.json" indent={0} />
              </div>
            </div>

            {/* Code Area */}
            <div className="min-h-[320px] flex-1 overflow-x-auto p-5 font-mono text-[13px] leading-6 md:min-h-[380px]">
              <CodeLines />
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between border-t border-border bg-indigo/10 px-4 py-1.5">
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Offline Ready
              </span>
              <span>TypeScript</span>
            </div>
            <div className="text-[11px] text-muted">
              Ln 12, Col 8 · UTF-8
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FileItem({
  name,
  indent,
  isFolder,
  active,
}: {
  name: string;
  indent: number;
  isFolder?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${
        active
          ? "bg-indigo/15 text-indigo-light"
          : "text-muted hover:text-foreground"
      }`}
      style={{ paddingLeft: `${indent * 12 + 6}px` }}
    >
      <span className="text-[10px]">{isFolder ? "📁" : "📄"}</span>
      <span>{name}</span>
    </div>
  );
}

function CodeLines() {
  const lines = [
    { num: 1, content: <><span className="token-keyword">import</span> <span className="token-bracket">{"{"}</span> <span className="token-variable">useState</span> <span className="token-bracket">{"}"}</span> <span className="token-keyword">from</span> <span className="token-string">&apos;react&apos;</span><span className="token-plain">;</span></> },
    { num: 2, content: <><span className="token-keyword">import</span> <span className="token-bracket">{"{"}</span> <span className="token-variable">Editor</span> <span className="token-bracket">{"}"}</span> <span className="token-keyword">from</span> <span className="token-string">&apos;@southstack/core&apos;</span><span className="token-plain">;</span></> },
    { num: 3, content: null },
    { num: 4, content: <><span className="token-comment">{"// Initialize the offline-first editor"}</span></> },
    { num: 5, content: <><span className="token-keyword">export default function</span> <span className="token-function">App</span><span className="token-bracket">()</span> <span className="token-bracket">{"{"}</span></> },
    { num: 6, content: <><span className="token-keyword">  const</span> <span className="token-bracket">[</span><span className="token-variable">code</span><span className="token-plain">,</span> <span className="token-variable">setCode</span><span className="token-bracket">]</span> <span className="token-operator">=</span> <span className="token-function">useState</span><span className="token-bracket">(</span><span className="token-string">&apos;&apos;</span><span className="token-bracket">)</span><span className="token-plain">;</span></> },
    { num: 7, content: <><span className="token-keyword">  const</span> <span className="token-bracket">[</span><span className="token-variable">lang</span><span className="token-bracket">]</span> <span className="token-operator">=</span> <span className="token-function">useState</span><span className="token-bracket">(</span><span className="token-string">&apos;typescript&apos;</span><span className="token-bracket">)</span><span className="token-plain">;</span></> },
    { num: 8, content: null },
    { num: 9, content: <><span className="token-keyword">  return</span> <span className="token-bracket">(</span></> },
    { num: 10, content: <><span className="token-plain">    </span><span className="token-bracket">&lt;</span><span className="token-type">Editor</span></> },
    { num: 11, content: <><span className="token-plain">      </span><span className="token-variable">value</span><span className="token-operator">=</span><span className="token-bracket">{"{"}</span><span className="token-variable">code</span><span className="token-bracket">{"}"}</span></> },
    { num: 12, content: <><span className="token-plain">      </span><span className="token-variable">language</span><span className="token-operator">=</span><span className="token-bracket">{"{"}</span><span className="token-variable">lang</span><span className="token-bracket">{"}"}</span></> },
    { num: 13, content: <><span className="token-plain">      </span><span className="token-variable">onChange</span><span className="token-operator">=</span><span className="token-bracket">{"{"}</span><span className="token-variable">setCode</span><span className="token-bracket">{"}"}</span></> },
    { num: 14, content: <><span className="token-plain">      </span><span className="token-variable">offline</span><span className="token-operator">=</span><span className="token-bracket">{"{"}</span><span className="token-keyword">true</span><span className="token-bracket">{"}"}</span></> },
    { num: 15, content: <><span className="token-plain">    </span><span className="token-bracket">/&gt;</span></> },
    { num: 16, content: <><span className="token-plain">  </span><span className="token-bracket">)</span><span className="token-plain">;</span></> },
    { num: 17, content: <><span className="token-bracket">{"}"}</span></> },
  ];

  return (
    <div className="relative">
      {lines.map((line) => (
        <div key={line.num} className="flex">
          <span className="mr-6 inline-block w-6 shrink-0 select-none text-right text-muted/40">
            {line.num}
          </span>
          <span className="whitespace-pre">{line.content ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
