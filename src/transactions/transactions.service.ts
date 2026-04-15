import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly sheetsService: GoogleSheetsService, private readonly prisma: PrismaService,) {}


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


  async findByMonth(month: number, year: number, page: number = 1, limit: number = 10) {
    try {
      const m = Number(month);
      const y = Number(year);
      const p = Math.max(1, Number(page));
      const l = Math.max(1, Number(limit));

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
          orderBy: {
            date: 'desc',
          },
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

      const totalPages = Math.ceil(total / l);

      return {
        success: true,
        data: transactions,
        meta: {
          total,
          page: p,
          limit: l,
          totalPages,
        },
      };
    } catch (error: any) {
      console.error('Find Transactions Error:', error.message);
      
      return {
        success: false,
        message: `Bazada xatolik: ${error.message}`,
        data: []
      };
    }
  }

  async findRecent(month: number) {
    const now = new Date();
  
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
  
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const yesterdayEnd = new Date(todayStart.getTime() - 1);
  
    // Bugun yoki kechagi transactionlar
    let transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { date: { gte: todayStart, lte: todayEnd } },
          { date: { gte: yesterdayStart, lte: yesterdayEnd } },
        ],
      },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 5,
    });
  
    // Topilmasa — shu oyning so'nggi 5 tasi (year avtomatik date dan olinadi)
    if (transactions.length === 0) {
      const currentYear = now.getFullYear();
      transactions = await this.prisma.transaction.findMany({
        where: {
          date: {
            gte: new Date(currentYear, month - 1, 1),
            lte: new Date(currentYear, month, 0, 23, 59, 59, 999),
          },
        },
        include: { category: true },
        orderBy: { date: 'desc' },
        take: 5,
      });
    }
  
    return {
      success: true,
      data: transactions,
    };
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

  async syncMonthToDatabase(monthName: string) {
    try {
      const data = await this.sheetsService.getFullMonthData(monthName);
      if (!data || (!data.expenses && !data.incomes)) {
        return { success: false, message: "Sheets'dan ma'lumot olishda xatolik" };
      }
  
      // 1. "Nomalum" va mavjud kategoriyalarni parallel yuklash
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
      
      // Oy va yilni hisoblash
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
      const parts = monthName.split(' ');
      const monthNum = monthMap[parts[0]] || (new Date().getMonth() + 1);
      const year = parts[1] ? parseInt(parts[1]) : new Date().getFullYear();
  
      // 2. Barcha so'rovlarni massivga yig'amiz (Parallel yuborish uchun)
      const syncPromises = allRecords.map(async (record) => {
        if (!record.id) return null;
  
        try {
          const sheetCatName = record.category?.toLowerCase().trim() || '';
          let categoryRecord = categoryMap.get(sheetCatName) || unknownCategory;
  
          const [d, m, y] = (record.date || "").split('.').map(Number);
          const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();
  
          const transactionData = {
            date: dbDate,
            amount: Number(record.amount) || 0,
            description: record.description || '',
            type: record.type || categoryRecord.type,
            sheetRowId: String(record.id),
            month: monthNum,
            year: year,
            categoryId: categoryRecord.id,
          };
  
          // Har bir upsert endi massiv ichida parallel ketadi
          return this.prisma.transaction.upsert({
            where: { sheetRowId: String(record.id) },
            update: transactionData,
            create: transactionData,
            include: { category: true }
          });
        } catch (innerError) {
          this.logger.error(`Qator sync xatosi [ID: ${record.id}]: ${innerError}`);
          return null;
        }
      });
  
      // 3. Hammasini bir vaqtda parallel bajaramiz
      const results = await Promise.all(syncPromises);
      const savedTransactions = results.filter(r => r !== null);
  
      return {
        success: true,
        message: `${monthName} tezkor sinxronizatsiya qilindi`,
        stats: {
          total: allRecords.length,
          saved: savedTransactions.length
        },
        data: savedTransactions
      };
  
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sync xatoligi: ${msg}`);
      return { success: false, message: msg };
    }
  }
}