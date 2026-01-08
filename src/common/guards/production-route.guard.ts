import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * Production Route Guard
 *
 * Blocks all routes except /waitlist when BLOCK_PRODUCTION_ROUTES is enabled
 * This is useful for deploying to production while keeping most features in development
 */
@Injectable()
export class ProductionRouteGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Only enforce in production if BLOCK_PRODUCTION_ROUTES is enabled
    const blockRoutes = process.env.BLOCK_PRODUCTION_ROUTES === 'true';

    if (!blockRoutes) {
      return true; // Allow all routes if blocking is disabled
    }

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    // Allowed routes in production
    const allowedRoutes = [
      '/waitlist',
      '/health', // Health check endpoint
    ];

    // Check if the current path matches any allowed route
    // This handles both /waitlist and /api/waitlist (with global prefix)
    const isAllowed = allowedRoutes.some(route =>
      path === route || path.startsWith(`${route}/`) || path.startsWith(`/api${route}`)
    );

    if (!isAllowed) {
      throw new ForbiddenException(
        'Esta funcionalidade está em desenvolvimento. Apenas a lista de espera está disponível no momento.',
      );
    }

    return true;
  }
}
