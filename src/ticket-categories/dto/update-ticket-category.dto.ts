import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketCategoryDto } from './create-ticket-category.dto';
import { OmitType } from '@nestjs/mapped-types';

export class UpdateTicketCategoryDto extends PartialType(
  OmitType(CreateTicketCategoryDto, ['eventId'] as const)
) {}
