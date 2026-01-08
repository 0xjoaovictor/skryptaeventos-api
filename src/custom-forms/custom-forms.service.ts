import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCustomFormFieldDto } from './dto/create-custom-form-field.dto';
import { UpdateCustomFormFieldDto } from './dto/update-custom-form-field.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CustomFormsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateCustomFormFieldDto, userId: string, userRole: UserRole) {
    // Check if event exists and user has permission
    const event = await this.prisma.event.findUnique({
      where: { id: createDto.eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Check permissions
    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to add fields to this event');
    }

    // Check if field with same name already exists for this event
    const existingField = await this.prisma.customFormField.findUnique({
      where: {
        eventId_fieldName: {
          eventId: createDto.eventId,
          fieldName: createDto.fieldName,
        },
      },
    });

    if (existingField) {
      throw new ConflictException(
        `A field with name "${createDto.fieldName}" already exists for this event`,
      );
    }

    // If displayOrder not provided, set it to max + 1
    if (createDto.displayOrder === undefined) {
      const maxOrder = await this.prisma.customFormField.findFirst({
        where: { eventId: createDto.eventId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });

      createDto.displayOrder = maxOrder ? maxOrder.displayOrder + 1 : 0;
    }

    return this.prisma.customFormField.create({
      data: {
        ...createDto,
        configuration: createDto.configuration || {},
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async findAll(eventId?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const where = eventId ? { eventId } : {};

    const [fields, total] = await Promise.all([
      this.prisma.customFormField.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ eventId: 'asc' }, { displayOrder: 'asc' }],
        include: {
          event: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      this.prisma.customFormField.count({ where }),
    ]);

    return {
      data: fields,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const field = await this.prisma.customFormField.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            organizerId: true,
          },
        },
      },
    });

    if (!field) {
      throw new NotFoundException('Custom form field not found');
    }

    return field;
  }

  async findByEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.customFormField.findMany({
      where: { eventId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async update(
    id: string,
    updateDto: UpdateCustomFormFieldDto,
    userId: string,
    userRole: UserRole,
  ) {
    const field = await this.findOne(id);

    // Check permissions
    if (userRole !== UserRole.ADMIN && field.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this field');
    }

    return this.prisma.customFormField.update({
      where: { id },
      data: updateDto,
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const field = await this.findOne(id);

    // Check permissions
    if (userRole !== UserRole.ADMIN && field.event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this field');
    }

    await this.prisma.customFormField.delete({
      where: { id },
    });

    return { message: 'Custom form field deleted successfully' };
  }

  async reorder(eventId: string, fieldIds: string[], userId: string, userRole: UserRole) {
    // Check if event exists and user has permission
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    if (userRole !== UserRole.ADMIN && event.organizerId !== userId) {
      throw new ForbiddenException('You do not have permission to reorder fields for this event');
    }

    // Update display order for each field
    const updatePromises = fieldIds.map((fieldId, index) =>
      this.prisma.customFormField.updateMany({
        where: {
          id: fieldId,
          eventId: eventId,
        },
        data: {
          displayOrder: index,
        },
      }),
    );

    await Promise.all(updatePromises);

    return this.findByEvent(eventId);
  }
}
