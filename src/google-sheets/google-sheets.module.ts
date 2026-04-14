import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service';
import { SheetsBaseService } from './services/sheets.base.service';
import { SheetsReadService } from './services/sheets.read.service';
import { SheetsWriteService } from './services/sheets.write.service';
import { SheetsCategoryService } from './services/sheets.category.service';

@Module({
  providers: [
    SheetsBaseService,
    SheetsReadService,
    SheetsWriteService,
    SheetsCategoryService,
    GoogleSheetsService,
  ],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}