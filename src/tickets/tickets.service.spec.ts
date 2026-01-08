import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('TicketsService', () => {
  let service: TicketsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    ticket: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    ticketCategory: {
      findUnique: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers:[
        TicketsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create a ticket', async () => {
      const createTicketDto = {
        eventId: 'event-id',
        title: 'VIP Ticket',
        description: 'VIP access',
        type: 'PAID' as any,
        price: 100,
        quantity: 50,
        salesStartsAt: '2024-12-01T00:00:00.000Z',
        salesEndsAt: '2024-12-31T23:59:59.000Z',
      };

      const event = {
        id: 'event-id',
        organizerId: 'organizer-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);
      mockPrismaService.ticket.create.mockResolvedValue({
        id: 'ticket-id',
        ...createTicketDto,
      });

      const result = await service.create(createTicketDto, 'organizer-id', 'ORGANIZER' as any);

      expect(result).toHaveProperty('id');
      expect(result.title).toBe(createTicketDto.title);
      expect(mockPrismaService.ticket.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if event not found', async () => {
      const createTicketDto = {
        eventId: 'nonexistent-event',
        title: 'Ticket',
        type: 'PAID' as any,
        price: 100,
        quantity: 50,
        salesStartsAt: '2024-12-01T00:00:00.000Z',
        salesEndsAt: '2024-12-31T23:59:59.000Z',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(
        service.create(createTicketDto, 'user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not event organizer', async () => {
      const createTicketDto = {
        eventId: 'event-id',
        title: 'Ticket',
        type: 'PAID' as any,
        price: 100,
        quantity: 50,
        salesStartsAt: '2024-12-01T00:00:00.000Z',
        salesEndsAt: '2024-12-31T23:59:59.000Z',
      };

      const event = {
        id: 'event-id',
        organizerId: 'owner-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);

      await expect(
        service.create(createTicketDto, 'different-user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to create ticket for any event', async () => {
      const createTicketDto = {
        eventId: 'event-id',
        title: 'Ticket',
        type: 'PAID' as any,
        price: 100,
        quantity: 50,
        salesStartsAt: '2024-12-01T00:00:00.000Z',
        salesEndsAt: '2024-12-31T23:59:59.000Z',
      };

      const event = {
        id: 'event-id',
        organizerId: 'owner-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);
      mockPrismaService.ticket.create.mockResolvedValue({
        id: 'ticket-id',
        ...createTicketDto,
      });

      const result = await service.create(createTicketDto, 'admin-id', 'ADMIN' as any);

      expect(result).toHaveProperty('id');
    });

    it('should validate half-price configuration', async () => {
      const createTicketDto = {
        eventId: 'event-id',
        title: 'Ticket',
        type: 'PAID' as any,
        price: 100,
        quantity: 50,
        salesStartsAt: '2024-12-01T00:00:00.000Z',
        salesEndsAt: '2024-12-31T23:59:59.000Z',
        hasHalfPrice: true,
        halfPrice: 120, // Invalid: greater than regular price
        halfPriceQuantity: 10,
      };

      const event = {
        id: 'event-id',
        organizerId: 'organizer-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);

      await expect(
        service.create(createTicketDto, 'organizer-id', 'ORGANIZER' as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated tickets', async () => {
      const tickets = [
        { id: '1', title: 'VIP', price: 100 },
        { id: '2', title: 'Regular', price: 50 },
      ];

      mockPrismaService.ticket.findMany.mockResolvedValue(tickets);
      mockPrismaService.ticket.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
    });

    it('should filter by eventId', async () => {
      const tickets = [{ id: '1', title: 'VIP', eventId: 'event-id' }];

      mockPrismaService.ticket.findMany.mockResolvedValue(tickets);
      mockPrismaService.ticket.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10, eventId: 'event-id' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].eventId).toBe('event-id');
    });
  });

  describe('findOne', () => {
    it('should return a ticket by id', async () => {
      const ticket = {
        id: 'ticket-id',
        title: 'VIP Ticket',
        price: 100,
        quantity: 50,
        quantitySold: 20,
        quantityReserved: 5,
        hasHalfPrice: false,
        halfPriceQuantity: 0,
        halfPriceSold: 0,
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);

      const result = await service.findOne('ticket-id');

      expect(result).toHaveProperty('id');
      expect(result.title).toBe(ticket.title);
      expect(result).toHaveProperty('availableQuantity');
      expect(result).toHaveProperty('halfPriceAvailable');
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should successfully update a ticket', async () => {
      const updateTicketDto = {
        title: 'Updated VIP',
        price: 150,
      };

      const existingTicket = {
        id: 'ticket-id',
        eventId: 'event-id',
        title: 'VIP',
        price: 100,
        event: {
          id: 'event-id',
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(existingTicket);
      mockPrismaService.ticket.update.mockResolvedValue({
        ...existingTicket,
        ...updateTicketDto,
      });

      const result = await service.update('ticket-id', updateTicketDto, 'organizer-id', 'ORGANIZER' as any);

      expect(result.title).toBe(updateTicketDto.title);
      expect(result.price).toBe(updateTicketDto.price);
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent-id', { title: 'Updated' }, 'user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not event organizer', async () => {
      const existingTicket = {
        id: 'ticket-id',
        eventId: 'event-id',
        event: {
          id: 'event-id',
          organizerId: 'owner-id',
        },
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(existingTicket);

      await expect(
        service.update('ticket-id', { title: 'Updated' }, 'different-user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should successfully delete a ticket', async () => {
      const ticket = {
        id: 'ticket-id',
        eventId: 'event-id',
        event: {
          id: 'event-id',
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.ticket.delete.mockResolvedValue(ticket);

      const result = await service.remove('ticket-id', 'organizer-id', 'ORGANIZER' as any);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Ticket deleted successfully');
    });

    it('should throw NotFoundException if ticket not found', async () => {
      mockPrismaService.ticket.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('nonexistent-id', 'user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if ticket has sales', async () => {
      const ticket = {
        id: 'ticket-id',
        eventId: 'event-id',
        quantitySold: 10, // Has sales
        quantityReserved: 0,
        hasHalfPrice: false,
        halfPriceQuantity: 0,
        halfPriceSold: 0,
        quantity: 50,
        event: {
          id: 'event-id',
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);

      await expect(
        service.remove('ticket-id', 'organizer-id', 'ORGANIZER' as any),
      ).rejects.toThrow();
    });
  });

  describe('checkAvailability', () => {
    it('should return available for valid quantity', async () => {
      const ticket = {
        id: 'ticket-id',
        quantity: 100,
        quantitySold: 50,
        quantityReserved: 10,
        availability: 'AVAILABLE',
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);

      const result = await service.checkAvailability('ticket-id', 30);

      expect(result.available).toBe(true);
      expect(result.ticket.availableQuantity).toBeGreaterThanOrEqual(30);
    });

    it('should throw BadRequestException if insufficient quantity', async () => {
      const ticket = {
        id: 'ticket-id',
        quantity: 100,
        quantitySold: 90,
        quantityReserved: 5,
        availability: 'AVAILABLE',
        hasHalfPrice: false,
        halfPriceQuantity: 0,
        halfPriceSold: 0,
      };

      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);

      await expect(
        service.checkAvailability('ticket-id', 10),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
