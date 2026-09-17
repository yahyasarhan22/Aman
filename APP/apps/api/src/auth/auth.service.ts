import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import { verifyPassword } from './password';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  establishmentId: string | null;
}

export interface LoginResult {
  accessToken: string;
  user: { id: string; role: UserRole; displayNameAr: string };
}

/** Spec §11: 5 failed attempts, then a 15-minute lockout. In-memory is enough
 *  for a single-process prototype.
 *  ponytail: per-process counter — move to a shared store if the API is ever
 *  run with more than one worker. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private attempts = new Map<string, { count: number; until: number }>();

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const key = email.toLowerCase().trim();
    const record = this.attempts.get(key);
    if (record && record.until > Date.now()) {
      throw new UnauthorizedException('تم قفل الحساب مؤقتاً. حاول بعد 15 دقيقة.');
    }

    const user = await this.users.findOne({ where: { email: key } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !ok) {
      const count = (record?.count ?? 0) + 1;
      this.attempts.set(key, {
        count,
        until: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
      });
      throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
    }

    this.attempts.delete(key);
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      establishmentId: user.establishmentId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, role: user.role, displayNameAr: user.displayNameAr },
    };
  }
}
