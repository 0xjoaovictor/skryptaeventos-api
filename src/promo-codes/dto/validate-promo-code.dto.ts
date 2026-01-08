import { IsString, IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';

export class ValidatePromoCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsNumber()
  @Min(0.01)
  orderValue: number;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  ticketIds?: string;
}
