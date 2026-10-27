export default function Loading() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
