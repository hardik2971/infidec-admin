/**
 * Seeds platform data and bootstraps the first Super Admin.
 *
 *   npm run seed                                              # roles, settings, marketplaces
 *   npm run seed -- --admin-email you@infidec.com --admin-name "Your Name"
 *   npm run seed -- --reset-roles                             # overwrite role permissions with defaults
 *
 * The Super Admin is created without a password; the script prints a one-time
 * password setup link instead, so no password ever passes through the shell.
 * Existing data is never overwritten unless --reset-roles is passed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { DEFAULT_ROLES, ROLE_IDS } from "../src/lib/rbac/roles";

function loadEnvFile(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // optional
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));

const { values: args } = parseArgs({
  options: {
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
    "reset-roles": { type: "boolean", default: false },
  },
});

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!saPath) {
  console.error("FIREBASE_SERVICE_ACCOUNT_PATH is not set (see .env.example).");
  process.exit(1);
}
const sa = JSON.parse(readFileSync(path.resolve(process.cwd(), saPath), "utf8"));
initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });

const db = getFirestore();
const auth = getAuth();

async function seedRoles() {
  const batch = db.batch();
  let written = 0;
  for (const id of ROLE_IDS) {
    const ref = db.collection("roles").doc(id);
    const exists = (await ref.get()).exists;
    if (exists && !args["reset-roles"]) continue;
    const role = DEFAULT_ROLES[id];
    batch.set(ref, {
      id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      locked: role.locked,
      system: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`✔ roles: ${written} written, ${ROLE_IDS.length - written} kept`);
}

async function seedIfMissing(collection: string, id: string, data: Record<string, unknown>) {
  const ref = db.collection(collection).doc(id);
  if ((await ref.get()).exists) {
    console.log(`• ${collection}/${id} exists — kept`);
    return;
  }
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log(`✔ ${collection}/${id} created`);
}

async function bootstrapSuperAdmin(email: string, displayName: string) {
  let uid: string;
  let created = false;
  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
  } catch (e) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
    // The operator holds the service account and vouches for this address.
    uid = (await auth.createUser({ email, displayName, emailVerified: true })).uid;
    created = true;
  }

  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, staff: true, role: "super_admin" });
  if (!user.emailVerified) await auth.updateUser(uid, { emailVerified: true });

  await db.collection("staff").doc(uid).set(
    {
      uid,
      email,
      displayName,
      roleId: "super_admin",
      status: "active",
      createdBy: "seed",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection("activityLogs").add({
    action: "system.seeded",
    domain: "system",
    actorId: null,
    targetType: "staff",
    targetId: uid,
    summary: `Bootstrapped Super Admin ${email}`,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`✔ Super Admin ${created ? "created" : "granted"}: ${email}`);
  const link = await auth.generatePasswordResetLink(email);
  console.log("\n  Set the password using this one-time link (expires in 1 hour):\n");
  console.log(`  ${link}\n`);
}

async function main() {
  console.log(`Seeding Firebase project "${sa.project_id}"…\n`);
  await seedRoles();
  await seedIfMissing("systemSettings", "general", {
    platformName: "INFIDEC Marketplace Admin",
    baseCurrency: "USD",
    timezone: "UTC",
    maxUploadSizeMb: 2048,
    allowedPackageMimeTypes: ["application/zip", "application/x-zip-compressed"],
    signedUrlTtlMinutes: 15,
  });
  await seedIfMissing("marketplaces", "envato", {
    name: "Envato Market (CodeCanyon)",
    type: "marketplace",
    website: "https://codecanyon.net",
    apiIntegration: "envato-market-api",
    status: "active",
  });
  await seedIfMissing("marketplaces", "infidec", {
    name: "INFIDEC Website",
    type: "direct",
    website: "https://infidec.com",
    status: "active",
  });

  const email = args["admin-email"]?.trim().toLowerCase();
  if (email) {
    await bootstrapSuperAdmin(email, args["admin-name"]?.trim() || email.split("@")[0]);
  } else {
    console.log("\n(no --admin-email given — skipping Super Admin bootstrap)");
  }
  console.log("\nDone.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("\n✖ Seed failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
