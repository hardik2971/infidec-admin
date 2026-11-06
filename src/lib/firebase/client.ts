"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, inMemoryPersistence, setPersistence, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase web config is missing. Copy .env.example to .env.local and fill it in.");
  }
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // App Check is enabled when a reCAPTCHA Enterprise site key is configured.
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (siteKey && typeof window !== "undefined") {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return app;
}

/**
 * The browser SDK is only used to exchange credentials for an ID token.
 * The real session is an httpOnly cookie minted by the server, so auth state
 * is kept in memory and never persisted to localStorage/IndexedDB.
 */
export async function getClientAuth(): Promise<Auth> {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}
