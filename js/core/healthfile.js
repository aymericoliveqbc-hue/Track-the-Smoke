// Lecture de l'export Apple Santé dans le navigateur, en flux :
// export.zip (décompressé à la volée via DecompressionStream) ou export.xml.
// Le fichier ne quitte jamais l'appareil.

import { HealthXmlScanner } from '../domain/health.js';

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function view(file, start, end) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** Localise export.xml dans l'archive (zip et zip64). */
async function findExportEntry(file) {
  const tailLen = Math.min(file.size, 65557 + 20);
  const tail = await view(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Archive ZIP illisible.');
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(tail, loc) === 0x07064b50) {
      const z64 = u64(tail, loc + 8);
      const rec = await view(file, z64, z64 + 56);
      cdSize = u64(rec, 40);
      cdOffset = u64(rec, 48);
    }
  }
  const cd = await view(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.byteLength && u32(cd, p) === 0x02014b50;) {
    const method = u16(cd, p + 10);
    let comp = u32(cd, p + 20);
    let uncomp = u32(cd, p + 24);
    const nLen = u16(cd, p + 28); const xLen = u16(cd, p + 30); const cLen = u16(cd, p + 32);
    let local = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nLen));
    // Champ zip64 : uncomp, comp, offset (seulement ceux valant 0xFFFFFFFF).
    let x = p + 46 + nLen; const xEnd = x + xLen;
    while (x + 4 <= xEnd) {
      const id = u16(cd, x); const size = u16(cd, x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (uncomp === 0xffffffff) { uncomp = u64(cd, q); q += 8; }
        if (comp === 0xffffffff) { comp = u64(cd, q); q += 8; }
        if (local === 0xffffffff) { local = u64(cd, q); q += 8; }
      }
      x += 4 + size;
    }
    if (/(^|\/)export\.xml$/.test(name)) return { method, comp, uncomp, local };
    p += 46 + nLen + xLen + cLen;
  }
  throw new Error('export.xml introuvable dans l’archive.');
}

/**
 * Lit les échantillons de sommeil d'un export Santé.
 * @param {File} file
 * @param {(progress:number)=>void} onProgress fraction 0..1
 */
export async function readHealthExport(file, onProgress = () => {}) {
  let stream;
  let total;
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const e = await findExportEntry(file);
    const head = await view(file, e.local, e.local + 30);
    const start = e.local + 30 + u16(head, 26) + u16(head, 28);
    let raw = file.slice(start, start + e.comp).stream();
    total = e.comp;
    if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Décompression non prise en charge : mets iOS à jour ou importe export.xml.');
      raw = raw.pipeThrough(countingStream((n) => onProgress(Math.min(1, n / total)))).pipeThrough(new DecompressionStream('deflate-raw'));
    } else if (e.method === 0) {
      raw = raw.pipeThrough(countingStream((n) => onProgress(Math.min(1, n / total))));
    } else throw new Error('Méthode de compression non prise en charge.');
    stream = raw;
  } else {
    total = file.size;
    stream = file.stream().pipeThrough(countingStream((n) => onProgress(Math.min(1, n / total))));
  }
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  const scanner = new HealthXmlScanner();
  const samples = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const s of scanner.feed(value)) samples.push(s);
  }
  onProgress(1);
  return samples;
}

function countingStream(cb) {
  let n = 0; let last = 0;
  return new TransformStream({
    transform(chunk, ctrl) {
      n += chunk.byteLength; ctrl.enqueue(chunk);
      if (n - last > 2_000_000) { last = n; cb(n); }
    },
  });
}
