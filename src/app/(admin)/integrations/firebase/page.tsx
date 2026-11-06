import { CheckCircle2, CircleAlert, CircleDashed, Database, Flame, HardDrive, KeyRound, ShieldCheck, Zap } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/session";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

export const metadata: Metadata = { title: "Firebase Settings" };

type Status = "ok" | "warn" | "error";
interface Check {
  name: string;
  icon: typeof Flame;
  status: Status;
  detail: string;
}

async function probe(fn: () => Promise<string>): Promise<{ status: Status; detail: string }> {
  try {
    return { status: "ok", detail: await fn() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: "error", detail: msg.split("\n")[0].slice(0, 180) };
  }
}

function credentialSource() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) return "Service account file (FIREBASE_SERVICE_ACCOUNT_PATH)";
  if (process.env.FIREBASE_PRIVATE_KEY) return "Inline service account (environment variables)";
  return "Application Default Credentials";
}

const STATUS_UI: Record<Status, { icon: typeof CheckCircle2; label: string; className: string }> = {
  ok: { icon: CheckCircle2, label: "Healthy", className: "text-success border-success/40" },
  warn: { icon: CircleDashed, label: "Action needed", className: "text-warning border-warning/40" },
  error: { icon: CircleAlert, label: "Error", className: "text-destructive border-destructive/40" },
};

async function FirebaseHealth() {
  await requirePermission("integrations:view");
  const bucketName = adminStorage.bucket().name;

  const [auth, firestore, storage, seeded] = await Promise.all([
    probe(async () => {
      await adminAuth.listUsers(1);
      return "Admin SDK can manage users and verify sessions.";
    }),
    probe(async () => {
      const snap = await adminDb.collection(COLLECTIONS.staff).count().get();
      return `Connected · ${snap.data().count} staff record(s).`;
    }),
    probe(async () => {
      const [exists] = await adminStorage.bucket().exists();
      if (!exists) throw new Error(`Bucket ${bucketName} was not found. Enable Storage in the Firebase console.`);
      return `Bucket ${bucketName} is reachable.`;
    }),
    adminDb.collection(COLLECTIONS.systemSettings).doc("general").get().then(
      (s) => s.exists,
      () => false,
    ),
  ]);

  const appCheck = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY);
  const checks: Check[] = [
    { name: "Authentication", icon: KeyRound, ...auth },
    { name: "Cloud Firestore", icon: Database, ...firestore },
    { name: "Firebase Storage", icon: HardDrive, ...storage },
    {
      name: "Platform seed data",
      icon: Zap,
      status: seeded ? "ok" : "warn",
      detail: seeded ? "Roles and system settings are seeded." : "Run `npm run seed` to create roles and default settings.",
    },
    {
      name: "App Check",
      icon: ShieldCheck,
      status: appCheck ? "ok" : "warn",
      detail: appCheck
        ? "reCAPTCHA Enterprise provider configured."
        : "Not configured. Set NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY before production.",
    },
  ];

  const config = [
    ["Project ID", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID],
    ["Auth domain", process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
    ["Storage bucket", bucketName],
    ["Web app ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID],
    ["Admin credentials", credentialSource()],
    ["Session lifetime", `${process.env.SESSION_COOKIE_DAYS ?? 5} days`],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">Service health</CardTitle>
          <CardDescription>Live checks run with the server&apos;s Admin SDK credentials.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {checks.map((c) => {
            const ui = STATUS_UI[c.status];
            return (
              <div key={c.name} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <c.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="mt-0.5 text-sm break-words text-muted-foreground">{c.detail}</p>
                </div>
                <Badge variant="outline" className={`gap-1 ${ui.className}`}>
                  <ui.icon className="size-3" /> {ui.label}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Configuration</CardTitle>
            <CardDescription>Public identifiers only — secrets are never displayed.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {config.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right font-mono text-xs leading-5">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px]">Deploying rules, indexes &amp; functions</CardTitle>
            <CardDescription>Security rules and indexes live in the repository and are deployed with the Firebase CLI.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
              {`firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions   # requires the Blaze plan`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function FirebaseSettingsPage() {
  return (
    <>
      <PageHeader title="Firebase Settings" description="Connection status and configuration for the Firebase services behind the admin." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <FirebaseHealth />
      </Suspense>
    </>
  );
}
