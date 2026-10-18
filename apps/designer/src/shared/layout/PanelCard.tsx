import type { ReactNode } from "react";

export function PanelCard({
  children,
  level = "low",
  className = "",
}: {
  children: ReactNode;
  level?: "lowest" | "low" | "default" | "high" | "highest";
  className?: string;
}) {
  const bgMap = {
    lowest: "bg-surface-container-lowest",
    low: "bg-surface-container-low",
    default: "bg-surface-container",
    high: "bg-surface-container-high",
    highest: "bg-surface-container-highest",
  };
  return (
    <div
      className={`${bgMap[level]} rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md ${className}`}
    >
      {children}
    </div>
  );
}
