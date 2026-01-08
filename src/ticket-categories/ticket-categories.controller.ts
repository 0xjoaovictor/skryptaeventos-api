import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { TicketCategoriesService } from './ticket-categories.service';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';

@Controller('ticket-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketCategoriesController {
  constructor(private readonly ticketCategoriesService: TicketCategoriesService) {}

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(@Body() createTicketCategoryDto: CreateTicketCategoryDto, @CurrentUser() user: any) {
    return this.ticketCategoriesService.create(createTicketCategoryDto, user.id, user.role);
  }

  @Get()
  @Public()
  findAll(@Query('eventId') eventId?: string) {
    return this.ticketCategoriesService.findAll(eventId);
  }

  @Get('event/:eventId')
  @Public()
  findByEvent(@Param('eventId') eventId: string) {
    return this.ticketCategoriesService.findByEvent(eventId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.ticketCategoriesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateTicketCategoryDto: UpdateTicketCategoryDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketCategoriesService.update(id, updateTicketCategoryDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketCategoriesService.remove(id, user.id, user.role);
  }

  @Post('event/:eventId/reorder')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  reorder(
    @Param('eventId') eventId: string,
    @Body() body: { categories: Array<{ id: string; displayOrder: number }> },
    @CurrentUser() user: any,
  ) {
    return this.ticketCategoriesService.reorder(eventId, body.categories, user.id, user.role);
  }
}
