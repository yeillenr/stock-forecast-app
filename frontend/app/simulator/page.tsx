"use client";

import SimulationForm from "@/components/SimulationForm";

export default function SimulatorPage() {

  return (

<div className="max-w-6xl mx-auto px-8 py-8">

<div className="mb-8">

<h1 className="font-display text-3xl font-semibold">

Simulateur d'approvisionnement

</h1>

<p className="text-ink-soft mt-2">

Estimez la date du prochain réapprovisionnement.

</p>

</div>

<SimulationForm />

</div>

  );

}