import { BadRequestException, Logger } from '@nestjs/common';

import { QuietExceptionFilter } from './exceptions.filter';

class DrizzleQueryError extends Error {}

describe('QuietExceptionFilter — no user text in the API log (R14)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a failed query by class and code only, never its parameters, and answers a bare 500; an HTTP error is answered as thrown', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const reply = jest.fn();
    const filter = new QuietExceptionFilter({ reply, isHeadersSent: () => false, end: jest.fn() } as never);
    const host = { getArgByIndex: () => ({}) } as never;

    const failed = Object.assign(new DrizzleQueryError('Failed query: select 1\nparams: 2026-09-14,thời | hạn | nộp | thuế'), { cause: { code: '22008' } });
    filter.catch(failed, host);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('DrizzleQueryError 22008');
    expect(reply).toHaveBeenCalledWith({}, { statusCode: 500, message: 'Internal server error' }, 500);

    filter.catch(new BadRequestException('q must be a non-empty string'), host);
    expect(reply).toHaveBeenLastCalledWith({}, expect.objectContaining({ statusCode: 400, message: 'q must be a non-empty string' }), 400);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
