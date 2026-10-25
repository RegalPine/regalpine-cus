/**
 * CICDPanel — CI/CD 自动化校验面板。
 * 展示 3 项 PASS 检查 + 查看 CI 脚本链接。
 */
import { useState, useCallback } from "react";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import { useUIStore } from "../../stores/ui-store";

const CHECKS = [
  { name: "APCA 75 / WCAG AAA Threshold", status: "PASS" as const },
  { name: "OKLCH Chroma Clipping < 0.02", status: "PASS" as const },
  { name: "JSON-Schema Draft-07 Conformance", status: "PASS" as const },
];

export function CICDPanel() {
  const t = useT();
  const [scriptOpen, setScriptOpen] = useState(false);

  // GitHub Actions 工作流内容
  const workflowContent = `name: Theme Token Pipeline

on:
  push:
    branches: [main, develop]
    paths:
      - 'packages/theme/**'
      - 'apps/designer/src/styles/**'
  pull_request:
    branches: [main]

jobs:
  validate-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Validate Theme Schema
        run: pnpm validate:theme
      - name: Build Tokens
        run: pnpm build:tokens
      - name: Run WCAG Contrast Checks
        run: pnpm test:contrast
      - name: Generate Color Space Reports
        run: pnpm report:gamut
      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: theme-tokens
          path: |
            dist/tokens/
            reports/
          retention-days: 30`;

  const handleCopyScript = useCallback(() => {
    navigator.clipboard.writeText(workflowContent).then(
      () => {
        useUIStore.getState().setToast(t("exportCenter.scriptCopied"));
        setScriptOpen(false);
      },
      () => {},
    );
  }, [workflowContent, t]);
  return (
    <div className="flex flex-col gap-space-md">
      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
        {t("exportCenter.cicdDesc")}
      </p>

      <div className="flex flex-col gap-space-xs">
        {CHECKS.map((check) => (
          <div
            key={check.name}
            className="flex items-center justify-between p-space-sm rounded bg-surface-container font-code-value text-code-value"
          >
            <div className="flex items-center gap-2">
              <MaterialIcon name="check_circle" size={16} className="text-secondary" />
              <span className="text-on-surface">{check.name}</span>
            </div>
            <span className="text-secondary">{check.status}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-space-xs flex items-center justify-between">
        <span className="font-code-value text-body-sm text-outline">Workflow: .github/workflows/tokens.yml</span>
        <button
          className="font-label-sm text-label-sm text-primary hover:text-primary-fixed-dim transition-colors flex items-center gap-1"
          onClick={() => setScriptOpen(!scriptOpen)}
        >
          <span>{t("exportCenter.viewScript")}</span>
          <MaterialIcon name={scriptOpen ? "close" : "open_in_new"} size={14} />
        </button>
      </div>

      {/* CI 脚本预览弹窗 */}
      {scriptOpen && (
        <div className="mt-space-sm bg-surface-container-lowest rounded-lg shadow-lg p-space-md border border-outline-variant/20">
          <div className="flex items-center justify-between mb-space-sm">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1">
              <MaterialIcon name="terminal" size={14} className="text-primary" />
              tokens.yml
            </span>
            <button
              className="px-space-sm py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-fixed-dim transition-colors flex items-center gap-1"
              onClick={handleCopyScript}
            >
              <MaterialIcon name="content_copy" size={12} />
              {t("exportCenter.copyScript")}
            </button>
          </div>
          <pre className="font-code-value text-code-value text-on-surface-variant overflow-x-auto max-h-[240px] whitespace-pre-wrap">
            {workflowContent}
          </pre>
        </div>
      )}
    </div>
  );
}
