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
  
    // 1. Validatsiya: Faqat ruxsat etilgan oy nomlarini o'tkazamiz
    if (!monthName || !validMonths.includes(monthName)) {
      this.logger.warn(`Noto'g'ri oy nomi bilan so'rov keldi: ${monthName}`);
      return { 
        success: false, 
        message: `Yaroqsiz oy nomi: ${monthName}. Faqat o'zbekcha oy nomlarini yuboring.` 
      };
    }
  
    try {
      // 2. Sheets'dan ma'lumot olish
      const data = await this.sheetsService.getFullMonthData(monthName);
      
      // Agar list umuman topilmasa yoki xato qaytsa
      if (!data) {
        return { success: false, message: `${monthName} listi topilmadi yoki bo'sh` };
      }
  
      // Ma'lumotlar massivini shakllantirish (null bo'lsa bo'sh massiv oladi)
      const expenses = data.expenses || [];
      const incomes = data.incomes || [];
      const allRecords = [...expenses, ...incomes];
  
      if (allRecords.length === 0) {
        return { success: true, message: `${monthName} oyida ma'lumotlar mavjud emas`, stats: { total: 0 } };
      }
  
      const currentYear = new Date().getFullYear();
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      
      const monthNum = monthMap[monthName];
  
      const createdItems = [];
      const updatedItems = [];
  
      // 3. Ma'lumotlarni bazaga saqlash (Loop)
      for (const record of allRecords) {
        // Agarda qatorda ID (sheetRowId) bo'lmasa, o'tkazib yuboramiz
        if (!record.id) continue;
  
        // Kategoriya bilan ishlash
        const categoryRecord = await this.prisma.category.upsert({
          where: { name: record.category || 'Nomalum' },
          update: {},
          create: { 
            name: record.category || 'Nomalum', 
            type: record.type || 'EXPENSE' // Default tip
          },
        });
  
        // Mavjud tranzaksiyani tekshirish
        const existing = await this.prisma.transaction.findUnique({
          where: { sheetRowId: record.id },
        });
  
        // Sanani parse qilish (dd.mm.yyyy)
        const dateParts = record.date?.split('.') || [];
        const dbDate = (dateParts.length === 3) 
          ? new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]) 
          : new Date();
  
        const transactionData = {
          date: dbDate,
          amount: Number(record.amount) || 0,
          description: record.description || '',
          type: record.type,
          sheetRowId: record.id,
          month: monthNum,
          year: currentYear,
          categoryId: categoryRecord.id,
        };
  
        if (existing) {
          const updated = await this.prisma.transaction.update({
            where: { id: existing.id },
            data: transactionData,
          });
          updatedItems.push(updated);
        } else {
          const created = await this.prisma.transaction.create({
            data: transactionData,
          });
          createdItems.push(created);
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
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi [${monthName}]: ${msg}`);
      
      // Internal Server Error (500) o'rniga JSON qaytaramiz
      return { 
        success: false, 
        message: `Sinxronizatsiya jarayonida xatolik: ${msg}` 
      };
    }
  }
}