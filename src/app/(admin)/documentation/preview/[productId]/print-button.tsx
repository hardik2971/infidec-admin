"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog — choose "Save as PDF" to export. */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer /> Save as PDF
    </Button>
  );
}
