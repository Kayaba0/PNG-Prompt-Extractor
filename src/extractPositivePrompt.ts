type AnyObj = Record<string, any>;

function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizePrompt(s: string): string {
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function isPromptWrapperJson(s: string): boolean {
  const t = s.trim();
  if (!(t.startsWith("{") && t.endsWith("}"))) return false;
  const obj = safeJsonParse<AnyObj>(t);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return false;
  if (keys[0] !== "prompt") return false;
  return typeof obj.prompt === "string";
}

function pickBestString(candidates: string[]): string | null {
  const cleaned = candidates
    .map((c) => c?.trim())
    .filter(Boolean)
    .filter((c) => !isPromptWrapperJson(c)) as string[];

  if (cleaned.length === 0) return null;

  cleaned.sort((a, b) => b.length - a.length);
  return cleaned[0] ?? null;
}

function extractFromRawWorkflow(rawWorkflowString: string): string | null {
  const wf = safeJsonParse<AnyObj>(rawWorkflowString);
  if (!wf || typeof wf !== "object") return null;

  const candidates: string[] = [];

  for (const nodeId of Object.keys(wf)) {
    const node = wf[nodeId];
    if (!node || typeof node !== "object") continue;

    const classType = String(node.class_type ?? "");
    const title = String(node._meta?.title ?? "");
    const inputs = node.inputs ?? {};

    // Caso ComfyUI “easy positive”: inputs.positive è la stringa
    if (typeof inputs.positive === "string" && inputs.positive.trim().length > 0) {
      candidates.push(inputs.positive);
    }

    // Altri casi: un nodo “Positive” può avere inputs.text o simili
    const looksPositive =
      /positive/i.test(classType) || /positive/i.test(title) || title === "Positive";

    if (looksPositive) {
      if (typeof inputs.text === "string" && inputs.text.trim().length > 0) {
        candidates.push(inputs.text);
      }
      if (typeof inputs.prompt === "string" && inputs.prompt.trim().length > 0) {
        candidates.push(inputs.prompt);
      }
    }
  }

  const best = pickBestString(candidates);
  return best ? normalizePrompt(best) : null;
}

function extractFromMetadataObject(meta: AnyObj): string | null {
  // 1) Se c’è raw_workflow come nel tuo esempio
  if (typeof meta.raw_workflow === "string") {
    const p = extractFromRawWorkflow(meta.raw_workflow);
    if (p) return p;
  }

  // 2) Se c’è direttamente prompt positivo (alcuni exporter lo mettono in meta.prompt)
  if (typeof meta.prompt === "string" && meta.prompt.trim().length > 0) {
    // Attenzione: a volte meta.prompt è "29,0" (riferimento), quindi se è troppo corto lo ignoriamo
    if (meta.prompt.trim().length > 50 && !isPromptWrapperJson(meta.prompt)) return normalizePrompt(meta.prompt);
  }

  // 3) Altri campi possibili
  for (const key of ["positive", "positive_prompt", "Prompt", "Positive prompt"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim().length > 0 && !isPromptWrapperJson(v)) return normalizePrompt(v);
  }

  return null;
}

export function extractPositivePromptFromTextBlobs(textBlobs: string[]): {
  prompt: string | null;
  debugSource?: string;
} {
  // A) prova a trovare un JSON “metadata” che contenga raw_workflow
  for (const blob of textBlobs) {
    const maybe = safeJsonParse<AnyObj>(blob);
    if (maybe && typeof maybe === "object") {
      const p = extractFromMetadataObject(maybe);
      if (p) return { prompt: p, debugSource: "metadata-json" };
    }
  }

  // B) blob = raw_workflow (oggetto con chiavi numeriche di nodi)
  for (const blob of textBlobs) {
    const maybe = safeJsonParse<AnyObj>(blob);
    if (maybe && typeof maybe === "object") {
      const hasNumericKeys = Object.keys(maybe).some((k) => /^\d+$/.test(k));
      if (hasNumericKeys) {
        const p = extractFromRawWorkflow(blob);
        if (p) return { prompt: p, debugSource: "raw_workflow-json" };
      }
    }
  }

  // C) fallback euristico: scegliamo un testo lungo, ma NON se è un wrapper JSON {"prompt": "..."}
  const longOnes = textBlobs
    .map((s) => s.trim())
    .filter((s) => s.length > 200)
    .filter((s) => !isPromptWrapperJson(s));

  const best = pickBestString(longOnes);
  if (best) return { prompt: normalizePrompt(best), debugSource: "fallback-long-text" };

  return { prompt: null };
}
