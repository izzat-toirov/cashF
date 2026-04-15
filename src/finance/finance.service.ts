import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { FinanceRecord } from '../common/types/finance.types';
import { SHEET_CONSTANTS } from '../common/constants/sheets.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(private readonly sheets: GoogleSheetsService, private readonly prisma: PrismaService, private readonly transactionsService: TransactionsService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────────

  async addFinanceRecord(record: Omit<FinanceRecord, 'id'>): Promise<void> {
    try {
      const sheetName = this.getSheetNameFromDate(record.date);
      const rowData = [
        record.date,
        record.amount.toString(),
        record.category,
        record.description || '',
      ];

      if (record.type === 'expense') {
        await this.sheets.addExpenseRow(sheetName, rowData);
      } else {
        await this.sheets.addIncomeRow(sheetName, rowData);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`addFinanceRecord xatolik: ${message}`);
      throw new BadRequestException("Finance record qo'shishda xatolik");
    }
  }

  // ─── READ ─────────────────────────────────────────────────────────────────────

  async getSvodkaReport() {
    const sheet = SHEET_CONSTANTS.SVODKA_SHEET_NAME;
    const ranges = [
      `${sheet}!${SHEET_CONSTANTS.RANGES.SVODKA.CURRENT_MONTH}`,
      `${sheet}!${SHEET_CONSTANTS.RANGES.SVODKA.INITIAL_AMOUNT}`,
      `${sheet}!${SHEET_CONSTANTS.RANGES.SVODKA.EXPENSE_CATEGORIES}`,
      `${sheet}!${SHEET_CONSTANTS.RANGES.SVODKA.INCOME_CATEGORIES}`,
    ];

    const data = await this.sheets.getBatchData(ranges);
    return {
      currentMonth: data[0]?.[0]?.[0],
      savings: data[1]?.[0]?.[0],
      expenses: data[2],
      income: data[3],
    };
  }

  async getCurrentMonthRecords(): Promise<FinanceRecord[]> {
    try {
      const sheetName = this.sheets.getCurrentMonthSheetName();
      return await this.sheets.getFinanceRecords(sheetName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getCurrentMonthRecords xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch records');
    }
  }

  async getMonthRecords(year: number, month: number): Promise<FinanceRecord[]> {
    try {
      const sheetName = this.sheets.getSheetName(year, month);
      return await this.sheets.getFinanceRecords(sheetName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getMonthRecords xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch month records');
    }
  }

  async getFilteredRecords(year?: number, month?: number): Promise<FinanceRecord[]> {
    try {
      if (year && month) {
        const sheetName = this.sheets.getSheetName(year, month);
        return await this.sheets.getFinanceRecords(sheetName);
      }
      if (year && !month) {
        return await this.getYearRecords(year);
      }
      const sheetName = this.sheets.getCurrentMonthSheetName();
      return await this.sheets.getFinanceRecords(sheetName);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getFilteredRecords xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch filtered records');
    }
  }

  private async getYearRecords(year: number): Promise<FinanceRecord[]> {
    const sheetPromises = Array.from({ length: 12 }, (_, i) => {
      const sheetName = this.sheets.getSheetName(year, i + 1);
      return this.sheets
        .getFinanceRecords(sheetName)
        .catch(() => [] as FinanceRecord[]);
    });
    return (await Promise.all(sheetPromises)).flat();
  }

  async calculateBalance(year?: number, month?: number): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
  }> {
    try {
      return await this.sheets.calculateBalance();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`calculateBalance xatolik: ${message}`);
      throw new BadRequestException('Failed to calculate balance');
    }
  }

  async getAvailableSheets(): Promise<{ sheets: { name: string; month: number; year: number }[] }> {
    try {
      const sheets = await this.sheets.getAvailableSheets();
      return { sheets };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getAvailableSheets xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch available sheets');
    }
  }

  async getActiveSheet(): Promise<{ name: string; month: number; year: number }> {
    try {
      return await this.sheets.getActiveSheet();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getActiveSheet xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch active sheet');
    }
  }

  async getCategories() {
    try {
      return await this.sheets.getCategories();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getCategories xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch categories');
    }
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────

  async updateFinanceRecord(
    id: string,
    record: Partial<FinanceRecord>,
    year?: number,
    month?: number,
  ): Promise<void> {
    try {
      const match = id.match(/^(income|expense)-row-(\d+)$/);
      if (!match) throw new BadRequestException(`Noto'g'ri id format: "${id}"`);

      const type = match[1] as 'income' | 'expense';
      const rowIndex = Number(match[2]);
      const sheetName = this.sheets.getSheetName(
        year ?? new Date().getFullYear(),
        month ?? new Date().getMonth() + 1,
      );

      const records = await this.sheets.getFinanceRecords(sheetName);
      const existing = records.find((r) => r.id === id);
      if (!existing) throw new NotFoundException(`Record "${id}" topilmadi`);

      const rowData = [
        record.date ?? existing.date,
        String(record.amount ?? existing.amount),
        record.description ?? existing.description ?? '',
        record.category ?? existing.category,
      ];

      await this.sheets.updateRow(sheetName, rowIndex, rowData, type);
      this.logger.log(`Updated "${id}" in sheet "${sheetName}"`);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`updateFinanceRecord xatolik: ${message}`);
      throw new BadRequestException('Failed to update finance record');
    }
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────────

  async deleteFinanceRecord(id: string, year?: number, month?: number): Promise<void> {
    try {
      const match = id.match(/^(income|expense)-row-(\d+)$/);
      if (!match) throw new BadRequestException(`Noto'g'ri id format: "${id}"`);

      const rowIndex = Number(match[2]);
      const sheetName = this.sheets.getSheetName(
        year ?? new Date().getFullYear(),
        month ?? new Date().getMonth() + 1,
      );

      await this.sheets.deleteRow(sheetName, rowIndex);
      this.logger.log(`Deleted "${id}" from sheet "${sheetName}"`);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`deleteFinanceRecord xatolik: ${message}`);
      throw new BadRequestException('Failed to delete finance record');
    }
  }

  // ─── ACTIVE SHEET ─────────────────────────────────────────────────────────────

  async setActiveSheet(sheetName: string): Promise<{ success: boolean; sheetName: string }> {
    try {
      // 1. Sheets da F2 ni o'zgartir
      const result = await this.sheets.setActiveSheet(sheetName);
  
      // 2. Shu oyni DB ga sync qil
      await this.transactionsService.syncMonthToDatabase(sheetName);
  
      this.logger.log(`✅ ${sheetName} sync qilindi`);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`setActiveSheet xatolik: ${message}`);
      throw new BadRequestException('Failed to set active sheet');
    }
  }

  // ─── INITIAL AMOUNTS ──────────────────────────────────────────────────────────

  async getInitialAmounts() {
    try {
      return await this.sheets.getInitialAmounts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`getInitialAmounts xatolik: ${message}`);
      throw new BadRequestException('Failed to fetch initial amounts');
    }
  }

  async updateInitialAmount(rowIndex: number, amount: number) {
    try {
      return await this.sheets.updateInitialAmount(rowIndex, amount);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`updateInitialAmount xatolik: ${message}`);
      throw new BadRequestException('Failed to update initial amount');
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────────

  private getSheetNameFromDate(date: string): string {
    try {
      let year: number;
      let month: number;

      if (date.includes('-') && date.indexOf('-') === 4) {
        [year, month] = date.split('-').map(Number);
      } else if (date.includes('.')) {
        const parts = date.split('.');
        year = Number(parts[2]);
        month = Number(parts[1]);
      } else {
        return this.sheets.getCurrentMonthSheetName();
      }

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        this.logger.warn(`Invalid date: ${date}, using current month`);
        return this.sheets.getCurrentMonthSheetName();
      }

      return this.sheets.getSheetName(year, month);
    } catch {
      return this.sheets.getCurrentMonthSheetName();
    }
  }



  // FinanceService ichida

