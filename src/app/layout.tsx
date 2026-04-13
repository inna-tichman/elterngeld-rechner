import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "Elterngeld Rechner 2025 – Kostenlos & Sofort",
  description:
    "Berechne dein Elterngeld kostenlos und in Sekunden. Basiselterngeld, ElterngeldPlus, Partnerschaftsbonus und Geschwisterbonus – alle Modelle auf einen Blick.",
  keywords: [
    "elterngeld rechner",
    "elterngeld berechnen",
    "elterngeldplus",
    "partnerschaftsbonus",
    "elternzeit rechner",
    "elterngeld 2025",
  ],
  openGraph: {
    title: "Elterngeld Rechner 2025",
    description: "Kostenlose Elterngeld-Berechnung in Sekunden",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className={`${dmSans.variable} ${dmSerif.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
