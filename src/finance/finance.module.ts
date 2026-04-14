import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [ConfigModule, GoogleSheetsModule, AuthModule, PrismaModule, TransactionsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
