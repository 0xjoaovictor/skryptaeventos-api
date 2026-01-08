import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('OrdersService', () => {
  let service: OrdersService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    order: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ticket: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    ticketInstance: {
      count: jest.fn(),
      createMany: jest.fn(),
    },
    orderItem: {
      aggregate: jest.fn(),
      createMany: jest.fn(),
    },
    promoCode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    customFormField: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create an order', async () => {
      const createOrderDto = {
        eventId: 'event-id',
        items: [
          {
            ticketId: 'ticket-id',
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'John Doe',
                attendeeEmail: '0xzionmount@gmail.com',
                attendeeCpf: '123.456.789-00',
                attendeePhone: '1234567890',
                formResponses: {},
              },
              {
                attendeeName: 'Jane Doe',
                attendeeEmail: '0xzionmount@gmail.com',
                attendeeCpf: '987.654.321-00',
                attendeePhone: '0987654321',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'John Doe',
        buyerEmail: '0xzionmount@gmail.com',
        buyerPhone: '1234567890',
      };

      const event = {
        id: 'event-id',
        status: 'ACTIVE',
        totalCapacity: null,
      };

      const user = {
        id: 'user-id',
        email: 'user@example.com',
      };

      const ticket = {
        id: 'ticket-id',
        title: 'VIP Ticket',
        price: new Decimal(100),
        quantity: 50,
        quantitySold: 10,
        quantityReserved: 5,
        hasHalfPrice: false,
        availability: 'AVAILABLE',
        isVisible: true,
        absorbServiceFee: false,
        serviceFeePercentage: new Decimal(5),
        salesStartsAt: new Date('2024-01-01'),
        salesEndsAt: new Date('2025-12-31'),
        minQuantity: 1,
        maxQuantity: 10,
      };

      const order = {
        id: 'order-id',
        orderNumber: 'ORD-12345',
        userId: 'user-id',
        eventId: 'event-id',
        status: 'PENDING',
        total: 200,
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);
      mockPrismaService.customFormField.findMany.mockResolvedValue([]);
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.ticket.findMany.mockResolvedValue([ticket]);
      mockPrismaService.$transaction.mockResolvedValue(order);

      const result = await service.create(createOrderDto, 'user-id');

      expect(result).toHaveProperty('id');
      expect(mockPrismaService.event.findUnique).toHaveBeenCalled();
      expect(mockPrismaService.customFormField.findMany).toHaveBeenCalled();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalled();
    });

    it('should throw NotFoundException if event not found', async () => {
      const createOrderDto = {
        eventId: 'nonexistent-event',
        items: [
          {
            ticketId: 'ticket-id',
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'John Doe',
                attendeeEmail: '0xzionmount@gmail.com',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'John Doe',
        buyerEmail: '0xzionmount@gmail.com',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.create(createOrderDto, 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if event is not active', async () => {
      const createOrderDto = {
        eventId: 'event-id',
        items: [
          {
            ticketId: 'ticket-id',
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'John Doe',
                attendeeEmail: '0xzionmount@gmail.com',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'John Doe',
        buyerEmail: '0xzionmount@gmail.com',
      };

      const event = {
        id: 'event-id',
        status: 'DRAFT',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);

      await expect(service.create(createOrderDto, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if capacity exceeded', async () => {
      const createOrderDto = {
        eventId: 'event-id',
        items: [
          {
            ticketId: 'ticket-id',
            quantity: 50,
            isHalfPrice: false,
            attendees: Array(50).fill(null).map((_, i) => ({
              attendeeName: `Attendee ${i + 1}`,
              attendeeEmail: '0xzionmount@gmail.com',
              formResponses: {},
            })),
          },
        ],
        buyerName: 'John Doe',
        buyerEmail: '0xzionmount@gmail.com',
      };

      const event = {
        id: 'event-id',
        status: 'ACTIVE',
        totalCapacity: 100,
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);
      mockPrismaService.customFormField.findMany.mockResolvedValue([]);
      mockPrismaService.ticketInstance.count.mockResolvedValue(80); // 80 sold
      mockPrismaService.orderItem.aggregate.mockResolvedValue({
        _sum: { quantity: 15 }, // 15 reserved
      });

      await expect(service.create(createOrderDto, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated orders for user', async () => {
      const orders = [
        { id: '1', orderNumber: 'ORD-001', total: 100 },
        { id: '2', orderNumber: 'ORD-002', total: 200 },
      ];

      mockPrismaService.$transaction.mockResolvedValue([orders, 2]);

      const result = await service.findAll('user-id', 1, 10);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return an order by id', async () => {
      const order = {
        id: 'order-id',
        orderNumber: 'ORD-001',
        buyerId: 'user-id',
        total: 100,
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(order);

      const result = await service.findOne('order-id', 'user-id');

      expect(result).toEqual(order);
    });

    it('should throw NotFoundException if order not found', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id', 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not order owner', async () => {
      const order = {
        id: 'order-id',
        buyerId: 'owner-id',
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(order);

      await expect(service.findOne('order-id', 'different-user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('should successfully update an order', async () => {
      const updateOrderDto = {
        buyerName: 'Jane Doe',
        buyerEmail: 'jane@example.com',
      };

      const existingOrder = {
        id: 'order-id',
        buyerId: 'user-id',
        status: 'PENDING',
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(existingOrder);
      mockPrismaService.order.update.mockResolvedValue({
        ...existingOrder,
        ...updateOrderDto,
      });

      const result = await service.update('order-id', updateOrderDto, 'user-id');

      expect(result.buyerName).toBe(updateOrderDto.buyerName);
    });

    it('should throw NotFoundException if order not found', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent-id', { buyerName: 'Jane' }, 'user-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not order owner', async () => {
      const existingOrder = {
        id: 'order-id',
        buyerId: 'owner-id',
        status: 'PENDING',
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(existingOrder);

      await expect(
        service.update('order-id', { buyerName: 'Jane' }, 'different-user-id'),
      ).rejects.toThrow(ForbiddenException);
    });

  });

  describe('cancel', () => {
    it('should successfully cancel an order', async () => {
      const order = {
        id: 'order-id',
        buyerId: 'user-id',
        status: 'PENDING',
        items: [
          {
            ticketId: 'ticket-id',
            quantity: 2,
          },
        ],
        event: {
          organizerId: 'organizer-id',
        },
      };

      const ticket = {
        id: 'ticket-id',
        quantityReserved: 5,
      };

      mockPrismaService.order.findUnique.mockResolvedValue(order);
      mockPrismaService.ticket.findUnique.mockResolvedValue(ticket);
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      const result = await service.cancel('order-id', 'user-id');

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Order cancelled successfully');
    });

    it('should throw NotFoundException if order not found', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);

      await expect(service.cancel('nonexistent-id', 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if not order owner', async () => {
      const order = {
        id: 'order-id',
        buyerId: 'owner-id',
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(order);

      await expect(service.cancel('order-id', 'different-user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if order is not pending', async () => {
      const order = {
        id: 'order-id',
        buyerId: 'user-id',
        status: 'CONFIRMED',
        event: {
          organizerId: 'organizer-id',
        },
      };

      mockPrismaService.order.findUnique.mockResolvedValue(order);

      await expect(service.cancel('order-id', 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('releaseExpiredOrders', () => {
    it('should release expired pending orders', async () => {
      const expiredOrders = [
        {
          id: 'order-1',
          items: [{ ticketId: 'ticket-1', quantity: 2 }],
        },
      ];

      mockPrismaService.order.findMany.mockResolvedValue(expiredOrders);
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      await service.releaseExpiredOrders();

      expect(mockPrismaService.order.findMany).toHaveBeenCalled();
    });
  });
});
