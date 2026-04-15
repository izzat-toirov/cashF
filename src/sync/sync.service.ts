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
      ].filter(r => r.id); // id yo'qlarni darhol olib tashlaymiz
  
      if (allRecords.length === 0) {
        return { success: true, message: `${monthName} oyida ma'lumotlar yo'q`, data: [] };
      }
  
      const currentYear = new Date().getFullYear();
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      const monthNum = monthMap[monthName];
  
      // 1. Barcha unique kategoriyalarni BIR MARTA upsert qilamiz
      const uniqueCategories = [...new Set(allRecords.map(r => r.category || 'Nomalum'))];
      
      await this.prisma.$transaction(
        uniqueCategories.map(name =>
          this.prisma.category.upsert({
            where: { name },
            update: {},
            create: { name, type: 'EXPENSE' },
          })
        )
      );
  
      // 2. Kategoriyalarni map'ga yuklaymiz (keyingi so'rovlarsiz ishlatish uchun)
      const categoryRecords = await this.prisma.category.findMany({
        where: { name: { in: uniqueCategories } },
      });
      const categoryMap = new Map(categoryRecords.map(c => [c.name, c.id]));
  
      // 3. Mavjud transaksiyalarni BIR MARTA olamiz
      const sheetRowIds = allRecords.map(r => String(r.id));
      const existingTxns = await this.prisma.transaction.findMany({
        where: { sheetRowId: { in: sheetRowIds } },
      });
      const existingMap = new Map(existingTxns.map(t => [t.sheetRowId, t.id]));
  
      // 4. Recordlarni create/update ga ajratamiz
      const toCreate = [];
      const toUpdate = [];
  
      for (const record of allRecords) {
        const sheetRowId = String(record.id);
        const categoryId = categoryMap.get(record.category || 'Nomalum');
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
          month: monthNum,
          year: currentYear,
          categoryId,
        };
  
        if (existingMap.has(sheetRowId)) {
          toUpdate.push({ id: existingMap.get(sheetRowId), data: txData });
        } else {
          toCreate.push(txData);
        }
      }
  
      // 5. Bulk create + parallel update — hammasi bir vaqtda
      const [createdResult, ...updatedResults] = await this.prisma.$transaction([
        this.prisma.transaction.createMany({ data: toCreate, skipDuplicates: true }),
        ...toUpdate.map(({ id, data }) =>
          this.prisma.transaction.update({ where: { id }, data })
        ),
      ]);
  
      return {
        success: true,
        message: `${monthName} muvaffaqiyatli sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          createdCount: toCreate.length,
          updatedCount: toUpdate.length,
        },
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi [${monthName}]: ${msg}`);
      return { success: false, message: `Xatolik: ${msg}` };
    }
  }
}