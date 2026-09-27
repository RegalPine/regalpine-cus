/** CIELCh：L* 为 0–100，C* 非负，规范化色相为 [0, 360) 度。 */
export interface LCh {
  l: number;
  c: number;
  h: number | null;
}
