import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sheets_v4 } from 'googleapis';
import { FinanceRecord, SheetData, SvodkaData } from '../../common/types/finance.types';
import { SHEET_CONSTANTS } from '../../common/constants/sheets.constants';
import { SheetsBaseService } from './sheets.base.service';

@Injectable()
export class SheetsReadService extends SheetsBaseService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  async getFinanceRecords(sheetName: string): Promise<FinanceRecord[]> {
    const records: FinanceRecord[] = [];

    try {
      const expenseResp = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!B5:E${SHEET_CONSTANTS.MAX_ROWS_PER_REQUEST}`,
      });

      (expenseResp.data.values || []).forEach((row, index) => {
        if (row[0] && row[1]) {
          records.push({
            id: `expense-row-${index + 5}`,
            date: row[0],
            amount: parseFloat(String(row[1]).replace(/[^\d.-]/g, '')) || 0,
            description: row[3] || '',
            category: row[2] || '',
            type: 'expense',
          });
        }
      });
    } catch (error: unknown) {
      this.logger.error(`Xarajat o'qishda xatolik: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const incomeResp = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!G5:J${SHEET_CONSTANTS.MAX_ROWS_PER_REQUEST}`,
      });

      (incomeResp.data.values || []).forEach((row, index) => {
        if (row[0] && row[1]) {
          records.push({
            id: `income-row-${index + 5}`,
            date: row[0],
            amount: parseFloat(String(row[1]).replace(/[^\d.-]/g, '')) || 0,
            category: row[2] || '',
            description: row[3] || '',
            type: 'income',
          });
        }
      });
    } catch (error: unknown) {
      this.logger.error(`Daromad o'qishda xatolik: ${error instanceof Error ? error.message : String(error)}`);
    }

    return records;
  }

  async readSvodka(): Promise<SvodkaData> {
    try {
      const resp = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges: [
          'Сводка!D21', 'Сводка!D22',
          'Сводка!J21', 'Сводка!J22',
          'Сводка!B28:E45', 'Сводка!H28:K45',
        ],
      });

      const vals = resp.data.valueRanges || [];
      const parseNum = (vr: sheets_v4.Schema$ValueRange) =>
        parseFloat(String(vr?.values?.[0]?.[0] || '0').replace(/[^\d.-]/g, '')) || 0;

      return {
        expensePlanned: parseNum(vals[0]),
        expenseActual: parseNum(vals[1]),
        incomePlanned: parseNum(vals[2]),
        incomeActual: parseNum(vals[3]),
        expenseCategories: (vals[4]?.values || [])
          .filter((row: string[]) => row[0])
          .map((row: string[]) => ({
            category: row[0] || '',
            planned: parseFloat(String(row[1] || '0').replace(/[^\d.-]/g, '')) || 0,
            actual: parseFloat(String(row[2] || '0').replace(/[^\d.-]/g, '')) || 0,
            diff: parseFloat(String(row[3] || '0').replace(/[^\d.-]/g, '')) || 0,
          })),
        incomeCategories: (vals[5]?.values || [])
          .filter((row: string[]) => row[0])
          .map((row: string[]) => ({
            category: row[0] || '',
            planned: parseFloat(String(row[1] || '0').replace(/[^\d.-]/g, '')) || 0,
            actual: parseFloat(String(row[2] || '0').replace(/[^\d.-]/g, '')) || 0,
            diff: parseFloat(String(row[3] || '0').replace(/[^\d.-]/g, '')) || 0,
          })),
      };
    } catch (error: unknown) {
      this.logger.error(`readSvodka xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async readSheet(sheetName: string): Promise<SheetData> {
    try {
      await this.ensureSheetExists(sheetName);
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!B:K`,
      });
      const rows = response.data.values || [];
      return { sheetName, headers: rows[0] || [], rows: rows.slice(1) };
    } catch (error: unknown) {
      this.logger.error(`readSheet xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getCellValue(sheetName: string, cell: string): Promise<number> {
    const resp = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${cell}`,
    });
    const raw = resp.data.values?.[0]?.[0] ?? '0';
    return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
  }

  async getBatchData(ranges: string[]): Promise<string[][][]> {
    const response = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges,
    });
    return (response.data.valueRanges ?? []).map((r) => r.values ?? [[]]);
  }

  async getValuesWithFormulas(range: string): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
      valueRenderOption: 'FORMULA',
    });
    return response.data.values ?? [];
  }

  async getAvailableSheets(): Promise<{ name: string; month: number; year: number }[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
  
      const sheetTitles = (response.data.sheets || [])
        .map((s) => s.properties?.title || '')
        .filter((title) => title !== '' && title !== 'Сводка' && title !== 'Kategoriyalar');
  
      return sheetTitles
        .map((name) => {
          const parsed = this.parseSheetName(name);
          return parsed ? { name, ...parsed } : null;
        })
        .filter((s): s is { name: string; month: number; year: number } => s !== null);
    } catch (error: unknown) {
      this.logger.error(`getAvailableSheets xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  async getActiveSheet(): Promise<{ name: string; month: number; year: number }> {
    try {
      const resp = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Сводка!F2',
        valueRenderOption: 'FORMATTED_VALUE', 
      });
  
      const name = resp.data.values?.[0]?.[0];
      this.logger.log(`F2 qiymati: "${name}"`); 
  
      if (!name) throw new Error('F2 katakda qiymat topilmadi');
  
      const parsed = this.parseSheetName(name);
      if (!parsed) {
        this.logger.warn(`Sheet nomi parse qilinmadi: "${name}", raw qaytarilmoqda`);
        return { name, month: 0, year: 0 };
      }
  
      return { name, ...parsed };
    } catch (error: unknown) {
      this.logger.error(`getActiveSheet xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  private parseSheetName(name: string): { month: number; year: number } | null {
    const MONTH_MAP: Record<string, number> = {
      Yanvar: 1, Fevral: 2, Mart: 3, Aprel: 4, May: 5, Iyun: 6,
      Iyul: 7, Avgust: 8, Sentabr: 9, Oktabr: 10, Noyabr: 11, Dekabr: 12,
    };
  
    const parts = name.trim().split(' ');
    if (parts.length === 2) {
      const month = MONTH_MAP[parts[0]];
      const year = parseInt(parts[1]);
      if (month && !isNaN(year)) return { month, year };
    }
    return null;
  }
}