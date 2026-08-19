import QRCode from 'qrcode';
import { writeFileSync } from 'fs';

const slug = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://localhost:4200';

if (!slug) {
  console.error('Usage: ts-node scripts/generate-qr.ts <slug> [baseUrl]');
  process.exit(1);
}

QRCode.toFile(`${slug}.png`, `${baseUrl}/e/${slug}`, { width: 400 }, (err) => {
  if (err) throw err;
  console.log(`Wrote ${slug}.png -> ${baseUrl}/e/${slug}`);
});
