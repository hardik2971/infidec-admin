import Image from "next/image";
import { cn } from "@/lib/utils";

/** Full INFIDEC wordmark; swaps to the white variant in dark mode. */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("relative inline-flex h-7 w-auto", className)}>
      <Image
        src="/infidec-logo.png"
        alt="INFIDEC"
        width={1920}
        height={569}
        priority={priority}
        className="h-full w-auto dark:hidden"
      />
      <Image
        src="/brand/infidec-logo-white.png"
        alt="INFIDEC"
        width={1600}
        height={474}
        priority={priority}
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}

/** Square brand mark for compact spaces. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/infidec-mark.png"
      alt="INFIDEC"
      width={512}
      height={512}
      className={cn("size-8", className)}
    />
  );
}
