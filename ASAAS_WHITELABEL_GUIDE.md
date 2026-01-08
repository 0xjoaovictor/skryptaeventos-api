# ASAAS Whitelabel Subaccount Implementation Guide

## 📋 Overview

This guide explains the ASAAS Whitelabel implementation for Skrypta Eventos API. Whitelabel mode allows organizers to operate completely within the Skrypta platform without ever seeing ASAAS branding or accessing ASAAS systems directly.

---

## 🎯 What is ASAAS Whitelabel?

**Whitelabel Benefits:**
- ✅ Organizers never leave your platform
- ✅ No ASAAS branding visible to organizers
- ✅ No welcome emails or dashboard access from ASAAS
- ✅ Complete control over organizer experience
- ✅ Automatic payment splits to organizer wallets

**How It Differs from Regular Subaccounts:**
| Feature | Regular Subaccount | Whitelabel Subaccount |
|---------|-------------------|----------------------|
| Welcome Email | ✅ Sent by ASAAS | ❌ Not sent |
| Dashboard Access | ✅ Organizer can login | ❌ No access |
| Branding | ASAAS visible | Your brand only |
| API Control | Shared | Full parent control |

---

## ⚠️ Critical Prerequisites

### 1. ASAAS Account Manager Approval

**REQUIRED:** You **must** contact your ASAAS account manager to enable whitelabel functionality.

Without prior approval:
- Subaccounts will be created as **regular** subaccounts
- Organizers will receive welcome emails
- Organizers will have ASAAS dashboard access
- Whitelabel benefits won't apply

**How to get approval:**
1. Contact: Your assigned ASAAS account manager
2. Request: Whitelabel functionality activation
3. Environment: Request sandbox configuration first for testing
4. Production: Request production activation after testing

### 2. Environment Variables

Add these to your `.env` file:

```bash
# ASAAS Configuration
ASAAS_API_URL="https://sandbox.asaas.com/v3"
ASAAS_API_KEY="$aact_hmlg_..." # Your root account API key
ASAAS_WALLET_ID="your-platform-wallet-id" # Must be different from root

# Webhook Configuration (Required for Whitelabel)
ASAAS_WEBHOOK_URL="https://your-domain.com/api/webhooks/asaas"
ASAAS_WEBHOOK_TOKEN="your-secure-webhook-token"
API_URL="https://your-domain.com" # Used as fallback for webhook URL
```

---

## 📝 Required Fields for Whitelabel Subaccounts

When an organizer registers, these fields are **REQUIRED** by ASAAS whitelabel:

### Basic Information
- ✅ `name` - Full name or company name
- ✅ `email` - Valid email address
- ✅ `cpfCnpj` - CPF (11 digits) or CNPJ (14 digits)
- ✅ `birthDate` - Format: `YYYY-MM-DD`
- ✅ `companyType` - Examples: `"MEI"`, `"LTDA"`, `"EIRELI"`, `"SA"`

### Contact Information
- ✅ `phone` - Brazilian phone number
- ✅ `mobilePhone` - Mobile phone number

### Address Information
- ✅ `address` - Street name
- ✅ `addressNumber` - Street number
- ✅ `complement` - Apartment, suite, etc (optional but recommended)
- ✅ `province` - Neighborhood/District
- ✅ `postalCode` - CEP (ZIP code)
- ✅ `city` - City name (optional but recommended)
- ✅ `state` - State abbreviation (UF) - e.g., `"SP"`, `"RJ"`, `"SC"`

### Webhook Configuration
- ✅ `webhooks` - Array of webhook configurations (configured automatically by API)

---

## 🔧 Implementation Details

### 1. Registration DTO

File: `src/auth/dto/register.dto.ts`

All whitelabel fields are now part of the `RegisterDto`:

```typescript
export class RegisterDto {
  // Basic fields
  email: string;
  name: string;
  password: string;
  role?: UserRole;
  phone?: string;
  cpf?: string;

  // ASAAS Whitelabel Required Fields (for ORGANIZER role)
  birthDate?: string; // Format: YYYY-MM-DD
  companyType?: string; // e.g., "MEI", "LTDA", "EIRELI"
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string; // Neighborhood/District
  postalCode?: string; // CEP
  city?: string;
  state?: string; // UF (e.g., "SP", "RJ")
}
```