// 1. Balansni DB dan hisoblash
async calculateBalanceFromDb(year: number, month: number) {
  const result = await this.prisma.transaction.aggregate({
    where: { year, month },
    _sum: { amount: true },
  });

  const totals = await this.prisma.transaction.groupBy({
    by: ['type'],
    where: { year, month },
    _sum: { amount: true },
  });

  const totalIncome = totals.find(t => t.type === 'income')?._sum.amount || 0;
  const totalExpense = totals.find(t => t.type === 'expense')?._sum.amount || 0;

  return {
    year,
    month,
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
}

// 2. Kategoriyalarni DB ga sinxronizatsiya qilish
async syncCategoriesToDb() {
  try {
    const sheetsCategories = await this.sheets.getCategories();
    
    // Natijalarni yig'ish uchun massiv
    const syncedCategories = [];

    for (const cat of sheetsCategories) {
      const result = await this.prisma.category.upsert({
        where: { name: cat.name },
        update: { type: cat.type },
        create: { 
          name: cat.name, 
          type: cat.type 
        },
      });
      
      // Har bir saqlangan ma'lumotni massivga qo'shamiz
      syncedCategories.push({
        id: result.id,
        name: result.name,
        type: result.type
      });
    }

    return { 
      success: true, 
      message: "Kategoriyalar muvaffaqiyatli sinxronizatsiya qilindi",
      stats: {
        total: syncedCategories.length
      },
      // Ma'lumotlarning to'liq ro'yxati
      data: syncedCategories 
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.logger.error(`Kategoriya sync xatosi: ${errorMsg}`);
    throw error;
  }
}

async getCategoriesFromDb() {
  const categories = await this.prisma.category.findMany({
    orderBy: {
      name: 'asc'
    }
  });

  return categories.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type
  }));
}

async getRecentRecordsFromDb(limit: number) {
  return await this.prisma.transaction.findMany({
    take: limit,
    orderBy: { date: 'desc' },
  });
}


  
}