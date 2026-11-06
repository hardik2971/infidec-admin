"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Free-text chips: Enter or comma adds, Backspace on an empty input removes the last one. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 30,
  disabled,
  invalid,
}: {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p.slice(0, 80));
    onChange(next);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-destructive/20",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {tag}
          <button
            type="button"
            className="rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(e) => (e.target.value.endsWith(",") ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-28 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
