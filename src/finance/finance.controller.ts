import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import {
  CreateFinanceRecordDto,
  UpdateFinanceRecordDto,
} from './dto/finance-record.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionsService } from '../transactions/transactions.service';

@Controller('finance')
@UseGuards(ApiKeyGuard)
@ApiTags('Finance — Moliyaviy yozuvlar')
@ApiHeader({
  name: 'x-api-key',
  description: 'API kalit — autentifikatsiya uchun (.env dagi API_KEY)',
  required: true,
})
@ApiBearerAuth('x-api-key')
export class FinanceController {
  constructor(private financeService: FinanceService, private readonly transactionsService: TransactionsService,) {}

  @Post('sync-sheet')
  @ApiOperation({ 
    summary: "Sheets ma'lumotlarini bazaga saqlash (Sync)",
    description: "Berilgan oy nomi (masalan: 'Aprel 2026') bo'yicha Sheets'dagi barcha ma'lumotlarni bazaga ko'chiradi." 
  })
  @ApiQuery({ name: 'monthName', example: 'Aprel 2026', required: true })
  async syncSheet(@Query('monthName') monthName: string) {
    return await this.transactionsService.syncMonthToDatabase(monthName);
  }

  // ── 2. Kategoriyalarni sinxronizatsiya qilish ──────────────
  @Post('sync-categories')
  @ApiOperation({ 
    summary: "Kategoriyalarni bazaga saqlash",
    description: "Sheets'dagi kategoriyalar ro'yxatini olib, bazadagi Category jadvaliga saqlaydi." 
  })
  async syncCategories() {
    return await this.financeService.syncCategoriesToDb();
  }








  @Post()
  @ApiOperation({
    summary: "Yangi moliyaviy yozuv qo'shish",
    description: `
Daromad yoki xarajat qo'shadi. \`date\` maydonidan avtomatik sheet nomi aniqlanadi.

- \`type: "income"\` → G:J ustunlariga yoziladi
- \`type: "expense"\` → B:E ustunlariga yoziladi
    `.trim(),
  })
  @ApiBody({ type: CreateFinanceRecordDto })
  @ApiResponse({
    status: 201,
    description: "Yozuv muvaffaqiyatli qo'shildi",
    schema: {
      example: {
        message: "Ma'lumot muvaffaqiyatli saqlandi",
        data: null,
      },
    },
  })
  @ApiResponse({ status: 400, description: "Noto'g'ri so'rov ma'lumotlari" })
  @ApiResponse({
    status: 401,
    description: "Autentifikatsiya xatosi (x-api-key noto'g'ri)",
  })
  async addRecord(@Body() dto: CreateFinanceRecordDto) {
    const result = await this.financeService.addFinanceRecord(dto);
    return { message: "Ma'lumot muvaffaqiyatli saqlandi", data: result };
  }


