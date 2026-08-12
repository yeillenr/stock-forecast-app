"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, UploadCloud, TrendingUp, Boxes, Warehouse, Calculator, Bot } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Tableau de bord",
    icon: LayoutGrid,
  },

  {
    href: "/upload",
    label: "Données",
    icon: UploadCloud,
  },


  {
    href: "/warehouses",
    label: "Entrepôts",
    icon: Warehouse,
  },

  {
    href: "/simulator",
    label: "Simulateur",
    icon: Calculator,
  },

  // {
  //   href: "/assistant",
  //   label: "Assistant IA",
  //   icon: Bot,
  // }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <div className="md:hidden border-b border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center">
              <Boxes className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-semibold text-base tracking-tight">
              Stockflow
            </span>
          </div>
        </div>

        <nav className="mt-3 flex flex-wrap gap-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-line bg-white text-ink-soft hover:border-brand/70 hover:text-ink"
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <aside className="w-64 shrink-0 border-r border-line bg-surface px-4 py-6 hidden md:flex md:flex-col">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center">
            <Boxes className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">
            Stockflow
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-brand-soft text-brand-dark font-medium"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-3 py-4 text-xs text-ink-faint leading-relaxed border-t border-line">
          Prévisions générées avec Prophet à partir de votre historique de
          ventes.
        </div>
      </aside>
    </>
  );
}
