# Payments Module

This module handles payment processing for the SkryptaEventos API using ASAAS payment gateway integration.

## Features

- Multiple payment methods support (PIX, Boleto, Credit Card, Debit Card)
- ASAAS payment gateway integration
- Webhook handling for real-time payment status updates
- Automatic order confirmation and ticket generation
- Payment status synchronization
- Free ticket handling

## Files Structure

```
src/payments/
├── dto/
│   ├── create-payment.dto.ts      # DTO for creating payments
│   └── asaas-webhook.dto.ts       # DTOs for ASAAS webhook events
├── asaas.service.ts               # ASAAS API integration service
├── payments.service.ts            # Main payment business logic
├── payments.controller.ts         # REST API endpoints
└── payments.module.ts             # NestJS module configuration
```

## Environment Variables

Add these variables to your `.env` file:

```env
# ASAAS Payment Gateway
ASAAS_API_KEY=your_asaas_api_key_here
ASAAS_API_URL=https://sandbox.asaas.com/api/v3  # Use production URL in production
```

## API Endpoints

### Create Payment
```http
POST /payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "order_id_here",
  "amount": 100.00,
  "method": "PIX",
  "description": "Event ticket purchase",
  "customerData": {
    "name": "John Doe",
    "email": "john@example.com",
    "cpfCnpj": "12345678900",
    "phone": "11999999999"
  }
}
```

### Get Payment by ID
```http
GET /payments/:id
Authorization: Bearer <token>
```

### Get Payment by Order ID
```http
GET /payments/order/:orderId
Authorization: Bearer <token>
```

### Cancel Payment
```http
DELETE /payments/:id
Authorization: Bearer <token>
```

### Sync Payment Status
```http
PATCH /payments/:id/sync
Authorization: Bearer <token>
```

### ASAAS Webhook (Public)
```http
POST /payments/webhook/asaas
Content-Type: application/json

{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "id": "pay_123456",
    "status": "RECEIVED",
    ...
  }
}
```

## Payment Methods

- `CREDIT_CARD` - Credit card payment
- `DEBIT_CARD` - Debit card payment
- `PIX` - Brazilian instant payment
- `BOLETO` - Brazilian bank slip
- `BANK_TRANSFER` - Bank transfer
- `FREE` - Free tickets (no payment required)

## Payment Flow

1. **Create Payment**: Client calls POST /payments with order details
2. **ASAAS Processing**: Payment is created in ASAAS gateway
3. **Payment Data**: For PIX/Boleto, QR code/URL is returned
4. **Webhook**: ASAAS sends webhook notifications on status changes
5. **Order Confirmation**: When payment is confirmed, order status updates to CONFIRMED
6. **Ticket Generation**: Ticket instances are generated automatically

## ASAAS Integration

The module integrates with ASAAS payment gateway providing:

- Customer creation/retrieval
- Payment creation for different methods
- PIX QR Code generation
- Boleto PDF generation
- Payment status tracking
- Refund processing
- Webhook event handling

## Webhook Events

The webhook handler processes these ASAAS events:

- `PAYMENT_CREATED` - Payment created
- `PAYMENT_CONFIRMED` - Payment confirmed
- `PAYMENT_RECEIVED` - Payment received
- `PAYMENT_OVERDUE` - Payment overdue
- `PAYMENT_REFUNDED` - Payment refunded
- And more...

## Security Notes

1. **Webhook Endpoint**: The webhook endpoint (/payments/webhook/asaas) is public
2. **Production**: Implement webhook signature validation or IP whitelisting
3. **API Key**: Never expose ASAAS_API_KEY in client-side code
4. **SSL**: Always use HTTPS in production

## Error Handling

The module includes comprehensive error handling:

- Input validation using class-validator
- ASAAS API error mapping
- Database transaction rollback on failures
- Detailed logging for debugging
- User-friendly error messages

## Testing

### Using ASAAS Sandbox

1. Get sandbox API key from ASAAS dashboard
2. Use sandbox URL: `https://sandbox.asaas.com/api/v3`
3. Test with sandbox credit cards and PIX codes

### Webhook Testing

Use ngrok or similar tools to expose your local server:

```bash
ngrok http 3000
```

Configure the ngrok URL in ASAAS dashboard webhook settings.

## Related Models

- `Payment` - Main payment record
- `Order` - Associated order
- `TicketInstance` - Generated tickets after payment confirmation

## Usage Example

```typescript
// In your service
import { PaymentsService } from './payments/payments.service';

// Create payment
const payment = await paymentsService.createPayment({
  orderId: 'order_123',
  amount: 150.00,
  method: PaymentMethod.PIX,
  customerData: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    cpfCnpj: '12345678900',
  },
});

// For PIX payments, payment object contains:
// - pixCode: Copy-paste code
// - pixQrCode: Base64 encoded QR code image
// - pixExpiresAt: Expiration date

// For Boleto payments:
// - boletoUrl: PDF download URL
// - boletoCode: Barcode
// - boletoExpiresAt: Due date
```

## Support

For ASAAS API documentation, visit: https://docs.asaas.com/
