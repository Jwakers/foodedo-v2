"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

type CookScreenPlugin = {
  setKeepAwake(options: { enabled: boolean }): Promise<void>;
};
const CookScreen = registerPlugin<CookScreenPlugin>("CookScreen");

export async function setCookScreenAwake(enabled: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    await CookScreen.setKeepAwake({ enabled });
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Cook Mode could not update the iOS idle timer.", error);
    }
    return false;
  }
}
