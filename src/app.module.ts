import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleSheetsModule } from './google-sheets/google-sheets.module';
import { FinanceModule } from './finance/finance.module';
import { AuthModule } from './auth/auth.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthModule } from './health/health.module';
// import { WebsocketsModule } from './websockets/websockets.module';
// import { TelegramModule } from './telegram/telegram.module';
import { TelegramService } from './telegram/telegram.service';
import { SyncModule } from './sync/sync.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    GoogleSheetsModule,
    FinanceModule,
    AuthModule,
    TransactionsModule,
    HealthModule,
    SyncModule,
    // WebsocketsModule,
    // TelegramModule,
  ],
  providers: [TelegramService],
})
export class AppModule {}