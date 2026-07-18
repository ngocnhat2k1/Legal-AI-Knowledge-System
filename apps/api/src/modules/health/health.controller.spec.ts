import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService, type HealthReport } from './health.service';

async function controllerWith(report: HealthReport): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthService, useValue: { check: async () => report } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns the report with 200 when healthy', async () => {
    const report: HealthReport = { status: 'ok', db: 'up', pgvector: '0.8.0' };
    const controller = await controllerWith(report);
    await expect(controller.check()).resolves.toEqual(report);
  });

  it('fails the check with 503 when degraded', async () => {
    const report: HealthReport = { status: 'degraded', db: 'down', pgvector: null };
    const controller = await controllerWith(report);
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
