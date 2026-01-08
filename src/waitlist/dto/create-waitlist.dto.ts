import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateWaitlistDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  churchName: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  responsibleName: string;

  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  email: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'WhatsApp must be a valid phone number',
  })
  whatsapp: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  city: string;
}
