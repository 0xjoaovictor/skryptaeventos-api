import { IsString, MinLength, IsOptional, Matches, IsBoolean, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  // Safe fields that users can update
  @IsString()
  @MinLength(3)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'CPF must be 11 digits' })
  cpf?: string;

  // Admin-only field (enforced by controller access control)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // NOTE: Email, password, and role are intentionally NOT included:
  // - Email changes should go through a verification flow
  // - Password changes should use the password reset flow
  // - Role changes should only be done by admins via separate endpoint/DTO
}
