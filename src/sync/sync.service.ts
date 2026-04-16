import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  private readonly monthMap: Record<string, number> = {
    Yanvar: 1, Fevral: 2, Mart: 3, Aprel: 4,
    May: 5,    Iyun: 6,  Iyul: 7, Avgust: 8,
    Sentabr: 9, Oktabr: 10, Noyabr: 11, Dekabr: 12,
  };

  // To'g'ri format: "4-2026-expense-row-57"
  private readonly VALID_SHEET_ROW_ID_REGEX = /^\d+-\d{4}-(expense|income)-row-\d+$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sheetsService: GoogleSheetsService,
  ) {}

  async onModuleInit() {
    this.logger.log('SyncService ishga tushdi — Webhook rejimida tayyor');
  }

  // Har 20 daqiqada avtomatik tekshirish
  @Cron('*/1 * * * *')
  async scheduledValidationJob() {
    this.logger.log('20-daqiqalik tekshiruv boshlandi...');
    await this.validateAndCleanAll();
    this.logger.log('20-daqiqalik tekshiruv tugadi');
  }

  async validateAndCleanAll() {
    const results: Record<string, any> = {};
    for (const monthName of Object.keys(this.monthMap)) {
      results[monthName] = await this.validateMonth(monthName);
    }
    return results;
  }

  // Bitta oyni tekshirish: noto'g'ri format => o'chir, keyin Sheets bilan solishtir
  async validateMonth(monthName: string) {
    const monthNum = this.monthMap[monthName];
    if (!monthNum) return { success: false, message: "Noto'g'ri oy nomi" };

    try {
      const allTx = await this.prisma.transaction.findMany({
        where: { month: monthNum, year: 2026 },
        select: { id: true, sheetRowId: true },
      });

      // Noto'g'ri formatdagilarni o'chirish
      const invalidIds = allTx
        .filter(tx => !tx.sheetRowId || !this.VALID_SHEET_ROW_ID_REGEX.test(tx.sheetRowId))
        .map(tx => tx.id);

      if (invalidIds.length > 0) {
        await this.prisma.transaction.deleteMany({ where: { id: { in: invalidIds } } });
        this.logger.warn(`${monthName}: ${invalidIds.length} ta noto'g'ri format o'chirildi`);
      }

      // Sheets bilan solishtirish — faqat Sheets da hech narsa yo'q bo'lmasa o'chirmasin
      const sheetsResult = await this.compareWithSheets(monthName, monthNum);

      return { success: true, invalidDeleted: invalidIds.length, sheetsSync: sheetsResult };
    } catch (error: any) {
      this.logger.error(`validateMonth xatosi (${monthName}): ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // Sheets bilan solishtirish: DB da bor lekin Sheets da yo'q => o'chir
  // MUHIM: Sheets bo'sh kelsa (xato yoki haqiqatan bo'sh) — hech nima o'chirmaymiz
  private async compareWithSheets(monthName: string, monthNum: number) {
    try {
      // getFullMonthData orqali sheets dan ma'lumot olish
      const monthData = await this.sheetsService.getFullMonthData(monthName);

      // Sheets dan ma'lumot kelmasa — xavfsiz tomon: hech nima o'chirmaymiz
      if (!monthData || monthData.totalCount === 0) {
        this.logger.log(`${monthName}: Sheets bo'sh yoki xato — skip`);
        return { skipped: true };
      }

      // getFullMonthData da id: "expense-row-4" (0-based index), lekin
      // haqiqiy sheet row = index + 5 (chunki B5 dan boshlanadi)
      const validSheetRowIds = new Set<string>();

      for (const item of [...monthData.expenses, ...monthData.incomes]) {
        // item.id = "expense-row-4" (0-based) => sheet row = 4 + 5 = 9
        const match = item.id.match(/(\d+)$/);
        if (!match) continue;
        const sheetRow = parseInt(match[1]) + 5;
        const sheetRowId = this.generateSheetRowId(monthName, sheetRow, item.type);
        validSheetRowIds.add(sheetRowId);
      }

      // DB dan o'sha oydagilarni olish
      const dbTx = await this.prisma.transaction.findMany({
        where: { month: monthNum, year: 2026 },
        select: { id: true, sheetRowId: true },
      });

      // DB da bor, Sheets da yo'q => o'chir
      // MUHIM: Faqat to'g'ri formatdagilarini o'chiramiz, noto'g'ri formatdagilar separate validation da o'chiriladi
      const toDelete = dbTx
        .filter(tx => {
          // 1. sheetRowId bo'lishi kerak
          if (!tx.sheetRowId) return false;
          
          // 2. To'g'ri formatda bo'lishi kerak
          if (!this.VALID_SHEET_ROW_ID_REGEX.test(tx.sheetRowId)) return false;
          
          // 3. Sheets da yo'q bo'lishi kerak
          return !validSheetRowIds.has(tx.sheetRowId);
        })
        .map(tx => tx.id);

      if (toDelete.length > 0) {
        await this.prisma.transaction.deleteMany({ where: { id: { in: toDelete } } });
        this.logger.warn(`${monthName}: Sheets da yo'q ${toDelete.length} ta yozuv o'chirildi`);
      }

      return { success: true, deletedOrphans: toDelete.length };
    } catch (error: any) {
      this.logger.warn(`Sheets solishtirish xatosi (${monthName}): ${error.message}`);
      // Xato bo'lsa ham hech nima o'chirmaydi
      return { success: false, message: error.message };
    }
  }

  // ASOSIY: Webhook handler
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4 || !row) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      const [dateStr, amount, categoryName, description, rowType] = rowData;

      // Qator bo'sh kelsa (o'chirilgan) => bazadan ham o'chirish
      if (!dateStr && !amount && !categoryName) {
        return await this.deleteRow(monthName, row, rowType);
      }

      const transactionType = (rowType || 'expense').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, transactionType);
      const monthNum = this.getMonthNumber(monthName);

      // MUHIM: Duplicate oldini olish - bu row uchun allaqachon yozuv borligini tekshiramiz
      const existingSameRow = await this.prisma.transaction.findFirst({
        where: {
          sheetRowId: sheetRowId,
          year: 2026,
          month: monthNum,
        },
        orderBy: { createdAt: 'desc' }
      });

      // Agar shu sheetRowId uchun allaqachon yozuv bo'lsa va ma'lumotlar bir xil bo'lsa skip qilamiz
      if (existingSameRow) {
        const existingAmount = existingSameRow.amount;
        const existingDescription = existingSameRow.description;
        const newAmount = Number(String(amount).replace(/\s/g, '')) || 0;
        const newDescription = String(description || '');

        if (existingAmount === newAmount && existingDescription === newDescription) {
          this.logger.log(`Skip (o'zgarish yo'q): ${sheetRowId}`);
          return { success: true, message: "O'zgarish yo'q", data: existingSameRow };
        }
      }

      const dateParts = String(dateStr).split('.');
      const dbDate =
        dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

      const parsedAmount = Number(String(amount).replace(/\s/g, '')) || 0;

      // O'zgarish yo'q bo'lsa skip
      const existing = await this.prisma.transaction.findUnique({
        where: { sheetRowId },
      });

      if (
        existing &&
        existing.amount === parsedAmount &&
        existing.description === String(description || '')
      ) {
        this.logger.log(`Skip (o'zgarish yo'q): ${sheetRowId}`);
        return { success: true, message: "O'zgarish yo'q", data: existing };
      }

      const category = await this.prisma.category.upsert({
        where: { name: categoryName || 'Nomalum' },
        update: {},
        create: { name: categoryName || 'Nomalum', type: transactionType },
      });

      const txData = {
        date: dbDate,
        amount: parsedAmount,
        description: String(description || ''),
        type: transactionType,
        month: monthNum,
        year: 2026,
        categoryId: category.id,
        sheetRowId,
      };

      const result = await this.prisma.transaction.upsert({
        where: { sheetRowId },
        update: txData,
        create: txData,
      });

      this.logger.log(`Webhook: ${sheetRowId} | amount=${parsedAmount}`);
      return { success: true, message: 'Sinxronlandi', data: result };
    } catch (error: any) {
      this.logger.error(`Webhook xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // Sheets dan qator o'chirilganda bazadan ham o'chirish
  private async deleteRow(monthName: string, row: number | string, rowType?: string) {
    try {
      const type = (rowType || 'expense').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, type);

      const deleted = await this.prisma.transaction.deleteMany({
        where: { sheetRowId },
      });

      this.logger.log(`O'chirildi: ${sheetRowId} | count=${deleted.count}`);
      return { success: true, message: "O'chirildi", deleted: deleted.count };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Format: "4-2026-expense-row-57"  (monthNum-year-type-row-rowNum)
  private generateSheetRowId(monthName: string, row: number | string, type: string): string {
    const monthNum = this.monthMap[monthName] ?? 1;
    const rowNum = String(row).replace(/\D+/g, '');
    return `${monthNum}-2026-${type.toLowerCase()}-row-${rowNum}`;
  }

  private getMonthNumber(monthName: string): number {
    return this.monthMap[monthName] ?? new Date().getMonth() + 1;
  }

  async runFullCleanup() {
    this.logger.log('Manual tozalash boshlandi...');
    const result = await this.validateAndCleanAll();
    this.logger.log('Manual tozalash tugadi');
    return result;
  }

  async syncCategoryFromSheet(data: { name: string; type: string }) {
    try {
      const result = await this.prisma.category.upsert({
        where: { name: data.name },
        update: { type: data.type },
        create: { name: data.name, type: data.type },
      });
      this.logger.log(`Category synced: ${result.name} (${result.type})`);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Category sync xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}