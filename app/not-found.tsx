import Link from "next/link"
import { Home, ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafb]">
      <div className="w-full max-w-md px-8 py-16 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[#002741] text-white shadow-xl">
          <span className="font-headline text-3xl font-extrabold">404</span>
        </div>

        <h1 className="mb-3 font-headline text-2xl font-bold tracking-tight text-[#002741]">
          Pagina niet gevonden
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-gray-500">
          De pagina die u zoekt bestaat niet of is verplaatst. Ga terug naar het dashboard om verder te werken.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#002741] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Home className="h-4 w-4" />
            Naar dashboard
          </Link>
          <Link
            href="javascript:history.back()"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Link>
        </div>
      </div>
    </div>
  )
}
