import { PrismaClient } from '@prisma/client';
import request from 'supertest';

export class TestUtils {
  static baseURL = 'https://blier-talisha-concerningly.ngrok-free.dev/api';
  static prisma = new PrismaClient();

  static async setupTestApp() {
    // Connect to Prisma
    await this.prisma.$connect();
    console.log('✓ Connected to database for E2E tests');
  }

  static async closeTestApp() {
    // Disconnect from Prisma
    await this.prisma.$disconnect();
    console.log('✓ Disconnected from database');
  }

  static async cleanDatabase() {
    // Delete in correct order to avoid foreign key constraints
    await this.prisma.ticketInstance.deleteMany();
    await this.prisma.orderItem.deleteMany();
    await this.prisma.refund.deleteMany();
    await this.prisma.payment.deleteMany();
    await this.prisma.order.deleteMany();
    await this.prisma.session.deleteMany();
    await this.prisma.promoCode.deleteMany();
    await this.prisma.customFormField.deleteMany();
    await this.prisma.ticket.deleteMany();
    await this.prisma.ticketCategory.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.event.deleteMany();
    await this.prisma.user.deleteMany();
  }

  static async cleanupNonOrganizerUsers() {
    console.log('🧹 Cleaning up non-organizer users and their data...');

    // Get all non-organizer users
    const nonOrganizers = await this.prisma.user.findMany({
      where: {
        role: {
          not: 'ORGANIZER',
        },
      },
    });

    console.log(`   Found ${nonOrganizers.length} non-organizer user(s) to clean up`);

    // Delete all related data for each non-organizer user
    for (const user of nonOrganizers) {
      // Delete in correct order to handle foreign key constraints
      await this.prisma.ticketInstance.deleteMany({
        where: { orderItem: { order: { buyerId: user.id } } },
      });
      await this.prisma.orderItem.deleteMany({
        where: { order: { buyerId: user.id } },
      });
      await this.prisma.refund.deleteMany({
        where: { payment: { order: { buyerId: user.id } } },
      });
      await this.prisma.payment.deleteMany({
        where: { order: { buyerId: user.id } },
      });
      await this.prisma.order.deleteMany({
        where: { buyerId: user.id },
      });
      await this.prisma.session.deleteMany({
        where: { userId: user.id },
      });
      await this.prisma.user.delete({
        where: { id: user.id },
      });
    }

    console.log('✓ Non-organizer users cleaned up successfully');
  }

  /**
   * Get or create default test admin
   * Uses 0xzionmount@gmail.com with ADMIN role
   */
  static async getOrCreateTestAdmin() {
    const defaultEmail = '0xzionmount@gmail.com';
    const defaultPassword = 'AttendeePass123!';

    // Check if user already exists
    let existingUser = await this.prisma.user.findUnique({
      where: { email: defaultEmail },
    });

    if (existingUser) {
      // Ensure role is ADMIN
      if (existingUser.role !== 'ADMIN') {
        existingUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { role: 'ADMIN' },
        });
        console.log('✓ Updated user to ADMIN role');
      } else {
        console.log('✓ Using existing ADMIN user');
      }

      console.log(`  - Email: ${existingUser.email}`);
      console.log(`  - CPF: ${existingUser.cpf}`);

