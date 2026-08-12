"use client";

import WarehouseForm from "@/components/WarehouseForm";

export default function WarehousesPage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-8">

      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold">
          Paramètres de l'entrepôt
        </h1>

        <p className="text-ink-soft mt-2">
          Configurez les informations utilisées pour les simulations d'approvisionnement.
        </p>
      </div>

      <WarehouseForm />

    </div>
  );
}