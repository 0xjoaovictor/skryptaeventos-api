import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PaymentMethod } from '@prisma/client';
import { AsaasPaymentResponse, AsaasPixQrCodeResponse, AsaasCustomerResponse } from './dto/asaas-webhook.dto';

interface AsaasSplitDto {
  walletId: string;
  fixedValue?: number;
  percentualValue?: number;
}

interface CreateAsaasPaymentDto {
  customer: string;
  billingType: string;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  split?: AsaasSplitDto[];
  remoteIp?: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
}

interface CreateAsaasCustomerDto {
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
}

interface AsaasWebhookConfig {
  name: string;
  url: string;
  email: string;
  sendType?: string; // e.g., "SEQUENTIALLY"
  enabled: boolean;
  interrupted: boolean;
  apiVersion?: number;
  authToken?: string;
  events: string[];
}

interface CreateAsaasSubaccountDto {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string;
  companyType?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  incomeValue?: number; // Monthly income/revenue
  webhooks?: AsaasWebhookConfig[];
}

interface AsaasSubaccountResponse {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  apiKey: string;
  walletId: string;
  accountNumber: {
    agency: string;
    account: string;
    accountDigit: string;
  };
}

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('ASAAS_API_URL') || 'https://sandbox.asaas.com/api/v3';
    this.apiKey = this.configService.get<string>('ASAAS_API_KEY') || '';

    if (!this.apiKey) {
      this.logger.error('ASAAS_API_KEY not configured in environment variables');
      throw new Error('ASAAS payment gateway is not properly configured');
    }

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'access_token': this.apiKey,
      },
      timeout: 30000,
    });

    this.logger.log(`ASAAS Service initialized with URL: ${this.apiUrl}`);
  }

  /**
   * Create or get a customer in ASAAS
   */
  async createOrGetCustomer(customerData: CreateAsaasCustomerDto): Promise<AsaasCustomerResponse> {
    try {
      this.logger.log(`Creating/getting customer for CPF/CNPJ: ${customerData.cpfCnpj}`);

      // First, try to find existing customer by CPF/CNPJ
      const existingCustomer = await this.findCustomerByCpfCnpj(customerData.cpfCnpj);
      if (existingCustomer) {
        this.logger.log(`Found existing customer: ${existingCustomer.id}`);
        return existingCustomer;
      }

      // Create new customer
      const response = await this.axiosInstance.post<AsaasCustomerResponse>('/customers', customerData);
      this.logger.log(`Customer created successfully: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error creating/getting customer');
    }
  }

  /**
   * Create ASAAS subaccount for event organizer
   */
  async createSubaccount(subaccountData: CreateAsaasSubaccountDto): Promise<AsaasSubaccountResponse> {
    try {
      this.logger.log(`Creating ASAAS subaccount for: ${subaccountData.email}`);

      const response = await this.axiosInstance.post<AsaasSubaccountResponse>('/accounts', subaccountData);

      this.logger.log(`Subaccount created successfully: ${response.data.id}`);
      this.logger.log(`Wallet ID: ${response.data.walletId}`);

      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error creating subaccount');
    }
  }

  /**
   * Find customer by CPF/CNPJ
   */
  private async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomerResponse | null> {
    try {
      const response = await this.axiosInstance.get<{ data: AsaasCustomerResponse[] }>('/customers', {
        params: { cpfCnpj },
      });

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }

      return null;
    } catch (error) {
      this.logger.warn(`Error searching for customer: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a payment in ASAAS
   */
  async createPayment(
    customerId: string,
    amount: number,
    method: PaymentMethod,
    dueDate: Date,
    description?: string,
    externalReference?: string,
    creditCardData?: any,
    remoteIp?: string,
    organizerWalletId?: string,
    serviceFeePercentage?: number,
    installmentCount?: number,
    installmentValue?: number,
  ): Promise<AsaasPaymentResponse> {
    try {
      const billingType = this.mapPaymentMethodToBillingType(method);

      const paymentData: CreateAsaasPaymentDto = {
        customer: customerId,
        billingType,
        value: amount,
        dueDate: this.formatDate(dueDate),
        description: description || 'Pagamento de ingresso',
        externalReference,
      };

      // Configure payment split
      // Send (100% - serviceFee%) to event organizer
      // Platform keeps the service fee automatically (not sent as a split)
      this.logger.log(`Configuring payment split - organizerWalletId: ${organizerWalletId}, serviceFeePercentage: ${serviceFeePercentage}`);

      if (organizerWalletId && serviceFeePercentage !== undefined) {
        const organizerPercentage = 100 - Number(serviceFeePercentage);

        paymentData.split = [{
          walletId: organizerWalletId,
          percentualValue: organizerPercentage,
        }];

        this.logger.log(`Payment split configured:`);
        this.logger.log(`  - ${organizerPercentage}% to organizer wallet ${organizerWalletId}`);
        this.logger.log(`  - ${serviceFeePercentage}% platform fee (kept by root account)`);
      } else if (organizerWalletId) {
        this.logger.warn('Service fee percentage not provided, payment will go entirely to root account');
      } else {
        this.logger.warn('No organizer wallet ID - payment will go entirely to root account');
      }

      // Add credit card data if payment method is credit card
      if (method === PaymentMethod.CREDIT_CARD && creditCardData) {
        paymentData.creditCard = creditCardData.creditCard;
        paymentData.creditCardHolderInfo = creditCardData.creditCardHolderInfo;

        // Add installment data for credit card payments
        if (installmentCount && installmentCount > 1) {
          (paymentData as any).installmentCount = installmentCount;
          if (installmentValue) {
            (paymentData as any).installmentValue = installmentValue;
          } else {
            // Calculate installment value if not provided
            (paymentData as any).installmentValue = Number((amount / installmentCount).toFixed(2));
          }
          this.logger.log(`  - Installments: ${installmentCount}x of R$ ${(paymentData as any).installmentValue}`);
        }

        // Add remote IP for fraud prevention
        if (remoteIp) {
          paymentData.remoteIp = remoteIp;
        } else if (creditCardData.remoteIp) {
          paymentData.remoteIp = creditCardData.remoteIp;
        }
      }

      this.logger.log(`Creating payment for customer ${customerId} - Amount: ${amount} - Method: ${billingType}`);

      const response = await this.axiosInstance.post<AsaasPaymentResponse>('/payments', paymentData);

      this.logger.log(`Payment created successfully: ${response.data.id} - Status: ${response.data.status}`);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error creating payment');
    }
  }

  /**
   * Get PIX QR Code for a payment
   */
  async getPixQrCode(paymentId: string): Promise<AsaasPixQrCodeResponse> {
    try {
      this.logger.log(`Getting PIX QR Code for payment: ${paymentId}`);

      const response = await this.axiosInstance.get<AsaasPixQrCodeResponse>(
        `/payments/${paymentId}/pixQrCode`,
      );

      this.logger.log(`PIX QR Code retrieved successfully for payment: ${paymentId}`);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error getting PIX QR Code');
    }
  }

  /**
   * Get payment details from ASAAS
   */
  async getPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    try {
      this.logger.log(`Getting payment details: ${paymentId}`);

      const response = await this.axiosInstance.get<AsaasPaymentResponse>(`/payments/${paymentId}`);

      this.logger.log(`Payment details retrieved: ${paymentId} - Status: ${response.data.status}`);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error getting payment details');
    }
  }

  /**
   * Cancel a payment in ASAAS
   */
  async cancelPayment(paymentId: string): Promise<AsaasPaymentResponse> {
    try {
      this.logger.log(`Cancelling payment: ${paymentId}`);

      const response = await this.axiosInstance.delete<AsaasPaymentResponse>(`/payments/${paymentId}`);

      this.logger.log(`Payment cancelled successfully: ${paymentId}`);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Error cancelling payment');
    }
  }

  /**
   * Map internal PaymentMethod to ASAAS billing type
   */
  private mapPaymentMethodToBillingType(method: PaymentMethod): string {
    const mapping: Record<PaymentMethod, string> = {
      [PaymentMethod.CREDIT_CARD]: 'CREDIT_CARD',
      [PaymentMethod.DEBIT_CARD]: 'CREDIT_CARD', // ASAAS treats debit as credit card
      [PaymentMethod.PIX]: 'PIX',
      [PaymentMethod.BOLETO]: 'BOLETO',
      [PaymentMethod.BANK_TRANSFER]: 'TRANSFER',
      [PaymentMethod.NUPAY]: 'PIX', // Map NUPAY to PIX
      [PaymentMethod.FREE]: 'UNDEFINED',
    };

    return mapping[method] || 'UNDEFINED';
  }

  /**
   * Map ASAAS payment status to internal PaymentStatus
   */
  mapAsaasStatusToPaymentStatus(asaasStatus: string): string {
    const statusMapping: Record<string, string> = {
      'PENDING': 'PENDING',
      'RECEIVED': 'COMPLETED',
      'CONFIRMED': 'COMPLETED',
      'OVERDUE': 'FAILED',
      'REFUNDED': 'REFUNDED',
      'RECEIVED_IN_CASH': 'COMPLETED',
      'REFUND_REQUESTED': 'PROCESSING',
      'CHARGEBACK_REQUESTED': 'PROCESSING',
      'CHARGEBACK_DISPUTE': 'PROCESSING',
      'AWAITING_CHARGEBACK_REVERSAL': 'PROCESSING',
      'DUNNING_REQUESTED': 'PROCESSING',
      'DUNNING_RECEIVED': 'COMPLETED',
      'AWAITING_RISK_ANALYSIS': 'PROCESSING',
      'APPROVED_BY_RISK_ANALYSIS': 'PENDING',
      'REPROVED_BY_RISK_ANALYSIS': 'FAILED',
    };

    return statusMapping[asaasStatus] || 'PENDING';
  }

  /**
   * Format date to YYYY-MM-DD format required by ASAAS
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Handle ASAAS API errors
   */
  private handleAsaasError(error: any, context: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const errorData = axiosError.response?.data as any;

      this.logger.error(`${context} - Status: ${axiosError.response?.status}`, {
        message: errorData?.errors || errorData?.message || axiosError.message,
        data: errorData,
      });

      if (axiosError.response?.status === 400) {
        throw new BadRequestException(
          errorData?.errors?.[0]?.description ||
          errorData?.message ||
          'Invalid payment request',
        );
      }

      if (axiosError.response?.status === 401) {
        throw new InternalServerErrorException('Payment gateway authentication failed');
      }

      if (axiosError.response?.status === 404) {
        throw new BadRequestException('Payment not found');
      }

      throw new InternalServerErrorException(
        errorData?.message || 'Payment gateway error',
      );
    }

    this.logger.error(`${context} - Unexpected error`, error);
    throw new InternalServerErrorException('Unexpected error processing payment');
  }

  /**
   * Request a refund for a payment in ASAAS
   * When refunding split payments, ASAAS automatically reverses the split proportionally
   */
  async refundPayment(paymentId: string, amount?: number, description?: string): Promise<any> {
    try {
      this.logger.log(`Requesting refund for payment: ${paymentId}, amount: ${amount || 'full'}`);

      const refundData: any = {
        description: description || 'Refund requested by customer',
      };

      // If partial refund, include the amount
      if (amount) {
        refundData.value = amount;
      }

      // Always use root account API key for refunds
      // ASAAS will automatically reverse split transfers proportionally
      const response = await this.axiosInstance.post(
        `/payments/${paymentId}/refund`,
        refundData,
      );

      this.logger.log(`Refund successful for payment ${paymentId}`, response.data);
      return response.data;
    } catch (error) {
      this.handleAsaasError(error, 'Refund payment');
    }
  }

  /**
   * Get refund status from ASAAS
   */
  async getRefundStatus(paymentId: string): Promise<any> {
    try {
      this.logger.log(`Getting refund status for payment: ${paymentId}`);

      const response = await this.axiosInstance.get(`/payments/${paymentId}`);

      return {
        id: response.data.id,
        status: response.data.status,
        refundedValue: response.data.refundedValue || 0,
      };
    } catch (error) {
      this.handleAsaasError(error, 'Get refund status');
    }
  }
}
