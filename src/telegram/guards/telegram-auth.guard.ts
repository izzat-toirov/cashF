import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Frontenddan 'x-telegram-init-data' headerida keladi
    const initData = request.headers['x-telegram-init-data'];

    if (!initData) {
      throw new UnauthorizedException('Telegram maʼlumotlari topilmadi');
    }

    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    
    // 1. initData-ni tekshirish (Hash validatsiyasi)
    if (!this.verifyInitData(initData, botToken)) {
      throw new UnauthorizedException('Xavfsizlik tekshiruvidan o‘tmadi (Invalid hash)');
    }

    // 2. Foydalanuvchi ruxsat berilganlar ro'yxatida borligini tekshirish
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user') || '{}');
    const allowedAdmins = this.configService.get<string>('ALLOWED_ADMINS')?.split(',') || [];

    if (!allowedAdmins.includes(user.id.toString())) {
      throw new UnauthorizedException('Sizga ushbu API-dan foydalanishga ruxsat yo‘q');
    }

    // So'rov ob'ektiga foydalanuvchi ma'lumotlarini qo'shib qo'yamiz
    request.telegramUser = user;
    return true;
  }

  private verifyInitData(initData: string, botToken: string): boolean {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Alfavit tartibida saralash
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Secret key yaratish
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Hashni hisoblash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  }
}