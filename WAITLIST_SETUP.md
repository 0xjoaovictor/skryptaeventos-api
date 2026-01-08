# Waitlist Module Setup Guide

This guide explains how to set up and deploy the Waitlist feature using Supabase (free tier) and AWS.

## Overview

The Waitlist module allows churches to register their interest in using the SkryptaEventos platform. It uses a **separate Supabase database** (free tier) from the main application database, and can be deployed to AWS while keeping other features in development.

## Features

- ✅ Separate Supabase database (free tier)
- ✅ Form validation (church name, responsible name, email, whatsapp, city)
- ✅ Duplicate email prevention
- ✅ Rate limiting (60 req/min in production)
- ✅ Production route guard (blocks all routes except `/waitlist`)
- ✅ Portuguese response messages

## Database Schema

```prisma
model Waitlist {
  id              String   @id @default(cuid())
  churchName      String
  responsibleName String
  email           String
  whatsapp        String
  city            String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## Setup Instructions

### 1. Create Supabase Project (Free Tier)

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project (free tier)
3. Note down your database credentials

### 2. Get Supabase Connection String

1. Go to your Supabase project
2. Click **Project Settings** (gear icon)
3. Go to **Database** section
4. Find **Connection string > URI**
5. Copy the connection string (it looks like this):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with your actual database password

### 3. Configure Environment Variables

Add to your `.env` file:

```bash
# Supabase Database for Waitlist
SUPABASE_DATABASE_URL="postgresql://postgres:your-password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"

# Block all routes except /waitlist in production
BLOCK_PRODUCTION_ROUTES="true"
```

### 4. Generate Prisma Client for Waitlist

Run this command to generate the Prisma client for the waitlist database:

```bash
yarn db:waitlist:generate
```

### 5. Create Database Table in Supabase

Push the schema to your Supabase database:

```bash
yarn db:waitlist:push
```

This will create the `waitlist` table in your Supabase database.

### 6. View Database with Prisma Studio (Optional)

To view and manage waitlist entries:

```bash
yarn db:waitlist:studio
```

## API Endpoints

### POST /waitlist

Register a new waitlist entry.

**Request:**
```json
{
  "churchName": "Igreja Batista Central",
  "responsibleName": "João Silva",
  "email": "joao@igreja.com",
  "whatsapp": "5511999999999",
  "city": "São Paulo"
}
```

**Success Response (201):**
```json
{
  "message": "Cadastro realizado com sucesso! Entraremos em contato em breve.",
  "data": {
    "id": "cm1234567890",
    "email": "joao@igreja.com",
    "churchName": "Igreja Batista Central",
    "createdAt": "2026-01-07T10:30:00.000Z"
  }
}
```

**Error Response - Duplicate Email (409):**
```json
{
  "statusCode": 409,
  "message": "Este email já está na lista de espera"
}
```

### GET /waitlist

Get all waitlist entries (admin only - requires authentication).

**Response:**
```json
[
  {
    "id": "cm1234567890",
    "churchName": "Igreja Batista Central",
    "responsibleName": "João Silva",
    "email": "joao@igreja.com",
    "whatsapp": "5511999999999",
    "city": "São Paulo",
    "createdAt": "2026-01-07T10:30:00.000Z",
    "updatedAt": "2026-01-07T10:30:00.000Z"
  }
]
```

## Production Deployment (AWS)

### Route Blocking Strategy

When deploying to AWS while other features are still in development:

1. **Enable Route Blocking:**
   Set in your production `.env`:
   ```bash
   BLOCK_PRODUCTION_ROUTES="true"
   ```

2. **Allowed Routes in Production:**
   - `/waitlist` (or `/api/waitlist` with global prefix) - Waitlist form submission
   - `/health` (or `/api/health` with global prefix) - Health check endpoint

3. **Blocked Routes:**
   All other routes (events, tickets, payments, etc.) will return:
   ```json
   {
     "statusCode": 403,
     "message": "Esta funcionalidade está em desenvolvimento. Apenas a lista de espera está disponível no momento."
   }
   ```

4. **Disable Blocking (when ready):**
   ```bash
   BLOCK_PRODUCTION_ROUTES="false"
   ```

### AWS Deployment Steps

1. Deploy API to AWS (ECS, EC2, or Lambda)
2. Set environment variables:
   ```bash
   SUPABASE_DATABASE_URL="your-supabase-connection-string"
   BLOCK_PRODUCTION_ROUTES="true"
   NODE_ENV="production"
   ```
3. Run Prisma generate in build process:
   ```bash
   yarn db:waitlist:generate
   ```
4. The API will only accept requests to `/waitlist` routes

## Development vs Production

### Development Mode
- `BLOCK_PRODUCTION_ROUTES="false"` or not set
- All routes accessible
- Rate limit: 1000 requests/minute

### Production Mode
- `BLOCK_PRODUCTION_ROUTES="true"`
- Only `/waitlist` routes accessible
- Rate limit: 60 requests/minute
- Production security headers (Helmet)

## Testing

Test the waitlist endpoint locally:

```bash
curl -X POST http://localhost:3000/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "churchName": "Test Church",
    "responsibleName": "Test User",
    "email": "test@example.com",
    "whatsapp": "5511999999999",
    "city": "São Paulo"
  }'
```

## Frontend Integration

Example React form:

```typescript
const handleSubmit = async (data: WaitlistForm) => {
  try {
    const response = await fetch('https://your-api.com/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      alert(result.message);
    } else {
      const error = await response.json();
      alert(error.message);
    }
  } catch (error) {
    alert('Erro ao enviar formulário');
  }
};
```

## Monitoring

View waitlist entries in Supabase dashboard:

1. Go to your Supabase project
2. Click **Table Editor**
3. Select `waitlist` table
4. View all registrations

Or use Prisma Studio:
```bash
yarn db:waitlist:studio
```

## Troubleshooting

### Error: `@prisma/waitlist-client` not found

Run the generate command:
```bash
yarn db:waitlist:generate
```

### Error: Database connection failed

Check your `SUPABASE_DATABASE_URL`:
- Make sure password is correct
- Verify the connection string format
- Check if Supabase project is active

### Error: All routes blocked

If you want to access other routes in development:
```bash
BLOCK_PRODUCTION_ROUTES="false"
```

## Cost Estimate

- **Supabase (Waitlist DB):** Free tier (up to 500MB, 2GB transfer/month)
- **AWS (API):** Depends on usage, but minimal for waitlist-only deployment
- **Total for waitlist feature:** $0-5/month

## Next Steps

Once ready to launch full platform:

1. Set `BLOCK_PRODUCTION_ROUTES="false"`
2. Configure main database (PostgreSQL)
3. Set up ASAAS payment gateway
4. Deploy complete API

## Support

For issues or questions about the waitlist module, contact the development team.
