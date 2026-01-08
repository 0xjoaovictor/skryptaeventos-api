import { IsEmail, IsString, MinLength, IsOptional, IsEnum, Matches, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @Transform(({ value }) => value?.trim().toLowerCase())
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'CPF must be 11 digits' })
  cpf?: string;

  // ASAAS Whitelabel Required Fields (for ORGANIZER role)
  @IsDateString()
  @IsOptional()
  birthDate?: string; // Format: YYYY-MM-DD

  @IsString()
  @IsOptional()
  companyType?: string; // e.g., "MEI", "LTDA", "EIRELI"

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  addressNumber?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  province?: string; // Neighborhood/District

  @IsString()
  @IsOptional()
  postalCode?: string; // CEP

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string; // UF (e.g., "SP", "RJ")

  @IsOptional()
  incomeValue?: number; // Monthly income/revenue (for ASAAS whitelabel)
}
