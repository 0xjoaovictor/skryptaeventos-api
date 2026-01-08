import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';

// Mock bcrypt before importing
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const bcrypt = require('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let emailService: EmailService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockEmailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
      };

      const hashedPassword = 'hashed_password';
      const verificationToken = 'verification_token';

      bcrypt.hash
        .mockResolvedValueOnce(hashedPassword as never)
        .mockResolvedValueOnce(verificationToken as never);

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id',
        email: registerDto.email,
        name: registerDto.name,
        role: registerDto.role,
        password: hashedPassword,
        verificationToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockJwtService.sign.mockReturnValue('jwt_token');
      mockPrismaService.session.create.mockResolvedValue({});
      mockEmailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('access_token');
      expect(result.user.email).toBe(registerDto.email);
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if CPF already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
        cpf: '12345678900',
      };

      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'existing-user', cpf: registerDto.cpf }); // cpf check

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('should handle email service failure gracefully', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
      };

      bcrypt.hash.mockResolvedValue('hashed' as never);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id',
        email: registerDto.email,
        name: registerDto.name,
        role: registerDto.role,
      });
      mockJwtService.sign.mockReturnValue('jwt_token');
      mockPrismaService.session.create.mockResolvedValue({});
      mockEmailService.sendVerificationEmail.mockRejectedValue(new Error('Email failed'));

      // Should not throw - email failure is non-blocking
      const result = await service.register(registerDto);
      expect(result).toHaveProperty('access_token');
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const user = {
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed_password',
        isActive: true,
        name: 'Test User',
        role: 'ATTENDEE',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true as never);
      mockPrismaService.user.update.mockResolvedValue(user);
      mockJwtService.sign.mockReturnValue('jwt_token');
      mockPrismaService.session.create.mockResolvedValue({});

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBe('jwt_token');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'Password123!',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };

      const user = {
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed_password',
        isActive: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const user = {
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed_password',
        isActive: false,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with valid token', async () => {
      const token = 'valid_token';
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        verificationToken: token,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.user.update.mockResolvedValue({
        ...user,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationToken: null,
      });

      const result = await service.verifyEmail(token);

      expect(result).toHaveProperty('message');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerifiedAt: expect.any(Date),
          verificationToken: null,
        },
      });
    });

    it('should throw BadRequestException if token is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid_token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestPasswordReset', () => {
    it('should create reset token for existing user', async () => {
      const email = 'test@example.com';
      const user = {
        id: 'user-id',
        email,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.hash.mockResolvedValueOnce('reset_token' as never);
      mockPrismaService.user.update.mockResolvedValue({
        ...user,
        resetToken: 'reset_token',
      });
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await service.requestPasswordReset(email);

      expect(result).toHaveProperty('message');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should return generic message for non-existent email (security)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.requestPasswordReset('nonexistent@example.com');

      expect(result).toHaveProperty('message');
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should handle email service failure gracefully', async () => {
      const email = 'test@example.com';
      const user = { id: 'user-id', email };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.hash.mockResolvedValueOnce('reset_token' as never);
      mockPrismaService.user.update.mockResolvedValue(user);
      mockEmailService.sendPasswordResetEmail.mockRejectedValue(new Error('Email failed'));

      const result = await service.requestPasswordReset(email);
      expect(result).toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password with valid token', async () => {
      const token = 'valid_reset_token';
      const newPassword = 'NewPassword123!';
      const user = {
        id: 'user-id',
        resetToken: token,
        resetTokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      bcrypt.hash.mockResolvedValueOnce('new_hashed_password' as never);
      mockPrismaService.user.update.mockResolvedValue({
        ...user,
        password: 'new_hashed_password',
        resetToken: null,
        resetTokenExpiresAt: null,
      });

      const result = await service.resetPassword(token, newPassword);

      expect(result).toHaveProperty('message');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          password: 'new_hashed_password',
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      });
    });

    it('should throw BadRequestException if token is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('invalid_token', 'NewPassword123!')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if token is expired', async () => {
      const token = 'expired_token';
      const user = {
        id: 'user-id',
        resetToken: token,
        resetTokenExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.resetPassword(token, 'NewPassword123!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
