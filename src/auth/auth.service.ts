import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AsaasService } from '../payments/asaas.service';
import { SecurityLoggerService, SecurityEventType } from '../common/services/security-logger.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private asaasService: AsaasService,
    private securityLogger: SecurityLoggerService,
  ) {}

  async register(registerDto: RegisterDto) {
    const {
      email: rawEmail,
      password,
      name,
      role,
      phone,
      cpf,
      birthDate,
      companyType,
      address,
      addressNumber,
      complement,
      province,
      postalCode,
      city,
      state,
      incomeValue,
    } = registerDto;

    // Normalize email: trim whitespace and convert to lowercase
    const email = rawEmail?.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check CPF uniqueness if provided
    if (cpf) {
      const existingCpf = await this.prisma.user.findUnique({
        where: { cpf },
      });

      if (existingCpf) {
        throw new ConflictException('CPF already registered');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create verification token
    const verificationToken = await bcrypt.hash(email + Date.now(), 10);

    // Create ASAAS subaccount for organizers
    let asaasAccountId: string | undefined;
    let asaasWalletId: string | undefined;
    let asaasApiKey: string | undefined;

    if (role === 'ORGANIZER' && cpf) {
      try {
        this.logger.log(`Creating ASAAS whitelabel subaccount for organizer: ${email}`);

        // Get webhook configuration from environment
        const webhookUrl = process.env.ASAAS_PAYMENT_WEBHOOK_URL || `${process.env.API_URL}/api/webhooks/asaas`;
        const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN || '';

        const subaccount = await this.asaasService.createSubaccount({
          name,
          email,
          cpfCnpj: cpf,
          birthDate,
          companyType,
          phone,
          mobilePhone: phone, // Use same phone for mobile (should be mobile format)
          address,
          addressNumber,
          complement,
          province,
          postalCode,
          incomeValue: incomeValue || 5000, // Default to R$ 5.000/month if not provided
          // Webhook configuration for whitelabel subaccount
          webhooks: [
            // {
            //   name: 'Skrypta Payment Events',
            //   url: webhookUrl,
            //   email,
            //   sendType: 'SEQUENTIALLY',
            //   enabled: true,
            //   interrupted: false,
            //   apiVersion: 3,
            //   authToken: webhookToken,
            //   events: [
            //     'PAYMENT_CREATED',
            //     'PAYMENT_UPDATED',
            //     'PAYMENT_CONFIRMED',
            //     'PAYMENT_RECEIVED',
            //     'PAYMENT_OVERDUE',
            //     'PAYMENT_REFUNDED',
            //     'PAYMENT_AWAITING_RISK_ANALYSIS',
            //     'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
            //     'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
            //   ],
            // },
          ],
        });

        asaasAccountId = subaccount.id;
        asaasWalletId = subaccount.walletId;
        asaasApiKey = subaccount.apiKey;

        this.logger.log(`ASAAS whitelabel subaccount created successfully: ${asaasAccountId}`);
        this.logger.log(`Webhook configured: ${webhookUrl}`);
      } catch (error) {
        this.logger.error('Failed to create ASAAS whitelabel subaccount:', error);
        throw new BadRequestException('Failed to create payment account. Please try again or contact support.');
      }
    }

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: role || 'ORGANIZER',
        phone,
        cpf,
        verificationToken,
        asaasAccountId,
        asaasWalletId,
        asaasApiKey,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail(user, verificationToken);
    } catch (error) {
      this.logger.error('Failed to send verification email:', error);
      // Don't fail registration if email fails
    }

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const { email: rawEmail, password } = loginDto;

    // Normalize email: trim whitespace and convert to lowercase
    const email = rawEmail?.trim().toLowerCase();

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Security: Log failed login attempt
      await this.securityLogger.logFailedLogin(email, ipAddress || 'unknown', userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Security: Log failed login attempt
      await this.securityLogger.logFailedLogin(email, ipAddress || 'unknown', userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      await this.securityLogger.logSecurityEvent(SecurityEventType.LOGIN_FAILURE, {
        userId: user.id,
        email,
        ipAddress,
        userAgent,
        severity: 'MEDIUM',
        metadata: { reason: 'Account inactive' },
      });
      throw new UnauthorizedException('Account is inactive');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Security: Log successful login
    await this.securityLogger.logSuccessfulLogin(user.id, email, ipAddress || 'unknown', userAgent);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationToken: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async requestPasswordReset(email: string) {
    // Normalize email: trim whitespace and convert to lowercase
    const normalizedEmail = email?.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'If email exists, reset link will be sent' };
    }

    const resetToken = await bcrypt.hash(email + Date.now(), 10);
    const resetTokenExpiresAt = new Date();
    resetTokenExpiresAt.setHours(resetTokenExpiresAt.getHours() + 1); // 1 hour expiry

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiresAt,
      },
    });

    // Send password reset email
    try {
      await this.emailService.sendPasswordResetEmail(user, resetToken);
    } catch (error) {
      this.logger.error('Failed to send password reset email:', error);
      // Don't fail the request if email fails
    }

    return { message: 'If email exists, reset link will be sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: token },
    });

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000), // Issued at timestamp
      jti: `${user.id}-${Date.now()}-${Math.random()}`, // JWT ID - ensures unique tokens
    };

    const accessToken = this.jwtService.sign(payload);

    // Create session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
    };
  }

  private sanitizeUser(user: User) {
    const { password, verificationToken, resetToken, ...sanitized } = user;
    return sanitized;
  }
}
