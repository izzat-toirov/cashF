import { Controller, Post, Body, Logger, Delete } from '@nestjs/common';
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

    return this.syncService.syncSingleRow(body);
  }

  // 🧹 Cleanup — bir marta ishlatish (Swagger yoki Postman orqali)
  @Delete('cleanup')
  @ApiOperation({ summary: "Noto'g'ri sheetRowId larni o'chirish (barcha oylar)" })
  runFullCleanup() {
    return this.syncService.runFullCleanup();
  }

  @Post('category')
  async syncCategory(@Body() body: { name: string; type: string }) {
    return this.syncService.syncCategoryFromSheet(body);
  }

  // Qo'lda yozuvlarni o'chirish
  @Delete('delete-by-ids')
  @ApiOperation({ summary: "SheetRowIds bo'yicha yozuvlarni o'chirish" })
  async deleteBySheetRowIds(@Body() body: { sheetRowIds: string[] }) {
    return this.syncService.deleteBySheetRowIds(body.sheetRowIds);
  }
}