"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer /> Print / Save as PDF
    </Button>
  );
}
