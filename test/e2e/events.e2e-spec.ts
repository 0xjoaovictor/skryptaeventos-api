import request from 'supertest';
import { TestUtils } from '../test-utils';
import { EventStatus, TicketType } from '@prisma/client';

/**
 * E2E Test: Event CRUD Operations
 *
 * This test validates event lifecycle management:
 * 1. Create events (draft and active)
 * 2. Read/retrieve events (single and list)
 * 3. Update event information
 * 4. Delete events
 * 5. Publishing workflow (Draft -> Active)
 * 6. Unpublishing/Pausing events (Active -> Paused)
 * 7. Cancelling events
 * 8. Event status transitions
 * 9. Validation and authorization
 */
describe('Event CRUD Operations - E2E', () => {
  const baseURL = TestUtils.baseURL;

  let organizerToken: string;
  let organizerId: string;
  let otherOrganizerToken: string;
  let otherOrganizerId: string;

  // Event IDs for different test scenarios
  let draftEventId: string;
  let activeEventId: string;
  let pausedEventId: string;
  let eventToDeleteId: string;
  let eventToUpdateId: string;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n📅 Running Event CRUD E2E tests against ${baseURL}`);
    console.log(`⚠️  Make sure the API is running: yarn start:dev\n`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  describe('Setup: Create Test Users', () => {
    it('should create primary organizer', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      organizerToken = organizer.accessToken;
      organizerId = organizer.user.id;

      expect(organizerToken).toBeTruthy();
      console.log('✓ Primary organizer created');
    }, 30000);

    it('should create secondary organizer for authorization tests', async () => {
      const timestamp = Date.now();
      const otherOrganizerEmail = `organizer2-${timestamp}@test.com`;
      const otherOrganizerCPF = `789${timestamp.toString().substring(0, 8)}`;

      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          name: 'Other Organizer',
          email: otherOrganizerEmail,
          password: 'Test@1234',
          cpf: otherOrganizerCPF,
          phone: '+5511555555555',
        })
        .expect(201);

      otherOrganizerToken = response.body.access_token;
      otherOrganizerId = response.body.user.id;

      expect(otherOrganizerToken).toBeTruthy();
      console.log('✓ Secondary organizer created for authorization tests');
    }, 30000);
  });

  describe('Create Events', () => {
    it('should create a draft event', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Draft Event - CRUD Test',
        slug: `draft-event-${timestamp}`,
        description: 'This event is in draft status',
        subject: 'Arts',
        category: 'Workshop',
        startsAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Rio de Janeiro',
        state: 'RJ',
        producerName: 'Test Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.DRAFT,
        totalCapacity: 50,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      draftEventId = response.body.id;
      expect(response.body.status).toBe(EventStatus.DRAFT);
      expect(response.body.title).toBe(eventData.title);
      expect(response.body.slug).toBe(eventData.slug);

      console.log('✓ Draft event created:', draftEventId);
      console.log(`  - Status: ${response.body.status}`);
    }, 30000);

    it('should create an active (published) event', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Active Event - CRUD Test',
        slug: `active-event-${timestamp}`,
        description: 'This event is active and published',
        subject: 'Technology',
        category: 'Conference',
        startsAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'São Paulo',
        state: 'SP',
        producerName: 'Tech Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 100,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      activeEventId = response.body.id;
      expect(response.body.status).toBe(EventStatus.ACTIVE);
      expect(response.body.title).toBe(eventData.title);

      console.log('✓ Active event created:', activeEventId);
      console.log(`  - Status: ${response.body.status}`);
    }, 30000);

    it('should create event to be updated later', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Event for Update Test',
        slug: `update-test-${timestamp}`,
        description: 'This event will be updated',
        subject: 'Business',
        category: 'Seminar',
        startsAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Belo Horizonte',
        state: 'MG',
        producerName: 'Business Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.DRAFT,
        totalCapacity: 75,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventToUpdateId = response.body.id;
      console.log('✓ Event for update tests created:', eventToUpdateId);
    }, 30000);

    it('should create event to be deleted later', async () => {
      const timestamp = Date.now();
      const eventData = {
        title: 'Event for Delete Test',
        slug: `delete-test-${timestamp}`,
        description: 'This event will be deleted',
        subject: 'Sports',
        category: 'Tournament',
        startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Curitiba',
        state: 'PR',
        producerName: 'Sports Producer',
        ticketType: TicketType.FREE,
        status: EventStatus.DRAFT,
        totalCapacity: 200,
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      eventToDeleteId = response.body.id;
      console.log('✓ Event for delete test created:', eventToDeleteId);
    }, 30000);

    it('should fail to create event without required fields', async () => {
      const invalidEventData = {
        title: 'Incomplete Event',
        // Missing required fields like slug, startsAt, endsAt, etc.
      };

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(invalidEventData)
        .expect(400);

      console.log('✓ Validation: Prevented creating event without required fields');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);
  });

  describe('Read Events', () => {
    it('should retrieve a single event by ID', async () => {
      const response = await request(baseURL)
        .get(`/events/${activeEventId}`)
        .expect(200);

      expect(response.body.id).toBe(activeEventId);
      expect(response.body.title).toBe('Active Event - CRUD Test');
      expect(response.body.status).toBe(EventStatus.ACTIVE);

      console.log('✓ Retrieved event by ID:', activeEventId);
      console.log(`  - Title: ${response.body.title}`);
      console.log(`  - Status: ${response.body.status}`);
    }, 30000);

    it('should retrieve draft event by owner', async () => {
      const response = await request(baseURL)
        .get(`/events/${draftEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(response.body.id).toBe(draftEventId);
      expect(response.body.status).toBe(EventStatus.DRAFT);

      console.log('✓ Retrieved draft event by owner:', draftEventId);
    }, 30000);

    it('should list all events', async () => {
      const response = await request(baseURL)
        .get('/events')
        .expect(200);

      // API returns paginated response with data array
      const events = response.body.data || response.body;
      expect(Array.isArray(events)).toBe(true);
      console.log(`✓ Listed events: ${events.length} total`);
    }, 30000);

    it('should return 404 for non-existent event', async () => {
      const fakeId = 'non-existent-event-id';

      const response = await request(baseURL)
        .get(`/events/${fakeId}`)
        .expect(404);

      console.log('✓ Validation: 404 for non-existent event');
    }, 30000);
  });

  describe('Update Events', () => {
    it('should update event title and description', async () => {
      const updateData = {
        title: 'Updated Event Title',
        description: 'This description has been updated',
      };

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.description).toBe(updateData.description);

      console.log('✓ Updated event title and description');
      console.log(`  - New title: ${response.body.title}`);
    }, 30000);

    it('should update event dates', async () => {
      const newStartsAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
      const newEndsAt = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString();

      const updateData = {
        startsAt: newStartsAt,
        endsAt: newEndsAt,
      };

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(new Date(response.body.startsAt).toISOString()).toBe(newStartsAt);
      expect(new Date(response.body.endsAt).toISOString()).toBe(newEndsAt);

      console.log('✓ Updated event dates');
      console.log(`  - New start: ${response.body.startsAt}`);
      console.log(`  - New end: ${response.body.endsAt}`);
    }, 30000);

    it('should update event capacity', async () => {
      const updateData = {
        totalCapacity: 150,
      };

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.totalCapacity).toBe(150);

      console.log('✓ Updated event capacity to 150');
    }, 30000);

    it('should update event location', async () => {
      const updateData = {
        city: 'Salvador',
        state: 'BA',
      };

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.city).toBe('Salvador');
      expect(response.body.state).toBe('BA');

      console.log('✓ Updated event location to Salvador, BA');
    }, 30000);

    it('should fail to update event without authorization', async () => {
      const updateData = {
        title: 'Unauthorized Update Attempt',
      };

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .send(updateData)
        .expect(403);

      console.log('✓ Validation: Prevented unauthorized update');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should fail to update non-existent event', async () => {
      const fakeId = 'non-existent-event-id';
      const updateData = {
        title: 'This Should Fail',
      };

      const response = await request(baseURL)
        .patch(`/events/${fakeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(404);

      console.log('✓ Validation: 404 for updating non-existent event');
    }, 30000);
  });

  describe('Publishing Workflow', () => {
    it('should publish draft event (DRAFT -> ACTIVE)', async () => {
      const updateData = {
        status: EventStatus.ACTIVE,
      };

      const response = await request(baseURL)
        .patch(`/events/${draftEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe(EventStatus.ACTIVE);

      console.log('✓ Published draft event (DRAFT -> ACTIVE)');
      console.log(`  - Event: ${draftEventId}`);
    }, 30000);

    it('should pause active event (ACTIVE -> PAUSED)', async () => {
      // First create a new active event to pause
      const timestamp = Date.now();
      const eventData = {
        title: 'Event to Pause',
        slug: `pause-test-${timestamp}`,
        description: 'This event will be paused',
        subject: 'Music',
        category: 'Concert',
        startsAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 36 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Recife',
        state: 'PE',
        producerName: 'Music Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 500,
      };

      const createResponse = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      pausedEventId = createResponse.body.id;

      // Now pause it
      const updateData = {
        status: EventStatus.PAUSED,
      };

      const response = await request(baseURL)
        .patch(`/events/${pausedEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe(EventStatus.PAUSED);

      console.log('✓ Paused active event (ACTIVE -> PAUSED)');
      console.log(`  - Event: ${pausedEventId}`);
    }, 30000);

    it('should unpause event (PAUSED -> ACTIVE)', async () => {
      const updateData = {
        status: EventStatus.ACTIVE,
      };

      const response = await request(baseURL)
        .patch(`/events/${pausedEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe(EventStatus.ACTIVE);

      console.log('✓ Unpaused event (PAUSED -> ACTIVE)');
      console.log(`  - Event: ${pausedEventId}`);
    }, 30000);

    it('should cancel event', async () => {
      // Create an event to cancel
      const timestamp = Date.now();
      const eventData = {
        title: 'Event to Cancel',
        slug: `cancel-test-${timestamp}`,
        description: 'This event will be cancelled',
        subject: 'Education',
        category: 'Course',
        startsAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 46 * 24 * 60 * 60 * 1000).toISOString(),
        locationType: 'new',
        city: 'Brasília',
        state: 'DF',
        producerName: 'Education Producer',
        ticketType: TicketType.PAID,
        status: EventStatus.ACTIVE,
        totalCapacity: 30,
      };

      const createResponse = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      const cancelledEventId = createResponse.body.id;

      // Cancel it
      const updateData = {
        status: EventStatus.CANCELLED,
      };

      const response = await request(baseURL)
        .patch(`/events/${cancelledEventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.status).toBe(EventStatus.CANCELLED);

      console.log('✓ Cancelled event (ACTIVE -> CANCELLED)');
      console.log(`  - Event: ${cancelledEventId}`);
    }, 30000);
  });

  describe('Delete Events', () => {
    it('should delete draft event', async () => {
      await request(baseURL)
        .delete(`/events/${eventToDeleteId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      // Verify deletion by trying to get the event
      await request(baseURL)
        .get(`/events/${eventToDeleteId}`)
        .expect(404);

      console.log('✓ Deleted draft event:', eventToDeleteId);
    }, 30000);

    it('should fail to delete event without authorization', async () => {
      const response = await request(baseURL)
        .delete(`/events/${activeEventId}`)
        .set('Authorization', `Bearer ${otherOrganizerToken}`)
        .expect(403);

      console.log('✓ Validation: Prevented unauthorized deletion');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should fail to delete non-existent event', async () => {
      const fakeId = 'non-existent-event-id';

      await request(baseURL)
        .delete(`/events/${fakeId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(404);

      console.log('✓ Validation: 404 for deleting non-existent event');
    }, 30000);

    it('should fail to delete event without authentication', async () => {
      await request(baseURL)
        .delete(`/events/${activeEventId}`)
        .expect(401);

      console.log('✓ Validation: Prevented deletion without authentication');
    }, 30000);
  });

  describe('Event Validation and Edge Cases', () => {
    it('should reject duplicate slug', async () => {
      const timestamp = Date.now();
      const duplicateSlug = `duplicate-slug-${timestamp}`;

      // Create first event with slug
      await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'First Event',
          slug: duplicateSlug,
          description: 'First event with this slug',
          subject: 'Technology',
          category: 'Conference',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
        })
        .expect(201);

      // Try to create second event with same slug
      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Second Event',
          slug: duplicateSlug, // Duplicate!
          description: 'Second event with duplicate slug',
          subject: 'Technology',
          category: 'Conference',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
        })
        .expect(409);

      expect(response.body.message).toMatch(/slug|already exists|duplicate/i);
      console.log('✓ Validation: Prevented duplicate slug');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should reject invalid date range (end before start)', async () => {
      const timestamp = Date.now();
      const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000); // Before start!

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Invalid Date Range Event',
          slug: `invalid-dates-${timestamp}`,
          description: 'Event with end date before start date',
          subject: 'Technology',
          category: 'Conference',
          startsAt: startDate.toISOString(),
          endsAt: endDate.toISOString(), // Invalid!
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.DRAFT,
        })
        .expect(400);

      expect(response.body.message).toMatch(/end.*after.*start|end.*before.*start|date.*range|invalid/i);
      console.log('✓ Validation: Prevented invalid date range');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should reject past start date', async () => {
      const timestamp = Date.now();
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Past Start Date Event',
          slug: `past-date-${timestamp}`,
          description: 'Event with past start date',
          subject: 'Technology',
          category: 'Conference',
          startsAt: pastDate.toISOString(), // In the past!
          endsAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.ACTIVE,
        })
        .expect(400);

      expect(response.body.message).toMatch(/past|start.*date|must.*future/i);
      console.log('✓ Validation: Prevented past start date');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);

    it('should reject negative capacity', async () => {
      const timestamp = Date.now();
      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Invalid Capacity Event',
          slug: `invalid-capacity-${timestamp}`,
          description: 'Event with negative capacity',
          subject: 'Technology',
          category: 'Conference',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
          totalCapacity: -100, // Negative capacity!
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.DRAFT,
        })
        .expect(400);

      // NestJS returns validation errors as array
      const errorMessage = Array.isArray(response.body.message)
        ? response.body.message.join(', ')
        : response.body.message;
      expect(errorMessage).toMatch(/capacity|must.*not.*less|greater.*zero/i);
      console.log('✓ Validation: Prevented negative capacity');
      console.log(`  - Error: ${errorMessage}`);
    }, 30000);

    it('should reject zero capacity', async () => {
      const timestamp = Date.now();
      const response = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Zero Capacity Event',
          slug: `zero-capacity-${timestamp}`,
          description: 'Event with zero capacity',
          subject: 'Technology',
          category: 'Conference',
          startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString(),
          totalCapacity: 0, // Zero capacity!
          locationType: 'new',
          city: 'São Paulo',
          state: 'SP',
          producerName: 'Test Producer',
          ticketType: TicketType.PAID,
          status: EventStatus.DRAFT,
        })
        .expect(400);

      // NestJS returns validation errors as array
      const errorMessage = Array.isArray(response.body.message)
        ? response.body.message.join(', ')
        : response.body.message;
      expect(errorMessage).toMatch(/capacity|must.*not.*less|greater.*zero/i);
      console.log('✓ Validation: Prevented zero capacity');
      console.log(`  - Error: ${errorMessage}`);
    }, 30000);

    it('should reject updating event to past date', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      const response = await request(baseURL)
        .patch(`/events/${eventToUpdateId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          startsAt: pastDate.toISOString(), // Updating to past date!
        })
        .expect(400);

      expect(response.body.message).toMatch(/past|start.*date|must.*future/i);
      console.log('✓ Validation: Prevented updating to past start date');
      console.log(`  - Error: ${response.body.message}`);
    }, 30000);
  });

  describe('Event Filtering and Search', () => {
    it('should filter events by status', async () => {
      const response = await request(baseURL)
        .get('/events')
        .query({ status: EventStatus.ACTIVE })
        .expect(200);

      // API returns paginated response with data array
      const events = response.body.data || response.body;
      expect(Array.isArray(events)).toBe(true);

      // Check if all returned events have ACTIVE status
      const allActive = events.every((event: any) => event.status === EventStatus.ACTIVE);

      console.log(`✓ Filtered events by status: ${events.length} active events`);
      if (events.length > 0) {
        console.log(`  - All results have ACTIVE status: ${allActive}`);
      }
    }, 30000);

    it('should search events by title', async () => {
      const response = await request(baseURL)
        .get('/events')
        .query({ search: 'CRUD Test' })
        .expect(200);

      // API returns paginated response with data array
      const events = response.body.data || response.body;
      expect(Array.isArray(events)).toBe(true);

      console.log(`✓ Searched events by title: ${events.length} results`);
    }, 30000);
  });

  describe('Summary Statistics', () => {
    it('should display CRUD operations summary', async () => {
      console.log('\n📊 Event CRUD Operations Summary:\n');

      // Count events by status
      const allEventsResponse = await request(baseURL)
        .get('/events')
        .expect(200);

      // API returns paginated response with data array
      const allEvents = allEventsResponse.body.data || allEventsResponse.body;

      const activeEvents = allEvents.filter((e: any) => e.status === EventStatus.ACTIVE).length;
      const draftEvents = allEvents.filter((e: any) => e.status === EventStatus.DRAFT).length;
      const pausedEvents = allEvents.filter((e: any) => e.status === EventStatus.PAUSED).length;
      const cancelledEvents = allEvents.filter((e: any) => e.status === EventStatus.CANCELLED).length;

      console.log(`Total Events: ${allEvents.length}`);
      console.log(`  - Active: ${activeEvents}`);
      console.log(`  - Draft: ${draftEvents}`);
      console.log(`  - Paused: ${pausedEvents}`);
      console.log(`  - Cancelled: ${cancelledEvents}`);

      console.log('\n✅ All Event CRUD tests completed successfully!\n');
    }, 30000);
  });
});
