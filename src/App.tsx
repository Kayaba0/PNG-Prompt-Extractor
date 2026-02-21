import React, { useEffect, useMemo, useRef, useState } from "react";
import { extractPngTextChunks } from "./pngTextChunks";
import { extractPositivePromptFromTextBlobs } from "./extractPositivePrompt";

type Row = {
  id: string;
  file: File;
  previewUrl: string;
  prompt: string | null;
  error?: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function IconCopy({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const allPrompts = useMemo(() => {
    return rows
      .map((r) => r.prompt)
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  }, [rows]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1400);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(
      (f) => f.type === "image/png" || f.name.toLowerCase().endsWith(".png")
    );

    const newRows: Row[] = list.map((file) => ({
      id: uid(),
      file,
      previewUrl: URL.createObjectURL(file),
      prompt: null,
    }));

    setRows((prev) => [...newRows, ...prev]);

    for (const r of newRows) {
      try {
        const chunks = await extractPngTextChunks(r.file);
        const sorted = [...chunks].sort((a, b) => {
          const score = (k: string) => {
            const kk = k.toLowerCase();
            if (kk.includes("workflow")) return 3;
            if (kk.includes("prompt")) return 2;
            if (kk.includes("parameters")) return 1;
            return 0;
          };
          return score(b.keyword) - score(a.keyword);
        });

        const blobs = sorted.map((c) => c.text);
        const { prompt } = extractPositivePromptFromTextBlobs(blobs);

        setRows((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, prompt: prompt ?? null } : x))
        );
      } catch (e: any) {
        setRows((prev) =>
          prev.map((x) =>
            x.id === r.id ? { ...x, error: e?.message ?? "Error while reading the PNG." } : x
          )
        );
      }
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const hit = prev.find((r) => r.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  };

  const clearAll = () => {
    setRows((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.previewUrl));
      return [];
    });
  };

  const copyAll = async () => {
    if (allPrompts.length === 0) {
      showToast("No prompts to copy.");
      return;
    }
    const joined = allPrompts.join("\n\n---\n\n");
    await copyToClipboard(joined);
    showToast(`Copied ${allPrompts.length} prompts.`);
  };

  useEffect(() => {
    return () => {
      rows.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">PNG Prompt Extractor</h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyAll}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
            >
              Copy all
            </button>
            <button
              onClick={clearAll}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900"
            >
              Clear
            </button>
          </div>
        </header>

        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="mt-8 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-10 sm:p-14"
        >
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
            <div className="text-sm text-zinc-300">Drag & drop PNGs here</div>

            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-xl bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-white active:scale-[0.99]"
            >
              Upload PNGs
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          multiple
          className="hidden"
          onChange={async (e) => {
            if (e.target.files?.length) {
              await handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        <section className="mt-8">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-10 text-center text-sm text-zinc-500">
              No files uploaded.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <div className="flex gap-3">
                    <div className="h-32 w-44 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                      <img src={r.previewUrl} alt="" className="h-full w-full object-contain bg-black" />
                    </div>

                    <textarea
                      value={r.prompt ?? ""}
                      readOnly
                      placeholder={r.error ? r.error : "Prompt not found in metadata."}
                      className="h-32 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-[12px] leading-5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
                    />

                    <div className="h-32 shrink-0">
                      <div className="flex h-full flex-col items-center justify-center gap-2">
                        <button
                          onClick={async () => {
                            if (!r.prompt) return;
                            await copyToClipboard(r.prompt);
                            showToast("Prompt copied.");
                          }}
                          disabled={!r.prompt}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                          title="Copy"
                          aria-label="Copy"
                        >
                          <IconCopy className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => removeRow(r.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                          title="Remove"
                          aria-label="Remove"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
