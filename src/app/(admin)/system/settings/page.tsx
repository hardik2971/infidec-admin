import type { Metadata } from "next";
import { ModuleRoadmap } from "@/components/module-roadmap";

export const metadata: Metadata = { title: "General Settings" };

/** Phase 6 module — replace with the real page when it ships. */
export default function Page() {
  return <ModuleRoadmap href="/system/settings" />;
}
