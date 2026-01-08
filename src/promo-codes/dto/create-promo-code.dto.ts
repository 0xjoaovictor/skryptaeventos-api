import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, IsBoolean, IsDateString, Min, IsArray } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreatePromoCodeDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maxUses?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  usesPerUser?: number;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minOrderValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxDiscountAmount?: number;

  @IsArray()
  @IsOptional()
  applicableTickets?: string[];
}
