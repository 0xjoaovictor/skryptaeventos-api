import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('waitlist')
export class WaitlistController {
  private readonly logger = new Logger(WaitlistController.name);

  constructor(private readonly waitlistService: WaitlistService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createWaitlistDto: CreateWaitlistDto) {
    this.logger.log(`Waitlist submission from: ${createWaitlistDto.email}`);
    return this.waitlistService.create(createWaitlistDto);
  }
}
