import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  private readonly monthMap: Record<string, number> = {
    Yanvar: 1,  Fevral: 2,  Mart: 3,    Aprel: 4,
    May: 5,     Iyun: 6,    Iyul: 7,    Avgust: 8,
    Sentabr: 9, Oktabr: 10, Noyabr: 11, Dekabr: 12,
  };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('🚀 SyncService ishga tushdi — Webhook + Cron rejimida tayyor');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TO'G'RI FORMAT: "3-2026-income-6"  (monthNum-year-type-rowNum)
  // ─────────────────────────────────────────────────────────────────────────────
  private generateSheetRowId(
    monthName: string,
    row: number | string,
    type: string,
  ): string {
    const monthNum = this.getMonthNumber(monthName);
    const rowNum   = String(row).replace(/\D+/g, ''); // faqat raqam
    const t        = type.toLowerCase();              // income | expense
    return `${monthNum}-2026-${t}-${rowNum}`;         // "3-2026-income-6"
  }

  private getMonthNumber(monthName: string): number {
    return this.monthMap[monthName] ?? new Date().getMonth() + 1;
  }

  private parseDate(dateStr: string): Date {
    const parts = String(dateStr).split('.');
    if (parts.length === 3) {
      return new Date(+parts[2], +parts[1] - 1, +parts[0]);
    }
    return new Date();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEBHOOK HANDLER
  // ─────────────────────────────────────────────────────────────────────────────
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4 || !row) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      const [dateStr, amount, categoryName, description, rowType] = rowData;
      const transactionType = (rowType || 'expense').toLowerCase();
      const sheetRowId      = this.generateSheetRowId(monthName, row, transactionType);

      // Qator bo'sh kelsa — bazadan o'chirish
      if (!dateStr && !amount && !categoryName) {
        return await this.deleteBySheetRowId(sheetRowId);
      }

      const monthNum  = this.getMonthNumber(monthName);
      const dbDate    = this.parseDate(String(dateStr));
      const parsedAmt = Number(String(amount).replace(/\s/g, '')) || 0;

      // O'zgarish yo'q bo'lsa — skip
      const existing = await this.prisma.transaction.findUnique({
        where: { sheetRowId },
      });
      if (
        existing &&
        existing.amount      === parsedAmt &&
        existing.description === String(description ?? '')
      ) {
        this.logger.log(`⏭️ Skip (o'zgarish yo'q): ${sheetRowId}`);
        return { success: true, message: "O'zgarish yo'q", data: existing };
      }

      const category = await this.prisma.category.upsert({
        where:  { name: categoryName || 'Nomalum' },
        update: {},
        create: { name: categoryName || 'Nomalum', type: transactionType },
      });

      const txData = {
        date:        dbDate,
        amount:      parsedAmt,
        description: String(description ?? ''),
        type:        transactionType,
        month:       monthNum,
        year:        2026,
        categoryId:  category.id,
        sheetRowId,
      };

      const result = await this.prisma.transaction.upsert({
        where:  { sheetRowId },
        update: txData,
        create: txData,
      });

      this.logger.log(`✅ Webhook: ${sheetRowId} | amount=${parsedAmt}`);
      return { success: true, message: 'Sinxronlandi', data: result };

    } catch (error: any) {
      this.logger.error(`Webhook xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CRON — har 20 daqiqada noto'g'ri formatdagi yozuvlarni tozalash
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron('*/20 * * * *')
  async cronCleanupAndValidate() {
    this.logger.log('⏰ Cron: 20 daqiqalik tekshiruv boshlandi');

    const allTx = await this.prisma.transaction.findMany({
      select: { id: true, sheetRowId: true },
    });

    // To'g'ri format: "3-2026-income-6" yoki "3-2026-expense-6"
    const VALID_PATTERN = /^\d+-2026-(income|expense)-\d+$/;

    const invalidIds: string[] = [];

    for (const tx of allTx) {
      if (!tx.sheetRowId || !VALID_PATTERN.test(tx.sheetRowId)) {
        invalidIds.push(tx.id);
        this.logger.warn(`⚠️  Noto'g'ri format: "${tx.sheetRowId}" (id=${tx.id})`);
      }
    }

    if (invalidIds.length === 0) {
      this.logger.log("✅ Cron: Barcha yozuvlar to'g'ri formatda");
      return { deleted: 0 };
    }

    const deleted = await this.prisma.transaction.deleteMany({
      where: { id: { in: invalidIds } },
    });

    this.logger.log(`🧹 Cron: ${deleted.count} ta noto'g'ri yozuv o'chirildi`);
    return { deleted: deleted.count };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // YORDAMCHI: sheetRowId bo'yicha o'chirish
  // ─────────────────────────────────────────────────────────────────────────────
  private async deleteBySheetRowId(sheetRowId: string) {
    try {
      const deleted = await this.prisma.transaction.deleteMany({
        where: { sheetRowId },
      });
      this.logger.log(`🗑️ O'chirildi: ${sheetRowId} | count=${deleted.count}`);
      return { success: true, message: "O'chirildi", deleted: deleted.count };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL: deploy dan keyin bir marta chaqirish uchun
  // ─────────────────────────────────────────────────────────────────────────────
  async runFullCleanup() {
    this.logger.log('🧹 Manual full cleanup boshlandi...');
    return await this.cronCleanupAndValidate();
  }

  async syncCategoryFromSheet(data: { name: string; type: string }) {
    try {
      const result = await this.prisma.category.upsert({
        where:  { name: data.name },
        update: { type: data.type },
        create: { name: data.name, type: data.type },
      });
      this.logger.log(`📂 Category synced: ${result.name} (${result.type})`);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Category sync xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}