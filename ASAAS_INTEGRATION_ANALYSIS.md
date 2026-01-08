# ASAAS Integration Analysis & Required Changes

## Executive Summary

After analyzing the ASAAS documentation and your current implementation, I've identified several critical issues that need to be addressed for proper integration with ASAAS sandbox/production.

---

## 🔴 CRITICAL ISSUES

### 1. **MISSING: Payment Split Implementation (3% Platform Fee)**

**Current State**: ❌ Not implemented
**Required**: ✅ All payments must include 3% split to platform wallet

**Documentation**: According to ASAAS docs, splits must be configured in the payment creation request.

**Required Implementation**:
```typescript
// In asaas.service.ts - createPayment method
const paymentData: CreateAsaasPaymentDto = {
  customer: customerId,
  billingType,
  value: amount,
  dueDate: this.formatDate(dueDate),
  description,
  externalReference,
  split: [
    {
      walletId: this.configService.get<string>('ASAAS_WALLET_ID'), // Platform wallet
      percentualValue: 3.00 // 3% platform fee
    }
  ]
};
```

**Location**: `src/payments/asaas.service.ts:132-139`

---

### 2. **WRONG: API Endpoint URL**

**Current**: `https://api-sandbox.asaas.com` (missing `/v3`)
**Correct**: `https://sandbox.asaas.com/api/v3` OR `https://api.asaas.com/v3`

**Location**: `.env:34` and `src/payments/asaas.service.ts:54`

**Fix Required**:
```bash
# .env
ASAAS_API_URL="https://sandbox.asaas.com/api/v3"  # For sandbox
# OR
ASAAS_API_URL="https://api.asaas.com/v3"  # For production
```

---

### 3. **INCOMPLETE: PIX QR Code Expiration**

**Current Issue**: PIX QR code expiration is set based on ASAAS response but not validated
**ASAAS Behavior**:
- With PIX key: Expires 12 months after due date
- Without PIX key: Expires at 23:59 same day (will be discontinued)

**Current Code** (`payments.service.ts:139`):
```typescript
paymentData.pixExpiresAt = new Date(pixQrCode.expirationDate);
```

**Recommendation**: Add warning/validation about PIX key registration status

---

### 4. **INCOMPLETE: Webhook Event Handling**

**Current State**: Only handles basic payment status updates
**ASAAS Events Not Handled**:
- `PAYMENT_AUTHORIZED`
- `PAYMENT_ANTICIPATED`
- `PAYMENT_AWAITING_RISK_ANALYSIS`
- `PAYMENT_APPROVED_BY_RISK_ANALYSIS`
- `PAYMENT_CHARGEBACK_REQUESTED`
- `PAYMENT_CHARGEBACK_DISPUTE`
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`
- `PAYMENT_DUNNING_REQUESTED`

**Location**: `src/payments/payments.service.ts:290-356`

---

### 5. **MISSING: Credit Card Tokenization**

**Current State**: ❌ Not implemented
**ASAAS Feature**: Returns `creditCardToken` after first transaction for reuse

**Benefit**: Customers can save cards for future purchases (better UX)

**Required**: Add token storage in database and reuse logic

---

### 6. **INCOMPLETE: Credit Card Remote IP Requirement**

**Current Code**: Missing `remoteIp` field for credit card payments
**ASAAS Requirement**: "Remote IP" is required for fraud prevention

**Location**: `src/payments/asaas.service.ts:142-145`

**Fix Required**:
```typescript
if (method === PaymentMethod.CREDIT_CARD && creditCardData) {
  paymentData.creditCard = creditCardData.creditCard;
  paymentData.creditCardHolderInfo = creditCardData.creditCardHolderInfo;
  paymentData.remoteIp = creditCardData.remoteIp; // ADD THIS
}
```

---

## ⚠️ MEDIUM PRIORITY ISSUES

### 7. **IMPROVEMENT: Boleto Due Date Logic**

**Current**: Fixed +3 days for boleto (`payments.service.ts:89-92`)
**Better Practice**: Configurable due date or business logic based on event date

---

### 8. **MISSING: Installment Payments Support**

**ASAAS Support**: Up to 21 installments (Visa/Mastercard)
**Current State**: Not implemented

**Required Fields** (from ASAAS docs):
- `installmentCount`
- `installmentValue`
- Split configuration for each installment

---

### 9. **IMPROVEMENT: Error Handling**

**Current**: Generic error messages
**ASAAS Behavior**: Returns specific error codes and descriptions

**Recommendation**: Parse ASAAS error responses more granularly for better UX

---

## ✅ CORRECTLY IMPLEMENTED

1. ✅ **Customer Creation**: Properly checks for existing customers before creating
2. ✅ **Customer Search**: Uses CPF/CNPJ to find existing customers
3. ✅ **Payment Method Mapping**: Correct mapping of internal methods to ASAAS billing types
4. ✅ **Payment Status Mapping**: Comprehensive status mapping
5. ✅ **Webhook Signature Validation**: Validates `asaas-access-token` header
6. ✅ **Free Payment Handling**: Correctly bypasses ASAAS for free tickets
7. ✅ **Payment Cancellation**: Properly cancels in both ASAAS and database
8. ✅ **Refund Support**: Implements refund API calls

---

## 📋 REQUIRED CHANGES SUMMARY

### Immediate (Critical for MVP):

1. **Add Payment Split (3% Platform Fee)**
   - Update `CreateAsaasPaymentDto` interface to include `split` field
   - Add split configuration to all payment creations
   - Files: `asaas.service.ts`, DTOs

2. **Fix API URL**
   - Update `.env` with correct sandbox URL
   - Verify `asaas.service.ts` uses env variable correctly

3. **Add Remote IP to Credit Card Payments**
   - Update `CreatePaymentDto` to accept `remoteIp`
   - Pass to ASAAS in credit card payments
   - Update controller to extract IP from request

### Short-term (Within 1-2 sprints):

4. **Expand Webhook Event Handling**
   - Add handlers for risk analysis events
   - Add handlers for chargeback events
   - Add handlers for anticipation events

5. **Implement Credit Card Tokenization**
   - Add `creditCardToken` field to Payment model
   - Store tokens for reuse
   - Add "saved cards" endpoint

### Long-term (Future enhancements):

6. **Add Installment Payments**
   - Support credit card installments
   - Configure split per installment

7. **Improve Error Messages**
   - Parse ASAAS errors
   - Return user-friendly messages

---

## 🧪 TESTING CHECKLIST

### Before Production:

- [ ] Test PIX payment creation and QR code generation
- [ ] Test Boleto payment creation and PDF generation
- [ ] Test Credit Card payment with all required fields
- [ ] Verify 3% split is applied and credited to platform wallet
- [ ] Test webhook for all payment events:
  - [ ] PAYMENT_RECEIVED
  - [ ] PAYMENT_CONFIRMED
  - [ ] PAYMENT_OVERDUE
  - [ ] PAYMENT_REFUNDED
- [ ] Verify webhook signature validation works
- [ ] Test payment cancellation
- [ ] Test refund flow
- [ ] Verify order status updates correctly
- [ ] Verify ticket instances are generated

### Sandbox Testing URLs:

- **API**: https://sandbox.asaas.com/api/v3
- **Dashboard**: https://sandbox.asaas.com
- **Test Cards**: Available in ASAAS sandbox documentation

---

## 📞 ASAAS Configuration Required

### In ASAAS Dashboard:

1. **Webhook Configuration**
   - URL: `https://your-domain.com/api/payments/webhook/asaas`
   - Token: Match `ASAAS_WEBHOOK_TOKEN` in .env
   - Events: Enable all payment events

