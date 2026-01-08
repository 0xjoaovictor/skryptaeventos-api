import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

// Mock bcrypt before importing
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

const bcrypt = require('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create a user', async () => {
      const createUserDto = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
      };

      bcrypt.hash.mockResolvedValueOnce('hashed_password');

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-id',
        ...createUserDto,
        password: 'hashed_password',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createUserDto);

      expect(result).toHaveProperty('id');
      expect(result.email).toBe(createUserDto.email);
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      const createUserDto = {
        email: 'existing@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'ATTENDEE' as any,
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: createUserDto.email,
      });

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [
        { id: '1', email: 'user1@example.com', name: 'User 1', role: 'ATTENDEE' },
        { id: '2', email: 'user2@example.com', name: 'User 2', role: 'ORGANIZER' },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(users);
      mockPrismaService.user.count.mockResolvedValue(2);

      const result = await service.findAll(1, 10);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('should filter users by role', async () => {
      const organizers = [
        { id: '2', email: 'org@example.com', name: 'Organizer', role: 'ORGANIZER' },
      ];

      mockPrismaService.user.findMany.mockResolvedValue(organizers);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll(1, 10, 'ORGANIZER');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('ORGANIZER');
    });

    it('should respect pagination limits', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      await service.findAll(1, 10);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ATTENDEE',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('user-id');

      expect(result).toEqual(user);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should successfully update a user', async () => {
      const updateUserDto = {
        name: 'Updated Name',
        phone: '1234567890',
      };

      const existingUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Old Name',
        role: 'ATTENDEE',
      };

      const updatedUser = {
        ...existingUser,
        ...updateUserDto,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-id', updateUserDto);

      expect(result.name).toBe(updateUserDto.name);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: updateUserDto,
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent-id', { name: 'New Name' })).rejects.toThrow(
        NotFoundException,
      );
    });

    // Password updates are intentionally NOT supported via UpdateUserDto for security reasons
    // Passwords should only be changed through the password reset flow in AuthService
  });

  describe('remove', () => {
    it('should successfully delete a user', async () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.user.delete.mockResolvedValue(user);

      const result = await service.remove('user-id');

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('User deleted successfully');
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
    });
  });
});
