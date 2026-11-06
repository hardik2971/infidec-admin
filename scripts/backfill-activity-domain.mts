/**
 * One-time migration: adds `domain` (the part of `action` before the dot) to audit
 * entries written before activity filters switched to domains.
 *
 *   npx tsx scripts/backfill-activity-domain.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const sa = JSON.parse(readFileSync(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH!), "utf8"));
initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();

const snap = await db.collection("activityLogs").get();
const missing = snap.docs.filter((d) => !d.get("domain") && typeof d.get("action") === "string");
for (let i = 0; i < missing.length; i += 400) {
  const batch = db.batch();
  missing.slice(i, i + 400).forEach((d) => batch.update(d.ref, { domain: String(d.get("action")).split(".")[0] }));
  await batch.commit();
}
console.log(`✔ ${missing.length} of ${snap.size} audit entries updated`);
process.exit(0);
