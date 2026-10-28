export default function Loading() {
  return (
    <div className="space-y-4" aria-busy aria-label="Cargando">
      <div className="h-32 animate-pulse rounded-3xl bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-44 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-44 animate-pulse rounded-3xl bg-surface-2" />
      </div>
    </div>
  );
}
