import {
  IsString,
  IsOptional,
  IsEmail,
  IsObject,
  Matches,
} from 'class-validator';

export class UpdateTicketInstanceDto {
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

  @IsObject()
  @IsOptional()
  formResponses?: any;
}
