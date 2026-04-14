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

  // ─── GET /transactions?month=5&year=2026 ─────────────────────────────────────

  async findByMonth(month: number, year: number, page: number = 1, limit: number = 10) {
    try {
      // 1. Parametrlarni raqam ekanligini qayta tekshirish (Double-check)
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
            category: true, // Kategoriyani ham birga olib kelish (muhim)
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
      // Server loglarida aniq xatoni ko'rish uchun
      console.error('Find Transactions Error:', error.message);
      
      // Front-endga xatoni yashirmasdan qaytarish (vaqtinchalik debugging uchun)
      return {
        success: false,
        message: `Bazada xatolik: ${error.message}`,
        data: []
      };
    }
  }

  async findRecent(month: number, year: number) {
    const sheetName = this.sheetsService.getSheetName(year, month);
    const records = await this.sheetsService.getFinanceRecords(sheetName);
  
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
  
    const formatDate = (d: Date): string =>
      `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  
    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);
  
    const filtered = records.filter(
      (r) => r.date === todayStr || r.date === yesterdayStr
    );
  
    const sorted = [...(filtered.length > 0 ? filtered : records)]
      .sort((a, b) => {
        const parseDate = (str: string) => {
          const [dd, mm, yyyy] = str.split('.');
          return new Date(`${yyyy}-${mm}-${dd}`).getTime();
        };
        return parseDate(b.date) - parseDate(a.date);
      })
      .slice(0, 5);
  
    return {
      success: true,
      data: sorted,
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
  
      // 1. "Nomalum" kategoriyasini tayyorlab olamiz (agar Sheets'da topilmasa ishlatish uchun)
      const unknownCategory = await this.prisma.category.upsert({
        where: { name: 'Nomalum' },
        update: {},
        create: { name: 'Nomalum', type: 'EXPENSE' }
      });
  
      const existingCategories = await this.prisma.category.findMany();
      const categoryMap = new Map(existingCategories.map(cat => [cat.name.toLowerCase().trim(), cat]));
  
      const allRecords = [...(data.expenses || []), ...(data.incomes || [])];
      const monthMap: Record<string, number> = {
        'Yanvar': 1, 'Fevral': 2, 'Mart': 3, 'Aprel': 4, 'May': 5, 'Iyun': 6,
        'Iyul': 7, 'Avgust': 8, 'Sentabr': 9, 'Oktabr': 10, 'Noyabr': 11, 'Dekabr': 12
      };
  
      const parts = monthName.split(' ');
      const monthNum = monthMap[parts[0]] || (new Date().getMonth() + 1);
      const year = parts[1] ? parseInt(parts[1]) : new Date().getFullYear();
  
      const savedTransactions = [];
  
      for (const record of allRecords) {
        if (!record.id) continue;
  
        try {
          // 2. Kategoriya tekshiruvi
          const sheetCatName = record.category?.toLowerCase().trim() || '';
          let categoryRecord = categoryMap.get(sheetCatName);
  
          // Agar kategoriya topilmasa, uni "Nomalum"ga biriktiramiz
          if (!categoryRecord) {
            categoryRecord = unknownCategory;
            this.logger.warn(`Kategoriya topilmadi [${record.category}], 'Nomalum'ga biriktirildi. ID: ${record.id}`);
          }
  
          // 3. Sanani parse qilish
          const [d, m, y] = (record.date || "").split('.').map(Number);
          const dbDate = (d && m && y) ? new Date(y, m - 1, d) : new Date();
  
          // 4. Tranzaksiya ma'lumotlari (HAMMA MAYDONLAR)
          const transactionData = {
            date: dbDate,
            amount: Number(record.amount) || 0,
            description: record.description || '', // Tavsif
            type: record.type || categoryRecord.type,
            sheetRowId: String(record.id), 
            month: monthNum,
            year: year,
            categoryId: categoryRecord.id, 
          };
  
          // 5. Bazaga yozish
          const result = await this.prisma.transaction.upsert({
            where: { sheetRowId: String(record.id) },
            update: transactionData,
            create: transactionData,
            include: { category: true }
          });
  
          savedTransactions.push(result);
  
        } catch (innerError) {
          this.logger.error(`Qator yozishda xato [ID: ${record.id}]: ${innerError}`);
          continue;
        }
      }
  
      return {
        success: true,
        message: `${monthName} muvaffaqiyatli sinxronizatsiya qilindi`,
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