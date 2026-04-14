import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SheetsBaseService } from './sheets.base.service';

@Injectable()
export class SheetsCategoryService extends SheetsBaseService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  async getCategories(): Promise<{ name: string; type: string }[]> {
    try {
      const response = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: this.spreadsheetId,
        ranges: ['Сводка!B38:B1000', 'Сводка!H38:H1000'],
      });

      const vals = response.data.valueRanges || [];

      const expenses = (vals[0]?.values || [])
        .flat()
        .filter((c) => c && isNaN(Number(c)))
        .map((name) => ({ name, type: 'expense' }));

      const income = (vals[1]?.values || [])
        .flat()
        .filter((c) => c && isNaN(Number(c)))
        .map((name) => ({ name, type: 'income' }));

      return [...expenses, ...income];
    } catch (error: unknown) {
      this.logger.error(`getCategories xatolik: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async getValidCategories(): Promise<{ expenses: string[]; income: string[] }> {
    const ranges = ['Сводка!B28:B45', 'Сводка!H28:H45'];
    const response = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges,
    });
    const data = (response.data.valueRanges ?? []).map((r) => r.values ?? [[]]);

    return {
      expenses: data[0]?.flat().filter((c) => c && isNaN(Number(c))) || [],
      income: data[1]?.flat().filter((c) => c && isNaN(Number(c))) || [],
    };
  }

  async validateCategoryStrict(
    category: string,
    type: 'income' | 'expense',
  ): Promise<{ isValid: boolean; normalized?: string }> {
    try {
      const range = type === 'expense' ? 'Сводка!B28:B45' : 'Сводка!H28:H45';
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });

      const validCategories = response.data.values?.flat().filter((c) => c) || [];
      const trimmed = category.trim();

      const exact = validCategories.find((c) => c === trimmed);
      if (exact) return { isValid: true, normalized: exact };

      const insensitive = validCategories.find(
        (c) => c.toLowerCase() === trimmed.toLowerCase(),
      );
      if (insensitive) {
        this.logger.warn(`⚠️ Case mismatch: "${trimmed}" -> "${insensitive}"`);
        return { isValid: true, normalized: insensitive };
      }

      return { isValid: false };
    } catch (error: unknown) {
      this.logger.error(`validateCategoryStrict xatolik: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false };
    }
  }

  async getInitialAmount(): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Сводка!I8',
      });
      const raw = response.data.values?.[0]?.[0];
      if (!raw) return 0;
      return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
    } catch (error: unknown) {
      this.logger.error(`getInitialAmount xatolik: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  async setInitialAmount(amount: number): Promise<void> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Сводка!I8',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[String(amount)]] },
      });
      this.logger.log(`✅ Initial amount set: ${amount}`);
    } catch (error: unknown) {
      this.logger.error(`setInitialAmount xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getInitialAmounts(): Promise<{
    items: { label: string; amount: number }[];
    totalBalance: number;
    currentBalance: number;
  }> {
    try {
      const [amountsResp, balanceResp, currentBalanceResp] = await Promise.all([
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'Сводка!C17:E21',
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'Сводка!F17',
        }),
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: 'Сводка!H17',
        }),
      ]);

      const parse = (str: string | undefined): number =>
        parseFloat((str || '').replace(/\s/g, '').replace(',', '.')) || 0;

      return {
        items: (amountsResp.data.values || []).map((row) => ({
          label: row[0] || '',
          amount: parse(row[2]),
        })),
        totalBalance: parse(String(balanceResp.data.values?.[0]?.[0] || '')),
        currentBalance: parse(String(currentBalanceResp.data.values?.[0]?.[0] || '')),
      };
    } catch (error: unknown) {
      this.logger.error(`getInitialAmounts xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async updateInitialAmount(
    rowIndex: number,
    amount: number,
  ): Promise<{ success: boolean; message: string; sheetRow: number; amount: number }> {
    let sheetRow: number;

    if (rowIndex >= 17 && rowIndex <= 21) {
      sheetRow = rowIndex;
    } else if (rowIndex >= 0 && rowIndex <= 4) {
      sheetRow = 17 + rowIndex;
    } else {
      throw new BadRequestException("rowIndex 0–4 yoki 17–21 bo'lishi kerak");
    }

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Сводка!E${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[amount.toString()]] },
      });

      this.logger.log(`✅ InitialAmount ${sheetRow}-qator yangilandi: ${amount}`);
      return { success: true, message: 'Summa muvaffaqiyatli yangilandi', sheetRow, amount };
    } catch (error: unknown) {
      this.logger.error(`updateInitialAmount xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}