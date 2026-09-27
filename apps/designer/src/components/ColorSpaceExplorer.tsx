// CUS-IMPLEMENTATION-04 §67：ColorSpaceExplorer 外壳组件。
//
// 最终组件结构：
// <ColorSpaceExplorer>
//   ├── <ExplorerToolbar>
//   ├── <ColorVolumeViewport>
//   ├── <SliceViewport>
//   └── <ColorParameterPanel>
//
// V1 阶段为薄包装层，将 props 透传给 ColorSpaceView。
// Phase 5+ 将逐步把 ColorSpaceView 内部的 Toolbar / Viewport / Panel
// 拆分为独立子组件。
import type {
  GeneratedTheme,
  ThemeMode,
  V2Color,
} from "@cus/core";
import type { ColorAnchor } from "@cus/core";
import { ColorSpaceView } from "./ColorSpaceView";

export interface ColorSpaceExplorerProps {
  result: GeneratedTheme;
  mode: ThemeMode;
  onSelect: (name: string, color: V2Color) => void;
  candidate: ColorAnchor | null;
  onCandidate: (anchor: ColorAnchor | null) => void;
  onCommit: (mapFirst: boolean) => void;
  background?: V2Color;
}

/**
 * CUS-IMPLEMENTATION-04 §67：色彩空间探索器外壳。
 *
 * 当前直接渲染 ColorSpaceView；后续迭代将拆分为：
 * - ExplorerToolbar：空间/投影/切片/家族选择器
 * - ColorVolumeViewport：3D Volume 渲染（包装 ColorSpace3D + three.js）
 * - SliceViewport：2D 切片渲染（包装 SliceView / OklabSliceView）
 * - ColorParameterPanel：L/C/H 滑杆
 */
export function ColorSpaceExplorer(props: ColorSpaceExplorerProps) {
  return <ColorSpaceView {...props} />;
}
