import type { Metadata } from "next";
import {Jost , IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SimulationToast from "@/components/SimulationToast";
import { SimulationProvider } from "@/lib/simulationContext";

const display = Jost ({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = Jost ({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Prévisions & Stock",
  description: "Prévision des ventes et optimisation des stocks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-body antialiased`}
      >
        <SimulationProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
          <SimulationToast />
        </SimulationProvider>
      </body>
    </html>
  );
}
