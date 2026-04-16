import { Controller, Post, Body, Logger, Param, Delete } from '@nestjs/common';
import { SyncService } from './sync.service';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly syncService: SyncService) {}

  // ✅ ASOSIY: Google Sheets onEdit → bu endpoint
  @Post('webhook')
  @ApiOperation({ summary: 'Google Sheets onEdit — bitta qatorni sinxronlash' })
  @ApiBody({ type: SyncWebhookDto })
  async handleWebhook(@Body() body: SyncWebhookDto) {
    this.logger.log(`📥 Webhook: ${JSON.stringify(body)}`);

    if (!body?.monthName) {
      return { success: false, message: 'monthName yuborilmadi' };
    }

    // ✅ syncSingleRow — webhook uchun to'g'ri metod
    return this.syncService.syncSingleRow(body);
  }

  // 🧹 Cleanup — bir marta ishlatish (Swagger yoki Postman orqali)
  @Delete('cleanup/:monthName')
  @ApiOperation({ summary: "Noto'g'ri sheetRowId larni o'chirish" })
  cleanupDuplicates(@Param('monthName') monthName: string) {
    return this.syncService.cleanupDuplicates(monthName);
  }

  @Post('category')
async syncCategory(@Body() body: { name: string; type: string }) {
  return this.syncService.syncCategoryFromSheet(body);
}
}