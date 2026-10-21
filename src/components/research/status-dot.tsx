import { cn } from "@/lib/utils";

export function statusColor(status: string) {
  if (status.startsWith("3")) return "bg-green-600";
  if (status.startsWith("2")) return "bg-blue-600";
  return "bg-zinc-400";
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", statusColor(status), className)} />;
}
