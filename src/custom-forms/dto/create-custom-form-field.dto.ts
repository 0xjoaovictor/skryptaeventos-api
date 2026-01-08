import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  MinLength,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormFieldType } from '@prisma/client';

export class CreateCustomFormFieldDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fieldName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  fieldLabel: string;

  @IsEnum(FormFieldType)
  @IsNotEmpty()
  fieldType: FormFieldType;

  @IsString()
  @IsOptional()
  placeholder?: string;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;

  @IsObject()
  @IsOptional()
  configuration?: Record<string, any>;
}