2. **PIX Key Registration** (Recommended)
   - Register PIX key to avoid same-day QR code expiration
   - Otherwise QR codes expire at 23:59 same day

3. **Wallet ID** (For Split)
   - Verify `ASAAS_WALLET_ID` in .env is correct
   - This is where the 3% platform fee will be sent

---

## 💾 DATABASE CHANGES NEEDED

### Add to Payment Model (if not exists):

```prisma
model Payment {
  // ... existing fields

  // Add these if missing:
  creditCardToken    String?  // For card tokenization
  remoteIp          String?  // Customer IP for fraud prevention
  splitAmount       Decimal? // Amount sent to platform (3%)
  splitWalletId     String?  // Platform wallet ID
  installmentCount  Int?     // Number of installments
  installmentValue  Decimal? // Value per installment
}
```

---

## 🔐 ENVIRONMENT VARIABLES VERIFICATION

Check your `.env` file has:

```bash
# ASAAS Configuration
ASAAS_API_KEY="$aact_hmlg_..." # Your sandbox key ✅
ASAAS_API_URL="https://sandbox.asaas.com/api/v3" # ❌ FIX THIS
ASAAS_WALLET_ID="3ac071ec-c628-49a5-86b5-e04d167b8c33" # ✅
ASAAS_WEBHOOK_TOKEN="skryptaeventos-mvp-teste-1" # ✅
```

---

## 📚 ASAAS Documentation References

- **Charges Guide**: https://docs.asaas.com/docs/guia-de-cobrancas
- **Customer Creation**: https://docs.asaas.com/docs/criando-um-cliente
- **PIX Payments**: https://docs.asaas.com/docs/cobrancas-via-pix
- **Boleto Payments**: https://docs.asaas.com/docs/cobrancas-via-boleto
- **Credit Card**: https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito
- **Payment Splits**: https://docs.asaas.com/docs/split-de-pagamentos
- **Split in Charges**: https://docs.asaas.com/docs/split-em-cobrancas-avulsas
- **Webhook Events**: https://docs.asaas.com/docs/webhook-para-cobrancas

---

## 🎯 NEXT STEPS

1. **Review this analysis** with team
2. **Prioritize changes** (Critical → Medium → Long-term)
3. **Update code** with critical fixes
4. **Test in sandbox** with all payment methods
5. **Configure webhooks** in ASAAS dashboard
6. **Document** split revenue model for stakeholders
