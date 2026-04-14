import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SheetsBaseService } from './sheets.base.service';

@Injectable()
export class SheetsWriteService extends SheetsBaseService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  async addExpenseRow(sheetName: string, rowData: string[]): Promise<void> {
    try {
      await this.ensureSheetExists(sheetName);
      const nextRow = await this.getNextAvailableRow(sheetName, 'expense');

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!B${nextRow}:E${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowData] },
      });

      this.logger.log(`✅ Xarajat ${nextRow}-qatorga yozildi: ${JSON.stringify(rowData)}`);
    } catch (error: unknown) {
      this.logger.error(`addExpenseRow xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async addIncomeRow(sheetName: string, rowData: string[]): Promise<void> {
    try {
      await this.ensureSheetExists(sheetName);
      const nextRow = await this.getNextAvailableRow(sheetName, 'income');

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!G${nextRow}:J${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowData] },
      });

      this.logger.log(`✅ Daromad ${nextRow}-qatorga yozildi: ${JSON.stringify(rowData)}`);
    } catch (error: unknown) {
      this.logger.error(`addIncomeRow xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async addRow(sheetName: string, rowData: string[]): Promise<void> {
    const type = rowData[rowData.length - 1];

    if (type === 'expense') {
      await this.addExpenseRow(sheetName, [rowData[0], rowData[2], rowData[3], rowData[4]]);
    } else if (type === 'income') {
      await this.addIncomeRow(sheetName, [rowData[0], rowData[3], rowData[4], rowData[2]]);
    } else {
      throw new Error(`Noto'g'ri type: "${type}"`);
    }
  }

  async updateRow(
    sheetName: string,
    rowIndex: number,
    rowData: string[],
    type: 'income' | 'expense',
  ): Promise<void> {
    try {
      await this.ensureSheetExists(sheetName);

      const range = type === 'expense'
        ? `${sheetName}!B${rowIndex}:E${rowIndex}`
        : `${sheetName}!H${rowIndex}:K${rowIndex}`;

      const values = type === 'expense'
        ? rowData
        : [rowData[0], rowData[2], rowData[3], rowData[1]];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] },
      });

      this.logger.log(`✅ Yangilandi: ${range}`);
    } catch (error: unknown) {
      this.logger.error(`updateRow xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async deleteRow(sheetName: string, rowIndex: number): Promise<void> {
    try {
      await this.ensureSheetExists(sheetName);
      const sheetId = await this.getSheetId(sheetName);

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          }],
        },
      });

      this.logger.log(`✅ O'chirildi: ${sheetName} qator ${rowIndex}`);
    } catch (error: unknown) {
      this.logger.error(`deleteRow xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async setActiveSheet(sheetName: string): Promise<{ success: boolean; sheetName: string }> {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: 'Сводка!F2',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[sheetName]] },
      });
  
      this.logger.log(`✅ Aktiv sheet o'zgartirildi: ${sheetName}`);
      return { success: true, sheetName };
    } catch (error: unknown) {
      this.logger.error(`setActiveSheet xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}