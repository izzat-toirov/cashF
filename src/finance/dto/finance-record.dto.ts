import { IsString, IsNumber, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Yangi moliyaviy yozuv yaratish uchun DTO (Data Transfer Object)
 * Barcha maydonlar majburiy va validatsiya qilinadi
 */
export class CreateFinanceRecordDto {
  @ApiProperty({
    description: 'Operatsiya sanasi (YYYY-MM-DD formatda)',
    example: '2026-03-31',
    required: true,
  })
  @IsString()
  @MaxLength(100)
  date: string;

  @ApiProperty({
    description: 'Summa (musbat raqam)',
    example: 1000,
    required: true,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: "Operatsiya haqida qisqacha ma'lumot",
    example: 'Oylik maosh',
    required: true,
  })
  @IsString()
  @MaxLength(200)
  description: string;

  @ApiProperty({
    description: 'Kategoriya nomi (masalan: Maosh, Ovqat, Transport)',
    example: 'Maosh',
    required: true,
  })
  @IsString()
  @MaxLength(100)
  category: string;

  @ApiProperty({
    description:
      'Operatsiya turi - faqat "income" (daromad) yoki "expense" (xarajat)',
    enum: ['income', 'expense'],
    example: 'income',
    required: true,
  })
  @IsIn(['income', 'expense'])
  type: 'income' | 'expense';
}

/**
 * Mavjud moliyaviy yozuvni yangilash uchun DTO
 * Barcha maydonlar ixtiyoriy - faqat o'zgartiriladigan maydonlar yuboriladi
 */
export class UpdateFinanceRecordDto {
  @ApiPropertyOptional({
    description: "Yangi sana (agar o'zgartirilayotgan bo'lsa)",
    example: '2026-03-30',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    description: "Yangi summa (agar o'zgartirilayotgan bo'lsa)",
    example: 75,
  })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({
    description: "Yangi tavsif (agar o'zgartirilayotgan bo'lsa)",
    example: 'Yangilangan mahsulotlar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description: "Yangi kategoriya (agar o'zgartirilayotgan bo'lsa)",
    example: 'Oziq-ovqat',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: "Yangi operatsiya turi (agar o'zgartirilayotgan bo'lsa)",
    enum: ['income', 'expense'],
    example: 'expense',
  })
  @IsOptional()
  @IsIn(['income', 'expense'])
  type?: 'income' | 'expense';
}
