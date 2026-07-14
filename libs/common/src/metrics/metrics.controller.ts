import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { Registry } from 'prom-client';
import { Public } from '../decorators/public.decorator';
import { METRICS_REGISTRY } from './metrics.constants';

/**
 * Prometheus scrape endpoint. Controlled by config:
 *  - metrics.enabled=false → 404 (endpoint effectively absent)
 *  - metrics.token set     → requires `Authorization: Bearer <token>`
 * When no token is set, keep /metrics reachable only from your internal
 * network / scraper (Railway private networking, VPC, etc.).
 */
@ApiExcludeController()
@Controller()
export class MetricsController {
  constructor(
    @Inject(METRICS_REGISTRY) private readonly registry: Registry,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('metrics')
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (this.config.get<boolean>('metrics.enabled') !== true) {
      throw new NotFoundException();
    }
    const token = this.config.get<string>('metrics.token');
    if (token) {
      const auth = req.headers.authorization ?? '';
      if (!safeEqual(auth, `Bearer ${token}`)) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }
    res.setHeader('Content-Type', this.registry.contentType);
    res.send(await this.registry.metrics());
  }
}

/**
 * Constant-time string compare — avoids leaking the metrics token one byte at a
 * time via response-timing. Length is compared first (unavoidably non-constant),
 * which only reveals the token's length, not its content.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
