import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { AsaasService } from './asaas.service';
import { EmailService } from '../email/email.service';
import { SecurityLoggerService, SecurityEventType } from '../common/services/security-logger.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AsaasWebhookDto } from './dto/asaas-webhook.dto';
import { PaymentMethod, PaymentStatus, OrderStatus, Prisma, TicketInstanceStatus, UserRole } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private asaasService: AsaasService,
    private configService: ConfigService,
    private emailService: EmailService,
    private securityLogger: SecurityLoggerService,
  ) {}

  /**
   * Create a new payment
   */
  async createPayment(createPaymentDto: CreatePaymentDto, userId: string) {
    const { orderId, amount, method, description, creditCardData, customerData, remoteIp } = createPaymentDto;

    try {
      // Validate user owns the order
      await this.validateOrderOwnership(orderId, userId);

      // Validate order exists and is in valid state
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          event: {
            include: {
              organizer: true, // Include organizer to get walletId and serviceFeePercentage
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      // Validate payment amount matches order total
      const orderTotal = Number(order.total);
      if (Math.abs(amount - orderTotal) > 0.01) { // Allow 0.01 difference for floating point precision
        throw new BadRequestException(
          `Payment amount (${amount}) does not match order total (${orderTotal})`
        );
      }

      if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.COMPLETED) {
        throw new BadRequestException('Order is already paid');
      }

      if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
        throw new BadRequestException('Order is cancelled or expired');
      }

      // Handle free tickets
      if (method === PaymentMethod.FREE) {
        return this.processFreePayment(order);
      }

      // Prepare customer data for ASAAS
      const asaasCustomerData = {
        name: customerData?.name || order.buyerName || order.buyer.name,
        email: customerData?.email || order.buyerEmail || order.buyer.email,
        cpfCnpj: customerData?.cpfCnpj || order.buyerCpf || order.buyer.cpf || '',
        phone: customerData?.phone || order.buyerPhone || order.buyer.phone || undefined,
        mobilePhone: customerData?.mobilePhone || order.buyerPhone || order.buyer.phone || undefined,
        postalCode: customerData?.postalCode,
        address: customerData?.address,
        addressNumber: customerData?.addressNumber,
        complement: customerData?.complement,
        province: customerData?.province,
        city: customerData?.city,
        state: customerData?.state,
      };

      if (!asaasCustomerData.cpfCnpj) {
        throw new BadRequestException('CPF/CNPJ is required for payment');
      }

      // Create or get customer in ASAAS
      const asaasCustomer = await this.asaasService.createOrGetCustomer(asaasCustomerData);

      // Calculate due date (today for credit card and PIX, +3 days for Boleto)
      const dueDate = new Date();
      if (method === PaymentMethod.BOLETO) {
        dueDate.setDate(dueDate.getDate() + 3);
      }

      // Prepare credit card data if needed
      let creditCardPaymentData;
      if (method === PaymentMethod.CREDIT_CARD && creditCardData) {
        creditCardPaymentData = {
          creditCard: creditCardData,
          creditCardHolderInfo: {
            name: asaasCustomerData.name,
            email: asaasCustomerData.email,
            cpfCnpj: asaasCustomerData.cpfCnpj,
            postalCode: asaasCustomerData.postalCode || '00000000',
            addressNumber: asaasCustomerData.addressNumber || 'S/N',
            phone: asaasCustomerData.phone || asaasCustomerData.mobilePhone || '0000000000',
          },
          remoteIp, // Add remote IP for fraud prevention
        };
      }

      // Get organizer's wallet ID and service fee percentage for payment split
      const organizerWalletId = order.event.organizer?.asaasWalletId ?? undefined;
      // TypeScript has trouble inferring serviceFeePercentage type, so we cast it
      const serviceFeePercentage = Number((order.event as any).serviceFeePercentage || 3.0);

      if (!organizerWalletId) {
        this.logger.warn(`Event organizer does not have an ASAAS wallet ID. Payment will go to root account.`);
      }

      this.logger.log(`Service fee for event "${order.event.title}": ${serviceFeePercentage}%`);
      this.logger.log(`  - Raw serviceFeePercentage from DB: ${(order.event as any).serviceFeePercentage}`);
      this.logger.log(`  - Organizer wallet ID: ${organizerWalletId}`);

      // Create payment in ASAAS
      const asaasPayment = await this.asaasService.createPayment(
        asaasCustomer.id,
        amount,
        method,
        dueDate,
        description || `Ingresso - ${order.event.title}`,
        orderId,
        creditCardPaymentData,
        remoteIp, // Pass remote IP
        organizerWalletId, // Pass organizer wallet ID for split
        serviceFeePercentage, // Pass service fee percentage
        createPaymentDto.installmentCount, // Pass installment count
        createPaymentDto.installmentValue, // Pass installment value
      );

      // Create payment record in database
      const paymentData: Prisma.PaymentCreateInput = {
        order: { connect: { id: orderId } },
        amount: new Prisma.Decimal(amount),
        method,
        status: this.mapAsaasStatusToPaymentStatus(asaasPayment.status) as PaymentStatus,
        providerName: 'ASAAS',
        providerTransactionId: asaasPayment.id,
        providerResponse: asaasPayment as any,
        description: description || `Ingresso - ${order.event.title}`,
      };

      // Get PIX data if payment method is PIX
      if (method === PaymentMethod.PIX) {
        try {
          const pixQrCode = await this.asaasService.getPixQrCode(asaasPayment.id);
          paymentData.pixCode = pixQrCode.payload;
          paymentData.pixQrCode = pixQrCode.encodedImage;
          paymentData.pixExpiresAt = new Date(pixQrCode.expirationDate);
        } catch (error) {
          this.logger.error('Error getting PIX QR Code', error);
        }
      }

      // Get Boleto data if payment method is BOLETO
      if (method === PaymentMethod.BOLETO && asaasPayment.bankSlipUrl) {
        paymentData.boletoUrl = asaasPayment.bankSlipUrl;
        paymentData.boletoExpiresAt = new Date(asaasPayment.dueDate);
        // ASAAS doesn't provide a separate barcode field in the initial response
        // It's embedded in the PDF. We'll store the payment ID as reference
        paymentData.boletoCode = asaasPayment.id;
      }

      const payment = await this.prisma.payment.create({
        data: paymentData,
        include: {
          order: {
            include: {
              event: true,
              buyer: true,
            },
          },
        },
      });

      // Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PROCESSING,
          paymentId: payment.id,
          paymentMethod: method,
        },
      });

      this.logger.log(`Payment created successfully: ${payment.id} for order ${orderId}`);

      return payment;
    } catch (error) {
      this.logger.error('Error creating payment', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create payment');
    }
  }

  /**
   * Process free payment (no payment gateway needed)
   */
  private async processFreePayment(order: any) {
    try {
      const payment = await this.prisma.payment.create({
        data: {
          order: { connect: { id: order.id } },
          amount: new Prisma.Decimal(0),
          method: PaymentMethod.FREE,
          status: PaymentStatus.COMPLETED,
          providerName: 'INTERNAL',
          description: `Ingresso gratuito - ${order.event.title}`,
          processedAt: new Date(),
        },
        include: {
          order: {
            include: {
              event: true,
              buyer: true,
              items: {
                include: {
                  ticket: true,
                },
              },
            },
          },
        },
      });

      // Update order status to confirmed
      await this.updateOrderStatus(order.id, OrderStatus.CONFIRMED);

      // Generate ticket instances
      await this.generateTicketInstances(order);

      this.logger.log(`Free payment processed successfully for order ${order.id}`);

      return payment;
    } catch (error) {
      this.logger.error('Error processing free payment', error);
      throw new InternalServerErrorException('Failed to process free payment');
    }
  }

  /**
   * Get payment by ID
   */
  async findOne(id: string, userId: string, userRole: UserRole) {
    // Validate ownership
    await this.validatePaymentOwnership(id, userId, userRole);

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            event: true,
            buyer: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return payment;
  }

  /**
   * Get payment by order ID
   */
  async findByOrderId(orderId: string, userId: string, userRole: UserRole) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            event: true,
            buyer: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    // Validate ownership
    await this.validatePaymentOwnership(payment.id, userId, userRole);

    return payment;
  }

  /**
   * Process ASAAS webhook
   */
  async processWebhook(webhookData: AsaasWebhookDto) {
    try {
      this.logger.log(`Processing webhook: ${webhookData.event} for payment ${webhookData.payment.id}`);

      // For installment payments, ASAAS sends webhooks for each installment
      // We need to find the parent payment using externalReference (order ID)
      let payment;

      if (webhookData.payment.installment && webhookData.payment.externalReference) {
        // This is an installment payment - find by externalReference (order ID)
        this.logger.log(`Installment payment webhook (${webhookData.payment.installmentNumber} of installment group ${webhookData.payment.installment})`);
        this.logger.log(`Looking up payment by externalReference: ${webhookData.payment.externalReference}`);

        const order = await this.prisma.order.findUnique({
          where: { id: webhookData.payment.externalReference },
          include: {
            payment: {
              include: {
                order: {
                  include: {
                    event: true,
                    buyer: true,
                    items: {
                      include: {
                        ticket: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        payment = order?.payment;
      } else {
        // Regular payment - find by provider transaction ID
        payment = await this.prisma.payment.findUnique({
          where: { providerTransactionId: webhookData.payment.id },
          include: {
            order: {
              include: {
                event: true,
                buyer: true,
                items: {
                  include: {
                    ticket: true,
                  },
                },
              },
            },
          },
        });
      }

      if (!payment) {
        this.logger.warn(`Payment not found for webhook: ${webhookData.payment.id}`);
        return { success: false, message: 'Payment not found' };
      }

      // Map ASAAS status to our PaymentStatus
      const newStatus = this.mapAsaasStatusToPaymentStatus(webhookData.payment.status);

      // Update payment
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus as PaymentStatus,
          providerResponse: webhookData.payment as any,
          processedAt: webhookData.payment.confirmedDate
            ? new Date(webhookData.payment.confirmedDate)
            : undefined,
        },
      });

      // Handle different webhook events
      switch (webhookData.event) {
        case 'PAYMENT_RECEIVED':
        case 'PAYMENT_CONFIRMED':
          // Handle payment confirmation
          // For installment payments, only process on the first installment
          // to avoid generating duplicate tickets
          if (webhookData.payment.installment && webhookData.payment.installmentNumber) {
            if (webhookData.payment.installmentNumber === 1) {
              this.logger.log(`First installment confirmed - generating tickets for order ${payment.order.id}`);
              await this.handlePaymentConfirmation(payment.order);
            } else {
              this.logger.log(`Installment ${webhookData.payment.installmentNumber} confirmed - tickets already generated, skipping`);
            }
          } else {
            // Regular payment - process normally
            await this.handlePaymentConfirmation(payment.order);
          }
          break;

        case 'PAYMENT_OVERDUE':
          // Handle payment overdue
          if (payment.status !== PaymentStatus.FAILED) {
            this.logger.warn(`Payment ${payment.id} is overdue`);
            await this.handlePaymentFailure(payment.order);
          }
          break;

        case 'PAYMENT_REFUNDED':
          // Handle refund
          this.logger.log(`Payment ${payment.id} was refunded`);
          // Refund handling is done via the refunds module
          break;

        case 'PAYMENT_CHARGEBACK_REQUESTED':
        case 'PAYMENT_CHARGEBACK_DISPUTE':
        case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL':
          // Handle chargeback events
          this.logger.warn(`Chargeback event for payment ${payment.id}: ${webhookData.event}`);
          // TODO: Notify organizer about chargeback
          break;

        case 'PAYMENT_AWAITING_RISK_ANALYSIS':
          this.logger.log(`Payment ${payment.id} awaiting risk analysis`);
          // Payment is in processing status
          break;

        case 'PAYMENT_APPROVED_BY_RISK_ANALYSIS':
          this.logger.log(`Payment ${payment.id} approved by risk analysis`);
          // Continue normal flow
          break;

        case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
          this.logger.warn(`Payment ${payment.id} reproved by risk analysis`);
          if (payment.status !== PaymentStatus.FAILED) {
            await this.handlePaymentFailure(payment.order);
          }
          break;

        case 'PAYMENT_AUTHORIZED':
          this.logger.log(`Payment ${payment.id} authorized (credit card)`);
          // Credit card authorized, waiting for confirmation
          break;

        case 'PAYMENT_ANTICIPATED':
          this.logger.log(`Payment ${payment.id} was anticipated`);
          // Payment was advanced to organizer
          break;

        default:
          this.logger.log(`Unhandled webhook event: ${webhookData.event}`);
      }

      this.logger.log(`Webhook processed successfully for payment ${payment.id}`);

      return { success: true, payment: updatedPayment, event: webhookData.event };
    } catch (error) {
      this.logger.error('Error processing webhook', error);
      throw new InternalServerErrorException('Failed to process webhook');
    }
  }

  /**
   * Handle payment confirmation
   */
  private async handlePaymentConfirmation(order: any) {
    try {
      this.logger.log(`Confirming payment for order ${order.id}`);

      // Update order status
      await this.updateOrderStatus(order.id, OrderStatus.CONFIRMED);

      // Generate ticket instances if not already generated
      const existingInstances = await this.prisma.ticketInstance.count({
        where: {
          orderItem: {
            orderId: order.id,
          },
        },
      });

      if (existingInstances === 0) {
        await this.generateTicketInstances(order);
      }

      this.logger.log(`Payment confirmed for order ${order.id}`);

      // Send payment confirmation email with tickets (async, non-blocking)
      try {
        const orderWithDetails = await this.prisma.order.findUnique({
          where: { id: order.id },
          include: {
            buyer: true,
            event: true,
            items: {
              include: {
                ticket: true,
              },
            },
          },
        });

        // Fetch ticket instances
        const ticketInstances = await this.prisma.ticketInstance.findMany({
          where: {
            orderItem: {
              orderId: order.id,
            },
          },
          include: {
            ticket: true,
          },
        });

        if (orderWithDetails) {
          try {
            // Attempt to send email
            await this.emailService.sendTicketConfirmationEmail(
              orderWithDetails.buyer,
              orderWithDetails as any,
              ticketInstances
            );

            // Update order to mark email as sent successfully
            await this.prisma.order.update({
              where: { id: order.id },
              data: {
                ticketEmailSent: true,
                ticketEmailSentAt: new Date(),
                ticketEmailError: null,
              },
            });

            this.logger.log(`Ticket confirmation email sent to ${orderWithDetails.buyer.email}`);
          } catch (emailError) {
            // Update order with error information
            await this.prisma.order.update({
              where: { id: order.id },
              data: {
                ticketEmailSent: false,
                ticketEmailError: emailError.message || 'Unknown email error',
              },
            });

            this.logger.error(`Failed to send ticket confirmation email: ${emailError.message}`);
            // Don't throw - email failure shouldn't block payment confirmation
          }
        }
      } catch (error) {
        this.logger.error(`Error in email confirmation process: ${error.message}`);
        // Don't throw - email failure shouldn't block payment confirmation
      }
    } catch (error) {
      this.logger.error(`Error confirming payment for order ${order.id}`, error);
      throw error;
    }
  }

  /**
   * Handle payment failure
   */
  private async handlePaymentFailure(order: any) {
    try {
      this.logger.log(`Handling payment failure for order ${order.id}`);

      // Update order status
      await this.updateOrderStatus(order.id, OrderStatus.CANCELLED);

      // Release reserved tickets
      for (const item of order.items) {
        await this.prisma.ticket.update({
          where: { id: item.ticketId },
          data: {
            quantityReserved: {
              decrement: item.quantity,
            },
          },
        });
      }

      this.logger.log(`Payment failure handled for order ${order.id}`);
    } catch (error) {
      this.logger.error(`Error handling payment failure for order ${order.id}`, error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  private async updateOrderStatus(orderId: string, status: OrderStatus) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        paidAt: status === OrderStatus.CONFIRMED ? new Date() : undefined,
      },
    });
  }

  /**
   * Generate ticket instances for an order
   */
  private async generateTicketInstances(order: any) {
    try {
      this.logger.log(`Generating ticket instances for order ${order.id}`);

      for (const item of order.items) {
        // Get attendee data stored during order creation
        const attendeesData = item.attendeesData || [];

        // If attendee data exists (new flow with custom forms), use it
        if (Array.isArray(attendeesData) && attendeesData.length > 0) {
          const instances = attendeesData.map((attendee: any) => ({
            orderItemId: item.id,
            ticketId: item.ticketId,
            attendeeName: attendee.attendeeName,
            attendeeEmail: attendee.attendeeEmail,
            attendeeCpf: attendee.attendeeCpf,
            attendeePhone: attendee.attendeePhone,
            formResponses: attendee.formResponses || {},
            status: TicketInstanceStatus.ACTIVE,
            isHalfPrice: item.isHalfPrice,
          }));

          // Create instances one by one to allow QR code generation
          for (const instance of instances) {
            await this.prisma.ticketInstance.create({
              data: instance,
            });
          }
        } else {
          // Old flow - create instances without attendee data
          const instances: Array<{
            orderItemId: string;
            ticketId: string;
            status: TicketInstanceStatus;
            isHalfPrice: boolean;
          }> = [];

          for (let i = 0; i < item.quantity; i++) {
            instances.push({
              orderItemId: item.id,
              ticketId: item.ticketId,
              status: TicketInstanceStatus.ACTIVE,
              isHalfPrice: item.isHalfPrice,
            });
          }

          await this.prisma.ticketInstance.createMany({
            data: instances,
          });
        }

        // Update ticket sold count
        await this.prisma.ticket.update({
          where: { id: item.ticketId },
          data: {
            quantitySold: {
              increment: item.quantity,
            },
            quantityReserved: {
              decrement: item.quantity,
            },
          },
        });

        // Update half-price sold count if applicable
        if (item.isHalfPrice) {
          await this.prisma.ticket.update({
            where: { id: item.ticketId },
            data: {
              halfPriceSold: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      this.logger.log(`Ticket instances generated for order ${order.id}`);

      // Send order confirmation email with ticket instances
      try {
        const orderWithDetails = await this.prisma.order.findUnique({
          where: { id: order.id },
          include: {
            event: true,
            buyer: true,
            items: {
              include: {
                ticket: true,
              },
            },
          },
        });

        // Note: Email sending is now handled in handlePaymentConfirmation method
        // to avoid duplicate emails. This section previously sent confirmation emails
        // but has been removed to centralize email sending.
      } catch (emailError) {
        this.logger.error(`Failed to send confirmation email for order ${order.id}:`, emailError);
        // Don't fail the ticket generation if email fails
      }
    } catch (error) {
      this.logger.error(`Error generating ticket instances for order ${order.id}`, error);
      throw error;
    }
  }

  /**
   * Map ASAAS status to PaymentStatus
   */
  private mapAsaasStatusToPaymentStatus(asaasStatus: string): string {
    return this.asaasService.mapAsaasStatusToPaymentStatus(asaasStatus);
  }

  /**
   * Cancel a payment
   */
  async cancelPayment(id: string, userId: string, userRole: UserRole) {
    try {
      // Validate ownership
      await this.validatePaymentOwnership(id, userId, userRole);

      const payment = await this.prisma.payment.findUnique({
        where: { id },
        include: {
          order: {
            include: {
              event: true,
              buyer: true,
            },
          },
        },
      });

      if (!payment) {
        throw new NotFoundException(`Payment ${id} not found`);
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed payment');
      }

      if (payment.status === PaymentStatus.CANCELLED) {
        throw new BadRequestException('Payment is already cancelled');
      }

      // Cancel in ASAAS if it exists
      if (payment.providerTransactionId) {
        await this.asaasService.cancelPayment(payment.providerTransactionId);
      }

      // Update payment status
      const updatedPayment = await this.prisma.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.CANCELLED,
        },
      });

      // Update order status
      await this.updateOrderStatus(payment.orderId, OrderStatus.CANCELLED);

      this.logger.log(`Payment cancelled: ${id}`);

      return updatedPayment;
    } catch (error) {
      this.logger.error('Error cancelling payment', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to cancel payment');
    }
  }

  /**
   * Sync payment status with ASAAS
   */
  async syncPaymentStatus(id: string, userId: string, userRole: UserRole) {
    try {
      // Validate ownership - only owner or admin can sync
      await this.validatePaymentOwnership(id, userId, userRole);

      const payment = await this.prisma.payment.findUnique({
        where: { id },
        include: {
          order: {
            include: {
              event: true,
              buyer: true,
              items: {
                include: {
                  ticket: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new NotFoundException(`Payment ${id} not found`);
      }

      if (!payment.providerTransactionId) {
        throw new BadRequestException('Payment has no provider transaction ID');
      }

      // Get payment details from ASAAS
      const asaasPayment = await this.asaasService.getPayment(payment.providerTransactionId);

      // Update payment status
      const newStatus = this.mapAsaasStatusToPaymentStatus(asaasPayment.status);

      const updatedPayment = await this.prisma.payment.update({
        where: { id },
        data: {
          status: newStatus as PaymentStatus,
          providerResponse: asaasPayment as any,
        },
      });

      // Handle payment confirmation if status changed to completed
      if (
        newStatus === 'COMPLETED' &&
        payment.status !== PaymentStatus.COMPLETED
      ) {
        await this.handlePaymentConfirmation(payment.order);
      }

      this.logger.log(`Payment status synced: ${id} - New status: ${newStatus}`);

      // Return the updated payment with relations
      return this.prisma.payment.findUnique({
        where: { id },
        include: {
          order: {
            include: {
              event: true,
              buyer: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error('Error syncing payment status', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to sync payment status');
    }
  }

  /**
   * Validate webhook signature from ASAAS
   */
  async validateWebhookSignature(accessToken: string, ipAddress?: string): Promise<boolean> {
    const webhookToken = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN');

    // SECURITY: Fail securely if webhook token is not configured
    if (!webhookToken) {
      this.logger.error('SECURITY ERROR: ASAAS_WEBHOOK_TOKEN not configured. Rejecting webhook for security.');
      await this.securityLogger.logWebhookValidationFailure(ipAddress || 'unknown', {
        reason: 'Webhook token not configured',
        severity: 'CRITICAL',
      });
      return false;
    }

    // Validate the token
    if (!accessToken || accessToken !== webhookToken) {
      this.logger.error('Invalid webhook signature attempt');
      await this.securityLogger.logWebhookValidationFailure(ipAddress || 'unknown', {
        reason: 'Invalid webhook token',
        providedToken: accessToken ? 'present-but-invalid' : 'missing',
        severity: 'CRITICAL',
      });
      return false;
    }

    return true;
  }

  /**
   * Validate if user has access to a payment
   * Returns true if user is the buyer, event organizer, or admin
   */
  private async validatePaymentOwnership(paymentId: string, userId: string, userRole: UserRole): Promise<void> {
    // Admins have access to all payments
    if (userRole === UserRole.ADMIN) {
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Check if user is the buyer
    if (payment.order.buyerId === userId) {
      return;
    }

    // Check if user is the event organizer
    if (payment.order.event.organizerId === userId) {
      return;
    }

    // User doesn't have access
    throw new ForbiddenException('You do not have access to this payment');
  }

  /**
   * Validate if user owns the order
   */
  private async validateOrderOwnership(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('You do not own this order');
    }
  }
}
