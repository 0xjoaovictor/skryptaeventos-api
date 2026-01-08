import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get('my-activity')
  getMyActivity(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 50; // Max 100
    return this.auditLogsService.findByUser(
      user.id,
      page ? parseInt(page) : 1,
      limitNum,
    );
  }

  @Get('stats/actions')
  @Roles(UserRole.ADMIN)
  getActionStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogsService.getActionStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('stats/entity-types')
  @Roles(UserRole.ADMIN)
  getEntityTypeStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditLogsService.getEntityTypeStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('stats/user/:userId')
  @Roles(UserRole.ADMIN)
  getUserActivityStats(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('days') days?: string,
  ) {
    return this.auditLogsService.getUserActivityStats(
      userId,
      days ? parseInt(days) : 30,
    );
  }

  @Get('entity/:entityType/:entityId')
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @CurrentUser() user: any,
  ) {
    return this.auditLogsService.findByEntity(entityType, entityId, user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogsService.findOne(id);
  }
}
