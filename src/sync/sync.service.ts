import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  private readonly monthMap: Record<string, number> = {
    Yanvar: 1, Fevral: 2, Mart: 3, Aprel: 4,
    May: 5,    Iyun: 6,  Iyul: 7, Avgust: 8,
    Sentabr: 9, Oktabr: 10, Noyabr: 11, Dekabr: 12,
  };

  constructor(private readonly prisma: PrismaService) {}

  // ✅ Polling YO'Q — faqat eski yozuvlarni tozalash
  async onModuleInit() {
    this.logger.log('🚀 SyncService ishga tushdi — cleanup boshlandi');
    for (const month of Object.keys(this.monthMap)) {
      await this.cleanupDuplicates(month);
    }
    this.logger.log('✅ Cleanup tugadi — webhook rejimida ishlayapti');
  }

  // YANGI (to'g'ri format — cleanup o'chirmaydi)
private generateSheetRowId(monthName: string, row: number | string, type: string): string {
  const rowNum = String(row).replace(/\D+/g, '');
  return `${monthName}-2026-${type.toLowerCase()}-${rowNum}`;  // "row-" yo'q
}

  private getMonthNumber(monthName: string): number {
    return this.monthMap[monthName] ?? new Date().getMonth() + 1;
  }

  // ✅ ASOSIY: Webhook handler
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4 || !row) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      const [dateStr, amount, categoryName, description, rowType] = rowData;

      // ✅ Qator bo'sh kelsa (o'chirilgan) — bazadan ham o'chirish
      if (!dateStr && !amount && !categoryName) {
        return await this.deleteRow(monthName, row, rowType);
      }

      const transactionType = (rowType || 'expense').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, transactionType);
      const monthNum = this.getMonthNumber(monthName);

      const dateParts = String(dateStr).split('.');
      const dbDate =
        dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

      const parsedAmount = Number(String(amount).replace(/\s/g, '')) || 0;

      // ✅ O'zgarish yo'q bo'lsa skip
      const existing = await this.prisma.transaction.findUnique({
        where: { sheetRowId },
      });
      if (existing && existing.amount === parsedAmount && 
          existing.description === String(description || '')) {
        this.logger.log(`⏭️ Skip (o'zgarish yo'q): ${sheetRowId}`);
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

      this.logger.log(`✅ Webhook: ${sheetRowId} | amount=${parsedAmount}`);
      return { success: true, message: 'Sinxronlandi', data: result };

    } catch (error: any) {
      this.logger.error(`Webhook xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ✅ Sheets dan qator o'chirilganda bazadan ham o'chirish
  private async deleteRow(monthName: string, row: number | string, rowType?: string) {
    try {
      const type = (rowType || 'expense').toLowerCase();
      const sheetRowId = this.generateSheetRowId(monthName, row, type);

      const deleted = await this.prisma.transaction.deleteMany({
        where: { sheetRowId },
      });

      this.logger.log(`🗑️ O'chirildi: ${sheetRowId} | count=${deleted.count}`);
      return { success: true, message: "O'chirildi", deleted: deleted.count };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // 🧹 Eski noto'g'ri formatdagi yozuvlarni tozalash
  async cleanupDuplicates(monthName: string) {
    try {
      const monthNum = this.monthMap[monthName];
      if (!monthNum) return { success: false, message: "Noto'g'ri oy" };

      const all = await this.prisma.transaction.findMany({
        where: { month: monthNum, year: 2026 },
        select: { id: true, sheetRowId: true },
      });

      const toDelete = all
        .filter(tx => {
          const sid = tx.sheetRowId || '';
          return (
            /^\d+-2026-/.test(sid) ||                    // "3-2026-..."
            sid.includes('-row-expense-row-') ||          // ikkilangan
            sid.includes('-row-income-row-')
          );
        })
        .map(tx => tx.id);

      if (toDelete.length === 0) {
        this.logger.log(`✅ Cleanup: ${monthName} — toza`);
        return { success: true, deleted: 0 };
      }

      await this.prisma.transaction.deleteMany({ where: { id: { in: toDelete } } });
      this.logger.log(`🧹 ${monthName}: ${toDelete.length} ta o'chirildi`);
      return { success: true, deleted: toDelete.length };

    } catch (error: any) {
      this.logger.error(`Cleanup xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }


  async syncCategoryFromSheet(data: { name: string; type: string }) {
    try {
      const result = await this.prisma.category.upsert({
        where: { name: data.name },
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