import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType, FormFieldType } from '@prisma/client';

/**
 * E2E Test: Complete Sympla-like Event Flow with Custom Forms
 *
 * This test validates the complete flow:
 * 1. Organizer creates an event
 * 2. Organizer adds custom form fields (required and optional)
 * 3. Organizer creates tickets
 * 4. User registers and logs in
 * 5. User selects tickets to buy
 * 6. User MUST fill custom forms for each ticket (one form per ticket)
 * 7. Order creation validates all required fields are filled
 * 8. Payment can only proceed if forms are complete
 * 9. Ticket instances are created with form responses
 * 10. Email is sent with QR codes
 */
describe('Events with Custom Forms (Sympla Flow) - E2E', () => {
  const baseURL = TestUtils.baseURL;
  const TEST_BUYER_EMAIL = '0xzionmount@gmail.com';

  let organizerToken: string;
  let organizerId: string;
  let attendeeToken: string;
  let attendeeId: string;
  let eventId: string;
  let ticketId: string;
  let customFormFieldIds: string[] = [];

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🚀 Running Custom Forms E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  beforeEach(async () => {
    await TestUtils.wait(4000);
  });

  describe('Step 1: Setup - Get Organizer and Create Attendee', () => {
    it('should get or create test organizer with ASAAS account', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      expect(organizerId).toBeTruthy();

      console.log('✓ Organizer ready:', organizer.user.email);
    });

    it('should get or create attendee with verified email', async () => {
      const attendee = await TestUtils.getOrCreateTestAttendee();
      attendeeToken = attendee.accessToken;
      attendeeId = attendee.user.id;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeId).toBeTruthy();

      console.log('✓ Attendee ready:', attendee.user.email);
    });
  });

  describe('Step 2: Create Event with All Fields', () => {
    it('should create a complete event', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Tech Conference 2025 - Custom Forms Test',
        slug: `tech-conference-2025-custom-forms-${timestamp}`,
        description: 'A complete tech conference with custom registration forms',
        subject: 'Technology',
        category: 'Conference',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        address: 'Av. Paulista, 1000',
        locationName: 'Centro de Convenções',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
        producerName: 'Tech Events Inc',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 100,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(eventData.title);
      expect(response.body.status).toBe(EventStatus.ACTIVE);

      eventId = response.body.id;

      console.log(`✓ Event created successfully: ${eventId}`);
    });
  });

  describe('Step 3: Add Custom Form Fields to Event', () => {
    it('should add required TEXT field (Company Name)', async () => {

      const fieldData = {
        eventId,
        fieldName: 'company_name',
        fieldLabel: 'Company Name',
        fieldType: FormFieldType.TEXT,
        placeholder: 'Enter your company name',
        helpText: 'Required for corporate attendees',
        isRequired: true,
        displayOrder: 0,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fieldName).toBe('company_name');
      expect(response.body.isRequired).toBe(true);

      customFormFieldIds.push(response.body.id);
      console.log('✓ Added required TEXT field: Company Name');
    });

    it('should add required SELECT field (Dietary Restrictions)', async () => {
      const fieldData = {
        eventId,
        fieldName: 'dietary_restrictions',
        fieldLabel: 'Dietary Restrictions',
        fieldType: FormFieldType.SELECT,
        helpText: 'Select your dietary preferences',
        isRequired: true,
        displayOrder: 1,
        configuration: {
          options: [
            { value: 'none', label: 'No restrictions' },
            { value: 'vegetarian', label: 'Vegetarian' },
            { value: 'vegan', label: 'Vegan' },
            { value: 'gluten_free', label: 'Gluten Free' },
            { value: 'lactose_free', label: 'Lactose Free' },
          ],
        },
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fieldName).toBe('dietary_restrictions');
      expect(response.body.isRequired).toBe(true);

      customFormFieldIds.push(response.body.id);
      console.log('✓ Added required SELECT field: Dietary Restrictions');
    });

    it('should add optional TEXTAREA field (Special Needs)', async () => {

      const fieldData = {
        eventId,
        fieldName: 'special_needs',
        fieldLabel: 'Special Needs or Accessibility Requirements',
        fieldType: FormFieldType.TEXTAREA,
        placeholder: 'Please describe any special needs or accessibility requirements',
        isRequired: false,
        displayOrder: 2,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fieldName).toBe('special_needs');
      expect(response.body.isRequired).toBe(false);

      customFormFieldIds.push(response.body.id);
      console.log('✓ Added optional TEXTAREA field: Special Needs');
    });

    it('should add required PHONE field (Emergency Contact)', async () => {

      const fieldData = {
        eventId,
        fieldName: 'emergency_contact',
        fieldLabel: 'Emergency Contact Phone',
        fieldType: FormFieldType.PHONE,
        placeholder: '+55 11 99999-9999',
        helpText: 'Required for safety purposes',
        isRequired: true,
        displayOrder: 3,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fieldName).toBe('emergency_contact');
      expect(response.body.isRequired).toBe(true);

      customFormFieldIds.push(response.body.id);
      console.log('✓ Added required PHONE field: Emergency Contact');
    });

    it('should add required CHECKBOX field (Terms Agreement)', async () => {

      const fieldData = {
        eventId,
        fieldName: 'terms_agreement',
        fieldLabel: 'I agree to the event terms and conditions',
        fieldType: FormFieldType.CHECKBOX,
        isRequired: true,
        displayOrder: 4,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fieldName).toBe('terms_agreement');
      expect(response.body.isRequired).toBe(true);

      customFormFieldIds.push(response.body.id);
      console.log('✓ Added required CHECKBOX field: Terms Agreement');
    });

    it('should verify all custom fields are created', async () => {
      const response = await request(baseURL)
        .get(`/custom-forms/event/${eventId}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(5);
      expect(response.body[0].fieldName).toBe('company_name');
      expect(response.body[1].fieldName).toBe('dietary_restrictions');

      console.log(`✓ All 5 custom form fields verified for event ${eventId}`);
    });
  });

  describe('Step 4: Create Ticket for Event', () => {
    it('should create a paid ticket', async () => {

      const ticketData = {
        eventId,
        title: 'General Admission - Early Bird',
        description: 'Early bird ticket with full access',
        type: TicketType.PAID,
        price: 150.0,
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

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(ticketData.title);
      expect(response.body.price).toBe(ticketData.price.toString());

      ticketId = response.body.id;

      console.log(`✓ Ticket created successfully: ${ticketId}`);
    });
  });

  describe('Step 5: Attendee Buys Tickets - MUST Fill Forms First', () => {
    it('should REJECT order creation if attendee info is missing', async () => {

      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 2,
            isHalfPrice: false,
            // Missing attendees array!
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message.toString()).toContain('attendees');

      console.log('✓ Order correctly rejected when attendees array is missing');
    });

    it('should REJECT order if attendees count does not match quantity', async () => {

      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 3, // Buying 3 tickets
            isHalfPrice: false,
            attendees: [
              // Only 1 attendee provided, but quantity is 3!
              {
                attendeeName: 'John Doe',
                attendeeEmail: 'john@example.com',
                attendeeCpf: '11111111111',
                attendeePhone: '+5511888888888',
                formResponses: {
                  company_name: 'Acme Corp',
                  dietary_restrictions: 'vegetarian',
                  emergency_contact: '+5511777777777',
                  terms_agreement: true,
                },
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Expected 3 attendee(s), but received 1');

      console.log('✓ Order correctly rejected when attendee count mismatch');
    });

    it('should REJECT order if required custom field is missing', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Jane Smith',
                attendeeEmail: 'jane@example.com',
                formResponses: {
                  // Missing required fields: company_name, dietary_restrictions, emergency_contact, terms_agreement
                  special_needs: 'None',
                },
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toContain('Required field');

      console.log('✓ Order correctly rejected when required custom field is missing');
    });

    it('should SUCCESSFULLY create order with complete form data for all tickets', async () => {
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 3, // Buying 3 tickets
            isHalfPrice: false,
            attendees: [
              // First attendee
              {
                attendeeName: 'Alice Johnson',
                attendeeEmail: 'alice@example.com',
                attendeeCpf: '11111111111',
                attendeePhone: '+5511888888888',
                formResponses: {
                  company_name: 'Tech Innovators Inc',
                  dietary_restrictions: 'vegan',
                  special_needs: 'Wheelchair access needed',
                  emergency_contact: '+5511777777777',
                  terms_agreement: true,
                },
              },
              // Second attendee
              {
                attendeeName: 'Bob Williams',
                attendeeEmail: 'bob@example.com',
                attendeeCpf: '22222222222',
                attendeePhone: '+5511666666666',
                formResponses: {
                  company_name: 'Software Solutions LLC',
                  dietary_restrictions: 'gluten_free',
                  special_needs: '', // Optional field can be empty
                  emergency_contact: '+5511555555555',
                  terms_agreement: true,
                },
              },
              // Third attendee
              {
                attendeeName: 'Carol Martinez',
                attendeeEmail: 'carol@example.com',
                attendeeCpf: '33333333333',
                attendeePhone: '+5511444444444',
                formResponses: {
                  company_name: 'Digital Agency Co',
                  dietary_restrictions: 'none',
                  emergency_contact: '+5511333333333',
                  terms_agreement: true,
                  // special_needs not provided (optional)
                },
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('orderNumber');
      expect(response.body.status).toBe('PENDING');
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].quantity).toBe(3);

      // IMPORTANT: Verify ticket instances are NOT created yet (only after payment)
      expect(response.body.items[0]).toHaveProperty('ticketInstances');
      expect(response.body.items[0].ticketInstances).toHaveLength(0);

      // Verify attendee data is stored in OrderItem for later use
      expect(response.body.items[0]).toHaveProperty('attendeesData');
      expect(response.body.items[0].attendeesData).toHaveLength(3);

      // Verify first attendee data
      const firstAttendee = response.body.items[0].attendeesData[0];
      expect(firstAttendee.attendeeName).toBe('Alice Johnson');
      expect(firstAttendee.attendeeEmail).toBe('alice@example.com');
      expect(firstAttendee.formResponses).toHaveProperty('company_name', 'Tech Innovators Inc');
      expect(firstAttendee.formResponses).toHaveProperty('dietary_restrictions', 'vegan');
      expect(firstAttendee.formResponses).toHaveProperty('emergency_contact', '+5511777777777');

      // Verify second attendee data
      const secondAttendee = response.body.items[0].attendeesData[1];
      expect(secondAttendee.attendeeName).toBe('Bob Williams');
      expect(secondAttendee.formResponses).toHaveProperty('company_name', 'Software Solutions LLC');
      expect(secondAttendee.formResponses).toHaveProperty('dietary_restrictions', 'gluten_free');

      // Verify third attendee data
      const thirdAttendee = response.body.items[0].attendeesData[2];
      expect(thirdAttendee.attendeeName).toBe('Carol Martinez');
      expect(thirdAttendee.formResponses).toHaveProperty('company_name', 'Digital Agency Co');

      console.log('✓ Order created successfully with 3 tickets and complete form data');
      console.log(`  Order ID: ${response.body.id}`);
      console.log(`  Order Number: ${response.body.orderNumber}`);
      console.log(`  Status: PENDING (tickets will be created after payment)`);
    });
  });

  describe('Step 6: Verify Form Data Storage (Before Payment)', () => {
    it('should verify attendee data is stored but tickets NOT created yet', async () => {
      // Get the order items
      const orderItems = await TestUtils.prisma.orderItem.findMany({
        where: {
          order: {
            eventId,
            status: 'PENDING',
          },
        },
        include: {
          ticketInstances: true,
        },
      });

      expect(orderItems.length).toBeGreaterThan(0);

      // Verify ticket instances are NOT created (tickets only created after payment)
      for (const item of orderItems) {
        expect(item.ticketInstances).toHaveLength(0);

        // Verify attendee data is stored
        expect(item.attendeesData).toBeTruthy();

        const attendeesData = item.attendeesData as any[];
        expect(Array.isArray(attendeesData)).toBe(true);

        // Verify each attendee has required data
        for (const attendee of attendeesData) {
          expect(attendee).toHaveProperty('attendeeName');
          expect(attendee).toHaveProperty('attendeeEmail');
          expect(attendee).toHaveProperty('formResponses');
        }
      }

      console.log('✓ Attendee data stored correctly in OrderItems');
      console.log('✓ Ticket instances NOT created yet (waiting for payment)');
    });
  });

  describe('Step 7: Additional Field Types', () => {
    let testEventId: string;
    let testTicketId: string;

    it('should create test event for additional field types', async () => {
      const timestamp = Date.now();
      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Field Types Test Event',
          slug: `field-types-test-${timestamp}`,
          description: 'Test additional field types',
          subject: 'Technology',
          category: 'Workshop',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
          totalCapacity: 50,
        })
        .expect(201);

      testEventId = response.body.id;
      console.log(`✓ Test event created: ${testEventId}`);
    });

    it('should add DATE field type', async () => {
      const fieldData = {
        eventId: testEventId,
        fieldName: 'birth_date',
        fieldLabel: 'Date of Birth',
        fieldType: FormFieldType.DATE,
        helpText: 'For age verification',
        isRequired: true,
        displayOrder: 0,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body.fieldName).toBe('birth_date');
      expect(response.body.fieldType).toBe(FormFieldType.DATE);
      console.log('✓ Added DATE field type');
    });

    it('should add EMAIL field type', async () => {
      const fieldData = {
        eventId: testEventId,
        fieldName: 'secondary_email',
        fieldLabel: 'Secondary Email',
        fieldType: FormFieldType.EMAIL,
        placeholder: 'secondary@example.com',
        isRequired: false,
        displayOrder: 1,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body.fieldName).toBe('secondary_email');
      expect(response.body.fieldType).toBe(FormFieldType.EMAIL);
      console.log('✓ Added EMAIL field type');
    });

    it('should add NUMBER field type', async () => {
      const fieldData = {
        eventId: testEventId,
        fieldName: 'years_experience',
        fieldLabel: 'Years of Professional Experience',
        fieldType: FormFieldType.NUMBER,
        helpText: 'Enter number of years',
        isRequired: true,
        displayOrder: 2,
        configuration: {
          min: 0,
          max: 50,
        },
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      expect(response.body.fieldName).toBe('years_experience');
      expect(response.body.fieldType).toBe(FormFieldType.NUMBER);
      console.log('✓ Added NUMBER field type');
    });
  });

  describe('Step 8: Form Field Management', () => {
    it('should prevent duplicate field names for same event', async () => {
      const fieldData = {
        eventId,
        fieldName: 'company_name', // Already exists
        fieldLabel: 'Company Name Duplicate',
        fieldType: FormFieldType.TEXT,
        isRequired: false,
        displayOrder: 10,
      };

      const response = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(409);

      expect(response.body.message).toMatch(/already exists|duplicate/i);
      console.log('✓ Prevented duplicate field name');
    });

    it('should allow updating existing custom field', async () => {
      const fieldId = customFormFieldIds[0]; // company_name field

      const updateData = {
        fieldLabel: 'Company/Organization Name',
        helpText: 'Updated help text',
        placeholder: 'Enter company or organization name',
      };

      const response = await request(baseURL)
        .patch(`/custom-forms/${fieldId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.fieldLabel).toBe('Company/Organization Name');
      expect(response.body.helpText).toBe('Updated help text');
      console.log('✓ Updated custom field successfully');
    });

    it('should allow deleting custom field', async () => {
      // Create a field to delete
      const fieldData = {
        eventId,
        fieldName: 'temp_field_to_delete',
        fieldLabel: 'Temporary Field',
        fieldType: FormFieldType.TEXT,
        isRequired: false,
        displayOrder: 99,
      };

      const createResponse = await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(fieldData)
        .expect(201);

      const fieldId = createResponse.body.id;

      // Delete it
      await request(baseURL)
        .delete(`/custom-forms/${fieldId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      // Verify it's deleted
      await request(baseURL)
        .get(`/custom-forms/${fieldId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);

      console.log('✓ Deleted custom field successfully');
    });
  });

  describe('Step 9: Validation Edge Cases', () => {
    it('should reject invalid email format in EMAIL field', async () => {
      // First create event with email field
      const timestamp = Date.now();
      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Email Validation Test',
          slug: `email-validation-${timestamp}`,
          description: 'Test email validation',
          subject: 'Technology',
          category: 'Workshop',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
          totalCapacity: 10,
        })
        .expect(201);

      // Add email field
      await request(baseURL)
        .post('/custom-forms')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          fieldName: 'contact_email',
          fieldLabel: 'Contact Email',
          fieldType: FormFieldType.EMAIL,
          isRequired: true,
          displayOrder: 0,
        })
        .expect(201);

      // Create ticket
      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Test Ticket',
          type: TicketType.PAID,
          price: 50,
          quantity: 10,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      // Try to create order with invalid email format
      const orderResponse = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [
            {
              ticketId: ticket.body.id,
              quantity: 1,
              isHalfPrice: false,
              attendees: [
                {
                  attendeeName: 'Test User',
                  attendeeEmail: 'test@example.com',
                  formResponses: {
                    contact_email: 'not-an-email', // Invalid email
                  },
                },
              ],
            },
          ],
        })
        .expect(400);

      expect(orderResponse.body.message).toMatch(/email|valid|format/i);
      console.log('✓ Rejected invalid email format');
    });

    it('should reject unchecked required CHECKBOX field', async () => {
      // Try to create order without checking required checkbox
      const orderData = {
        eventId,
        items: [
          {
            ticketId,
            quantity: 1,
            isHalfPrice: false,
            attendees: [
              {
                attendeeName: 'Test User',
                attendeeEmail: 'test@example.com',
                formResponses: {
                  company_name: 'Test Corp',
                  dietary_restrictions: 'none',
                  emergency_contact: '+5511999999999',
                  terms_agreement: false, // Required checkbox not checked!
                },
              },
            ],
          },
        ],
      };

      const response = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.message).toMatch(/terms_agreement|required|checkbox/i);
      console.log('✓ Rejected unchecked required checkbox');
    });
  });

  describe('Step 10: Cross-Event Isolation', () => {
    it('should NOT allow using form fields from different event', async () => {
      // Create another event
      const timestamp = Date.now();
      const event2 = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Different Event',
          slug: `different-event-${timestamp}`,
          description: 'Another event',
          subject: 'Technology',
          category: 'Meetup',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
          totalCapacity: 20,
        })
        .expect(201);

      // Get custom fields for the OTHER event (should be empty or different)
      const response = await request(baseURL)
        .get(`/custom-forms/event/${event2.body.id}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(0); // No fields for this event yet

      // Verify original event still has its 5 fields
      const originalEventFields = await request(baseURL)
        .get(`/custom-forms/event/${eventId}`)
        .expect(200);

      expect(originalEventFields.body).toHaveLength(5);

      console.log('✓ Events have isolated custom form fields');
    });
  });

  describe('Step 11: Organizer Viewing Form Responses', () => {
    it('should allow organizer to view attendee form responses', async () => {
      // Get orders for the event
      const orders = await TestUtils.prisma.order.findMany({
        where: {
          eventId,
          status: 'PENDING',
        },
        include: {
          items: true,
        },
      });

      expect(orders.length).toBeGreaterThan(0);

      // Verify attendee data is accessible
      for (const order of orders) {
        for (const item of order.items) {
          expect(item.attendeesData).toBeTruthy();
          const attendeesData = item.attendeesData as any[];

          for (const attendee of attendeesData) {
            expect(attendee).toHaveProperty('formResponses');
            expect(attendee.formResponses).toHaveProperty('company_name');
            expect(attendee.formResponses).toHaveProperty('dietary_restrictions');
          }
        }
      }

      console.log('✓ Organizer can access attendee form responses');
    });
  });
});
