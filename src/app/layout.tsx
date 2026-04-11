import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SOULEO - Sistema de Laudos",
  description: "Sistema de laudos para ecocardiografia e cardiologia",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🫀</text></svg>" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${ibmPlex.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-ibm-plex)]">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
