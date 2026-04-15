import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiResponse,
  ApiHeader,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

@ApiTags('Transactions — Tranzaksiyalar')
@ApiHeader({
  name: 'x-api-key',
  description: 'API kalit — autentifikatsiya uchun (.env dagi API_KEY)',
  required: true,
})
@ApiBearerAuth('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService, private readonly sheetsService: GoogleSheetsService,) {}


  @Post()
  @ApiOperation({
    summary: "Yangi tranzaksiya qo'shish",
    description: `
Daromad yoki xarajat qo'shadi. \`date\` yoki \`month\`/\`year\` dan sheet nomi aniqlanadi.

- \`type: "income"\` → G:J ustunlariga (Daromadlar)
- \`type: "expense"\` → B:E ustunlariga (Xarajatlar)
    `.trim(),
  })
  @ApiBody({ type: CreateTransactionDto })
  @ApiResponse({
    status: 201,
    description: "Tranzaksiya muvaffaqiyatli qo'shildi",
    schema: {
      example: {
        success: true,
        data: {
          date: '2026-04-15',
          amount: 500000,
          description: 'Aprel oyi maoshi',
          category: 'Maosh',
          type: 'income',
          sheetName: 'Aprel 2026',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Noto'g'ri ma'lumotlar" })
  @ApiResponse({ status: 401, description: "API key noto'g'ri" })
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }



@Get('recent')
@ApiOperation({ summary: "So'nggi tranzaksiyalar — bugun yoki kecha" })
findRecent(
  @Query('month') month?: string,
  // @Query('year') year?: string,
) {
  const today = new Date();
  const m = month ? Number(month) : today.getMonth() + 1;
  // const y = year ? Number(year) : today.getFullYear();
  return this.transactionsService.findRecent(m);
}


  @Get()
  @ApiOperation({
    summary: "Tranzaksiyalar ro'yxati",
    description:
      "Berilgan oy va yil bo'yicha barcha tranzaksiyalarni qaytaradi. Kiritilmasa joriy oy.",
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Oy raqami (1–12). Default: joriy oy',
    example: 4,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Yil. Default: joriy yil',
    example: 2026,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Sahifa raqami. Default: 1',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Har sahifadagi yozuvlar soni. Default: 10',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: "Tranzaksiyalar ro'yxati",
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
        meta: {
          total: 100,
          page: 1,
          limit: 10,
          totalPages: 10,
        },
      },
    },
  })
  findAll(
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const m = month ? Number(month) : new Date().getMonth() + 1;
    const y = year ? Number(year) : new Date().getFullYear();
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 10;
    return this.transactionsService.findByMonth(m, y, p, l);
  }
  // ── GET /transactions/:id ─────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Bitta tranzaksiyani olish',
    description: "ID bo'yicha aniq bir tranzaksiyani qaytaradi.",
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Tranzaksiya ID si',
    example: 'expense-row-5',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Oy raqami (1–12). Default: joriy oy',
    example: 4,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Yil. Default: joriy yil',
    example: 2026,
  })
  @ApiResponse({
    status: 200,
    description: 'Tranzaksiya topildi',
    schema: {
      example: {
        success: true,
        data: {
          id: 'expense-row-5',
          date: '2026-04-01',
          amount: 50000,
          description: 'Taksi',
          category: 'Transport',
          type: 'expense',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Tranzaksiya topilmadi' })
  findOne(
    @Param('id') id: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.transactionsService.findOne(
      id,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
  }

  // ── PATCH /transactions/:id ───────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({
    summary: 'Tranzaksiyani yangilash',
    description: `
ID bo'yicha mavjud tranzaksiyani yangilaydi.

**ID formati:** \`expense-row-5\` yoki \`income-row-7\`

Bu id \`GET /transactions\` endpointidan qaytgan \`id\` maydonidir.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Tranzaksiya ID si',
    example: 'expense-row-5',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Sheet oyi. Default: joriy oy',
    example: 4,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Sheet yili. Default: joriy yil',
    example: 2026,
  })
  @ApiBody({ type: UpdateTransactionDto })
  @ApiResponse({
    status: 200,
    description: 'Tranzaksiya yangilandi',
    schema: {
      example: {
        success: true,
        data: {
          id: 'expense-row-5',
          type: 'expense',
          date: '2026-04-01',
          amount: 75000,
          description: 'Taksi (yangilangan)',
          category: 'Transport',
          sheetName: 'Aprel 2026',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Noto'g'ri id format" })
  @ApiResponse({ status: 404, description: 'Tranzaksiya topilmadi' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    // month/year ni dto ga qo'shib yuboramiz — service parseId uchun ishlatadi
    const enrichedDto = {
      ...dto,
      month: month ? Number(month) : dto.month,
      year: year ? Number(year) : dto.year,
    };
    return this.transactionsService.update(id, enrichedDto);
  }

  // ── DELETE /transactions/:id ──────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({
    summary: "Tranzaksiyani o'chirish",
    description: `
Google Sheets\'dan o\'sha qatorni to\'liq o\'chiradi.

**ID formati:** \`expense-row-5\` yoki \`income-row-7\`
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Tranzaksiya ID si',
    example: 'income-row-7',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Sheet oyi. Default: joriy oy',
    example: 4,
  })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Sheet yili. Default: joriy yil',
    example: 2026,
  })
  @ApiResponse({
    status: 200,
    description: "Tranzaksiya o'chirildi",
    schema: {
      example: {
        success: true,
        message: "Transaction o'chirildi",
        id: 'income-row-7',
      },
    },
  })
  @ApiResponse({ status: 400, description: "Noto'g'ri id format" })
  remove(
    @Param('id') id: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.transactionsService.remove(
      id,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
  }


  // src/transactions/transactions.controller.ts


@Post('sync-sheet')
@ApiOperation({ summary: "Sheets ma'lumotlarini bazaga saqlash" })
async syncSheet(@Query('monthName') monthName: string) {
  return await this.transactionsService.syncMonthToDatabase(monthName);
}
  
}
