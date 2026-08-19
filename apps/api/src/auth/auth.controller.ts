import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService, LoginResult } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }): Promise<LoginResult> {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('البريد الإلكتروني وكلمة المرور مطلوبان.');
    }
    return this.auth.login(body.email, body.password);
  }
}
