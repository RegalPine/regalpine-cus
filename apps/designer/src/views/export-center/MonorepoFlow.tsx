/**
 * MonorepoFlow — Monorepo 包间集成流向图（水平卡片 + 箭头布局）。
 * 展示 @cus/* 包之间的依赖关系和数据流，匹配设计稿 5 节点水平排列。
 */
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n";

interface FlowNode {
  label: string;
  descKey: TranslationKey;
  version: string;
  statusKey: TranslationKey;
  statusColor: string;
  isLast?: boolean;
}

const NODES: FlowNode[] = [
  { label: "@cus/color", descKey: "monorepo.colorDesc", version: "v1.4.0", statusKey: "monorepo.colorStatus", statusColor: "text-secondary" },
  { label: "@cus/palette", descKey: "monorepo.paletteDesc", version: "v1.4.0", statusKey: "monorepo.colorStatus", statusColor: "text-secondary" },
  { label: "@cus/semantic", descKey: "monorepo.semanticDesc", version: "v1.4.0", statusKey: "monorepo.semanticStatus", statusColor: "text-secondary" },
  { label: "@cus/export", descKey: "monorepo.exportDesc", version: "v2.1.0", statusKey: "monorepo.exportStatus", statusColor: "text-secondary" },
  { label: "apps/designer", descKey: "monorepo.designerDesc", version: "", statusKey: "monorepo.designerStatus", statusColor: "text-secondary", isLast: true },
];

export function MonorepoFlow() {
  const t = useT();
  return (
    <div className="flex flex-col gap-space-sm">
      {/* Header badges */}
      <div className="flex items-center gap-space-sm mb-1">
        <span className="font-code-value text-code-value text-secondary px-space-sm py-1 rounded bg-secondary-container/20">
          {t("monorepo.allLinked")}
        </span>
        <span className="font-code-value text-code-value text-on-surface-variant px-space-sm py-1 rounded bg-surface-container">
          {t("monorepo.cacheHit")}
        </span>
      </div>

      {/* Horizontal card flow */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-space-md relative">
        {NODES.map((node) => (
          <div key={node.label} className="relative">
            <div
              className={`rounded-lg p-space-md flex flex-col gap-space-sm shadow-sm group transition-all ${
                node.isLast
                  ? "bg-surface-container-highest hover:bg-surface-bright"
                  : "bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-code-value text-code-value font-semibold text-on-surface">{node.label}</span>
                <span className={`w-2 h-2 rounded-full bg-secondary ${node.isLast ? "animate-pulse" : ""}`} />
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">{t(node.descKey)}</div>
              <div className="mt-auto pt-space-xs flex items-center justify-between font-code-value text-[11px] text-outline">
                {node.version ? (
                  <>
                    <span>{node.version}</span>
                    <span className={node.statusColor}>{t(node.statusKey)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-secondary">{t(node.statusKey)}</span>
                    <span className="text-secondary">{t("monorepo.dualHMR")}</span>
                  </>
                )}
              </div>
            </div>
            {/* Arrow connector (hidden on last) */}
            {!node.isLast && (
              <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-outline-variant items-center justify-center w-6 h-6 bg-background rounded-full">
                <MaterialIcon name="arrow_forward" size={18} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
