import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTicketCategoryDto } from './dto/create-ticket-category.dto';
import { UpdateTicketCategoryDto } from './dto/update-ticket-category.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createTicketCategoryDto: CreateTicketCategoryDto, userId: string, userRole: UserRole) {
    const { eventId, name, description, displayOrder, isActive } = createTicketCategoryDto;

    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check if user has permission to modify this event
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to add categories to this event');
    }

    // Check for duplicate category name in the same event
    const existingCategory = await this.prisma.ticketCategory.findUnique({
      where: {
        eventId_name: {
          eventId,
          name,
        },
      },
    });

    if (existingCategory) {
      throw new BadRequestException('A category with this name already exists for this event');
    }

    return this.prisma.ticketCategory.create({
      data: {
        eventId,
        name,
        description,
        displayOrder: displayOrder ?? 0,
        isActive: isActive ?? true,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        tickets: true,
      },
    });
  }

  async findAll(eventId?: string) {
    const whereClause = eventId ? { eventId } : {};

    return this.prisma.ticketCategory.findMany({
      where: whereClause,
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        tickets: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });
  }

  async findByEvent(eventId: string) {
    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.ticketCategory.findMany({
      where: { eventId },
      include: {
        tickets: {
          select: {
            id: true,
            title: true,
            type: true,
            price: true,
            quantity: true,
            quantitySold: true,
          },
        },
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            organizerId: true,
          },
        },
        tickets: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Ticket category not found');
    }

    return category;
  }

  async update(
    id: string,
    updateTicketCategoryDto: UpdateTicketCategoryDto,
    userId: string,
    userRole: UserRole,
  ) {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      include: {
        event: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Ticket category not found');
    }

    // Check if user has permission to modify this event
    if (userRole !== UserRole.ADMIN && category.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this category');
    }

    // If name is being updated, check for duplicates
    if (updateTicketCategoryDto.name && updateTicketCategoryDto.name !== category.name) {
      const existingCategory = await this.prisma.ticketCategory.findUnique({
        where: {
          eventId_name: {
            eventId: category.eventId,
            name: updateTicketCategoryDto.name,
          },
        },
      });

      if (existingCategory) {
        throw new BadRequestException('A category with this name already exists for this event');
      }
    }

    return this.prisma.ticketCategory.update({
      where: { id },
      data: updateTicketCategoryDto,
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        tickets: true,
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      include: {
        event: true,
        tickets: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Ticket category not found');
    }

    // Check if user has permission to modify this event
    if (userRole !== UserRole.ADMIN && category.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this category');
    }

    // Check if category has tickets
    if (category.tickets.length > 0) {
      throw new BadRequestException(
        'Cannot delete category with associated tickets. Please reassign or delete tickets first.'
      );
    }

    return this.prisma.ticketCategory.delete({
      where: { id },
    });
  }

  async reorder(eventId: string, categoryOrders: Array<{ id: string; displayOrder: number }>, userId: string, userRole: UserRole) {
    // Verify event exists and user has permission
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to reorder categories for this event');
    }

    // Update display orders in a transaction
    const updatePromises = categoryOrders.map(({ id, displayOrder }) =>
      this.prisma.ticketCategory.update({
        where: { id },
        data: { displayOrder },
      })
    );

    await this.prisma.$transaction(updatePromises);

    return this.findByEvent(eventId);
  }
}
