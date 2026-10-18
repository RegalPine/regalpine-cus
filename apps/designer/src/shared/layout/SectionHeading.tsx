import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  badge,
  actions,
}: {
  eyebrow?: string;
  title: string;
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {eyebrow && (
          <span className="font-ui text-[11px] font-semibold uppercase tracking-wider text-outline">
            {eyebrow}
          </span>
        )}
        <h2 className="font-ui text-[16px] text-on-surface font-semibold tracking-tight">
          {title}
        </h2>
        {badge && (
          <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono text-[12px]">
            {badge}
          </span>
        )}
      </div>
      {actions && <div className="flex items-center gap-space-sm">{actions}</div>}
    </div>
  );
}
