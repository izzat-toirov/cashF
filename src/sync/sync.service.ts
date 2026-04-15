import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.startPolling(60_000);
  }

  // ✅ ID yaratish uchun yagona standart funksiya (Dublikat oldini olish uchun eng muhimi)
  private generateSheetRowId(month: string, row: number | string, type: string): string {
    return `${month}-2026-${type.toLowerCase()}-row-${row}`;
  }

  private startPolling(intervalMs: number) {
    setInterval(async () => {
      const monthMap = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
      const month = monthMap[new Date().getMonth()];
      try {
        await this.syncMonthToDatabase(month);
      } catch (e) {
        this.logger.error(`Polling xatosi: ${e.message}`);
      }
    }, intervalMs);
  }

  /**
   * WEBHOOK: Apps Scriptdan kelgan bitta qatorni sinxronlash
   */
  async syncSingleRow(dto: any) {
    const { monthName, rowData, row, type } = dto; // Apps Scriptdan 'type' ham keladi (EXPENSE/INCOME)

    if (!rowData || rowData.length < 4) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      // Apps Script yuborayotgan massiv: [date, amount, category, description, type]
      const [dateStr, amount, categoryName, description, rowType] = rowData;
      
      const transactionType = (rowType || type || 'EXPENSE').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, transactionType);

      const dateParts = String(dateStr).split('.');
      const dbDate = dateParts.length === 3
        ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
        : new Date();

      // 1. Kategoriyani topish yoki yaratish
      const category = await this.prisma.category.upsert({
        where: { name: categoryName || 'Nomalum' },
        update: {},
        create: { name: categoryName || 'Nomalum', type: transactionType }
      });

      // 2. Transaksiyani UPSERT qilish
      const txData = {
        date: dbDate,
        amount: Number(amount) || 0,
        description: String(description || ''),
        type: transactionType,
        month: new Date(dbDate).getMonth() + 1,
        year: 2026,
        categoryId: category.id,
        sheetRowId: sheetRowId
      };

      const result = await this.prisma.transaction.upsert({
        where: { sheetRowId },
        update: txData,
        create: txData
      });

      return { success: true, message: "Muvaffaqiyatli yangilandi", data: result };
    } catch (error) {
      this.logger.error(`Single row error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * POLLING: To'liq listni sinxronlash
   */
  async syncMonthToDatabase(monthName: string) {
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data) return;

      const allRecords = [
        ...(data.expenses || []).map(r => ({ ...r, type: 'expense' })),
        ...(data.incomes || []).map(r => ({ ...r, type: 'income' })),
      ].filter(r => r.id);

      for (const record of allRecords) {
        // ✅ Webhook bilan bir xil ID generatsiya qilinadi
        const sheetRowId = this.generateSheetRowId(monthName, record.id, record.type);
        
        const dateParts = record.date?.split('.') || [];
        const dbDate = dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

        const category = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { name: record.category || 'Nomalum', type: record.type }
        });

        const txData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: record.type,
          month: dbDate.getMonth() + 1,
          year: 2026,
          categoryId: category.id,
          sheetRowId
        };

        await this.prisma.transaction.upsert({
          where: { sheetRowId },
          update: txData,
          create: txData
        });
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Sync error: ${error.message}`);
    }
  }
}