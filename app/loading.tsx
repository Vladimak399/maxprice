export default function Loading() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[1400px] px-4 py-8 md:px-8">
      <div className="h-8 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="mt-12 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-[560px] animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    </main>
  );
}
