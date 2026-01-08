# SkryptaEventos API - Makefile
# Convenient commands for development

.PHONY: help setup start stop restart logs clean test db-setup db-reset

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

## help: Show this help message
help:
	@echo "$(CYAN)SkryptaEventos API - Available Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Setup Commands:$(NC)"
	@echo "  make setup        - Initial project setup (install deps + start docker + setup db)"
	@echo "  make install      - Install dependencies"
	@echo ""
	@echo "$(GREEN)Docker Commands:$(NC)"
	@echo "  make up           - Start all Docker services"
	@echo "  make down         - Stop all Docker services"
	@echo "  make restart      - Restart all Docker services"
	@echo "  make logs         - View Docker logs (all services)"
	@echo "  make logs-db      - View PostgreSQL logs"
	@echo "  make logs-api     - View API logs"
	@echo "  make ps           - Show Docker services status"
	@echo "  make clean        - Stop services and remove volumes (⚠️  deletes data)"
	@echo ""
	@echo "$(GREEN)Database Commands:$(NC)"
	@echo "  make db-setup     - Setup database (generate + push schema)"
	@echo "  make db-push      - Push Prisma schema to database"
	@echo "  make db-migrate   - Create and apply migration"
	@echo "  make db-studio    - Open Prisma Studio"
	@echo "  make db-seed      - Seed database with test data"
	@echo "  make db-reset     - Reset database (⚠️  deletes all data)"
	@echo "  make db-backup    - Backup database to backup.sql"
	@echo "  make db-restore   - Restore database from backup.sql"
	@echo ""
	@echo "$(GREEN)Development Commands:$(NC)"
	@echo "  make dev          - Start development server"
	@echo "  make start        - Start API in dev mode"
	@echo "  make build        - Build for production"
	@echo "  make start-prod   - Start production server"
	@echo ""
	@echo "$(GREEN)Testing Commands:$(NC)"
	@echo "  make test         - Run unit tests"
	@echo "  make test-watch   - Run unit tests in watch mode"
	@echo "  make test-cov     - Run unit tests with coverage"
	@echo "  make test-e2e     - Run E2E tests"
	@echo "  make test-all     - Run all tests (unit + e2e)"
	@echo ""
	@echo "$(GREEN)Utility Commands:$(NC)"
	@echo "  make format       - Format code with Prettier"
	@echo "  make lint         - Run linter"
	@echo ""

## setup: Initial project setup
setup:
	@echo "$(CYAN)Setting up SkryptaEventos API...$(NC)"
	@echo "$(YELLOW)1. Installing dependencies...$(NC)"
	yarn install
	@echo "$(YELLOW)2. Creating .env file...$(NC)"
	cp .env.example .env || cp .env.development .env
	@echo "$(YELLOW)3. Starting Docker services...$(NC)"
	docker compose up -d
	@echo "$(YELLOW)4. Waiting for database...$(NC)"
	sleep 5
	@echo "$(YELLOW)5. Setting up database...$(NC)"
	yarn db:generate
	yarn db:push
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(CYAN)Run 'make dev' to start development server$(NC)"

## install: Install dependencies
install:
	@echo "$(CYAN)Installing dependencies...$(NC)"
	yarn install
	@echo "$(GREEN)✓ Dependencies installed!$(NC)"

## up: Start Docker services
up:
	@echo "$(CYAN)Starting Docker services...$(NC)"
	docker compose up -d
	@echo "$(GREEN)✓ Services started!$(NC)"
	@make ps

## down: Stop Docker services
down:
	@echo "$(CYAN)Stopping Docker services...$(NC)"
	docker compose down
	@echo "$(GREEN)✓ Services stopped!$(NC)"

## restart: Restart Docker services
restart:
	@echo "$(CYAN)Restarting Docker services...$(NC)"
	docker compose restart
	@echo "$(GREEN)✓ Services restarted!$(NC)"

## logs: View all logs
logs:
	docker compose logs -f

## l gs-db: View PostgreSQL logs
logs-db:
	docker compose logs -f postgres

## l gs-api: Placeholder for API logs (when containerized)
logs-api:
	@echo "$(YELLOW)API is not containerized yet. Use 'yarn start:dev' to see logs.$(NC)"

