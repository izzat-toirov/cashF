import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly sheetsService: GoogleSheetsService, private readonly prisma: PrismaService,) {}

  // transactions.service.ts ichida
async onModuleInit() {
  // 10 soniya kutamiz, SyncService cleanup qilib bo'lishi uchun
  this.logger.log('Sinxronizatsiya 10 soniyadan keyin boshlanadi...');
  setTimeout(async () => {
    await this.checkAndSyncIfMonthChanged();
  }, 10000); 
}

  // Har kuni yarim tunda avtomat tekshiradi
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyCheck() {
    this.logger.log('Kundalik tekshiruv: Oy o‘zgarganini tekshirmoqdaman...');
    await this.checkAndSyncIfMonthChanged();
  }

  async checkAndSyncIfMonthChanged() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
  
    try {
      // 1. Bazada joriy oy va yil uchun jami qancha tranzaksiya borligini sanaymiz
      const currentMonthCount = await this.prisma.transaction.count({
        where: {
          month: currentMonth,
          year: currentYear,
        },
      });
  
      // 2. Agar bazada joriy oy uchun UMUMAN ma'lumot bo'lmasa (tozalangan bo'lsa)
      if (currentMonthCount === 0) {
        this.logger.warn(`Bazada ${currentMonth}-${currentYear} uchun ma'lumot topilmadi. Sheets'dan yuklanmoqda...`);
        await this.syncCurrentMonth();
        return;
      }
  
      // 3. Qo'shimcha tekshiruv: Oxirgi tranzaksiya yil/oyini ham tekshirib qo'yamiz (xavfsizlik uchun)
      const lastTransaction = await this.prisma.transaction.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { month: true, year: true }
      });
  
      if (lastTransaction && 
          (lastTransaction.month !== currentMonth || lastTransaction.year !== currentYear)) {
        this.logger.warn('Yangi oy boshlangan, lekin bazada hali eski oy ma’lumotlari turibdi. Sync boshlandi...');
        await this.syncCurrentMonth();
        return;
      }
  
      this.logger.log(`Sinxronizatsiya shart emas. Bazada joriy oy uchun ${currentMonthCount} ta ma'lumot bor.`);
      
    } catch (error) {
      this.logger.error('Tekshiruv vaqtida xatolik yuz berdi:', error);
      // Xatolik bo'lsa ham ehtiyotkorlik yuzasidan syncni chaqirib qo'yish mumkin
      // await this.syncCurrentMonth(); 
    }
  }


  async create(dto: CreateTransactionDto) {
    const year = dto.year ?? new Date().getFullYear();
    const month = dto.month ?? new Date().getMonth() + 1;
    const sheetName = this.sheetsService.getSheetName(year, month);
  
    // 1. Sanani formatlash
    const [d, m, y] = dto.date.split('.').map(Number);
    const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();
  
    // 2. Kategoriyani bazadan topamiz yoki yangi yaratamiz (upsert)
    // Bu bizga categoryId ni olish uchun kerak
    const categoryRecord = await this.prisma.category.upsert({
      where: { name: dto.category },
      update: {}, // Agar bor bo'lsa o'zgartirmaymiz
      create: { 
        name: dto.category, 
        type: dto.type 
      },
    });
  
    // 3. Database-ga saqlaymiz (categoryId bilan)
    const newTransaction = await this.prisma.transaction.create({
      data: {
        date: dbDate,
        amount: Number(dto.amount),
        description: dto.description ?? '',
        type: dto.type,
        month: month,
        year: year,
        categoryId: categoryRecord.id, // String o'rniga ID ulaymiz
      },
      include: {
        category: true, // Javobda kategoriya ma'lumotlari ham chiqishi uchun
      }
    });
  
    // 4. Google Sheets-ga yuboramiz
    const rowData = [
      dto.date,                 
      String(dto.amount),       
      dto.category,             
      dto.description ?? '',    
    ];
  
    if (dto.type === 'expense') {
      await this.sheetsService.addExpenseRow(sheetName, rowData);
    } else {
      await this.sheetsService.addIncomeRow(sheetName, rowData);
    }
  
    return { 
      success: true, 
      data: newTransaction, 
      sheetStatus: 'Added to Google Sheets'
    };
  }



  async update(id: string, dto: UpdateTransactionDto) {
    const { type, rowIndex, sheetName } = this.parseId(id, dto);

    const records = await this.sheetsService.getFinanceRecords(sheetName);
    const existing = records.find((r) => r.id === id);
    if (!existing) throw new NotFoundException(`Transaction "${id}" topilmadi`);

    if (type === 'expense') {
      // ✅ B:E: [date, amount, description, category]
      await this.sheetsService.updateRow(
        sheetName,
        rowIndex,
        [
          dto.date ?? existing.date,
          String(dto.amount ?? existing.amount),
          dto.description ?? existing.description ?? '',
          dto.category ?? existing.category,
        ],
        'expense',
      );
    } else {
      // ✅ H:K: [date, description, category, amount]
      await this.sheetsService.updateRow(
        sheetName,
        rowIndex,
        [
          dto.date ?? existing.date,
          String(dto.amount ?? existing.amount),
          dto.description ?? existing.description ?? '',
          dto.category ?? existing.category,
        ],
        'income',
      );
    }

    return { success: true, id };
  }


  async findByMonth(month: number, year: number, page: number = 1, limit: number = 80) {
    try {
      // Son ekanligiga ishonch hosil qilamiz
      const m = parseInt(String(month));
      const y = parseInt(String(year));
      const p = Math.max(1, parseInt(String(page)));
      const l = Math.max(1, parseInt(String(limit)));
  
      const skip = (p - 1) * l;
  
      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            month: m,
            year: y,
          },
          include: {
            category: true,
          },
          orderBy: [
            { date: 'desc' }, // Avval sana bo'yicha
            { createdAt: 'desc' } // Keyin yaratilgan vaqti bo'yicha
          ],
          skip: skip,
          take: l,
        }),
        this.prisma.transaction.count({
          where: {
            month: m,
            year: y,
          },
        }),
      ]);
  
      return {
        success: true,
        data: transactions,
        meta: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l),
        },
      };
    } catch (error: any) {
      this.logger.error(`Find Transactions Error: ${error.message}`);
      return {
        success: false,
        message: `Bazada xatolik: ${error.message}`,
        data: [],
        meta: { total: 0, page: 1, limit: 80, totalPages: 0 }
      };
    }
  }

  async findRecent(month: number) {
    const now = new Date();
    const currentYear = now.getFullYear();
  
    // Oy chegaralari
    const monthStart = new Date(currentYear, month - 1, 1);
    const monthEnd = new Date(currentYear, month, 0, 23, 59, 59, 999);
  
    const todayStart = new Date(currentYear, now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const yesterdayEnd = new Date(todayStart.getTime() - 1);
  
    // ✅ Bugun yoki kecha — lekin faqat shu oy ichidan
    let transactions = await this.prisma.transaction.findMany({
      where: {
        AND: [
          { month: month },          // ✅ shu oy filteri qo'shildi
          {
            OR: [
              { date: { gte: todayStart, lte: todayEnd } },
              { date: { gte: yesterdayStart, lte: yesterdayEnd } },
            ],
          },
        ],
      },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 5,
    });
  
    // Topilmasa — shu oyning so'nggi 5 tasi
    if (transactions.length === 0) {
      transactions = await this.prisma.transaction.findMany({
        where: {
          month: month,              // ✅ date range + month ikkalasi
          date: { gte: monthStart, lte: monthEnd },
        },
        include: { category: true },
        orderBy: { date: 'desc' },
        take: 5,
      });
    }
  
    return { success: true, data: transactions };
  }
  

  // ─── GET /transactions/:id ────────────────────────────────────────────────────

  async findOne(id: string, month?: number, year?: number) {
    const m = month ?? new Date().getMonth() + 1;
    const y = year ?? new Date().getFullYear();
    const sheetName = this.sheetsService.getSheetName(y, m);

    const records = await this.sheetsService.getFinanceRecords(sheetName);
    const record = records.find((r) => r.id === id);

    if (!record) throw new NotFoundException(`Transaction "${id}" topilmadi`);
    return { success: true, data: record };
  }

  // ─── DELETE /transactions/:id ─────────────────────────────────────────────────

  async remove(id: string, month?: number, year?: number) {
    const { rowIndex, sheetName } = this.parseId(id, { month, year });
    await this.sheetsService.deleteRow(sheetName, rowIndex);
    return { success: true, message: "Transaction o'chirildi", id };
  }

  // ─── HELPER ───────────────────────────────────────────────────────────────────

  private parseId(
    id: string,
    opts: { month?: number; year?: number },
  ): { type: 'income' | 'expense'; rowIndex: number; sheetName: string } {
    const match = id.match(/^(income|expense)-row-(\d+)$/);
    if (!match) throw new NotFoundException(`Noto'g'ri transaction id: "${id}"`);

    const type = match[1] as 'income' | 'expense';
    const rowIndex = Number(match[2]);
    const year = opts.year ?? new Date().getFullYear();
    const month = opts.month ?? new Date().getMonth() + 1;
    const sheetName = this.sheetsService.getSheetName(year, month);

    return { type, rowIndex, sheetName };
  }


  async syncCurrentMonth() {
    const monthNames = [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
    ];
    
    const now = new Date();
    const currentMonthName = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();

    // Sheets'dagi list nomi odatda "Aprel 2026" yoki shunchaki "Aprel" bo'lishi mumkin
    // Sizning mantiqingizga ko'ra faqat oy nomini yuboramiz
    this.logger.log(`Sinxronizatsiya boshlandi: ${currentMonthName} ${currentYear}`);
    
    return this.syncMonthToDatabase(currentMonthName);
  }

  // async syncMonthToDatabase(monthName: string) {
  //   try {
  //     const data = await this.sheetsService.getFullMonthData(monthName);
  //     if (!data || (!data.expenses && !data.incomes)) {
  //       return { success: false, message: "Sheets'dan ma'lumot olishda xatolik" };
  //     }
  
  //     const [unknownCategory, existingCategories] = await Promise.all([
  //       this.prisma.category.upsert({
  //         where: { name: 'Nomalum' },
  //         update: {},
  //         create: { name: 'Nomalum', type: 'EXPENSE' }
  //       }),
  //       this.prisma.category.findMany()
  //     ]);
  
  //     const categoryMap = new Map(existingCategories.map(cat => [cat.name.toLowerCase().trim(), cat]));
  //     const allRecords = [...(data.expenses || []), ...(data.incomes || [])];
  
  //     const monthMap: Record<string, number> = {
  //       'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
  //       'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
  //     };
  
  //     const parts = monthName.split(' ');
  //     const monthNum = monthMap[parts[0]] || (new Date().getMonth() + 1);
  
  //     const syncPromises = allRecords.map(async (record) => {
  //       if (!record.id) return null;
  
  //       try {
  //         const sheetCatName = record.category?.toLowerCase().trim() || '';
  //         const categoryRecord = categoryMap.get(sheetCatName) || unknownCategory;
  
  //         // ✅ Yilni tranzaksiya sanasidan olamiz
  //         const [d, m, y] = (record.date || "").split('.').map(Number);
  //         const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();
          
  //         // ✅ Yilni sanadan aniqlaymiz, bo'lmasa joriy yil
  //         const resolvedYear = (y && y > 2000) ? y : new Date().getFullYear();
  
  //         // ✅ sheetRowId = "oy-yil-id" — har oy uchun unique
  //         const uniqueSheetRowId = `${monthNum}-${resolvedYear}-${String(record.id)}`;
  
  //         const transactionData = {
  //           date: dbDate,
  //           amount: Number(record.amount) || 0,
  //           description: record.description || '',
  //           type: record.type || categoryRecord.type,
  //           sheetRowId: uniqueSheetRowId,
  //           month: monthNum,
  //           year: resolvedYear,
  //           categoryId: categoryRecord.id,
  //         };
  
  //         return this.prisma.transaction.upsert({
  //           where: { sheetRowId: uniqueSheetRowId },
  //           update: transactionData,  // mavjud bo'lsa yangilaydi, o'chirmaydi
  //           create: transactionData,  // yo'q bo'lsa yaratadi
  //           include: { category: true }
  //         });
  //       } catch (innerError) {
  //         this.logger.error(`Qator sync xatosi [ID: ${record.id}]: ${innerError}`);
  //         return null;
  //       }
  //     });
  
  //     const results = await Promise.all(syncPromises);
  //     const savedTransactions = results.filter(r => r !== null);
  
  //     return {
  //       success: true,
  //       message: `${monthName} sinxronizatsiya qilindi`,
  //       stats: {
  //         total: allRecords.length,
  //         saved: savedTransactions.length
  //       },
  //       data: savedTransactions
  //     };
  
  //   } catch (error: unknown) {
  //     const msg = error instanceof Error ? error.message : String(error);
  //     this.logger.error(`Sync xatoligi: ${msg}`);
  //     return { success: false, message: msg };
  //   }
  // }



  async syncMonthToDatabase(monthName: string) {
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data || (!data.expenses && !data.incomes)) {
        return { success: false, message: "Sheets'dan ma'lumot olishda xatolik" };
      }
  
      const [unknownCategory, existingCategories] = await Promise.all([
        this.prisma.category.upsert({
          where: { name: 'Nomalum' },
          update: {},
          create: { name: 'Nomalum', type: 'EXPENSE' }
        }),
        this.prisma.category.findMany()
      ]);
  
      const categoryMap = new Map(existingCategories.map(cat => [cat.name.toLowerCase().trim(), cat]));
      const allRecords = [...(data.expenses || []), ...(data.incomes || [])];
  
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
  
      const parts = monthName.split(' ');
      const monthNum = monthMap[parts[0]] || (new Date().getMonth() + 1);
  
      const savedTransactions = [];
      const BATCH_SIZE = 10; // ✅ Bir vaqtda 10 ta so'rov yuboramiz (Supabase limiti uchun xavfsiz)
  
      // ✅ Recordslarni bo'laklarga bo'lib ishlaymiz
      for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
  
        const batchPromises = batch.map(async (record) => {
          if (!record.id) return null;
  
          try {
            const sheetCatName = record.category?.toLowerCase().trim() || '';
            const categoryRecord = categoryMap.get(sheetCatName) || unknownCategory;
  
            const [d, m, y] = (record.date || "").split('.').map(Number);
            const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();
            const resolvedYear = (y && y > 2000) ? y : new Date().getFullYear();
            const uniqueSheetRowId = `${monthNum}-${resolvedYear}-${String(record.id)}`;
  
            const transactionData = {
              date: dbDate,
              amount: Number(record.amount) || 0,
              description: record.description || '',
              type: record.type || categoryRecord.type,
              sheetRowId: uniqueSheetRowId,
              month: monthNum,
              year: resolvedYear,
              categoryId: categoryRecord.id,
            };
  
            return await this.prisma.transaction.upsert({
              where: { sheetRowId: uniqueSheetRowId },
              update: transactionData,
              create: transactionData,
            });
          } catch (innerError) {
            const errorMessage = innerError instanceof Error ? innerError.message : String(innerError);
            this.logger.error(`Qator sync xatosi [ID: ${record.id}]: ${errorMessage}`);
            return null;
        }
        });
  
        // ✅ Har 10 ta so'rov tugashini kutamiz va keyingi 10 talikka o'tamiz
        const results = await Promise.all(batchPromises);
        savedTransactions.push(...results.filter(r => r !== null));
      }
  
      return {
        success: true,
        message: `${monthName} sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          saved: savedTransactions.length
        }
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi: ${msg}`);
      return { success: false, message: msg };
    }
  }

  
}