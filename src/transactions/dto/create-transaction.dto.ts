import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Matches,
  IsDateString,
} from 'class-validator';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export class CreateTransactionDto {
  @ApiProperty({
    description: 'Tranzaksiya sanasi (YYYY-MM-DD format)',
    example: '2026-04-15',
  })
  @IsString()
  @IsDateString()
  date: string;

  @ApiProperty({
    description: "Summa (UZS, manfiy bo'lmasligi kerak)",
    example: 500000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    description: 'Izoh yoki tavsif',
    example: 'Aprel oyi maoshi',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Kategoriya nomi — "Kategoriyalar" varag\'idagi nom bilan mos kelishi kerak',
    example: 'Maosh',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'Tranzaksiya turi',
    enum: TransactionType,
    enumName: 'TransactionType',
    example: TransactionType.INCOME,
  })
  @IsEnum(TransactionType, {
    message: `type faqat "income" yoki "expense" bo'lishi mumkin`,
  })
  type: TransactionType;

  @ApiPropertyOptional({
    description: 'Oy raqami (1–12). Kiritilmasa date maydonidan aniqlanadi',
    example: 4,
    minimum: 1,
    maximum: 12,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  month?: number;

  @ApiPropertyOptional({
    description: 'Yil. Kiritilmasa date maydonidan aniqlanadi',
    example: 2026,
    minimum: 2000,
  })
  @IsNumber()
  @IsOptional()
  @Min(2000)
  year?: number;
}
