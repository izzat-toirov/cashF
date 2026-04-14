import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator'; // Shuni qo'shing

export class SyncWebhookDto {
  @ApiProperty({ 
    example: 'Aprel', 
    description: 'Sinxronizatsiya qilinadigan oy nomi' 
  })
  @IsString()      // Validatsiya uchun shart
  @IsNotEmpty()    // Bo'sh bo'lmasligi uchun
  monthName: string;
}