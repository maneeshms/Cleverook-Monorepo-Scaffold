import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '@clevscaffold/common';

/**
 * Liveness (GET /health) answers "is the process up" and never touches
 * dependencies; readiness (GET /health/ready) checks the DB so load balancers
 * and rolling deploys only route traffic to instances that can serve it.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 3000 })]);
  }

  /** Lightweight snapshot for external monitors (full metrics: GET /metrics). */
  @Public()
  @Get('info')
  info() {
    const mem = process.memoryUsage();
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      memoryMB: {
        rss: +(mem.rss / 1_048_576).toFixed(1),
        heap: +(mem.heapUsed / 1_048_576).toFixed(1),
      },
      nodeVersion: process.version,
    };
  }
}
