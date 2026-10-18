/**
 * FormatSelector — 5 种目标平台格式卡片选择器（radio 圆点 + 右侧 badge 标签）。
 */
import type { ExportFormat } from "@cus/export";
import { useT } from "../../i18n";

export interface FormatDefinition {
  value: ExportFormat | string;
  label: string;
  ext: string;
  badge: string;
  badgeColor: string;
  description: string;
}

export const ALL_FORMATS: FormatDefinition[] = [
  {
    value: "css",
    label: "CSS Variables",
    ext: ".css",
    badge: "Modern OKLCH",
    badgeColor: "text-secondary",
    description: "原生 CSS Custom Properties，含 @supports (display-p3) 级联回退与语义映射层。",
  },
  {
    value: "tailwind",
    label: "Tailwind CSS v4",
    ext: ".css",
    badge: "@theme spec",
    badgeColor: "text-on-surface-variant",
    description: "Tailwind v4 标准 `@theme` 指令，自动生成色彩阶梯与 alpha-value 动态插值。",
  },
  {
    value: "dtcg",
    label: "DTCG Design Tokens",
    ext: ".json",
    badge: "W3C Community",
    badgeColor: "text-on-surface-variant",
    description: "符合 W3C Design Tokens Community Group 标准的 $value 与 $type 类型化 JSON 树。",
  },
  {
    value: "figma",
    label: "Figma Variables Sync",
    ext: ".json",
    badge: "Tokens Studio",
    badgeColor: "text-on-surface-variant",
    description: "支持直接导入 Figma Variables & Tokens Studio 插件，包含 Light/Dark 模式集合。",
  },
  {
    value: "ts",
    label: "Monorepo Package",
    ext: ".d.ts",
    badge: "@cus/theme (TS)",
    badgeColor: "text-on-surface-variant",
    description: "发布至 packages/theme 的编译产物：esm, cjs, d.ts 与强类型常量字典。",
  },
];

const FORMAT_LABEL_KEYS: Record<string, string> = {
  css: "exportCenter.cssLabel",
  tailwind: "exportCenter.twLabel",
  dtcg: "exportCenter.dtcgLabel",
  figma: "exportCenter.figmaLabel",
  ts: "exportCenter.tsLabel",
};

const FORMAT_BADGE_KEYS: Record<string, string> = {
  css: "exportCenter.cssBadge",
  tailwind: "exportCenter.twBadge",
  dtcg: "exportCenter.dtcgBadge",
  figma: "exportCenter.figmaBadge",
  ts: "exportCenter.tsBadge",
};

const FORMAT_DESC_KEYS: Record<string, string> = {
  css: "exportCenter.cssDesc",
  tailwind: "exportCenter.twDesc",
  dtcg: "exportCenter.figmaDesc",
  figma: "exportCenter.figmaDirect",
  ts: "exportCenter.pkgDesc",
};

export function FormatSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (format: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-space-xs">
      {ALL_FORMATS.map((f) => {
        const isActive = selected === f.value;
        return (
          <button
            key={f.value}
            className={`group flex items-start gap-space-md p-space-md rounded-lg transition-all text-left ${
              isActive
                ? "bg-surface-container-high text-on-surface"
                : "bg-surface-container hover:bg-surface-container-high text-on-surface"
            }`}
            onClick={() => onSelect(f.value)}
          >
            {/* Radio dot */}
            <div
              className={`w-4 h-4 rounded-full mt-0.5 shrink-0 flex items-center justify-center ${
                isActive
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-highest text-on-surface-variant"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isActive ? "bg-surface-container-lowest" : "bg-transparent"
                }`}
              />
            </div>

            {/* Content */}
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span
                  className={`font-label-md text-label-md font-semibold transition-colors ${
                    isActive ? "text-on-surface" : "text-on-surface group-hover:text-primary"
                  }`}
                >
                  {t((FORMAT_LABEL_KEYS[f.value] ?? "exportCenter.cssLabel") as Parameters<typeof t>[0])}
                </span>
                <span
                  className={`font-code-value text-code-value text-[10px] px-1.5 py-0.5 rounded bg-surface-container-lowest ${f.badgeColor}`}
                >
                  {t((FORMAT_BADGE_KEYS[f.value] ?? "exportCenter.cssBadge") as Parameters<typeof t>[0])}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-normal">
                {t((FORMAT_DESC_KEYS[f.value] ?? "exportCenter.cssDesc") as Parameters<typeof t>[0])}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
