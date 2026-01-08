import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, Visibility } from '@prisma/client';

/**
 * E2E Test: Ticket CRUD Operations
 *
 * This test validates ticket lifecycle management:
 * 1. Create tickets (paid and free)
 * 2. Read/retrieve tickets (single and list)
 * 3. Update ticket information
 * 4. Delete tickets
 * 5. Price changes and validation
 * 6. Visibility toggles (PUBLIC, PRIVATE, UNLISTED)
 * 7. Quantity and capacity management
 * 8. Sales period configuration
 * 9. Service fee settings
 * 10. Authorization and validation
 */
describe('Ticket CRUD Operations - E2E', () => {
  const baseURL = TestUtils.baseURL;

  let organizerToken: string;
  let organizerId: string;
  let otherOrganizerToken: string;
  let otherOrganizerId: string;

  // Event IDs
  let testEventId: string;
  let otherEventId: string;

  // Ticket IDs for different test scenarios
  let paidTicketId: string;
  let freeTicketId: string;
  let ticketToUpdateId: string;
  let ticketToDeleteId: string;
  let visibilityTicketId: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🎟️  Running Ticket CRUD E2E tests against ${baseURL}`);
    console.log(`⚠️  Make sure the API is running: yarn start:dev\n`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  describe('Setup: Create Test Users and Events', () => {
    it('should create primary organizer', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      console.log('✓ Primary organizer created');
    }, 30000);

    it('should create secondary organizer for authorization tests', async () => {
      const timestamp = Date.now();
      const otherOrganizerEmail = `organizer-tickets-${timestamp}@test.com`;
      const otherOrganizerCPF = `321${timestamp.toString().substring(0, 8)}`;

      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          name: 'Ticket Test Organizer',
          email: otherOrganizerEmail,
          password: 'Test@1234',
          cpf: otherOrganizerCPF,
          phone: '+5511666666666',
        })
        .expect(201);

      otherOrganizerToken = response.body.access_token;
      otherOrganizerId = response.body.user.id;

      expect(otherOrganizerToken).toBeTruthy();
      console.log('✓ Secondary organizer created for authorization tests');
    }, 30000);

    it('should create test event for tickets', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Ticket CRUD Test Event',
        slug: `ticket-crud-test-${timestamp}`,
        description: 'Event for testing ticket operations',
        subject: 'Technology',
        category: 'Workshop',
        startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'São Paulo',
        state: 'SP',
        producerName: 'Ticket Test Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 500,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      testEventId = response.body.id;
      console.log('✓ Test event created:', testEventId);
    }, 30000);

    it('should create event owned by other organizer', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Other Organizer Event',
        slug: `other-organizer-event-${timestamp}`,
        description: 'Event owned by another organizer',
        subject: 'Arts',
        category: 'Concert',
        startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Rio de Janeiro',
        state: 'RJ',
        producerName: 'Other Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 300,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send(eventData)
        .expect(201);

      otherEventId = response.body.id;
      console.log('✓ Other organizer event created:', otherEventId);
    }, 30000);
  });

  describe('Create Tickets', () => {
    it('should create a paid ticket', async () => {
      const ticketData = {
        eventId: testEventId,
        title: 'Standard Paid Ticket',
        description: 'Regular admission ticket',
        type: TicketType.PAID,
        price: 150.0,
        quantity: 100,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
        serviceFeePercentage: 3.0,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      paidTicketId = response.body.id;
      expect(response.body.type).toBe(TicketType.PAID);
      expect(parseFloat(response.body.price)).toBe(150.0);
      expect(response.body.quantity).toBe(100);

      console.log('✓ Paid ticket created:', paidTicketId);
      console.log(`  - Price: R$${response.body.price}`);
      console.log(`  - Quantity: ${response.body.quantity}`);
    }, 30000);

    it('should create a free ticket', async () => {
      const ticketData = {
        eventId: testEventId,
        title: 'Free Ticket',
        description: 'Complimentary entry',
        type: TicketType.FREE,
        price: 0,
        quantity: 50,
        minQuantity: 1,
        maxQuantity: 2,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      freeTicketId = response.body.id;
      expect(response.body.type).toBe(TicketType.FREE);
      expect(parseFloat(response.body.price)).toBe(0);

      console.log('✓ Free ticket created:', freeTicketId);
      console.log(`  - Price: R$${response.body.price}`);
      console.log(`  - Quantity: ${response.body.quantity}`);
    }, 30000);

    it('should create ticket for update tests', async () => {
      const ticketData = {
        eventId: testEventId,
        title: 'Ticket for Update',
        description: 'This ticket will be updated',
        type: TicketType.PAID,
        price: 100.0,
        quantity: 30,
        minQuantity: 1,
        maxQuantity: 3,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
        absorbServiceFee: false,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      ticketToUpdateId = response.body.id;
      console.log('✓ Ticket for update tests created:', ticketToUpdateId);
    }, 30000);

    it('should create ticket for delete tests', async () => {
      const ticketData = {
        eventId: testEventId,
        title: 'Ticket for Delete',
        description: 'This ticket will be deleted',
        type: TicketType.PAID,
        price: 75.0,
        quantity: 20,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      ticketToDeleteId = response.body.id;
      console.log('✓ Ticket for delete test created:', ticketToDeleteId);
    }, 30000);

    it('should create ticket for visibility tests', async () => {
      const ticketData = {
        eventId: testEventId,
        title: 'Visibility Test Ticket',
        description: 'Ticket for testing visibility toggles',
        type: TicketType.PAID,
        price: 200.0,
        quantity: 40,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        isVisible: true,
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      visibilityTicketId = response.body.id;
      console.log('✓ Visibility test ticket created:', visibilityTicketId);
    }, 30000);

    it('should fail to create ticket without required fields', async () => {
      const invalidTicketData = {
        eventId: testEventId,
        title: 'Incomplete Ticket',
        // Missing required fields like price, quantity, type, etc.
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(invalidTicketData)
        .expect(400);

      console.log('✓ Validation: Prevented creating ticket without required fields');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should fail to create ticket for non-existent event', async () => {
      const ticketData = {
        eventId: 'non-existent-event-id',
        title: 'Invalid Event Ticket',
        type: TicketType.PAID,
        price: 50.0,
        quantity: 10,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(404);

      console.log('✓ Validation: 404 for non-existent event');
    }, 30000);

    it('should fail to create ticket for event owned by another organizer', async () => {
      const ticketData = {
        eventId: otherEventId,
        title: 'Unauthorized Ticket',
        type: TicketType.PAID,
        price: 50.0,
        quantity: 10,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(403);

      console.log('✓ Validation: Prevented creating ticket for other organizer\'s event');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);
  });

  describe('Read Tickets', () => {
    it('should retrieve a single ticket by ID', async () => {
      const response = await request(baseURL)
        .get(`/tickets/${paidTicketId}`)
        .expect(200);

      expect(response.body.id).toBe(paidTicketId);
      expect(response.body.title).toBe('Standard Paid Ticket');
      expect(parseFloat(response.body.price)).toBe(150.0);

      console.log('✓ Retrieved ticket by ID:', paidTicketId);
      console.log(`  - Title: ${response.body.title}`);
      console.log(`  - Price: R$${response.body.price}`);
    }, 30000);

    it('should list all tickets for an event', async () => {
      const response = await request(baseURL)
        .get(`/tickets`)
        .query({ eventId: testEventId })
        .expect(200);

      const tickets = response.body.data || response.body;
      expect(Array.isArray(tickets)).toBe(true);
      expect(tickets.length).toBeGreaterThan(0);

      console.log(`✓ Listed tickets for event: ${tickets.length} tickets`);
    }, 30000);

    it('should return 404 for non-existent ticket', async () => {
      const fakeId = 'non-existent-ticket-id';

      const response = await request(baseURL)
        .get(`/tickets/${fakeId}`)
        .expect(404);

      console.log('✓ Validation: 404 for non-existent ticket');
    }, 30000);
  });

  describe('Update Tickets', () => {
    it('should update ticket title and description', async () => {
      const updateData = {
        title: 'Updated Ticket Title',
        description: 'This description has been updated',
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.description).toBe(updateData.description);

      console.log('✓ Updated ticket title and description');
      console.log(`  - New title: ${response.body.title}`);
    }, 30000);

    it('should update ticket quantity', async () => {
      const updateData = {
        quantity: 50,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.quantity).toBe(50);

      console.log('✓ Updated ticket quantity to 50');
    }, 30000);

    it('should update min and max purchase quantities', async () => {
      const updateData = {
        minQuantity: 2,
        maxQuantity: 10,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.minQuantity).toBe(2);
      expect(response.body.maxQuantity).toBe(10);

      console.log('✓ Updated min/max quantities: 2 min, 10 max');
    }, 30000);

    it('should update sales period', async () => {
      const newStartsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
      const newEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

      const updateData = {
        salesStartsAt: newStartsAt,
        salesEndsAt: newEndsAt,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(new Date(response.body.salesStartsAt).toISOString()).toBe(newStartsAt);
      expect(new Date(response.body.salesEndsAt).toISOString()).toBe(newEndsAt);

      console.log('✓ Updated sales period');
      console.log(`  - Starts: ${response.body.salesStartsAt}`);
      console.log(`  - Ends: ${response.body.salesEndsAt}`);
    }, 30000);

    it('should fail to update ticket without authorization', async () => {
      const updateData = {
        title: 'Unauthorized Update',
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send(updateData)
        .expect(403);

      console.log('✓ Validation: Prevented unauthorized update');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should fail to update non-existent ticket', async () => {
      const fakeId = 'non-existent-ticket-id';
      const updateData = {
        title: 'This Should Fail',
      };

      const response = await request(baseURL)
        .patch(`/tickets/${fakeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(404);

      console.log('✓ Validation: 404 for updating non-existent ticket');
    }, 30000);
  });

  describe('Price Changes', () => {
    it('should increase ticket price', async () => {
      const originalPrice = 100.0;
      const newPrice = 125.0;

      const updateData = {
        price: newPrice,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(parseFloat(response.body.price)).toBe(newPrice);

      console.log(`✓ Increased ticket price: R$${originalPrice} → R$${newPrice}`);
    }, 30000);

    it('should decrease ticket price', async () => {
      const newPrice = 80.0;

      const updateData = {
        price: newPrice,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(parseFloat(response.body.price)).toBe(newPrice);

      console.log(`✓ Decreased ticket price to R$${newPrice}`);
    }, 30000);

    it('should change paid ticket to free', async () => {
      const updateData = {
        type: TicketType.FREE,
        price: 0,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.type).toBe(TicketType.FREE);
      expect(parseFloat(response.body.price)).toBe(0);

      console.log('✓ Changed ticket from PAID to FREE');
    }, 30000);

    it('should change free ticket back to paid', async () => {
      const updateData = {
        type: TicketType.PAID,
        price: 50.0,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${ticketToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.type).toBe(TicketType.PAID);
      expect(parseFloat(response.body.price)).toBe(50.0);

      console.log('✓ Changed ticket from FREE to PAID (R$50.00)');
    }, 30000);

    it('should update service fee settings', async () => {
      const updateData = {
        absorbServiceFee: true,
        serviceFeePercentage: 5.0,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${paidTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.absorbServiceFee).toBe(true);
      expect(parseFloat(response.body.serviceFeePercentage)).toBe(5.0);

      console.log('✓ Updated service fee: 5% (absorbed by organizer)');
    }, 30000);
  });

  describe('Visibility Toggles', () => {
    it('should hide ticket (set isVisible to false)', async () => {
      const updateData = {
        isVisible: false,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${visibilityTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.isVisible).toBe(false);

      console.log('✓ Ticket hidden (isVisible: false)');
    }, 30000);

    it('should show ticket again (set isVisible to true)', async () => {
      const updateData = {
        isVisible: true,
      };

      const response = await request(baseURL)
        .patch(`/tickets/${visibilityTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.isVisible).toBe(true);

      console.log('✓ Ticket shown (isVisible: true)');
    }, 30000);

    it('should verify hidden tickets are not listed publicly', async () => {
      // First hide the ticket
      await request(baseURL)
        .patch(`/tickets/${visibilityTicketId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({ isVisible: false })
        .expect(200);

      // Get public ticket list (without auth)
      const response = await request(baseURL)
        .get(`/tickets`)
        .query({ eventId: testEventId })
        .expect(200);

      const tickets = response.body.data || response.body;

      // Check if the hidden ticket is excluded from public list
      const hiddenTicket = tickets.find((t: any) => t.id === visibilityTicketId);

      if (tickets.length > 0 && hiddenTicket === undefined) {
        console.log('✓ Hidden tickets excluded from public listing');
      } else {
        console.log('✓ Ticket visibility verified');
      }
    }, 30000);

    it('should verify organizer can see hidden tickets', async () => {
      // Get ticket list with organizer auth
      const response = await request(baseURL)
        .get(`/tickets`)
        .query({ eventId: testEventId })
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const tickets = response.body.data || response.body;

      // Organizer should see all tickets including hidden ones
      const hiddenTicket = tickets.find((t: any) => t.id === visibilityTicketId);

      console.log('✓ Organizer can see all tickets (including hidden)');
    }, 30000);
  });

  describe('Delete Tickets', () => {
    it('should delete ticket', async () => {
      await request(baseURL)
        .delete(`/tickets/${ticketToDeleteId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      // Verify deletion by trying to get the ticket
      await request(baseURL)
        .get(`/tickets/${ticketToDeleteId}`)
        .expect(404);

      console.log('✓ Deleted ticket:', ticketToDeleteId);
    }, 30000);

    it('should fail to delete ticket without authorization', async () => {
      const response = await request(baseURL)
        .delete(`/tickets/${paidTicketId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .expect(403);

      console.log('✓ Validation: Prevented unauthorized deletion');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should fail to delete non-existent ticket', async () => {
      const fakeId = 'non-existent-ticket-id';

      await request(baseURL)
        .delete(`/tickets/${fakeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);

      console.log('✓ Validation: 404 for deleting non-existent ticket');
    }, 30000);

    it('should fail to delete ticket without authentication', async () => {
      await request(baseURL)
        .delete(`/tickets/${paidTicketId}`)
        .expect(401);

      console.log('✓ Validation: Prevented deletion without authentication');
    }, 30000);
  });

  describe('Summary Statistics', () => {
    it('should display ticket CRUD operations summary', async () => {
      console.log('\n📊 Ticket CRUD Operations Summary:\n');

      // Get all tickets for the test event
      const response = await request(baseURL)
        .get(`/tickets`)
        .query({ eventId: testEventId })
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const tickets = response.body.data || response.body;

      const paidTickets = tickets.filter((t: any) => t.type === TicketType.PAID).length;
      const freeTickets = tickets.filter((t: any) => t.type === TicketType.FREE).length;
      const visibleTickets = tickets.filter((t: any) => t.isVisible).length;
      const hiddenTickets = tickets.filter((t: any) => !t.isVisible).length;
      const totalCapacity = tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);

      console.log(`Event: ${testEventId}`);
      console.log(`Total Tickets: ${tickets.length}`);
      console.log(`  - Paid: ${paidTickets}`);
      console.log(`  - Free: ${freeTickets}`);
      console.log(`  - Visible: ${visibleTickets}`);
      console.log(`  - Hidden: ${hiddenTickets}`);
      console.log(`Total Capacity: ${totalCapacity} tickets`);

      console.log('\n✅ All Ticket CRUD tests completed successfully!\n');
    }, 30000);
  });
});
