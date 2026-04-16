import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncWebhookDto } from './dto/create-sync.dto';
import { google, sheets_v4 } from 'googleapis';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private sheets!: sheets_v4.Sheets;

  private readonly SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID!;

  private readonly monthMap: Record<string, number> = {
    Yanvar: 1,  Fevral: 2,  Mart: 3,    Aprel: 4,
    May: 5,     Iyun: 6,    Iyul: 7,    Avgust: 8,
    Sentabr: 9, Oktabr: 10, Noyabr: 11, Dekabr: 12,
  };

  // Sheets tab nomlari (Uzbekcha — spreadsheet dagi tab nomlariga mos bo'lishi kerak)
  private readonly sheetTabs = [
    'Yanvar', 'Fevral', 'Mart',    'Aprel',
    'May',    'Iyun',   'Iyul',    'Avgust',
    'Sentabr','Oktabr', 'Noyabr',  'Dekabr',
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Google Sheets API client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.logger.log('🚀 SyncService ishga tushdi — Webhook + Cron (Sheets) tayyor');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // sheetRowId FORMAT: "3-2026-income-6"  (monthNum-year-type-rowNum)
  // ─────────────────────────────────────────────────────────────────────────────
  private generateSheetRowId(
    monthName: string,
    row: number | string,
    type: string,
  ): string {
    const monthNum = this.getMonthNumber(monthName);
    const rowNum   = String(row).replace(/\D+/g, '');
    return `${monthNum}-2026-${type.toLowerCase()}-${rowNum}`;
  }

  private getMonthNumber(monthName: string): number {
    return this.monthMap[monthName] ?? new Date().getMonth() + 1;
  }

  private parseDate(dateStr: string): Date {
    const parts = String(dateStr).split('.');
    if (parts.length === 3) {
      return new Date(+parts[2], +parts[1] - 1, +parts[0]);
    }
    return new Date();
  }

  private parseAmount(val: any): number {
    return Number(String(val ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEBHOOK HANDLER — Sheets onEdit triggeridan keladi
  // ─────────────────────────────────────────────────────────────────────────────
  async syncSingleRow(dto: SyncWebhookDto) {
    const { monthName, rowData, row } = dto;

    if (!rowData || rowData.length < 4 || !row) {
      return { success: false, message: "Ma'lumotlar yetarli emas" };
    }

    try {
      const [dateStr, amount, categoryName, description, rowType] = rowData;
      const transactionType = (rowType || 'expense').toLowerCase();
      const sheetRowId      = this.generateSheetRowId(monthName, row, transactionType);

      // Qator bo'sh — o'chirish
      if (!dateStr && !amount && !categoryName) {
        return await this.deleteBySheetRowId(sheetRowId);
      }

      return await this.upsertTransaction({
        sheetRowId,
        dateStr:      String(dateStr),
        amount:       this.parseAmount(amount),
        categoryName: String(categoryName || 'Nomalum'),
        description:  String(description ?? ''),
        type:         transactionType,
        monthName,
      });

    } catch (error: any) {
      this.logger.error(`Webhook xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CRON — har 20 daqiqada Sheets → Database to'liq solishtirish
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron('*/20 * * * *')
  async cronSyncFromSheets() {
    this.logger.log('⏰ Cron: Sheets → DB solishtirish boshlandi');

    let totalUpserted = 0;
    let totalDeleted  = 0;

    for (const monthName of this.sheetTabs) {
      try {
        const result = await this.syncMonthFromSheets(monthName);
        totalUpserted += result.upserted;
        totalDeleted  += result.deleted;
      } catch (e: any) {
        // Tab mavjud bo'lmasa (masalan Iyul hali kelmagan) — skip
        this.logger.warn(`⚠️  ${monthName} tab topilmadi yoki xato: ${e.message}`);
      }
    }

    this.logger.log(`✅ Cron tugadi — upserted=${totalUpserted}, deleted=${totalDeleted}`);
    return { totalUpserted, totalDeleted };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bitta oy uchun Sheets → DB sinxronlash
  // ─────────────────────────────────────────────────────────────────────────────
  private async syncMonthFromSheets(monthName: string) {
    const monthNum = this.getMonthNumber(monthName);

    // Sheets dan o'qish:
    // Расходы: B:E (sana, summa, kategoriya, izoh) — 5-qatordan
    // Доходы:  G:J (sana, summa, kategoriya, izoh) — 5-qatordan
    const [expenseRes, incomeRes] = await Promise.all([
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.SPREADSHEET_ID,
        range:         `${monthName}!B5:E`,
      }),
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.SPREADSHEET_ID,
        range:         `${monthName}!G5:J`,
      }),
    ]);

    const expenseRows = expenseRes.data.values ?? [];
    const incomeRows  = incomeRes.data.values  ?? [];

    // Sheets dagi barcha sheetRowId lar (mavjud qatorlar)
    const sheetIds = new Set<string>();

    // Expense qatorlarni upsert
    let upserted = 0;
    for (let i = 0; i < expenseRows.length; i++) {
      const [dateStr, amount, categoryName, description] = expenseRows[i];
      if (!dateStr && !amount && !categoryName) continue; // bo'sh qator — skip

      const rowNum     = i + 5; // Sheets da 5-qatordan boshlanadi
      const sheetRowId = this.generateSheetRowId(monthName, rowNum, 'expense');
      sheetIds.add(sheetRowId);

      await this.upsertTransaction({
        sheetRowId,
        dateStr:      String(dateStr ?? ''),
        amount:       this.parseAmount(amount),
        categoryName: String(categoryName || 'Nomalum'),
        description:  String(description ?? ''),
        type:         'expense',
        monthName,
      });
      upserted++;
    }

    // Income qatorlarni upsert
    for (let i = 0; i < incomeRows.length; i++) {
      const [dateStr, amount, categoryName, description] = incomeRows[i];
      if (!dateStr && !amount && !categoryName) continue;

      const rowNum     = i + 5;
      const sheetRowId = this.generateSheetRowId(monthName, rowNum, 'income');
      sheetIds.add(sheetRowId);

      await this.upsertTransaction({
        sheetRowId,
        dateStr:      String(dateStr ?? ''),
        amount:       this.parseAmount(amount),
        categoryName: String(categoryName || 'Nomalum'),
        description:  String(description ?? ''),
        type:         'income',
        monthName,
      });
      upserted++;
    }

    // DB da bor lekin Sheets da yo'q qatorlarni o'chirish
    const dbRows = await this.prisma.transaction.findMany({
      where:  { month: monthNum, year: 2026 },
      select: { id: true, sheetRowId: true },
    });

    const toDelete = dbRows
      .filter(tx => tx.sheetRowId && !sheetIds.has(tx.sheetRowId))
      .map(tx => tx.id);

    let deleted = 0;
    if (toDelete.length > 0) {
      const result = await this.prisma.transaction.deleteMany({
        where: { id: { in: toDelete } },
      });
      deleted = result.count;
      this.logger.log(`🗑️  ${monthName}: ${deleted} ta Sheets da yo'q yozuv o'chirildi`);
    }

    this.logger.log(`✅ ${monthName}: upserted=${upserted}, deleted=${deleted}`);
    return { upserted, deleted };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Upsert yordamchi metod
  // ─────────────────────────────────────────────────────────────────────────────
  private async upsertTransaction(params: {
    sheetRowId:   string;
    dateStr:      string;
    amount:       number;
    categoryName: string;
    description:  string;
    type:         string;
    monthName:    string;
  }) {
    const { sheetRowId, dateStr, amount, categoryName, description, type, monthName } = params;

    // O'zgarish yo'q bo'lsa — skip
    const existing = await this.prisma.transaction.findUnique({
      where: { sheetRowId },
    });
    if (existing && existing.amount === amount && existing.description === description) {
      return { success: true, message: "O'zgarish yo'q", data: existing };
    }

    const category = await this.prisma.category.upsert({
      where:  { name: categoryName },
      update: {},
      create: { name: categoryName, type },
    });

    const txData = {
      date:        this.parseDate(dateStr),
      amount,
      description,
      type,
      month:       this.getMonthNumber(monthName),
      year:        2026,
      categoryId:  category.id,
      sheetRowId,
    };

    const result = await this.prisma.transaction.upsert({
      where:  { sheetRowId },
      update: txData,
      create: txData,
    });

    this.logger.log(`💾 Upsert: ${sheetRowId} | amount=${amount}`);
    return { success: true, message: 'Sinxronlandi', data: result };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // YORDAMCHI: o'chirish
  // ─────────────────────────────────────────────────────────────────────────────
  private async deleteBySheetRowId(sheetRowId: string) {
    try {
      const deleted = await this.prisma.transaction.deleteMany({
        where: { sheetRowId },
      });
      this.logger.log(`🗑️ O'chirildi: ${sheetRowId} | count=${deleted.count}`);
      return { success: true, message: "O'chirildi", deleted: deleted.count };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL: bir marta barcha oylarni Sheets dan sync qilish
  // ─────────────────────────────────────────────────────────────────────────────
  async runFullCleanup() {
    this.logger.log('🔄 Manual full sync boshlandi...');
    return await this.cronSyncFromSheets();
  }

  async syncCategoryFromSheet(data: { name: string; type: string }) {
    try {
      const result = await this.prisma.category.upsert({
        where:  { name: data.name },
        update: { type: data.type },
        create: { name: data.name, type: data.type },
      });
      this.logger.log(`📂 Category synced: ${result.name} (${result.type})`);
      return { success: true, data: result };
    } catch (error: any) {
      this.logger.error(`Category sync xatosi: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}