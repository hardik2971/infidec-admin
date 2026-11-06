import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getStaffSession } from "@/lib/auth/session";

const HIGHLIGHTS = [
  { title: "Every product, one console", body: "Catalogue, versions, packages and documentation for all current and future INFIDEC products." },
  { title: "Private by default", body: "Source packages live in private Firebase Storage and are released only through short-lived, audited links." },
  { title: "Verified, never invented", body: "Sales and licenses come from official marketplace data — clearly separated from direct revenue." },
];

/** Sends visitors who already hold a valid staff session straight to the dashboard. */
async function RedirectIfSignedIn() {
  if (await getStaffSession()) redirect("/dashboard");
  return null;
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>

      <aside className="relative hidden overflow-hidden bg-[oklch(0.17_0.045_274)] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.6 0.22 264) 0%, transparent 65%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-48 size-[38rem] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.56 0.25 300) 0%, transparent 65%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <span className="relative text-sm font-medium tracking-[0.2em] text-white/70 uppercase">Marketplace Admin</span>

        <div className="relative max-w-md space-y-10">
          <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight">
            The control centre for{" "}
            <span className="bg-gradient-to-r from-[oklch(0.82_0.14_222)] via-[oklch(0.72_0.18_262)] to-[oklch(0.72_0.2_302)] bg-clip-text text-transparent">
              every INFIDEC product.
            </span>
          </h1>
          <ul className="space-y-6">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[oklch(0.8_0.14_222)] shadow-[0_0_12px_oklch(0.8_0.14_222)]" />
                <div>
                  <p className="font-medium">{h.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{h.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">© INFIDEC · Authorised staff only</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-in-up">
          <Logo className="mb-10 h-9" priority />
          {children}
        </div>
      </main>
    </div>
  );
}
