-- Database initialization script for SkryptaEventos API
-- This script runs when the PostgreSQL container is first created

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE skryptaeventos TO skryptauser;

-- Set default timezone
SET timezone = 'America/Sao_Paulo';

-- Log initialization
SELECT 'SkryptaEventos Database Initialized!' as status;
