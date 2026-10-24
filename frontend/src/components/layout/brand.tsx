import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-md bg-lime-500 font-heading text-lg font-bold text-navy-950">
        CL
      </span>
      <span className="font-heading text-lg font-bold">
        Casa de <span className="text-lime-500">Leilões</span>
      </span>
    </Link>
  );
}

// Static placeholder rendered while the interactive header (which reads the
// current URL) streams in. Same height, so the page does not jump.
export function HeaderShell() {
  return (
    <header className="bg-navy-900 text-white">
      <div className="h-1 w-full bg-teal-500" />
      <div className="mx-auto flex h-[60px] max-w-6xl items-center px-4">
        <Brand />
      </div>
    </header>
  );
}
