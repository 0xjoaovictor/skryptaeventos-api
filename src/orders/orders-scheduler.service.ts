import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersSchedulerService {
  private readonly logger = new Logger(OrdersSchedulerService.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Run every 5 minutes to check for expired orders
   * Orders expire 15 minutes after creation, so checking every 5 minutes is sufficient
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredOrders() {
    this.logger.log('Running expired orders cleanup job...');

    try {
      const result = await this.ordersService.releaseExpiredOrders();

      if (result.count > 0) {
        this.logger.log(`Successfully released ${result.count} expired orders`);
      } else {
        this.logger.debug('No expired orders found');
      }
    } catch (error) {
      this.logger.error('Error releasing expired orders:', error);
    }
  }
}
