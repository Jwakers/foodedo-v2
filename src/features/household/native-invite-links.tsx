"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { householdInvitePath } from "@/lib/domain/household-links";
import { rememberInvite } from "./invite-continuation";

export function NativeInviteLinks() {
  const router = useRouter();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let remove: (() => Promise<void>) | undefined;
    const handle = (url: string) => {
      if (!active) return;
      const path = householdInvitePath(
        url,
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://foodedo.com",
      );
      if (!path) return;
      rememberInvite(new URL(url).searchParams.get("token")!);
      router.push(path);
    };
    void import("@capacitor/app")
      .then(async ({ App }) => {
        const listener = await App.addListener("appUrlOpen", (event) =>
          handle(event.url),
        );
        if (!active) {
          await listener.remove();
          return;
        }
        remove = () => listener.remove();
        const launch = await App.getLaunchUrl();
        if (launch) handle(launch.url);
      })
      .catch((error) =>
        console.error("Could not initialise invitation links.", error),
      );
    return () => {
      active = false;
      void remove?.();
    };
  }, [router]);
  return null;
}
