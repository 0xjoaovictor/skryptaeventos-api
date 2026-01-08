import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { WaitlistPrismaService } from './waitlist-prisma.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private waitlistPrisma: WaitlistPrismaService) {}

  async create(createWaitlistDto: CreateWaitlistDto) {
    const { email, churchName, responsibleName, whatsapp, city } = createWaitlistDto;

    // Check if email already exists in waitlist
    const existingEntry = await this.waitlistPrisma.waitlist.findFirst({
      where: { email },
    });

    if (existingEntry) {
      throw new ConflictException('Este email já está na lista de espera');
    }

    // Create waitlist entry
    const waitlistEntry = await this.waitlistPrisma.waitlist.create({
      data: {
        churchName,
        responsibleName,
        email,
        whatsapp,
        city,
      },
    });

    this.logger.log(`New waitlist entry created: ${email} - ${churchName}`);

    return {
      message: 'Cadastro realizado com sucesso! Entraremos em contato em breve.',
      data: {
        id: waitlistEntry.id,
        email: waitlistEntry.email,
        churchName: waitlistEntry.churchName,
        createdAt: waitlistEntry.createdAt,
      },
    };
  }

  async findAll() {
    return this.waitlistPrisma.waitlist.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async count() {
    return this.waitlistPrisma.waitlist.count();
  }
}
