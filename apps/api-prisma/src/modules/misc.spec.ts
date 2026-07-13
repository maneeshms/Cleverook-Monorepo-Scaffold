import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../health/health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController (prisma)', () => {
  it('liveness answers without dependencies', () => {
    const controller = new HealthController({} as never);
    expect(controller.liveness().status).toBe('ok');
  });

  it('readiness reports database up/down', async () => {
    const up = new HealthController({
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    } as never);
    await expect(up.readiness()).resolves.toMatchObject({
      details: { database: { status: 'up' } },
    });
    const down = new HealthController({
      $queryRaw: jest.fn().mockRejectedValue(new Error('conn refused')),
    } as never);
    await expect(down.readiness()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('PrismaService', () => {
  it('refuses to construct without a connection URL', () => {
    expect(() => new PrismaService({ get: () => undefined } as never)).toThrow(
      /PRISMA_DATABASE_URL/,
    );
  });

  it('connects on init and disconnects on destroy', async () => {
    const service = new PrismaService({
      get: () => 'postgresql://postgres:postgres@localhost:5432/x',
    } as never);
    const connect = jest.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
