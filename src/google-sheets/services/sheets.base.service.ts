import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { SHEET_CONSTANTS } from '../../common/constants/sheets.constants';

@Injectable()
export class SheetsBaseService {
  protected readonly logger = new Logger(SheetsBaseService.name);

  public sheets: sheets_v4.Sheets;
  public spreadsheetId: string;

  protected readonly MONTHS_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
  ];

  constructor(protected configService: ConfigService) {
    const sheetId = this.configService.get<string>('GOOGLE_SHEET_ID');
    if (!sheetId) throw new Error('GOOGLE_SHEET_ID is not configured');
    this.spreadsheetId = sheetId;

    const privateKey = this.configService.get<string>('GOOGLE_PRIVATE_KEY');
    if (!privateKey) throw new Error('GOOGLE_PRIVATE_KEY is not configured');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  getCurrentMonthSheetName(): string {
    return this.MONTHS_UZ[new Date().getMonth()];
  }

  getSheetName(year: number, month: number): string {
    return this.MONTHS_UZ[month - 1];
  }

  async ensureSheetExists(sheetName: string): Promise<void> {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      const exists = spreadsheet.data.sheets?.some(
        (s) => s.properties?.title === sheetName,
      );
      if (!exists) await this.createSheet(sheetName);
    } catch (error: unknown) {
      this.logger.error(`ensureSheetExists xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async createSheet(sheetName: string): Promise<void> {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: `${sheetName}!B2`, values: [['Расходы (Xarajatlar)']] },
            { range: `${sheetName}!H2`, values: [['Доходы (Daromadlar)']] },
            { range: `${sheetName}!B4:E4`, values: [['Sana', 'Summa', 'Tavsif', 'Kategoriya']] },
            { range: `${sheetName}!H4:K4`, values: [['Sana', 'Tavsif', 'Kategoriya', 'Summa']] },
          ],
        },
      });

      this.logger.log(`✅ Sheet yaratildi: ${sheetName}`);
    } catch (error: unknown) {
      this.logger.error(`createSheet xatolik: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async validateSheetNameSync(sheetName: string): Promise<boolean> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Сводка!D10',
      });
      const svodkaMonth = response.data.values?.[0]?.[0];
      return svodkaMonth === sheetName.split(' ')[0];
    } catch (error: unknown) {
      this.logger.error(`validateSheetNameSync xatolik: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  protected async getSheetId(sheetName: string): Promise<number> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === sheetName,
    );
    if (sheet?.properties?.sheetId == null) {
      throw new Error(`Sheet "${sheetName}" topilmadi`);
    }
    return sheet.properties.sheetId;
  }

  protected async getNextAvailableRow(
    sheetName: string,
    type: 'income' | 'expense',
  ): Promise<number> {
    const startRow = 5;
    const column = type === 'expense' ? 'C' : 'H';

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!${column}${startRow}:${column}1000`,
    });

    const rows = response.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || rows[i].length === 0 || !rows[i][0]) return startRow + i;
    }
    return startRow + rows.length;
  }
}