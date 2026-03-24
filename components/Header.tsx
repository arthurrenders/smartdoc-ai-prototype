import Link from "next/link"
import Image from "next/image"

import logoImage from "@/components/public/logo png.png"

/**
 * App header with brand logo and nav.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-white/90 py-2.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80 dark:bg-card/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link
            href="/"
            className="flex items-center focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
            aria-label="SmartDoc AI – Home"
          >
            <Image
              src={logoImage}
              alt="SmartDoc AI"
              width={288}
              height={288}
              className="object-contain"
              priority
            />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground" aria-label="Main">
            {/* Add links as needed, e.g. <Link href="/dashboard">Dashboard</Link> */}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {/* Right-side actions placeholder */}
        </div>
      </div>
    </header>
  )
}
