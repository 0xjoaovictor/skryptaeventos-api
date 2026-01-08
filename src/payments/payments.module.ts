import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AsaasService } from './asaas.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ConfigModule, EmailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, AsaasService],
  exports: [PaymentsService, AsaasService],
})
export class PaymentsModule {}
