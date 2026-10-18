/**
 * TerminalMockup — 高保真 CLI 终端模拟器。
 * 展示 cus-cli 构建流程的完整输出，匹配设计稿终端样式。
 */

const TERMINAL_LINES: { type: "prompt" | "info" | "success" | "file" | "result" | "cursor"; text: string }[] = [
  { type: "prompt", text: "npx @cus/cli build --gamut p3 --format css,tailwind,json --out ./dist/tokens" },
  { type: "info", text: "ℹ Reading studio theme configuration from /packages/theme/cus.config.ts..." },
  { type: "info", text: "ℹ Parsing OKLCH color matrix (48 tokens, 11 tone ladders)..." },
  { type: "info", text: "ℹ Running Gamut Map engine (sRGB fallback + Display P3 native profile)..." },
  { type: "success", text: "✓ WCAG AAA & APCA validation completed: 100% contrast compliance verified." },
  { type: "info", text: "📦 Emitting target artifacts:" },
  { type: "file", text: "├── dist/tokens/tokens.css (4.2 KB, minified: 2.1 KB)" },
  { type: "file", text: "├── dist/tokens/theme.tailwind.css (2.8 KB)" },
  { type: "file", text: "├── dist/tokens/design-tokens.json (8.6 KB, DTCG Spec)" },
  { type: "file", text: "└── dist/tokens/theme.d.ts (3.1 KB, 100% typed)" },
  { type: "result", text: "✨ Build succeeded! Generated 48 tokens (sRGB + P3) in 12ms." },
  { type: "cursor", text: "" },
];

export function TerminalMockup() {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-xl flex flex-col font-code-value text-code-value">
      {/* Terminal Header */}
      <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-error-container" />
          <span className="w-3 h-3 rounded-full bg-tertiary-container" />
          <span className="w-3 h-3 rounded-full bg-secondary-container" />
          <span className="ml-2 font-code-value text-code-value text-on-surface-variant">bash - cus-cli v2.1.0 (zsh)</span>
        </div>
        <div className="flex items-center gap-space-sm text-outline text-[11px]">
          <span>node v20.11.0</span>
          <span>pnpm v9.0.5</span>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex flex-col gap-1 text-[12px] leading-relaxed select-text">
        {TERMINAL_LINES.map((line, i) => {
          if (line.type === "prompt") {
            return (
              <div key={i} className="flex items-center gap-2 text-outline">
                <span className="text-secondary">➜</span>
                <span className="text-primary">regalpine-cus</span>
                <span className="text-on-surface-variant">
                  git:(<span className="text-tertiary">main</span>)
                </span>
                <span className="text-on-surface">{line.text}</span>
              </div>
            );
          }
          if (line.type === "info") {
            return (
              <div key={i} className="text-on-surface-variant pl-4">{line.text}</div>
            );
          }
          if (line.type === "success") {
            return (
              <div key={i} className="text-secondary pl-4">{line.text}</div>
            );
          }
          if (line.type === "file") {
            return (
              <div key={i} className="text-outline pl-8">{line.text}</div>
            );
          }
          if (line.type === "result") {
            return (
              <div key={i} className="flex items-center gap-2 text-secondary font-semibold pl-4 mt-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>{line.text}</span>
              </div>
            );
          }
          if (line.type === "cursor") {
            return (
              <div key={i} className="flex items-center gap-2 text-outline mt-2">
                <span className="text-secondary">➜</span>
                <span className="text-primary">regalpine-cus</span>
                <span className="text-on-surface-variant">
                  git:(<span className="text-tertiary">main</span>)
                </span>
                <span className="w-2 h-4 bg-primary inline-block animate-pulse" />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
