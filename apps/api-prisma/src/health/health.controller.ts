import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@clevscaffold/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness never touches dependencies; readiness proves the DB answers.
 * (The TypeORM app uses Terminus for the same contract — this shows the
 * hand-rolled minimal variant.)
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', details: { database: { status: 'up' } } };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        details: { database: { status: 'down' } },
      });
    }
  }
}
