import { Module } from '@nestjs/common';
import { CustomFormsService } from './custom-forms.service';
import { CustomFormsController } from './custom-forms.controller';

@Module({
  controllers: [CustomFormsController],
  providers: [CustomFormsService],
  exports: [CustomFormsService],
})
export class CustomFormsModule {}
