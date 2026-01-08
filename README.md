# SkryptaEventos API

Production-ready event ticketing platform API built with NestJS, TypeScript, Prisma, and PostgreSQL. Features complete event management, ticket sales, payment processing via ASAAS gateway, QR code check-ins, and comprehensive administrative tools.

**Status**: ✅ Production Ready | 13 Modules | 80+ Endpoints | 77 Unit Tests Passing

---

## Quick Start

### Prerequisites
- Node.js v18+ | PostgreSQL 12+ | Yarn | Docker (optional)

### 3-Command Setup
```bash
make setup        # Install deps + start Docker + setup DB
make dev          # Start development environment
```

### Manual Setup
```bash
yarn install
cp .env.development .env
docker-compose up -d
yarn db:generate && yarn db:push
yarn start:dev
```

**Access**: API at `http://localhost:3000` | pgAdmin at `http://localhost:5050` | MailHog at `http://localhost:8025`

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | NestJS 11 | Server-side framework |
| Language | TypeScript 5 | Type-safe development |
| Database | PostgreSQL | Relational database |
| ORM | Prisma 5 | Type-safe database access |
| Auth | JWT + Passport | Secure authentication |
| Payment | ASAAS | Brazilian payment gateway |
| Docker | Compose 3.8 | Local development |

---

## Features

### Core Modules (13)
1. **Auth** - JWT authentication, email verification, password reset
2. **Users** - User management with RBAC (Admin, Organizer, Attendee)
3. **Events** - Complete event management with slug generation
4. **Tickets** - Inventory, pricing, categories, half-price support
5. **Orders** - Checkout flow with 15-min expiration
6. **Payments** - ASAAS integration (PIX, Boleto, Credit Card)
7. **Refunds** - Request and approval workflow
8. **Promo Codes** - Discount system with validation
9. **Custom Forms** - Dynamic registration form builder
10. **Ticket Instances** - Individual tickets with QR codes
11. **Check-in** - QR code scanning and validation
12. **Sessions** - Multi-device session management
13. **Audit Logs** - Complete activity tracking

### Key Features
- ✅ 80+ REST API endpoints with full CRUD operations
- ✅ Role-based access control (RBAC)
- ✅ Brazilian market support (CPF, Meia-entrada)
- ✅ Real-time inventory management
- ✅ Webhook integration with ASAAS (15 event types)
- ✅ Automated order expiration and cleanup
- ✅ QR code generation and check-in system
- ✅ Comprehensive audit logging
- ✅ Docker Compose for local development
- ✅ 77 unit tests, all passing

---

## API Examples

### Authentication
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "name": "John Doe",
    "password": "SecurePass123",
    "role": "ORGANIZER"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "SecurePass123"}'
```

### Create Event
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Rock Festival 2025",
    "description": "Amazing rock festival",
    "subject": "Music",
    "startsAt": "2025-06-15T20:00:00Z",
    "endsAt": "2025-06-16T04:00:00Z",
    "locationType": "new",
    "city": "São Paulo",
    "state": "SP",
    "ticketType": "PAID"
  }'
```

### Create Ticket
```bash
curl -X POST http://localhost:3000/api/tickets \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event-id",
    "title": "VIP Ticket",
    "price": 150.00,
    "quantity": 100,
    "hasHalfPrice": true,
    "halfPrice": 75.00
  }'
```

### Checkout & Payment
```bash
# Create Order
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "event-id",
    "items": [{"ticketId": "ticket-id", "quantity": 2}],
    "promoCode": "LAUNCH50"
  }'

# Create PIX Payment
curl -X POST http://localhost:3000/api/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-id",
    "paymentMethod": "PIX",
    "customerData": {
      "name": "John Doe",
      "email": "john@example.com",
      "cpfCnpj": "12345678901"
    }
  }'
```

---

## Docker Setup

### Services
- **PostgreSQL 15** - Main database (Port 5432)
- **pgAdmin 4** - Database UI (Port 5050)
- **MailHog** - Email testing (SMTP 1025, Web 8025)
- **Redis 7** - Caching (Port 6379)

### Commands
```bash
# Using Make (Recommended)
make help           # Show all commands
make setup          # Initial setup
make dev            # Start dev environment
make logs           # View Docker logs
make db-studio      # Open Prisma Studio
make test           # Run tests
make down           # Stop services
make clean          # Remove all data

# Using Yarn
yarn docker:up      # Start Docker services
yarn docker:down    # Stop services
yarn docker:logs    # View logs
yarn db:studio      # Open database GUI

# Using Docker Compose
docker-compose up -d        # Start services
docker-compose down         # Stop services
docker-compose logs -f      # Follow logs
docker-compose ps           # Service status
```

### Database Operations
```bash
# Backup
docker-compose exec postgres pg_dump -U skryptauser skryptaeventos > backup.sql

# Restore
docker-compose exec -T postgres psql -U skryptauser skryptaeventos < backup.sql

# Reset
make db-reset
```

---

## Environment Configuration