      // Login to get fresh token
      const loginResponse = await this.loginUser(defaultEmail, defaultPassword);
      return {
        user: loginResponse.user,
        accessToken: loginResponse.accessToken,
      };
    }

    // Create new admin user
    console.log('⚠️  Creating new ADMIN user...');

    const defaultCPF = this.generateCPF();

    const response = await request(this.baseURL)
      .post('/auth/register')
      .send({
        email: defaultEmail,
        name: 'Admin User',
        password: defaultPassword,
        role: 'ADMIN',
        cpf: defaultCPF,
        phone: '4738010919',
      });

    if (response.status !== 201) {
      throw new Error(`Failed to create admin user: ${JSON.stringify(response.body)}`);
    }

    console.log('✓ ADMIN user created successfully');
    console.log(`  - Email: ${response.body.user.email}`);
    console.log(`  - CPF: ${defaultCPF}`);

    return {
      user: response.body.user,
      accessToken: response.body.access_token,
    };
  }

  /**
   * Get or create default test attendee/buyer
   * Uses a fixed email and password to ensure consistency across test runs
   */
  static async getOrCreateTestAttendee() {
    const defaultEmail = '0xzionmount@gmail.com';
    const defaultPassword = 'AttendeePass123!';

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: defaultEmail },
    });

    if (existingUser) {
      console.log('✓ Using existing test attendee');
      console.log(`  - Email: ${existingUser.email}`);
      console.log(`  - CPF: ${existingUser.cpf}`);

      // Login to get fresh token
      const loginResponse = await this.loginUser(defaultEmail, defaultPassword);
      return {
        user: loginResponse.user,
        accessToken: loginResponse.accessToken,
      };
    }

    // Create new attendee
    console.log('⚠️  Creating new test attendee...');

    const defaultCPF = this.generateCPF();

    const response = await request(this.baseURL)
      .post('/auth/register')
      .send({
        email: defaultEmail,
        name: 'Test Attendee',
        password: defaultPassword,
        role: 'ATTENDEE',
        cpf: defaultCPF,
        phone: '4738010919',
      });

    if (response.status !== 201) {
      console.error('❌ Failed to create test attendee');
      console.error('Status:', response.status);
      console.error('Error:', JSON.stringify(response.body, null, 2));
      throw new Error(`Failed to create test attendee: ${JSON.stringify(response.body)}`);
    }

    console.log('✓ Test attendee created successfully');
    console.log(`  - Email: ${response.body.user.email}`);
    console.log(`  - CPF: ${defaultCPF}`);

    return {
      user: response.body.user,
      accessToken: response.body.access_token,
    };
  }

  /**
   * Get or create default test organizer with ASAAS subaccount
   * This helps avoid creating multiple ASAAS subaccounts during testing
   * (ASAAS sandbox has a limit of 20 subaccounts per day)
   */
  static async getOrCreateTestOrganizer() {
    const defaultEmail = 'test-organizer-whitelabel-events@skryptaeventos.com';
    const defaultPassword = 'TestOrganizerWhiteLabel123!';

    // Check if organizer already exists (with or without ASAAS wallet)
    const existingOrganizer = await this.prisma.user.findFirst({
      where: {
        email: defaultEmail,
        role: 'ORGANIZER',
      },
    });

    if (existingOrganizer) {
      console.log('✓ Using existing test organizer');
      console.log(`  - Email: ${existingOrganizer.email}`);
      console.log(`  - CPF: ${existingOrganizer.cpf}`);
      if (existingOrganizer.asaasWalletId) {
        console.log(`  - Wallet ID: ${existingOrganizer.asaasWalletId}`);
      }

      // Login to get fresh token
      const loginResponse = await this.loginUser(defaultEmail, defaultPassword);
      return {
        user: loginResponse.user,
        accessToken: loginResponse.accessToken,
      };
    }

    // No organizer exists in DB - create new one
    // Note: If ASAAS email is already in use, registration will fail with clear error
    console.log('⚠️  No test organizer found, creating new one...');
    console.log('   Note: If ASAAS email is already in use, you may need to use a different email or clean ASAAS manually');

    // Generate a unique valid CPF for this test
    const defaultCPF = this.generateCPF();

    const response = await request(this.baseURL)
      .post('/auth/register')
      .send({
        email: defaultEmail,
        name: 'Test Event Organizer',
        password: defaultPassword,
        role: 'ORGANIZER',
        cpf: defaultCPF,
        phone: '47988451155', // Mobile format: area code (47) + 9 prefix + 8 digits = 11 digits total
        // ASAAS Whitelabel Required Fields
        birthDate: '1990-01-01',
        companyType: 'MEI',
        address: 'Rua Teste',
        addressNumber: '123',
        complement: 'Sala 1',
        province: 'Centro',
        postalCode: '88015100',
        city: 'Florianópolis',
        state: 'SC',
        incomeValue: 5000, // Monthly income R$ 5.000
      });

    if (response.status !== 201) {
      console.error('❌ Failed to create test organizer');
      console.error('Status:', response.status);
      console.error('Error:', JSON.stringify(response.body, null, 2));
      throw new Error(`Failed to create test organizer: ${JSON.stringify(response.body)}`);
    }

    console.log('✓ Test organizer created successfully with whitelabel subaccount');
    console.log(`  - Email: ${response.body.user.email}`);
    console.log(`  - Wallet ID: ${response.body.user.asaasWalletId}`);

    return {
      user: response.body.user,
      accessToken: response.body.access_token,
    };
  }

  static async createTestUser(userData: {
    email: string;
    name: string;
    password: string;
    role?: 'ADMIN' | 'ORGANIZER' | 'ATTENDEE';
    cpf?: string;
  }) {
    const response = await request(this.baseURL)
      .post('/auth/register')
      .send({
        email: userData.email,
        name: userData.name,
        password: userData.password,
        role: userData.role || 'ATTENDEE',
        cpf: userData.cpf,
      })
      .expect(201);

    return {
      user: response.body.user,
      accessToken: response.body.access_token,
    };
  }

  static async loginUser(email: string, password: string) {
    const response = await request(this.baseURL)
      .post('/auth/login')
      .send({ email, password });

    // Login can return either 200 or 201
    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.body)}`);
    }

    return {
      user: response.body.user,
      accessToken: response.body.access_token,
    };
  }

  static getAuthHeader(token: string) {
    return `Bearer ${token}`;
  }

  static async createTestEvent(token: string, eventData?: Partial<any>) {
    const defaultEventData = {
      title: 'Test Event',
      description: 'Test Description',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      salesStartsAt: new Date().toISOString(),
      salesEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      producerName: 'Test Producer',
      ticketType: 'PAID',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      isOnline: true,
      onlineUrl: 'https://zoom.us/test',
      ...eventData,
    };

    const response = await request(this.baseURL)
      .post('/events')
      .set('Authorization', this.getAuthHeader(token))
      .send(defaultEventData)
      .expect(201);

    return response.body;
  }

  static async createTestTicket(token: string, eventId: string, ticketData?: Partial<any>) {
    const defaultTicketData = {
      eventId,
      title: 'General Admission',
      description: 'Standard ticket',
      price: 50.00,
      quantity: 100,
      minQuantity: 1,
      maxQuantity: 10,
      salesStartsAt: new Date().toISOString(),
      salesEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      isVisible: true,
      hasHalfPrice: true,
      halfPrice: 25.00,
      halfPriceQuantity: 50,
      serviceFeePercentage: 3, // 3% platform service fee
      ...ticketData,
    };

    const response = await request(this.baseURL)
      .post('/tickets')
      .set('Authorization', this.getAuthHeader(token))
      .send(defaultTicketData)
      .expect(201);

    return response.body;
  }

  static async createTestOrder(token: string, eventId: string, items: Array<{ ticketId: string; quantity: number; isHalfPrice?: boolean }>) {
    const response = await request(this.baseURL)
      .post('/orders')
      .set('Authorization', this.getAuthHeader(token))
      .send({
        eventId,
        items,
      })
      .expect(201);

    return response.body;
  }

  static generateCPF(): string {
    // Generate a valid Brazilian CPF for testing
    const randomDigits = () => Math.floor(Math.random() * 10);
    const cpf = Array.from({ length: 9 }, randomDigits);

    // Calculate first verification digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += cpf[i] * (10 - i);
    }
    let remainder = sum % 11;
    cpf.push(remainder < 2 ? 0 : 11 - remainder);

    // Calculate second verification digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += cpf[i] * (11 - i);
    }
    remainder = sum % 11;
    cpf.push(remainder < 2 ? 0 : 11 - remainder);

    return cpf.join('');
  }

  static generateEmail(prefix: string = 'test'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
  }

  static wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