  @Get()
  @ApiOperation({
    summary: 'Joriy oy yozuvlarini olish',
    description:
      "Joriy oy va yil bo'yicha Google Sheets'dan barcha yozuvlarni qaytaradi.",
  })
  @ApiResponse({
    status: 200,
    description: 'Joriy oy yozuvlari',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'expense-row-5',
            date: '2026-04-01',
            amount: 50000,
            description: 'Taksi',
            category: 'Transport',
            type: 'expense',
          },
          {
            id: 'income-row-5',
            date: '2026-04-01',
            amount: 5000000,
            description: 'Maosh',
            category: 'Maosh',
            type: 'income',
          },
        ],
      },
    },
  })
  async getCurrentMonthRecords() {
    return this.financeService.getCurrentMonthRecords();
  }


  @Get('balance')
  @ApiOperation({
    summary: 'Balansni hisoblash',
    description:
      'Joriy oy uchun jami daromad, xarajat va sof balansni qaytaradi.',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Yil. Default: joriy yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Oy (1–12). Default: joriy oy',
    example: 4,
  })
  @ApiResponse({
    status: 200,
    description: "Balans ma'lumotlari",
    schema: {
      example: {
        totalIncome: 1500000,
        totalExpense: 1000000,
        balance: 500000,
      },
    },
  })
  async getBalance(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.financeService.calculateBalance(
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
  }


  @Get('categories')
  @ApiOperation({
    summary: "Kategoriyalar ro'yxati",
    description: "Google Sheets'dagi \"Kategoriyalar\" varag'idan o'qiydi.",
  })
  @ApiResponse({
    status: 200,
    description: 'Kategoriyalar',
    schema: {
      example: [
        { name: 'Maosh', type: 'income' },
        { name: 'Transport', type: 'expense' },
      ],
    },
  })
  async getCategories() {
    return this.financeService.getCategories();
  }


  @Get('records')
  @ApiOperation({
    summary: "Filter bo'yicha yozuvlarni olish",
    description: `
- \`year\` + \`month\` → o'sha oyning yozuvlari
- Faqat \`year\` → butun yilning barcha oylari
- Hech narsa yo'q → joriy oy
    `.trim(),
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Oy (1–12)',
    example: 4,
  })
  @ApiResponse({ status: 200, description: 'Filtrlangan yozuvlar' })
  async getFilteredRecords(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.financeService.getFilteredRecords(
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
  }

  // ── GET /finance/month ────────────────────────────────────────────────────────

  @Get('month')
  @ApiOperation({
    summary: 'Aniq bir oy yozuvlarini olish',
  })
  @ApiQuery({
    name: 'year',
    type: Number,
    required: true,
    description: 'Yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'month',
    type: Number,
    required: true,
    description: 'Oy (1–12)',
    example: 4,
  })
  @ApiResponse({ status: 200, description: "So'ralgan oy yozuvlari" })
  @ApiResponse({ status: 400, description: "Noto'g'ri yil/oy parametrlari" })
  async getMonthRecords(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.financeService.getMonthRecords(parseInt(year), parseInt(month));
  }

  // ── PUT /finance/:id ──────────────────────────────────────────────────────────

  @Put(':id')
  @ApiOperation({
    summary: 'Moliyaviy yozuvni yangilash',
    description: `
\`id\` formati: \`expense-row-5\` yoki \`income-row-7\`

Bu id \`GET /finance\` endpointidan qaytgan \`id\` maydonidir.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Yozuv ID si',
    example: 'expense-row-5',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Sheet yili.  Default: joriy yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Sheet oyi.   Default: joriy oy',
    example: 4,
  })
  @ApiBody({ type: UpdateFinanceRecordDto })
  @ApiResponse({ status: 200, description: 'Yozuv muvaffaqiyatli yangilandi' })
  @ApiResponse({ status: 400, description: "Noto'g'ri id format" })
  @ApiResponse({ status: 404, description: 'Yozuv topilmadi' })
  async updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateFinanceRecordDto,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.financeService.updateFinanceRecord(
      id,
      dto,
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
    return { message: 'Yozuv muvaffaqiyatli yangilandi', id };
  }

  // ── DELETE /finance/:id ───────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({
    summary: "Moliyaviy yozuvni o'chirish",
    description: `
\`id\` formati: \`expense-row-5\` yoki \`income-row-7\`

Google Sheets\'dan o\'sha qatorni to\'liq o\'chiradi.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Yozuv ID si',
    example: 'income-row-7',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Sheet yili. Default: joriy yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Sheet oyi.  Default: joriy oy',
    example: 4,
  })
  @ApiResponse({ status: 200, description: "Yozuv muvaffaqiyatli o'chirildi" })
  @ApiResponse({ status: 400, description: "Noto'g'ri id format" })
  @ApiResponse({ status: 404, description: 'Yozuv topilmadi' })
  async deleteRecord(
    @Param('id') id: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    await this.financeService.deleteFinanceRecord(
      id,
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
    );
    return { message: "Yozuv muvaffaqiyatli o'chirildi", id };
  }


  @Get('initial-amounts')
@ApiOperation({
  summary: "Boshlang'ich summalarni olish",
  description: `Сводка sheetidan D17:E21 oralig'idagi boshlang'ich summalarni qaytaradi.
- 0: Uzum bank karta
- 1: Uzcard 2582
- 2: Naqd pullar so'm
- 3: Naqd AQSH dollari
- 4: Va boshqalar`,
})
@ApiResponse({
  status: 200,
  description: "Boshlang'ich summalar ro'yxati",
})
async getInitialAmounts() {
  return this.financeService.getInitialAmounts();
}

@Patch('initial-amounts/:rowIndex')
@ApiOperation({
  summary: "Boshlang'ich summani yangilash",
  description: `Сводка sheetidagi E17:E21 qatorlaridan birini yangilaydi.

rowIndex qiymatlari:
- 0 → Uzum bank karta (E17)
- 1 → Uzcard 2582 (E18)
- 2 → Naqd pullar so'm (E19)
- 3 → Naqd AQSH dollari (E20)
- 4 → Va boshqalar (E21)`,
})
@ApiParam({
  name: 'rowIndex',
  type: Number,
  description: 'Qator indeksi (0–4)',
  example: 0,
})
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      amount: {
        type: 'number',
        example: 150000,
        description: "Yangi summa",
      },
    },
    required: ['amount'],
  },
})
@ApiResponse({
  status: 200,
  description: "Summa muvaffaqiyatli yangilandi",
})
@ApiResponse({
  status: 400,
  description: "Noto'g'ri rowIndex (0–4 bo'lishi kerak)",
})
async updateInitialAmount(
  @Param('rowIndex', ParseIntPipe) rowIndex: number,
  @Body('amount') amount: number,
) {
  return await this.financeService.updateInitialAmount(rowIndex, amount);
}


@Get('sheets')
@ApiOperation({
  summary: "Google Sheets dagi mavjud oylar ro'yxati",
  description: "Сводка sheetidagi F2 katakdan mavjud sheet nomlarini qaytaradi.",
})
@ApiResponse({
  status: 200,
  schema: {
    example: {
      sheets: ['Mart', 'Aprel', 'May', 'Iyun']
    }
  }
})
async getAvailableSheets() {
  return this.financeService.getAvailableSheets();
}


@Patch('sheets/active')
@ApiOperation({
  summary: "Сводка F2 katakdagi aktiv oyni o'zgartirish",
  description: "F2 dagi dropdown qiymatini yangi oy nomi bilan yangilaydi.",
})
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      sheetName: {
        type: 'string',
        example: 'May',
        description: "Yangi aktiv oy nomi (F2 dropdown qiymati)",
      },
    },
    required: ['sheetName'],
  },
})
@ApiResponse({ status: 200, description: "Aktiv oy muvaffaqiyatli o'zgartirildi" })
async setActiveSheet(@Body('sheetName') sheetName: string) {
  return this.financeService.setActiveSheet(sheetName);
}

@Get('sheets/active')
@ApiOperation({
  summary: "Hozirgi aktiv oyni olish",
  description: "Сводка sheetidagi F2 katakdagi joriy qiymatni qaytaradi.",
})
@ApiResponse({
  status: 200,
  schema: {
    example: { name: 'Aprel 2025', month: 4, year: 2025 }
  }
})
async getActiveSheet() {
  return this.financeService.getActiveSheet();
}

}
