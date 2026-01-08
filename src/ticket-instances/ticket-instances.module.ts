import { Module } from '@nestjs/common';
import { TicketInstancesService } from './ticket-instances.service';
import { TicketInstancesController } from './ticket-instances.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TicketInstancesController],
  providers: [TicketInstancesService],
  exports: [TicketInstancesService],
})
export class TicketInstancesModule {}
