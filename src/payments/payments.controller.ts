import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Headers,
  UnauthorizedException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AsaasWebhookDto } from './dto/asaas-webhook.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Create a new payment
   * POST /payments
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ payment: { limit: 10, ttl: 60000 } }) // 10 payment attempts per minute
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: any,
    @Req() request: Request,
  ) {
    this.logger.log(`Creating payment for order: ${createPaymentDto.orderId} by user: ${user.id}`);

    // Extract remote IP from request if not provided
    if (!createPaymentDto.remoteIp) {
      const remoteIp =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        request.socket.remoteAddress ||
        'unknown';
      createPaymentDto.remoteIp = remoteIp;
    }

    return this.paymentsService.createPayment(createPaymentDto, user.id);
  }

  /**
   * Get payment by ID
   * GET /payments/:id
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`Getting payment: ${id} by user: ${user.id}`);
    return this.paymentsService.findOne(id, user.id, user.role);
  }

  /**
   * Get payment by order ID
   * GET /payments/order/:orderId
   */
  @Get('order/:orderId')
  @UseGuards(JwtAuthGuard)
  async findByOrderId(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    this.logger.log(`Getting payment for order: ${orderId} by user: ${user.id}`);
    return this.paymentsService.findByOrderId(orderId, user.id, user.role);
  }

  /**
   * Cancel a payment
   * DELETE /payments/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`Cancelling payment: ${id} by user: ${user.id}`);
    return this.paymentsService.cancelPayment(id, user.id, user.role);
  }

  /**
   * Sync payment status with ASAAS
   * PATCH /payments/:id/sync
   */
  @Patch(':id/sync')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncStatus(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`Syncing payment status: ${id} by user: ${user.id}`);
    return this.paymentsService.syncPaymentStatus(id, user.id, user.role);
  }

  /**
   * ASAAS Webhook endpoint
   * POST /payments/webhook/asaas
   *
   * This endpoint receives payment status updates from ASAAS
   * It should NOT be protected by JwtAuthGuard as it's called by ASAAS servers
   *
   * SECURITY: Validates webhook signature from ASAAS to ensure authenticity
   */
  @Post('webhook/asaas')
  @HttpCode(HttpStatus.OK)
  async handleAsaasWebhook(
    @Body() webhookData: AsaasWebhookDto,
    @Headers('asaas-access-token') accessToken: string,
    @Req() request: Request,
  ) {
    this.logger.log(`Received ASAAS webhook: ${webhookData.event} for payment ${webhookData.payment.id}`);

    // Extract IP address for security logging
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.socket.remoteAddress ||
      'unknown';

    // Validate webhook signature
    if (!(await this.paymentsService.validateWebhookSignature(accessToken, ipAddress))) {
      this.logger.error('Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    try {
      const result = await this.paymentsService.processWebhook(webhookData);

      this.logger.log(`Webhook processed successfully: ${webhookData.payment.id}`);

      return {
        success: true,
        message: 'Webhook processed successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);

      // Return 200 even on error to prevent ASAAS from retrying
      // Log the error for investigation
      return {
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
      };
    }
  }
}
