import { Controller, Post, Body, Logger, Param } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncService: SyncService) {}

  @Post('webhook') // 1. Bu har doim tepada tursin
  async handleWebhook(@Body() body: any) { // Body'ni 'any' qilib tekshiramiz
    this.logger.log(`Webhook keldi. Body: ${JSON.stringify(body)}`);

    // Google Sheets Apps Script odatda 'monthName' kaliti bilan yuboradi
    const month = body?.monthName;

    if (!month || month === 'webhook') {
      return { 
        success: false, 
        message: "O'y nomi (monthName) topilmadi yoki xato" 
      };
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