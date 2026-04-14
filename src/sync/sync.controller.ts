import { Controller, Post, Body, Logger, Param } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncService: SyncService) {}

  // Manual trigger: POST /sync/:monthName
  @Post(':monthName')
  async syncMonth(@Param('monthName') monthName: string) {
    return this.syncService.syncMonthToDatabase(monthName);
  }

  // Webhook: Google Sheets Apps Script shu endpointga POST qiladi
  @Post('webhook')
  async handleWebhook(@Body() body: { monthName: string }) {
    this.logger.log(`Webhook keldi: ${body.monthName}`);

    if (!body.monthName) {
      return { success: false, message: 'monthName majburiy' };
    }

    return this.syncService.syncMonthToDatabase(body.monthName);
  }
}