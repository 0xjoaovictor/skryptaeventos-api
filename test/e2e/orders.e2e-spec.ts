import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, OrderStatus } from '@prisma/client';

/**
 * E2E Test: Orders System
 *
 * This test validates the complete orders flow:
 * 1. Create orders with single and multiple items
 * 2. Order validation (capacity, availability, sales period)
 * 3. Half-price tickets
 * 4. Order expiration
 * 5. Order cancellation
 * 6. View and list orders
 * 7. Order updates
 * 8. Service fees calculation
 * 9. Reserved tickets management
 * 10. Attendee information validation
 */
describe('Orders System - E2E', () => {
  const baseURL = TestUtils.baseURL;
  const TEST_BUYER_EMAIL = '0xzionmount@gmail.com';

  let organizerToken: string;
  let organizerId: string;
  let buyer1Token: string;
  let buyer1Id: string;
  let buyer2Token: string;
  let buyer2Id: string;
  let eventId: string;
  let regularTicketId: string;
  let vipTicketId: string;
  let halfPriceTicketId: string;
  let limitedTicketId: string;
  let order1Id: string;
  let order2Id: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n📦 Running Orders E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Create Event, Tickets, and Users', () => {
    it('should get or create test organizer', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      console.log('✓ Organizer ready');
    });

    it('should create event', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Conference 2025 - Orders Test',
        slug: `conference-2025-orders-${timestamp}`,
        description: 'Test event for orders functionality',
        subject: 'Technology',
        category: 'Conference',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'São Paulo',
        state: 'SP',
        producerName: 'Test Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 20, // Limited capacity for testing
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventId = response.body.id;
      console.log('✓ Event created:', eventId);
    });

    it('should create regular ticket (R$100, 10 available)', async () => {
      const ticketData = {
        eventId,
        title: 'Regular Ticket',
        description: 'Standard admission',
        type: TicketType.PAID,
        price: 100.0,
        quantity: 10,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        serviceFeePercentage: 3.0,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      regularTicketId = response.body.id;
      console.log('✓ Regular ticket created: R$100');
    });

    it('should create VIP ticket (R$300, 5 available)', async () => {
      const ticketData = {
        eventId,
        title: 'VIP Ticket',
        description: 'Premium admission with perks',
        type: TicketType.PAID,
        price: 300.0,
        quantity: 5,
        minQuantity: 1,
        maxQuantity: 3,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        serviceFeePercentage: 5.0,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      vipTicketId = response.body.id;
      console.log('✓ VIP ticket created: R$300');
    });

    it('should create ticket with half-price option', async () => {
      const ticketData = {
        eventId,
        title: 'Student Ticket',
        description: 'For students with valid ID',
        type: TicketType.PAID,
        price: 150.0,
        quantity: 8,
        minQuantity: 1,
        maxQuantity: 2,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: true,
        hasHalfPrice: true,
        halfPrice: 75.0,
        halfPriceQuantity: 4,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      halfPriceTicketId = response.body.id;
      console.log('✓ Half-price ticket created: R$150 / R$75');
    });

    it('should create limited quantity ticket (only 2 available)', async () => {
      const ticketData = {
        eventId,
        title: 'Early Bird',
        description: 'Limited early bird special',
        type: TicketType.PAID,
        price: 80.0,
        quantity: 2,
        minQuantity: 1,
        maxQuantity: 2,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      limitedTicketId = response.body.id;
      console.log('✓ Limited ticket created: 2 available');
    });

    it('should get or create buyer 1', async () => {
      const buyer1 = await TestUtils.getOrCreateTestAttendee();
      buyer1Token = buyer1.accessToken;
      buyer1Id = buyer1.user.id;

      expect(buyer1Token).toBeTruthy();
      console.log('✓ Buyer 1 ready');
    });

    it('should register buyer 2', async () => {
      const buyerEmail = TestUtils.generateEmail('order-buyer2');
      const buyerPassword = 'OrderTest123!';
      const buyerCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyerEmail,
          password: buyerPassword,
          name: 'Order Buyer Two',
          cpf: buyerCPF,
          phone: '+5511222222222',
        })
        .expect(201);

      buyer2Token = registerResponse.body.access_token;
      buyer2Id = registerResponse.body.user.id;

      expect(buyer2Token).toBeTruthy();
      console.log('✓ Buyer 2 registered');
    });
  });

  describe('Step 2: Create Simple Orders', () => {
    it('should create order with single ticket', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'John Doe',
                attendeeEmail: TEST_BUYER_EMAIL,
                attendeeCpf: '11111111111',
                attendeePhone: '+5511111111111',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Order Buyer One',
        buyerEmail: TEST_BUYER_EMAIL,
        buyerPhone: '+5511111111111',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      order1Id = response.body.id;

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body.status).toBe(OrderStatus.PENDING);
      expect(response.body.eventId).toBe(eventId);
      expect(response.body.buyerId).toBe(buyer1Id);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(1);
      expect(response.body.subtotal).toBe('100');
      expect(parseFloat(response.body.serviceFee)).toBeGreaterThan(0);
      expect(parseFloat(response.body.total)).toBeGreaterThan(100);
      expect(response.body).toHaveProperty('expiresAt');

      console.log('✓ Single ticket order created');
      console.log(`  Order #${response.body.orderNumber}`);
      console.log(`  Subtotal: R$${response.body.subtotal}`);
      console.log(`  Service Fee: R$${response.body.serviceFee}`);
      console.log(`  Total: R$${response.body.total}`);
    });

    it('should create order with multiple tickets of same type', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 3,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Alice Smith',
                attendeeEmail: 'alice@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Bob Johnson',
                attendeeEmail: 'bob@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Carol Williams',
                attendeeEmail: 'carol@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      order2Id = response.body.id;

      expect(response.body.items[0].quantity).toBe(3);
      expect(response.body.subtotal).toBe('300'); // 3 * 100
      expect(response.body.items[0].attendeesData).toHaveLength(3);

      console.log('✓ Multiple tickets order created: 3x Regular');
      console.log(`  Subtotal: R$${response.body.subtotal}`);
    });
  });

  describe('Step 3: Create Mixed Order (Multiple Ticket Types)', () => {
    it('should create order with different ticket types', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Regular Attendee',
                attendeeEmail: 'regular@example.com',
                formResponses: {},
              },
            ],
          },
          {
            ticketId: vipTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'VIP Attendee',
                attendeeEmail: 'vip@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.subtotal).toBe('400'); // 100 + 300

      // Find items
      const regularItem = response.body.items.find((i: any) => i.ticketId === regularTicketId);
      const vipItem = response.body.items.find((i: any) => i.ticketId === vipTicketId);

      expect(regularItem.unitPrice).toBe('100');
      expect(vipItem.unitPrice).toBe('300');

      console.log('✓ Mixed order created: 1x Regular + 1x VIP');
      console.log(`  Subtotal: R$${response.body.subtotal}`);
    });
  });

  describe('Step 4: Half-Price Tickets', () => {
    it('should create order with half-price ticket', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: halfPriceTicketId,
            quantity: 1,
            isHalfPrice: true, // Request half-price
            attendees: [
              {
                attendeeName: 'Student Name',
                attendeeEmail: 'student@university.edu',
                attendeeCpf: '12345678901',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.items[0].isHalfPrice).toBe(true);
      expect(response.body.items[0].unitPrice).toBe('75'); // Half price
      expect(response.body.subtotal).toBe('75');

      console.log('✓ Half-price order created: R$75 (meia-entrada)');
    });

    it('should create order mixing half-price AND full-price of SAME ticket type', async () => {
      // This tests a common real-world scenario:
      // A group buying tickets where some qualify for half-price (students) and some don't

      // First, create a dedicated ticket with enough inventory for this test
      const mixedTicketData = {
        eventId,
        title: 'Mixed Price Test Ticket',
        description: 'For testing mixed half/full price orders',
        type: TicketType.PAID,
        price: 150.0,
        quantity: 10, // Enough for this test
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        hasHalfPrice: true,
        halfPrice: 75.0,
        halfPriceQuantity: 5, // Enough half-price tickets
      };

      const ticketResponse = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(mixedTicketData)
        .expect(201);

      const mixedTicketId = ticketResponse.body.id;

      // Wait for ticket to be fully persisted
      await new Promise(resolve => setTimeout(resolve, 2000));

      const orderData = {
        eventId,
        items: [
          {
            ticketId: mixedTicketId, // Use the new ticket
            quantity: 2,
            isHalfPrice: false, // Full price
            attendees: [
              {
                attendeeName: 'Regular Person 1',
                attendeeEmail: 'regular1@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Regular Person 2',
                attendeeEmail: 'regular2@example.com',
                formResponses: {},
              },
            ],
          },
          {
            ticketId: mixedTicketId, // Same ticket type
            quantity: 2,
            isHalfPrice: true, // Half price
            attendees: [
              {
                attendeeName: 'Student 1',
                attendeeEmail: 'student1@university.edu',
                attendeeCpf: '11111111111',
                formResponses: {},
              },
              {
                attendeeName: 'Student 2',
                attendeeEmail: 'student2@university.edu',
                attendeeCpf: '22222222222',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData);

      if (response.status !== 201) {
        console.error('Error creating mixed half/full price order:');
        console.error('Status:', response.status);
        console.error('Message:', response.body.message || response.body);
      }
      expect(response.status).toBe(201);

      expect(response.body.items).toHaveLength(2);

      // Find the full-price and half-price items
      const fullPriceItem = response.body.items.find((i: any) => !i.isHalfPrice);
      const halfPriceItem = response.body.items.find((i: any) => i.isHalfPrice);

      expect(fullPriceItem.unitPrice).toBe('150'); // Full price
      expect(fullPriceItem.quantity).toBe(2);
      expect(fullPriceItem.totalPrice).toBe('300'); // 2 * 150

      expect(halfPriceItem.unitPrice).toBe('75'); // Half price
      expect(halfPriceItem.quantity).toBe(2);
      expect(halfPriceItem.totalPrice).toBe('150'); // 2 * 75

      expect(response.body.subtotal).toBe('450'); // 300 + 150

      console.log('✓ Mixed half-price & full-price order created');
      console.log(`  2x Full Price (R$150): R$300`);
      console.log(`  2x Half Price (R$75): R$150`);
      console.log(`  Subtotal: R$${response.body.subtotal}`);
    });

    it('should create complex order: Multiple ticket types + Half-price + VIP', async () => {
      // Ultimate test: Mix everything in one order
      // - Regular ticket (full price)
      // - Student ticket (half price)
      // - Student ticket (full price)
      // - VIP ticket
      // Create fresh tickets for this complex test to ensure inventory

      // Create a Student ticket with half-price option
      const complexStudentTicketData = {
        eventId,
        title: 'Complex Test Student Ticket',
        description: 'For complex order testing',
        type: TicketType.PAID,
        price: 150.0,
        quantity: 5,
        minQuantity: 1,
        maxQuantity: 3,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        hasHalfPrice: true,
        halfPrice: 75.0,
        halfPriceQuantity: 3,
      };

      const complexStudentTicketResponse = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(complexStudentTicketData)
        .expect(201);

      const complexStudentTicketId = complexStudentTicketResponse.body.id;

      // Wait for ticket to be fully persisted
      await new Promise(resolve => setTimeout(resolve, 2000));

      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId, // Use existing regular ticket
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Regular Buyer',
                attendeeEmail: 'regular@example.com',
                formResponses: {},
              },
            ],
          },
          {
            ticketId: complexStudentTicketId, // New ticket
            quantity: 1,
            isHalfPrice: true,
            attendees: [
              {
                attendeeName: 'Student (Half Price)',
                attendeeEmail: 'student-half@university.edu',
                attendeeCpf: '33333333333',
                formResponses: {},
              },
            ],
          },
          {
            ticketId: complexStudentTicketId, // Same new ticket, full price
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Student (Full Price)',
                attendeeEmail: 'student-full@example.com',
                formResponses: {},
              },
            ],
          },
          {
            ticketId: vipTicketId, // Use existing VIP ticket
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'VIP Guest',
                attendeeEmail: 'vip@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData);

      if (response.status !== 201) {
        console.error('Error creating complex mixed order:');
        console.error('Status:', response.status);
        console.error('Message:', response.body.message || response.body);
      }
      expect(response.status).toBe(201);

      expect(response.body.items).toHaveLength(4);

      // Calculate expected subtotal
      // Regular: R$100
      // Student (half): R$75
      // Student (full): R$150
      // VIP: R$300
      // Total: R$625
      expect(response.body.subtotal).toBe('625');

      console.log('✓ Complex mixed order created successfully');
      console.log(`  Items in order: ${response.body.items.length}`);
      console.log(`  1x Regular (R$100)`);
      console.log(`  1x Student Half-Price (R$75)`);
      console.log(`  1x Student Full-Price (R$150)`);
      console.log(`  1x VIP (R$300)`);
      console.log(`  Subtotal: R$${response.body.subtotal}`);
      console.log(`  Total: R$${response.body.total}`);
    });

    it('should REJECT half-price for ticket without half-price option', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId, // Does not have half-price
            quantity: 1,
            isHalfPrice: true,
            attendees: [
              {
                attendeeName: 'Test',
                attendeeEmail: 'test@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Half-price tickets not available');

      console.log('✓ Half-price rejected for incompatible ticket');
    });
  });

  describe('Step 5: Order Validation', () => {
    it('should REJECT order when quantity exceeds max allowed', async () => {
      // Create dedicated ticket for this test to avoid capacity issues
      const maxQtyTicketData = {
        eventId,
        title: 'Max Quantity Test Ticket',
        description: 'For testing max quantity validation',
        type: TicketType.PAID,
        price: 50.0,
        quantity: 20, // Plenty available
        minQuantity: 1,
        maxQuantity: 5, // Max 5 per purchase
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
      };

      const ticketResponse = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(maxQtyTicketData)
        .expect(201);

      const maxQtyTicketId = ticketResponse.body.id;

      const orderData = {
        eventId,
        items: [
          {
            ticketId: maxQtyTicketId, // maxQuantity = 5
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
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Maximum quantity');

      console.log('✓ Order rejected: Exceeds max quantity per purchase');
    });

    it('should REJECT order when quantity below minimum', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId, // minQuantity = 1
            quantity: 0, // Below min
            isHalfPrice: false,
            attendees: [],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toBeTruthy();

      console.log('✓ Order rejected: Below minimum quantity');
    });

    it('should REJECT order when not enough tickets available', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: limitedTicketId, // Only 2 available
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'First',
                attendeeEmail: 'first@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Second',
                attendeeEmail: 'second@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      // First order should succeed
      await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      console.log('✓ First order: 2 tickets reserved');

      // Second order should fail (sold out)
      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Not enough tickets available');

      console.log('✓ Second order rejected: Tickets sold out');
    });

    it('should REJECT order when attendees count does not match quantity', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 3,
            isHalfPrice: false,
            attendees: [
              // Only 1 attendee, but quantity is 3
              {
                attendeeName: 'Only One',
                attendeeEmail: 'one@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Expected 3 attendee(s), but received 1');

      console.log('✓ Order rejected: Attendees count mismatch');
    });
  });

  describe('Step 6: View and List Orders', () => {
    it('should get order by ID', async () => {
      const response = await request(baseURL)
        .get(`/orders/${order1Id}`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      expect(response.body.id).toBe(order1Id);
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body).toHaveProperty('event');
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('buyer');
      expect(response.body.event.id).toBe(eventId);

      console.log('✓ Order retrieved by ID');
      console.log(`  Order #${response.body.orderNumber}`);
    });

    it('should list user orders with pagination', async () => {
      const response = await request(baseURL)
        .get('/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');

      console.log(`✓ Orders listed: ${response.body.data.length} orders`);
      console.log(`  Total: ${response.body.meta.total}`);
    });

    it('should NOT allow viewing other user orders', async () => {
      await request(baseURL)
        .get(`/orders/${order1Id}`)
        .set('Authorization', `Bearer ${buyer2Token}`) // Different user
        .expect(403);

      console.log('✓ Access control verified: Cannot view other user orders');
    });
  });

  describe('Step 7: Cancel Orders', () => {
    it('should cancel pending order', async () => {
      const response = await request(baseURL)
        .post(`/orders/${order2Id}/cancel`)
        .set('Authorization', `Bearer ${buyer2Token}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('cancelled successfully');

      // Verify order is cancelled
      const orderResponse = await request(baseURL)
        .get(`/orders/${order2Id}`)
        .set('Authorization', `Bearer ${buyer2Token}`)
        .expect(200);

      expect(orderResponse.body.status).toBe(OrderStatus.CANCELLED);

      console.log('✓ Order cancelled successfully');
    });

    it('should release reserved tickets after cancellation', async () => {
      // Get ticket before cancellation
      const ticketBefore = await TestUtils.prisma.ticket.findUnique({
        where: { id: regularTicketId },
      });

      const reservedBefore = ticketBefore?.quantityReserved || 0;

      // Create and cancel order
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Test 1',
                attendeeEmail: 'test1@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Test 2',
                attendeeEmail: 'test2@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const createResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const tempOrderId = createResponse.body.id;

      // Verify tickets are reserved
      const ticketReserved = await TestUtils.prisma.ticket.findUnique({
        where: { id: regularTicketId },
      });

      expect(ticketReserved?.quantityReserved).toBe(reservedBefore + 2);

      // Cancel order
      await request(baseURL)
        .post(`/orders/${tempOrderId}/cancel`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(201);

      // Verify tickets are released
      const ticketAfter = await TestUtils.prisma.ticket.findUnique({
        where: { id: regularTicketId },
      });

      expect(ticketAfter?.quantityReserved).toBe(reservedBefore);

      console.log('✓ Reserved tickets released after cancellation');
    });

    it('should NOT allow cancelling other user orders', async () => {
      await request(baseURL)
        .post(`/orders/${order1Id}/cancel`)
        .set('Authorization', `Bearer ${buyer2Token}`) // Different user
        .expect(403);

      console.log('✓ Access control verified: Cannot cancel other user orders');
    });
  });

  describe('Step 8: Reserved Tickets Management', () => {
    it('should track reserved tickets correctly', async () => {
      // Get initial state
      const ticketBefore = await TestUtils.prisma.ticket.findUnique({
        where: { id: vipTicketId },
      });

      const reservedBefore = ticketBefore?.quantityReserved || 0;
      const availableBefore =
        (ticketBefore?.quantity || 0) -
        (ticketBefore?.quantityReserved || 0) -
        (ticketBefore?.quantitySold || 0);

      // Create order
      const orderData = {
        eventId,
        items: [
          {
            ticketId: vipTicketId,
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'VIP 1',
                attendeeEmail: 'vip1@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'VIP 2',
                attendeeEmail: 'vip2@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      // Verify tickets are reserved
      const ticketAfter = await TestUtils.prisma.ticket.findUnique({
        where: { id: vipTicketId },
      });

      expect(ticketAfter?.quantityReserved).toBe(reservedBefore + 2);

      const availableAfter =
        (ticketAfter?.quantity || 0) -
        (ticketAfter?.quantityReserved || 0) -
        (ticketAfter?.quantitySold || 0);

      expect(availableAfter).toBe(availableBefore - 2);

      console.log('✓ Reserved tickets tracked correctly');
      console.log(`  Reserved: ${reservedBefore} → ${ticketAfter?.quantityReserved}`);
      console.log(`  Available: ${availableBefore} → ${availableAfter}`);
    });
  });

  describe('Step 9: Order Expiration', () => {
    it('should have expiration time set for pending orders', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Expiration Test',
                attendeeEmail: 'expiration@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.expiresAt).toBeTruthy();

      const expiresAt = new Date(response.body.expiresAt);
      const createdAt = new Date(response.body.createdAt);
      const diffMinutes = (expiresAt.getTime() - createdAt.getTime()) / (1000 * 60);

      expect(diffMinutes).toBeGreaterThan(10); // At least 10 minutes
      expect(diffMinutes).toBeLessThanOrEqual(30); // Max 30 minutes

      console.log(`✓ Order expiration set: ${Math.round(diffMinutes)} minutes`);
    });
  });

  describe('Step 10: Service Fees Calculation', () => {
    it('should calculate service fees correctly', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: regularTicketId, // 3% service fee, not absorbed
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Fee Test',
                attendeeEmail: 'fee@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      // R$100 * 3% = R$3.00 service fee
      expect(response.body.subtotal).toBe('100');
      expect(response.body.serviceFee).toBe('3'); // 3% of 100
      expect(response.body.total).toBe('103'); // 100 + 3

      console.log('✓ Service fees calculated correctly');
      console.log(`  Subtotal: R$${response.body.subtotal}`);
      console.log(`  Service Fee (3%): R$${response.body.serviceFee}`);
      console.log(`  Total: R$${response.body.total}`);
    });

    it('should NOT charge service fee when absorbed by organizer', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: halfPriceTicketId, // absorbServiceFee = true
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'No Fee Test',
                attendeeEmail: 'nofee@example.com',
                formResponses: {},
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.subtotal).toBe('150');
      expect(response.body.serviceFee).toBe('0'); // Absorbed
      expect(response.body.total).toBe('150'); // No fee added

      console.log('✓ Service fee absorbed by organizer');
    });
  });

  describe('Step 11: Order Statistics', () => {
    it('should verify total orders created', async () => {
      const response = await request(baseURL)
        .get('/orders?page=1&limit=100')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const totalBuyer1Orders = response.body.meta.total;

      console.log(`✓ Buyer 1 total orders: ${totalBuyer1Orders}`);
      expect(totalBuyer1Orders).toBeGreaterThan(0);
    });
  });
});
