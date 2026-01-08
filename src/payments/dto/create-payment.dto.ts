import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsObject, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  remoteIp?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  installmentCount?: number; // Number of installments (e.g., 2 for 2x)

  @IsOptional()
  @IsNumber()
  @Min(0)
  installmentValue?: number; // Value per installment

  @IsOptional()
  @IsObject()
  creditCardData?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };

  @IsOptional()
  @IsObject()
  customerData?: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
    mobilePhone?: string;
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
    city?: string;
    state?: string;
  };
}
