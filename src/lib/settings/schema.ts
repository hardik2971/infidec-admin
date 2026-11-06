import { z } from "zod";

/** Must match the upload limit enforced by firebase/storage.rules (STORAGE_RULES_MAX_MB in packages/service). */
export const MAX_UPLOAD_MB = 2048;

export const generalSettingsSchema = z.object({
  platformName: z.string().trim().min(2, "Enter a platform name.").max(80),
  supportEmail: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  baseCurrency: z.enum(["INR", "USD"]),
  maxUploadSizeMb: z.number({ error: "Enter a number." }).int().min(1).max(MAX_UPLOAD_MB, `Storage rules allow at most ${MAX_UPLOAD_MB} MB.`),
  signedUrlTtlMinutes: z.number({ error: "Enter a number." }).int().min(1, "At least 1 minute.").max(60, "At most 60 minutes."),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
