"use client";

import { useState } from "react";
import { assistantRequest, ApiRequestError } from "@/lib/api";
import { Send, MessageSquare, Bot } from "lucide-react";

export default function AssistantPage() {
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim()) {
      return;
    }

    const userText = message.trim();
    setConversation((current) => [...current, { role: "user", text: userText }]);
    setMessage("");
    setLoading(true);
    setError(null);

    try {
      const response = await assistantRequest(userText);
      setConversation((current) => [...current, { role: "assistant", text: response.reply }]);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Erreur du service assistant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 md:px-10">
      <header className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Assistant IA</h1>
            <p className="text-sm text-ink-soft mt-1">
              Posez une question sur vos prévisions, stocks ou import de données.
            </p>
          </div>
        
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <div className="bg-surface border border-line rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-brand-soft p-3 text-brand-dark">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Conversation</p>
                <p className="text-xs text-ink-faint">L'assistant répond à vos questions métier.</p>
              </div>
            </div>

            <div className="space-y-4">
              {conversation.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-line bg-white/80 p-6 text-sm text-ink-faint">
                  Démarrez une conversation en posant une question.
                </div>
              ) : (
                conversation.map((item, index) => (
                  <div
                    key={index}
                    className={`rounded-3xl p-4 ${
                      item.role === "user"
                        ? "bg-surface border border-line"
                        : "bg-brand-soft border border-brand/40"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-2">
                      {item.role === "user" ? "Vous" : "Assistant"}
                    </p>
                    <p className="text-sm text-ink">{item.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-3xl p-6">
            <label className="block text-sm font-medium text-ink mb-2">Votre question</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              placeholder="Que dois-je commander pour le dépôt X ?"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {error ? <p className="text-sm text-status-critical">{error}</p> : null}
              <button
                onClick={handleSend}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Envoi..." : "Envoyer"}
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        
      </div>
    </div>
  );
}
