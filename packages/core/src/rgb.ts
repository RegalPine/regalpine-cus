/** sRGB 通道使用归一化浮点数，标称范围为 0–1。 */
import type { RGBSpace } from "./color";

export interface RGB {
  r: number;
  g: number;
  b: number;
  /** CUS-IMPLEMENTATION-02 §8：色域空间标记（可选，由创建函数填充）。 */
  space?: RGBSpace;
}

/** Alpha 独立保存，不参与 XYZ、Lab 与 LCh 转换。 */
export interface RGBA extends RGB {
  alpha?: number;
}
