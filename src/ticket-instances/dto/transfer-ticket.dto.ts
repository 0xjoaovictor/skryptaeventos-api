import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class TransferTicketDto {
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  newAttendeeEmail: string;

  @IsString()
  @IsNotEmpty()
  newAttendeeName: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, {
    message: 'CPF must be 11 digits',
  })
  newAttendeeCpf?: string;

  @IsString()
  @IsOptional()
  newAttendeePhone?: string;
}
