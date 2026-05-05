"use client"

import { useRef, type MouseEvent } from "react"
import { cn } from "@/lib/utils"

type SpotlightCardProps = {
  children: React.ReactNode
  className?: string
}

export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    ref.current!.style.setProperty("--spotlight-x", `${x}%`)
    ref.current!.style.setProperty("--spotlight-y", `${y}%`)
    overlayRef.current!.style.opacity = "1"
  }

  function onMouseLeave() {
    overlayRef.current!.style.opacity = "0"
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={cn("relative overflow-hidden", className)}
      style={
        {
          "--spotlight-x": "50%",
          "--spotlight-y": "50%",
        } as React.CSSProperties
      }
    >
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at var(--spotlight-x) var(--spotlight-y), rgba(81,159,200,0.18) 0%, transparent 65%)",
        }}
        aria-hidden
      />
      {children}
    </div>
  )
}