### 2. Subaccount Creation

File: `src/auth/auth.service.ts`

When an organizer registers with role `ORGANIZER` and provides a CPF:

```typescript
if (role === 'ORGANIZER' && cpf) {
  const subaccount = await this.asaasService.createSubaccount({
    name,
    email,
    cpfCnpj: cpf,
    birthDate,
    companyType,
    phone,
    mobilePhone: phone,
    address,
    addressNumber,
    complement,
    province,
    postalCode,
    webhooks: [{
      name: 'Skrypta Payment Events',
      url: webhookUrl,
      email,
      sendType: 'SEQUENTIALLY',
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: webhookToken,
      events: [
        'PAYMENT_CREATED',
        'PAYMENT_UPDATED',
        'PAYMENT_CONFIRMED',
        'PAYMENT_RECEIVED',
        'PAYMENT_OVERDUE',
        'PAYMENT_REFUNDED',
        'PAYMENT_AWAITING_RISK_ANALYSIS',
        'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
        'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
      ],
    }],
  });
}
```

### 3. Webhook Configuration

**Why Webhooks are Critical:**

According to ASAAS documentation:
> "Webhooks must be configured during initial subaccount creation to prevent event loss"

Without webhooks configured at creation time:
- ❌ Payment events will be lost
- ❌ No way to track payment status changes
- ❌ Organizer subaccount won't receive notifications

**Configured Events:**
- `PAYMENT_CREATED` - Payment charge created
- `PAYMENT_UPDATED` - Payment details updated
- `PAYMENT_CONFIRMED` - Payment confirmed by bank
- `PAYMENT_RECEIVED` - Payment received successfully
- `PAYMENT_OVERDUE` - Payment is overdue
- `PAYMENT_REFUNDED` - Payment was refunded
- `PAYMENT_AWAITING_RISK_ANALYSIS` - Under risk analysis
- `PAYMENT_APPROVED_BY_RISK_ANALYSIS` - Approved by risk
- `PAYMENT_REPROVED_BY_RISK_ANALYSIS` - Rejected by risk

---

## 💰 Payment Flow with Whitelabel Subaccounts

### Complete Payment Flow:

```
1. Customer purchases ticket → Creates order
         ↓
2. Payment processed via ASAAS → Credit card/PIX/Boleto
         ↓
3. ASAAS Automatic Split:
   - 3% → Skrypta Platform Wallet (ASAAS_WALLET_ID)
   - 97% → Event Organizer Wallet (asaasWalletId from database)
         ↓
4. Webhook sends event to API → Updates payment status
         ↓
5. Order confirmed → Ticket instances generated
         ↓
6. Customer receives QR code → Can attend event
```

### Payment Split Details:

File: `src/payments/asaas.service.ts`

```typescript
const splits = [];

// 3% platform fee
if (platformWalletId) {
  splits.push({
    walletId: platformWalletId,
    percentualValue: 3.00,
  });
}

// 97% to organizer
if (organizerWalletId) {
  splits.push({
    walletId: organizerWalletId,
    percentualValue: 97.00,
  });
}
```

---

## 🧪 Testing Whitelabel Subaccounts

### E2E Test Configuration

File: `test/test-utils.ts`

The test utility automatically includes all required whitelabel fields:

```typescript
const response = await request(this.baseURL)
  .post('/auth/register')
  .send({
    email: 'test-organizer@skryptaeventos.com',
    name: 'Test Event Organizer',
    password: 'TestOrganizer123!',
    role: 'ORGANIZER',
    cpf: '12345678901',
    phone: '4738010919',
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
  });
```

### Running Tests

```bash
# Make sure API is running
yarn start:dev

# In another terminal, run E2E tests
yarn test:e2e payments.e2e-spec.ts
```

### Expected Test Output:

