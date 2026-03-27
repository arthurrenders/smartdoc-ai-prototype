import type { Metadata } from "next"
import { Inter, Manrope } from "next/font/google"
import { Header } from "@/components/Header"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" })

export const metadata: Metadata = {
  title: "SmartDoc AI",
  description: "Property document analysis platform",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${manrope.variable} ${inter.className}`}>
        <Header />
        <main className="saas-main">{children}</main>
      </body>
    </html>
  )
}




