import { CO_STATUS } from "@/lib/changeOrders";
import type { ChangeOrder } from "@/lib/types";

export default function StatusChip({ status }: { status: ChangeOrder["status"] }) {
  const s = CO_STATUS[status] ?? CO_STATUS.draft;
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium ring-1 ${s.cls}`} data-testid="co-status">
      {s.label}
    </span>
  );
}
