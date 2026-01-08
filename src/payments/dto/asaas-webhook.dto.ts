import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export enum AsaasWebhookEvent {
  PAYMENT_CREATED = 'PAYMENT_CREATED',
  PAYMENT_UPDATED = 'PAYMENT_UPDATED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  PAYMENT_DELETED = 'PAYMENT_DELETED',
  PAYMENT_RESTORED = 'PAYMENT_RESTORED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  PAYMENT_RECEIVED_IN_CASH = 'PAYMENT_RECEIVED_IN_CASH',
  PAYMENT_CHARGEBACK_REQUESTED = 'PAYMENT_CHARGEBACK_REQUESTED',
  PAYMENT_CHARGEBACK_DISPUTE = 'PAYMENT_CHARGEBACK_DISPUTE',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL = 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  PAYMENT_DUNNING_RECEIVED = 'PAYMENT_DUNNING_RECEIVED',
  PAYMENT_DUNNING_REQUESTED = 'PAYMENT_DUNNING_REQUESTED',
  PAYMENT_BANK_SLIP_VIEWED = 'PAYMENT_BANK_SLIP_VIEWED',
  PAYMENT_CHECKOUT_VIEWED = 'PAYMENT_CHECKOUT_VIEWED',
  PAYMENT_AWAITING_RISK_ANALYSIS = 'PAYMENT_AWAITING_RISK_ANALYSIS',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS = 'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS = 'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  PAYMENT_AUTHORIZED = 'PAYMENT_AUTHORIZED',
  PAYMENT_ANTICIPATED = 'PAYMENT_ANTICIPATED',
}

export class AsaasWebhookDto {
  @IsOptional()
  @IsString()
  id?: string; // Webhook event ID from ASAAS

  @IsOptional()
  @IsString()
  dateCreated?: string; // Webhook event creation date from ASAAS

  @IsOptional()
  @IsObject()
  account?: {
    id: string;
    ownerId?: string;
  };

  @IsNotEmpty()
  @IsEnum(AsaasWebhookEvent)
  event: AsaasWebhookEvent;

  @IsNotEmpty()
  @IsObject()
  payment: {
    object: string;
    id: string;
    dateCreated: string;
    customer: string;
    checkoutSession?: any;
    subscription?: string;
    installment?: string;
    installmentNumber?: number;
    paymentLink?: any;
    dueDate: string;
    value: number;
    netValue?: number;
    billingType: string;
    status: string;
    description?: string;
    externalReference?: string;
    confirmedDate?: string;
    creditDate?: string;
    estimatedCreditDate?: string;
    pixTransaction?: any;
    pixQrCodeId?: string;
    creditCard?: {
      creditCardNumber?: string;
      creditCardBrand?: string;
      creditCardToken?: string;
    };
    originalValue?: number;
    interestValue?: number;
    originalDueDate?: string;
    paymentDate?: string;
    clientPaymentDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    transactionReceiptUrl?: string;
    invoiceNumber?: string;
    nossoNumero?: string;
    lastInvoiceViewedDate?: string;
    lastBankSlipViewedDate?: string;
    discount?: {
      value: number;
      limitDate?: string;
      dueDateLimitDays: number;
      type?: string;
    };
    fine?: {
      value: number;
      type?: string;
    };
    interest?: {
      value: number;
      type?: string;
    };
    split?: Array<{
      id: string;
      walletId: string;
      fixedValue?: number;
      percentualValue?: number;
      totalValue: number;
      cancellationReason?: string;
      status: string;
      externalReference?: string;
      description?: string;
    }>;
    deleted: boolean;
    postalService: boolean;
    anticipated: boolean;
    anticipable: boolean;
    escrow?: any;
    refunds?: any;
  };
}

export class AsaasPaymentResponse {
  object: string;
  id: string;
  dateCreated: string;
  customer: string;
  dueDate: string;
  value: number;
  netValue?: number;
  billingType: string;
  status: string;
  description?: string;
  externalReference?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  transactionReceiptUrl?: string;
  invoiceNumber?: string;
  deleted: boolean;
  postalService: boolean;
  anticipated: boolean;
  anticipable: boolean;
}

export class AsaasPixQrCodeResponse {
  encodedImage: string;
  payload: string;
  expirationDate: string;
}

export class AsaasCustomerResponse {
  object: string;
  id: string;
  dateCreated: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
  deleted: boolean;
}
