import { Module } from '@nestjs/common';
import { TicketCategoriesService } from './ticket-categories.service';
import { TicketCategoriesController } from './ticket-categories.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TicketCategoriesController],
  providers: [TicketCategoriesService],
  exports: [TicketCategoriesService],
})
export class TicketCategoriesModule {}
