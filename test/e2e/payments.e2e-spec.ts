import request from 'supertest';
import { TestUtils } from '../test-utils';

describe('Payments E2E Tests', () => {
  const baseURL = TestUtils.baseURL;
  const TEST_BUYER_EMAIL = '0xzionmount@gmail.com';

  beforeAll(async () => {
    await TestUtils.setupTestApp();
    console.log(`\n🚀 Running Payments E2E tests against ${baseURL}`);
    console.log('⚠️  Make sure the API is running: yarn start:dev');
    console.log('⚠️  Make sure ASAAS sandbox is configured\n');

    // Clean up non-organizer users before running tests
    await TestUtils.cleanupNonOrganizerUsers();
  });

  beforeEach(async () => {
    // Wait 5 seconds between each test to avoid rate limiting and connection issues
    await TestUtils.wait(5000);
  });

  afterAll(async () => {
    await TestUtils.closeTestApp();
  });

  describe('Payment: Credit Card - Full Payment', () => {
    it('should complete full credit card payment flow for event ticket', async () => {
      // STEP 1: Get or create test organizer with ASAAS subaccount
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const organizerId = organizer.user.id;
      const organizerWalletId = organizer.user.asaasWalletId;

      expect(organizerToken).toBeTruthy();
      expect(organizerWalletId).toBeTruthy();
      console.log('✓ Organizer ready:', organizer.user.email);

      // STEP 2: Create event
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000); // 31 days from now
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000); // 29 days from now

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Tech Conference 2024 - Payment Test',
          subject: 'Technology',
          description: 'Testing credit card payments',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Tech Events Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Av. Paulista, 1000',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100',
        })
        .expect(201);

      expect(event.body.id).toBeTruthy();
      console.log('✓ Event created successfully:', event.body.title);

      // STEP 3: Create ticket
      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'VIP Pass',
          description: 'VIP access to conference',
          type: 'PAID',
          price: 100.00, // R$ 100.00
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      expect(ticket.body.id).toBeTruthy();
      console.log('✓ Ticket created successfully:', ticket.body.title, '- R$', ticket.body.price);

      // STEP 4: Get or create attendee with CPF (required for payment)
      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      // STEP 5: Create order with attendee information
      const order = await request(baseURL)
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
                  attendeeName: attendee.user.name,
                  attendeeEmail: attendee.user.email,
                  formResponses: {},
                },
              ],
            },
          ],
        })
        .expect(201);

      expect(order.body.id).toBeTruthy();
      expect(order.body.status).toBe('PENDING');
      // Service fee is absorbed by organizer (absorbServiceFee = true by default)
      expect(Number(order.body.total)).toBe(100.00);
      console.log('✓ Order created successfully - Total: R$', order.body.total);

      // STEP 6: Create credit card payment
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const expiryMonth = String(nextMonth.getMonth() + 1).padStart(2, '0');
      const expiryYear = String(nextMonth.getFullYear());

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Tech Conference 2024 ticket',
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444444', // Valid test card from ASAAS
            expiryMonth: expiryMonth,
            expiryYear: expiryYear,
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '4738010919',
            mobilePhone: '4738010919',
            postalCode: '01310100',
            address: 'Av. Paulista',
            addressNumber: '1000',
            province: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
          },
        });

      if (paymentResponse.status !== 201) {
        console.error('❌ Payment creation failed!');
        console.error('Status:', paymentResponse.status);
        console.error('Error:', JSON.stringify(paymentResponse.body, null, 2));
        throw new Error(`Payment failed with status ${paymentResponse.status}: ${JSON.stringify(paymentResponse.body)}`);
      }

      expect(paymentResponse.status).toBe(201);

      expect(paymentResponse.body.id).toBeTruthy();
      expect(paymentResponse.body.method).toBe('CREDIT_CARD');
      expect(paymentResponse.body.providerName).toBe('ASAAS');
      expect(paymentResponse.body.providerTransactionId).toBeTruthy();
      expect(Number(paymentResponse.body.amount)).toBe(100.00);

      console.log('✓ Payment created successfully');
      console.log('  - Payment ID:', paymentResponse.body.id);
      console.log('  - ASAAS Transaction ID:', paymentResponse.body.providerTransactionId);
      console.log('  - Status:', paymentResponse.body.status);
      console.log('  - Amount: R$', paymentResponse.body.amount);

      // STEP 7: Verify payment status (credit card should be COMPLETED or PENDING)
      const allowedStatuses = ['COMPLETED', 'PENDING', 'PROCESSING'];
      expect(allowedStatuses).toContain(paymentResponse.body.status);

      // STEP 8: Verify order status was updated
      const updatedOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      expect(updatedOrder.body.paymentId).toBe(paymentResponse.body.id);
      expect(updatedOrder.body.paymentMethod).toBe('CREDIT_CARD');
      console.log('✓ Order updated with payment info');

      // STEP 9: Wait for webhook to process and generate ticket instances
      // Even when ASAAS returns COMPLETED immediately (sandbox behavior),
      // the webhook is sent asynchronously and triggers ticket generation.
      // This polling mimics real-world behavior where users refresh to see their tickets.
      console.log('⏳ Waiting for ASAAS webhook to process and generate ticket instances...');
      console.log(`  - Initial payment status: ${paymentResponse.body.status}`);
      console.log('  - Webhook URL: /payments/webhook/asaas');

      let ticketInstances: any = null;
      let attempts = 0;
      const maxAttempts = 10; // 10 attempts
      const delayMs = 2000; // 2 seconds between attempts = max 20 seconds total

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`  - Polling attempt ${attempts}/${maxAttempts} (waiting ${delayMs}ms)...`);

        await TestUtils.wait(delayMs);

        // Check if ticket instances were created for THIS order
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        // Filter tickets for the current event and order
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) => {
          return instance.orderItem?.ticketId === ticket.body.id &&
                 instance.orderItem?.orderId === order.body.id;
        });

        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ Ticket instances for current order found after ${attempts * delayMs / 1000} seconds`);
          break;
        }
      }

      // Verify ticket instances were created for THIS order
      if (!ticketInstances || ticketInstances.body.data.length === 0) {
        console.error('❌ No ticket instances found for current order after polling');
        console.error(`  - Waited ${maxAttempts * delayMs / 1000} seconds total`);
        console.error(`  - Order ID: ${order.body.id}`);
        console.error(`  - Ticket ID: ${ticket.body.id}`);
        console.error('  - This indicates webhook may not have been processed');
        console.error('  - Check API logs for webhook errors');
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Detailed ticket instance verification
      const ticketInstance = ticketInstances.body.data[0];
      expect(ticketInstance.qrCode).toBeTruthy();
      expect(ticketInstance.status).toBe('ACTIVE');
      expect(ticketInstance.isHalfPrice).toBe(false);
      expect(ticketInstance.checkedInAt).toBeNull();
      expect(ticketInstance.transferredAt).toBeNull();

      // Verify the ticket instance belongs to the correct order and ticket
      expect(ticketInstance.orderItem.orderId).toBe(order.body.id);
      expect(ticketInstance.orderItem.ticketId).toBe(ticket.body.id);

      // Verify creation timestamp is recent
      const createdAt = new Date(ticketInstance.createdAt);
      const now = new Date();
      const diffMinutes = (now.getTime() - createdAt.getTime()) / 1000 / 60;
      expect(diffMinutes).toBeLessThan(5); // Created within last 5 minutes

      console.log('✓ Ticket instances created successfully with QR code');
      console.log(`  - QR Code: ${ticketInstance.qrCode}`);
      console.log(`  - Status: ${ticketInstance.status}`);
      console.log(`  - Half Price: ${ticketInstance.isHalfPrice}`);
      console.log(`  - Created: ${ticketInstance.createdAt}`);
      console.log(`  - Total tickets for this order: ${ticketInstances.body.data.length}`);
      console.log(`  - Order ID verified: ${ticketInstance.orderItem.orderId}`);
      console.log(`  - Ticket ID verified: ${ticketInstance.orderItem.ticketId}`);

      // STEP 10: Verify order was updated with complete details
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Order status
      expect(['CONFIRMED', 'PROCESSING']).toContain(finalOrder.body.status);
      console.log(`✓ Order status updated to: ${finalOrder.body.status}`);

      // Order pricing breakdown
      expect(Number(finalOrder.body.subtotal)).toBe(100.00);
      expect(Number(finalOrder.body.total)).toBe(100.00);
      expect(Number(finalOrder.body.discount)).toBe(0);
      expect(finalOrder.body.promoCodeId).toBeNull();
      expect(finalOrder.body.orderNumber).toBeTruthy();
      console.log(`✓ Order pricing verified - Subtotal: R$ ${finalOrder.body.subtotal}, Total: R$ ${finalOrder.body.total}, Discount: R$ ${finalOrder.body.discount}`);

      // Buyer snapshot fields
      expect(finalOrder.body.buyerName).toBe('Test Attendee');
      expect(finalOrder.body.buyerEmail).toBe(attendee.user.email);
      expect(finalOrder.body.buyerCpf).toBeTruthy(); // CPF should exist (may differ if reusing existing user)
      console.log(`✓ Buyer snapshot verified - ${finalOrder.body.buyerName} (${finalOrder.body.buyerEmail}), CPF: ${finalOrder.body.buyerCpf}`);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let emailSent = false;
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          emailSent = true;
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      // Email tracking verification
      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}, Sent at: ${orderWithEmail.body.ticketEmailSentAt}`);

      // Verify email was sent within the last 5 minutes
      if (orderWithEmail.body.ticketEmailSentAt) {
        const emailSentAt = new Date(orderWithEmail.body.ticketEmailSentAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - emailSentAt.getTime()) / 1000 / 60;
        expect(diffMinutes).toBeLessThan(5); // Email sent within last 5 minutes
        console.log(`✓ Email timestamp verified - Sent ${Math.round(diffMinutes * 60)} seconds ago`);
      }

      // Payment timestamp
      if (finalOrder.body.paidAt) {
        const paidAt = new Date(finalOrder.body.paidAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - paidAt.getTime()) / 1000 / 60;
        expect(diffMinutes).toBeLessThan(5); // Payment processed within last 5 minutes
        console.log(`✓ Payment timestamp verified - Paid at: ${finalOrder.body.paidAt}`);
      }

      // Order items verification
      expect(finalOrder.body.items).toBeTruthy();
      expect(finalOrder.body.items.length).toBe(1);
      const orderItem = finalOrder.body.items[0];
      expect(orderItem.quantity).toBe(1);
      expect(Number(orderItem.unitPrice)).toBe(100.00);
      expect(Number(orderItem.totalPrice)).toBe(100.00);
      expect(orderItem.isHalfPrice).toBe(false);
      expect(orderItem.ticketId).toBe(ticket.body.id);
      console.log(`✓ Order item verified - ${orderItem.quantity}x at R$ ${orderItem.unitPrice} = R$ ${orderItem.totalPrice}`);

      // STEP 11: Verify payment details
      const retrievedPayment = await request(baseURL)
        .get(`/payments/${paymentResponse.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      expect(retrievedPayment.body.id).toBe(paymentResponse.body.id);
      expect(retrievedPayment.body.status).toBe('COMPLETED');
      expect(Number(retrievedPayment.body.amount)).toBe(100.00);
      expect(retrievedPayment.body.method).toBe('CREDIT_CARD');
      expect(retrievedPayment.body.orderId).toBe(order.body.id);
      expect(retrievedPayment.body.providerName).toBe('ASAAS');
      expect(retrievedPayment.body.description).toBeTruthy();

      // PIX and Boleto fields should be null for credit card
      expect(retrievedPayment.body.pixCode).toBeNull();
      expect(retrievedPayment.body.pixQrCode).toBeNull();
      expect(retrievedPayment.body.boletoCode).toBeNull();
      expect(retrievedPayment.body.boletoUrl).toBeNull();

      // Payment processed timestamp (if set)
      if (retrievedPayment.body.processedAt) {
        expect(retrievedPayment.body.processedAt).toBeTruthy();
        console.log(`✓ Payment processedAt field set: ${retrievedPayment.body.processedAt}`);
      }

      // Provider response should contain split information
      if (retrievedPayment.body.providerResponse?.split) {
        const split = retrievedPayment.body.providerResponse.split[0];
        expect(split.walletId).toBe(organizerWalletId);
        expect(split.percentualValue).toBe(97); // 97% to organizer
        expect(split.status).toBeTruthy();
        console.log(`✓ Payment split verified - ${split.percentualValue}% to organizer (${split.walletId})`);
        console.log(`  - Split status: ${split.status}`);
        console.log(`  - Split value: R$ ${split.totalValue}`);
      }

      console.log('✓ Payment details verified successfully');

      // STEP 12: Verify ASAAS response contains expected fields
      expect(paymentResponse.body.providerResponse).toBeTruthy();
      const asaasResponse = paymentResponse.body.providerResponse;
      expect(asaasResponse.id).toBeTruthy();
      expect(asaasResponse.customer).toBeTruthy();
      expect(asaasResponse.billingType).toBe('CREDIT_CARD');
      expect(asaasResponse.value).toBe(100);

      console.log('✓ ASAAS response is valid');
      console.log('  - Customer ID:', asaasResponse.customer);
      console.log('  - Billing Type:', asaasResponse.billingType);

      // STEP 12.1: Verify ASAAS customer data
      expect(asaasResponse.customer).toBeTruthy();
      expect(asaasResponse.creditCard.creditCardNumber).toBe('4444'); // Last 4 digits
      expect(asaasResponse.creditCard.creditCardBrand).toBe('VISA');
      expect(asaasResponse.creditCard.creditCardToken).toBeTruthy();
      console.log(`✓ Credit card verified - Brand: ${asaasResponse.creditCard.creditCardBrand}, Last 4: ${asaasResponse.creditCard.creditCardNumber}`);
      

      // STEP 13: Verify ticket stock was updated (organizer view)
      const updatedTicket = await request(baseURL)
        .get(`/tickets/${ticket.body.id}`)
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(updatedTicket.body.quantitySold).toBeGreaterThanOrEqual(1);
      expect(updatedTicket.body.quantity).toBe(50); // Original quantity unchanged
      expect(updatedTicket.body.absorbServiceFee).toBe(true);
      expect(Number(updatedTicket.body.serviceFeePercentage)).toBe(3.0);
      expect(updatedTicket.body.type).toBe('PAID');
      expect(Number(updatedTicket.body.price)).toBe(100.00);
      expect(updatedTicket.body.hasHalfPrice).toBe(false);
      console.log(`✓ Ticket stock updated - Sold: ${updatedTicket.body.quantitySold}/${updatedTicket.body.quantity}`);
      console.log(`✓ Ticket config verified - Service fee: ${updatedTicket.body.serviceFeePercentage}% (absorbed: ${updatedTicket.body.absorbServiceFee})`);

      // STEP 14: Verify event details
      const updatedEvent = await request(baseURL)
        .get(`/events/${event.body.id}`)
        .expect(200);

      expect(updatedEvent.body.id).toBe(event.body.id);
      expect(updatedEvent.body.status).toBe('ACTIVE');
      expect(updatedEvent.body.visibility).toBe('PUBLIC');
      expect(updatedEvent.body.ticketType).toBe('PAID');
      expect(updatedEvent.body.totalCapacity).toBe(100);
      expect(updatedEvent.body.organizerId).toBe(organizerId);
      console.log(`✓ Event verified - ${updatedEvent.body.title}`);
      console.log(`✓ Event config - Status: ${updatedEvent.body.status}, Visibility: ${updatedEvent.body.visibility}, Capacity: ${updatedEvent.body.totalCapacity}`);

      console.log('\n✅ Credit card payment flow completed successfully!');
      console.log('📊 Summary:');
      console.log('  - Event:', event.body.title);
      console.log('  - Ticket:', ticket.body.title, '- R$', ticket.body.price);
      console.log('  - Order ID:', order.body.id);
      console.log('  - Order Number:', finalOrder.body.orderNumber);
      console.log('  - Payment ID:', paymentResponse.body.id);
      console.log('  - ASAAS Transaction:', paymentResponse.body.providerTransactionId);
      console.log('  - Payment Status:', retrievedPayment.body.status);
      console.log('  - Order Status:', finalOrder.body.status);
      console.log('  - Tickets Issued:', ticketInstances.body.data.length);
      console.log('  - QR Code:', ticketInstance.qrCode);
      console.log('  - Ticket Stock:', `${updatedTicket.body.quantitySold}/${updatedTicket.body.quantity} sold`);
    }, 60000); // 60 second timeout for ASAAS API calls
  });

  describe('Payment: Credit Card - 2x Installments', () => {
    it('should complete credit card payment with 2 installments', async () => {
      // STEP 1: Get or create test organizer
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;

      console.log('✓ Organizer ready:', organizer.user.email);

      // STEP 2: Create event
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Music Festival 2024 - Installment Test',
          subject: 'Music',
          description: 'Testing credit card installment payments',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Music Events Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 200,
          address: 'Av. Atlântica, 500',
          city: 'Rio de Janeiro',
          state: 'RJ',
          zipCode: '22010-000',
        })
        .expect(201);

      console.log('✓ Event created:', event.body.title);

      // STEP 3: Create ticket - R$ 100
      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'VIP Pass - Festival',
          description: 'VIP access with installment option',
          type: 'PAID',
          price: 100.00, // R$ 100 (2x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      console.log('✓ Ticket created: R$', ticket.body.price);

      // STEP 4: Get or create attendee with CPF (required for payment)
      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      // STEP 5: Create order
      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(100.00);
      console.log('✓ Order created - Total: R$', order.body.total);

      // STEP 6: Create 2x installment payment
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Music Festival - 2x installments',
          installmentCount: 2,
          installmentValue: 50.00, // 2x R$ 50
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '21987654321',
            mobilePhone: '21987654321',
            postalCode: '22010000',
            address: 'Av. Atlântica',
            addressNumber: '500',
            province: 'Copacabana',
            city: 'Rio de Janeiro',
            state: 'RJ',
          },
        });

      if (paymentResponse.status !== 201) {
        console.error('❌ Installment payment failed!');
        console.error('Error:', JSON.stringify(paymentResponse.body, null, 2));
        throw new Error(`Payment failed: ${JSON.stringify(paymentResponse.body)}`);
      }

      expect(paymentResponse.status).toBe(201);
      expect(Number(paymentResponse.body.amount)).toBe(100.00);
      console.log('✓ Installment payment created - 2x of R$ 50');
      console.log('  - Payment ID:', paymentResponse.body.id);
      console.log('  - Status:', paymentResponse.body.status);

      // STEP 7: Wait for webhook
      console.log('⏳ Waiting for webhook...');

      let ticketInstances: any = null;
      let attempts = 0;

      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);

        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );

        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      expect(finalOrder.body.ticketEmailSent).toBe(true);
      expect(finalOrder.body.ticketEmailSentAt).toBeTruthy();
      expect(finalOrder.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${finalOrder.body.ticketEmailSent}, Sent at: ${finalOrder.body.ticketEmailSentAt}`);

      console.log('\n✅ 2x installment payment completed!');
      console.log('  - Total: R$ 100 (2x R$ 50)');
      console.log('  - Tickets issued:', ticketInstances.body.data.length);
    }, 60000);
  });

  describe('Payment: Credit Card - 3x Installments', () => {
    it('should complete credit card payment with 3 installments', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Tech Conference - 3x',
          subject: 'Technology',
          description: 'Annual technology conference',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Tech Events Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Convention Center',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100',
        })
        .expect(201);

      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Conference Pass',
          description: 'Full access pass',
          type: 'PAID',
          price: 150.00, // R$ 150 (3x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(150.00);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Tech Conference - 3x installments',
          installmentCount: 3,
          installmentValue: 50.00,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '11987654321',
            mobilePhone: '11987654321',
            postalCode: '01310100',
            address: 'Convention Center',
            addressNumber: '100',
            province: 'Centro',
            city: 'São Paulo',
            state: 'SP',
          },
        })
        .expect(201);

      expect(Number(paymentResponse.body.amount)).toBe(150.00);
      console.log('✓ 3x installment payment created');

      let ticketInstances: any = null;
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );
        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ 3x Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}`);

      console.log('✅ 3x installment payment completed!');
    }, 60000);
  });

  describe('Payment: Credit Card - 4x Installments', () => {
    it('should complete credit card payment with 4 installments', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Workshop Series - 4x',
          subject: 'Education',
          description: 'Professional workshop series',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Workshop Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Training Center',
          city: 'Rio de Janeiro',
          state: 'RJ',
          zipCode: '20040-020',
        })
        .expect(201);

      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Workshop Pass',
          description: 'Full workshop access',
          type: 'PAID',
          price: 200.00, // R$ 200 (4x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(200.00);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Workshop - 4x installments',
          installmentCount: 4,
          installmentValue: 50.00,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '21987654321',
            mobilePhone: '21987654321',
            postalCode: '20040020',
            address: 'Training Center',
            addressNumber: '100',
            province: 'Centro',
            city: 'Rio de Janeiro',
            state: 'RJ',
          },
        })
        .expect(201);

      expect(Number(paymentResponse.body.amount)).toBe(200.00);
      console.log('✓ 4x installment payment created');

      let ticketInstances: any = null;
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );
        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ 4x Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}`);

      console.log('✅ 4x installment payment completed!');
    }, 60000);
  });

  describe('Payment: Credit Card - 5x Installments', () => {
    it('should complete credit card payment with 5 installments', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Business Summit - 5x',
          subject: 'Business',
          description: 'Annual business summit',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Business Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Business Center',
          city: 'Brasília',
          state: 'DF',
          zipCode: '70040-020',
        })
        .expect(201);

      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Summit Pass',
          description: 'Full summit access',
          type: 'PAID',
          price: 250.00, // R$ 250 (5x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(250.00);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Summit - 5x installments',
          installmentCount: 5,
          installmentValue: 50.00,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '61987654321',
            mobilePhone: '61987654321',
            postalCode: '70040020',
            address: 'Business Center',
            addressNumber: '100',
            province: 'Centro',
            city: 'Brasília',
            state: 'DF',
          },
        })
        .expect(201);

      expect(Number(paymentResponse.body.amount)).toBe(250.00);
      console.log('✓ 5x installment payment created');

      let ticketInstances: any = null;
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );
        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ 5x Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}`);

      console.log('✅ 5x installment payment completed!');
    }, 60000);
  });

  describe('Payment: Credit Card - 6x Installments', () => {
    it('should complete credit card payment with 6 installments', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Gaming Convention - 6x',
          subject: 'Gaming',
          description: 'Annual gaming convention',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Gaming Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Convention Hall',
          city: 'Curitiba',
          state: 'PR',
          zipCode: '80010-000',
        })
        .expect(201);

      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Gaming Pass',
          description: 'Full convention access',
          type: 'PAID',
          price: 300.00, // R$ 300 (6x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(300.00);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Gaming Convention - 6x installments',
          installmentCount: 6,
          installmentValue: 50.00,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '41987654321',
            mobilePhone: '41987654321',
            postalCode: '80010000',
            address: 'Convention Hall',
            addressNumber: '100',
            province: 'Centro',
            city: 'Curitiba',
            state: 'PR',
          },
        })
        .expect(201);

      expect(Number(paymentResponse.body.amount)).toBe(300.00);
      console.log('✓ 6x installment payment created');

      let ticketInstances: any = null;
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );
        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ 6x Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}`);

      console.log('✅ 6x installment payment completed!');
    }, 60000);
  });

  describe('Payment: Credit Card - 12x Installments', () => {
    it('should complete credit card payment with 12 installments', async () => {
      const organizer = await TestUtils.getOrCreateTestOrganizer();
      const organizerToken = organizer.accessToken;
      const eventStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const eventEndDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const salesEndDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);

      const event = await request(baseURL)
        .post('/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          title: 'Innovation Summit - 12x',
          subject: 'Technology',
          description: 'Annual innovation summit',
          startsAt: eventStartDate.toISOString(),
          endsAt: eventEndDate.toISOString(),
          producerName: 'Innovation Inc',
          ticketType: 'PAID',
          status: 'ACTIVE',
          visibility: 'PUBLIC',
          isOnline: false,
          totalCapacity: 100,
          address: 'Innovation Center',
          city: 'Manaus',
          state: 'AM',
          zipCode: '69010-000',
        })
        .expect(201);

      const ticket = await request(baseURL)
        .post('/tickets')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          eventId: event.body.id,
          title: 'Innovation Pass',
          description: 'Full summit access',
          type: 'PAID',
          price: 600.00, // R$ 600 (12x R$ 50)
          quantity: 50,
          minQuantity: 1,
          maxQuantity: 5,
          salesStartsAt: new Date().toISOString(),
          salesEndsAt: salesEndDate.toISOString(),
          isVisible: true,
          hasHalfPrice: false,
        })
        .expect(201);

      const attendee = await TestUtils.getOrCreateTestAttendee();
      const attendeeToken = attendee.accessToken;
      const attendeeCPF = attendee.user.cpf;

      expect(attendeeToken).toBeTruthy();
      expect(attendeeCPF).toBeTruthy();

      const order = await request(baseURL)
        .post('/orders')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          eventId: event.body.id,
          items: [{
            ticketId: ticket.body.id,
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

      expect(Number(order.body.total)).toBe(600.00);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const paymentResponse = await request(baseURL)
        .post('/payments')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          orderId: order.body.id,
          amount: Number(order.body.total),
          method: 'CREDIT_CARD',
          description: 'Payment for Innovation Summit - 12x installments',
          installmentCount: 12,
          installmentValue: 50.00,
          creditCardData: {
            holderName: 'TEST ATTENDEE',
            number: '4444444444444448',
            expiryMonth: String(nextMonth.getMonth() + 1).padStart(2, '0'),
            expiryYear: String(nextMonth.getFullYear()),
            ccv: '123',
          },
          customerData: {
            name: 'Test Attendee',
            email: attendee.user.email,
            cpfCnpj: attendeeCPF,
            phone: '92987654321',
            mobilePhone: '92987654321',
            postalCode: '69010000',
            address: 'Innovation Center',
            addressNumber: '100',
            province: 'Centro',
            city: 'Manaus',
            state: 'AM',
          },
        })
        .expect(201);

      expect(Number(paymentResponse.body.amount)).toBe(600.00);
      console.log('✓ 12x installment payment created');

      let ticketInstances: any = null;
      let attempts = 0;
      while (attempts < 10) {
        attempts++;
        await TestUtils.wait(2000);
        const ticketCheck = await request(baseURL)
          .get('/ticket-instances/my-tickets')
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);
        const currentOrderTickets = ticketCheck.body.data.filter((instance: any) =>
          instance.orderItem?.orderId === order.body.id
        );
        if (currentOrderTickets.length > 0) {
          ticketInstances = { body: { data: currentOrderTickets } };
          console.log(`✓ 12x Tickets found after ${attempts * 2} seconds`);
          break;
        }
      }

      expect(ticketInstances).toBeTruthy();
      expect(ticketInstances.body.data.length).toBeGreaterThan(0);

      // Verify email tracking
      const finalOrder = await request(baseURL)
        .get(`/orders/${order.body.id}`)
        .set('Authorization', `Bearer ${attendeeToken}`)
        .expect(200);

      // Wait for email to be sent (asynchronous process)
      console.log('Waiting for ticket confirmation email to be sent...');
      let orderWithEmail = finalOrder;
      for (let i = 0; i < 10; i++) {
        await TestUtils.wait(1000); // Wait 1 second
        orderWithEmail = await request(baseURL)
          .get(`/orders/${order.body.id}`)
          .set('Authorization', `Bearer ${attendeeToken}`)
          .expect(200);

        if (orderWithEmail.body.ticketEmailSent) {
          console.log(`✓ Email sent after ${i + 1} second(s)`);
          break;
        }
      }

      expect(orderWithEmail.body.ticketEmailSent).toBe(true);
      expect(orderWithEmail.body.ticketEmailSentAt).toBeTruthy();
      expect(orderWithEmail.body.ticketEmailError).toBeNull();
      console.log(`✓ Email tracking verified - Email sent: ${orderWithEmail.body.ticketEmailSent}`);

      console.log('✅ 12x installment payment completed!');
    }, 60000);
  });
});
