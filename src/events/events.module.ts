import { Module, forwardRef } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventsSchedulerService } from './events-scheduler.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RefundsModule } from '../refunds/refunds.module';
import { TicketInstancesModule } from '../ticket-instances/ticket-instances.module';

@Module({
  imports: [PrismaModule, AuthModule, RefundsModule, forwardRef(() => TicketInstancesModule)],
  controllers: [EventsController],
  providers: [EventsService, EventsSchedulerService],
  exports: [EventsService],
})
export class EventsModule {}
