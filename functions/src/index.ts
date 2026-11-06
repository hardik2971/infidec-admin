/**
 * INFIDEC Marketplace Admin — Cloud Functions.
 *
 * Phase 1:
 *  - syncStaffClaims: keeps Firebase Auth custom claims ({ staff, role }) in sync
 *    with staff/{uid} documents, so Security Rules can trust request.auth.token.
 *
 * Phase 3:
 *  - cleanupStagingUploads: daily removal of abandoned package uploads (24h+) from
 *    uploads/staging/ and their pending upload sessions.
 *
 * Later phases add: purchase verification, license validation, download
 * authorization + signed URLs, file metadata processing, notifications,
 * marketplace sync, scheduled tasks and storage cleanup.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";

initializeApp();
// Same region as the Firestore database (asia-south1), so triggers avoid cross-region hops.
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

const ROLE_IDS = new Set([
  "super_admin",
  "product_manager",
  "documentation_manager",
  "order_manager",
  "license_manager",
  "support_manager",
  "finance_manager",
  "read_only",
]);

export const syncStaffClaims = onDocumentWritten("staff/{uid}", async (event) => {
  const uid = event.params.uid;
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  const active = after?.status === "active" && ROLE_IDS.has(after?.roleId);
  const desired = active ? { staff: true, role: after!.roleId as string } : null;

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUser(uid);
  } catch {
    logger.warn("staff document has no matching auth user", { uid });
    return;
  }

  const current = user.customClaims ?? {};
  const unchanged = desired
    ? current.staff === true && current.role === desired.role
    : current.staff === undefined && current.role === undefined;
  if (unchanged) return;

  const otherClaims: Record<string, unknown> = { ...current };
  delete otherClaims.staff;
  delete otherClaims.role;
  await auth.setCustomUserClaims(uid, desired ? { ...otherClaims, ...desired } : otherClaims);

  // Access was reduced or removed: force existing sessions to re-authenticate.
  const lostAccess = before?.status === "active" && (!active || before?.roleId !== after?.roleId);
  if (lostAccess) await auth.revokeRefreshTokens(uid);

  await getFirestore().collection("activityLogs").add({
    action: "staff.claims_synced",
    domain: "staff",
    actorId: null,
    targetType: "staff",
    targetId: uid,
    summary: desired ? `Claims set to role ${desired.role}` : "Staff claims removed",
    metadata: { revokedSessions: lostAccess },
    createdAt: FieldValue.serverTimestamp(),
  });
  logger.info("staff claims synced", { uid, role: desired?.role ?? null });
});

/** Removes package uploads that were started but never validated (older than 24 hours). */
export const cleanupStagingUploads = onSchedule({ schedule: "every day 03:00", timeZone: "Asia/Kolkata" }, async () => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const [files] = await getStorage().bucket().getFiles({ prefix: "uploads/staging/" });
  const stale = files.filter((f) => new Date(String(f.metadata.timeCreated)).getTime() < cutoff);
  await Promise.all(stale.map((f) => f.delete({ ignoreNotFound: true })));

  const db = getFirestore();
  const sessions = await db.collection("uploadSessions").where("status", "==", "pending").get();
  const expired = sessions.docs.filter((d) => (d.get("createdAt")?.toMillis?.() ?? 0) < cutoff);
  await Promise.all(expired.map((d) => d.ref.update({ status: "expired", finishedAt: FieldValue.serverTimestamp() })));

  if (stale.length || expired.length) {
    await db.collection("activityLogs").add({
      action: "storage.cleanup",
      domain: "storage",
      actorId: null,
      targetType: "storage",
      summary: `Scheduled cleanup removed ${stale.length} abandoned upload file(s) and expired ${expired.length} session(s)`,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  logger.info("staging cleanup", { files: stale.length, sessions: expired.length });
});
