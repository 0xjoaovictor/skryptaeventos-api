import { plainToClass } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  // SECURITY: JWT secret is required for authentication
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRATION: string;

  @IsString()
  ASAAS_API_KEY: string;

  @IsString()
  ASAAS_API_URL: string;

  // SECURITY: Webhook token is required to validate ASAAS webhooks
  @IsString()
  ASAAS_WEBHOOK_TOKEN: string;

  // SECURITY: CORS origin should be configured in production
  // Can be a comma-separated list of allowed origins
  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
