import { Controller, Get, Post, Body, Patch, Param, UseGuards, Delete } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ApproveRefundDto } from './dto/approve-refund.dto';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ATTENDEE, UserRole.ADMIN)
  create(@Body() createRefundDto: CreateRefundDto, @CurrentUser() user: any) {
    return this.refundsService.create(createRefundDto, user.id);
  }

  @Get()
  @Roles(UserRole.ORGANIZER, UserRole.ATTENDEE, UserRole.ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.refundsService.findAll(user.id, user.role);
  }

  @Get('order/:orderId')
  @Roles(UserRole.ORGANIZER, UserRole.ATTENDEE, UserRole.ADMIN)
  findByOrder(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    return this.refundsService.findByOrder(orderId, user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ATTENDEE, UserRole.ADMIN)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.refundsService.findOne(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  approve(
    @Param('id') id: string,
    @Body() approveRefundDto: ApproveRefundDto,
    @CurrentUser() user: any,
  ) {
    return this.refundsService.approve(id, approveRefundDto, user.id, user.role);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() rejectRefundDto: RejectRefundDto,
    @CurrentUser() user: any,
  ) {
    return this.refundsService.reject(id, rejectRefundDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ATTENDEE, UserRole.ADMIN)
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    const refund = await this.refundsService.cancel(id, user.id, user.role);
    return {
      ...refund,
      message: 'Refund request cancelled successfully',
    };
  }
}
