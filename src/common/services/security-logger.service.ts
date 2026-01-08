import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_RESET_FAILURE = 'PASSWORD_RESET_FAILURE',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  WEBHOOK_VALIDATION_FAILURE = 'WEBHOOK_VALIDATION_FAILURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger(SecurityLoggerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log a security event
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    details: {
      userId?: string;
      email?: string;
      ipAddress?: string;
      userAgent?: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, any>;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    },
  ): Promise<void> {
    const {
      userId,
      email,
      ipAddress,
      userAgent,
      resourceType,
      resourceId,
      metadata,
      severity = 'MEDIUM',
    } = details;

    // Log to console for immediate visibility
    const logMessage = `[SECURITY] ${eventType} | User: ${email || userId || 'anonymous'} | IP: ${ipAddress || 'unknown'} | Severity: ${severity}`;

    if (severity === 'CRITICAL' || severity === 'HIGH') {
      this.logger.error(logMessage, metadata);
    } else if (severity === 'MEDIUM') {
      this.logger.warn(logMessage, metadata);
    } else {
      this.logger.log(logMessage);
    }

    // Store in audit log for persistence and analysis
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: userId || null,
          action: eventType,
          entityType: resourceType || 'SECURITY_EVENT',
          entityId: resourceId || 'N/A',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          newValues: {
            email,
            severity,
            ...metadata,
          },
        },
      });
    } catch (error) {
      // Don't fail the request if logging fails
      this.logger.error('Failed to write security event to database:', error);
    }
  }

  /**
   * Log failed login attempt
   */
  async logFailedLogin(email: string, ipAddress: string, userAgent?: string): Promise<void> {
    await this.logSecurityEvent(SecurityEventType.LOGIN_FAILURE, {
      email,
      ipAddress,
      userAgent,
      severity: 'MEDIUM',
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });

    // Check for brute force attack (multiple failures from same IP)
    await this.checkBruteForceAttempt(email, ipAddress);
  }

  /**
   * Log successful login
   */
  async logSuccessfulLogin(userId: string, email: string, ipAddress: string, userAgent?: string): Promise<void> {
    await this.logSecurityEvent(SecurityEventType.LOGIN_SUCCESS, {
      userId,
      email,
      ipAddress,
      userAgent,
      severity: 'LOW',
    });
  }

  /**
   * Log unauthorized access attempt
   */
  async logUnauthorizedAccess(
    resourceType: string,
    resourceId: string,
    userId?: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.logSecurityEvent(SecurityEventType.PERMISSION_DENIED, {
      userId,
      ipAddress,
      resourceType,
      resourceId,
      severity: 'HIGH',
    });
  }

  /**
   * Log webhook validation failure
   */
  async logWebhookValidationFailure(ipAddress: string, metadata?: Record<string, any>): Promise<void> {
    await this.logSecurityEvent(SecurityEventType.WEBHOOK_VALIDATION_FAILURE, {
      ipAddress,
      severity: 'CRITICAL',
      metadata,
    });
  }

  /**
   * Check for brute force attack patterns
   */
  private async checkBruteForceAttempt(email: string, ipAddress: string): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Count failed login attempts in last 5 minutes from this IP
    const recentFailures = await this.prisma.auditLog.count({
      where: {
        action: SecurityEventType.LOGIN_FAILURE,
        ipAddress: ipAddress,
        createdAt: {
          gte: fiveMinutesAgo,
        },
      },
    });

    if (recentFailures >= 5) {
      await this.logSecurityEvent(SecurityEventType.SUSPICIOUS_ACTIVITY, {
        email,
        ipAddress,
        severity: 'CRITICAL',
        metadata: {
          type: 'BRUTE_FORCE_ATTEMPT',
          failureCount: recentFailures,
          timeWindow: '5 minutes',
        },
      });
    }
  }
}