## ps: Show service status
ps:
	@echo "$(CYAN)Docker Services Status:$(NC)"
	docker compose ps

## c ean: Stop and remove all containers and volumes
clean:
	@echo "$(RED)⚠️  This will delete all data in Docker volumes!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	docker compose down -v
	@echo "$(GREEN)✓ Cleanup complete!$(NC)"

## db-setup: Setup database
db-setup:
	@echo "$(CYAN)Setting up database...$(NC)"
	yarn db:generate
	yarn db:push
	@echo "$(GREEN)✓ Database ready!$(NC)"

## db-push: Push schema to database
db-push:
	@echo "$(CYAN)Pushing schema to database...$(NC)"
	yarn db:push
	@echo "$(GREEN)✓ Schema pushed!$(NC)"

## db-migrate: Create and apply migration
db-migrate:
	@echo "$(CYAN)Creating migration...$(NC)"
	yarn db:migrate
	@echo "$(GREEN)✓ Migration applied!$(NC)"

## db-studio: Open Prisma Studio
db-studio:
	@echo "$(CYAN)Opening Prisma Studio...$(NC)"
	yarn db:studio

## db-seed: Seed database
db-seed:
	@echo "$(CYAN)Seeding database...$(NC)"
	yarn db:seed
	@echo "$(GREEN)✓ Database seeded!$(NC)"

## db-reset: Reset database
db-reset:
	@echo "$(RED)⚠️  This will delete all data!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	@echo "$(CYAN)Resetting database...$(NC)"
	docker compose down postgres
	docker volume rm skryptaeventos-api_postgres_data || true
	docker compose up -d postgres
	@sleep 5
	yarn db:push
	@echo "$(GREEN)✓ Database reset complete!$(NC)"

## db-backup: Backup database
db-backup:
	@echo "$(CYAN)Backing up database...$(NC)"
	docker compose exec -T postgres pg_dump -U skryptauser skryptaeventos > backup.sql
	@echo "$(GREEN)✓ Backup saved to backup.sql$(NC)"

## db-restore: Restore database from backup
db-restore:
	@echo "$(CYAN)Restoring database from backup.sql...$(NC)"
	docker compose exec -T postgres psql -U skryptauser skryptaeventos < backup.sql
	@echo "$(GREEN)✓ Database restored!$(NC)"

## dev: Start development environment
dev:
	@echo "$(CYAN)Starting development environment...$(NC)"
	@make up
	@echo "$(GREEN)✓ Docker services started!$(NC)"
	@echo "$(CYAN)Starting API in development mode...$(NC)"
	yarn start:dev

## start: Start API in development mode
start:
	@echo "$(CYAN)Starting API...$(NC)"
	yarn start:dev

## build: Build for production
build:
	@echo "$(CYAN)Building for production...$(NC)"
	yarn build
	@echo "$(GREEN)✓ Build complete!$(NC)"

## start-prod: Start production server
start-prod:
	@echo "$(CYAN)Starting production server...$(NC)"
	yarn start:prod

## test: Run unit tests
test:
	@echo "$(CYAN)Running unit tests...$(NC)"
	yarn test

## test-watch: Run tests in watch mode
test-watch:
	@echo "$(CYAN)Running tests in watch mode...$(NC)"
	yarn test:watch

## test-cov: Run tests with coverage
test-cov:
	@echo "$(CYAN)Running tests with coverage...$(NC)"
	yarn test:cov

## test-e2e: Run E2E tests
test-e2e:
	@echo "$(CYAN)Running E2E tests...$(NC)"
	yarn test:e2e

## test-all: Run all tests
test-all:
	@echo "$(CYAN)Running all tests...$(NC)"
	@make test
	@make test-e2e
	@echo "$(GREEN)✓ All tests complete!$(NC)"

## format: Format code
format:
	@echo "$(CYAN)Formatting code...$(NC)"
	yarn format
	@echo "$(GREEN)✓ Code formatted!$(NC)"

## lint: Run linter
lint:
	@echo "$(CYAN)Running linter...$(NC)"
	yarn lint || true
	@echo "$(GREEN)✓ Linting complete!$(NC)"
