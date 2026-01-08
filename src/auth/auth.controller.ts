import { Controller, Post, Body, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ auth: { limit: 3, ttl: 3600000 } }) // 3 registrations per hour
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 900000 } }) // 5 login attempts per 15 minutes
  async login(@Body() loginDto: LoginDto, @Req() request: Request) {
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.socket.remoteAddress ||
      'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('request-password-reset')
  @Throttle({ auth: { limit: 3, ttl: 3600000 } }) // 3 requests per hour
  async requestPasswordReset(@Body('email') email: string) {
    return this.authService.requestPasswordReset(email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ auth: { limit: 5, ttl: 3600000 } }) // 5 resets per hour
  async resetPassword(
    @Body('token') token: string,
    @Body('password') password: string,
  ) {
    return this.authService.resetPassword(token, password);
  }
}
