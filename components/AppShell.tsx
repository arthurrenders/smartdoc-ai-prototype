"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Map as MapIcon,
  BarChart3,
  FileText,
  Inbox,
  Settings,
  Plus,
} from "lucide-react"
import type { DashboardNotificationRow } from "@/app/actions/get-dashboard-notifications"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"
import logoIcon from "@/components/public/logo-icon.png"

type AppShellProps = {
  children: React.ReactNode
  notifications?: DashboardNotificationRow[]
  notificationsError?: string | null
  topSlot?: React.ReactNode
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Kaart", icon: MapIcon },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports", label: "Rapporten", icon: FileText },
  { href: "/intake", label: "Intake", icon: Inbox },
]

export function AppShell({
  children,
  notifications = [],
  notificationsError = null,
  topSlot,
}: AppShellProps) {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname.startsWith("/properties")
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <div className="flex min-h-screen bg-[#f8fafb]">
      {/* Sidebar */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-[#002741] md:flex">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 px-5 py-5">
          <Image
            src={logoIcon}
            alt="SmartDoc AI"
            width={36}
            height={36}
            className="h-9 w-9 object-contain brightness-0 invert"
            priority
          />
          <span className="font-headline text-base font-bold tracking-tight text-white">
            SmartDoc AI
          </span>
        </div>

        {/* New Property CTA */}
        <div className="px-4 pb-5">
          <Link
            href="/properties/new"
            className="inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-inner backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/20 hover:shadow-[0_0_12px_rgba(81,159,200,0.4)]"
          >
            <Plus className="h-4 w-4" />
            Nieuw Pand
          </Link>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Hoofdnavigatie">
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg border-l-2 px-[10px] py-2.5 text-sm transition-colors ${
                  active
                    ? "border-[#519fc8] bg-white/10 font-semibold text-white"
                    : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Settings at bottom */}
        <div className="border-t border-white/10 px-3 py-4">
          <Link
            href="/settings"
            className={`flex items-center gap-3 rounded-lg border-l-2 px-[10px] py-2.5 text-sm transition-colors ${
              pathname === "/settings"
                ? "border-[#519fc8] bg-white/10 font-semibold text-white"
                : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Instellingen
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topnav */}
        <header className="sticky top-0 z-40 flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-6">
          <div className="flex min-w-0 flex-1 items-center gap-4">{topSlot}</div>
          <div className="flex shrink-0 items-center gap-3">
            <ExportDataButton className="hidden md:block" />
            <NotificationsBellDropdown
              notifications={notifications}
              error={notificationsError}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
