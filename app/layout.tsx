import type { Metadata } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" })

export const metadata: Metadata = {
  title: {
    default: "SmartDoc AI",
    template: "%s — SmartDoc AI",
  },
  description: "Beheer vastgoeddocumenten, compliance en deadlines voor Belgisch vastgoed.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="nl">
      <body className={`${inter.variable} ${manrope.variable} ${inter.className} bg-[#f8fafb]`}>
        {children}
      </body>
    </html>
  )
}




