import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, OrderStatus } from '@prisma/client';

/**
 * E2E Test: Free Events System
 *
 * This test validates the complete free events flow:
 * 1. Create free event with free tickets
 * 2. Users register/claim free tickets
 * 3. No payment required - tickets issued immediately
 * 4. No service fees for free tickets
 * 5. Capacity and validation still apply
 * 6. Ticket instances created immediately
 * 7. Mixed events (free + paid tickets)
 * 8. Order goes directly to CONFIRMED status
 * 9. QR codes generated for free tickets
 * 10. Attendee information still required
 */
describe('Free Events System - E2E', () => {
  const baseURL = TestUtils.baseURL;
  const TEST_BUYER_EMAIL = '0xzionmount@gmail.com';

  let organizerToken: string;
  let organizerId: string;
  let attendee1Token: string;
  let attendee1Id: string;
  let attendee2Token: string;
  let attendee2Id: string;
  let freeEventId: string;
  let mixedEventId: string;
  let freeTicketId: string;
  let limitedFreeTicketId: string;
  let paidTicketId: string;
  let freeOrderId: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🎫 Running Free Events E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Create Organizer and Attendees', () => {
    it('should get or create test organizer', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      console.log('✓ Organizer ready');
    });

    it('should get or create attendee 1', async () => {
      const attendee1 = await TestUtils.getOrCreateTestAttendee();
      attendee1Token = attendee1.accessToken;
      attendee1Id = attendee1.user.id;

      expect(attendee1Token).toBeTruthy();
      console.log('✓ Attendee 1 ready');
    });

    it('should register attendee 2', async () => {
      const attendeeEmail = TestUtils.generateEmail('free-attendee2');
      const attendeePassword = 'FreeEvent123!';
      const attendeeCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: attendeeEmail,
          password: attendeePassword,
          name: 'Free Event Attendee Two',
          cpf: attendeeCPF,
          phone: '+5511222222222',
        })
        .expect(201);

      attendee2Token = registerResponse.body.access_token;
      attendee2Id = registerResponse.body.user.id;

      expect(attendee2Token).toBeTruthy();
      console.log('✓ Attendee 2 registered');
    });
  });

  describe('Step 2: Create Free Event', () => {
    it('should create free event', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Community Meetup 2025 - Free Event',
        slug: `community-meetup-2025-free-${timestamp}`,
        description: 'Free community event for networking and learning',
        subject: 'Community',
        category: 'Meetup',
        startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        address: 'Praça da República',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01045-000',
        producerName: 'Community Leaders',
        ticketType: TicketType.FREE, // FREE event
        status: EventStatus.ACTIVE,
        totalCapacity: 100,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      freeEventId = response.body.id;
      expect(response.body.ticketType).toBe(TicketType.FREE);

      console.log('✓ Free event created:', freeEventId);
      console.log('  Type: FREE');
    });
  });

  describe('Step 3: Create Free Tickets', () => {
    it('should create unlimited free ticket', async () => {
      const ticketData = {
        eventId: freeEventId,
        title: 'General Admission - Free',
        description: 'Free entry for all community members',
        type: TicketType.FREE,
        price: 0, // Free!
        quantity: 80,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: true, // No fees on free tickets
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      freeTicketId = response.body.id;
      expect(response.body.type).toBe(TicketType.FREE);
      expect(response.body.price).toBe('0');

      console.log('✓ Free ticket created: 80 available');
      console.log('  Price: R$0.00');
    });

    it('should create limited free ticket', async () => {
      const ticketData = {
        eventId: freeEventId,
        title: 'VIP Seating - Free (Limited)',
        description: 'Limited VIP seating - first come first serve',
        type: TicketType.FREE,
        price: 0,
        quantity: 20,
        minQuantity: 1,
        maxQuantity: 2,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      limitedFreeTicketId = response.body.id;
      expect(response.body.price).toBe('0');

      console.log('✓ Limited free VIP ticket created: 20 available');
    });
  });

  describe('Step 4: Register for Free Event (No Payment)', () => {
    it('should register for free ticket without payment', async () => {
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId,
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Alice Johnson',
                attendeeEmail: TEST_BUYER_EMAIL,
                attendeeCpf: '11111111111',
                attendeePhone: '+5511111111111',
                formResponses: {},
              },
              {
                attendeeName: 'Bob Smith',
                attendeeEmail: 'bob@example.com',
                attendeeCpf: '22222222222',
                attendeePhone: '+5511222222222',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Alice Johnson',
        buyerEmail: TEST_BUYER_EMAIL,
        buyerPhone: '+5511111111111',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(201);

      freeOrderId = response.body.id;

      // Verify free order details
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body.eventId).toBe(freeEventId);
      expect(response.body.subtotal).toBe('0'); // FREE!
      expect(response.body.discount).toBe('0');
      expect(response.body.serviceFee).toBe('0'); // No fees
      expect(response.body.platformFee).toBe('0');
      expect(response.body.total).toBe('0'); // Total is 0
      expect(response.body.status).toBe(OrderStatus.CONFIRMED); // Free orders are CONFIRMED immediately
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(2);
      expect(response.body.items[0].unitPrice).toBe('0');
      expect(response.body.items[0].totalPrice).toBe('0');

      console.log('✓ Free ticket registered successfully');
      console.log(`  Order #${response.body.orderNumber}`);
      console.log('  Subtotal: R$0.00');
      console.log('  Service Fee: R$0.00');
      console.log('  Total: R$0.00');
      console.log(`  Status: ${response.body.status}`);
    });

    it('should verify tickets are sold immediately for free order', async () => {
      const ticket = await TestUtils.prisma.ticket.findUnique({
        where: { id: freeTicketId },
      });

      expect(ticket?.quantitySold).toBeGreaterThanOrEqual(2); // Free orders increment sold immediately
      expect(ticket?.quantityReserved).toBe(0); // No reservation for free orders

      console.log(`✓ Tickets sold immediately: ${ticket?.quantitySold}`);
    });
  });

  describe('Step 5: Multiple Free Registrations', () => {
    it('should allow multiple users to register for free event', async () => {
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId,
            quantity: 3,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Charlie Brown',
                attendeeEmail: 'charlie@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Diana Prince',
                attendeeEmail: 'diana@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Eve Wilson',
                attendeeEmail: 'eve@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.total).toBe('0');
      expect(response.body.items[0].quantity).toBe(3);

      console.log('✓ Second attendee registered: 3 tickets');
    });
  });

  describe('Step 6: Validation Still Applies to Free Tickets', () => {
    it('should REJECT when exceeding max quantity', async () => {
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId, // maxQuantity = 5
            quantity: 6, // Exceeds max
            isHalfPrice: false,
            attendees: Array(6).fill(null).map((_, i) => ({
              attendeeName: `Attendee ${i + 1}`,
              attendeeEmail: `attendee${i + 1}@example.com`,
              formResponses: {},
            })),
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Maximum quantity');

      console.log('✓ Free ticket rejected: Exceeds max quantity');
    });

    it('should REJECT when not enough free tickets available', async () => {
      // Try to get all remaining tickets + 1 more
      const ticket = await TestUtils.prisma.ticket.findUnique({
        where: { id: limitedFreeTicketId },
      });

      const available =
        (ticket?.quantity || 0) -
        (ticket?.quantityReserved || 0) -
        (ticket?.quantitySold || 0);

      if (available > 0 && available <= 2) {
        const orderData = {
          eventId: freeEventId,
          items: [
            {
              ticketId: limitedFreeTicketId,
              quantity: available + 1, // Try to get more than available
              isHalfPrice: false,
              attendees: Array(available + 1).fill(null).map((_, i) => ({
                attendeeName: `Attendee ${i + 1}`,
                attendeeEmail: `attendee${i + 1}@example.com`,
                formResponses: {},
              })),
            },
          ],
        };

        const response = await request(baseURL)
          .post('/orders')
          .set('Authorization', `Bearer ${attendee1Token}`)
          .send(orderData)
          .expect(400);

        expect(response.body.message).toContain('Not enough tickets available');

        console.log('✓ Free ticket rejected: Not enough available');
      } else {
        console.log('✓ Skipped: Sufficient tickets available');
      }
    });

    it('should REJECT when attendees count does not match quantity', async () => {
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId,
            quantity: 4,
            isHalfPrice: false,
            attendees: [
              // Only 2 attendees for 4 tickets
              {
                attendeeName: 'Person One',
                attendeeEmail: 'one@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Person Two',
                attendeeEmail: 'two@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Expected 4 attendee(s), but received 2');

      console.log('✓ Free ticket rejected: Attendees count mismatch');
    });
  });

  describe('Step 7: Event Capacity Limits', () => {
    it('should respect event total capacity for free tickets', async () => {
      // Get current capacity usage
      const orders = await TestUtils.prisma.order.findMany({
        where: {
          eventId: freeEventId,
          status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.COMPLETED] },
        },
        include: {
          items: true,
        },
      });

      const totalTicketsOrdered = orders.reduce(
        (sum, order) =>
          sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0
      );

      console.log(`✓ Current capacity usage: ${totalTicketsOrdered}/100 tickets`);
      expect(totalTicketsOrdered).toBeLessThanOrEqual(100);
    });
  });

  describe('Step 8: View Free Event Orders', () => {
    it('should list free event orders', async () => {
      const response = await request(baseURL)
        .get('/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Find the free order
      const freeOrder = response.body.data.find((o: any) => o.id === freeOrderId);
      expect(freeOrder).toBeTruthy();
      expect(freeOrder.total).toBe('0');

      console.log('✓ Free orders listed successfully');
      console.log(`  Found ${response.body.data.length} orders`);
    });

    it('should get free order details', async () => {
      const response = await request(baseURL)
        .get(`/orders/${freeOrderId}`)
        .set('Authorization', `Bearer ${attendee1Token}`)
        .expect(200);

      expect(response.body.id).toBe(freeOrderId);
      expect(response.body.total).toBe('0');
      expect(response.body.subtotal).toBe('0');
      expect(response.body.serviceFee).toBe('0');
      expect(response.body.event.ticketType).toBe(TicketType.FREE);

      console.log('✓ Free order details retrieved');
      console.log(`  Order #${response.body.orderNumber}`);
      console.log(`  Status: ${response.body.status}`);
    });
  });

  describe('Step 9: Cancel Free Event Registration', () => {
    it('should cancel free event registration', async () => {
      // Create a temporary free order to cancel
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Cancel Test',
                attendeeEmail: 'cancel@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const createResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(201);

      const tempOrderId = createResponse.body.id;

      // Cancel the order
      const cancelResponse = await request(baseURL)
        .post(`/orders/${tempOrderId}/cancel`)
        .set('Authorization', `Bearer ${attendee1Token}`)
        .expect(201);

      expect(cancelResponse.body.message).toContain('cancelled successfully');

      // Verify order is cancelled
      const orderResponse = await request(baseURL)
        .get(`/orders/${tempOrderId}`)
        .set('Authorization', `Bearer ${attendee1Token}`)
        .expect(200);

      expect(orderResponse.body.status).toBe(OrderStatus.CANCELLED);

      console.log('✓ Free order cancelled successfully');
    });
  });

  describe('Step 10: Mixed Event (Free + Paid Tickets)', () => {
    it('should create mixed event with both free and paid tickets', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Tech Conference 2025 - Mixed Tickets',
        slug: `tech-conference-2025-mixed-${timestamp}`,
        description: 'Conference with both free and paid options',
        subject: 'Technology',
        category: 'Conference',
        startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'São Paulo',
        state: 'SP',
        producerName: 'Tech Events Inc',
        ticketType: TicketType.BOTH, // Mixed
        status: EventStatus.ACTIVE,
        totalCapacity: 150,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      mixedEventId = response.body.id;
      expect(response.body.ticketType).toBe(TicketType.BOTH);

      console.log('✓ Mixed event created:', mixedEventId);
      console.log('  Type: BOTH (Free + Paid)');
    });

    it('should create free ticket for mixed event', async () => {
      const ticketData = {
        eventId: mixedEventId,
        title: 'Online Access - Free',
        description: 'Free online streaming access',
        type: TicketType.FREE,
        price: 0,
        quantity: 100,
        minQuantity: 1,
        maxQuantity: 1,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 19 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.type).toBe(TicketType.FREE);
      expect(response.body.price).toBe('0');

      console.log('✓ Free ticket created for mixed event');
    });

    it('should create paid ticket for mixed event', async () => {
      const ticketData = {
        eventId: mixedEventId,
        title: 'In-Person VIP - Paid',
        description: 'VIP in-person access with perks',
        type: TicketType.PAID,
        price: 250.0,
        quantity: 50,
        minQuantity: 1,
        maxQuantity: 3,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 19 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        serviceFeePercentage: 5.0,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      paidTicketId = response.body.id;
      expect(response.body.type).toBe(TicketType.PAID);
      expect(response.body.price).toBe('250');

      console.log('✓ Paid ticket created for mixed event: R$250');
    });

    it('should verify mixed event has both ticket types', async () => {
      const response = await request(baseURL)
        .get(`/tickets?eventId=${mixedEventId}&limit=10`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);

      const freeTicket = response.body.data.find((t: any) => t.type === TicketType.FREE);
      const paidTicket = response.body.data.find((t: any) => t.type === TicketType.PAID);

      expect(freeTicket).toBeTruthy();
      expect(paidTicket).toBeTruthy();
      expect(freeTicket.price).toBe('0');
      expect(paidTicket.price).toBe('250');

      console.log('✓ Mixed event verified: 1 Free + 1 Paid ticket');
    });
  });

  describe('Step 11: Free Ticket Validation and Edge Cases', () => {
    it('should reject creating FREE ticket with non-zero price', async () => {
      const timestamp = Date.now();
      const ticketData = {
        eventId: freeEventId,
        title: `Invalid Free Ticket ${timestamp}`,
        description: 'FREE ticket type must have price = 0',
        type: TicketType.FREE,
        price: 50, // Invalid! FREE tickets must be price 0
        quantity: 10,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(400);

      const errorMessage = Array.isArray(response.body.message)
        ? response.body.message.join(', ')
        : response.body.message;
      expect(errorMessage).toMatch(/free.*ticket.*price.*equal.*0|price.*must.*be.*0/i);
      console.log('✓ Validation: Rejected FREE ticket with non-zero price');
      console.log(`  - Error: ${errorMessage}`);
    }, 30000);

    it('should reject creating PAID ticket with zero price', async () => {
      const timestamp = Date.now();
      const ticketData = {
        eventId: mixedEventId,
        title: `Invalid Paid Ticket ${timestamp}`,
        description: 'PAID ticket type must have price > 0',
        type: TicketType.PAID,
        price: 0, // Invalid! PAID tickets must have price > 0
        quantity: 10,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(400);

      const errorMessage = Array.isArray(response.body.message)
        ? response.body.message.join(', ')
        : response.body.message;
      expect(errorMessage).toMatch(/paid.*ticket.*price.*greater|price.*greater.*than.*0/i);
      console.log('✓ Validation: Rejected PAID ticket with zero price');
      console.log(`  - Error: ${errorMessage}`);
    }, 30000);

    it('should reject order below min quantity for free tickets', async () => {
      // freeTicketId has minQuantity = 1
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: freeTicketId,
            quantity: 0, // Below minimum
            isHalfPrice: false,
            attendees: [],
          },
        ],
        buyerName: 'Test Buyer',
        buyerEmail: TEST_BUYER_EMAIL,
        buyerPhone: '+5511111111111',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(400);

      const errorMessage = Array.isArray(response.body.message)
        ? response.body.message.join(', ')
        : response.body.message;
      expect(errorMessage).toMatch(/minimum.*quantity|quantity.*must.*not.*be.*less|quantity.*must.*be.*at.*least/i);
      console.log('✓ Validation: Rejected order below min quantity');
    }, 30000);

    it('should verify free order has zero service fees', async () => {
      // Get the free order we created
      const order = await TestUtils.prisma.order.findUnique({
        where: { id: freeOrderId },
      });

      expect(order).toBeTruthy();
      expect(Number(order?.serviceFee || 0)).toBe(0);
      expect(Number(order?.total || 0)).toBe(0);
      expect(Number(order?.subtotal || 0)).toBe(0);

      console.log('✓ Verified: Free order has zero service fees');
      console.log(`  - Service Fee: R$${order?.serviceFee}`);
      console.log(`  - Total: R$${order?.total}`);
    }, 30000);

    it('should verify free order status is CONFIRMED (not PENDING)', async () => {
      const order = await TestUtils.prisma.order.findUnique({
        where: { id: freeOrderId },
      });

      // Free orders should be CONFIRMED immediately, not waiting for payment
      expect(order?.status).toBe(OrderStatus.CONFIRMED);
      console.log('✓ Verified: Free order status is CONFIRMED');
      console.log(`  - Status: ${order?.status}`);
    }, 30000);

    it('should verify ticket instances created immediately for free orders', async () => {
      const ticketInstances = await TestUtils.prisma.ticketInstance.findMany({
        where: {
          orderItem: {
            orderId: freeOrderId,
          },
        },
      });

      // Free orders should have tickets created immediately
      expect(ticketInstances.length).toBeGreaterThan(0);
      expect(ticketInstances.every(ti => ti.qrCode)).toBe(true);

      console.log('✓ Verified: Ticket instances created immediately');
      console.log(`  - Total tickets: ${ticketInstances.length}`);
      console.log(`  - All have QR codes: ${ticketInstances.every(ti => ti.qrCode)}`);
    }, 30000);

    it('should reject free ticket registration outside sales period', async () => {
      const timestamp = Date.now();

      // Create a ticket with sales period that has ended
      const pastTicketData = {
        eventId: freeEventId,
        title: `Past Sales Free Ticket ${timestamp}`,
        description: 'Sales period has ended',
        type: TicketType.FREE,
        price: 0,
        quantity: 10,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        salesEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        isVisible: true,
      };

      const ticketResponse = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(pastTicketData)
        .expect(201);

      const pastTicketId = ticketResponse.body.id;

      // Try to register for this ticket (sales ended)
      const orderData = {
        eventId: freeEventId,
        items: [
          {
            ticketId: pastTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Late Buyer',
                attendeeEmail: 'late@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Late Buyer',
        buyerEmail: 'late@example.com',
        buyerPhone: '+5511999999999',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendee1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toMatch(/sales.*ended|ticket.*not.*available|sales.*period/i);
      console.log('✓ Validation: Rejected registration outside sales period');
    }, 30000);
  });

  describe('Step 12: Statistics and Summary', () => {
    it('should verify free event statistics', async () => {
      const event = await TestUtils.prisma.event.findUnique({
        where: { id: freeEventId },
        include: {
          tickets: true,
          orders: {
            where: {
              status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
            },
            include: {
              items: true,
            },
          },
        },
      });

      expect(event).toBeTruthy();
      expect(event?.ticketType).toBe(TicketType.FREE);

      const totalRegistrations = event?.orders.reduce(
        (sum, order) =>
          sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0
      );

      console.log('\n📊 Free Event Summary:');
      console.log(`  Event: ${event?.title}`);
      console.log(`  Type: ${event?.ticketType}`);
      console.log(`  Total Capacity: ${event?.totalCapacity}`);
      console.log(`  Total Registrations: ${totalRegistrations}`);
      console.log(`  Total Orders: ${event?.orders.length}`);
      console.log(`  Tickets Types: ${event?.tickets.length}`);
    });
  });
});
