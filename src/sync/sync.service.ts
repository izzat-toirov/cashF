import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { SyncWebhookDto } from './dto/create-sync.dto';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  private get currentMonthName(): string {
    const monthMap = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    return monthMap[new Date().getMonth()];
  }

  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.startPolling(60_000);
  }

  private startPolling(intervalMs: number) {
    setInterval(async () => {
      const month = this.currentMonthName;
      try {
        await this.syncMonthToDatabase(month);
        this.logger.log(`Polling muvaffaqiyatli: ${month}`);
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.logger.error(`Polling xatosi [${month}]: ${errorMessage}`);
      }
    }, intervalMs);
  }

  /**
   * WEBHOOK uchun: Faqat o'zgargan bitta qatorni sinxronizatsiya qilish
   */
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      // rowData [id, date, amount, category, description, type, ...]
      // Sheets-dagi tartibga qarab indexlarni to'g'rilang
      const sheetRowId = `${monthName}-2026-row-${row}`; 
      const [dateStr, amount, categoryName, description] = rowData.slice(1, 5); // Masalan B-E ustunlar

      const dateParts = String(dateStr).split('.');
      const dbDate = dateParts.length === 3
        ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
        : new Date();

      // 1. Kategoriyani topish yoki yaratish
      const category = await this.prisma.category.upsert({
        where: { name: categoryName || 'Nomalum' },
        update: {},
        create: { name: categoryName || 'Nomalum', type: 'expense' }
      });

      // 2. Transaksiyani UPSERT qilish (faqat bitta qator)
      const result = await this.prisma.transaction.upsert({
        where: { sheetRowId },
        update: {
          date: dbDate,
          amount: Number(amount) || 0,
          description: String(description || ''),
          categoryId: category.id,
        },
        create: {
          sheetRowId,
          date: dbDate,
          amount: Number(amount) || 0,
          description: String(description || ''),
          type: 'expense', // webhook payloadga qarab dinamik qilish mumkin
          month: new Date().getMonth() + 1,
          year: 2026,
          categoryId: category.id,
        }
      });

      return { success: true, message: "Qator yangilandi", data: result };
    } catch (error) {
      this.logger.error(`Single row sync error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * POLLING va TO'LIQ SYNC uchun
   */
  async syncMonthToDatabase(monthName: string) {
    // ... (Sizning mavjud tekshiruvlaringiz)
    
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data) return { success: false, message: `${monthName} listi topilmadi` };

      // Recordlarni yig'ishda sheetRowId ni aniq biriktirish
      const allRecords = [
        ...(data.expenses || []).map(r => ({ ...r, type: 'expense' })),
        ...(data.incomes || []).map(r => ({ ...r, type: 'income' })),
      ].filter(r => r.id);

      if (allRecords.length === 0) return { success: true, message: "Bo'sh" };

      // 1. Kategoriyalarni bulk yaratish
      const uniqueCategoryNames = [...new Set(allRecords.map(r => r.category || 'Nomalum'))];
      await Promise.all(
        uniqueCategoryNames.map(name => 
          this.prisma.category.upsert({
            where: { name },
            update: {},
            create: { name, type: 'expense' }
          })
        )
      );

      const categoryRecords = await this.prisma.category.findMany();
      const categoryMap = new Map(categoryRecords.map(c => [c.name, c.id]));

      // 2. Transaksiyalarni UPSERT qilish
      let created = 0;
      let updated = 0;

      for (const record of allRecords) {
        const sheetRowId = String(record.id);
        
        // Sana parsing
        const dateParts = record.date?.split('.') || [];
        const dbDate = dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();

        const txData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: record.type,
          sheetRowId,
          month: 3, // yoki dinamik
          year: 2026,
          categoryId: categoryMap.get(record.category || 'Nomalum'),
        };

        await this.prisma.transaction.upsert({
          where: { sheetRowId },
          update: txData,
          create: txData
        });
        
        // Bu yerda counterlarni oshirish mumkin (ixtiyoriy)
      }

      return { success: true, message: "Sinxronizatsiya yakunlandi" };
    } catch (error) {
      this.logger.error(`Sync xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}