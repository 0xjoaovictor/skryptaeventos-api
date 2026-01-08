import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventStatus } from '@prisma/client';

@Injectable()
export class EventsSchedulerService {
  private readonly logger = new Logger(EventsSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run every hour to update event statuses based on dates
   * - DRAFT -> PUBLISHED when salesStartsAt is reached
   * - PUBLISHED -> ENDED when endsAt is passed
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateEventStatuses() {
    this.logger.log('Running event status update job...');

    try {
      const now = new Date();
      let updatedCount = 0;

      // Find events that should transition to ENDED (active events that have passed their end date)
      const eventsToEnd = await this.prisma.event.findMany({
        where: {
          status: EventStatus.ACTIVE,
          endsAt: {
            lte: now,
          },
        },
      });

      if (eventsToEnd.length > 0) {
        await this.prisma.event.updateMany({
          where: {
            id: {
              in: eventsToEnd.map((e) => e.id),
            },
          },
          data: {
            status: EventStatus.ENDED,
          },
        });

        updatedCount += eventsToEnd.length;
        this.logger.log(`Marked ${eventsToEnd.length} events as ENDED`);
      }

      // Find draft events that should auto-publish (if salesStartsAt is reached)
      // Note: This is optional - you might want organizers to manually publish
      // Commenting out for now, but keeping the logic for reference
      /*
      const eventsToPublish = await this.prisma.event.findMany({
        where: {
          status: EventStatus.DRAFT,
          salesStartsAt: {
            lte: now,
          },
        },
      });

      if (eventsToPublish.length > 0) {
        await this.prisma.event.updateMany({
          where: {
            id: {
              in: eventsToPublish.map((e) => e.id),
            },
          },
          data: {
            status: EventStatus.PUBLISHED,
          },
        });

        updatedCount += eventsToPublish.length;
        this.logger.log(`Auto-published ${eventsToPublish.length} events`);
      }
      */

      if (updatedCount === 0) {
        this.logger.debug('No event status updates needed');
      } else {
        this.logger.log(`Total events updated: ${updatedCount}`);
      }
    } catch (error) {
      this.logger.error('Error updating event statuses:', error);
    }
  }
}
