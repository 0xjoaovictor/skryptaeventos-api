import request from 'supertest';
import { TestUtils } from '../test-utils';

const baseURL = TestUtils.baseURL;

describe('Ticket Check-in E2E Tests', () => {
  let organizerToken: string;
  let attendeeToken: string;
  let eventId: string;
  let ticketId: string;
  let orderId: string;
  let ticketInstanceQrCode: string;
  let ticketInstanceId: string;
  let attendee: any;

  beforeAll(async () => {
    console.log('\n🚀 Running Ticket Check-in E2E tests against', baseURL);
    console.log('⚠️  Make sure the API is running: yarn start:dev');
    console.log('⚠️  Make sure ASAAS sandbox is configured\n');

    await TestUtils.setupTestApp();

    // Clean up non-organizer users
    console.log('🧹 Cleaning up non-organizer users and their data...');
    await TestUtils.cleanupNonOrganizerUsers();

    // Get or create test organizer
    const organizer = await TestUtils.getOrCreateTestOrganizer();
    organizerToken = organizer.accessToken;
    console.log('✓ Organizer ready:', organizer.user.email);

    // Create event
    const eventStartDate = new Date();
    eventStartDate.setDate(eventStartDate.getDate() + 30);
    const eventEndDate = new Date(eventStartDate);
    eventEndDate.setHours(eventEndDate.getHours() + 6);

    const event = await request(baseURL)
      .post('/events')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Tech Meetup 2024 - Check-in Test',
        subject: 'Technology',
        description: 'Event for testing check-in functionality',
        startsAt: eventStartDate.toISOString(),
        endsAt: eventEndDate.toISOString(),
        producerName: 'Tech Events Inc',
        ticketType: 'PAID',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
        isOnline: false,
        totalCapacity: 100,
        address: 'Tech Hub',
        city: 'Manaus',
        state: 'AM',
        zipCode: '69010-000',
      })
      .expect(201);

    eventId = event.body.id;
    console.log('✓ Event created:', event.body.title);

    // Create ticket
    const salesEndDate = new Date(eventStartDate);
    salesEndDate.setDate(salesEndDate.getDate() - 1);

    const ticket = await request(baseURL)
      .post('/tickets')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        eventId: eventId,
        title: 'General Admission',
        description: 'Access to all sessions',
        type: 'PAID',
        price: 50.00,
        quantity: 100,
        minQuantity: 1,
        maxQuantity: 5,
        salesStartsAt: new Date().toISOString(),
        salesEndsAt: salesEndDate.toISOString(),
        isVisible: true,
        hasHalfPrice: false,
      })
      .expect(201);

    ticketId = ticket.body.id;
    console.log('✓ Ticket created:', ticket.body.title);

    // Create attendee and purchase ticket
    attendee = await TestUtils.getOrCreateTestAttendee();
    attendeeToken = attendee.accessToken;
    console.log('✓ Attendee ready:', attendee.user.email);

    // Create order
    const order = await request(baseURL)
      .post('/orders')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({
        eventId: eventId,
        items: [{
          ticketId: ticketId,
          quantity: 1,
          isHalfPrice: false,
          attendees: [{
            attendeeName: attendee.user.name,
            attendeeEmail: attendee.user.email,
            formResponses: {},
          }],
        }],
      })
      .expect(201);

    orderId = order.body.id;
    console.log('✓ Order created - Total: R$', order.body.total);

    // Create payment
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const payment = await request(baseURL)
      .post('/payments')
      .set('Authorization', `Bearer ${attendeeToken}`)
      .send({
        orderId: orderId,
        amount: Number(order.body.total),
        method: 'CREDIT_CARD',
        description: 'Payment for Tech Meetup',
        installmentCount: 1,
        creditCardData: {
          holderName: 'TEST ATTENDEE',
          number: '4444444444444448',
          expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
          expiryYear: String(nextMonth.getFullYear()),
          ccv: '123',
        },
        customerData: {
          name: attendee.user.name,
          email: attendee.user.email,
          cpfCnpj: attendee.user.cpf,
          phone: '92987654321',
          mobilePhone: '92987654321',
          postalCode: '69010000',
          address: 'Tech Hub',
          addressNumber: '100',
          province: 'Centro',
          city: 'Manaus',
          state: 'AM',
        },
      })
      .expect(201);

    console.log('✓ Payment created - Status:', payment.body.status);

    // Wait for webhook to create ticket instance
    console.log('⏳ Waiting for ticket instance to be generated...');
    let ticketInstances;
    for (let i = 0; i < 10; i++) {
      await TestUtils.wait(2000);
      ticketInstances = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      const currentOrderTickets = ticketInstances.body.data.filter(
        (instance: any) => instance.orderItem && instance.orderItem.orderId === orderId
      );

      if (currentOrderTickets.length > 0) {
        ticketInstanceQrCode = currentOrderTickets[0].qrCode;
        ticketInstanceId = currentOrderTickets[0].id;
        console.log('✓ Ticket instance created with QR code:', ticketInstanceQrCode);
        break;
      }
    }

    expect(ticketInstanceQrCode).toBeTruthy();
  }, 120000);

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  // Add wait between tests to allow async processes to complete
  beforeEach(async () => {
    await TestUtils.wait(5000);
  });

  describe('Check-in Flow', () => {
    it('should successfully check-in a ticket with valid QR code', async () => {
      const checkInResponse = await request(baseURL)
        .post(`/ticket-instances/check-in/${ticketInstanceQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          checkInNotes: 'First attendee of the day',
          checkInLocation: 'Main Entrance - Gate A',
        })
        .expect(201);

      expect(checkInResponse.body.id).toBe(ticketInstanceId);
      expect(checkInResponse.body.qrCode).toBe(ticketInstanceQrCode);
      expect(checkInResponse.body.status).toBe('CHECKED_IN');
      expect(checkInResponse.body.checkedInAt).toBeTruthy();
      expect(checkInResponse.body.checkedInBy).toBeTruthy();
      expect(checkInResponse.body.checkInNotes).toBe('First attendee of the day');
      expect(checkInResponse.body.checkInLocation).toBe('Main Entrance - Gate A');

      console.log('✓ Check-in successful');
      console.log('  - Status:', checkInResponse.body.status);
      console.log('  - Checked in at:', checkInResponse.body.checkedInAt);
      console.log('  - Location:', checkInResponse.body.checkInLocation);
      console.log('  - Notes:', checkInResponse.body.checkInNotes);
    }, 30000);

    it('should prevent duplicate check-ins', async () => {
      const duplicateCheckIn = await request(baseURL)
        .post(`/ticket-instances/check-in/${ticketInstanceQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})
        .expect(409);

      expect(duplicateCheckIn.body.message).toContain('already');
      console.log('✓ Duplicate check-in prevented');
      console.log('  - Error message:', duplicateCheckIn.body.message);
    }, 30000);

    it('should reject check-in with invalid QR code', async () => {
      const invalidQrCode = 'invalid_qr_code_12345';

      const response = await request(baseURL)
        .post(`/ticket-instances/check-in/${invalidQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})
        .expect(404);

      expect(response.body.message).toContain('not found');
      console.log('✓ Invalid QR code rejected');
      console.log('  - Error message:', response.body.message);
    }, 30000);

    it('should reject check-in by non-organizer', async () => {
      // Create another attendee
      const anotherAttendeeEmail = TestUtils.generateEmail('another-attendee');

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          name: 'Another Attendee',
          email: anotherAttendeeEmail,
          password: 'Test@1234',
          cpf: TestUtils.generateCPF(),
          role: 'ATTENDEE',
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      const loginResponse = await TestUtils.loginUser(anotherAttendeeEmail, 'Test@1234');
      const anotherAttendeeToken = loginResponse.accessToken;

      // Try to check-in as attendee (should fail)
      const response = await request(baseURL)
        .post(`/ticket-instances/check-in/${ticketInstanceQrCode}`)
        .set('Authorization', `Bearer ${anotherAttendeeToken}`)
        .send({})
        .expect(403);

      expect(response.body.message).toContain('Forbidden');
      console.log('✓ Non-organizer check-in rejected');
      console.log('  - Error message:', response.body.message);
    }, 30000);
  });

  describe('QR Code Lookup', () => {
    it('should lookup ticket by QR code', async () => {
      const lookupResponse = await request(baseURL)
        .get(`/ticket-instances/qr/${ticketInstanceQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(lookupResponse.body.qrCode).toBe(ticketInstanceQrCode);
      expect(lookupResponse.body.status).toBe('CHECKED_IN');
      expect(lookupResponse.body.attendeeName).toBe(attendee.user.name);
      expect(lookupResponse.body.attendeeEmail).toBe(attendee.user.email);

      console.log('✓ QR code lookup successful');
      console.log('  - Attendee:', lookupResponse.body.attendeeName);
      console.log('  - Status:', lookupResponse.body.status);
    }, 30000);

    it('should get QR code image for organizer', async () => {
      const imageResponse = await request(baseURL)
        .get(`/ticket-instances/qr/${ticketInstanceQrCode}/image`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(imageResponse.body.qrCode).toBe(ticketInstanceQrCode);
      expect(imageResponse.body.qrCodeImage).toBeTruthy();
      expect(imageResponse.body.qrCodeImage).toContain('data:image/png;base64,');

      console.log('✓ QR code image retrieved');
      console.log('  - Image format: PNG (base64)');
    }, 30000);

    it('should reject QR code lookup with invalid code', async () => {
      const invalidQrCode = 'totally_invalid_qr_code';

      const response = await request(baseURL)
        .get(`/ticket-instances/qr/${invalidQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
      console.log('✓ Invalid QR code lookup rejected');
    }, 30000);
  });

  describe('Check-in Reports for Organizers', () => {
    it('should get all attendees for an event', async () => {
      const attendeesResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(attendeesResponse.body.data).toBeDefined();
      expect(Array.isArray(attendeesResponse.body.data)).toBe(true);
      expect(attendeesResponse.body.meta).toBeDefined();
      expect(attendeesResponse.body.meta.total).toBeGreaterThan(0);

      console.log('✓ Attendee report retrieved');
      console.log('  - Total attendees:', attendeesResponse.body.meta.total);
      console.log('  - Page:', attendeesResponse.body.meta.page);
      console.log('  - Limit:', attendeesResponse.body.meta.limit);
    }, 30000);

    it('should filter attendees by CHECKED_IN status', async () => {
      const checkedInResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees?status=CHECKED_IN`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(checkedInResponse.body.data).toBeDefined();
      expect(Array.isArray(checkedInResponse.body.data)).toBe(true);

      // All tickets should be CHECKED_IN
      checkedInResponse.body.data.forEach((ticket: any) => {
        expect(ticket.status).toBe('CHECKED_IN');
      });

      console.log('✓ Filtered by CHECKED_IN status');
      console.log('  - Checked-in tickets:', checkedInResponse.body.data.length);
    }, 30000);

    it('should filter attendees by ACTIVE status', async () => {
      const activeResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees?status=ACTIVE`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(activeResponse.body.data).toBeDefined();
      expect(Array.isArray(activeResponse.body.data)).toBe(true);

      // All tickets should be ACTIVE (not checked in yet)
      activeResponse.body.data.forEach((ticket: any) => {
        expect(ticket.status).toBe('ACTIVE');
      });

      console.log('✓ Filtered by ACTIVE status');
      console.log('  - Active (not checked-in) tickets:', activeResponse.body.data.length);
    }, 30000);

    it('should paginate attendee list', async () => {
      const page1Response = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees?page=1&limit=1`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(page1Response.body.data).toBeDefined();
      expect(page1Response.body.data.length).toBeLessThanOrEqual(1);
      expect(page1Response.body.meta.page).toBe(1);
      expect(page1Response.body.meta.limit).toBe(1);

      console.log('✓ Pagination works correctly');
      console.log('  - Items on page 1:', page1Response.body.data.length);
      console.log('  - Total pages:', page1Response.body.meta.totalPages);
    }, 30000);

    it('should reject attendee report for non-organizer', async () => {
      const response = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(403);

      expect(response.body.message).toContain('Forbidden');
      console.log('✓ Non-organizer report access rejected');
    }, 30000);
  });

  describe('Edge Cases and Validations', () => {
    let secondTicketQrCode: string;

    beforeAll(async () => {
      // Create a second order to test more scenarios
      const order2 = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: eventId,
          items: [{
            ticketId: ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [{
              attendeeName: attendee.user.name,
              attendeeEmail: attendee.user.email,
              formResponses: {},
            }],
          }],
        })
        .expect(201);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const payment2 = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order2.body.id,
          amount: Number(order2.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for second ticket',
          installmentCount: 1,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: attendee.user.name,
            email: attendee.user.email,
            cpfCnpj: attendee.user.cpf,
            phone: '92987654321',
            mobilePhone: '92987654321',
            postalCode: '69010000',
            address: 'Tech Hub',
            addressNumber: '100',
            province: 'Centro',
            city: 'Manaus',
            state: 'AM',
          },
        })
        .expect(201);

      // Wait for ticket instance
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(2000);
        const ticketInstances = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        const currentOrderTickets = ticketInstances.body.data.filter(
          (instance: any) => instance.orderItem && instance.orderItem.orderId === order2.body.id
        );

        if (currentOrderTickets.length > 0) {
          secondTicketQrCode = currentOrderTickets[0].qrCode;
          console.log('✓ Second ticket created with QR code:', secondTicketQrCode);
          break;
        }
      }
    }, 120000);

    it('should check-in without optional notes and location', async () => {
      const checkInResponse = await request(baseURL)
        .post(`/ticket-instances/check-in/${secondTicketQrCode}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({})
        .expect(201);

      expect(checkInResponse.body.status).toBe('CHECKED_IN');
      expect(checkInResponse.body.checkedInAt).toBeTruthy();
      expect(checkInResponse.body.checkInNotes).toBeNull();
      expect(checkInResponse.body.checkInLocation).toBeNull();

      console.log('✓ Check-in without notes/location successful');
    }, 30000);

    it('should retrieve attendee own tickets', async () => {
      const myTicketsResponse = await request(baseURL)
        .get('/ticket-instances/my-tickets')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      expect(myTicketsResponse.body.data).toBeDefined();
      expect(Array.isArray(myTicketsResponse.body.data)).toBe(true);
      expect(myTicketsResponse.body.data.length).toBeGreaterThanOrEqual(2);

      const checkedInTickets = myTicketsResponse.body.data.filter(
        (t: any) => t.status === 'CHECKED_IN'
      );
      expect(checkedInTickets.length).toBeGreaterThanOrEqual(2);

      console.log('✓ Attendee can view own tickets');
      console.log('  - Total tickets:', myTicketsResponse.body.data.length);
      console.log('  - Checked-in tickets:', checkedInTickets.length);
    }, 30000);
  });

  describe('Summary', () => {
    it('should display final check-in statistics', async () => {
      const allAttendeesResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const checkedInResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees?status=CHECKED_IN`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      const activeResponse = await request(baseURL)
        .get(`/ticket-instances/event/${eventId}/attendees?status=ACTIVE`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      console.log('\n📊 Check-in Summary:');
      console.log('  - Total tickets:', allAttendeesResponse.body.meta.total);
      console.log('  - Checked-in:', checkedInResponse.body.data.length);
      console.log('  - Not checked-in:', activeResponse.body.data.length);
      console.log('  - Check-in rate:',
        `${Math.round((checkedInResponse.body.data.length / allAttendeesResponse.body.meta.total) * 100)}%`
      );
      console.log('\n✅ All check-in tests completed successfully!\n');

      expect(allAttendeesResponse.body.meta.total).toBeGreaterThan(0);
    }, 30000);
  });
});
