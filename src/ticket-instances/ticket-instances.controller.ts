import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TicketInstancesService } from './ticket-instances.service';
import { CreateTicketInstanceDto } from './dto/create-ticket-instance.dto';
import { UpdateTicketInstanceDto } from './dto/update-ticket-instance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, TicketInstanceStatus } from '@prisma/client';

@Controller('ticket-instances')
export class TicketInstancesController {
  constructor(
    private readonly ticketInstancesService: TicketInstancesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(@Body() createTicketInstanceDto: CreateTicketInstanceDto) {
    return this.ticketInstancesService.create(createTicketInstanceDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TicketInstanceStatus,
    @Query('eventId') eventId?: string,
    @Query('orderItemId') orderItemId?: string,
    @Query('ticketId') ticketId?: string,
    @Query('attendeeEmail') attendeeEmail?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 50; // Max 100
    return this.ticketInstancesService.findAll({
      page: page ? parseInt(page) : 1,
      limit: limitNum,
      status,
      eventId,
      orderItemId,
      ticketId,
      attendeeEmail,
    });
  }

  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  getMyTickets(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TicketInstanceStatus,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 20; // Max 100
    return this.ticketInstancesService.getMyTickets(user.id, {
      page: page ? parseInt(page) : 1,
      limit: limitNum,
      status,
    });
  }

  @Get('qr/:qrCode')
  @UseGuards(JwtAuthGuard)
  findByQrCode(@Param('qrCode') qrCode: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.findByQrCode(qrCode, user.id, user.role);
  }

  @Get('event/:eventId/attendees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  getEventAttendees(
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: TicketInstanceStatus,
    @Query('ticketId') ticketId?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit), 100) : 50; // Max 100
    return this.ticketInstancesService.getEventAttendees(
      eventId,
      user.id,
      user.role,
      {
        page: page ? parseInt(page) : 1,
        limit: limitNum,
        status,
        ticketId,
      },
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateTicketInstanceDto: UpdateTicketInstanceDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketInstancesService.update(
      id,
      updateTicketInstanceDto,
      user.id,
      user.role,
    );
  }

  @Post('check-in/:qrCode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  checkIn(
    @Param('qrCode') qrCode: string,
    @Body() checkInDto: CheckInDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketInstancesService.checkIn(
      qrCode,
      checkInDto,
      user.id,
      user.role,
    );
  }

  @Post(':id/transfer')
  @UseGuards(JwtAuthGuard)
  transferTicket(
    @Param('id') id: string,
    @Body() transferTicketDto: TransferTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketInstancesService.transferTicket(
      id,
      transferTicketDto,
      user.id,
      user.role,
    );
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  cancelTicket(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.cancelTicket(id, user.id, user.role);
  }

  @Get(':id/validate-half-price')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  validateHalfPrice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.validateHalfPrice(
      id,
      user.id,
      user.role,
    );
  }

  @Get(':id/qr-image')
  @UseGuards(JwtAuthGuard)
  findOneWithQRImage(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.findOneWithQRImage(
      id,
      user.id,
      user.role,
    );
  }

  @Get('qr/:qrCode/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findByQrCodeWithImage(@Param('qrCode') qrCode: string, @CurrentUser() user: any) {
    return this.ticketInstancesService.findByQrCodeWithImage(
      qrCode,
      user.id,
      user.role,
    );
  }
}
