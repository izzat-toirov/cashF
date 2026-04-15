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
    this.startPolling(60_000); // Har minutda tekshirish
  }

  // ✅ ID yaratish standarti: Dublikatni oldini olish uchun yagona kalit
  private generateSheetRowId(month: string, row: number | string, type: string): string {
    return `${month}-2026-${type.toLowerCase()}-row-${row}`;
  }

  private startPolling(intervalMs: number) {
    setInterval(async () => {
      const monthMap = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
      const month = monthMap[new Date().getMonth()];
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
      const dbDate = dateParts.length === 3
        ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
        : new Date();

      const monthNum = dbDate.getMonth() + 1;

      // 1. Kategoriyani Upsert qilish
      const category = await this.prisma.category.upsert({
        where: { name: categoryName || 'Nomalum' },
        update: {}, // O'zgartirmaymiz
        create: { name: categoryName || 'Nomalum', type: transactionType }
      });

      // 2. Transaksiyani UPSERT qilish (Eskisi bo'lsa yangilaydi, yo'q bo'lsa qo'shadi)
      const txData = {
        date: dbDate,
        amount: Number(String(amount).replace(/\s/g, '')) || 0,
        description: String(description || ''),
        type: transactionType,
        month: monthNum,
        year: 2026,
        categoryId: category.id,
        sheetRowId: sheetRowId // Mana shu ID dublikatdan saqlaydi
      };

      const result = await this.prisma.transaction.upsert({
        where: { sheetRowId: sheetRowId },
        update: txData,
        create: txData
      });

      return { success: true, message: "Muvaffaqiyatli sinxronlandi", data: result };
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
        ...(data.expenses || []).map(r => ({ ...r, type: 'expense' })),
        ...(data.incomes || []).map(r => ({ ...r, type: 'income' })),
      ].filter(r => r.id);

      for (const record of allRecords) {
        const type = record.type.toLowerCase();
        const sheetRowId = this.generateSheetRowId(monthName, record.id, type);
        
        const dateParts = record.date?.split('.') || [];
        const dbDate = dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

        const category = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { name: record.category || 'Nomalum', type: type }
        });

        const txData = {
          date: dbDate,
          amount: Number(String(record.amount).replace(/\s/g, '')) || 0,
          description: record.description || '',
          type: type,
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
    } catch (error: any) {
      this.logger.error(`Sync xatosi: ${error.message}`);
    }
  }
}