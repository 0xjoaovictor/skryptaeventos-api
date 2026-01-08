import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const { email, password, cpf, ...rest } = createUserDto;

    // Check email uniqueness
    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    // Check CPF uniqueness if provided
    if (cpf) {
      const existingCpf = await this.prisma.user.findUnique({
        where: { cpf },
      });

      if (existingCpf) {
        throw new ConflictException('CPF already exists');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        cpf,
        ...rest,
      },
    });

    return this.sanitizeUser(user);
  }

  async findAll(page = 1, limit = 10, role?: string) {
    const skip = (page - 1) * limit;

    const where = role ? { role: role as any } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(this.sanitizeUser),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        events: {
          select: {
            id: true,
            title: true,
            status: true,
            startsAt: true,
          },
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id); // Check if exists

    const { cpf, ...rest } = updateUserDto;

    const data: any = { ...rest };

    // Check CPF uniqueness if being updated
    if (cpf) {
      const existingCpf = await this.prisma.user.findFirst({
        where: {
          cpf,
          NOT: { id },
        },
      });

      if (existingCpf) {
        throw new ConflictException('CPF already exists');
      }

      data.cpf = cpf;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.sanitizeUser(user);
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'User deleted successfully' };
  }

  private sanitizeUser(user: any) {
    const { password, verificationToken, resetToken, resetTokenExpiresAt, ...sanitized } = user;
    return sanitized;
  }
}
