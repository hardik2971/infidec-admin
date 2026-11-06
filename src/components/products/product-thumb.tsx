import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Private product image, served through the authenticated media route. */
export function ProductThumb({ mediaId, alt, className }: { mediaId: string | null; alt: string; className?: string }) {
  if (!mediaId) {
    return (
      <span className={cn("inline-flex aspect-[923/470] items-center justify-center rounded-md border bg-muted text-muted-foreground", className)}>
        <Package className="size-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private, session-authenticated images can't go through next/image
    <img
      src={`/api/media/${mediaId}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("aspect-[923/470] rounded-md border bg-muted object-cover", className)}
    />
  );
}
