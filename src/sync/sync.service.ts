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
      this.logger.warn(`Noto'g'ri oy nomi bilan so'rov keldi: ${monthName}`);
      return { 
        success: false, 
        message: `Yaroqsiz oy nomi: ${monthName}.` 
      };
    }
  
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      
      if (!data) {
        return { success: false, message: `${monthName} listi topilmadi yoki bo'sh` };
      }
  
      const expenses = data.expenses || [];
      const incomes = data.incomes || [];
      const allRecords = [...expenses, ...incomes];
  
      if (allRecords.length === 0) {
        return { success: true, message: `${monthName} oyida ma'lumotlar mavjud emas`, data: [] };
      }
  
      const currentYear = new Date().getFullYear();
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      
      const monthNum = monthMap[monthName];
      const createdItems = [];
      const updatedItems = [];
  
      for (const record of allRecords) {
        if (!record.id) continue;
  
        // Kategoriya upsert
        const categoryRecord = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { 
            name: record.category || 'Nomalum', 
            type: record.type || 'EXPENSE' 
          },
        });
  
        const existing = await this.prisma.transaction.findUnique({
          where: { sheetRowId: String(record.id) },
        });
  
        const dateParts = record.date?.split('.') || [];
        const dbDate = (dateParts.length === 3) 
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]) 
          : new Date();
  
        const transactionData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: record.type,
          sheetRowId: String(record.id),
          month: monthNum,
          year: currentYear,
          categoryId: categoryRecord.id,
        };
  
        if (existing) {
          const updated = await this.prisma.transaction.update({
            where: { id: existing.id },
            data: transactionData,
            include: { category: true } // Kategoriya ma'lumotlarini ham qo'shib olish
          });
          updatedItems.push(updated);
        } else {
          const created = await this.prisma.transaction.create({
            data: transactionData,
            include: { category: true }
          });
          createdItems.push(created);
        }
      }
  
      // NATIJA: Faqat sonlar emas, barcha ob'ektlar qaytadi
      return {
        success: true,
        message: `${monthName} muvaffaqiyatli sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          createdCount: createdItems.length,
          updatedCount: updatedItems.length,
        },
        data: {
          new_records: createdItems,    // Yangi qo'shilganlar ro'yxati
          updated_records: updatedItems // Yangilanganlar ro'yxati
        }
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi [${monthName}]: ${msg}`);
      return { 
        success: false, 
        message: `Xatolik: ${msg}` 
      };
    }
}
}