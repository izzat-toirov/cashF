import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf;
  private static  isRunning = false; // ← qo'sh

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.bot = new Telegraf(token);
    this.initBotCommands();
  }

  async onModuleInit() {
    if (TelegramService.isRunning) return; // ← ikkinchi marta ishga tushmaydi
    TelegramService.isRunning = true;

    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (webhookUrl && nodeEnv === 'production') {
      try {
        await this.bot.telegram.setWebhook(`${webhookUrl}/api/telegram/webhook`);
        console.log('Webhook set:', `${webhookUrl}/api/telegram/webhook`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Webhook set error:', message);
      }
    } else {
      try {
        await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('Webhook deleted');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Delete webhook error:', message);
      }
      this.bot.launch().catch(err => console.error('Bot launch error:', err));
      console.log('Bot started with long polling');
    }
  }

  onModuleDestroy() {
    TelegramService.isRunning = false; // ← reset qil
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      this.bot.stop();
    }
  }

  private initBotCommands() {
    const webAppUrl = this.configService.get<string>('WEB_APP_URL') || '';
    const allowedAdminsStr = this.configService.get<string>('ALLOWED_ADMINS') || '';
    const allowedAdmins = allowedAdminsStr.split(',');

    this.bot.command('start', (ctx) => {
      const userId = ctx.from.id.toString();
      if (allowedAdmins.includes(userId)) {
        return ctx.reply('Xush kelibsiz! Siz uchun Web App ochiq:',
          Markup.inlineKeyboard([
            [Markup.button.webApp('Ilovani ochish', webAppUrl)]
          ])
        );
      }
      return ctx.reply('Xush kelibsiz! (Sizga ilovadan foydalanishga ruxsat berilmagan)');
    });

    this.bot.command('admin', (ctx) => {
      const userId = ctx.from.id.toString();
      if (allowedAdmins.includes(userId)) {
        return ctx.reply('Admin Panel:',
          Markup.inlineKeyboard([
            [Markup.button.webApp('Admin Panelni ochish', `${webAppUrl}/admin`)]
          ])
        );
      }
      return ctx.reply('Kechirasiz, siz admin emassiz.');
    });
  }

  async handleWebhook(body: any) {
    await this.bot.handleUpdate(body);
  }

  create() { return 'added'; }
  findAll() { return 'all'; }
  findOne(id: number) { return id; }
  update() { return 'updated'; }
  remove() { return 'removed'; }
}