```
🚀 Running Payments E2E tests against http://localhost:3000/api
✓ Using existing test organizer with ASAAS whitelabel subaccount
  - Email: test-organizer@skryptaeventos.com
  - Wallet ID: abc-123-def-456
✓ Organizer ready
✓ Event created successfully
✓ Ticket created successfully
✓ Order created successfully
✓ Payment created successfully with dual splits
✅ Credit card payment flow completed successfully!
```

---

## 🚨 Important Limitations

### ASAAS Sandbox Limitations:

1. **Subaccount Creation Limit:** 20 subaccounts per day
   - Cannot be deleted once created
   - Use test utility to reuse existing test organizer

2. **Email Notifications:** All emails go to root account
   - Even with whitelabel enabled in sandbox

3. **Wallet Restrictions:**
   - Cannot split to your own wallet
   - Platform wallet must be different from root account
   - Both wallets must exist in ASAAS

### Production Considerations:

1. **Whitelabel Activation Required:**
   - Contact account manager for production activation
   - Test thoroughly in sandbox first

2. **Webhook Security:**
   - Use HTTPS for webhook URL
   - Implement webhook token validation
   - Verify webhook signature

3. **Data Validation:**
   - All required fields must be collected during registration
   - Validate CPF format
   - Validate CEP (postal code) format
   - Validate Brazilian phone number format

---

## 📊 Verification Checklist

Before going to production, verify:

- [ ] ASAAS account manager approved whitelabel for production
- [ ] All environment variables configured correctly
- [ ] Webhook endpoint is accessible via HTTPS
- [ ] Webhook token validation implemented
- [ ] Registration form collects all required whitelabel fields
- [ ] CPF validation working correctly
- [ ] Address fields properly validated
- [ ] Platform wallet ID is different from root account
- [ ] Payment splits working correctly (3% + 97%)
- [ ] E2E tests passing with whitelabel subaccount creation
- [ ] Organizers don't receive ASAAS emails
- [ ] Organizers can't access ASAAS dashboard

---

## 🔄 Migration Guide

### For Existing Organizers (Pre-Whitelabel)

Organizers created before whitelabel implementation won't have:
- Complete address information
- Birth date
- Company type
- Webhook configuration

**Option 1: Prompt for Additional Info**
```typescript
// Check if organizer needs whitelabel data
const needsWhitelabelData = !user.birthDate || !user.address;

if (needsWhitelabelData && user.role === 'ORGANIZER') {
  // Show form to collect missing fields
  // Update ASAAS subaccount via API
}
```

**Option 2: Collect During First Event Creation**
- Prompt for missing information when organizer creates first event
- Update ASAAS subaccount with complete data

---

## 📞 Support and Troubleshooting

### Common Issues:

**Issue:** "Subaccount created but organizer received welcome email"
**Solution:** Whitelabel not enabled on your ASAAS account. Contact account manager.

**Issue:** "Subaccount creation fails with validation error"
**Solution:** Check all required fields are provided and properly formatted.

**Issue:** "Webhook events not being received"
**Solution:** Verify webhook URL is accessible, HTTPS enabled, and token configured.

**Issue:** "Payment split fails"
**Solution:** Ensure platform wallet ID is different from root account wallet.

### Getting Help:

1. **ASAAS Documentation:** https://docs.asaas.com
2. **Account Manager:** Contact for whitelabel activation
3. **Technical Support:** support@asaas.com
4. **Skrypta API Issues:** Check application logs and Prisma Studio

---

## 📚 Related Documentation

- [ASAAS Subaccount Implementation](./ASAAS_SUBACCOUNT_IMPLEMENTATION.md)
- [E2E Test Guide](./E2E_TEST_GUIDE.md)
- [ASAAS Official Whitelabel Docs](https://docs.asaas.com/docs/cria%C3%A7%C3%A3o-de-subcontas-whitelabel)
- [ASAAS Whitelabel Overview](https://docs.asaas.com/docs/sobre-white-label)

---

**Last Updated:** 2025-01-17
**Status:** ✅ Whitelabel Implementation Complete
**Next Step:** Contact ASAAS account manager for production whitelabel activation
