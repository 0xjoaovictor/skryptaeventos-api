import request from 'supertest';
import { TestUtils } from '../test-utils';

describe('Waitlist E2E Tests', () => {
  const baseURL = TestUtils.baseURL;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n📋 Running Waitlist E2E tests against ${baseURL}`);
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  describe('POST /waitlist', () => {
    it('should successfully create a waitlist entry', async () => {
      const waitlistData = {
        churchName: 'Igreja Batista Central',
        responsibleName: 'João Silva',
        email: TestUtils.generateEmail('waitlist'),
        whatsapp: '5511999999999',
        city: 'São Paulo',
      };

      const response = await request(baseURL)
        .post('/waitlist')
        .send(waitlistData)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('sucesso');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email', waitlistData.email);
      expect(response.body.data).toHaveProperty('churchName', waitlistData.churchName);
      expect(response.body.data).toHaveProperty('createdAt');
    });

    it('should reject duplicate email', async () => {
      const email = TestUtils.generateEmail('duplicate');
      const waitlistData = {
        churchName: 'Igreja Batista Central',
        responsibleName: 'João Silva',
        email,
        whatsapp: '5511999999999',
        city: 'São Paulo',
      };

      // Create first entry
      await request(baseURL)
        .post('/waitlist')
        .send(waitlistData)
        .expect(201);

      // Try to create duplicate
      const response = await request(baseURL)
        .post('/waitlist')
        .send(waitlistData)
        .expect(409);

      expect(response.body.message).toContain('já está na lista de espera');
    });

    it('should reject missing required fields', async () => {
      const invalidData = {
        churchName: 'Test Church',
        // Missing responsibleName, email, whatsapp, city
      };

      const response = await request(baseURL)
        .post('/waitlist')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid email format', async () => {
      const invalidData = {
        churchName: 'Test Church',
        responsibleName: 'Test User',
        email: 'invalid-email-format',
        whatsapp: '5511999999999',
        city: 'São Paulo',
      };

      await request(baseURL)
        .post('/waitlist')
        .send(invalidData)
        .expect(400);
    });

    it('should reject invalid phone format', async () => {
      const invalidData = {
        churchName: 'Test Church',
        responsibleName: 'Test User',
        email: TestUtils.generateEmail('invalid-phone'),
        whatsapp: 'invalid-phone',
        city: 'São Paulo',
      };

      await request(baseURL)
        .post('/waitlist')
        .send(invalidData)
        .expect(400);
    });

    it('should accept valid Brazilian phone formats', async () => {
      // With country code
      await request(baseURL)
        .post('/waitlist')
        .send({
          churchName: 'Test Church',
          responsibleName: 'Test User',
          email: TestUtils.generateEmail('phone1'),
          whatsapp: '5511999999999',
          city: 'São Paulo',
        })
        .expect(201);

      // Without country code
      await request(baseURL)
        .post('/waitlist')
        .send({
          churchName: 'Test Church',
          responsibleName: 'Test User',
          email: TestUtils.generateEmail('phone2'),
          whatsapp: '11999999999',
          city: 'São Paulo',
        })
        .expect(201);
    });

    it('should handle special characters in names', async () => {
      const specialCharsData = {
        churchName: 'Igreja São José & Maria - "Esperança"',
        responsibleName: 'José da Silva O\'Connor',
        email: TestUtils.generateEmail('special-chars'),
        whatsapp: '5511999999999',
        city: 'São Paulo',
      };

      const response = await request(baseURL)
        .post('/waitlist')
        .send(specialCharsData)
        .expect(201);

      expect(response.body.data.churchName).toBe(specialCharsData.churchName);
    });

    it('should reject empty strings in required fields', async () => {
      const invalidData = {
        churchName: '',
        responsibleName: '',
        email: '',
        whatsapp: '',
        city: '',
      };

      await request(baseURL)
        .post('/waitlist')
        .send(invalidData)
        .expect(400);
    });

    it('should handle very long input strings', async () => {
      const longData = {
        churchName: 'A'.repeat(500),
        responsibleName: 'B'.repeat(300),
        email: TestUtils.generateEmail('long-input'),
        whatsapp: '5511999999999',
        city: 'C'.repeat(200),
      };

      const response = await request(baseURL)
        .post('/waitlist')
        .send(longData)
        .expect(201);

      expect(response.body.data.churchName).toBe(longData.churchName);
    });

    it('should trim whitespace from email', async () => {
      const email = TestUtils.generateEmail('trimmed');
      const dataWithSpaces = {
        churchName: 'Test Church',
        responsibleName: 'Test User',
        email: `  ${email}  `,
        whatsapp: '5511999999999',
        city: 'São Paulo',
      };

      const response = await request(baseURL)
        .post('/waitlist')
        .send(dataWithSpaces)
        .expect(201);

      expect(response.body.data.email).toBe(email);
    });

    it('should accept international phone numbers', async () => {
      const internationalData = {
        churchName: 'International Church',
        responsibleName: 'John Doe',
        email: TestUtils.generateEmail('international'),
        whatsapp: '1234567890123',
        city: 'New York',
      };

      await request(baseURL)
        .post('/waitlist')
        .send(internationalData)
        .expect(201);
    });
  });
});
