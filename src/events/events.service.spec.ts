import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    event: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    order: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create an event', async () => {
      const createEventDto = {
        title: 'Test Event',
        subject: 'Technology',
        description: 'Test Description',
        startsAt: '2025-01-01T10:00:00.000Z',
        endsAt: '2025-01-02T18:00:00.000Z',
        producerName: 'Test Producer',
        ticketType: 'PAID' as any,
        status: 'DRAFT' as any,
        visibility: 'PUBLIC' as any,
      };

      const userId = 'user-id';
      const userRole = 'ORGANIZER' as any;

      mockPrismaService.event.create.mockResolvedValue({
        id: 'event-id',
        ...createEventDto,
        slug: 'test-event',
        organizerId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createEventDto, userId, userRole);

      expect(result).toHaveProperty('id');
      expect(result.title).toBe(createEventDto.title);
      expect(result.organizerId).toBe(userId);
      expect(mockPrismaService.event.create).toHaveBeenCalled();
    });

    it('should prevent organizer from creating event for another organizer', async () => {
      const createEventDto = {
        title: 'Test Event',
        subject: 'Technology',
        description: 'Test Description',
        startsAt: '2025-01-01T10:00:00.000Z',
        endsAt: '2025-01-02T18:00:00.000Z',
        producerName: 'Test Producer',
        ticketType: 'PAID' as any,
        status: 'DRAFT' as any,
        visibility: 'PUBLIC' as any,
        organizerId: 'other-organizer-id',
      };

      const userId = 'user-id';
      const userRole = 'ORGANIZER' as any;

      await expect(service.create(createEventDto, userId, userRole)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to create event for any organizer', async () => {
      const createEventDto = {
        title: 'Test Event',
        subject: 'Technology',
        description: 'Test Description',
        startsAt: '2025-01-01T10:00:00.000Z',
        endsAt: '2025-01-02T18:00:00.000Z',
        producerName: 'Test Producer',
        ticketType: 'PAID' as any,
        status: 'DRAFT' as any,
        visibility: 'PUBLIC' as any,
        organizerId: 'other-organizer-id',
      };

      const userId = 'admin-id';
      const userRole = 'ADMIN' as any;

      mockPrismaService.event.create.mockResolvedValue({
        id: 'event-id',
        ...createEventDto,
        slug: 'test-event',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createEventDto, userId, userRole);

      expect(result.organizerId).toBe('other-organizer-id');
    });

    it('should generate slug from title', async () => {
      const createEventDto = {
        title: 'Amazing Tech Conference 2024',
        subject: 'Technology',
        description: 'Test Description',
        startsAt: '2025-01-01T10:00:00.000Z',
        endsAt: '2025-01-02T18:00:00.000Z',
        producerName: 'Test Producer',
        ticketType: 'PAID' as any,
        status: 'DRAFT' as any,
        visibility: 'PUBLIC' as any,
      };

      mockPrismaService.event.create.mockImplementation((args) => {
        return Promise.resolve({
          id: 'event-id',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      await service.create(createEventDto, 'user-id', 'ORGANIZER' as any);

      const callArgs = mockPrismaService.event.create.mock.calls[0][0];
      expect(callArgs.data.slug).toContain('amazing');
    });
  });

  describe('findAll', () => {
    it('should return paginated events', async () => {
      const events = [
        {
          id: '1',
          title: 'Event 1',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
        },
        {
          id: '2',
          title: 'Event 2',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
        },
      ];

      mockPrismaService.event.findMany.mockResolvedValue(events);
      mockPrismaService.event.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const activeEvents = [
        { id: '1', title: 'Active Event', status: 'ACTIVE' },
      ];

      mockPrismaService.event.findMany.mockResolvedValue(activeEvents);
      mockPrismaService.event.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10, status: 'ACTIVE' as any });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('ACTIVE');
    });

    it('should filter by organizer', async () => {
      const organizerEvents = [
        { id: '1', title: 'My Event', organizerId: 'organizer-id' },
      ];

      mockPrismaService.event.findMany.mockResolvedValue(organizerEvents);
      mockPrismaService.event.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10, organizerId: 'organizer-id' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].organizerId).toBe('organizer-id');
    });
  });

  describe('findOne', () => {
    it('should return an event by id', async () => {
      const event = {
        id: 'event-id',
        title: 'Test Event',
        description: 'Test Description',
        status: 'ACTIVE',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);

      const result = await service.findOne('event-id');

      expect(result).toEqual(event);
    });

    it('should throw NotFoundException if event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should successfully update an event', async () => {
      const updateEventDto = {
        title: 'Updated Event',
        description: 'Updated Description',
      };

      const existingEvent = {
        id: 'event-id',
        title: 'Old Event',
        organizerId: 'organizer-id',
      };

      const updatedEvent = {
        ...existingEvent,
        ...updateEventDto,
      };

      mockPrismaService.event.findUnique.mockResolvedValue(existingEvent);
      mockPrismaService.event.update.mockResolvedValue(updatedEvent);

      const result = await service.update('event-id', updateEventDto, 'organizer-id', 'ORGANIZER' as any);

      expect(result.title).toBe(updateEventDto.title);
    });

    it('should throw NotFoundException if event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', { title: 'New Title' }, 'user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent unauthorized update', async () => {
      const existingEvent = {
        id: 'event-id',
        organizerId: 'owner-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(existingEvent);

      await expect(
        service.update('event-id', { title: 'New Title' }, 'different-user-id', 'ORGANIZER' as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update any event', async () => {
      const existingEvent = {
        id: 'event-id',
        organizerId: 'owner-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(existingEvent);
      mockPrismaService.event.update.mockResolvedValue({
        ...existingEvent,
        title: 'Updated by Admin',
      });

      const result = await service.update('event-id', { title: 'Updated by Admin' }, 'admin-id', 'ADMIN' as any);

      expect(result.title).toBe('Updated by Admin');
    });
  });

  describe('remove', () => {
    it('should successfully delete an event', async () => {
      const event = {
        id: 'event-id',
        organizerId: 'organizer-id',
        title: 'Test Event',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.event.delete.mockResolvedValue(event);

      const result = await service.remove('event-id', 'organizer-id', 'ORGANIZER' as any);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Event deleted successfully');
    });

    it('should throw NotFoundException if event not found', async () => {
      mockPrismaService.event.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent-id', 'user-id', 'ORGANIZER' as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should prevent unauthorized deletion', async () => {
      const event = {
        id: 'event-id',
        organizerId: 'owner-id',
      };

      mockPrismaService.event.findUnique.mockResolvedValue(event);

      await expect(service.remove('event-id', 'different-user-id', 'ORGANIZER' as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
