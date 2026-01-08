import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsObject()
  @IsOptional()
  oldValues?: Record<string, any>;

  @IsObject()
  @IsOptional()
  newValues?: Record<string, any>;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}
