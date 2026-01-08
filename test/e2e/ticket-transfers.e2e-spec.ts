import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, TicketInstanceStatus } from '@prisma/client';

describe('Ticket Transfers - E2E', () => {
  let baseURL: string;
  let organizerToken: string;
  let organizerId: string;
  let buyer1Token: string;
  let buyer1Id: string;
  let buyer1Email: string;
  let buyer2Token: string;
  let buyer2Id: string;
  let buyer2Email: string;
  let eventId: string;
  let ticketId: string;
  let orderId: string;
  let ticketInstanceId: string;
  let ticketInstanceId2: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    baseURL = TestUtils.baseURL;
    console.log('\n🎫 Running Ticket Transfers E2E tests against', baseURL);
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Create Test Data', () => {
    it('should cleanup and prepare test environment', async () => {
      await TestUtils.cleanupNonOrganizerUsers();
      console.log('✓ Test environment ready');
    });

    it('should get or create test organizer', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      console.log('✓ Organizer ready');
    });

    it('should create buyer 1 (ticket owner)', async () => {
      buyer1Email = TestUtils.generateEmail('transfer-buyer1');
      const password = 'BuyerPassword123!';

      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyer1Email,
          name: 'Transfer Test Buyer One',
          password,
          cpf: TestUtils.generateCPF(),
          role: 'ATTENDEE',
        })
        .expect(201);

      buyer1Token = response.body.access_token;
      buyer1Id = response.body.user.id;

      console.log('✓ Buyer 1 created');
    });

    it('should create buyer 2 (for unauthorized transfer test)', async () => {
      buyer2Email = TestUtils.generateEmail('transfer-buyer2');
      const password = 'BuyerPassword123!';

      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          email: buyer2Email,
          name: 'Transfer Test Buyer Two',
          password,
          cpf: TestUtils.generateCPF(),
          role: 'ATTENDEE',
        })
        .expect(201);

      buyer2Token = response.body.access_token;
      buyer2Id = response.body.user.id;

      console.log('✓ Buyer 2 created');
    });

    it('should create test event', async () => {
      const eventData = {
        title: 'Transfer Test Event',
        subject: 'Technology',
        description: 'Event for testing ticket transfers',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        endsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        producerName: 'Transfer Test Producer',
        address: 'Transfer Test Venue',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345-678',
        status: EventStatus.ACTIVE,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventId = response.body.id;
      console.log('✓ Event created:', eventId);
    });

    it('should create test ticket', async () => {
      const ticketData = {
        eventId,
        title: 'Transferable Ticket',
        type: TicketType.PAID,
        price: 100.0,
        quantity: 10,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days from now
      };

      const response = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(ticketData)
        .expect(201);

      ticketId = response.body.id;
      console.log('✓ Ticket created: R$100');
    });

    it('should create order with tickets', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Original Attendee 1',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
              {
                attendeeName: 'Original Attendee 2',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
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

      orderId = response.body.id;
      console.log('✓ Order created:', response.body.orderNumber);
    });

    it('should confirm payment to create ticket instances', async () => {
      // Get order to get the total amount
      const orderResponse = await request(baseURL)
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      console.log('Order total:', orderResponse.body.total);

      const paymentData = {
        orderId,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      console.log('Payment data:', JSON.stringify(paymentData, null, 2));

      const response = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData);

      if (response.status !== 201) {
        console.log('Payment creation failed:', response.status);
        console.log('Error body:', JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(201);

      const paymentId = response.body.id;
      console.log('✓ Payment created:', paymentId);
      console.log('   Payment status:', response.body.status);

      // Manually sync payment status from ASAAS to trigger ticket generation
      console.log('⏳ Syncing payment status from ASAAS...');
      await request(baseURL)
        .patch(`/payments/${paymentId}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      console.log('✓ Payment synced successfully');

      // Wait a moment for ticket instances to be generated
      await TestUtils.wait(2000);

      console.log('✓ Ticket instances should be created');
    });

    it('should retrieve ticket instances for buyer 1', async () => {
      const response = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const instances = (response.body.data || response.body).filter((instance: any) => {
        return instance.orderItem?.orderId === orderId;
      });

      expect(instances.length).toBeGreaterThanOrEqual(2);

      ticketInstanceId = instances[0].id;
      ticketInstanceId2 = instances[1].id;

      console.log('✓ Retrieved ticket instances');
      console.log(`  - Instance 1: ${ticketInstanceId}`);
      console.log(`  - Instance 2: ${ticketInstanceId2}`);
    });
  });

  describe('Step 2: Successful Ticket Transfer', () => {
    it('should transfer ticket to new attendee', async () => {
      const transferData = {
        newAttendeeEmail: 'newholder@example.com',
        newAttendeeName: 'New Ticket Holder',
        newAttendeeCpf: TestUtils.generateCPF(),
        newAttendeePhone: '+5511999999999',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${ticketInstanceId}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(200);

      expect(response.body.attendeeEmail).toBe(transferData.newAttendeeEmail);
      expect(response.body.attendeeName).toBe(transferData.newAttendeeName);
      expect(response.body.attendeeCpf).toBe(transferData.newAttendeeCpf);
      expect(response.body.attendeePhone).toBe(transferData.newAttendeePhone);
      expect(response.body.transferredAt).toBeTruthy();
      expect(response.body.transferredFrom).toBe(buyer1Email);
      expect(response.body.status).toBe(TicketInstanceStatus.ACTIVE);

      console.log('✓ Ticket transferred successfully');
      console.log(`  - From: ${buyer1Email}`);
      console.log(`  - To: ${transferData.newAttendeeEmail}`);
      console.log(`  - Transferred at: ${new Date(response.body.transferredAt).toLocaleString()}`);
    });

    it('should transfer ticket with minimal data (email and name only)', async () => {
      const transferData = {
        newAttendeeEmail: 'minimaltransfer@example.com',
        newAttendeeName: 'Minimal Transfer Holder',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${ticketInstanceId2}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(200);

      expect(response.body.attendeeEmail).toBe(transferData.newAttendeeEmail);
      expect(response.body.attendeeName).toBe(transferData.newAttendeeName);
      expect(response.body.transferredAt).toBeTruthy();

      console.log('✓ Ticket transferred with minimal data');
    });

    it('should verify transferred ticket appears in organizer attendee list', async () => {
      const response = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const attendees = response.body.data || response.body;
      const transferredTicket = attendees.find(
        (a: any) => a.attendeeEmail === 'newholder@example.com',
      );

      expect(transferredTicket).toBeTruthy();
      expect(transferredTicket.transferredFrom).toBe(buyer1Email);

      console.log('✓ Transferred ticket visible in attendee list');
    });
  });

  describe('Step 3: Transfer Validation & Restrictions', () => {
    let checkedInTicketId: string;
    let cancelledTicketId: string;

    it('should create additional tickets for validation tests', async () => {
      // Create new order with 2 more tickets
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 2,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName:'Attendee for Check-in',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
              {
                attendeeName:'Attendee for Cancellation',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
            ],
          },
        ],
      };

      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const paymentData = {
        orderId: orderResponse.body.id,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData)
        .expect(201);

      // Manually sync payment status to trigger ticket generation
      await request(baseURL)
        .patch(`/payments/${paymentResponse.body.id}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      await TestUtils.wait(2000);

      // Get new ticket instances
      const instancesResponse = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const newTicketInstances = (instancesResponse.body.data || instancesResponse.body).filter((instance: any) => {
        return instance.orderItem?.orderId === orderResponse.body.id;
      });

      expect(newTicketInstances).toBeTruthy();
      expect(newTicketInstances.length).toBeGreaterThanOrEqual(2);

      const instances = newTicketInstances.filter(
        (i: any) => i.status === TicketInstanceStatus.ACTIVE && !i.transferredAt,
      );

      checkedInTicketId = instances[0].id;
      const checkedInTicketQrCode = instances[0].qrCode;
      cancelledTicketId = instances[1].id;

      console.log('✓ Additional tickets created for validation tests');

      // Store QR code for check-in test
      (global as any).checkedInTicketQrCode = checkedInTicketQrCode;
    });

    it('should check-in a ticket', async () => {
      const qrCode = (global as any).checkedInTicketQrCode;

      await request(baseURL)
        .post(`/ticket-instances/check-in/${qrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})
        .expect(201);

      console.log('✓ Ticket checked-in');
    });

    it('should FAIL to transfer a checked-in ticket', async () => {
      const transferData = {
        newAttendeeEmail: 'shouldfail@example.com',
        newAttendeeName: 'Should Fail Transfer',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${checkedInTicketId}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(400);

      expect(response.body.message).toMatch(/Cannot transfer a checked-in ticket/i);

      console.log('✓ Transfer rejected: Ticket already checked-in');
    });

    it('should cancel a ticket', async () => {
      await request(baseURL)
        .post(`/ticket-instances/${cancelledTicketId}/cancel`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      console.log('✓ Ticket cancelled');
    });

    it('should FAIL to transfer a cancelled ticket', async () => {
      const transferData = {
        newAttendeeEmail: 'shouldfail@example.com',
        newAttendeeName: 'Should Fail Transfer',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${cancelledTicketId}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(400);

      expect(response.body.message).toMatch(/Cannot transfer a cancelled ticket/i);

      console.log('✓ Transfer rejected: Ticket cancelled');
    });

    it('should FAIL with invalid email format', async () => {
      // Create a fresh ticket for this test
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName:'Fresh Attendee',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
            ],
          },
        ],
      };

      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const paymentData = {
        orderId: orderResponse.body.id,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData)
        .expect(201);

      // Manually sync payment status
      await request(baseURL)
        .patch(`/payments/${paymentResponse.body.id}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      await TestUtils.wait(2000);

      const ticketCheck = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const orderTickets = (ticketCheck.body.data || ticketCheck.body).filter((i: any) =>
        i.orderItem?.orderId === orderResponse.body.id
      );

      const freshTicket = orderTickets.find((i: any) => i.status === TicketInstanceStatus.ACTIVE && !i.transferredAt);
      expect(freshTicket).toBeTruthy();

      const transferData = {
        newAttendeeEmail: 'invalid-email-format',
        newAttendeeName: 'Test Name',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${freshTicket.id}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/email/i)]),
      );

      console.log('✓ Transfer rejected: Invalid email format');
    });

    it('should FAIL with missing required fields', async () => {
      // Create another fresh ticket
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName:'Another Fresh Attendee',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
            ],
          },
        ],
      };

      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const paymentData = {
        orderId: orderResponse.body.id,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData)
        .expect(201);

      // Manually sync payment status
      await request(baseURL)
        .patch(`/payments/${paymentResponse.body.id}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      await TestUtils.wait(2000);

      const ticketCheck = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const freshTicket = (ticketCheck.body.data || ticketCheck.body).find(
        (i: any) =>
          i.status === TicketInstanceStatus.ACTIVE &&
          !i.transferredAt &&
          i.attendeeName === 'Another Fresh Attendee',
      );

      expect(freshTicket).toBeTruthy();

      const transferData = {
        newAttendeeEmail: 'test@example.com',
        // Missing newAttendeeName
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${freshTicket.id}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/newAttendeeName/i)]),
      );

      console.log('✓ Transfer rejected: Missing required field (name)');
    });

    it('should FAIL with invalid CPF format', async () => {
      // Create one more fresh ticket
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName:'CPF Test Attendee',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
            ],
          },
        ],
      };

      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const paymentData = {
        orderId: orderResponse.body.id,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData)
        .expect(201);

      // Manually sync payment status
      await request(baseURL)
        .patch(`/payments/${paymentResponse.body.id}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      await TestUtils.wait(2000);

      const ticketCheck = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const freshTicket = (ticketCheck.body.data || ticketCheck.body).find(
        (i: any) =>
          i.status === TicketInstanceStatus.ACTIVE &&
          !i.transferredAt &&
          i.attendeeName === 'CPF Test Attendee',
      );

      expect(freshTicket).toBeTruthy();

      const transferData = {
        newAttendeeEmail: 'cpftest@example.com',
        newAttendeeName: 'CPF Test Name',
        newAttendeeCpf: '123', // Invalid CPF
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${freshTicket.id}/transfer`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(transferData)
        .expect(400);

      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toMatch(/CPF must be 11 digits/i);

      console.log('✓ Transfer rejected: Invalid CPF format');
    });
  });

  describe('Step 4: Authorization & Access Control', () => {
    let buyer1TransferableTicketId: string;

    it('should create a new ticket for authorization tests', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName:'Authorization Test Attendee',
                attendeeEmail: buyer1Email,
                attendeeCpf: TestUtils.generateCPF(),
                formResponses: {},
              },
            ],
          },
        ],
      };

      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(orderData)
        .expect(201);

      const paymentData = {
        orderId: orderResponse.body.id,
        amount: Number(orderResponse.body.total),
        method: 'CREDIT_CARD',
      };

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .send(paymentData)
        .expect(201);

      // Manually sync payment status
      await request(baseURL)
        .patch(`/payments/${paymentResponse.body.id}/sync`)
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      await TestUtils.wait(2000);

      const ticketCheck = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const freshTicket = (ticketCheck.body.data || ticketCheck.body).find(
        (i: any) =>
          i.status === TicketInstanceStatus.ACTIVE &&
          !i.transferredAt &&
          i.attendeeName === 'Authorization Test Attendee',
      );

      expect(freshTicket).toBeTruthy();
      buyer1TransferableTicketId = freshTicket.id;
      console.log('✓ Created ticket for authorization test');
    });

    it('should FAIL when non-owner tries to transfer ticket', async () => {
      const transferData = {
        newAttendeeEmail: 'unauthorized@example.com',
        newAttendeeName: 'Unauthorized Transfer',
      };

      const response = await request(baseURL)
        .post(`/ticket-instances/${buyer1TransferableTicketId}/transfer`)
        .set('Authorization', `Bearer ${buyer2Token}`) // Different user
        .send(transferData)
        .expect(403);

      expect(response.body.message).toMatch(/permission/i);

      console.log('✓ Transfer rejected: User does not own the ticket');
    });

    it('should FAIL when unauthenticated user tries to transfer', async () => {
      const transferData = {
        newAttendeeEmail: 'unauthenticated@example.com',
        newAttendeeName: 'Unauthenticated Transfer',
      };

      await request(baseURL)
        .post(`/ticket-instances/${buyer1TransferableTicketId}/transfer`)
        // No Authorization header
        .send(transferData)
        .expect(401);

      console.log('✓ Transfer rejected: Unauthenticated request');
    });

    it('should allow organizer to view transferred tickets in attendee list', async () => {
      const response = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const attendees = response.body.data || response.body;
      const transferredTickets = attendees.filter((a: any) => a.transferredAt !== null);

      expect(transferredTickets.length).toBeGreaterThan(0);
      console.log(`✓ Organizer can view ${transferredTickets.length} transferred ticket(s)`);
    });
  });

  describe('Step 5: Transfer History & Tracking', () => {
    it('should preserve transfer history in ticket instance', async () => {
      // Get one of the transferred tickets
      const response = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${buyer1Token}`)
        .expect(200);

      const instances = response.body.data || response.body;
      const transferredTicket = instances.find((i: any) => i.transferredAt !== null);

      expect(transferredTicket).toBeTruthy();
      expect(transferredTicket.transferredAt).toBeTruthy();
      expect(transferredTicket.transferredFrom).toBe(buyer1Email);
      expect(transferredTicket.attendeeEmail).not.toBe(buyer1Email);

      console.log('✓ Transfer history preserved');
      console.log(`  - Original owner: ${transferredTicket.transferredFrom}`);
      console.log(`  - Current owner: ${transferredTicket.attendeeEmail}`);
      console.log(
        `  - Transfer date: ${new Date(transferredTicket.transferredAt).toLocaleString()}`,
      );
    });

    it('should display transfer summary', async () => {
      const response = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const attendees = response.body.data || response.body;
      const transferredTickets = attendees.filter((a: any) => a.transferredAt !== null);
      const activeTickets = attendees.filter(
        (a: any) => a.status === TicketInstanceStatus.ACTIVE,
      );

      console.log('\n📊 Ticket Transfer Summary:');
      console.log(`  - Total ticket instances: ${attendees.length}`);
      console.log(`  - Active tickets: ${activeTickets.length}`);
      console.log(`  - Transferred tickets: ${transferredTickets.length}`);
      console.log(`  - Transfer rate: ${((transferredTickets.length / attendees.length) * 100).toFixed(1)}%`);

      if (transferredTickets.length > 0) {
        console.log('\n  Transferred Tickets:');
        transferredTickets.forEach((ticket: any, index: number) => {
          console.log(`    ${index + 1}. ${ticket.attendeeName} (${ticket.attendeeEmail})`);
          console.log(`       From: ${ticket.transferredFrom}`);
          console.log(`       Date: ${new Date(ticket.transferredAt).toLocaleString()}`);
        });
      }

      console.log('\n✅ All Ticket Transfer tests completed successfully!');
    });
  });
});
