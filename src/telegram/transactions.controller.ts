import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { TelegramAuthGuard } from './guards/telegram-auth.guard';

interface RequestWithUser extends Request {
  telegramUser?: any;
}

@Controller('transactions')
export class TransactionsController {
  @Get()
  @UseGuards(TelegramAuthGuard)
  findAll(@Req() req: RequestWithUser) {
    const user = req.telegramUser;
    return { message: `Foydalanuvchi ID: ${user?.id}` };
  }
}