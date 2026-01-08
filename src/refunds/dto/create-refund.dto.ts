import { IsString, IsNotEmpty, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { RefundReason } from '@prisma/client';

export class CreateRefundDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsString()
  @IsOptional()
  ticketInstanceId?: string; // Optional: refund specific ticket instance (Sympla-style)

  @IsNumber()
  @Min(0.01)
  @IsOptional() // SIMPLIFIED: amount is now optional, always use full order subtotal
  amount?: number;

  @IsEnum(RefundReason)
  reason: RefundReason;

  @IsString()
  @IsOptional()
  notes?: string;
}
