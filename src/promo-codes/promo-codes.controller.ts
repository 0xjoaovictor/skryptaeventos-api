import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PromoCodesService } from './promo-codes.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('promo-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(@Body() createPromoCodeDto: CreatePromoCodeDto, @CurrentUser() user: any) {
    return this.promoCodesService.create(createPromoCodeDto, user.id, user.role);
  }

  @Post('validate')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 validations per minute
  validate(@Body() validatePromoCodeDto: ValidatePromoCodeDto, @CurrentUser() user: any) {
    // Ensure userId from authenticated user is used
    return this.promoCodesService.validate({
      ...validatePromoCodeDto,
      userId: user.id,
    });
  }

  @Get()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findAll(@Query('eventId') eventId: string, @CurrentUser() user: any) {
    return this.promoCodesService.findAll(eventId, user.id, user.role);
  }

  @Get('event/:eventId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findByEvent(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: any) {
    return this.promoCodesService.findByEvent(eventId, user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.promoCodesService.findOne(id, user.id, user.role);
  }

  @Get(':id/stats')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  getUsageStats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.promoCodesService.getUsageStats(id, user.id, user.role);
  }

  @Patch(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePromoCodeDto: UpdatePromoCodeDto,
    @CurrentUser() user: any,
  ) {
    return this.promoCodesService.update(id, updatePromoCodeDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.promoCodesService.remove(id, user.id, user.role);
  }
}
