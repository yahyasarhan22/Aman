import { detectImage, stripJpegMetadata } from './image';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Marker segment: 0xFF, marker, 2-byte length (inclusive of itself), payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

function jpegWithExif(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    segment(0xe0, Buffer.from('JFIF\0')), // APP0
    segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPS 32.22,35.26')])), // APP1
    segment(0xfe, Buffer.from('camera comment')), // COM
    segment(0xdb, Buffer.alloc(64)), // quantisation table — must survive
    Buffer.from([0xff, 0xda, 0x00, 0x03, 0x01]), // SOS + scan data
    Buffer.from([0xaa, 0xbb, 0xcc]),
  ]);
}

describe('detectImage', () => {
  it('identifies JPEG and PNG by their magic bytes', () => {
    expect(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImage(PNG_HEADER)).toBe('png');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(detectImage(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImage(Buffer.from('<?php system($_GET[0]); ?>'))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('stripJpegMetadata', () => {
  it('removes EXIF and comment segments', () => {
    const cleaned = stripJpegMetadata(jpegWithExif());
    expect(cleaned.includes(Buffer.from('Exif'))).toBe(false);
    expect(cleaned.includes(Buffer.from('GPS 32.22,35.26'))).toBe(false);
    expect(cleaned.includes(Buffer.from('camera comment'))).toBe(false);
    expect(cleaned.includes(Buffer.from('JFIF'))).toBe(false);
  });

  it('keeps the SOI, the tables, and the scan data intact', () => {
    const cleaned = stripJpegMetadata(jpegWithExif());
    expect(cleaned.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(cleaned.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(cleaned.subarray(-3)).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
  });

  it('leaves a non-JPEG buffer alone', () => {
    expect(stripJpegMetadata(PNG_HEADER)).toEqual(PNG_HEADER);
  });
});
