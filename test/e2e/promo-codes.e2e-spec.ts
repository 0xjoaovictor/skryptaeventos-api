import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, DiscountType } from '@prisma/client';

/**
 * E2E Test: Promo Codes System
 *
 * This test validates the complete promo code flow:
 * 1. Organizer creates event and tickets
 * 2. Organizer creates various promo codes (percentage, fixed, with restrictions)
 * 3. Buyers apply promo codes to orders
 * 4. System validates promo code rules (expiration, limits, minimum order, etc.)
 * 5. Discount is correctly calculated and applied
 *
 * Test scenarios:
 * - Percentage discount with cap
 * - Fixed amount discount
 * - Minimum order value requirement
 * - Maximum uses limit
 * - Per-user usage limit
 * - Expired promo codes
 * - Inactive promo codes
 * - Invalid promo codes
 */
describe('Promo Codes System - E2E', () => {
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
  let ticketId: string;
  let expensiveTicketId: string;

  // Promo code IDs
  let percentagePromoId: string;
  let fixedPromoId: string;
  let minOrderPromoId: string;
  let limitedUsesPromoId: string;
  let expiredPromoId: string;
  let inactivePromoId: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🎟️ Running Promo Codes E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Create Organizer, Event, and Buyers', () => {
    it('should get or create test organizer with ASAAS account', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      expect(organizerId).toBeTruthy();

      console.log('✓ Organizer ready:', organizer.user.email);
    });

    it('should create event for promo code testing', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Tech Workshop 2025 - Promo Codes Test',
        slug: `tech-workshop-2025-promos-${timestamp}`,
        description: 'Workshop with various promo code discounts',
        subject: 'Technology',
        category: 'Workshop',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        address: 'Av. Paulista, 1000',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
        producerName: 'Tech Academy',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 100,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventId = response.body.id;
      expect(eventId).toBeTruthy();

      console.log('✓ Event created:', eventId);
    });

    it('should create regular priced ticket (R$200)', async () => {
      const ticketData = {
        eventId,
        title: 'Regular Ticket',
        description: 'Standard workshop ticket',
        type: TicketType.PAID,
        price: 200.0,
        quantity: 50,
        minQuantity: 1,
        maxQuantity: 5,
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

      ticketId = response.body.id;
      expect(ticketId).toBeTruthy();
      expect(response.body.price).toBe('200');

      console.log('✓ Regular ticket created: R$200');
    });

    it('should create expensive ticket (R$500)', async () => {
      const ticketData = {
        eventId,
        title: 'VIP Ticket',
        description: 'Premium workshop ticket with extras',
        type: TicketType.PAID,
        price: 500.0,
        quantity: 20,
        minQuantity: 1,
        maxQuantity: 3,
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

      expensiveTicketId = response.body.id;
      expect(expensiveTicketId).toBeTruthy();
      expect(response.body.price).toBe('500');

      console.log('✓ VIP ticket created: R$500');
    });

    it('should get or create buyer 1', async () => {
      const buyer1 = await TestUtils.getOrCreateTestAttendee();
      buyer1Token = buyer1.accessToken;
      buyer1Id = buyer1.user.id;

      expect(buyer1Token).toBeTruthy();
      console.log('✓ Buyer 1 ready');
    });

    it('should register buyer 2', async () => {
      const buyerEmail = TestUtils.generateEmail('promo-buyer2');
      const buyerPassword = 'PromoTest123!';
      const buyerCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyerEmail,
          password: buyerPassword,
          name: 'Promo Buyer Two',
          cpf: buyerCPF,
          phone: '+5511222222222',
        })
        .expect(201);

      buyer2Token = registerResponse.body.access_token;
      buyer2Id = registerResponse.body.user.id;

      expect(buyer2Token).toBeTruthy();
      console.log('✓ Buyer 2 registered');
    });

    it('should register buyer 3', async () => {
      const buyerEmail = TestUtils.generateEmail('promo-buyer3');
      const buyerPassword = 'PromoTest123!';
      const buyerCPF = TestUtils.generateCPF();

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyerEmail,
          password: buyerPassword,
          name: 'Promo Buyer Three',
          cpf: buyerCPF,
          phone: '+5511333333333',
        })
        .expect(201);

      buyer3Token = registerResponse.body.access_token;
      buyer3Id = registerResponse.body.user.id;

      expect(buyer3Token).toBeTruthy();
      console.log('✓ Buyer 3 registered');
    });
  });

  describe('Step 2: Create Promo Codes', () => {
    it('should create percentage discount promo (20% off, max R$80)', async () => {
      const promoData = {
        eventId,
        code: 'TECH20',
        description: '20% de desconto - limitado a R$80',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        maxDiscountAmount: 80, // Cap at R$80
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      percentagePromoId = response.body.id;
      expect(response.body.code).toBe('TECH20');
      expect(response.body.discountType).toBe('PERCENTAGE');
      expect(response.body.discountValue).toBe('20');

      console.log('✓ Percentage promo created: TECH20 (20% off, max R$80)');
    });

    it('should create fixed amount promo (R$50 off)', async () => {
      const promoData = {
        eventId,
        code: 'SAVE50',
        description: 'R$50 de desconto fixo',
        discountType: DiscountType.FIXED,
        discountValue: 50,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      fixedPromoId = response.body.id;
      expect(response.body.code).toBe('SAVE50');
      expect(response.body.discountType).toBe('FIXED');
      expect(response.body.discountValue).toBe('50');

      console.log('✓ Fixed promo created: SAVE50 (R$50 off)');
    });

    it('should create promo with minimum order value (R$300 minimum)', async () => {
      const promoData = {
        eventId,
        code: 'BIG100',
        description: 'R$100 off para pedidos acima de R$300',
        discountType: DiscountType.FIXED,
        discountValue: 100,
        minOrderValue: 300,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      minOrderPromoId = response.body.id;
      expect(response.body.code).toBe('BIG100');
      expect(response.body.minOrderValue).toBe('300');

      console.log('✓ Min order promo created: BIG100 (R$100 off, min R$300)');
    });

    it('should create promo with usage limits (max 2 uses)', async () => {
      const promoData = {
        eventId,
        code: 'LIMITED',
        description: 'Apenas 2 usos disponíveis',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        maxUses: 2,
        usesPerUser: 1,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      limitedUsesPromoId = response.body.id;
      expect(response.body.code).toBe('LIMITED');
      expect(response.body.maxUses).toBe(2);

      console.log('✓ Limited promo created: LIMITED (max 2 uses, 1 per user)');
    });

    it('should create expired promo code', async () => {
      const promoData = {
        eventId,
        code: 'EXPIRED',
        description: 'Código expirado',
        discountType: DiscountType.FIXED,
        discountValue: 30,
        validFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        validUntil: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Expired yesterday
        isActive: true,
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      expiredPromoId = response.body.id;
      expect(response.body.code).toBe('EXPIRED');

      console.log('✓ Expired promo created: EXPIRED');
    });

    it('should create inactive promo code', async () => {
      const promoData = {
        eventId,
        code: 'INACTIVE',
        description: 'Código inativo',
        discountType: DiscountType.FIXED,
        discountValue: 40,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: false, // Inactive
      };

      const response = await request(baseURL)
        .post('/promo-codes')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(promoData)
        .expect(201);

      inactivePromoId = response.body.id;
      expect(response.body.code).toBe('INACTIVE');
      expect(response.body.isActive).toBe(false);

      console.log('✓ Inactive promo created: INACTIVE');
    });
  });

  describe('Step 3: Apply Percentage Promo Code (20% off, max R$80)', () => {
    it('should apply TECH20 to R$200 ticket (discount = R$40)', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Test Attendee',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'TECH20',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      // R$200 * 20% = R$40 discount
      expect(response.body.subtotal).toBe('200');
      expect(response.body.discount).toBe('40');
      expect(parseFloat(response.body.total)).toBeLessThan(200);

      console.log('✓ TECH20 applied: R$200 - R$40 = R$160 (+ fees)');
      console.log(`  Total: R$${response.body.total}`);
    });

    it('should cap TECH20 discount at R$80 for R$500 ticket', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId: expensiveTicketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'VIP Attendee',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'TECH20',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      // R$500 * 20% = R$100, but capped at R$80
      expect(response.body.subtotal).toBe('500');
      expect(response.body.discount).toBe('80'); // Capped!
      expect(parseFloat(response.body.total)).toBeLessThan(500);

      console.log('✓ TECH20 capped: R$500 - R$80 (capped) = R$420 (+ fees)');
      console.log(`  Total: R$${response.body.total}`);
    });
  });

  describe('Step 4: Apply Fixed Amount Promo Code (R$50 off)', () => {
    it('should apply SAVE50 to order (R$50 discount)', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Fixed Discount Test',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'SAVE50',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer3Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.subtotal).toBe('200');
      expect(response.body.discount).toBe('50');

      console.log('✓ SAVE50 applied: R$200 - R$50 = R$150 (+ fees)');
      console.log(`  Total: R$${response.body.total}`);
    });
  });

  describe('Step 5: Test Minimum Order Value Requirement', () => {
    it('should REJECT BIG100 for order below R$300', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId, // R$200 ticket
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Min Order Test',
                attendeeEmail: 'test@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'BIG100',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Minimum order value');

      console.log('✓ BIG100 rejected: Order R$200 < min R$300');
    });

    it('should ACCEPT BIG100 for order above R$300', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 2, // 2 * R$200 = R$400
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Attendee 1',
                attendeeEmail: 'test1@example.com',
                formResponses: {},
              },
              {
                attendeeName: 'Attendee 2',
                attendeeEmail: 'test2@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'BIG100',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.subtotal).toBe('400');
      expect(response.body.discount).toBe('100');

      console.log('✓ BIG100 accepted: R$400 - R$100 = R$300 (+ fees)');
      console.log(`  Total: R$${response.body.total}`);
    });
  });

  describe('Step 6: Test Usage Limits', () => {
    it('should allow first use of LIMITED promo by buyer1', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Limited Use 1',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'LIMITED',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.discount).toBe('30'); // 15% of R$200

      console.log('✓ LIMITED first use: Success (1/2 uses)');
    });

    it('should allow second use of LIMITED promo by buyer2', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Limited Use 2',
                attendeeEmail: 'buyer2@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'LIMITED',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.discount).toBe('30');

      console.log('✓ LIMITED second use: Success (2/2 uses - NOW FULL)');
    });

    it('should REJECT third use of LIMITED promo (max uses reached)', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Limited Use 3',
                attendeeEmail: 'buyer3@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'LIMITED',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer3Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('usage limit');

      console.log('✓ LIMITED rejected: Max uses (2) reached');
    });
  });

  describe('Step 7: Test Invalid Promo Codes', () => {
    it('should REJECT non-existent promo code', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Invalid Promo Test',
                attendeeEmail: 'test@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'NOTEXIST',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired');

      console.log('✓ NOTEXIST rejected: Promo code does not exist');
    });

    it('should REJECT expired promo code', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Expired Promo Test',
                attendeeEmail: 'test@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'EXPIRED',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired');

      console.log('✓ EXPIRED rejected: Promo code has expired');
    });

    it('should REJECT inactive promo code', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Inactive Promo Test',
                attendeeEmail: 'test@example.com',
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'INACTIVE',
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired');

      console.log('✓ INACTIVE rejected: Promo code is inactive');
    });
  });

  describe('Step 8: Test Order Without Promo Code', () => {
    it('should create order without promo code (full price)', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'No Promo Test',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        // No promoCode provided
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer3Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.subtotal).toBe('200');
      expect(response.body.discount).toBe('0');

      console.log('✓ Order without promo: R$200 (no discount)');
      console.log(`  Total: R$${response.body.total}`);
    });
  });

  describe('Step 9: Verify Promo Code Statistics', () => {
    it('should verify TECH20 usage count', async () => {
      const promo = await TestUtils.prisma.promoCode.findUnique({
        where: { id: percentagePromoId },
      });

      expect(promo).toBeTruthy();
      expect(promo?.code).toBe('TECH20');
      expect(promo?.currentUses).toBeGreaterThan(0);

      console.log(`✓ TECH20 used ${promo?.currentUses} times`);
    });

    it('should verify LIMITED reached max uses', async () => {
      const promo = await TestUtils.prisma.promoCode.findUnique({
        where: { id: limitedUsesPromoId },
      });

      expect(promo).toBeTruthy();
      expect(promo?.code).toBe('LIMITED');
      expect(promo?.currentUses).toBe(2);
      expect(promo?.maxUses).toBe(2);

      console.log(`✓ LIMITED maxed out: ${promo?.currentUses}/${promo?.maxUses} uses`);
    });
  });

  describe('Step 10: Test Case Sensitivity', () => {
    it('should REJECT lowercase promo code (case-sensitive)', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Case Test',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'tech20', // Lowercase - should fail
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Invalid or expired');

      console.log('✓ Promo codes are case-sensitive: tech20 rejected, TECH20 required');
    });

    it('should ACCEPT exact case promo code', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Exact Case Test',
                attendeeEmail: TEST_BUYER_EMAIL,
                formResponses: {},
              },
            ],
          },
        ],
        promoCode: 'TECH20', // Exact case
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      expect(response.body.discount).toBe('40');

      console.log('✓ TECH20 accepted with exact case');
    });
  });
});
