import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  // 1. O'zgarish: Faqat oy nomini qaytaradi (yilni emas)
  private get currentMonthName(): string {
    const monthMap = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    const now = new Date();
    return monthMap[now.getMonth()]; 
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
        // e ni Error ekanligini tekshiramiz
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.logger.error(`Polling xatosi [${month}]: ${errorMessage}`);
      }
    }, intervalMs);
  }

  async syncMonthToDatabase(monthName: string) {
    const validMonths = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
  
    if (!monthName || !validMonths.includes(monthName)) {
      this.logger.warn(`Noto'g'ri oy nomi: ${monthName}`);
      return { success: false, message: `Yaroqsiz oy nomi: ${monthName}.` };
    }
  
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data) {
        return { success: false, message: `${monthName} listi topilmadi` };
      }
  
      const allRecords = [
        ...(data.expenses || []),
        ...(data.incomes || []),
      ].filter(r => r.id);
  
      if (allRecords.length === 0) {
        return { success: true, message: `${monthName} oyida ma'lumotlar yo'q`, data: [] };
      }
  
      const currentYear = new Date().getFullYear();
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      const monthNum = monthMap[monthName];
  
      // type ni normalize qilamiz: har qanday formatni lowercase ga
      const normalizeType = (type: string): string => {
        if (!type) return 'expense';
        const t = type.toLowerCase();
        if (t === 'income' || t === 'kirim') return 'income';
        return 'expense';
      };
  
      const uniqueCategories = [...new Set(allRecords.map(r => r.category || 'Nomalum'))];
  
      // Kategoriyalar va mavjud transaksiyalar PARALLEL
      const [categoryRecords, existingTxns] = await Promise.all([
        Promise.all(
          uniqueCategories.map(name =>
            this.prisma.category.upsert({
              where: { name },
              update: {},
              create: { name, type: 'expense' }, // lowercase
            })
          )
        ),
        this.prisma.transaction.findMany({
          where: { sheetRowId: { in: allRecords.map(r => String(r.id)) } },
          select: { id: true, sheetRowId: true },
        }),
      ]);
  
      const categoryMap = new Map(categoryRecords.map(c => [c.name, c.id]));
      const existingMap = new Map(existingTxns.map(t => [t.sheetRowId, t.id]));
  
      const toCreate: any[] = [];
      const toUpdate: { id: string; data: any }[] = [];
  
      for (const record of allRecords) {
        const sheetRowId = String(record.id);
        const dateParts = record.date?.split('.') || [];
        const dbDate = dateParts.length === 3
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
          : new Date();
  
        const txData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: normalizeType(record.type), // normalize
          sheetRowId,
          month: monthNum,
          year: currentYear,
          categoryId: categoryMap.get(record.category || 'Nomalum'),
        };
  
        if (existingMap.has(sheetRowId)) {
          toUpdate.push({ id: existingMap.get(sheetRowId)!, data: txData });
        } else {
          toCreate.push(txData);
        }
      }
  
      // pgBouncer uchun: update'larni 5 tadan batch qilamiz
      const updateBatchSize = 5;
  
      await Promise.all([
        toCreate.length > 0
          ? this.prisma.transaction.createMany({ data: toCreate, skipDuplicates: true })
          : Promise.resolve(),
  
        (async () => {
          for (let i = 0; i < toUpdate.length; i += updateBatchSize) {
            const batch = toUpdate.slice(i, i + updateBatchSize);
            await Promise.all(
              batch.map(({ id, data }) =>
                this.prisma.transaction.update({ where: { id }, data })
              )
            );
          }
        })(),
      ]);
  
      // Natijani qaytarish
      const syncedRecords = await this.prisma.transaction.findMany({
        where: {
          sheetRowId: { in: allRecords.map(r => String(r.id)) },
        },
        include: { category: true },
        orderBy: { date: 'asc' },
      });
  
      return {
        success: true,
        message: `${monthName} muvaffaqiyatli sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          createdCount: toCreate.length,
          updatedCount: toUpdate.length,
        },
        data: {
          expenses: syncedRecords.filter(r => r.type === 'expense'),
          incomes: syncedRecords.filter(r => r.type === 'income'),
        },
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi [${monthName}]: ${msg}`);
      return { success: false, message: `Xatolik: ${msg}` };
    }
  }
}