### Required Variables
```env
# Database
DATABASE_URL="postgresql://skryptauser:skryptapass@localhost:5432/skryptaeventos?schema=public"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
JWT_EXPIRATION="7d"

# App
PORT=3000
NODE_ENV="development"

# ASAAS Payment
ASAAS_API_KEY="your-asaas-api-key"
ASAAS_API_URL="https://sandbox.asaas.com/api/v3"  # Use https://api.asaas.com/v3 for production
```

### Optional Variables
```env
# Email (Use MailHog for development)
EMAIL_HOST="localhost"
EMAIL_PORT=1025
EMAIL_FROM="noreply@skryptaeventos.com"

# Production Email (SendGrid/Mailgun/SES)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# CORS
CORS_ORIGIN="http://localhost:3001"
```

---

## Database Schema

### Models (15)
1. **User** - Authentication and profile
2. **Session** - Multi-device session tracking
3. **Event** - Event details and management
4. **Ticket** - Ticket types and inventory
5. **TicketCategory** - Ticket organization
6. **TicketInstance** - Individual tickets with QR codes
7. **Order** - Shopping cart and checkout
8. **OrderItem** - Order line items
9. **Payment** - Payment transactions
10. **Refund** - Refund requests
11. **PromoCode** - Discount codes
12. **CustomFormField** - Dynamic forms
13. **CustomFormResponse** - Form submissions
14. **AuditLog** - Activity tracking
15. **CheckIn** - Check-in records

### Key Relationships
- User → Events (organizer)
- Event → Tickets → TicketInstances
- Order → OrderItems → TicketInstances
- Order → Payment → Refund
- Event → PromoCode, CustomFormField

---

## Available Commands

### Development
```bash
yarn start:dev          # Start with hot-reload
yarn start:debug        # Start in debug mode
yarn build              # Build for production
yarn start:prod         # Run production build
```

### Database
```bash
yarn db:generate        # Generate Prisma Client
yarn db:push            # Push schema to database
yarn db:migrate         # Create and run migrations
yarn db:studio          # Open Prisma Studio
yarn db:seed            # Seed database (optional)
```

### Testing
```bash
yarn test               # Run unit tests (77 tests)
yarn test:watch         # Run tests in watch mode
yarn test:cov           # Run tests with coverage
yarn test:e2e           # Run E2E tests
```

### Code Quality
```bash
yarn format             # Format with Prettier
yarn lint               # Run linter
```

---

## Module Documentation

### Custom Forms
Create dynamic registration forms for events with 14 field types (TEXT, EMAIL, PHONE, CPF, DATE, SELECT, etc.). Supports validation, display ordering, and conditional logic.

**Endpoints**: `/api/custom-forms/*`

### Sessions
Manage multi-device authentication sessions. Users can view active sessions, logout from specific devices, or logout from all devices. Automatic cleanup runs hourly.

**Endpoints**: `/api/sessions/*`

### Audit Logs
Comprehensive activity tracking with 30+ action types. Records who did what, when, with old/new value comparison. Includes IP address and user agent tracking.

**Endpoints**: `/api/audit-logs/*`

**Actions Tracked**: Event operations, Order processing, Payment handling, Ticket operations, User activities, and more.

---

## Testing

### Unit Tests (77 passing)
- Auth Service (12 tests) - Registration, login, email verification
- Users Service (11 tests) - CRUD operations
- Events Service (13 tests) - Event management with RBAC
- Tickets Service (17 tests) - Availability, pricing, validation
- Orders Service (16 tests) - Checkout flow, expiration
- Refunds Service (8 tests) - Request and approval

### Run Tests
```bash
make test              # Run all unit tests
yarn test:watch        # Watch mode
yarn test:cov          # With coverage
```

---

## ASAAS Payment Integration

### Supported Methods
- **PIX** - Instant payment with QR code
- **Boleto** - Bank slip with barcode
- **Credit Card** - Card payments
- **Debit Card** - Debit payments
- **Bank Transfer** - Direct transfers

### Webhook Events (15 types)
- PAYMENT_CREATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED
- PAYMENT_OVERDUE, PAYMENT_REFUNDED
- PAYMENT_CHARGEBACK_REQUESTED, PAYMENT_CHARGEBACK_DISPUTE
- And more...

### Configuration
1. Set `ASAAS_API_KEY` in `.env`
2. Set `ASAAS_API_URL` (sandbox or production)
3. Configure webhook URL in ASAAS dashboard:
   ```
   https://your-domain.com/api/payments/webhook/asaas
   ```

---

## Production Deployment

### Pre-Deployment Checklist

#### Environment
- [ ] Production database created
- [ ] `DATABASE_URL` configured
- [ ] `JWT_SECRET` changed to strong random value
- [ ] `ASAAS_API_KEY` set to production key
- [ ] `ASAAS_API_URL` set to `https://api.asaas.com/v3`
- [ ] Email service configured
- [ ] `CORS_ORIGIN` restricted to frontend domain

#### Database
- [ ] Run migrations: `yarn db:migrate`
- [ ] Verify tables created
- [ ] Create initial admin user
- [ ] Configure automatic backups

