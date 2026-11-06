"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { saveCategoriesAction } from "../actions";

export function CategoriesEditor({ initial, counts, canEdit }: { initial: string[]; counts: Record<string, number>; canEdit: boolean }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = list.join("|") !== initial.join("|");
  const move = (i: number, d: number) =>
    setList((l) => {
      const n = [...l];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {list.map((c, i) => (
            <li key={c} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm">{c}</span>
              <Badge variant="secondary" className="tabular">
                {counts[c] ?? 0} tickets
              </Badge>
              {canEdit && (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${c} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${c} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c}`} disabled={list.length === 1} onClick={() => setList((l) => l.filter((x) => x !== c))}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = draft.trim();
                if (v.length < 2 || list.some((c) => c.toLowerCase() === v.toLowerCase())) return;
                setList((l) => [...l, v]);
                setDraft("");
              }}
            >
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New category" aria-label="New category" />
              <Button type="submit" variant="outline" disabled={draft.trim().length < 2}>
                <Plus /> Add
              </Button>
            </form>
            <div className="flex justify-end">
              <Button
                disabled={!dirty || pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await saveCategoriesAction(list);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
              >
                {pending ? <Spinner /> : <Save />} Save categories
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
