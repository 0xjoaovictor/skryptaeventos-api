import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventStatus, Visibility, UserRole } from '@prisma/client';
import { RefundsService } from '../refunds/refunds.service';
import { TicketInstancesService } from '../ticket-instances/ticket-instances.service';

interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: EventStatus;
  visibility?: Visibility;
  organizerId?: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private refundsService: RefundsService,
    @Inject(forwardRef(() => TicketInstancesService))
    private ticketInstancesService: TicketInstancesService,
  ) {}

  async create(createEventDto: CreateEventDto, userId: string, userRole: UserRole) {
    const { slug, organizerId, ...data } = createEventDto;

    // Determine the final organizer ID
    let finalOrganizerId = userId;
    if (organizerId && organizerId !== userId) {
      // Only admins can create events for other organizers
      if (userRole !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admins can create events for other organizers');
      }
      finalOrganizerId = organizerId;
    }

    // Generate slug from title if not provided
    const eventSlug = slug || this.generateSlug(createEventDto.title);

    // Check slug uniqueness
    if (eventSlug) {
      const existingSlug = await this.prisma.event.findUnique({
        where: { slug: eventSlug },
      });

      if (existingSlug) {
        throw new ConflictException('Event slug already exists');
      }
    }

    // Parse dates
    const startsAt = new Date(createEventDto.startsAt);
    const endsAt = new Date(createEventDto.endsAt);

    // Validate date range: endsAt must be after startsAt
    if (endsAt <= startsAt) {
      throw new BadRequestException('Event end date must be after start date');
    }

    // Validate that event starts in the future
    const now = new Date();
    if (startsAt < now) {
      throw new BadRequestException('Event start date must be in the future');
    }

    const eventData: any = {
      ...data,
      slug: eventSlug,
      startsAt,
      endsAt,
      organizerId: finalOrganizerId,
    };

    // Handle customForms as JSON
    if (createEventDto.customForms) {
      eventData.customForms = createEventDto.customForms;
    }

    const event = await this.prisma.event.create({
      data: eventData,
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return event;
  }

  async findAll(options: FindAllOptions = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      visibility,
      organizerId,
    } = options;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (visibility) {
      where.visibility = visibility;
    }

    if (organizerId) {
      where.organizerId = organizerId;
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organizer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              tickets: true,
              orders: true,
            },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        tickets: {
          orderBy: { displayOrder: 'asc' },
        },
        ticketCategories: {
          orderBy: { displayOrder: 'asc' },
        },
        customFormFields: {
          orderBy: { displayOrder: 'asc' },
        },
        promoCodes: {
          where: { isActive: true },
        },
        _count: {
          select: {
            tickets: true,
            orders: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    return event;
  }

  async findBySlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        tickets: {
          where: {
            isVisible: true,
          },
          orderBy: { displayOrder: 'asc' },
        },
        ticketCategories: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
        customFormFields: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    return event;
  }

  async update(
    id: string,
    updateEventDto: UpdateEventDto,
    userId: string,
    userRole: UserRole,
  ) {
    const event = await this.findOne(id);

    // Authorization check: only organizer or admin can update
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this event',
      );
    }

    const { slug, ...data } = updateEventDto;

    // Handle slug update
    let eventSlug = event.slug;
    if (slug && slug !== event.slug) {
      const existingSlug = await this.prisma.event.findUnique({
        where: { slug },
      });

      if (existingSlug) {
        throw new ConflictException('Event slug already exists');
      }

      eventSlug = slug;
    }

    // Parse dates if provided
    const updateData: any = {
      ...data,
      slug: eventSlug,
    };

    let newStartsAt = event.startsAt;
    let newEndsAt = event.endsAt;

    if (updateEventDto.startsAt) {
      newStartsAt = new Date(updateEventDto.startsAt);
      updateData.startsAt = newStartsAt;
    }

    if (updateEventDto.endsAt) {
      newEndsAt = new Date(updateEventDto.endsAt);
      updateData.endsAt = newEndsAt;
    }

    // Validate date range if dates are being updated
    if (newEndsAt <= newStartsAt) {
      throw new BadRequestException('Event end date must be after start date');
    }

    // Validate that event starts in the future if start date is being updated
    if (updateEventDto.startsAt) {
      const now = new Date();
      if (newStartsAt < now) {
        throw new BadRequestException('Event start date must be in the future');
      }
    }

    // Handle customForms as JSON
    if (updateEventDto.customForms !== undefined) {
      updateData.customForms = updateEventDto.customForms;
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updatedEvent;
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const event = await this.findOne(id);

    // Authorization check: only organizer or admin can delete
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this event',
      );
    }

    // Check if event has any orders
    const ordersCount = await this.prisma.order.count({
      where: { eventId: id },
    });

    if (ordersCount > 0) {
      throw new ConflictException(
        'Cannot delete event with existing orders. Consider cancelling the event instead.',
      );
    }

    await this.prisma.event.delete({
      where: { id },
    });

    return { message: 'Event deleted successfully' };
  }

  async cancelEvent(id: string, userId: string, userRole: UserRole) {
    const event = await this.findOne(id);

    // Authorization check: only organizer or admin can cancel
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to cancel this event',
      );
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.CANCELLED,
      },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Automatically create refunds for all confirmed orders (Sympla-style)
    try {
      const refundsCreated = await this.refundsService.createAutomaticRefundsForCancelledEvent(id);
      this.logger.log(`Event ${id} cancelled. Created ${refundsCreated} automatic refunds.`);
    } catch (error) {
      this.logger.error(`Failed to create automatic refunds for cancelled event ${id}:`, error);
      // Don't throw - event is already cancelled, refunds can be processed manually if needed
    }

    return updatedEvent;
  }

  async publishEvent(id: string, userId: string, userRole: UserRole) {
    const event = await this.findOne(id);

    // Authorization check: only organizer or admin can publish
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to publish this event',
      );
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.ACTIVE,
      },
      include: {
        organizer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updatedEvent;
  }

  async exportAttendees(
    eventId: string,
    userId: string,
    userRole: UserRole,
    format: string,
  ) {
    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Authorization: Only event organizer or admin can export
    const isOrganizer = event.organizerId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOrganizer && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to export attendees for this event',
      );
    }

    // Get all attendees for this event (no pagination for export)
    const result = await this.ticketInstancesService.findAll({
      eventId,
      limit: 10000, // Large limit for export
    });

    const attendees = result.data || result;

    // Format based on requested format
    if (format === 'csv') {
      return this.formatAttendeesAsCsv(attendees);
    } else {
      // Return JSON (array of attendees)
      return { data: attendees };
    }
  }

  private formatAttendeesAsCsv(attendees: any[]): string {
    if (attendees.length === 0) {
      return 'No attendees found';
    }

    // Define CSV headers
    const headers = [
      'Attendee Name',
      'Attendee Email',
      'Ticket Type',
      'Status',
      'Check-in Time',
      'QR Code',
    ];

    // Build CSV rows
    const rows = attendees.map((attendee) => {
      return [
        attendee.attendeeName || '',
        attendee.attendeeEmail || '',
        attendee.ticket?.title || '',
        attendee.status || '',
        attendee.checkInAt ? new Date(attendee.checkInAt).toISOString() : '',
        attendee.qrCode || '',
      ]
        .map((field) => `"${field}"`) // Wrap in quotes for CSV
        .join(',');
    });

    // Combine headers and rows
    return [headers.join(','), ...rows].join('\n');
  }

  // Helper method to generate slug from title
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD') // Normalize to decomposed form
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .concat('-', Date.now().toString().slice(-6)); // Add timestamp for uniqueness
  }
}
