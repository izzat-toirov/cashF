import { Injectable, Logger } from '@nestjs/common';
import { FinanceRecord, SheetData, SvodkaData } from '../common/types/finance.types';
import { SheetsBaseService } from './services/sheets.base.service';
import { SheetsReadService } from './services/sheets.read.service';
import { SheetsWriteService } from './services/sheets.write.service';
import { SheetsCategoryService } from './services/sheets.category.service';

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name)
  constructor(
    private readonly base: SheetsBaseService,
    private readonly read: SheetsReadService,
    private readonly write: SheetsWriteService,
    private readonly category: SheetsCategoryService,
  ) {}

  // ── Base ──────────────────────────────────────────────
  getCurrentMonthSheetName(): string {
    return this.base.getCurrentMonthSheetName();
  }

  getSheetName(year: number, month: number): string {
    return this.base.getSheetName(year, month);
  }

  ensureSheetExists(sheetName: string) {
    return this.base.ensureSheetExists(sheetName);
  }

  createSheet(sheetName: string) {
    return this.base.createSheet(sheetName);
  }

  validateSheetNameSync(sheetName: string) {
    return this.base.validateSheetNameSync(sheetName);
  }

  getFinanceRecords(sheetName: string): Promise<FinanceRecord[]> {
    return this.read.getFinanceRecords(sheetName);
  }

  readSvodka(): Promise<SvodkaData> {
    return this.read.readSvodka();
  }

  readSheet(sheetName: string): Promise<SheetData> {
    return this.read.readSheet(sheetName);
  }

  getCellValue(sheetName: string, cell: string): Promise<number> {
    return this.read.getCellValue(sheetName, cell);
  }

  getBatchData(ranges: string[]): Promise<string[][][]> {
    return this.read.getBatchData(ranges);
  }

  getValuesWithFormulas(range: string): Promise<string[][]> {
    return this.read.getValuesWithFormulas(range);
  }

  async calculateBalance(): Promise<{
    totalIncome: number;
    totalExpense: number;
    balance: number;
  }> {
    try {
      const svodkaSheet = 'Сводка';
  
      const [totalExpense, totalIncome, balance] = await Promise.all([
        this.read.getCellValue(svodkaSheet, 'C24'),
        this.read.getCellValue(svodkaSheet, 'I24'),
        this.read.getCellValue(svodkaSheet, 'E15'),
      ]);
  
      this.logger.log(
        `Balance from Сводка: income=${totalIncome}, expense=${totalExpense}, balance=${balance}`,
      );
  
      return { totalIncome, totalExpense, balance };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`calculateBalance xatolik: ${message}`);
      throw error;
    }
  }

  getAvailableSheets() {
    return this.read.getAvailableSheets();
  }

  getActiveSheet() {
    return this.read.getActiveSheet();
  }

  // ── Write ─────────────────────────────────────────────
  addRow(sheetName: string, rowData: string[]): Promise<void> {
    return this.write.addRow(sheetName, rowData);
  }

  addExpenseRow(sheetName: string, rowData: string[]): Promise<void> {
    return this.write.addExpenseRow(sheetName, rowData);
  }

  addIncomeRow(sheetName: string, rowData: string[]): Promise<void> {
    return this.write.addIncomeRow(sheetName, rowData);
  }

  updateRow(sheetName: string, rowIndex: number, rowData: string[], type: 'income' | 'expense'): Promise<void> {
    return this.write.updateRow(sheetName, rowIndex, rowData, type);
  }

  deleteRow(sheetName: string, rowIndex: number): Promise<void> {
    return this.write.deleteRow(sheetName, rowIndex);
  }

  setActiveSheet(sheetName: string) {
    return this.write.setActiveSheet(sheetName);
  }

  // ── Category & Amounts ────────────────────────────────
  getCategories() {
    return this.category.getCategories();
  }

  getValidCategories() {
    return this.category.getValidCategories();
  }

  validateCategoryStrict(category: string, type: 'income' | 'expense') {
    return this.category.validateCategoryStrict(category, type);
  }

  getInitialAmount() {
    return this.category.getInitialAmount();
  }

  setInitialAmount(amount: number) {
    return this.category.setInitialAmount(amount);
  }

  getInitialAmounts() {
    return this.category.getInitialAmounts();
  }

  updateInitialAmount(rowIndex: number, amount: number) {
    return this.category.updateInitialAmount(rowIndex, amount);
  }

  // src/google-sheets/google-sheets.service.ts


async getFullMonthData(sheetName: string) {
  // Sizda tayyor getBatchData metodi bor, shundan foydalanamiz
  const ranges = [`${sheetName}!B5:E100`, `${sheetName}!G5:J100` || ''];
  const batchData = await this.read.getBatchData(ranges);

  const expenseRows = batchData[0] || [];
  const incomeRows = batchData[1] || [];

  const parseRow = (row: any[], index: number, type: 'expense' | 'income') => ({
    id: `${type}-row-${index + 4}`,
    type,
    date: row[0] || '',
    amount: row[1] ? parseInt(String(row[1]).replace(/\s/g, '')) : 0,
    category: row[2] || '',
    description: row[3] || '',
  });

  const expenses = expenseRows
    .map((row, index) => parseRow(row, index, 'expense'))
    .filter(item => item.date);

  const incomes = incomeRows
    .map((row, index) => parseRow(row, index, 'income'))
    .filter(item => item.date);

  return {
    sheetName,
    expenses,
    incomes,
    totalCount: expenses.length + incomes.length
  };
}


}