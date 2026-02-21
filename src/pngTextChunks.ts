// Lettura chunk PNG + decodifica tEXt / zTXt / iTXt (solo client-side).
// Supporta decompressione zTXt/iTXt via DecompressionStream (Chromium/Edge) con fallback.

type PngTextChunk = {
  type: "tEXt" | "zTXt" | "iTXt";
  keyword: string;
  text: string;
};

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function readU32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function findNullByte(buf: Uint8Array, start = 0): number {
  for (let i = start; i < buf.length; i++) if (buf[i] === 0) return i;
  return -1;
}

function decodeLatin1(bytes: Uint8Array): string {
  // keyword PNG è latin-1
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function decodeUTF8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  // zTXt/iTXt uses zlib-wrapped DEFLATE.
  // TS DOM types can be picky about ArrayBufferLike; create a real ArrayBuffer-backed copy.
  const safeBytes = new Uint8Array(data); // copies into an ArrayBuffer

  const tryStream = async (format: "deflate" | "deflate-raw") => {
    const ds = new DecompressionStream(format);
    const stream = new Blob([safeBytes.buffer]).stream().pipeThrough(ds);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  };

  try {
    return await tryStream("deflate");
  } catch {
    return await tryStream("deflate-raw");
  }
}

async function parse_tEXt(data: Uint8Array): Promise<PngTextChunk | null> {
  const n = findNullByte(data, 0);
  if (n < 0) return null;
  const keyword = decodeLatin1(data.slice(0, n));
  const text = decodeLatin1(data.slice(n + 1));
  return { type: "tEXt", keyword, text };
}

async function parse_zTXt(data: Uint8Array): Promise<PngTextChunk | null> {
  const n = findNullByte(data, 0);
  if (n < 0) return null;
  const keyword = decodeLatin1(data.slice(0, n));
  const compressionMethod = data[n + 1]; // 0 = deflate
  if (compressionMethod !== 0) return null;
  const compressed = data.slice(n + 2);

  try {
    const inflated = await inflateZlib(compressed);
    // spesso è UTF-8 JSON
    const text = decodeUTF8(inflated);
    return { type: "zTXt", keyword, text };
  } catch {
    return null;
  }
}

async function parse_iTXt(data: Uint8Array): Promise<PngTextChunk | null> {
  // iTXt layout:
  // keyword (latin1) 0
  // compressionFlag (1) compressionMethod (1)
  // languageTag 0
  // translatedKeyword (utf-8) 0
  // text (utf-8) [compressed if flag=1]
  const keywordEnd = findNullByte(data, 0);
  if (keywordEnd < 0) return null;

  const keyword = decodeLatin1(data.slice(0, keywordEnd));
  const compressionFlag = data[keywordEnd + 1];
  const compressionMethod = data[keywordEnd + 2];
  let offset = keywordEnd + 3;

  const langEnd = findNullByte(data, offset);
  if (langEnd < 0) return null;
  offset = langEnd + 1;

  const translatedEnd = findNullByte(data, offset);
  if (translatedEnd < 0) return null;
  offset = translatedEnd + 1;

  const payload = data.slice(offset);

  if (compressionFlag === 1) {
    if (compressionMethod !== 0) return null;
    try {
      const inflated = await inflateZlib(payload);
      const text = decodeUTF8(inflated);
      return { type: "iTXt", keyword, text };
    } catch {
      return null;
    }
  } else {
    const text = decodeUTF8(payload);
    return { type: "iTXt", keyword, text };
  }
}

export async function extractPngTextChunks(file: File): Promise<PngTextChunk[]> {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);

  if (bytes.length < 8 || !bytesEqual(bytes.slice(0, 8), PNG_SIGNATURE)) {
    throw new Error("File non sembra un PNG valido.");
  }

  const view = new DataView(ab);
  let offset = 8;
  const chunks: PngTextChunk[] = [];

  while (offset + 8 <= bytes.length) {
    const length = readU32BE(view, offset);
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = decodeLatin1(typeBytes) as "tEXt" | "zTXt" | "iTXt" | string;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;

    if (dataEnd > bytes.length || crcEnd > bytes.length) break;

    const data = bytes.slice(dataStart, dataEnd);

    if (type === "tEXt") {
      const parsed = await parse_tEXt(data);
      if (parsed) chunks.push(parsed);
    } else if (type === "zTXt") {
      const parsed = await parse_zTXt(data);
      if (parsed) chunks.push(parsed);
    } else if (type === "iTXt") {
      const parsed = await parse_iTXt(data);
      if (parsed) chunks.push(parsed);
    } else if (type === "IEND") {
      break;
    }

    offset = crcEnd;
  }

  return chunks;
}
