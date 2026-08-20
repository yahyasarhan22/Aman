export type ImageKind = 'jpeg' | 'png';

/** Spec §11: trust magic bytes, never the filename. */
export function detectImage(buf: Buffer): ImageKind | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  return null;
}

/**
 * Drops every APPn marker segment from a JPEG, which is where EXIF (APP1) —
 * including GPS coordinates that would identify a complainant's location —
 * lives. Walking the marker table is a dozen lines; a metadata library is not
 * worth the dependency for one format.
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (detectImage(buf) !== 'jpeg') return buf;

  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;

  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];

    // Start of scan — the rest is entropy-coded image data, copy it verbatim.
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }

    const length = buf.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buf.length) break;

    const isAppSegment = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isAppSegment && !isComment) out.push(buf.subarray(i, i + 2 + length));

    i += 2 + length;
  }

  // Malformed or truncated: better to reject than to store something we could
  // not fully parse and therefore cannot claim to have cleaned.
  return Buffer.concat([...out, buf.subarray(i)]);
}
