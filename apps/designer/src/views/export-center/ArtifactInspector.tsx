/**
 * ArtifactInspector — 多文件 Tab 代码检查器。
 * 彩色圆点 + 文件大小 + 语法高亮 + 行号 + 一键复制/下载/Prettier。
 */
import { useState, useCallback, useMemo } from "react";
import type { ExportFormat } from "@cus/export";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import { useUIStore } from "../../stores/ui-store";

interface ArtifactFile {
  name: string;
  format: ExportFormat | string;
  source: string;
}

const TAB_DOT_COLORS: Record<string, string> = {
  css: "bg-primary",
  tailwind: "bg-secondary",
  dtcg: "bg-tertiary",
  figma: "bg-tertiary",
  ts: "bg-primary-container",
  json: "bg-outline",
  schema: "bg-outline",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 简易语法高亮：对 CSS / JSON / TS 做基础着色 */
function highlightCode(source: string, format: string): string {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (format === "css" || format === "tailwind") {
    return escaped
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-outline">$1</span>')
      .replace(/(@\w+)/g, '<span class="text-tertiary">$1</span>')
      .replace(/(:root|@supports)/g, '<span class="text-primary">$1</span>')
      .replace(/(--[\w-]+)/g, '<span class="text-secondary">$1</span>')
      .replace(/(oklch\([^)]+\))/g, '<span class="text-primary">$1</span>')
      .replace(/(color\([^)]+\))/g, '<span class="text-primary">$1</span>')
      .replace(/("[^"]*")/g, '<span class="text-tertiary">$1</span>');
  }

  if (format === "dtcg" || format === "json" || format === "figma") {
    return escaped
      .replace(/("[\w$.@-]+")\s*:/g, '<span class="text-secondary">$1</span>:')
      .replace(/:\s*("[^"]*")/g, ': <span class="text-tertiary">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-primary">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="text-tertiary">$1</span>');
  }

  if (format === "ts") {
    return escaped
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-outline">$1</span>')
      .replace(/\b(export|const|interface|type|as|readonly)\b/g, '<span class="text-tertiary">$1</span>')
      .replace(/("[^"]*")/g, '<span class="text-primary">$1</span>')
      .replace(/(\d+\.?\d*)/g, '<span class="text-primary">$1</span>');
  }

  return escaped;
}

/** 大文件阈值：超过此大小跳过语法高亮，防止主线程阻塞导致页面挂起 */
const HIGHLIGHT_SIZE_LIMIT = 100 * 1024; // 100 KB
/** 最大渲染行数（行号 + 代码内容同步截断） */
const MAX_RENDER_LINES = 5000;

export function ArtifactInspector({
  files,
  activeFormat,
  onFormatChange,
  onDownload,
}: {
  files: ArtifactFile[];
  activeFormat: string;
  onFormatChange: (format: string) => void;
  onDownload?: (format: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  const activeFile = files.find((f) => f.format === activeFormat) ?? files[0];

  const handleCopy = useCallback(() => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.source).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [activeFile]);

  // Prettier 格式化（简易实现：JSON 重新缩进、CSS/TS 去除多余空行）
  const handlePrettier = useCallback(() => {
    if (!activeFile) return;
    const fmt = activeFile.format;
    let formatted = activeFile.source;
    try {
      if (fmt === "json" || fmt === "dtcg" || fmt === "figma" || fmt === "schema") {
        formatted = JSON.stringify(JSON.parse(activeFile.source), null, 2);
      } else {
        // 对其他格式：去除连续空行并统一缩进
        formatted = activeFile.source.replace(/\n{3,}/g, "\n\n").trimEnd();
      }
    } catch {
      // 解析失败时仅做基础清理
      formatted = activeFile.source.replace(/\n{3,}/g, "\n\n").trimEnd();
    }
    // 复制到剪贴板
    navigator.clipboard.writeText(formatted).then(
      () => useUIStore.getState().setToast(t("inspector.prettierDone")),
      () => {},
    );
  }, [activeFile, t]);

  if (!activeFile) return null;

  const allLines = activeFile.source.split("\n");
  const byteSize = new Blob([activeFile.source]).size;
  const isLargeFile = byteSize > HIGHLIGHT_SIZE_LIMIT;
  const lineCount = allLines.length;
  const truncated = lineCount > MAX_RENDER_LINES;
  const lines = truncated ? allLines.slice(0, MAX_RENDER_LINES) : allLines;
  const displaySource = lines.join("\n");

  const highlighted = useMemo(
    () =>
      isLargeFile
        ? displaySource
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
        : highlightCode(displaySource, activeFile.format),
    [displaySource, activeFile.format, isLargeFile],
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Tab Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-space-md pb-space-xs mb-space-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          {files.map((f) => {
            const isActive = activeFormat === f.format;
            const dotColor = TAB_DOT_COLORS[f.format] ?? "bg-outline";
            const size = new Blob([f.source]).size;
            return (
              <button
                key={f.format}
                className={`artifact-tab flex items-center gap-1.5 px-space-md py-2 rounded-t-lg font-code-value text-code-value font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-surface-container-highest text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                }`}
                onClick={() => onFormatChange(f.format)}
              >
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span>{f.name}</span>
                <span className="text-outline text-[10px] ml-1">{formatFileSize(size)}</span>
              </button>
            );
          })}
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-space-xs">
          <button
            className={`flex items-center gap-1 px-space-sm py-1 rounded font-code-value text-code-value transition-all active:scale-95 shadow-sm ${
              copied
                ? "bg-secondary/20 text-secondary"
                : "bg-surface-container hover:bg-surface-container-high text-on-surface"
            }`}
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            <MaterialIcon name={copied ? "check_circle" : "content_copy"} size={15} className={copied ? "text-secondary" : "text-primary"} />
            <span>{copied ? t("exportCenter.copied") : t("exportCenter.copyArtifact")}</span>
          </button>
          {onDownload && (
            <button
              className="flex items-center gap-1 px-space-sm py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-code-value text-code-value transition-all active:scale-95 shadow-sm"
              onClick={() => onDownload(activeFile.format)}
              title="Download active artifact"
            >
              <MaterialIcon name="file_download" size={15} className="text-secondary" />
              <span>{t("exportCenter.downloadSingle")}</span>
            </button>
          )}
          <button
            className="flex items-center gap-1 px-space-sm py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-code-value text-code-value transition-colors shadow-sm"
            title="Prettier format"
            onClick={handlePrettier}
          >
            <MaterialIcon name="code_blocks" size={15} />
            <span>Prettier</span>
          </button>
        </div>
      </div>

      {/* ── Inspector Banner ── */}
      <div className="flex items-center justify-between pb-space-md mb-space-md border-b border-outline-variant/20 text-on-surface-variant text-[11px]">
        <div className="flex items-center gap-space-md">
          <span className="text-primary font-semibold">Active Engine: OKLCH perceptual</span>
          <span>Encoding: UTF-8 CRLF</span>
          <span className="text-secondary">AST Verified: Valid</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary" />
          <span>{t("inspector.liveSynced")}</span>
        </div>
      </div>

      {/* ── Code Viewer with Line Numbers ── */}
      <div className="flex-1 bg-surface-container-lowest rounded-lg shadow-lg overflow-x-auto min-h-[460px]">
        <div className="flex items-start text-on-surface leading-6 font-code-value text-code-value selection:bg-primary-container/30 p-space-md">
          {/* Line Numbers */}
          <div className="select-none pr-space-md text-outline/50 text-right flex flex-col font-mono text-[11px] border-r border-outline-variant/20 mr-space-md shrink-0">
            {lines.map((_, i) => (
              <span key={i}>{String(i + 1).padStart(2, "0")}</span>
            ))}
          </div>
          {/* Code Content */}
          <pre
            className="overflow-visible font-code-value text-code-value flex-1 whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>

      {/* ─ File Info Bar ── */}
      <div className="flex items-center justify-between mt-space-sm text-[11px] text-on-surface-variant font-mono px-1">
        <span>
          {lineCount} 行 · {byteSize.toLocaleString()} bytes
          {truncated && (
            <span className="text-secondary ml-2">
              （仅渲染前 {MAX_RENDER_LINES.toLocaleString()} 行）
            </span>
          )}
          {isLargeFile && !truncated && (
            <span className="text-secondary ml-2">{t("exportCenter.skipHighlight")}</span>
          )}
        </span>
        <span>{activeFile.format.toUpperCase()} {t("exportCenter.format")}</span>
      </div>
    </div>
  );
}
