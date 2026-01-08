import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsUrl,
  IsObject,
  IsNotEmpty,
  MinLength,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TicketType, EventStatus, Visibility } from '@prisma/client';

export class CreateEventDto {
  // Basic Info
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  image?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsOptional()
  category?: string;

  // Date and Time
  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @IsDateString()
  @IsNotEmpty()
  endsAt: string;

  // Location (Presential)
  @IsString()
  @IsOptional()
  locationType?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  locationName?: string;

  @IsString()
  @IsOptional()
  streetName?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  streetNumber?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsBoolean()
  @IsOptional()
  showOnMaps?: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  longitude?: number;

  // Online Event Fields
  @IsBoolean()
  @IsOptional()
  isOnline?: boolean;

  @IsString()
  @IsOptional()
  @ValidateIf((o) => o.isOnline === true)
  @IsUrl()
  onlineUrl?: string;

  @IsString()
  @IsOptional()
  onlinePlatform?: string;

  @IsString()
  @IsOptional()
  onlinePassword?: string;

  @IsString()
  @IsOptional()
  onlineInstructions?: string;

  @IsBoolean()
  @IsOptional()
  isHybrid?: boolean;

  // Producer Info
  @IsString()
  @IsNotEmpty()
  producerName: string;

  @IsString()
  @IsOptional()
  producerDescription?: string;

  // Configuration
  @IsEnum(TicketType)
  @IsOptional()
  ticketType?: TicketType;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsEnum(Visibility)
  @IsOptional()
  visibility?: Visibility;

  @IsObject()
  @IsOptional()
  customForms?: any;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  totalCapacity?: number;

  // Refund Policy (Sympla-style implementation)
  @IsBoolean()
  @IsOptional()
  refundAllowed?: boolean;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  refundDeadlineDays?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  refundPercentage?: number;

  @IsString()
  @IsOptional()
  refundPolicy?: string;

  @IsBoolean()
  @IsOptional()
  platformFeeRefundable?: boolean;

  // Organizer ID will be set from the authenticated user in the controller
  @IsString()
  @IsOptional()
  organizerId?: string;
}
