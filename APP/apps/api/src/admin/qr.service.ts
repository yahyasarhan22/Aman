import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import QRCode from 'qrcode';
import { Establishment } from '../establishments/establishment.entity';

export interface QrBatchEntry {
  slug: string;
  nameAr: string;
  category: string;
  publicUrl: string;
  qrDataUrl: string;
}

@Injectable()
export class QrService {
  constructor(@InjectRepository(Establishment) private establishments: Repository<Establishment>) {}

  /**
   * Spec §5.10: name, QR code, municipality logo, and the short URL
   * underneath for anyone who cannot scan. The logo and print layout are the
   * frontend's job (a print stylesheet); this returns the two things that
   * cost a network round trip each — the encoded image and the URL text.
   */
  async batch(baseUrl: string): Promise<QrBatchEntry[]> {
    const rows = await this.establishments.find({ where: { status: 'ACTIVE' } });

    return Promise.all(
      rows.map(async (e) => {
        const publicUrl = `${baseUrl}/e/${e.slug}`;
        const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 300, margin: 1 });
        return { slug: e.slug, nameAr: e.nameAr, category: e.category, publicUrl, qrDataUrl };
      }),
    );
  }
}
