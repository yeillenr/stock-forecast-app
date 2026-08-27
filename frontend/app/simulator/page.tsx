"use client";

import { Sparkles } from "lucide-react";
import SimulationForm from "@/components/SimulationForm";

export default function SimulatorPage() {

  return (

<div className="max-w-6xl mx-auto px-8 py-8">

<div className="mb-8">

<div className="flex items-center gap-2 flex-wrap">
  <h1 className="font-display text-3xl font-semibold">
    Simulateur d'approvisionnement
  </h1>
  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-dark">
    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.2} />
    Prévision Prophet
  </span>
</div>

<p className="text-ink-soft mt-2">

Estimez la date du prochain réapprovisionnement.

</p>

</div>

<SimulationForm />

</div>

  );

}