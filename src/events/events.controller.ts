import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole, EventStatus, Visibility } from '@prisma/client';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(@Body() createEventDto: CreateEventDto, @CurrentUser() user: any) {
    return this.eventsService.create(createEventDto, user.id, user.role);
  }

  @Get()
  @Public()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: EventStatus,
    @Query('visibility') visibility?: Visibility,
    @Query('organizerId') organizerId?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 10; // Max 100
    return this.eventsService.findAll({
      page: page ? parseInt(page) : 1,
      limit: limitNum,
      status,
      visibility,
      organizerId,
    });
  }

  @Get('slug/:slug')
  @Public()
  findBySlug(@Param('slug') slug: string) {
    return this.eventsService.findBySlug(slug);
  }

  @Get(':id/attendees/export')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  async exportAttendees(
    @Param('id') id: string,
    @Query('format') format: string,
    @CurrentUser() user: any,
    @Res() res: any,
  ) {
    const result = await this.eventsService.exportAttendees(
      id,
      user.id,
      user.role,
      format,
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendees-${id}.csv"`);
      res.send(result);
    } else {
      res.json(result);
    }
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @CurrentUser() user: any,
  ) {
    return this.eventsService.update(id, updateEventDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.remove(id, user.id, user.role);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.cancelEvent(id, user.id, user.role);
  }

  @Post(':id/publish')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.eventsService.publishEvent(id, user.id, user.role);
  }
}
