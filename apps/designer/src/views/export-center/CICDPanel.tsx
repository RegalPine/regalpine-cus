/**
 * CICDPanel — CI/CD 自动化校验面板。
 * 展示 3 项 PASS 检查 + 查看 CI 脚本链接。
 */
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";

const CHECKS = [
  { name: "APCA 75 / WCAG AAA Threshold", status: "PASS" as const },
  { name: "OKLCH Chroma Clipping < 0.02", status: "PASS" as const },
  { name: "JSON-Schema Draft-07 Conformance", status: "PASS" as const },
];

export function CICDPanel() {
  const t = useT();
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
        <button className="font-label-sm text-label-sm text-primary hover:text-primary-fixed-dim transition-colors flex items-center gap-1">
          <span>{t("exportCenter.viewScript")}</span>
          <MaterialIcon name="open_in_new" size={14} />
        </button>
      </div>
    </div>
  );
}
