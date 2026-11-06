import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { cert, getApp, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Credentials are resolved in this order:
 *  1. FIREBASE_SERVICE_ACCOUNT_PATH  — path to a service-account JSON (local dev).
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (CI / hosting secrets).
 *  3. Application Default Credentials (Firebase App Hosting / Cloud Run).
 */
function loadServiceAccount(): ServiceAccount | null {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(/*turbopackIgnore: true*/ process.cwd(), filePath);
    const json = JSON.parse(readFileSync(resolved, "utf8"));
    return {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
    };
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function createAdminApp(): App {
  if (getApps().length) return getApp();
  const serviceAccount = loadServiceAccount();
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const app = serviceAccount
    ? initializeApp({ credential: cert(serviceAccount), storageBucket })
    : initializeApp({ storageBucket });
  getFirestore(app).settings({ ignoreUndefinedProperties: true });
  return app;
}

const adminApp = createAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
