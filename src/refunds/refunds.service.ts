import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AsaasService } from '../payments/asaas.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ApproveRefundDto } from './dto/approve-refund.dto';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { RefundStatus, OrderStatus, PaymentStatus, UserRole, RefundType, RefundReason } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  // CDC (Brazilian Consumer Defense Code) - 7 days right
  private readonly CDC_DAYS = 7;

  constructor(
    private prisma: PrismaService,
    private asaasService: AsaasService,
  ) {}

  /**
   * Check if order is eligible for CDC 7-day automatic refund
   * CDC: Brazilian Consumer Defense Code (Código de Defesa do Consumidor)
   * Gives customers 7 days to change their mind after purchase
   */
  private checkCDCEligibility(orderCreatedAt: Date, eventStartsAt: Date): boolean {
    const now = new Date();
    const daysSincePurchase = Math.floor((now.getTime() - orderCreatedAt.getTime()) / (1000 * 60 * 60 * 24));
    const eventHasNotStarted = eventStartsAt > now;

    return daysSincePurchase <= this.CDC_DAYS && eventHasNotStarted;
  }

  /**
   * Check if refund is allowed based on event's refund policy
   */
  private checkEventRefundPolicy(event: any, orderCreatedAt: Date): {
    allowed: boolean;
    percentage: number;
    reason?: string;
  } {
    // If refunds are not allowed at all
    if (!event.refundAllowed) {
      return { allowed: false, percentage: 0, reason: 'Event does not allow refunds' };
    }

    // Check deadline if set
    if (event.refundDeadlineDays !== null) {
      const now = new Date();
      const daysUntilEvent = Math.floor((event.startsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilEvent < event.refundDeadlineDays) {
        return {
          allowed: false,
          percentage: 0,
          reason: `Refund deadline passed (must be ${event.refundDeadlineDays} days before event)`
        };
      }
    }

    // Event has passed
    if (new Date() > event.startsAt) {
      return { allowed: false, percentage: 0, reason: 'Event has already started' };
    }

    return { allowed: true, percentage: event.refundPercentage };
  }

  /**
   * Determine refund type and calculate amounts including platform fee
   * ULTRA SIMPLIFIED: Always refund 100% (ticket + service fee) in ALL cases
   */
  private async determineRefundType(
    order: any,
    event: any,
    requestedAmount: number,
  ): Promise<{
    refundType: RefundType;
    ticketAmount: number;
    platformFeeAmount: number;
    platformFeeRefunded: boolean;
    totalRefundAmount: number;
  }> {
    const serviceFee = Number(order.serviceFee || 0);

    // SIMPLIFIED: Always full refunds (no partial refunds, no proportional calculations)

    // 1. Check CDC eligibility (highest priority)
    // CDC refunds: Customer gets FULL refund (ticket + FULL platform fee)
    // Brazilian Consumer Defense Code guarantees full refund within 7 days
    if (this.checkCDCEligibility(order.createdAt, event.startsAt)) {
      return {
        refundType: RefundType.CDC_7_DAYS,
        ticketAmount: requestedAmount,
        platformFeeAmount: serviceFee,
        platformFeeRefunded: true,
        totalRefundAmount: requestedAmount + serviceFee,
      };
    }

    // 2. Check if event was cancelled
    // Event cancelled: Customer gets EVERYTHING back (ticket + FULL platform fee)
    if (event.status === 'CANCELLED') {
      return {
        refundType: RefundType.EVENT_CANCELLED,
        ticketAmount: requestedAmount,
        platformFeeAmount: serviceFee,
        platformFeeRefunded: true,
        totalRefundAmount: requestedAmount + serviceFee,
      };
    }

    // 3. Normal refund based on event policy
    // ULTRA SIMPLIFIED: Customer gets 100% refund (ticket + platform fee) in ALL cases
    const policyCheck = this.checkEventRefundPolicy(event, order.createdAt);

    if (!policyCheck.allowed) {
      throw new BadRequestException(policyCheck.reason);
    }

    // ULTRA SIMPLIFIED: Always 100% refund (ticket + service fee)
    return {
      refundType: RefundType.EVENT_POLICY,
      ticketAmount: requestedAmount,
      platformFeeAmount: serviceFee,
      platformFeeRefunded: true,
      totalRefundAmount: requestedAmount + serviceFee,
    };
  }

  async create(createRefundDto: CreateRefundDto, userId: string) {
    const { orderId, paymentId, ticketInstanceId, reason, notes } = createRefundDto;

    // Validate order exists and get event
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        buyer: true,
        refunds: true,
        event: true,
        items: {
          include: {
            ticketInstances: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if order is refundable
    if (order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('Order has already been fully refunded');
    }

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
      throw new BadRequestException('Cannot refund a cancelled or expired order');
    }

    // SIMPLIFIED: Only support full refunds
    // Always refund the full order subtotal (ticket amount without platform fee)
    const fullRefundAmount = Number(order.subtotal);

    // Validate ticket instance if provided (Sympla-style individual ticket refund)
    if (ticketInstanceId) {
      const ticketInstance = await this.prisma.ticketInstance.findUnique({
        where: { id: ticketInstanceId },
        include: { orderItem: true },
      });

      if (!ticketInstance) {
        throw new NotFoundException('Ticket instance not found');
      }

      // Verify ticket belongs to this order
      const belongsToOrder = order.items.some(item =>
        item.ticketInstances.some(ti => ti.id === ticketInstanceId)
      );

      if (!belongsToOrder) {
        throw new BadRequestException('Ticket instance does not belong to this order');
      }

      // Check if ticket is already refunded
      if (ticketInstance.status === 'REFUNDED') {
        throw new BadRequestException('Ticket has already been refunded');
      }

      // Check for duplicate refund request for same ticket
      const existingTicketRefund = order.refunds.find(
        r => r.ticketInstanceId === ticketInstanceId &&
        r.status !== RefundStatus.REJECTED &&
        r.status !== RefundStatus.CANCELLED
      );

      if (existingTicketRefund) {
        throw new BadRequestException('A refund request for this ticket already exists');
      }
    }

    // Check for duplicate full refund request
    const existingRefund = order.refunds.find(
      r => r.status === RefundStatus.PENDING ||
      r.status === RefundStatus.PROCESSING ||
      r.status === RefundStatus.COMPLETED
    );

    if (existingRefund) {
      throw new BadRequestException('A refund request for this order already exists');
    }

    // Auto-link to order's payment if paymentId is not provided
    let finalPaymentId = paymentId;
    if (!finalPaymentId && order.paymentId) {
      finalPaymentId = order.paymentId;
      this.logger.log(`Auto-linking refund to order's payment: ${finalPaymentId}`);
    }

    // Validate payment if paymentId is provided or auto-linked
    if (finalPaymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: finalPaymentId },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.orderId !== orderId) {
        throw new BadRequestException('Payment does not belong to this order');
      }

      if (payment.status !== PaymentStatus.COMPLETED) {
        throw new BadRequestException('Payment is not completed');
      }
    }

    // Determine refund type and calculate platform fee (always full refund)
    const refundCalculation = await this.determineRefundType(order, order.event, fullRefundAmount);

    this.logger.log(`Refund type determined: ${refundCalculation.refundType}`);
    this.logger.log(`Full ticket amount: ${refundCalculation.ticketAmount}, Platform fee: ${refundCalculation.platformFeeAmount}`);

    // Create refund request
    const refund = await this.prisma.refund.create({
      data: {
        orderId,
        paymentId: finalPaymentId,
        ticketInstanceId,
        amount: new Decimal(refundCalculation.ticketAmount),
        reason,
        notes,
        status: RefundStatus.PENDING,
        requestedBy: userId,
        refundType: refundCalculation.refundType,
        platformFeeRefunded: refundCalculation.platformFeeRefunded,
        platformFeeAmount: refundCalculation.platformFeeRefunded
          ? new Decimal(refundCalculation.platformFeeAmount)
          : null,
      },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });

    return refund;
  }

  async approve(id: string, approveRefundDto: ApproveRefundDto, approverId: string, approverRole: UserRole) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            refunds: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException('Refund is not pending approval');
    }

    // Check authorization: ORGANIZER can approve their own event refunds, ADMIN can approve all
    if (approverRole === UserRole.ORGANIZER) {
      if (refund.order.event.organizerId !== approverId) {
        throw new ForbiddenException('You can only approve refunds for your own events');
      }
    }

    // Update refund status to processing
    const updatedRefund = await this.prisma.refund.update({
      where: { id },
      data: {
        status: RefundStatus.PROCESSING,
        approvedBy: approverId,
        notes: approveRefundDto.notes || refund.notes,
        processedAt: new Date(),
      },
    });

    // Calculate total amount to refund (ticket + platform fee if applicable)
    const totalRefundAmount = Number(refund.amount) + (refund.platformFeeRefunded ? Number(refund.platformFeeAmount || 0) : 0);

    // Calculate total refunded including this one
    const totalRefunded = refund.order.refunds
      .filter(r => r.status === RefundStatus.COMPLETED || r.id === id)
      .reduce((sum, r) => {
        const ticketAmount = Number(r.amount);
        const feeAmount = r.platformFeeRefunded ? Number(r.platformFeeAmount || 0) : 0;
        return sum + ticketAmount + feeAmount;
      }, 0); // Don't add totalRefundAmount again - it's already counted via r.id === id

    // Update order status based on refund amount
    let newOrderStatus = refund.order.status;
    const orderTotalWithFees = Number(refund.order.total); // order.total already includes serviceFee

    if (totalRefunded >= orderTotalWithFees) {
      newOrderStatus = OrderStatus.REFUNDED;
    } else if (totalRefunded > 0) {
      newOrderStatus = OrderStatus.PARTIAL_REFUND;
    }

    await this.prisma.order.update({
      where: { id: refund.orderId },
      data: { status: newOrderStatus },
    });

    // Update ticket instance status if specific ticket was refunded
    if (refund.ticketInstanceId) {
      await this.prisma.ticketInstance.update({
        where: { id: refund.ticketInstanceId },
        data: { status: 'REFUNDED' },
      });
    }

    // Update payment status if payment exists
    if (refund.payment) {
      const paymentRefunds = await this.prisma.refund.findMany({
        where: {
          paymentId: refund.paymentId,
          status: { in: [RefundStatus.COMPLETED, RefundStatus.PROCESSING] },
        },
      });

      const totalPaymentRefunded = paymentRefunds.reduce(
        (sum, r) => {
          const ticketAmount = Number(r.amount);
          const feeAmount = r.platformFeeRefunded ? Number(r.platformFeeAmount || 0) : 0;
          return sum + ticketAmount + feeAmount;
        },
        0
      );

      let newPaymentStatus = refund.payment.status;
      if (totalPaymentRefunded >= Number(refund.payment.amount)) {
        newPaymentStatus = PaymentStatus.REFUNDED;
      } else if (totalPaymentRefunded > 0) {
        newPaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
      }

      await this.prisma.payment.update({
        where: { id: refund.paymentId || '' },
        data: { status: newPaymentStatus },
      });
    }

    // Process refund with ASAAS if payment has providerTransactionId
    if (refund.payment?.providerTransactionId) {
      try {
        this.logger.log(`Processing ASAAS refund for payment ${refund.payment.providerTransactionId}`);

        // Calculate total refund amount to send to ASAAS
        // Include both ticket amount + platform fee in the ASAAS refund request
        // ASAAS will automatically reverse the split transfers proportionally
        const ticketRefundAmount = Number(refund.amount);
        const platformFeeRefundAmount = refund.platformFeeRefunded ? Number(refund.platformFeeAmount || 0) : 0;
        const totalAsaasRefund = ticketRefundAmount + platformFeeRefundAmount;

        this.logger.log(`ASAAS refund details:`);
        this.logger.log(`  - Ticket refund: R$ ${ticketRefundAmount}`);
        this.logger.log(`  - Platform fee refund: R$ ${platformFeeRefundAmount}`);
        this.logger.log(`  - Total ASAAS refund: R$ ${totalAsaasRefund}`);
        this.logger.log(`  - ASAAS will auto-reverse split transfers proportionally`);

        // Send total refund amount to ASAAS (ticket + platform fee)
        // ASAAS will automatically debit from both root account (platform fee)
        // and organizer's wallet (ticket amount) based on original split
        await this.asaasService.refundPayment(
          refund.payment.providerTransactionId,
          totalAsaasRefund,
          `Refund: ${refund.reason} (Type: ${refund.refundType})`,
        );

        this.logger.log(`ASAAS refund successful for payment ${refund.payment.providerTransactionId}`);
      } catch (error) {
        this.logger.error(`Failed to process ASAAS refund:`, error);

        // Mark refund as rejected (failed to process with provider)
        await this.prisma.refund.update({
          where: { id },
          data: {
            status: RefundStatus.REJECTED,
            notes: `ASAAS refund failed: ${error.message}`,
          },
        });

        throw new BadRequestException(`Failed to process refund with payment provider: ${error.message}`);
      }
    }

    // Mark refund as completed
    const completedRefund = await this.prisma.refund.update({
      where: { id },
      data: {
        status: RefundStatus.COMPLETED,
      },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });

    return completedRefund;
  }

  async reject(id: string, rejectRefundDto: RejectRefundDto, rejectorId: string, rejectorRole: UserRole) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException('Refund is not pending approval');
    }

    // Check authorization: ORGANIZER can reject their own event refunds, ADMIN can reject all
    if (rejectorRole === UserRole.ORGANIZER) {
      if (refund.order.event.organizerId !== rejectorId) {
        throw new ForbiddenException('You can only reject refunds for your own events');
      }
    }

    const updatedRefund = await this.prisma.refund.update({
      where: { id },
      data: {
        status: RefundStatus.REJECTED,
        rejectionReason: rejectRefundDto.rejectionReason,
        approvedBy: rejectorId,
        processedAt: new Date(),
      },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });

    return updatedRefund;
  }

  async findAll(userId: string, userRole: UserRole) {
    let whereClause: any = {};

    if (userRole === UserRole.ADMIN) {
      // Admin sees all refunds
      whereClause = {};
    } else if (userRole === UserRole.ORGANIZER) {
      // Organizer sees refunds for their events
      whereClause = {
        order: {
          event: {
            organizerId: userId,
          },
        },
      };
    } else {
      // Attendee sees only their own refunds
      whereClause = {
        order: {
          buyerId: userId,
        },
      };
    }

    return this.prisma.refund.findMany({
      where: whereClause,
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    // Check access permissions
    if (userRole === UserRole.ADMIN) {
      // Admin can see all
      return refund;
    } else if (userRole === UserRole.ORGANIZER) {
      // Organizer can see refunds for their events
      if (refund.order.event.organizerId !== userId) {
        throw new ForbiddenException('You do not have access to this refund');
      }
    } else {
      // Attendee can only see their own
      if (refund.order.buyerId !== userId) {
        throw new ForbiddenException('You do not have access to this refund');
      }
    }

    return refund;
  }

  async findByOrder(orderId: string, userId: string, userRole: UserRole) {
    // Verify order access
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        event: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check access permissions
    if (userRole !== UserRole.ADMIN) {
      if (userRole === UserRole.ORGANIZER) {
        if (order.event.organizerId !== userId) {
          throw new ForbiddenException('You do not have access to this order');
        }
      } else {
        if (order.buyerId !== userId) {
          throw new ForbiddenException('You do not have access to this order');
        }
      }
    }

    return this.prisma.refund.findMany({
      where: { orderId },
      include: {
        payment: true,
        ticketInstance: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async cancel(id: string, userId: string, userRole: UserRole) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    // Only the requester or admin can cancel
    if (userRole !== UserRole.ADMIN && refund.requestedBy !== userId) {
      throw new ForbiddenException('You do not have permission to cancel this refund');
    }

    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending refund requests');
    }

    return this.prisma.refund.update({
      where: { id },
      data: {
        status: RefundStatus.CANCELLED,
        processedAt: new Date(),
      },
      include: {
        order: {
          include: {
            buyer: true,
            event: true,
          },
        },
        payment: true,
        ticketInstance: true,
      },
    });
  }

  /**
   * Create automatic refunds when event is cancelled
   * Called by EventsService when event status changes to CANCELLED
   */
  async createAutomaticRefundsForCancelledEvent(eventId: string): Promise<number> {
    this.logger.log(`Creating automatic refunds for cancelled event: ${eventId}`);

    // Get all confirmed orders for this event
    const orders = await this.prisma.order.findMany({
      where: {
        eventId,
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.COMPLETED, OrderStatus.PARTIAL_REFUND],
        },
      },
      include: {
        payment: true,
        refunds: true,
      },
    });

    let refundsCreated = 0;

    for (const order of orders) {
      // Calculate amount not yet refunded
      const totalRefunded = order.refunds
        .filter(r => r.status === RefundStatus.COMPLETED)
        .reduce((sum, r) => sum + Number(r.amount), 0);

      const remainingAmount = Number(order.total) - totalRefunded;

      if (remainingAmount <= 0) {
        continue; // Already fully refunded
      }

      // Calculate ticket amount (excluding platform fee)
      const serviceFee = Number(order.serviceFee || 0);
      const ticketAmount = remainingAmount - serviceFee;

      // Create automatic refund
      await this.prisma.refund.create({
        data: {
          orderId: order.id,
          paymentId: order.payment?.id,
          amount: new Decimal(ticketAmount),
          reason: RefundReason.EVENT_CANCELLED,
          notes: 'Automatic refund due to event cancellation',
          status: RefundStatus.PENDING, // Still needs approval
          refundType: RefundType.EVENT_CANCELLED,
          platformFeeRefunded: true, // Event cancellation refunds platform fee
          platformFeeAmount: new Decimal(serviceFee),
          requestedBy: order.buyerId, // On behalf of buyer
        },
      });

      refundsCreated++;
    }

    this.logger.log(`Created ${refundsCreated} automatic refund requests for event ${eventId}`);

    return refundsCreated;
  }
}
