import {
  IsString,
  IsOptional,
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsNumber,
  IsBoolean,
  Min,
  IsEmail,
  IsInt,
  IsObject,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Attendee information for each individual ticket
 * Each ticket in an order requires complete attendee info and custom form responses
 */
export class AttendeeInfoDto {
  @IsString()
  @IsNotEmpty()
  attendeeName: string;

  @IsEmail()
  @IsNotEmpty()
  attendeeEmail: string;

  @IsString()
  @IsOptional()
  attendeeCpf?: string;

  @IsString()
  @IsOptional()
  attendeePhone?: string;

  @IsObject()
  @IsNotEmpty()
  formResponses: Record<string, any>; // Custom form field responses (key = fieldName, value = user input)
}

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsBoolean()
  @IsOptional()
  isHalfPrice?: boolean;

  /**
   * Attendee information for each ticket
   * Array length must match quantity (one attendee per ticket)
   * Each attendee must fill all required custom form fields
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendeeInfoDto)
  attendees: AttendeeInfoDto[];
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsString()
  @IsOptional()
  promoCode?: string;

  @IsString()
  @IsOptional()
  buyerName?: string;

  @IsEmail()
  @IsOptional()
  buyerEmail?: string;

  @IsString()
  @IsOptional()
  buyerPhone?: string;

  @IsString()
  @IsOptional()
  buyerCpf?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
