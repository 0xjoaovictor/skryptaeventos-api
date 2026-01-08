import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTicketInstanceDto } from './dto/create-ticket-instance.dto';
import { UpdateTicketInstanceDto } from './dto/update-ticket-instance.dto';
import { CheckInDto } from './dto/check-in.dto';
import { TransferTicketDto } from './dto/transfer-ticket.dto';
import { TicketInstanceStatus, UserRole } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import * as QRCode from 'qrcode';

interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: TicketInstanceStatus;
  eventId?: string;
  orderItemId?: string;
  ticketId?: string;
  attendeeEmail?: string;
}

@Injectable()
export class TicketInstancesService {
  private readonly logger = new Logger(TicketInstancesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createTicketInstanceDto: CreateTicketInstanceDto) {
    const { orderItemId, ticketId, ...data } = createTicketInstanceDto;

    // Verify order item exists
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item with ID ${orderItemId} not found`);
    }

    // Verify ticket exists
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    // Validate half-price if requested
    if (createTicketInstanceDto.isHalfPrice) {
      if (!ticket.hasHalfPrice) {
        throw new BadRequestException('This ticket does not support half-price');
      }

      if (!createTicketInstanceDto.attendeeCpf) {
        throw new BadRequestException('CPF is required for half-price tickets');
      }

      // Check half-price quota
      if (ticket.halfPriceSold >= (ticket.halfPriceQuantity || 0)) {
        throw new BadRequestException('Half-price tickets sold out');
      }
    }

    // Generate unique QR code
    const qrCode = createId();

    const ticketInstance = await this.prisma.ticketInstance.create({
      data: {
        ...data,
        orderItemId,
        ticketId,
        qrCode,
        status: TicketInstanceStatus.ACTIVE,
        isHalfPrice: createTicketInstanceDto.isHalfPrice || false,
      },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
              },
            },
          },
        },
      },
    });

    // Update half-price sold count if applicable
    if (createTicketInstanceDto.isHalfPrice) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          halfPriceSold: {
            increment: 1,
          },
        },
      });
    }

    return ticketInstance;
  }

  async findAll(options: FindAllOptions = {}) {
    const {
      page = 1,
      limit = 50,
      status,
      eventId,
      orderItemId,
      ticketId,
      attendeeEmail,
    } = options;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (orderItemId) {
      where.orderItemId = orderItemId;
    }

    if (ticketId) {
      where.ticketId = ticketId;
    }

    if (attendeeEmail) {
      where.attendeeEmail = {
        contains: attendeeEmail,
        mode: 'insensitive',
      };
    }

    // Filter by eventId through relationships
    if (eventId) {
      where.orderItem = {
        order: {
          eventId,
        },
      };
    }

    const [ticketInstances, total] = await Promise.all([
      this.prisma.ticketInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              type: true,
              price: true,
            },
          },
          orderItem: {
            include: {
              order: {
                include: {
                  event: {
                    select: {
                      id: true,
                      title: true,
                      startsAt: true,
                      endsAt: true,
                    },
                  },
                  buyer: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.ticketInstance.count({ where }),
    ]);

    return {
      data: ticketInstances,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId?: string, userRole?: UserRole) {
    const ticketInstance = await this.prisma.ticketInstance.findUnique({
      where: { id },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
                buyer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!ticketInstance) {
      throw new NotFoundException(`Ticket instance with ID ${id} not found`);
    }

    // Authorization check if user context is provided
    if (userId && userRole) {
      const isOwner = ticketInstance.orderItem.order.buyerId === userId;
      const isOrganizer = ticketInstance.orderItem.order.event.organizerId === userId;
      const isAdmin = userRole === UserRole.ADMIN;

      if (!isOwner && !isOrganizer && !isAdmin) {
        throw new ForbiddenException(
          'You do not have permission to view this ticket instance',
        );
      }
    }

    return ticketInstance;
  }

  async findByQrCode(qrCode: string, userId?: string, userRole?: UserRole) {
    const ticketInstance = await this.prisma.ticketInstance.findUnique({
      where: { qrCode },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
                buyer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!ticketInstance) {
      throw new NotFoundException(`Ticket instance with QR code not found`);
    }

    // Authorization check if user context is provided
    if (userId && userRole) {
      const isOwner = ticketInstance.orderItem.order.buyerId === userId;
      const isOrganizer = ticketInstance.orderItem.order.event.organizerId === userId;
      const isAdmin = userRole === UserRole.ADMIN;

      if (!isOwner && !isOrganizer && !isAdmin) {
        throw new ForbiddenException(
          'You do not have permission to view this ticket instance',
        );
      }
    }

    return ticketInstance;
  }

  async update(
    id: string,
    updateTicketInstanceDto: UpdateTicketInstanceDto,
    userId: string,
    userRole: UserRole,
  ) {
    // Use findOne with authorization
    const ticketInstance = await this.findOne(id, userId, userRole);

    const updatedInstance = await this.prisma.ticketInstance.update({
      where: { id },
      data: updateTicketInstanceDto,
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
              },
            },
          },
        },
      },
    });

    return updatedInstance;
  }

  async checkIn(
    qrCode: string,
    checkInDto: CheckInDto,
    userId: string,
    userRole: UserRole,
  ) {
    // First fetch without auth to check organizer permissions
    const ticketInstance = await this.findByQrCode(qrCode);

    // Authorization: Only event organizer or admin can check-in
    const isOrganizer = ticketInstance.orderItem.order.event.organizerId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOrganizer && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to check-in this ticket',
      );
    }

    // Validate ticket status
    if (ticketInstance.status === TicketInstanceStatus.CHECKED_IN) {
      throw new ConflictException('Ticket already checked in');
    }

    if (ticketInstance.status === TicketInstanceStatus.CANCELLED) {
      throw new BadRequestException('Ticket is cancelled');
    }

    if (ticketInstance.status === TicketInstanceStatus.REFUNDED) {
      throw new BadRequestException('Ticket has been refunded');
    }

    if (ticketInstance.status === TicketInstanceStatus.EXPIRED) {
      throw new BadRequestException('Ticket has expired');
    }

    if (ticketInstance.status === TicketInstanceStatus.TRANSFERRED) {
      throw new BadRequestException('Ticket has been transferred');
    }

    // Validate half-price requirements
    if (ticketInstance.isHalfPrice) {
      if (!ticketInstance.attendeeCpf) {
        throw new BadRequestException(
          'Half-price ticket requires CPF verification',
        );
      }
      // Additional half-price validation can be added here
      // (e.g., student ID verification, age verification, etc.)
    }

    // Check event date (optional - you may want to allow check-in before event)
    const event = ticketInstance.orderItem.order.event;
    const now = new Date();

    if (now > event.endsAt) {
      throw new BadRequestException('Event has already ended');
    }

    // Perform check-in
    const checkedInInstance = await this.prisma.ticketInstance.update({
      where: { id: ticketInstance.id },
      data: {
        status: TicketInstanceStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInBy: userId,
        checkInNotes: checkInDto.checkInNotes,
        checkInLocation: checkInDto.checkInLocation,
      },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
                buyer: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return checkedInInstance;
  }

  async transferTicket(
    id: string,
    transferTicketDto: TransferTicketDto,
    userId: string,
    userRole: UserRole,
  ) {
    // Use findOne with authorization
    const ticketInstance = await this.findOne(id, userId, userRole);

    // Validate ticket status
    if (ticketInstance.status === TicketInstanceStatus.CHECKED_IN) {
      throw new BadRequestException('Cannot transfer a checked-in ticket');
    }

    if (ticketInstance.status === TicketInstanceStatus.CANCELLED) {
      throw new BadRequestException('Cannot transfer a cancelled ticket');
    }

    if (ticketInstance.status === TicketInstanceStatus.REFUNDED) {
      throw new BadRequestException('Cannot transfer a refunded ticket');
    }

    if (ticketInstance.status === TicketInstanceStatus.EXPIRED) {
      throw new BadRequestException('Cannot transfer an expired ticket');
    }

    // Normalize new attendee email: trim whitespace and convert to lowercase
    const normalizedEmail = transferTicketDto.newAttendeeEmail?.trim().toLowerCase();

    // Store previous owner info
    const previousEmail = ticketInstance.attendeeEmail || ticketInstance.orderItem.order.buyerEmail;

    // Transfer the ticket
    const transferredInstance = await this.prisma.ticketInstance.update({
      where: { id },
      data: {
        attendeeName: transferTicketDto.newAttendeeName,
        attendeeEmail: normalizedEmail,
        attendeeCpf: transferTicketDto.newAttendeeCpf,
        attendeePhone: transferTicketDto.newAttendeePhone,
        transferredAt: new Date(),
        transferredFrom: previousEmail,
        status: TicketInstanceStatus.ACTIVE, // Keep as active after transfer
      },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
              },
            },
          },
        },
      },
    });

    return transferredInstance;
  }

  async getEventAttendees(
    eventId: string,
    userId: string,
    userRole: UserRole,
    options: { page?: number; limit?: number; status?: TicketInstanceStatus; ticketId?: string } = {},
  ) {
    // Verify event exists and check authorization
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Authorization: Only event organizer or admin can view attendees
    const isOrganizer = event.organizerId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOrganizer && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to view attendees for this event',
      );
    }

    return this.findAll({
      eventId,
      ...options,
    });
  }

  async cancelTicket(
    id: string,
    userId: string,
    userRole: UserRole,
  ) {
    // First fetch without auth to check organizer permissions
    const ticketInstance = await this.findOne(id);

    // Authorization: Only event organizer or admin can cancel
    const isOrganizer = ticketInstance.orderItem.order.event.organizerId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOrganizer && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to cancel this ticket',
      );
    }

    // Cannot cancel already checked-in tickets
    if (ticketInstance.status === TicketInstanceStatus.CHECKED_IN) {
      throw new BadRequestException('Cannot cancel a checked-in ticket');
    }

    const cancelledInstance = await this.prisma.ticketInstance.update({
      where: { id },
      data: {
        status: TicketInstanceStatus.CANCELLED,
      },
      include: {
        ticket: true,
        orderItem: {
          include: {
            order: {
              include: {
                event: true,
              },
            },
          },
        },
      },
    });

    return cancelledInstance;
  }

  async validateHalfPrice(
    id: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ valid: boolean; message?: string }> {
    // First fetch without auth to check organizer permissions
    const ticketInstance = await this.findOne(id);

    // Authorization: Only event organizer or admin can validate
    const isOrganizer = ticketInstance.orderItem.order.event.organizerId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOrganizer && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to validate this ticket',
      );
    }

    if (!ticketInstance.isHalfPrice) {
      return {
        valid: false,
        message: 'This is not a half-price ticket',
      };
    }

    if (!ticketInstance.attendeeCpf) {
      return {
        valid: false,
        message: 'CPF is required for half-price validation',
      };
    }

    // Basic validation - CPF exists
    // In a real system, you would:
    // 1. Validate CPF format and checksum
    // 2. Check against a database of eligible half-price attendees
    // 3. Verify student ID, age, etc.

    return {
      valid: true,
      message: 'Half-price requirements validated',
    };
  }

  async getMyTickets(
    userId: string,
    options: { page?: number; limit?: number; status?: TicketInstanceStatus } = {},
  ) {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      orderItem: {
        order: {
          buyerId: userId,
        },
      },
    };

    if (status) {
      where.status = status;
    }

    const [ticketInstances, total] = await Promise.all([
      this.prisma.ticketInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              type: true,
              price: true,
            },
          },
          orderItem: {
            include: {
              order: {
                include: {
                  event: {
                    select: {
                      id: true,
                      title: true,
                      startsAt: true,
                      endsAt: true,
                      locationName: true,
                      address: true,
                      isOnline: true,
                      onlineUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.ticketInstance.count({ where }),
    ]);

    return {
      data: ticketInstances,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generate QR code image from QR code string
   * Returns base64 encoded PNG image
   */
  async generateQRCodeImage(qrCode: string): Promise<string> {
    try {
      this.logger.log(`Generating QR code image for: ${qrCode}`);

      // Generate QR code as data URL (base64 PNG)
      const qrCodeDataUrl = await QRCode.toDataURL(qrCode, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return qrCodeDataUrl;
    } catch (error) {
      this.logger.error(`Failed to generate QR code image:`, error);
      throw new BadRequestException('Failed to generate QR code image');
    }
  }

  /**
   * Get ticket instance with QR code image
   */
  async findOneWithQRImage(id: string, userId?: string, userRole?: UserRole) {
    const ticketInstance = await this.findOne(id, userId, userRole);

    const qrCodeImage = await this.generateQRCodeImage(ticketInstance.qrCode);

    return {
      ...ticketInstance,
      qrCodeImage,
    };
  }

  /**
   * Get ticket instance by QR code with QR code image
   */
  async findByQrCodeWithImage(qrCode: string, userId?: string, userRole?: UserRole) {
    const ticketInstance = await this.findByQrCode(qrCode, userId, userRole);

    const qrCodeImage = await this.generateQRCodeImage(ticketInstance.qrCode);

    return {
      ...ticketInstance,
      qrCodeImage,
    };
  }
}
