import { createContext, useContext } from "react";
import type { RGBSpace } from "@cus/core";

export const PreviewSpace = createContext<RGBSpace>("srgb");
export const usePreviewSpace = () => useContext(PreviewSpace);
