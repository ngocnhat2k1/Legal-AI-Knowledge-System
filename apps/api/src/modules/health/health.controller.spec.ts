import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService, type HealthReport } from './health.service';

describe('HealthController', () => {
  it('returns the report produced by HealthService', async () => {
    const report: HealthReport = { status: 'ok', db: 'up', pgvector: '0.8.0' };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check: async () => report } }],
    }).compile();

    const controller = moduleRef.get(HealthController);

    await expect(controller.check()).resolves.toEqual(report);
  });
});