#### Security
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] Helmet installed for security headers
- [ ] CORS properly configured
- [ ] No hardcoded secrets

#### Monitoring
- [ ] Error tracking (Sentry)
- [ ] APM tool (DataDog, New Relic)
- [ ] Uptime monitoring
- [ ] Log aggregation
- [ ] Database performance monitoring

### Deployment Options

#### Option 1: VPS (DigitalOcean, AWS EC2)
```bash
# Install dependencies
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql postgresql-contrib
npm install -g yarn pm2

# Deploy
git clone <repository>
cd skryptaeventos-api
yarn install && yarn build
yarn db:migrate

# Start with PM2
pm2 start dist/main.js --name skryptaeventos-api
pm2 save && pm2 startup
```

#### Option 2: Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
RUN yarn build && yarn db:generate
EXPOSE 3000
CMD ["node", "dist/main"]
```

#### Option 3: PaaS (Heroku, Railway, Render)
```bash
# Heroku example
heroku create skryptaeventos-api
heroku addons:create heroku-postgresql:hobby-dev
git push heroku main
heroku run yarn db:migrate
```

### Post-Deployment
1. Test all endpoints
2. Verify webhook processing
3. Complete a full purchase flow
4. Monitor error logs
5. Check database performance

---

## Project Structure

```
skryptaeventos-api/
├── docker/                         # Docker initialization scripts
├── prisma/
│   └── schema.prisma              # Database schema (15 models)
├── src/
│   ├── auth/                      # JWT authentication
│   ├── users/                     # User management
│   ├── events/                    # Event CRUD
│   ├── tickets/                   # Ticket inventory
│   ├── ticket-categories/         # Ticket organization
│   ├── ticket-instances/          # QR codes & check-in
│   ├── orders/                    # Checkout flow
│   ├── payments/                  # ASAAS integration
│   ├── refunds/                   # Refund workflow
│   ├── promo-codes/              # Discount system
│   ├── custom-forms/             # Form builder
│   ├── sessions/                  # Session management
│   ├── audit-logs/               # Activity tracking
│   ├── common/                    # Shared utilities
│   │   ├── prisma/               # Database service
│   │   ├── decorators/           # Custom decorators
│   │   ├── filters/              # Exception filters
│   │   └── interceptors/         # Logging
│   ├── config/                    # Configuration
│   ├── app.module.ts             # Main module
│   └── main.ts                   # Bootstrap
├── test/                          # E2E tests
├── .env.example                   # Environment template
├── .env.development              # Dev preset
├── docker-compose.yml            # Docker services
├── Makefile                      # Convenience commands
├── package.json                  # Dependencies
└── tsconfig.json                 # TypeScript config
```

---

## Security Features

- ✅ JWT token authentication with expiration
- ✅ Password hashing with bcrypt (10 rounds)
- ✅ Role-based access control (RBAC)
- ✅ Email verification system
- ✅ Password reset with tokens
- ✅ Input validation with class-validator
- ✅ SQL injection protection via Prisma
- ✅ Multi-device session tracking
- ✅ Comprehensive audit logging
- ✅ CORS configuration

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :5432

# Change port in docker-compose.yml
ports:
  - "5433:5432"

# Update DATABASE_URL
DATABASE_URL="postgresql://...@localhost:5433/..."
```

### Database Connection Failed
```bash
# Check container health
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Prisma Schema Out of Sync
```bash
# Push schema
yarn db:push

# Or regenerate client
yarn db:generate
```

### Reset Everything
```bash
make clean          # Remove all data
make setup          # Fresh setup
```

---

## Performance Features

- ✅ Database connection pooling (Prisma)
- ✅ Pagination on all list endpoints
- ✅ Query optimization with select/include
- ✅ Redis-ready caching strategy
- ✅ Scheduled job optimization (cron)
- ✅ Efficient inventory management
- ✅ Transaction-safe operations

---

## Statistics

- **Lines of Code**: 10,000+
- **TypeScript Files**: 100+
- **API Endpoints**: 80+
- **Database Tables**: 15
- **Modules**: 13
- **DTOs**: 40+
- **Unit Tests**: 77 (all passing)
- **E2E Tests**: 61 (all passing)

---

## Roadmap

### Immediate (Production Ready)
- [x] Complete API implementation
- [x] Unit tests
- [x] Docker Compose setup
- [x] Documentation
- [ ] Rate limiting
- [ ] API documentation (Swagger)
- [ ] Monitoring (Sentry, DataDog)

### Short-term
- [ ] Email notifications
- [ ] PDF ticket generation
- [ ] Event analytics dashboard
- [ ] Bulk operations
- [ ] Advanced reporting
- [ ] WhatsApp notifications

### Long-term
- [ ] Mobile app integration
- [ ] Social media integration
- [ ] Waiting list management
- [ ] Recurring events
- [ ] Seat selection
- [ ] Multi-language support

---

## Support

For issues and questions, please open an issue on the repository.

---

## License

MIT License - Free to use and modify

---

**Built with ❤️ for the Brazilian events market using NestJS and TypeScript**
