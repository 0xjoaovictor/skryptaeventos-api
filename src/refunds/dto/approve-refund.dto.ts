import { IsString, IsOptional } from 'class-validator';

export class ApproveRefundDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
