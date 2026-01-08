import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { ValidatePromoCodeDto } from './dto/validate-promo-code.dto';
import { UserRole, DiscountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PromoCodesService {
  constructor(private prisma: PrismaService) {}

  async create(createPromoCodeDto: CreatePromoCodeDto, userId: string, userRole: UserRole) {
    const {
      eventId,
      code,
      description,
      discountType,
      discountValue,
      maxUses,
      usesPerUser,
      validFrom,
      validUntil,
      isActive,
      minOrderValue,
      maxDiscountAmount,
      applicableTickets,
    } = createPromoCodeDto;

    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check if user has permission to create promo codes for this event
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to create promo codes for this event');
    }

    // Validate discount value
    if (discountType === DiscountType.PERCENTAGE && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }

    if (discountValue <= 0) {
      throw new BadRequestException('Discount value must be greater than 0');
    }

    // Check for duplicate code in the same event
    const existingCode = await this.prisma.promoCode.findUnique({
      where: {
        eventId_code: {
          eventId,
          code: code.toUpperCase(),
        },
      },
    });

    if (existingCode) {
      throw new BadRequestException('A promo code with this code already exists for this event');
    }

    // Validate dates
    const validFromDate = new Date(validFrom);
    const validUntilDate = validUntil ? new Date(validUntil) : null;

    if (validUntilDate && validUntilDate <= validFromDate) {
      throw new BadRequestException('Valid until date must be after valid from date');
    }

    // Validate applicable tickets if provided
    if (applicableTickets && applicableTickets.length > 0) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          id: { in: applicableTickets },
          eventId,
        },
      });

      if (tickets.length !== applicableTickets.length) {
        throw new BadRequestException('Some ticket IDs are invalid or do not belong to this event');
      }
    }

    return this.prisma.promoCode.create({
      data: {
        eventId,
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: new Decimal(discountValue),
        maxUses,
        usesPerUser: usesPerUser ?? 1,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        isActive: isActive ?? true,
        minOrderValue: minOrderValue ? new Decimal(minOrderValue) : null,
        maxDiscountAmount: maxDiscountAmount ? new Decimal(maxDiscountAmount) : null,
        applicableTickets: applicableTickets ? JSON.stringify(applicableTickets) : null,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async findAll(eventId?: string, userId?: string, userRole?: UserRole) {
    let whereClause: any = {};

    // If eventId is provided, filter by event
    if (eventId) {
      whereClause.eventId = eventId;

      // If not admin, verify user has access to this event
      if (userRole !== UserRole.ADMIN && userId) {
        const event = await this.prisma.event.findUnique({
          where: { id: eventId },
        });

        if (event && event.organizerId !== userId) {
          throw new ForbiddenException('You do not have permission to view promo codes for this event');
        }
      }
    } else if (userRole !== UserRole.ADMIN && userId) {
      // If no eventId and not admin, only show promo codes for user's events
      whereClause.event = {
        organizerId: userId,
      };
    }

    return this.prisma.promoCode.findMany({
      where: whereClause,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            organizerId: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByEvent(eventId: string, userId: string, userRole: UserRole) {
    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to view promo codes for this event');
    }

    return this.prisma.promoCode.findMany({
      where: { eventId },
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            organizerId: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && promoCode.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to view this promo code');
    }

    return promoCode;
  }

  async update(
    id: string,
    updatePromoCodeDto: UpdatePromoCodeDto,
    userId: string,
    userRole: UserRole,
  ) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        event: true,
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && promoCode.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this promo code');
    }

    // Validate discount value if being updated
    if (updatePromoCodeDto.discountValue !== undefined) {
      if (updatePromoCodeDto.discountValue <= 0) {
        throw new BadRequestException('Discount value must be greater than 0');
      }

      const finalDiscountType = updatePromoCodeDto.discountType || promoCode.discountType;
      if (finalDiscountType === DiscountType.PERCENTAGE && updatePromoCodeDto.discountValue > 100) {
        throw new BadRequestException('Percentage discount cannot exceed 100%');
      }
    }

    // Validate dates if being updated
    if (updatePromoCodeDto.validFrom || updatePromoCodeDto.validUntil) {
      const validFromDate = updatePromoCodeDto.validFrom
        ? new Date(updatePromoCodeDto.validFrom)
        : promoCode.validFrom;
      const validUntilDate = updatePromoCodeDto.validUntil
        ? new Date(updatePromoCodeDto.validUntil)
        : promoCode.validUntil;

      if (validUntilDate && validUntilDate <= validFromDate) {
        throw new BadRequestException('Valid until date must be after valid from date');
      }
    }

    // Validate applicable tickets if being updated
    if (updatePromoCodeDto.applicableTickets && updatePromoCodeDto.applicableTickets.length > 0) {
      const tickets = await this.prisma.ticket.findMany({
        where: {
          id: { in: updatePromoCodeDto.applicableTickets },
          eventId: promoCode.eventId,
        },
      });

      if (tickets.length !== updatePromoCodeDto.applicableTickets.length) {
        throw new BadRequestException('Some ticket IDs are invalid or do not belong to this event');
      }
    }

    const updateData: any = { ...updatePromoCodeDto };

    // Convert numeric fields to Decimal
    if (updateData.discountValue !== undefined) {
      updateData.discountValue = new Decimal(updateData.discountValue);
    }
    if (updateData.minOrderValue !== undefined) {
      updateData.minOrderValue = updateData.minOrderValue ? new Decimal(updateData.minOrderValue) : null;
    }
    if (updateData.maxDiscountAmount !== undefined) {
      updateData.maxDiscountAmount = updateData.maxDiscountAmount ? new Decimal(updateData.maxDiscountAmount) : null;
    }

    // Convert dates
    if (updateData.validFrom) {
      updateData.validFrom = new Date(updateData.validFrom);
    }
    if (updateData.validUntil) {
      updateData.validUntil = new Date(updateData.validUntil);
    }

    // Convert applicable tickets to JSON
    if (updateData.applicableTickets !== undefined) {
      updateData.applicableTickets = updateData.applicableTickets
        ? JSON.stringify(updateData.applicableTickets)
        : null;
    }

    return this.prisma.promoCode.update({
      where: { id },
      data: updateData,
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        event: true,
        orders: true,
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && promoCode.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this promo code');
    }

    // Check if promo code has been used
    if (promoCode.orders.length > 0) {
      throw new BadRequestException(
        'Cannot delete promo code that has been used. Consider deactivating it instead.'
      );
    }

    return this.prisma.promoCode.delete({
      where: { id },
    });
  }

  async validate(validatePromoCodeDto: ValidatePromoCodeDto) {
    const { code, eventId, orderValue, userId, ticketIds } = validatePromoCodeDto;

    const promoCode = await this.prisma.promoCode.findUnique({
      where: {
        eventId_code: {
          eventId,
          code: code.toUpperCase(),
        },
      },
      include: {
        orders: userId ? {
          where: {
            buyerId: userId,
          },
        } : false,
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    // Check if promo code is active
    if (!promoCode.isActive) {
      throw new BadRequestException('This promo code is not active');
    }

    // Check validity dates
    const now = new Date();
    if (promoCode.validFrom > now) {
      throw new BadRequestException('This promo code is not yet valid');
    }
    if (promoCode.validUntil && promoCode.validUntil < now) {
      throw new BadRequestException('This promo code has expired');
    }

    // Check max uses
    if (promoCode.maxUses && promoCode.currentUses >= promoCode.maxUses) {
      throw new BadRequestException('This promo code has reached its usage limit');
    }

    // Check uses per user
    if (userId && Array.isArray(promoCode.orders)) {
      const userUses = promoCode.orders.length;
      if (userUses >= promoCode.usesPerUser) {
        throw new BadRequestException('You have already used this promo code the maximum number of times');
      }
    }

    // Check minimum order value
    if (promoCode.minOrderValue && orderValue < Number(promoCode.minOrderValue)) {
      throw new BadRequestException(
        `Minimum order value for this promo code is ${promoCode.minOrderValue}`
      );
    }

    // Check applicable tickets
    if (promoCode.applicableTickets && ticketIds) {
      const applicableTicketIds = JSON.parse(promoCode.applicableTickets);
      const requestedTicketIds = ticketIds.split(',');

      const hasApplicableTicket = requestedTicketIds.some(ticketId =>
        applicableTicketIds.includes(ticketId)
      );

      if (!hasApplicableTicket) {
        throw new BadRequestException('This promo code is not applicable to the selected tickets');
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (promoCode.discountType === DiscountType.PERCENTAGE) {
      discountAmount = (orderValue * Number(promoCode.discountValue)) / 100;

      // Apply max discount cap if set
      if (promoCode.maxDiscountAmount && discountAmount > Number(promoCode.maxDiscountAmount)) {
        discountAmount = Number(promoCode.maxDiscountAmount);
      }
    } else {
      discountAmount = Number(promoCode.discountValue);

      // Ensure discount doesn't exceed order value
      if (discountAmount > orderValue) {
        discountAmount = orderValue;
      }
    }

    return {
      valid: true,
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        description: promoCode.description,
        discountType: promoCode.discountType,
        discountValue: Number(promoCode.discountValue),
      },
      discountAmount,
      finalAmount: orderValue - discountAmount,
    };
  }

  async incrementUsage(id: string) {
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        currentUses: {
          increment: 1,
        },
      },
    });
  }

  async getUsageStats(id: string, userId: string, userRole: UserRole) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        event: true,
        orders: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            discount: true,
            status: true,
            createdAt: true,
            buyer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo code not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && promoCode.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to view stats for this promo code');
    }

    const totalOrders = promoCode.orders.length;
    const totalDiscount = promoCode.orders.reduce((sum, order) => sum + Number(order.discount), 0);
    const totalRevenue = promoCode.orders.reduce((sum, order) => sum + Number(order.total), 0);

    return {
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        description: promoCode.description,
        discountType: promoCode.discountType,
        discountValue: Number(promoCode.discountValue),
        maxUses: promoCode.maxUses,
        currentUses: promoCode.currentUses,
        isActive: promoCode.isActive,
      },
      stats: {
        totalOrders,
        totalDiscount,
        totalRevenue,
        usagePercentage: promoCode.maxUses ? (promoCode.currentUses / promoCode.maxUses) * 100 : null,
      },
      orders: promoCode.orders,
    };
  }
}
