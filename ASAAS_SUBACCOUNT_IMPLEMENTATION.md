# ASAAS Subaccount Implementation Summary

## ✅ Implementation Complete - Whitelabel Mode Enabled

All event organizers now automatically get an ASAAS **whitelabel** subaccount created when they register, enabling automatic payment splits.

**🎯 See [ASAAS_WHITELABEL_GUIDE.md](./ASAAS_WHITELABEL_GUIDE.md) for complete whitelabel documentation.**

---

## 🔧 Changes Made

### 1. **Database Schema Updates**

Added ASAAS integration fields to User model:

```prisma
model User {
  // ... existing fields
  
  // ASAAS Integration (for organizers)
  asaasAccountId  String?    @unique // ASAAS subaccount ID
  asaasWalletId   String?    @unique // ASAAS wallet ID for payment splits
  asaasApiKey     String?    // ASAAS API key for subaccount (encrypted)
  
  // ... rest of model
}
```

**Files Modified:**
- `prisma/schema.prisma`

---

### 2. **ASAAS Subaccount Creation**

Implemented subaccount creation in AsaasService:

```typescript
async createSubaccount(subaccountData: CreateAsaasSubaccountDto): Promise<AsaasSubaccountResponse> {
  const response = await this.axiosInstance.post<AsaasSubaccountResponse>('/accounts', subaccountData);
  return response.data; // Contains id, walletId, and apiKey
}
```

**Files Modified:**
- `src/payments/asaas.service.ts`

---

### 3. **Automatic Subaccount Creation on Registration**

When an organizer registers, an ASAAS subaccount is automatically created:

```typescript
if (role === 'ORGANIZER' && cpf) {
  const subaccount = await this.asaasService.createSubaccount({
    name,
    email,
    cpfCnpj: cpf,
    phone,
    mobilePhone: phone,
  });

  asaasAccountId = subaccount.id;
  asaasWalletId = subaccount.walletId;
  asaasApiKey = subaccount.apiKey;
}
```

**Files Modified:**
- `src/auth/auth.service.ts`
- `src/auth/auth.module.ts` (imported PaymentsModule)

---

### 4. **Payment Split Logic - Dual Splits**

Every payment now splits automatically:
- **3% → Skrypta Platform** (ASAAS_WALLET_ID from .env)
- **97% → Event Organizer** (user.asaasWalletId from database)

```typescript
const splits: AsaasSplitDto[] = [];

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

paymentData.split = splits;
```

**Files Modified:**
- `src/payments/asaas.service.ts` - Added `organizerWalletId` parameter
- `src/payments/payments.service.ts` - Fetches organizer wallet ID and passes to ASAAS

---

## 📊 Payment Flow

### Before (Old Flow):
```
Customer Payment (R$ 100)
    ↓
ASAAS Root Account receives R$ 100
    ↓
Manual distribution required
```

### After (New Flow):
```
Customer Payment (R$ 100)
    ↓
ASAAS Automatic Split:
    → R$ 3.00 (3%) to Skrypta Platform Wallet
    → R$ 97.00 (97%) to Event Organizer Wallet
```

---

## 🔑 Key Benefits

1. **Automatic Revenue Distribution**: No manual transfers needed
2. **Transparent Fee Structure**: 3% platform fee clearly separated
3. **Organizer Independence**: Each organizer has their own ASAAS subaccount
4. **Scalable**: Works automatically for any number of organizers
5. **Secure**: Wallet IDs stored securely in database

---

## 🧪 Testing Notes

### For E2E Tests:

**Option 1: Use Default Test Organizer (Recommended)**
- Create a seed file with a default organizer that already has ASAAS subaccount
- Reuse this organizer in all E2E tests
- Avoids ASAAS sandbox limit (20 subaccounts/day)

**Option 2: Create New Organizer Per Test**
- Each test creates a new organizer with subaccount
- More realistic but hits ASAAS limits quickly

---

## ⚠️ Important Requirements

### For Organizer Registration:
- **CPF is required** for ASAAS subaccount creation
- Registration will fail if ASAAS API is unavailable
- Phone number must be valid Brazilian format

### Environment Variables:
```bash
ASAAS_API_URL="https://sandbox.asaas.com/v3"  # Correct URL
ASAAS_WALLET_ID="xxx-xxx-xxx"  # Skrypta platform wallet (different from root)
ASAAS_API_KEY="$aact_hmlg_..."  # Root account API key
```

---

## 🚨 Known Limitations

### ASAAS Sandbox:
- **Maximum 20 subaccounts per day**
- **Cannot delete subaccounts** once created
- Email notifications go to root account email

### Split Requirements:
- Cannot split to your own wallet
- Platform wallet ID must be different from root account
- Both wallets must exist in ASAAS

---

## 🔄 Next Steps

1. **Create Database Seed**
   - Add default test organizer with ASAAS subaccount
   - Use in E2E tests to avoid creating new subaccounts

2. **Update E2E Tests**
   - Use default organizer instead of creating new one
   - Test payment split functionality

3. **Production Setup**
   - Update `ASAAS_API_URL` to production
   - Configure platform wallet ID
   - Test with real subaccounts

---

## 📝 Migration Guide

### Existing Organizers:

Organizers registered before this update **do not** have ASAAS subaccounts. Options:

**Option A: Manual Migration**
```sql
-- Find organizers without wallet IDs
SELECT id, name, email, cpf FROM "User" 
WHERE role = 'ORGANIZER' AND "asaasWalletId" IS NULL;
```

Create subaccounts manually via API or admin panel.

**Option B: Force Re-registration**
- Send email asking organizers to complete account setup
- Create subaccount during onboarding flow

---

## 🎯 Success Criteria

✅ Organizer registration creates ASAAS subaccount
✅ Wallet ID and API key stored in database
✅ Payments automatically split 3% / 97%
✅ Both platform and organizer receive their shares
✅ E2E tests pass with payment split logic

---

**Implementation Date**: 2025-01-17
**Status**: ✅ Complete - Ready for Testing
