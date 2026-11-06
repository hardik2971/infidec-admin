"use server";

import { refresh } from "next/cache";
import { logActivity } from "@/lib/activity";
import { failure, type Result } from "@/lib/actions";
import { assertPermission } from "@/lib/auth/session";
import { generalSettingsSchema, saveGeneralSettings } from "@/lib/settings/general";

export async function saveGeneralSettingsAction(input: unknown): Promise<Result> {
  try {
    const actor = await assertPermission("settings:manage_settings");
    const values = generalSettingsSchema.parse(input);
    const { changed, before } = await saveGeneralSettings(values, actor);
    if (changed.length) {
      await logActivity({
        action: "settings.updated",
        actorId: actor.uid,
        actorEmail: actor.email,
        targetType: "settings",
        targetId: "general",
        summary: `Updated general settings: ${changed.map((k) => `${k} ${String(before[k]) || "—"} → ${String(values[k]) || "—"}`).join(", ")}`,
      });
    }
    refresh();
    return { ok: true, message: changed.length ? "Settings saved." : "Nothing changed." };
  } catch (error) {
    return failure(error, "general settings");
  }
}
