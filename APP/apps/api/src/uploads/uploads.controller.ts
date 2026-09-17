import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { detectImage, stripJpegMetadata } from './image';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * One implementation, two doors. Both strip EXIF and validate magic bytes — a
 * citizen's photo carries GPS just as readily as an inspector's, and the
 * complainant is the one person the system must never expose (§11).
 */
async function store(file?: Express.Multer.File): Promise<{ id: string; url: string }> {
  if (!file?.buffer?.length) throw new BadRequestException('لم يتم إرفاق ملف.');

  const kind = detectImage(file.buffer);
  if (!kind) throw new BadRequestException('الملف ليس صورة صالحة (JPEG أو PNG فقط).');

  const cleaned = kind === 'jpeg' ? stripJpegMetadata(file.buffer) : file.buffer;
  const id = `${randomUUID()}.${kind === 'jpeg' ? 'jpg' : 'png'}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, id), cleaned);

  return { id, url: `/uploads/${id}` };
}

/** Exactly the shape `store` produces. Anything else is not ours, and the
 *  anchored pattern is also what stops `../../etc/passwd` reaching join(). */
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/**
 * Confirms an id refers to a file this server actually wrote. Complaint
 * evidence triples a complaint's weight in the Risk Score (§6.2), so accepting
 * a client-supplied id unchecked would let anyone fabricate evidence and game
 * the ranking — defeating the very mechanism that is supposed to make
 * malicious complaints harmless.
 */
export async function uploadExists(id: string): Promise<boolean> {
  if (!UPLOAD_ID.test(id)) return false;
  try {
    await access(join(UPLOAD_DIR, id));
    return true;
  } catch {
    return false;
  }
}

@Controller('api/uploads')
@UseGuards(AuthGuard)
@Roles('INSPECTOR', 'OWNER', 'ADMIN')
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<{ id: string; url: string }> {
    return store(file);
  }
}

/** The complaint form has no token — a citizen never signs in (§3). */
@Controller('api/public/uploads')
export class PublicUploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  upload(@UploadedFile() file?: Express.Multer.File): Promise<{ id: string; url: string }> {
    return store(file);
  }
}
