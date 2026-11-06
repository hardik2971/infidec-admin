import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown rendering: raw HTML is never rendered and unsafe URLs
 * (javascript:, data:) are stripped by react-markdown's URL transform.
 */
const components: Components = {
  h1: (p) => <h1 className="mt-8 mb-3 text-2xl font-semibold tracking-tight first:mt-0" {...p} />,
  h2: (p) => <h2 className="mt-8 mb-3 border-b pb-1.5 text-xl font-semibold tracking-tight first:mt-0" {...p} />,
  h3: (p) => <h3 className="mt-6 mb-2 text-lg font-semibold" {...p} />,
  h4: (p) => <h4 className="mt-5 mb-2 font-semibold" {...p} />,
  p: (p) => <p className="my-3 leading-7" {...p} />,
  a: ({ href, ...p }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline underline-offset-2" {...p} />,
  ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6" {...p} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6" {...p} />,
  li: (p) => <li className="leading-7" {...p} />,
  blockquote: (p) => <blockquote className="my-4 border-l-4 border-primary/40 bg-accent/40 py-2 pr-3 pl-4 text-muted-foreground" {...p} />,
  hr: () => <hr className="my-8" />,
  table: (p) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium" {...p} />,
  td: (p) => <td className="border-b px-3 py-2 align-top" {...p} />,
  img: ({ alt, src }) =>
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary documentation images
    typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" className="my-4 max-w-full rounded-lg border" /> : null,
  pre: (p) => <pre className="my-4 overflow-x-auto rounded-lg border bg-[oklch(0.2_0.03_272)] p-4 text-[13px] leading-6 text-[oklch(0.92_0.01_265)] print:border print:bg-white print:text-black" {...p} />,
  code: ({ className, children, ...p }) => {
    const block = /language-/.test(className ?? "") || String(children).includes("\n");
    return block ? (
      <code className={cn("font-mono", className)} {...p}>
        {children}
      </code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" {...p}>
        {children}
      </code>
    );
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-[15px] text-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
