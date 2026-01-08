import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UserRole, TicketAvailability } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface FindAllOptions {
  page?: number;
  limit?: number;
  eventId?: string;
  categoryId?: string;
  availability?: TicketAvailability;
  isVisible?: boolean;
}

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async create(createTicketDto: CreateTicketDto, userId: string, userRole: UserRole) {
    // Validate event exists
    const event = await this.prisma.event.findUnique({
      where: { id: createTicketDto.eventId },
      include: { organizer: true },
    });

    if (!event) {
      throw new NotFoundException(
        `Event with ID ${createTicketDto.eventId} not found`,
      );
    }

    // Authorization: only event organizer or admin can create tickets
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to create tickets for this event',
      );
    }

    // Validate category if provided
    if (createTicketDto.categoryId) {
      const category = await this.prisma.ticketCategory.findUnique({
        where: { id: createTicketDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${createTicketDto.categoryId} not found`,
        );
      }

      // Ensure category belongs to the same event
      if (category.eventId !== createTicketDto.eventId) {
        throw new BadRequestException(
          'Category does not belong to the specified event',
        );
      }
    }

    // Validate sales dates
    this.validateSalesDates(
      createTicketDto.salesStartsAt,
      createTicketDto.salesEndsAt,
    );

    // Validate price based on ticket type
    if (createTicketDto.type === 'FREE' && createTicketDto.price !== 0) {
      throw new BadRequestException(
        'FREE ticket type must have price equal to 0',
      );
    }

    if (createTicketDto.type === 'PAID' && createTicketDto.price <= 0) {
      throw new BadRequestException(
        'PAID ticket type must have price greater than 0',
      );
    }

    // Validate min/max quantity
    if (createTicketDto.minQuantity && createTicketDto.maxQuantity) {
      if (createTicketDto.minQuantity > createTicketDto.maxQuantity) {
        throw new BadRequestException(
          'minQuantity cannot be greater than maxQuantity',
        );
      }
    }

    // Validate half price configuration
    if (createTicketDto.hasHalfPrice) {
      if (!createTicketDto.halfPrice || !createTicketDto.halfPriceQuantity) {
        throw new BadRequestException(
          'halfPrice and halfPriceQuantity are required when hasHalfPrice is true',
        );
      }

      if (createTicketDto.halfPrice >= createTicketDto.price) {
        throw new BadRequestException(
          'halfPrice must be less than the regular price',
        );
      }

      if (createTicketDto.halfPriceQuantity > createTicketDto.quantity) {
        throw new BadRequestException(
          'halfPriceQuantity cannot exceed total quantity',
        );
      }
    }

    // Prepare data for creation
    const ticketData: any = {
      ...createTicketDto,
      salesStartsAt: new Date(createTicketDto.salesStartsAt),
      salesEndsAt: new Date(createTicketDto.salesEndsAt),
      price: new Decimal(createTicketDto.price),
    };

    // Convert decimal fields
    if (createTicketDto.serviceFeePercentage !== undefined) {
      ticketData.serviceFeePercentage = new Decimal(
        createTicketDto.serviceFeePercentage,
      );
    }

    if (createTicketDto.halfPrice !== undefined) {
      ticketData.halfPrice = new Decimal(createTicketDto.halfPrice);
    }

    const ticket = await this.prisma.ticket.create({
      data: ticketData,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return ticket;
  }

  async findAll(options: FindAllOptions = {}) {
    const {
      page = 1,
      limit = 10,
      eventId,
      categoryId,
      availability,
      isVisible,
    } = options;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (availability) {
      where.availability = availability;
    }

    if (isVisible !== undefined) {
      where.isVisible = isVisible;
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { displayOrder: 'asc' },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              orderItems: true,
              ticketInstances: true,
            },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    // Calculate available quantity for each ticket
    const ticketsWithAvailability = tickets.map((ticket) => ({
      ...ticket,
      availableQuantity:
        ticket.quantity - ticket.quantitySold - ticket.quantityReserved,
      halfPriceAvailable: ticket.hasHalfPrice
        ? (ticket.halfPriceQuantity || 0) - ticket.halfPriceSold
        : 0,
    }));

    return {
      data: ticketsWithAvailability,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            organizerId: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        _count: {
          select: {
            orderItems: true,
            ticketInstances: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    // Calculate available quantity
    const availableQuantity =
      ticket.quantity - ticket.quantitySold - ticket.quantityReserved;

    const halfPriceAvailable = ticket.hasHalfPrice
      ? (ticket.halfPriceQuantity || 0) - ticket.halfPriceSold
      : 0;

    return {
      ...ticket,
      availableQuantity,
      halfPriceAvailable,
    };
  }

  async update(
    id: string,
    updateTicketDto: UpdateTicketDto,
    userId: string,
    userRole: UserRole,
  ) {
    const ticket = await this.findOne(id);

    // Authorization: only event organizer or admin can update
    if (
      userRole !== UserRole.ADMIN &&
      ticket.event.organizerId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this ticket',
      );
    }

    // Validate category if being updated
    if (updateTicketDto.categoryId) {
      const category = await this.prisma.ticketCategory.findUnique({
        where: { id: updateTicketDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${updateTicketDto.categoryId} not found`,
        );
      }

      // Ensure category belongs to the same event
      if (category.eventId !== ticket.eventId) {
        throw new BadRequestException(
          'Category does not belong to the ticket event',
        );
      }
    }

    // Validate sales dates if being updated
    if (updateTicketDto.salesStartsAt || updateTicketDto.salesEndsAt) {
      this.validateSalesDates(
        updateTicketDto.salesStartsAt || ticket.salesStartsAt.toISOString(),
        updateTicketDto.salesEndsAt || ticket.salesEndsAt.toISOString(),
      );
    }

    // Validate min/max quantity if being updated
    const newMinQuantity = updateTicketDto.minQuantity || ticket.minQuantity;
    const newMaxQuantity = updateTicketDto.maxQuantity || ticket.maxQuantity;

    if (newMinQuantity > newMaxQuantity) {
      throw new BadRequestException(
        'minQuantity cannot be greater than maxQuantity',
      );
    }

    // Validate quantity doesn't go below already sold
    if (updateTicketDto.quantity !== undefined) {
      if (updateTicketDto.quantity < ticket.quantitySold) {
        throw new BadRequestException(
          `Cannot set quantity below already sold tickets (${ticket.quantitySold})`,
        );
      }
    }

    // Validate half price configuration if being updated
    if (updateTicketDto.hasHalfPrice !== undefined) {
      const hasHalfPrice = updateTicketDto.hasHalfPrice;
      const halfPrice = updateTicketDto.halfPrice || ticket.halfPrice;
      const halfPriceQuantity =
        updateTicketDto.halfPriceQuantity || ticket.halfPriceQuantity;
      const price = updateTicketDto.price || ticket.price;

      if (hasHalfPrice) {
        if (!halfPrice || !halfPriceQuantity) {
          throw new BadRequestException(
            'halfPrice and halfPriceQuantity are required when hasHalfPrice is true',
          );
        }

        if (Number(halfPrice) >= Number(price)) {
          throw new BadRequestException(
            'halfPrice must be less than the regular price',
          );
        }

        const totalQuantity = updateTicketDto.quantity || ticket.quantity;
        if (Number(halfPriceQuantity) > totalQuantity) {
          throw new BadRequestException(
            'halfPriceQuantity cannot exceed total quantity',
          );
        }

        // Validate against already sold half-price tickets
        if (
          updateTicketDto.halfPriceQuantity !== undefined &&
          updateTicketDto.halfPriceQuantity < ticket.halfPriceSold
        ) {
          throw new BadRequestException(
            `Cannot set halfPriceQuantity below already sold half-price tickets (${ticket.halfPriceSold})`,
          );
        }
      }
    }

    // Prepare update data
    const updateData: any = { ...updateTicketDto };

    // Convert date fields
    if (updateTicketDto.salesStartsAt) {
      updateData.salesStartsAt = new Date(updateTicketDto.salesStartsAt);
    }

    if (updateTicketDto.salesEndsAt) {
      updateData.salesEndsAt = new Date(updateTicketDto.salesEndsAt);
    }

    // Convert decimal fields
    if (updateTicketDto.price !== undefined) {
      updateData.price = new Decimal(updateTicketDto.price);
    }

    if (updateTicketDto.serviceFeePercentage !== undefined) {
      updateData.serviceFeePercentage = new Decimal(
        updateTicketDto.serviceFeePercentage,
      );
    }

    if (updateTicketDto.halfPrice !== undefined) {
      updateData.halfPrice = new Decimal(updateTicketDto.halfPrice);
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id },
      data: updateData,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return updatedTicket;
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const ticket = await this.findOne(id);

    // Authorization: only event organizer or admin can delete
    if (
      userRole !== UserRole.ADMIN &&
      ticket.event.organizerId !== userId
    ) {
      throw new ForbiddenException(
        'You do not have permission to delete this ticket',
      );
    }

    // Check if ticket has any sales
    if (ticket.quantitySold > 0) {
      throw new ConflictException(
        'Cannot delete ticket with existing sales. Consider hiding it instead.',
      );
    }

    // Check if ticket has any reservations
    if (ticket.quantityReserved > 0) {
      throw new ConflictException(
        'Cannot delete ticket with pending reservations',
      );
    }

    await this.prisma.ticket.delete({
      where: { id },
    });

    return { message: 'Ticket deleted successfully' };
  }

  async checkAvailability(id: string, quantity: number, isHalfPrice = false) {
    const ticket = await this.findOne(id);

    // Check if sales period is valid
    const now = new Date();
    const salesStartsAt = new Date(ticket.salesStartsAt);
    const salesEndsAt = new Date(ticket.salesEndsAt);

    if (now < salesStartsAt) {
      throw new BadRequestException('Ticket sales have not started yet');
    }

    if (now > salesEndsAt) {
      throw new BadRequestException('Ticket sales have ended');
    }

    // Check visibility
    if (!ticket.isVisible && ticket.availability === TicketAvailability.PUBLIC) {
      throw new BadRequestException('Ticket is not available for purchase');
    }

    // Check quantity limits
    if (quantity < ticket.minQuantity) {
      throw new BadRequestException(
        `Minimum purchase quantity is ${ticket.minQuantity}`,
      );
    }

    if (quantity > ticket.maxQuantity) {
      throw new BadRequestException(
        `Maximum purchase quantity is ${ticket.maxQuantity}`,
      );
    }

    // Check availability
    if (isHalfPrice) {
      if (!ticket.hasHalfPrice) {
        throw new BadRequestException('Half price option is not available');
      }

      const halfPriceAvailable =
        (ticket.halfPriceQuantity || 0) - ticket.halfPriceSold;

      if (quantity > halfPriceAvailable) {
        throw new BadRequestException(
          `Only ${halfPriceAvailable} half-price tickets available`,
        );
      }
    } else {
      const availableQuantity =
        ticket.quantity - ticket.quantitySold - ticket.quantityReserved;

      if (quantity > availableQuantity) {
        throw new BadRequestException(
          `Only ${availableQuantity} tickets available`,
        );
      }
    }

    return {
      available: true,
      ticket,
    };
  }

  // Helper method to validate sales dates
  private validateSalesDates(salesStartsAt: string, salesEndsAt: string) {
    const startDate = new Date(salesStartsAt);
    const endDate = new Date(salesEndsAt);

    if (startDate >= endDate) {
      throw new BadRequestException(
        'salesStartsAt must be before salesEndsAt',
      );
    }

    return true;
  }
}
