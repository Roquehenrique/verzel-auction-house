export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function PageLoading() {
  return (
    <div className="flex justify-center py-20 text-muted">
      <Spinner className="size-8" />
    </div>
  );
}
