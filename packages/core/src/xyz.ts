/** XYZ 使用 Y=1 的归一化尺度。 */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface WhitePoint extends XYZ {}

export const D65: Readonly<WhitePoint> = Object.freeze({
  x: 0.95047,
  y: 1,
  z: 1.08883,
});
