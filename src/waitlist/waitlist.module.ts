import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { WaitlistPrismaService } from './waitlist-prisma.service';

@Module({
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistPrismaService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
