import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  // ✅ Sheet nomi → oy raqami xaritasi
  private readonly monthMap: Record<string, number> = {
    Yanvar: 1,
    Fevral: 2,
    Mart: 3,
    Aprel: 4,
    May: 5,
    Iyun: 6,
    Iyul: 7,
    Avgust: 8,
    Sentabr: 9,
    Oktabr: 10,
    Noyabr: 11,
    Dekabr: 12,
  };

  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.startPolling(60_000); // Har minutda tekshirish
  }

  // ✅ ID yaratish standarti: Dublikatni oldini olish uchun yagona kalit
  private generateSheetRowId(
    month: string,
    row: number | string,
    type: string,
  ): string {
    return `${month}-2026-${type.toLowerCase()}-row-${row}`;
  }

  // ✅ monthName dan oy raqamini olish (xato bo'lsa sana asosida fallback)
  private getMonthNumber(monthName: string, fallbackDate: Date): number {
    return this.monthMap[monthName] ?? fallbackDate.getMonth() + 1;
  }

  private startPolling(intervalMs: number) {
    setInterval(async () => {
      const monthNames = Object.keys(this.monthMap);
      const month = monthNames[new Date().getMonth()];
      try {
        await this.syncMonthToDatabase(month);
      } catch (e: any) {
        this.logger.error(`Polling xatosi: ${e.message}`);
      }
    }, intervalMs);
  }

  /**
   * WEBHOOK: Faqat o'zgargan qatorni bazaga yozish (yoki yangilash)
   */
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4 || !row) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      // rowData: [date, amount, category, description, type]
      const [dateStr, amount, categoryName, description, rowType] = rowData;

      const transactionType = (rowType || 'expense').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, transactionType);

      const dateParts = String(dateStr).split('.');
      const dbDate =
        dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

      // ✅ FIX: monthNum ni sanadan emas, sheet nomidan olamiz
      // Masalan: sheet "Mart" bo'lsa, sana "30.05.2026" bo'lsa ham → month = 3
      const monthNum = this.getMonthNumber(monthName, dbDate);

      // 1. Kategoriyani Upsert qilish
      const category = await this.prisma.category.upsert({
        where: { name: categoryName || 'Nomalum' },
        update: {},
        create: { name: categoryName || 'Nomalum', type: transactionType },
      });

      // 2. Transaksiyani UPSERT qilish
      const txData = {
        date: dbDate,
        amount: Number(String(amount).replace(/\s/g, '')) || 0,
        description: String(description || ''),
        type: transactionType,
        month: monthNum, // ✅ Sheet nomidan olingan to'g'ri oy
        year: 2026,
        categoryId: category.id,
        sheetRowId: sheetRowId,
      };

      const result = await this.prisma.transaction.upsert({
        where: { sheetRowId: sheetRowId },
        update: txData,
        create: txData,
      });

      this.logger.log(
        `✅ Saqlandi: ${sheetRowId} | month=${monthNum} | amount=${txData.amount}`,
      );

      return {
        success: true,
        message: 'Muvaffaqiyatli sinxronlandi',
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Webhook xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * FULL SYNC (Polling): To'liq listni tekshirish
   */
  async syncMonthToDatabase(monthName: string) {
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data) return;

      const allRecords = [
        ...(data.expenses || []).map((r) => ({ ...r, type: 'expense' })),
        ...(data.incomes || []).map((r) => ({ ...r, type: 'income' })),
      ].filter((r) => r.id);

      // ✅ FIX: monthNum ni bir marta, sheet nomidan olamiz
      const monthNum = this.monthMap[monthName];
      if (!monthNum) {
        this.logger.warn(`Noto'g'ri oy nomi: ${monthName}`);
        return;
      }

      for (const record of allRecords) {
        const type = record.type.toLowerCase();
        const sheetRowId = this.generateSheetRowId(monthName, record.id, type);

        const dateParts = record.date?.split('.') || [];
        const dbDate =
          dateParts.length === 3
            ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
            : new Date();

        const category = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { name: record.category || 'Nomalum', type: type },
        });

        const txData = {
          date: dbDate,
          amount: Number(String(record.amount).replace(/\s/g, '')) || 0,
          description: record.description || '',
          type: type,
          month: monthNum, // ✅ Sheet nomidan olingan to'g'ri oy
          year: 2026,
          categoryId: category.id,
          sheetRowId,
        };

        await this.prisma.transaction.upsert({
          where: { sheetRowId },
          update: txData,
          create: txData,
        });
      }

      this.logger.log(
        `✅ Full sync: ${monthName} | ${allRecords.length} ta yozuv`,
      );
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Sync xatosi: ${error.message}`);
    }
  }
}