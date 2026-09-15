import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService, type HealthReport } from './health.service';

const check = jest.fn<Promise<HealthReport>, [boolean?]>();

async function controllerWith(report: HealthReport): Promise<HealthController> {
  check.mockReset().mockResolvedValue(report);
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthService, useValue: { check } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns the report with 200 when healthy', async () => {
    const report: HealthReport = { status: 'ok', db: 'up', pgvector: '0.8.0', llm: 'up' };
    const controller = await controllerWith(report);
    await expect(controller.check()).resolves.toEqual(report);
  });

  it('fails the check with 503 when degraded', async () => {
    const report: HealthReport = { status: 'degraded', db: 'down', pgvector: null, llm: 'up' };
    const controller = await controllerWith(report);
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  /**
   * The deterministic half of the product must survive the model layer being absent —
   * that is the whole point of keeping tariff numbers out of a model's reach. A 503
   * here would take tariff lookup and the web UI down over a missing CLI.
   */
  it('stays 200 when the model layer is missing but the database is fine', async () => {
    const report: HealthReport = { status: 'ok', db: 'up', pgvector: '0.8.0', llm: 'no_token' };
    const controller = await controllerWith(report);
    await expect(controller.check()).resolves.toEqual(report);
  });

  /** The cheap probe stays the default: a plain /health must not spawn anything. */
  it('asks for the deep model check only when ?llm=deep says so', async () => {
    const controller = await controllerWith({ status: 'ok', db: 'up', pgvector: '0.8.0', llm: 'up' });
    await controller.check();
    expect(check).toHaveBeenCalledWith(false);
    await controller.check('deep');
    expect(check).toHaveBeenLastCalledWith(true);
    await controller.check('cheap');
    expect(check).toHaveBeenLastCalledWith(false);
  });

  /**
   * A spent subscription is exactly what the deep probe is for, and exactly what must NOT
   * take the service out of the load balancer: tariff lookup and the web UI need no model.
   */
  it('stays 200 when the deep probe reports quota', async () => {
    const report: HealthReport = { status: 'ok', db: 'up', pgvector: '0.8.0', llm: 'up', llmDeep: 'quota' };
    const controller = await controllerWith(report);
    await expect(controller.check('deep')).resolves.toEqual(report);
  });
});
