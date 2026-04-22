"use client"

import { useState } from "react"
import Image from "next/image"

type Props = {
  src: string
  alt: string
  /** Tailwind classes applied to the <img> element (e.g. "object-cover") */
  imgClassName?: string
  /** Rendered instead of the image when src is empty or loading fails */
  fallback: React.ReactNode
}

/**
 * Renders a Street View image with a graceful fallback.
 * Must be used inside a container with `position: relative` and explicit dimensions
 * because Next.js Image with `fill` requires that.
 */
export function StreetViewImage({ src, alt, imgClassName = "object-cover", fallback }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) return <>{fallback}</>

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={imgClassName}
      onError={() => setFailed(true)}
      unoptimized
    />
  )
}
