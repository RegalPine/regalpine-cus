/**
 * MaterialIcon — Material Symbols Outlined 图标组件。
 * 用法：<MaterialIcon name="palette" size={18} />
 */
export function MaterialIcon({
  name,
  size = 20,
  className = "",
  weight,
  fill,
  grade,
}: {
  name: string;
  size?: number;
  className?: string;
  weight?: number;
  fill?: 0 | 1;
  grade?: number;
}) {
  const style: React.CSSProperties = {
    fontSize: size,
    fontVariationSettings: `'FILL' ${fill ?? 0}, 'wght' ${weight ?? 400}, 'GRAD' ${grade ?? 0}, 'opsz' ${size}`,
  };
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={style}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
