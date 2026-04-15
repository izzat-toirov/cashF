import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class SyncWebhookDto {
  @IsString()
  monthName: string;

  @IsOptional()
  @IsNumber()
  row?: number;

  @IsOptional()
  @IsArray()
  rowData?: any[];

  @IsOptional()
  @IsString()
  type?: string; // Enum xatosi bermasligi uchun string qildik
}