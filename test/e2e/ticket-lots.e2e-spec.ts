import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType } from '@prisma/client';

/**
 * E2E Test: Ticket Lots (Batches) System
 *
 * This test validates the ticket lots flow common in Brazilian events:
 * - Lot 1: 2 tickets at R$100 each (First batch - cheapest)
 * - Lot 2: 3 tickets at R$200 each (Second batch - medium price)
 * - Lot 3: 4 tickets at R$300 each (Third batch - most expensive)
 *
 * Flow:
 * 1. Organizer creates event
 * 2. Organizer creates 3 ticket types (lots)
 * 3. Users buy tickets from Lot 1 until sold out
 * 4. Users buy tickets from Lot 2 until sold out
 * 5. Users buy tickets from Lot 3
 * 6. Verify pricing and inventory management
 */
describe('Ticket Lots (Batches) System - E2E', () => {
  const baseURL = TestUtils.baseURL;
  const TEST_BUYER_EMAIL = '0xzionmount@gmail.com';

  let organizerToken: string;
  let organizerId: string;
  let buyer1Token: string;
  let buyer1Id: string;
  let buyer2Token: string;
  let buyer2Id: string;
  let buyer3Token: string;
  let buyer3Id: string;
  let eventId: string;
  let lot1TicketId: string;
  let lot2TicketId: string;
  let lot3TicketId: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🎫 Running Ticket Lots E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Create Organizer and Buyers', () => {
    it('should get or create test organizer with ASAAS account', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      expect(organizerId).toBeTruthy();

      console.log('✓ Organizer ready:', organizer.user.email);
    });

    it('should get or create buyer 1 (will buy Lot 1)', async () => {
      const buyer1 = await TestUtils.getOrCreateTestAttendee();
      buyer1Token = buyer1.accessToken;
      buyer1Id = buyer1.user.id;

      expect(buyer1Token).toBeTruthy();
      console.log('✓ Buyer 1 ready:', buyer1.user.email);
    });

    it('should register buyer 2 (will buy Lot 2)', async () => {
      const buyerEmail = TestUtils.generateEmail('buyer2-lots');
      const buyerPassword = 'Buyer2Pass123!';
      const buyerCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyerEmail,
          password: buyerPassword,
          name: 'Buyer Two - Lot 2',
          cpf: buyerCPF,
          phone: '+5511222222222',
        })
        .expect(201);

      buyer2Token = registerResponse.body.access_token;
      buyer2Id = registerResponse.body.user.id;

      expect(buyer2Token).toBeTruthy();
      console.log('✓ Buyer 2 registered:', buyerEmail);
    });

    it('should register buyer 3 (will buy Lot 3)', async () => {
      const buyerEmail = TestUtils.generateEmail('buyer3-lots');
      const buyerPassword = 'Buyer3Pass123!';
      const buyerCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyerEmail,
          password: buyerPassword,
          name: 'Buyer Three - Lot 3',
          cpf: buyerCPF,
          phone: '+5511333333333',
        })
        .expect(201);

      buyer3Token = registerResponse.body.access_token;
      buyer3Id = registerResponse.body.user.id;

      expect(buyer3Token).toBeTruthy();
      console.log('✓ Buyer 3 registered:', buyerEmail);
    });
  });

  describe('Step 2: Create Event', () => {
    it('should create event with ticket lots strategy', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Music Festival 2025 - Ticket Lots Test',
        slug: `music-festival-2025-lots-${timestamp}`,
        description: 'Festival with progressive pricing (lots/batches)',
        subject: 'Music',
        category: 'Festival',
        startsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 62 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        address: 'Parque Ibirapuera',
        locationName: 'Palco Principal',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '04094-050',
        producerName: 'Music Events Ltda',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 9, // 2 + 3 + 4 = 9 total tickets across all lots
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventId = response.body.id;
      expect(eventId).toBeTruthy();

      console.log('✓ Event created successfully:', eventId);
      console.log('  Total Capacity: 9 tickets (2 + 3 + 4)');
    });
  });

  describe('Step 3: Create Ticket Lots', () => {
    it('should create Lot 1 (First Batch) - 2 tickets at R$100', async () => {
      const ticketData = {
        eventId,
        title: 'Lote 1 - Promocional',
        description: 'Primeiro lote - quantidade limitada!',
        type: TicketType.PAID,
        price: 100.0,
        quantity: 2, // Only 2 tickets in first batch
        minQuantity: 1,
        maxQuantity: 2,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        displayOrder: 0,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      lot1TicketId = response.body.id;
      expect(lot1TicketId).toBeTruthy();
      expect(response.body.price).toBe('100');
      expect(response.body.quantity).toBe(2);

      console.log('✓ Lot 1 created: 2 tickets at R$100');
      console.log(`  Ticket ID: ${lot1TicketId}`);
    });

    it('should create Lot 2 (Second Batch) - 3 tickets at R$200', async () => {
      const ticketData = {
        eventId,
        title: 'Lote 2 - Regular',
        description: 'Segundo lote - preço intermediário',
        type: TicketType.PAID,
        price: 200.0,
        quantity: 3, // 3 tickets in second batch
        minQuantity: 1,
        maxQuantity: 3,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        displayOrder: 1,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      lot2TicketId = response.body.id;
      expect(lot2TicketId).toBeTruthy();
      expect(response.body.price).toBe('200');
      expect(response.body.quantity).toBe(3);

      console.log('✓ Lot 2 created: 3 tickets at R$200');
      console.log(`  Ticket ID: ${lot2TicketId}`);
    });

    it('should create Lot 3 (Third Batch) - 4 tickets at R$300', async () => {
      const ticketData = {
        eventId,
        title: 'Lote 3 - Final',
        description: 'Último lote - últimas vagas!',
        type: TicketType.PAID,
        price: 300.0,
        quantity: 4, // 4 tickets in third batch
        minQuantity: 1,
        maxQuantity: 4,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 59 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        displayOrder: 2,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      lot3TicketId = response.body.id;
      expect(lot3TicketId).toBeTruthy();
      expect(response.body.price).toBe('300');
      expect(response.body.quantity).toBe(4);

      console.log('✓ Lot 3 created: 4 tickets at R$300');
      console.log(`  Ticket ID: ${lot3TicketId}`);
    });

    it('should verify all 3 lots are created', async () => {
      const response = await request(baseURL)
        .get(`/tickets?eventId=${eventId}&limit=10`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(3);

      // Verify lots are in correct order
      expect(response.body.data[0].title).toBe('Lote 1 - Promocional');
      expect(response.body.data[0].price).toBe('100');
      expect(response.body.data[1].title).toBe('Lote 2 - Regular');
      expect(response.body.data[1].price).toBe('200');
      expect(response.body.data[2].title).toBe('Lote 3 - Final');
      expect(response.body.data[2].price).toBe('300');

      console.log('✓ All 3 lots verified and ordered correctly');
    });
  });

  describe('Step 4: Sell Out Lot 1 (2 tickets at R$100)', () => {
    it('should allow buyer 1 to purchase 2 tickets from Lot 1', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: lot1TicketId,
            quantity: 2, // Buy all 2 tickets from Lot 1
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Buyer One Attendee 1',
                attendeeEmail: TEST_BUYER_EMAIL,
                attendeeCpf: '11111111111',
                attendeePhone: '+5511111111111',
                formResponses: {},
              },
              {
                attendeeName: 'Buyer One Attendee 2',
                attendeeEmail: TEST_BUYER_EMAIL,
                attendeeCpf: '22222222222',
                attendeePhone: '+5511111111112',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Buyer One',
        buyerEmail: TEST_BUYER_EMAIL,
        buyerPhone: '+5511111111111',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.status).toBe('PENDING');
      expect(response.body.items[0].quantity).toBe(2);
      expect(response.body.items[0].unitPrice).toBe('100');
      expect(response.body.items[0].totalPrice).toBe('200'); // 2 * 100
      expect(response.body.subtotal).toBe('200');

      console.log('✓ Buyer 1 ordered 2 tickets from Lot 1 (R$100 each)');
      console.log(`  Order total: R$${response.body.total}`);
    });

    it('should verify Lot 1 has all tickets reserved (sold out after payment)', async () => {
      const response = await request(baseURL)
        .get(`/tickets/${lot1TicketId}`)
        .expect(200);

      expect(response.body.quantity).toBe(2);
      expect(response.body.quantityReserved).toBe(2); // All 2 reserved
      expect(response.body.quantitySold).toBe(0); // Not sold until payment

      // Calculate available
      const available = response.body.quantity - response.body.quantityReserved - response.body.quantitySold;
      expect(available).toBe(0); // Sold out!

      console.log('✓ Lot 1 is now SOLD OUT (all 2 tickets reserved)');
      console.log(`  Reserved: ${response.body.quantityReserved}/2`);
    });

    it('should REJECT attempt to buy from sold out Lot 1', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: lot1TicketId,
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
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Not enough tickets available');

      console.log('✓ Order correctly rejected - Lot 1 sold out');
    });
  });

  describe('Step 5: Sell Out Lot 2 (3 tickets at R$200)', () => {
    it('should allow buyer 2 to purchase 3 tickets from Lot 2', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: lot2TicketId,
            quantity: 3, // Buy all 3 tickets from Lot 2
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Buyer Two Attendee 1',
                attendeeEmail: 'buyer2@example.com',
                attendeeCpf: '33333333333',
                attendeePhone: '+5511222222221',
                formResponses: {},
              },
              {
                attendeeName: 'Buyer Two Attendee 2',
                attendeeEmail: 'buyer2@example.com',
                attendeeCpf: '44444444444',
                attendeePhone: '+5511222222222',
                formResponses: {},
              },
              {
                attendeeName: 'Buyer Two Attendee 3',
                attendeeEmail: 'buyer2@example.com',
                attendeeCpf: '55555555555',
                attendeePhone: '+5511222222223',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Buyer Two',
        buyerEmail: 'buyer2@example.com',
        buyerPhone: '+5511222222222',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.status).toBe('PENDING');
      expect(response.body.items[0].quantity).toBe(3);
      expect(response.body.items[0].unitPrice).toBe('200');
      expect(response.body.items[0].totalPrice).toBe('600'); // 3 * 200
      expect(response.body.subtotal).toBe('600');

      console.log('✓ Buyer 2 ordered 3 tickets from Lot 2 (R$200 each)');
      console.log(`  Order total: R$${response.body.total}`);
    });

    it('should verify Lot 2 has all tickets reserved (sold out)', async () => {
      const response = await request(baseURL)
        .get(`/tickets/${lot2TicketId}`)
        .expect(200);

      expect(response.body.quantity).toBe(3);
      expect(response.body.quantityReserved).toBe(3); // All 3 reserved
      expect(response.body.quantitySold).toBe(0);

      const available = response.body.quantity - response.body.quantityReserved - response.body.quantitySold;
      expect(available).toBe(0); // Sold out!

      console.log('✓ Lot 2 is now SOLD OUT (all 3 tickets reserved)');
      console.log(`  Reserved: ${response.body.quantityReserved}/3`);
    });
  });

  describe('Step 6: Purchase from Lot 3 (4 tickets at R$300)', () => {
    it('should allow buyer 3 to purchase 2 tickets from Lot 3', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: lot3TicketId,
            quantity: 2, // Buy 2 out of 4 from Lot 3
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Buyer Three Attendee 1',
                attendeeEmail: 'buyer3@example.com',
                attendeeCpf: '66666666666',
                attendeePhone: '+5511333333331',
                formResponses: {},
              },
              {
                attendeeName: 'Buyer Three Attendee 2',
                attendeeEmail: 'buyer3@example.com',
                attendeeCpf: '77777777777',
                attendeePhone: '+5511333333332',
                formResponses: {},
              },
            ],
          },
        ],
        buyerName: 'Buyer Three',
        buyerEmail: 'buyer3@example.com',
        buyerPhone: '+5511333333333',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer3Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.status).toBe('PENDING');
      expect(response.body.items[0].quantity).toBe(2);
      expect(response.body.items[0].unitPrice).toBe('300');
      expect(response.body.items[0].totalPrice).toBe('600'); // 2 * 300
      expect(response.body.subtotal).toBe('600');

      console.log('✓ Buyer 3 ordered 2 tickets from Lot 3 (R$300 each)');
      console.log(`  Order total: R$${response.body.total}`);
    });

    it('should verify Lot 3 has 2 tickets still available', async () => {
      const response = await request(baseURL)
        .get(`/tickets/${lot3TicketId}`)
        .expect(200);

      expect(response.body.quantity).toBe(4);
      expect(response.body.quantityReserved).toBe(2); // 2 reserved
      expect(response.body.quantitySold).toBe(0);

      const available = response.body.quantity - response.body.quantityReserved - response.body.quantitySold;
      expect(available).toBe(2); // 2 still available

      console.log('✓ Lot 3 has 2 tickets remaining');
      console.log(`  Reserved: ${response.body.quantityReserved}/4`);
      console.log(`  Available: ${available}/4`);
    });
  });

  describe('Step 7: Verify Overall Event Status', () => {
    it('should verify event capacity and ticket distribution', async () => {
      // Get all tickets
      const ticketsResponse = await request(baseURL)
        .get(`/tickets?eventId=${eventId}&limit=10`)
        .expect(200);

      const tickets = ticketsResponse.body.data;

      let totalCapacity = 0;
      let totalReserved = 0;
      let totalSold = 0;
      let totalAvailable = 0;

      for (const ticket of tickets) {
        totalCapacity += ticket.quantity;
        totalReserved += ticket.quantityReserved;
        totalSold += ticket.quantitySold;
        totalAvailable += ticket.quantity - ticket.quantityReserved - ticket.quantitySold;
      }

      expect(totalCapacity).toBe(9); // 2 + 3 + 4
      expect(totalReserved).toBe(7); // 2 + 3 + 2
      expect(totalSold).toBe(0); // No payments completed yet
      expect(totalAvailable).toBe(2); // Only 2 tickets left (in Lot 3)

      console.log('\n📊 Event Ticket Summary:');
      console.log(`  Total Capacity: ${totalCapacity} tickets`);
      console.log(`  Reserved (Pending): ${totalReserved} tickets`);
      console.log(`  Sold (Confirmed): ${totalSold} tickets`);
      console.log(`  Available: ${totalAvailable} tickets`);
      console.log('\n💰 Lot Breakdown:');
      console.log(`  Lot 1 (R$100): SOLD OUT - 2/2 reserved`);
      console.log(`  Lot 2 (R$200): SOLD OUT - 3/3 reserved`);
      console.log(`  Lot 3 (R$300): 2/4 available`);
    });

    it('should verify pricing progression across lots', async () => {
      const ticketsResponse = await request(baseURL)
        .get(`/tickets?eventId=${eventId}&limit=10`)
        .expect(200);

      const tickets = ticketsResponse.body.data;

      // Verify prices increase progressively
      expect(parseFloat(tickets[0].price)).toBeLessThan(parseFloat(tickets[1].price));
      expect(parseFloat(tickets[1].price)).toBeLessThan(parseFloat(tickets[2].price));

      // Verify exact prices
      expect(tickets[0].price).toBe('100'); // Lot 1
      expect(tickets[1].price).toBe('200'); // Lot 2
      expect(tickets[2].price).toBe('300'); // Lot 3

      console.log('\n✓ Price progression verified:');
      console.log(`  Lot 1: R$${tickets[0].price}`);
      console.log(`  Lot 2: R$${tickets[1].price} (+100%)`);
      console.log(`  Lot 3: R$${tickets[2].price} (+50%)`);
    });
  });
});
