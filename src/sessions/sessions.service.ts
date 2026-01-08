import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private prisma: PrismaService) {}

  async createSession(
    userId: string,
    token: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string,
  ) {
    return this.prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });
  }

  async validateSession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({
        where: { id: session.id },
      });
      return null;
    }

    return session;
  }

  async findUserSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions;
  }

  async logout(token: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException('Cannot logout from another user session');
    }

    await this.prisma.session.delete({
      where: { token },
    });

    return { message: 'Logged out successfully' };
  }

  async logoutSession(sessionId: string, userId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new UnauthorizedException('Cannot logout from another user session');
    }

    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    return { message: 'Session terminated successfully' };
  }

  async logoutAllSessions(userId: string, exceptToken?: string) {
    const where: any = { userId };

    if (exceptToken) {
      where.NOT = { token: exceptToken };
    }

    const result = await this.prisma.session.deleteMany({
      where,
    });

    return {
      message: `${result.count} session(s) terminated successfully`,
      count: result.count,
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanExpiredSessions() {
    try {
      const result = await this.prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned ${result.count} expired session(s)`);
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to clean expired sessions', error);
      throw error;
    }
  }

  async getSessionStats(userId: string) {
    const [activeSessions, totalSessions] = await Promise.all([
      this.prisma.session.count({
        where: {
          userId,
          expiresAt: {
            gte: new Date(),
          },
        },
      }),
      this.prisma.session.count({
        where: { userId },
      }),
    ]);

    return {
      activeSessions,
      totalSessions,
    };
  }
}
