# E2E Payment Test Guide

## Overview

The payment E2E test now uses a **reusable test organizer** with an ASAAS **whitelabel** subaccount to avoid hitting the ASAAS sandbox limit (20 subaccounts/day).

**🎯 See [ASAAS_WHITELABEL_GUIDE.md](./ASAAS_WHITELABEL_GUIDE.md) for complete whitelabel documentation.**

---

## How It Works

### First Run:
```
1. Test calls TestUtils.getOrCreateTestOrganizer()
2. No organizer found in database
3. Creates new organizer via /auth/register
4. ASAAS subaccount created automatically
5. Organizer saved with walletId in database
6. Test proceeds with this organizer
```

### Subsequent Runs:
```
1. Test calls TestUtils.getOrCreateTestOrganizer()
2. Finds existing organizer in database
3. Logs in with stored credentials
4. Returns existing organizer
5. Test proceeds (NO new ASAAS subaccount created!)
```

---

## Default Test Organizer

**Email:** `test-organizer@skryptaeventos.com`
**Password:** `TestOrganizer123!`
**CPF:** `12345678901`
**Phone:** `4738010919`

This organizer is reused across all E2E tests that need payment functionality.

---

## Running the Test

```bash
# Make sure API is running
yarn start:dev

# In another terminal, run the test
yarn test:e2e payments.e2e-spec.ts
```

---

## What the Test Does

1. ✅ Gets/creates test organizer with ASAAS subaccount
2. ✅ Creates event for this organizer
3. ✅ Creates paid ticket (R$ 100)
4. ✅ Creates attendee with CPF
5. ✅ Creates order (R$ 100 - service fee absorbed)
6. ✅ Processes credit card payment via ASAAS
7. ✅ Verifies payment splits:
   - 3% → Skrypta platform wallet
   - 97% → Organizer wallet
8. ✅ Verifies payment status and order update
9. ✅ Checks ticket instance generation (if payment approved)

---

## Expected Output

### First Run (Creating Organizer):
```
🚀 Running Payments E2E tests against http://localhost:3000/api
⚠️  No test organizer found, creating new one with ASAAS subaccount...
   This will use 1 of your 20 daily ASAAS sandbox subaccount quota
✓ Test organizer created successfully
  - Email: test-organizer@skryptaeventos.com
  - Wallet ID: abc-123-def-456
✓ Organizer ready: test-organizer@skryptaeventos.com
✓ Event created successfully: Tech Conference 2024 - Payment Test
✓ Ticket created successfully: VIP Pass - R$ 100
✓ Attendee created successfully with CPF: 12345678901
✓ Order created successfully - Total: R$ 100
✓ Payment created successfully
  - Payment ID: pay_xxx
  - ASAAS Transaction ID: pay_xxx
  - Status: PENDING (or COMPLETED)
  - Amount: R$ 100
✓ Payment approved immediately by ASAAS
✓ Ticket instances created with QR code
✅ Credit card payment flow completed successfully!
```

### Subsequent Runs (Reusing Organizer):
```
🚀 Running Payments E2E tests against http://localhost:3000/api
✓ Using existing test organizer with ASAAS subaccount
  - Email: test-organizer@skryptaeventos.com
  - Wallet ID: abc-123-def-456
✓ Organizer ready: test-organizer@skryptaeventos.com
... rest of test ...
```

---

## Benefits

1. **Saves ASAAS Quota**: Only uses 1 subaccount instead of 1 per test run
2. **Faster Tests**: Skips ASAAS API call if organizer exists
3. **More Reliable**: Less dependent on external API availability
4. **Easy to Reset**: Just delete the organizer from DB to start fresh

---

## Troubleshooting

### Problem: Test fails with "Login failed, recreating organizer"
**Solution:** The password might have changed. The util will automatically delete and recreate the organizer.

### Problem: Test fails with "ASAAS quota exceeded"
**Solution:** You've created 20 subaccounts today. Either:
- Wait until tomorrow (quota resets daily)
- Manually delete the test organizer to force recreation
- Use the existing organizer (it should auto-reuse)

### Problem: Payment fails with "Cannot split to your own wallet"
**Solution:** Update `ASAAS_WALLET_ID` in `.env` to a different wallet (not the root account wallet).

### Problem: Organizer created but has no walletId
**Solution:** ASAAS subaccount creation failed. Check:
- ASAAS_API_URL is correct: `https://sandbox.asaas.com/v3`
- ASAAS_API_KEY is valid
- CPF format is correct
- Phone format is valid

---

## Manual Reset

To force creation of a new test organizer:

```sql
-- Connect to database
psql -U skryptauser -d skryptaeventos

-- Delete test organizer
DELETE FROM "User" WHERE email = 'test-organizer@skryptaeventos.com';
```

Or via Prisma Studio:
```bash
yarn db:studio
# Find and delete the user with email: test-organizer@skryptaeventos.com
```

---

## Environment Requirements

```bash
# .env must have:
ASAAS_API_URL="https://sandbox.asaas.com/v3"
ASAAS_API_KEY="$aact_hmlg_..."
ASAAS_WALLET_ID="your-platform-wallet-id"  # Must be different from root
ASAAS_WEBHOOK_TOKEN="your-webhook-token"
```

---

**Last Updated:** 2025-01-17
**Status:** ✅ Ready for Testing
