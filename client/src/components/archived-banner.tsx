import { Archive } from "lucide-react";

export function ArchivedBanner() {
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-[#fedf89] bg-warning-bg px-4 py-3 text-sm text-warning-fg">
      <Archive className="size-4 shrink-0" aria-hidden />
      This project is archived. It&apos;s read-only until an admin restores it.
    </div>
  );
}
