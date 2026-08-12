"use client";

import { uploadSales } from "@/lib/api";
import UploadCard from "@/components/UploadCard";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 md:px-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Importer des données</h1>
        <p className="text-sm text-ink-soft mt-1">
          Importez votre historique des ventes. Le stock actuel sera renseigné manuellement dans les paramètres d'entrepôt.
        </p>
      </header>

      <div className="grid md:grid-cols-1 gap-5">
        <UploadCard
          title="Historique de ventes"
          description="Fichier Excel ou CSV contenant les ventes par date et entrepôt."
          expectedColumns=""
          onUpload={async (files) => {
            const res = await uploadSales(files);
            return res.message;
          }}
        />
      </div>

      <div className="mt-8 rounded-3xl border border-line bg-surface p-6">
        <h2 className="font-semibold text-lg mb-4">Vérification des données</h2>
        <p className="text-sm text-ink-soft leading-7">
          Les fichiers importés sont analysés et validés automatiquement. Après import, le dashboard et
          les prévisions sont recalculés à partir de vos données.
        </p>
      </div>

      <div className="mt-8 bg-surface border border-line rounded-lg p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Données importées ?</p>
          <p className="text-sm text-ink-soft">
            Passez ensuite aux prévisions ou configurez vos entrepôts.
          </p>
        </div>
        <Link
          href="/simulator"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap"
        >
          Aller aux prévisions
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
