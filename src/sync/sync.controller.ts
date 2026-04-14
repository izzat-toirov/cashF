import { Controller, Post, Body, Logger, Param } from '@nestjs/common';
import { SyncService } from './sync.service';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncService: SyncService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Google Sheets-dan maʼlumotlarni sinxronlash' })
  @ApiBody({ type: SyncWebhookDto }) // Swagger uchun aniqlashtirish
  async handleWebhook(@Body() body: SyncWebhookDto) {
    this.logger.log(`Webhook keldi. Body: ${JSON.stringify(body)}`);
    
    const month = body?.monthName;
    if (!month) {
      return { success: false, message: "monthName maydoni yuborilmadi." };
    }
  
    return this.syncService.syncMonthToDatabase(month);
  }
  
  @Post(':monthName') // 2. Dinamik parametr pastda
  async syncMonth(@Param('monthName') monthName: string) {
    if (monthName === 'webhook') {
        return { success: false, message: "Noto'g'ri parametr" };
    }
    return this.syncService.syncMonthToDatabase(monthName);
  }
}