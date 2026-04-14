import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  // Polling uchun: joriy oy doim kuzatilib turadi
  private get currentMonthName(): string {
    const monthMap = [
      'Yanvar','Fevral','Mart','Aprel','May','Iyun',
      'Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'
    ];
    const now = new Date();
    return `${monthMap[now.getMonth()]} ${now.getFullYear()}`;
  }

  constructor(
    private readonly sheetsService: GoogleSheetsService,
    private readonly prisma: PrismaService,
  ) {}

  // Modul ishga tushganda polling boshlaydi (ixtiyoriy)
  onModuleInit() {
    this.startPolling(60_000); // har 60 soniya
  }

  private startPolling(intervalMs: number) {
    setInterval(async () => {
      const month = this.currentMonthName;
      try {
        await this.syncMonthToDatabase(month);
        this.logger.log(`Polling OK: ${month}`);
      } catch (e) {
        this.logger.error(`Polling xato [${month}]: ${e}`);
      }
    }, intervalMs);
  }

  async syncMonthToDatabase(monthName: string) {
    try {
      const { expenses, incomes } = await this.sheetsService.getFullMonthData(monthName);
      const allRecords = [...expenses, ...incomes];

      const parts = monthName.split(' ');
      const currentYear = new Date().getFullYear();
      const year = parts.length > 1 ? (parseInt(parts[1]) || currentYear) : currentYear;

      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      const monthNum = monthMap[parts[0]] ?? (new Date().getMonth() + 1);

      const createdItems = [];
      const updatedItems = [];

      for (const record of allRecords) {
        if (!record.id) continue;

        const categoryRecord = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { name: record.category || 'Nomalum', type: record.type },
        });

        const existing = await this.prisma.transaction.findUnique({
          where: { sheetRowId: record.id },
        });

        const [d, m, y] = record.date.split('.').map(Number);
        const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();

        const transactionData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: record.type,
          sheetRowId: record.id,
          month: monthNum,
          year,
          categoryId: categoryRecord.id,
        };

        if (existing) {
          updatedItems.push(
            await this.prisma.transaction.update({
              where: { id: existing.id },
              data: transactionData,
            })
          );
        } else {
          createdItems.push(
            await this.prisma.transaction.create({ data: transactionData })
          );
        }
      }

      return {
        success: true,
        message: `${monthName} muvaffaqiyatli sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          createdCount: createdItems.length,
          updatedCount: updatedItems.length,
        },
        data: { newRecords: createdItems, modifiedRecords: updatedItems },
      };

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi: ${msg}`);
      throw error;
    }
  }
}