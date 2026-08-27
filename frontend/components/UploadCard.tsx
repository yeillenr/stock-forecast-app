"use client";

import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface UploadCardProps {
  title: string;
  description: string;
  expectedColumns: string;
  onUpload: (files: File[]) => Promise<string>;
}

type UploadState = "idle" | "loading" | "success" | "error";

export default function UploadCard({
  title,
  description,
  expectedColumns,
  onUpload,
}: UploadCardProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(files: File[]) {
    setFileName(files[0].name);
    setState("loading");
    setMessage(null);
    try {
      const result = await onUpload(files);
      setMessage(result);
      setState("success");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Une erreur est survenue.");
      setState("error");
    }
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <h3 className="font-display font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-soft mb-1">{description}</p>
      <p className="text-xs text-ink-faint font-mono mb-4">{expectedColumns}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);

          if (files.length > 0) {
            handleFile(files);
        }}}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-md py-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
          dragOver ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;

            if (files && files.length > 0) {
              handleFile(Array.from(files));
            }
          }}
        />

        {state === "loading" ? (
          <Loader2 className="w-6 h-6 text-brand animate-spin mb-2" />
        ) : (
          <UploadCloud className="w-6 h-6 text-ink-faint mb-2" />
        )}

        <p className="text-sm text-ink-soft">
          {fileName ? fileName : "Glissez un fichier ici ou cliquez pour parcourir"}
        </p>
        <p className="text-xs text-ink-faint mt-1">Formats acceptés : .csv, .xlsx</p>
      </div>

      {message && (
        <div
          className={`animate-fade-in mt-3 flex items-start gap-2 text-sm rounded-md px-3 py-2 ${
            state === "success"
              ? "bg-status-okSoft text-status-ok"
              : "bg-status-criticalSoft text-status-critical"
          }`}
        >
          {state === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
