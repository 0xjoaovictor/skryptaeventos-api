import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';

// Common audit actions
export enum AuditAction {
  // Event actions
  CREATE_EVENT = 'CREATE_EVENT',
  UPDATE_EVENT = 'UPDATE_EVENT',
  DELETE_EVENT = 'DELETE_EVENT',
  PUBLISH_EVENT = 'PUBLISH_EVENT',
  UNPUBLISH_EVENT = 'UNPUBLISH_EVENT',

  // Order actions
  CREATE_ORDER = 'CREATE_ORDER',
  UPDATE_ORDER = 'UPDATE_ORDER',
  CANCEL_ORDER = 'CANCEL_ORDER',
  COMPLETE_ORDER = 'COMPLETE_ORDER',

  // Payment actions
  CREATE_PAYMENT = 'CREATE_PAYMENT',
  CONFIRM_PAYMENT = 'CONFIRM_PAYMENT',
  REFUND_PAYMENT = 'REFUND_PAYMENT',

  // Ticket actions
  CREATE_TICKET = 'CREATE_TICKET',
  UPDATE_TICKET = 'UPDATE_TICKET',
  DELETE_TICKET = 'DELETE_TICKET',
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  CANCEL_CHECK_IN = 'CANCEL_CHECK_IN',

  // User actions
  CREATE_USER = 'CREATE_USER',
  UPDATE_USER = 'UPDATE_USER',
  DELETE_USER = 'DELETE_USER',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Custom form actions
  CREATE_FORM_FIELD = 'CREATE_FORM_FIELD',
  UPDATE_FORM_FIELD = 'UPDATE_FORM_FIELD',
  DELETE_FORM_FIELD = 'DELETE_FORM_FIELD',

  // Promo code actions
  CREATE_PROMO_CODE = 'CREATE_PROMO_CODE',
  UPDATE_PROMO_CODE = 'UPDATE_PROMO_CODE',
  DELETE_PROMO_CODE = 'DELETE_PROMO_CODE',
  APPLY_PROMO_CODE = 'APPLY_PROMO_CODE',

  // Refund actions
  CREATE_REFUND = 'CREATE_REFUND',
  APPROVE_REFUND = 'APPROVE_REFUND',
  REJECT_REFUND = 'REJECT_REFUND',
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private prisma: PrismaService) {}

  async createLog(createDto: CreateAuditLogDto) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          userId: createDto.userId,
          action: createDto.action,
          entityType: createDto.entityType,
          entityId: createDto.entityId,
          oldValues: createDto.oldValues || undefined,
          newValues: createDto.newValues || undefined,
          ipAddress: createDto.ipAddress,
          userAgent: createDto.userAgent,
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logs should not break the application
      this.logger.error('Failed to create audit log', error);
      return null;
    }
  }

  async log(
    action: string,
    entityType: string,
    entityId: string,
    options?: {
      userId?: string;
      oldValues?: Record<string, any>;
      newValues?: Record<string, any>;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    return this.createLog({
      action,
      entityType,
      entityId,
      userId: options?.userId,
      oldValues: options?.oldValues,
      newValues: options?.newValues,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });
  }

  async findAll(query: QueryAuditLogDto) {
    const {
      userId,
      action,
      entityType,
      entityId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  async findByEntity(entityType: string, entityId: string, userId: string, userRole: UserRole) {
    // Admins can see all audit logs
    if (userRole === UserRole.ADMIN) {
      return this.prisma.auditLog.findMany({
        where: {
          entityType,
          entityId,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // For organizers, validate they own the entity (Event)
    if (userRole === UserRole.ORGANIZER) {
      // If entityType is Event, check ownership
      if (entityType === 'Event') {
        const event = await this.prisma.event.findUnique({
          where: { id: entityId },
          select: { organizerId: true },
        });

        if (!event) {
          throw new ForbiddenException('Event not found');
        }

        if (event.organizerId !== userId) {
          throw new ForbiddenException('You do not have permission to view audit logs for this event');
        }
      } else {
        // For other entity types, organizers should only see logs for entities they own
        // This is a simplified check - you might need to add more entity type validations
        throw new ForbiddenException('You do not have permission to view audit logs for this entity type');
      }

      return this.prisma.auditLog.findMany({
        where: {
          entityType,
          entityId,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Default: deny access
    throw new ForbiddenException('You do not have permission to view audit logs');
  }

  async findByUser(userId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: { userId } }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getActionStats(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const stats = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        action: true,
      },
      orderBy: {
        _count: {
          action: 'desc',
        },
      },
    });

    return stats.map((stat) => ({
      action: stat.action,
      count: stat._count.action,
    }));
  }

  async getEntityTypeStats(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const stats = await this.prisma.auditLog.groupBy({
      by: ['entityType'],
      where,
      _count: {
        entityType: true,
      },
      orderBy: {
        _count: {
          entityType: 'desc',
        },
      },
    });

    return stats.map((stat) => ({
      entityType: stat.entityType,
      count: stat._count.entityType,
    }));
  }

  async getUserActivityStats(userId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        action: true,
        createdAt: true,
      },
    });

    const totalActions = logs.length;
    const actionBreakdown = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      userId,
      days,
      totalActions,
      actionBreakdown,
    };
  }
}
