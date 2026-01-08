import request from 'supertest';
import { TestUtils } from '../test-utils';

describe('Auth E2E Tests', () => {
  const baseURL = TestUtils.baseURL;

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🎫 Running Free Events E2E tests against ${baseURL}`);

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  describe('Auth: Registration', () => {
    it('should register a new attendee user', async () => {
      const email = TestUtils.generateEmail('attendee');
      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test Attendee',
          password: 'Password123!',
          role: 'ATTENDEE',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('access_token');
      expect(response.body.user.email).toBe(email);
      expect(response.body.user.role).toBe('ATTENDEE');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should fail with weak password (too short)', async () => {
      await request(baseURL)
        .post('/auth/register')
        .send({
          email: TestUtils.generateEmail('weak'),
          name: 'Test User',
          password: '123',
          role: 'ATTENDEE',
        })
        .expect(400);
    });

    it('should fail with duplicate CPF', async () => {
      const cpf = TestUtils.generateCPF();
      const userData = {
        email: TestUtils.generateEmail('cpf1'),
        name: 'First User',
        password: 'Password123!',
        role: 'ATTENDEE',
        cpf,
      };

      await request(baseURL)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      await request(baseURL)
        .post('/auth/register')
        .send({
          email: TestUtils.generateEmail('cpf2'),
          name: 'Second User',
          password: 'Password123!',
          role: 'ATTENDEE',
          cpf, // Same CPF
        })
        .expect(409);
    });

    it('should fail with invalid CPF format', async () => {
      await request(baseURL)
        .post('/auth/register')
        .send({
          email: TestUtils.generateEmail('invalidcpf'),
          name: 'Test User',
          password: 'Password123!',
          role: 'ATTENDEE',
          cpf: '123', // Invalid CPF format
        })
        .expect(400);
    });

    // Commented out to avoid creating multiple ASAAS subaccounts
    // Use TestUtils.getOrCreateTestOrganizer() instead in other tests
    // it('should register a new organizer user', async () => {
    //   const email = TestUtils.generateEmail('organizer');
    //   const response = await request(baseURL)
    //     .post('/auth/register')
    //     .send({
    //       email,
    //       name: 'Test Organizer',
    //       password: 'Password123!',
    //       role: 'ORGANIZER',
    //     })
    //     .expect(201);

    //   expect(response.body.user.role).toBe('ORGANIZER');
    // });

    it('should register user with CPF', async () => {
      const email = TestUtils.generateEmail('cpf');
      const cpf = TestUtils.generateCPF();
      const response = await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User with CPF',
          password: 'Password123!',
          role: 'ATTENDEE',
          cpf,
        })
        .expect(201);

      expect(response.body.user.cpf).toBe(cpf);
    });

    it('should fail with duplicate email', async () => {
      const email = TestUtils.generateEmail('duplicate');
      const userData = {
        email,
        name: 'First User',
        password: 'Password123!',
        role: 'ATTENDEE',
      };

      await request(baseURL)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      await request(baseURL)
        .post('/auth/register')
        .send(userData)
        .expect(409);
    });

    it('should fail with invalid email format', async () => {
      await request(baseURL)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          name: 'Test User',
          password: 'Password123!',
          role: 'ATTENDEE',
        })
        .expect(400);
    });

    it('should fail with missing required fields', async () => {
      await request(baseURL)
        .post('/auth/register')
        .send({
          email: TestUtils.generateEmail(),
        })
        .expect(400);
    });
  });

  describe('Auth: Login', () => {
    it('should login with valid credentials', async () => {
      const email = TestUtils.generateEmail('login');
      const password = 'Password123!';

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User',
          password,
          role: 'ATTENDEE',
        })
        .expect(201);

      const response = await request(baseURL)
        .post('/auth/login')
        .send({ email, password })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(email);
    });

    it('should fail with incorrect password', async () => {
      const email = TestUtils.generateEmail('wrongpass');

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User',
          password: 'CorrectPassword123!',
          role: 'ATTENDEE',
        })
        .expect(201);

      await request(baseURL)
        .post('/auth/login')
        .send({ email, password: 'WrongPassword123!' })
        .expect(401);
    });

    it('should fail with non-existent email', async () => {
      await request(baseURL)
        .post('/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'Password123!',
        })
        .expect(401);
    });
  });

  describe('Auth: Email Verification', () => {
    it('should verify email with valid token', async () => {
      const email = TestUtils.generateEmail('verify');

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User',
          password: 'Password123!',
          role: 'ATTENDEE',
        })
        .expect(201);

      const user = await TestUtils.prisma.user.findUnique({ where: { email } });

      expect(user).toBeTruthy();
      expect(user!.verificationToken).toBeTruthy();

      const response = await request(baseURL)
        .get(`/auth/verify-email?token=${user!.verificationToken}`)
        .expect(200);

      expect(response.body.message).toContain('verified');

      const verifiedUser = await TestUtils.prisma.user.findUnique({ where: { email } });
      expect(verifiedUser!.emailVerified).toBe(true);
      expect(verifiedUser!.verificationToken).toBeNull();
    });

    it('should fail with invalid token', async () => {
      await request(baseURL)
        .get('/auth/verify-email?token=invalid-token')
        .expect(400);
    });
  });

  describe('Auth: Password Reset', () => {
    it('should request password reset for existing email', async () => {
      const email = TestUtils.generateEmail('reset');

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User',
          password: 'Password123!',
          role: 'ATTENDEE',
        })
        .expect(201);

      const response = await request(baseURL)
        .post('/auth/request-password-reset')
        .send({ email })
        .expect(201);

      expect(response.body.message).toBeTruthy();

      const user = await TestUtils.prisma.user.findUnique({ where: { email } });
      expect(user!.resetToken).toBeTruthy();
      expect(user!.resetTokenExpiresAt).toBeTruthy();
    });

    it('should not reveal if email does not exist', async () => {
      const response = await request(baseURL)
        .post('/auth/request-password-reset')
        .send({ email: 'nonexistent@test.com' })
        .expect(201);

      expect(response.body.message).toBeTruthy();
    });

    it('should reset password with valid token', async () => {
      const email = TestUtils.generateEmail('resetpass');
      const oldPassword = 'OldPassword123!';
      const newPassword = 'NewPassword123!';

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Test User',
          password: oldPassword,
          role: 'ATTENDEE',
        })
        .expect(201);

      await request(baseURL)
        .post('/auth/request-password-reset')
        .send({ email })
        .expect(201);

      const user = await TestUtils.prisma.user.findUnique({ where: { email } });

      await request(baseURL)
        .post('/auth/reset-password')
        .send({
          token: user!.resetToken,
          password: newPassword,
        })
        .expect(201);

      const updatedUser = await TestUtils.prisma.user.findUnique({ where: { email } });
      expect(updatedUser!.resetToken).toBeNull();
      expect(updatedUser!.resetTokenExpiresAt).toBeNull();

      await request(baseURL)
        .post('/auth/login')
        .send({ email, password: newPassword })
        .expect(201);

      await request(baseURL)
        .post('/auth/login')
        .send({ email, password: oldPassword })
        .expect(401);
    });

    it('should fail with invalid reset token', async () => {
      await request(baseURL)
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!',
        })
        .expect(400);
    });

    it('should fail with expired reset token', async () => {
      const email = TestUtils.generateEmail('expired');
      const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const resetToken = `expired-token-${Date.now()}-${Math.random()}`;

      await TestUtils.prisma.user.create({
        data: {
          email,
          name: 'Test User',
          password: 'hashedpassword',
          resetToken,
          resetTokenExpiresAt: expiredDate,
        },
      });

      await request(baseURL)
        .post('/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!',
        })
        .expect(400);
    });
  });

  describe('Auth: Session Management', () => {
    it('should fail to access protected route without token', async () => {
      await request(baseURL)
        .get('/users/me')
        .expect(401);
    });

    it('should fail to access protected route with invalid token', async () => {
      await request(baseURL)
        .get('/users/me')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401);
    });

    it('should fail to access protected route with malformed token', async () => {
      await request(baseURL)
        .get('/users/me')
        .set('Authorization', 'InvalidFormat token123')
        .expect(401);
    });
  });

  describe('Auth: Complete Flow', () => {
    it('should complete full registration and login flow', async () => {
      const email = TestUtils.generateEmail('fullflow');
      const password = 'Password123!';
      const name = 'Full Flow User';

      const registerResponse = await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name,
          password,
          role: 'ATTENDEE',
        })
        .expect(201);

      expect(registerResponse.body.access_token).toBeTruthy();
      const firstToken = registerResponse.body.access_token;

      await request(baseURL)
        .get('/users/me')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(200);

      const loginResponse = await request(baseURL)
        .post('/auth/login')
        .send({ email, password })
        .expect(201);

      expect(loginResponse.body.access_token).toBeTruthy();
      const secondToken = loginResponse.body.access_token;

      await request(baseURL)
        .get('/users/me')
        .set('Authorization', `Bearer ${firstToken}`)
        .expect(200);

      await request(baseURL)
        .get('/users/me')
        .set('Authorization', `Bearer ${secondToken}`)
        .expect(200);

      const user = await TestUtils.prisma.user.findUnique({ where: { email } });
      const sessions = await TestUtils.prisma.session.findMany({
        where: { userId: user!.id },
      });

      expect(sessions.length).toBe(2);
    });

    it('should handle case-insensitive email login', async () => {
      const email = TestUtils.generateEmail('casetest').toLowerCase();
      const password = 'Password123!';

      await request(baseURL)
        .post('/auth/register')
        .send({
          email,
          name: 'Case Test User',
          password,
          role: 'ATTENDEE',
        })
        .expect(201);

      // Login with uppercase email
      const loginResponse = await request(baseURL)
        .post('/auth/login')
        .send({ email: email.toUpperCase(), password })
        .expect(201);

      expect(loginResponse.body.access_token).toBeTruthy();
    });

    it('should trim whitespace from email during registration and login', async () => {
      const email = TestUtils.generateEmail('trimtest');
      const password = 'Password123!';

      await request(baseURL)
        .post('/auth/register')
        .send({
          email: `  ${email}  `, // Email with whitespace
          name: 'Trim Test User',
          password,
          role: 'ATTENDEE',
        })
        .expect(201);

      const loginResponse = await request(baseURL)
        .post('/auth/login')
        .send({ email: `  ${email}  `, password })
        .expect(201);

      expect(loginResponse.body.user.email).toBe(email);
    });
  });
});
