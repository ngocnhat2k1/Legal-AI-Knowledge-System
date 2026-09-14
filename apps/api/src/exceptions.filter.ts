import { type ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Nest's default handler logs a thrown error whole, and a failed drizzle query's message carries its parameters: when a
 * DB call failed, the tsquery built from the user's question reached the API log (R14). An error that is no HTTP answer
 * is logged by class and driver code only, and answered as Nest answers it.
 */
@Catch()
export class QuietExceptionFilter extends BaseExceptionFilter {
  private readonly log = new Logger('ExceptionsHandler');

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) return super.catch(exception, host);
    const e = (exception ?? {}) as { statusCode?: unknown; message?: unknown; code?: unknown; cause?: { code?: unknown } };
    this.log.error([exception instanceof Error ? exception.constructor.name : typeof exception, e.cause?.code ?? e.code].filter(Boolean).join(' '));
    // An http-errors error (a body the parser refused) keeps its status, as BaseExceptionFilter answers it.
    const status = typeof e.statusCode === 'number' && typeof e.message === 'string' ? e.statusCode : 500;
    super.catch(new HttpException(status === 500 ? 'Internal server error' : String(e.message), status), host);
  }
}
