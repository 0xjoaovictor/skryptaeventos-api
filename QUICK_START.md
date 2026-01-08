# 🚀 Quick Start Guide - SkryptaEventos API

Get the SkryptaEventos API running locally in minutes using Docker Compose.

---

## 🎯 Prerequisites

Ensure you have these installed:
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop))
- **Node.js v18+** ([download](https://nodejs.org/))
- **Yarn** (run: `npm install -g yarn`)

---

## ⚡ Super Quick Start (3 commands)

```bash
# 1. Setup everything (one command!)
make setup

# 2. Start the API
make dev
```

✅ **Done!** API is running at http://localhost:3000

---

## 📝 Step-by-Step Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment

```bash
# Copy the environment template
cp .env.development .env

# Or use the example file
cp .env.example .env
```

### 3. Start Docker Services

```bash
# Start PostgreSQL, pgAdmin, MailHog, and Redis
docker-compose up -d

# Check services are running
docker-compose ps
```

You should see:
```
✓ skryptaeventos-db      (PostgreSQL)
✓ skryptaeventos-pgadmin (Database UI)
✓ skryptaeventos-mailhog (Email Testing)
✓ skryptaeventos-redis   (Cache)
```

### 4. Setup Database

```bash
# Generate Prisma Client
yarn db:generate

# Apply database schema
yarn db:push
```

### 5. Start the API

```bash
yarn start:dev
```

🎉 **Success!** Your API is now running.

---

## 🌐 Access Your Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **API** | http://localhost:3000 | N/A |
| **pgAdmin** | http://localhost:5050 | Email: `admin@skryptaeventos.com`<br>Password: `admin123` |
| **MailHog** | http://localhost:8025 | No login required |
| **Prisma Studio** | Run `yarn db:studio` | Opens at http://localhost:5555 |

---

## 🧪 Test the API

### Health Check

```bash
curl http://localhost:3000
```

### Register a User

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "name": "Test User",
    "role": "ORGANIZER"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

---

## 🛠️ Common Commands

### Using Make (Recommended)

```bash
make help           # Show all available commands
make dev            # Start development environment
make logs           # View Docker logs
make ps             # Check service status
make db-studio      # Open database GUI
make test           # Run tests
make down           # Stop all services
```

### Using Yarn

```bash
yarn start:dev      # Start API
yarn docker:up      # Start Docker services
yarn docker:down    # Stop Docker services
yarn docker:logs    # View logs
yarn test           # Run unit tests
yarn test:e2e       # Run E2E tests
```

### Using Docker Compose

```bash
docker-compose up -d        # Start services
docker-compose down         # Stop services
docker-compose logs -f      # Follow logs
docker-compose ps           # Service status
docker-compose restart      # Restart all services
```

---

## 📊 View Database

### Option 1: Prisma Studio (Recommended)

```bash
yarn db:studio
```

Then open: http://localhost:5555

### Option 2: pgAdmin

1. Go to http://localhost:5050
2. Login with:
   - Email: `admin@skryptaeventos.com`
   - Password: `admin123`
3. Add server:
   - Name: `SkryptaEventos`
   - Host: `postgres` (or `host.docker.internal` from host machine)
   - Port: `5432`
   - Username: `skryptauser`
   - Password: `skryptapass`
   - Database: `skryptaeventos`

---

## 📧 Test Emails

All emails sent by the API are caught by MailHog:

1. Go to http://localhost:8025
2. Trigger an email action (register user, reset password, etc.)
3. View the email in MailHog UI

**Email Configuration** (already in `.env.development`):
```
EMAIL_HOST=localhost
EMAIL_PORT=1025
```

---

## 🗄️ Database Operations

### Backup Database

```bash
docker-compose exec postgres pg_dump -U skryptauser skryptaeventos > backup.sql
```

### Restore Database

```bash
docker-compose exec -T postgres psql -U skryptauser skryptaeventos < backup.sql
```

### Reset Database

```bash
# Stop database
docker-compose down postgres

# Remove volume
docker volume rm skryptaeventos-api_postgres_data

# Restart and setup
docker-compose up -d postgres
yarn db:push
```

---

## 🐛 Troubleshooting

### Port Already in Use

**Problem**: Port 5432 is already in use

**Solution**:
```bash
# Find what's using port 5432
lsof -i :5432

# Option 1: Stop the conflicting service
# Option 2: Change port in docker-compose.yml:
#   ports:
#     - "5433:5432"
# Then update .env:
#   DATABASE_URL="postgresql://...@localhost:5433/..."
```

### Database Connection Error

**Problem**: Can't connect to database

**Solution**:
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Prisma Schema Out of Sync

**Problem**: Schema doesn't match database

**Solution**:
```bash
yarn db:push
# or
yarn db:generate
```

### Docker Services Won't Start

**Problem**: Services fail to start

**Solution**:
```bash
# Clean everything and start fresh
docker-compose down -v
docker-compose up -d
yarn db:push
```

---

## 🧹 Cleanup

### Stop Services

```bash
# Stop but keep data
docker-compose down

# Stop and remove data (⚠️ deletes database)
docker-compose down -v
```

### Remove Everything

```bash
# Using Make
make clean

# Or manually
docker-compose down -v
docker volume prune
docker system prune
```

---

## 📚 Next Steps

- **API Documentation**: See [README.md](./README.md)
- **Docker Guide**: See [DOCKER_SETUP.md](./DOCKER_SETUP.md)
- **E2E Tests**: See [E2E_TESTS_DOCUMENTATION.md](./E2E_TESTS_DOCUMENTATION.md)

---

## 💡 Pro Tips

1. **Use Make**: Simplest way to manage everything
   ```bash
   make setup  # One command setup
   make dev    # Start everything
   ```

2. **Check Logs**: When something goes wrong
   ```bash
   make logs
   # or
   docker-compose logs -f
   ```

3. **Use Prisma Studio**: Best way to view/edit database
   ```bash
   yarn db:studio
   ```

4. **Test Emails**: Always check MailHog at http://localhost:8025

5. **Monitor Services**: Keep an eye on Docker status
   ```bash
   docker-compose ps
   ```

---

## ✅ Quick Reference Card

| Task | Command |
|------|---------|
| **Setup** | `make setup` |
| **Start Dev** | `make dev` |
| **Stop All** | `make down` |
| **View Logs** | `make logs` |
| **Database GUI** | `yarn db:studio` |
| **Run Tests** | `make test` |
| **Reset DB** | `make db-reset` |
| **Help** | `make help` |

---

**Having Issues?** Check [DOCKER_SETUP.md](./DOCKER_SETUP.md) for detailed troubleshooting.

**Ready to Deploy?** See production deployment guide (coming soon).

---

**Last Updated**: December 16, 2024
**Status**: ✅ Ready for Development
