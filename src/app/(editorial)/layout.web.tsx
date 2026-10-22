import type { ReactNode } from "react";
import { EditorialShell } from "@/features/blog/editorial-shell";

export default function EditorialLayout({ children }: { children: ReactNode }) {
  return <EditorialShell>{children}</EditorialShell>;
}
