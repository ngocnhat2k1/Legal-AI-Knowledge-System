import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { type AnswerRequest, type AnswerResponse, AnswerService } from './answer.service';

/**
 * POST /answer — the composed answer path (plan 08 §2.4): `planOnly` returns the plan and code roles; with the plan sent
 * back, retrieval, compose, guards and repair. Internal surface for the Zalo bot, same trust boundary as /conversation.
 */
@Controller('answer')
export class AnswerController {
  constructor(private readonly answers: AnswerService) {}

  @Post()
  @HttpCode(200)
  answer(@Body() body: AnswerRequest): Promise<AnswerResponse> {
    return this.answers.answer(body ?? ({} as AnswerRequest));
  }
}
