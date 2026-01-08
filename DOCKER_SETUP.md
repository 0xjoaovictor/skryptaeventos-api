# 🐳 Docker Setup Guide - SkryptaEventos API

Complete guide for running the SkryptaEventos API locally using Docker Compose.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Services Overview](#services-overview)
4. [Database Setup](#database-setup)
5. [Accessing Services](#accessing-services)
6. [Common Commands](#common-commands)
7. [Troubleshooting](#troubleshooting)
8. [Environment Variables](#environment-variables)

---

## ✅ Prerequisites

Before you begin, ensure you have the following installed:

- **Docker**: [Download Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Docker Compose**: Usually included with Docker Desktop
- **Node.js**: v18+ (for running the API)
- **Yarn**: Package manager

Verify installations:
```bash
docker --version
docker-compose --version
node --version
yarn --version
```

---

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Navigate to project directory
cd skryptaeventos-api

# Copy environment file
cp .env.example .env
# Or use the development preset
cp .env.development .env

# Install dependencies
yarn install
```

### 2. Start Docker Services

```bash
# Start all services (PostgreSQL, pgAdmin, MailHog, Redis)
docker-compose up -d

# Check if services are running
docker-compose ps
```

Expected output:
```
NAME                      STATUS       PORTS
skryptaeventos-db         Up           0.0.0.0:5432->5432/tcp
skryptaeventos-mailhog    Up           0.0.0.0:1025->1025/tcp, 0.0.0.0:8025->8025/tcp
skryptaeventos-pgadmin    Up           0.0.0.0:5050->80/tcp
skryptaeventos-redis      Up           0.0.0.0:6379->6379/tcp
```

### 3. Initialize Database

```bash
# Generate Prisma Client
yarn db:generate

# Run database migrations
yarn db:push

# (Optional) Seed database with test data
yarn db:seed
```

### 4. Start the API

```bash
# Development mode with hot-reload
yarn start:dev

# Production mode
yarn build
yarn start:prod
```

The API will be available at: **http://localhost:3000**

---

## 🛠️ Services Overview

Docker Compose sets up the following services:

### 1. PostgreSQL Database
- **Port**: 5432
- **User**: skryptauser
- **Password**: skryptapass
- **Database**: skryptaeventos
- **Connection String**: `postgresql://skryptauser:skryptapass@localhost:5432/skryptaeventos`

### 2. pgAdmin (Database UI)
- **Port**: 5050
- **URL**: http://localhost:5050
- **Email**: admin@skryptaeventos.com
- **Password**: admin123

### 3. MailHog (Email Testing)
- **SMTP Port**: 1025 (for API)
- **Web UI Port**: 8025
- **URL**: http://localhost:8025
- Catches all emails sent by the API for testing

### 4. Redis (Caching)
- **Port**: 6379
- Used for caching and rate limiting

---

## 🗄️ Database Setup

### Initial Setup

```bash
# Start database container
docker-compose up -d postgres

# Wait for database to be ready (check health)
docker-compose ps postgres

# Generate Prisma Client
yarn db:generate

# Apply schema to database
yarn db:push
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (⚠️ deletes all data)
npx prisma migrate reset
```

### Prisma Studio (Database GUI)

```bash
# Open Prisma Studio
yarn db:studio
```

Access at: **http://localhost:5555**

---

## 🌐 Accessing Services

### API Endpoints
- **Base URL**: http://localhost:3000
- **API Docs**: http://localhost:3000/api (if Swagger is configured)
- **Health Check**: http://localhost:3000/health

### pgAdmin (Database Management)
1. Navigate to: http://localhost:5050
2. Login with:
   - Email: `admin@skryptaeventos.com`
   - Password: `admin123`
3. Add server:
   - **Name**: SkryptaEventos Local
   - **Host**: `postgres` (Docker network) or `host.docker.internal` (from host)
   - **Port**: 5432
   - **User**: skryptauser
   - **Password**: skryptapass
   - **Database**: skryptaeventos

### MailHog (Email Testing)
1. Navigate to: http://localhost:8025
2. Send test email from API
3. View received emails in MailHog UI

### Redis
```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# Test Redis
> ping
PONG
```

---

## 🔧 Common Commands

### Docker Compose Commands

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d postgres

# Stop all services
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (⚠️ deletes database data)
docker-compose down -v

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f postgres

# Restart a service
docker-compose restart postgres

# Check service status
docker-compose ps

# Execute command in container
docker-compose exec postgres psql -U skryptauser -d skryptaeventos
```

### Database Commands

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U skryptauser -d skryptaeventos

# Backup database
docker-compose exec postgres pg_dump -U skryptauser skryptaeventos > backup.sql

# Restore database
docker-compose exec -T postgres psql -U skryptauser skryptaeventos < backup.sql

# View database size
docker-compose exec postgres psql -U skryptauser -d skryptaeventos -c "SELECT pg_size_pretty(pg_database_size('skryptaeventos'));"
```

### Application Commands

```bash
# Install dependencies
yarn install

# Generate Prisma Client
yarn db:generate

# Apply schema changes
yarn db:push

# Run migrations
yarn db:migrate

# Seed database
yarn db:seed

# Start development server
yarn start:dev

# Build for production
yarn build

# Start production server
yarn start:prod

# Run tests
yarn test

# Run E2E tests
yarn test:e2e

# Run linter
yarn lint

# Format code
yarn format
```

---

## 🐛 Troubleshooting

### Port Already in Use

**Error**: "Port 5432 is already allocated"

**Solution**:
```bash
# Check what's using the port
lsof -i :5432

# Option 1: Stop the service using the port
# Option 2: Change port in docker-compose.yml
ports:
  - "5433:5432"  # Use different host port

# Update DATABASE_URL in .env
DATABASE_URL="postgresql://skryptauser:skryptapass@localhost:5433/skryptaeventos?schema=public"
```

### Database Connection Failed

**Error**: "Can't reach database server"

**Solution**:
```bash
# Check if PostgreSQL container is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Wait for health check
docker-compose ps postgres
# Should show "healthy" status
```

### Prisma Schema Out of Sync

**Error**: "Prisma schema is out of sync with database"

**Solution**:
```bash
# Option 1: Push schema changes
yarn db:push

# Option 2: Generate client
yarn db:generate

# Option 3: Reset database (⚠️ deletes data)
npx prisma migrate reset
```

### Docker Compose Not Found

**Error**: "docker-compose: command not found"

**Solution**:
```bash
# Try with docker compose (v2 syntax)
docker compose up -d

# Or install docker-compose
# macOS
brew install docker-compose

# Linux
sudo apt-get install docker-compose
```

### Permission Denied Errors

**Error**: "Permission denied" when accessing volumes

**Solution**:
```bash
# Fix volume permissions
docker-compose down
sudo chown -R $USER:$USER .

# Remove volumes and recreate
docker-compose down -v
docker-compose up -d
```

### MailHog Not Receiving Emails

**Check**:
1. Email service is configured correctly in `.env`:
   ```
   EMAIL_HOST="localhost"
   EMAIL_PORT=1025
   ```
2. MailHog container is running:
   ```bash
   docker-compose ps mailhog
   ```
3. Check MailHog logs:
   ```bash
   docker-compose logs mailhog
   ```

---

## 🔐 Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL="postgresql://skryptauser:skryptapass@localhost:5432/skryptaeventos?schema=public"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRATION="7d"

# App
PORT=3000
NODE_ENV="development"
APP_URL="http://localhost:3000"
```

### Development (with Docker Compose)

```bash
# Email (MailHog)
EMAIL_HOST="localhost"
EMAIL_PORT=1025
EMAIL_USER=""
EMAIL_PASSWORD=""

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# ASAAS (Sandbox)
ASAAS_API_URL="https://sandbox.asaas.com/api/v3"
```

### Production

```bash
# Email (Gmail/SendGrid)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"

# ASAAS (Production)
ASAAS_API_URL="https://api.asaas.com/v3"
ASAAS_API_KEY="your-production-api-key"
```

---

## 📊 Monitoring

### View Container Stats

```bash
# Real-time stats for all containers
docker stats

# Stats for specific container
docker stats skryptaeventos-db
```

### Check Container Health

```bash
# PostgreSQL health
docker-compose exec postgres pg_isready -U skryptauser

# Redis health
docker-compose exec redis redis-cli ping
```

### View Container Logs

```bash
# Follow all logs
docker-compose logs -f

# Tail last 100 lines
docker-compose logs --tail=100

# Logs for specific service
docker-compose logs -f postgres
```

---

## 🧹 Cleanup

### Remove Containers

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes (⚠️ deletes database data)
docker-compose down -v

# Remove containers, volumes, and images
docker-compose down -v --rmi all
```

### Remove Docker Resources

```bash
# Remove unused containers
docker container prune

# Remove unused volumes
docker volume prune

# Remove unused images
docker image prune

# Remove all unused resources
docker system prune -a
```

---

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [NestJS Documentation](https://docs.nestjs.com/)

---

## ✅ Quick Reference

### Start Development Environment

```bash
# 1. Start services
docker-compose up -d

# 2. Setup database
yarn db:push

# 3. Start API
yarn start:dev
```

### Stop Development Environment

```bash
# Stop API (Ctrl+C in terminal)

# Stop Docker services
docker-compose down
```

### Reset Everything

```bash
# Stop and remove everything
docker-compose down -v

# Restart
docker-compose up -d
yarn db:push
yarn start:dev
```

---

**Last Updated**: December 16, 2024
**Docker Compose Version**: 3.8
**Status**: ✅ Ready for Development
