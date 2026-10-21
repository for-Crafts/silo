import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 space-y-2 border-r bg-zinc-50 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </aside>
      <main className="flex-1 space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-96" />
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </main>
    </div>
  );
}
