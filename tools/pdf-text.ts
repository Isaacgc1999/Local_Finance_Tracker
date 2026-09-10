import { inflateSync } from 'node:zlib';

/**
 * Extrae el texto de un PDF inflando sus streams FlateDecode. Suficiente para
 * comprobar en los tests que el documento contiene lo que debe, sin añadir
 * una dependencia de lectura de PDF.
 */
export function extractPdfText(pdf: Uint8Array): string {
  const buf = Buffer.from(pdf);
  let text = '';
  let cursor = 0;
  while (cursor < buf.length) {
    const start = buf.indexOf('stream', cursor);
    if (start < 0) break;
    let from = start + 'stream'.length;
    if (buf[from] === 0x0d) from++;
    if (buf[from] === 0x0a) from++;
    const end = buf.indexOf('endstream', from);
    if (end < 0) break;
    try {
      text += inflateSync(buf.subarray(from, end)).toString('latin1');
    } catch {
      // Stream no comprimido o de imagen: se ignora.
    }
    cursor = end + 'endstream'.length;
  }
  return text;
}
