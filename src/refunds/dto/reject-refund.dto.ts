import { IsString, IsNotEmpty } from 'class-validator';

export class RejectRefundDto {
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}
