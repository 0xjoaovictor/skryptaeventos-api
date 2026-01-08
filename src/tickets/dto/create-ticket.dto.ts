import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsInt,
  IsNotEmpty,
  MinLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketType, TicketAvailability } from '@prisma/client';

export class CreateTicketDto {
  // Relations
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  // Basic Info
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TicketType)
  @IsNotEmpty()
  type: TicketType;

  // Pricing
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  // Quantity
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  quantitySold?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  quantityReserved?: number;

  // Min/Max per purchase
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  minQuantity?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  maxQuantity?: number;

  // Sales Period
  @IsDateString()
  @IsNotEmpty()
  salesStartsAt: string;

  @IsDateString()
  @IsNotEmpty()
  salesEndsAt: string;

  // Availability
  @IsEnum(TicketAvailability)
  @IsOptional()
  availability?: TicketAvailability;

  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  // Service Fee
  @IsBoolean()
  @IsOptional()
  absorbServiceFee?: boolean;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  serviceFeePercentage?: number;

  // Half Price Option (Meia-entrada)
  @IsBoolean()
  @IsOptional()
  hasHalfPrice?: boolean;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.hasHalfPrice === true)
  halfPriceTitle?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  @ValidateIf((o) => o.hasHalfPrice === true)
  @Type(() => Number)
  halfPrice?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @ValidateIf((o) => o.hasHalfPrice === true)
  @Type(() => Number)
  halfPriceQuantity?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  halfPriceSold?: number;

  // Display order
  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;
}
