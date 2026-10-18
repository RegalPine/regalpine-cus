/**
 * GamutStrategyPanel — 色彩空间与编码规则面板。
 * 包含色域策略单选、命名规范下拉、Tree-shaking / Schema 校验开关、P3 色域覆盖率 Gauge。
 */
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";

export type GamutPolicy = "dual-p3-srgb" | "srgb-strict" | "display-p3-only";
export type NamingConvention = "kebab-case" | "camelCase" | "dtcg-dot" | "scss-variable";

const GAMUT_OPTIONS: { value: GamutPolicy; label: string; badge: string; badgeColor: string }[] = [
  { value: "dual-p3-srgb", label: "Dual-Profile (P3 with sRGB fallback)", badge: "Recommended", badgeColor: "text-secondary" },
  { value: "srgb-strict", label: "sRGB Strict (Gamma 2.2 Clamped)", badge: "Legacy", badgeColor: "text-outline" },
  { value: "display-p3-only", label: "Display P3 Only (High Gamut Screens)", badge: "DCI-P3", badgeColor: "text-tertiary" },
];

const NAMING_OPTIONS: { value: NamingConvention; label: string }[] = [
  { value: "kebab-case", label: "Kebab-case (--cus-color-primary-500)" },
  { value: "camelCase", label: "CamelCase (cusColorPrimary500)" },
  { value: "dtcg-dot", label: "DTCG Dot Notation (cus.color.primary.500)" },
  { value: "scss-variable", label: "SCSS Variable ($cus-color-primary-500)" },
];

interface GamutStrategyPanelProps {
  gamutPolicy: GamutPolicy;
  onGamutPolicyChange: (v: GamutPolicy) => void;
  namingConvention: NamingConvention;
  onNamingConventionChange: (v: NamingConvention) => void;
  treeShaking: boolean;
  onTreeShakingChange: (v: boolean) => void;
  schemaValidation: boolean;
  onSchemaValidationChange: (v: boolean) => void;
  p3Coverage: number;
  p3HuesCalibrated: string;
}

export function GamutStrategyPanel({
  gamutPolicy,
  onGamutPolicyChange,
  namingConvention,
  onNamingConventionChange,
  treeShaking,
  onTreeShakingChange,
  schemaValidation,
  onSchemaValidationChange,
  p3Coverage,
  p3HuesCalibrated,
}: GamutStrategyPanelProps) {
  const t = useT();
  const circumference = 2 * Math.PI * 16;
  const dashOffset = circumference - (p3Coverage / 100) * circumference;

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MaterialIcon name="qr_code_2" size={18} className="text-secondary" />
          <h3 className="font-headline-sm text-headline-sm text-on-surface">{t("exportCenter.colorSpace")}</h3>
        </div>
        <span className="font-label-sm text-label-sm text-secondary flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          {t("exportCenter.p3EngineActive")}
        </span>
      </div>

      {/* Gamut Policy */}
      <div className="flex flex-col gap-space-sm">
        <label className="font-label-sm text-label-sm text-on-surface-variant">{t("exportCenter.gamutPolicy")}</label>
        <div className="grid grid-cols-1 gap-space-xs">
          {GAMUT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center justify-between p-space-sm rounded-lg cursor-pointer transition-colors ${
                gamutPolicy === opt.value
                  ? "bg-surface-container-high"
                  : "bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-center gap-space-sm">
                <input
                  type="radio"
                  name="gamut-strategy"
                  checked={gamutPolicy === opt.value}
                  onChange={() => onGamutPolicyChange(opt.value)}
                  className="accent-primary w-4 h-4"
                />
                <span className="font-body-lg text-body-lg text-on-surface font-medium">{opt.label}</span>
              </div>
              <span className={`font-code-value text-code-value text-[10px] px-1.5 py-0.5 rounded bg-surface-container-lowest ${opt.badgeColor}`}>
                {opt.badge}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Naming Convention */}
      <div className="flex flex-col gap-space-xs">
        <label className="font-label-sm text-label-sm text-on-surface-variant">{t("exportCenter.namingConv")}</label>
        <div className="relative w-full">
          <select
            value={namingConvention}
            onChange={(e) => onNamingConventionChange(e.target.value as NamingConvention)}
            className="w-full bg-surface-container text-on-surface font-code-value text-code-value px-space-md py-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:bg-surface-container-high"
          >
            {NAMING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <MaterialIcon name="expand_more" size={18} className="absolute right-3 top-2.5 pointer-events-none text-on-surface-variant" />
        </div>
      </div>

      {/* Toggle Switches */}
      <div className="flex flex-col gap-space-sm pt-space-xs">
        {/* Tree-shaking */}
        <div className="flex items-center justify-between p-space-sm rounded bg-surface-container">
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface">{t("exportCenter.treeShaking")}</span>
            <span className="font-body-sm text-body-sm text-outline">{t("exportCenter.treeShakingDesc")}</span>
          </div>
          <div
            className="w-9 h-5 rounded-full p-0.5 flex items-center cursor-pointer transition-colors"
            style={{
              background: treeShaking ? "#c0c1ff" : "#464554",
              justifyContent: treeShaking ? "flex-end" : "flex-start",
            }}
            onClick={() => onTreeShakingChange(!treeShaking)}
            role="switch"
            aria-checked={treeShaking}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>

        {/* Schema Validation */}
        <div className="flex items-center justify-between p-space-sm rounded bg-surface-container">
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface">{t("exportCenter.schemaValidation")}</span>
            <span className="font-body-sm text-body-sm text-outline">{t("exportCenter.schemaValidationDesc")}</span>
          </div>
          <div
            className="w-9 h-5 rounded-full p-0.5 flex items-center cursor-pointer transition-colors"
            style={{
              background: schemaValidation ? "#4edea3" : "#464554",
              justifyContent: schemaValidation ? "flex-end" : "flex-start",
            }}
            onClick={() => onSchemaValidationChange(!schemaValidation)}
            role="switch"
            aria-checked={schemaValidation}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>

      {/* P3 Gamut Coverage Gauge */}
      <div className="p-space-md rounded-lg bg-surface-container flex items-center justify-between">
        <div className="flex items-center gap-space-md">
          <div className="relative w-10 h-10 flex items-center justify-center">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle
                className="text-surface-container-highest"
                cx={20}
                cy={20}
                fill="transparent"
                r={16}
                stroke="currentColor"
                strokeWidth={3}
              />
              <circle
                className="text-secondary"
                cx={20}
                cy={20}
                fill="transparent"
                r={16}
                stroke="currentColor"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeWidth={3}
              />
            </svg>
            <span className="absolute font-code-value text-[10px] text-secondary font-bold">{p3Coverage}%</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface font-semibold">{t("exportCenter.p3Coverage")}</span>
            <span className="font-code-value text-code-value text-on-surface-variant">{p3HuesCalibrated}</span>
          </div>
        </div>
        <span className="font-code-value text-code-value text-secondary px-2 py-0.5 rounded bg-secondary-container/20">{t("exportCenter.p3Optimal")}</span>
      </div>
    </div>
  );
}
