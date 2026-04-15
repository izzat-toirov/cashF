import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class SyncWebhookDto {
  @IsString()
  monthName: string;

  @IsOptional()
  @IsNumber()
  row?: number;

  @IsOptional()
  @IsNumber()
  column?: number;

  @IsOptional()
  newValue?: any;

  @IsOptional()
  oldValue?: any;

  @IsOptional()
  @IsArray()
  rowData?: any[];
}