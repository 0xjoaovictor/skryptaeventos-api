import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreatePromoCodeDto } from './create-promo-code.dto';

export class UpdatePromoCodeDto extends PartialType(
  OmitType(CreatePromoCodeDto, ['eventId', 'code'] as const)
) {}
