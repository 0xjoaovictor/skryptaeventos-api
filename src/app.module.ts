import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
// import { ScheduleModule } from '@nestjs/schedule'; // Disabled for waitlist-only deployment
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ProductionRouteGuard } from './common/guards/production-route.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { TicketsModule } from './tickets/tickets.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { TicketInstancesModule } from './ticket-instances/ticket-instances.module';
import { CustomFormsModule } from './custom-forms/custom-forms.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { RefundsModule } from './refunds/refunds.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { PromoCodesModule } from './promo-codes/promo-codes.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV
        ? `.env.${process.env.NODE_ENV}`
        : '.env',
      // Fallback to .env if environment-specific file doesn't exist
      // Priority: .env.production > .env.development > .env.test > .env
    }),
    // ScheduleModule.forRoot(), // Disabled for waitlist-only deployment (no background jobs needed)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 seconds
        // High limits for test/dev, strict limits for production
        limit: process.env.NODE_ENV === 'production' ? 60 : 1000,
      },
      {
        name: 'auth',
        ttl: 900000, // 15 minutes
        // High limits for test/dev, strict limits for production
        limit: process.env.NODE_ENV === 'production' ? 5 : 1000,
      },
      {
        name: 'payment',
        ttl: 60000, // 60 seconds
        // High limits for test/dev, strict limits for production
        limit: process.env.NODE_ENV === 'production' ? 10 : 1000,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    TicketsModule,
    OrdersModule,
    PaymentsModule,
    TicketInstancesModule,
    CustomFormsModule,
    SessionsModule,
    AuditLogsModule,
    RefundsModule,
    TicketCategoriesModule,
    PromoCodesModule,
    WaitlistModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ProductionRouteGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
