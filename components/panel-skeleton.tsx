export function FrameSkeleton() {
  return (
    <div className="fixed inset-0 flex bg-background">
      <div className="hidden w-80 shrink-0 flex-col gap-3 border-r border-line bg-paper p-4 md:flex">
        <div className="h-10 w-40 animate-pulse rounded-full bg-line" />
        <div className="mt-4 h-14 animate-pulse rounded-2xl bg-line" />
        <div className="h-14 animate-pulse rounded-2xl bg-line" />
        <div className="h-14 w-4/5 animate-pulse rounded-2xl bg-line" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-3 px-4 pb-8">
        <div className="mx-auto h-16 w-full max-w-4xl animate-pulse rounded-2xl bg-line" />
        <div className="mx-auto h-10 w-full max-w-4xl animate-pulse self-end rounded-2xl bg-line md:w-1/2" />
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end px-4 pt-16 pb-6" aria-hidden>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-line" />
        <div className="h-10 w-1/2 animate-pulse self-end rounded-2xl bg-line" />
        <div className="h-16 w-3/4 animate-pulse rounded-2xl bg-line" />
      </div>
    </div>
  );
}
