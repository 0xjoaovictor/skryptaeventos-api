import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SecurityLoggerService } from '../services/security-logger.service';

@Global()
@Module({
  providers: [PrismaService, SecurityLoggerService],
  exports: [PrismaService, SecurityLoggerService],
})
export class PrismaModule {}
