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
  ParseBoolPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole, TicketAvailability } from '@prisma/client';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(@Body() createTicketDto: CreateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.create(createTicketDto, user.id, user.role);
  }

  @Get()
  @Public()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventId') eventId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('availability') availability?: TicketAvailability,
    @Query('isVisible') isVisible?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 10; // Max 100
    return this.ticketsService.findAll({
      page: page ? parseInt(page) : 1,
      limit: limitNum,
      eventId,
      categoryId,
      availability,
      isVisible: isVisible !== undefined ? isVisible === 'true' : undefined,
    });
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Get(':id/availability')
  @Public()
  checkAvailability(
    @Param('id') id: string,
    @Query('quantity') quantity: string,
    @Query('isHalfPrice') isHalfPrice?: string,
  ) {
    return this.ticketsService.checkAvailability(
      id,
      parseInt(quantity),
      isHalfPrice === 'true',
    );
  }

  @Patch(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.update(id, updateTicketDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.remove(id, user.id, user.role);
  }
}
