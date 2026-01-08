import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

// Omit immutable fields from CreateOrderDto
class UpdateOrderBaseDto extends OmitType(CreateOrderDto, ['eventId', 'items'] as const) {}

export class UpdateOrderDto extends PartialType(UpdateOrderBaseDto) {
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}
