import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Prisma, OrderStatus, TicketInstanceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto, userId: string) {
    const { eventId, items, promoCode, ...buyerInfo } = createOrderDto;

    // Validate event exists and is active
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (event.status !== 'ACTIVE') {
      throw new BadRequestException('Event is not available for ticket purchase');
    }

    // Fetch event custom form fields
    const customFormFields = await this.prisma.customFormField.findMany({
      where: { eventId },
      orderBy: { displayOrder: 'asc' },
    });

    // Validate attendee information and custom form responses for each item
    for (const item of items) {
      // Validate attendees array length matches quantity
      if (!item.attendees || item.attendees.length !== item.quantity) {
        throw new BadRequestException(
          `Each ticket requires attendee information. Expected ${item.quantity} attendee(s), but received ${item.attendees?.length || 0}`,
        );
      }

      // Validate each attendee's form responses
      for (let i = 0; i < item.attendees.length; i++) {
        const attendee = item.attendees[i];
        const attendeeNumber = i + 1;

        // Validate all required custom fields are filled
        for (const field of customFormFields) {
          const value = attendee.formResponses[field.fieldName];

          // Check if required field is filled
          if (field.isRequired) {
            if (value === undefined || value === null || value === '') {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Required field "${field.fieldLabel}" must be filled`,
              );
            }

            // Special validation for CHECKBOX: must be true if required
            if (field.fieldType === 'CHECKBOX' && value !== true) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Required checkbox "${field.fieldLabel}" must be checked`,
              );
            }
          }

          // Validate EMAIL field format (whether required or optional)
          if (field.fieldType === 'EMAIL' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be a valid email address`,
              );
            }
          }

          // Validate PHONE field format (whether required or optional)
          if (field.fieldType === 'PHONE' && value) {
            // Basic phone validation - can be enhanced
            const phoneRegex = /^[\d\s\-\+\(\)]+$/;
            if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 10) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be a valid phone number`,
              );
            }
          }

          // Validate NUMBER field type (whether required or optional)
          if (field.fieldType === 'NUMBER' && value !== undefined && value !== null && value !== '') {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be a valid number`,
              );
            }

            // Check min/max if configured
            const config = field.configuration as any;
            if (config?.min !== undefined && numValue < config.min) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be at least ${config.min}`,
              );
            }
            if (config?.max !== undefined && numValue > config.max) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be at most ${config.max}`,
              );
            }
          }

          // Validate DATE field format (whether required or optional)
          if (field.fieldType === 'DATE' && value) {
            const dateValue = new Date(value);
            if (isNaN(dateValue.getTime())) {
              throw new BadRequestException(
                `Attendee ${attendeeNumber} for ticket: Field "${field.fieldLabel}" must be a valid date`,
              );
            }
          }
        }
      }
    }

    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Fetch all tickets and validate availability
    const uniqueTicketIds = [...new Set(items.map((item) => item.ticketId))];
    const tickets = await this.prisma.ticket.findMany({
      where: {
        id: { in: uniqueTicketIds },
        eventId,
      },
    });

    if (tickets.length !== uniqueTicketIds.length) {
      throw new BadRequestException('One or more tickets not found');
    }

    // Validate ticket availability and calculate pricing
    let subtotal = new Decimal(0);
    const orderItems: Array<{
      ticket: { connect: { id: string } };
      quantity: number;
      unitPrice: Decimal;
      totalPrice: Decimal;
      isHalfPrice: boolean;
      attendeesData: any; // Store attendee info for ticket creation after payment
    }> = [];

    for (const item of items) {
      const ticket = tickets.find((t) => t.id === item.ticketId);

      if (!ticket) {
        throw new BadRequestException(`Ticket ${item.ticketId} not found`);
      }

      // Check if ticket sales are active
      const now = new Date();
      if (now < ticket.salesStartsAt) {
        throw new BadRequestException(`Sales for ticket "${ticket.title}" have not started yet`);
      }
      if (now > ticket.salesEndsAt) {
        throw new BadRequestException(`Sales for ticket "${ticket.title}" have ended`);
      }

      // Check if ticket is visible
      if (!ticket.isVisible) {
        throw new BadRequestException(`Ticket "${ticket.title}" is not available`);
      }

      // Check quantity limits
      if (item.quantity < ticket.minQuantity) {
        throw new BadRequestException(
          `Minimum quantity for "${ticket.title}" is ${ticket.minQuantity}`,
        );
      }
      if (item.quantity > ticket.maxQuantity) {
        throw new BadRequestException(
          `Maximum quantity for "${ticket.title}" is ${ticket.maxQuantity}`,
        );
      }

      // Check availability
      const availableQuantity =
        ticket.quantity - ticket.quantitySold - ticket.quantityReserved;

      if (item.isHalfPrice) {
        if (!ticket.hasHalfPrice) {
          throw new BadRequestException(`Half-price tickets not available for "${ticket.title}"`);
        }
        const halfPriceAvailable =
          (ticket.halfPriceQuantity || 0) - ticket.halfPriceSold;
        if (item.quantity > halfPriceAvailable) {
          throw new BadRequestException(
            `Not enough half-price tickets available for "${ticket.title}". Available: ${halfPriceAvailable}`,
          );
        }
      } else {
        if (item.quantity > availableQuantity) {
          throw new BadRequestException(
            `Not enough tickets available for "${ticket.title}". Available: ${availableQuantity}`,
          );
        }
      }

      // Calculate pricing
      const unitPrice = item.isHalfPrice
        ? ticket.halfPrice || new Decimal(0)
        : ticket.price;
      const totalPrice = unitPrice.mul(item.quantity);

      // Store attendee data in OrderItem for ticket creation after payment
      orderItems.push({
        ticket: { connect: { id: ticket.id } },
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        isHalfPrice: item.isHalfPrice || false,
        attendeesData: item.attendees, // Store for later use after payment confirmation
      });

      subtotal = subtotal.add(totalPrice);
    }

    // Check event capacity if defined (done after ticket validations for better error messages)
    if (event.totalCapacity) {
      const totalTicketsSold = await this.prisma.ticketInstance.count({
        where: {
          orderItem: {
            order: {
              eventId,
              status: {
                in: ['CONFIRMED', 'COMPLETED'],
              },
            },
          },
        },
      });

      const totalTicketsReserved = await this.prisma.orderItem.aggregate({
        where: {
          order: {
            eventId,
            status: 'PENDING',
          },
        },
        _sum: {
          quantity: true,
        },
      });

      const totalRequestedTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      const currentOccupancy = totalTicketsSold + (totalTicketsReserved._sum.quantity || 0);
      const availableCapacity = event.totalCapacity - currentOccupancy;

      if (totalRequestedTickets > availableCapacity) {
        throw new BadRequestException(
          `Event capacity exceeded. Available capacity: ${availableCapacity}, Requested: ${totalRequestedTickets}`,
        );
      }
    }

    // Apply promo code if provided
    let discount = new Decimal(0);
    let promoCodeId: string | undefined;

    if (promoCode) {
      const promo = await this.prisma.promoCode.findFirst({
        where: {
          eventId,
          code: promoCode,
          isActive: true,
          validFrom: { lte: new Date() },
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
      });

      if (!promo) {
        throw new BadRequestException('Invalid or expired promo code');
      }

      // Check usage limits
      if (promo.maxUses && promo.currentUses >= promo.maxUses) {
        throw new BadRequestException('Promo code usage limit reached');
      }

      // Check minimum order value
      if (promo.minOrderValue && subtotal.lessThan(promo.minOrderValue)) {
        throw new BadRequestException(
          `Minimum order value for this promo code is ${promo.minOrderValue}`,
        );
      }

      // Calculate discount
      if (promo.discountType === 'PERCENTAGE') {
        discount = subtotal.mul(promo.discountValue).div(100);
        if (promo.maxDiscountAmount && discount.greaterThan(promo.maxDiscountAmount)) {
          discount = promo.maxDiscountAmount;
        }
      } else {
        discount = promo.discountValue;
      }

      promoCodeId = promo.id;
    }

    // Calculate fees
    const serviceFee = this.calculateServiceFee(subtotal, tickets, items);
    const platformFee = new Decimal(0); // Can be configured based on event settings

    // Calculate total
    const total = subtotal.add(serviceFee).add(platformFee).sub(discount);

    if (total.lessThan(0)) {
      throw new BadRequestException('Invalid order total');
    }

    // Determine order status based on total
    // Free orders (total = 0) should be CONFIRMED immediately
    const isFreeOrder = total.equals(0);
    const orderStatus = isFreeOrder ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

    // Set expiration time (15 minutes for pending orders, null for free orders)
    const expiresAt = isFreeOrder ? null : new Date();
    if (!isFreeOrder && expiresAt) {
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    }

    // Generate unique order number
    const orderNumber = await this.generateOrderNumber();

    // Create order in a transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // For free orders, increment quantitySold; for paid orders, increment quantityReserved
      for (const item of items) {
        const ticket = tickets.find((t) => t.id === item.ticketId);
        if (!ticket) continue;

        if (isFreeOrder) {
          // Free orders: increment sold immediately
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              quantitySold: {
                increment: item.quantity,
              },
            },
          });
        } else {
          // Paid orders: increment reserved (will be moved to sold after payment)
          await tx.ticket.update({
            where: { id: ticket.id },
            data: {
              quantityReserved: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      // Increment promo code usage if applicable
      if (promoCodeId) {
        await tx.promoCode.update({
          where: { id: promoCodeId },
          data: {
            currentUses: { increment: 1 },
          },
        });
      }

      // Create the order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          eventId,
          buyerId: userId,
          subtotal,
          discount,
          serviceFee,
          platformFee,
          total,
          status: orderStatus,
          promoCodeId,
          buyerName: buyerInfo.buyerName || user.name,
          buyerEmail: buyerInfo.buyerEmail || user.email,
          buyerPhone: buyerInfo.buyerPhone || user.phone,
          buyerCpf: buyerInfo.buyerCpf || user.cpf,
          expiresAt,
          notes: buyerInfo.notes,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              ticket: true,
              ticketInstances: true,
            },
          },
          event: true,
          promoCode: true,
        },
      });

      // For free orders, create ticket instances immediately
      if (isFreeOrder) {
        for (const orderItem of newOrder.items) {
          const attendeesData = (orderItem as any).attendeesData || [];

          for (const attendeeData of attendeesData) {
            await tx.ticketInstance.create({
              data: {
                orderItemId: orderItem.id,
                ticketId: orderItem.ticketId,
                attendeeName: attendeeData.attendeeName,
                attendeeEmail: attendeeData.attendeeEmail,
                attendeeCpf: attendeeData.attendeeCpf,
                attendeePhone: attendeeData.attendeePhone,
                formResponses: attendeeData.formResponses || {},
                isHalfPrice: orderItem.isHalfPrice,
              },
            });
          }
        }
      }

      return newOrder;
    });

    return order;
  }

  async findAll(
    userId: string,
    page = 1,
    limit = 10,
    filters?: { eventId?: string; status?: string },
  ) {
    const skip = (page - 1) * limit;

    // Build where clause with filters
    const where: any = { buyerId: userId };

    if (filters?.eventId) {
      where.eventId = filters.eventId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              image: true,
            },
          },
          items: {
            include: {
              ticket: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        event: true,
        items: {
          include: {
            ticket: true,
            ticketInstances: true,
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        promoCode: true,
        payment: true,
        refunds: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if user has permission to view this order
    if (order.buyerId !== userId && order.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
  }

  async update(id: string, updateOrderDto: UpdateOrderDto, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        event: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only the event organizer or admin can update orders
    if (order.event.organizerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this order');
    }

    // Extract and omit fields that shouldn't be passed to Prisma directly
    const { promoCode, ...updateData } = updateOrderDto;

    return this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            ticket: true,
          },
        },
        event: true,
      },
    });
  }

  async cancel(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        event: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check permission
    if (order.buyerId !== userId && order.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to cancel this order');
    }

    // Can only cancel pending, processing, or confirmed free orders
    const isFreeOrder = order.total.equals(0);
    const canCancel = ['PENDING', 'PROCESSING'].includes(order.status) ||
                      (order.status === 'CONFIRMED' && isFreeOrder);

    if (!canCancel) {
      throw new BadRequestException(
        isFreeOrder
          ? 'Free orders can only be cancelled if confirmed'
          : 'Only pending or processing orders can be cancelled'
      );
    }

    // Release tickets in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        // Free orders decrement sold, paid orders decrement reserved
        if (isFreeOrder) {
          await tx.ticket.update({
            where: { id: item.ticketId },
            data: {
              quantitySold: {
                decrement: item.quantity,
              },
            },
          });
        } else {
          await tx.ticket.update({
            where: { id: item.ticketId },
            data: {
              quantityReserved: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      // Decrement promo code usage if applicable
      if (order.promoCodeId) {
        await tx.promoCode.update({
          where: { id: order.promoCodeId },
          data: {
            currentUses: { decrement: 1 },
          },
        });
      }

      // Delete ticket instances for free orders (they were created immediately)
      if (isFreeOrder) {
        await tx.ticketInstance.deleteMany({
          where: {
            orderItem: {
              orderId: id,
            },
          },
        });
      }

      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });
    });

    return { message: 'Order cancelled successfully' };
  }

  async releaseExpiredOrders() {
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        expiresAt: {
          lte: new Date(),
        },
      },
      include: {
        items: true,
      },
    });

    for (const order of expiredOrders) {
      await this.prisma.$transaction(async (tx) => {
        // Release reserved tickets
        for (const item of order.items) {
          await tx.ticket.update({
            where: { id: item.ticketId },
            data: {
              quantityReserved: {
                decrement: item.quantity,
              },
            },
          });
        }

        // Decrement promo code usage if applicable
        if (order.promoCodeId) {
          await tx.promoCode.update({
            where: { id: order.promoCodeId },
            data: {
              currentUses: { decrement: 1 },
            },
          });
        }

        // Mark order as expired
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.EXPIRED,
          },
        });
      });
    }

    return {
      message: `Released ${expiredOrders.length} expired orders`,
      count: expiredOrders.length,
    };
  }

  private calculateServiceFee(
    subtotal: Decimal,
    tickets: any[],
    items: any[],
  ): Decimal {
    let serviceFee = new Decimal(0);

    for (const item of items) {
      const ticket = tickets.find((t) => t.id === item.ticketId);
      if (!ticket || ticket.absorbServiceFee) {
        continue;
      }

      const itemSubtotal = ticket.price.mul(item.quantity);
      const itemFee = itemSubtotal.mul(ticket.serviceFeePercentage).div(100);
      serviceFee = serviceFee.add(itemFee);
    }

    return serviceFee;
  }

  private async generateOrderNumber(): Promise<string> {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `ORD-${timestamp}-${random}`;

    // Check if order number already exists (very unlikely but good to check)
    const existing = await this.prisma.order.findUnique({
      where: { orderNumber },
    });

    if (existing) {
      // If by some chance it exists, recursively generate a new one
      return this.generateOrderNumber();
    }

    return orderNumber;
  }
}
