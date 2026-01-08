import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomFormFieldDto } from './create-custom-form-field.dto';
import { OmitType } from '@nestjs/mapped-types';

export class UpdateCustomFormFieldDto extends PartialType(
  OmitType(CreateCustomFormFieldDto, ['eventId', 'fieldName'] as const),
) {}
