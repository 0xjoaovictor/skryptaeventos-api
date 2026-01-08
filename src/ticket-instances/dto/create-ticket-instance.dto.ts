import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsObject,
  IsNotEmpty,
  Matches,
} from 'class-validator';

export class CreateTicketInstanceDto {
  @IsString()
  @IsNotEmpty()
  orderItemId: string;

  @IsString()
  @IsNotEmpty()
  ticketId: string;

  // Attendee info (can be different from buyer)
  @IsString()
  @IsOptional()
  attendeeName?: string;

  @IsEmail()
  @IsOptional()
  attendeeEmail?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, {
    message: 'CPF must be 11 digits',
  })
  attendeeCpf?: string;

  @IsString()
  @IsOptional()
  attendeePhone?: string;

  // Half-price
  @IsBoolean()
  @IsOptional()
  isHalfPrice?: boolean;

  // Custom form responses for this attendee
  @IsObject()
  @IsOptional()
  formResponses?: any;
}
