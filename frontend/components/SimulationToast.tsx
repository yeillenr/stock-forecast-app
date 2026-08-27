"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import { useSimulation } from "@/lib/simulationContext";

export default function SimulationToast() {
  const { notification, dismissNotification } = useSimulation();
  const router = useRouter();

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(dismissNotification, 6000);
    return () => clearTimeout(timer);
  }, [notification, dismissNotification]);

  if (!notification) return null;

  function goToSimulator() {
    router.push("/simulator");
    dismissNotification();
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <div
        role="button"
        tabIndex={0}
        onClick={goToSimulator}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") goToSimulator();
        }}
        className="flex items-center gap-3 rounded-xl bg-ink text-white pl-4 pr-3 py-3 shadow-lg cursor-pointer transition-colors hover:bg-ink/90"
      >
        <CheckCircle2 className="w-5 h-5 text-status-ok shrink-0" strokeWidth={2.5} />
        <span className="text-sm font-medium">{notification}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismissNotification();
          }}
          className="ml-1 rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Fermer la notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
