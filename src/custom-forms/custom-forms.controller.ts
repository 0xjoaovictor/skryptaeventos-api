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
  Put,
} from '@nestjs/common';
import { CustomFormsService } from './custom-forms.service';
import { CreateCustomFormFieldDto } from './dto/create-custom-form-field.dto';
import { UpdateCustomFormFieldDto } from './dto/update-custom-form-field.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('custom-forms')
export class CustomFormsController {
  constructor(private readonly customFormsService: CustomFormsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  create(
    @Body() createDto: CreateCustomFormFieldDto,
    @CurrentUser() user: any,
  ) {
    return this.customFormsService.create(createDto, user.id, user.role);
  }

  @Get()
  findAll(
    @Query('eventId') eventId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customFormsService.findAll(
      eventId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('event/:eventId')
  findByEvent(@Param('eventId') eventId: string) {
    return this.customFormsService.findByEvent(eventId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customFormsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomFormFieldDto,
    @CurrentUser() user: any,
  ) {
    return this.customFormsService.update(id, updateDto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customFormsService.remove(id, user.id, user.role);
  }

  @Put('event/:eventId/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  reorder(
    @Param('eventId') eventId: string,
    @Body('fieldIds') fieldIds: string[],
    @CurrentUser() user: any,
  ) {
    return this.customFormsService.reorder(eventId, fieldIds, user.id, user.role);
  }
}
