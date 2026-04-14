import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';

/**
 * Autentifikatsiya va API kalitni tekshirish uchun Controller
 */
@Controller('auth')
@UseGuards(ApiKeyGuard)
@ApiTags('Auth')
@ApiHeader({
  name: 'x-api-key',
  description: 'API kalit - autentifikatsiya uchun',
  required: true,
})
@ApiBearerAuth('x-api-key')
export class AuthController {
  /**
   * API kalitning to'g'riligini tekshirish
   * Agar kalit to'g'ri bo'lsa, authenticated: true qaytaradi
   */
  @Get('verify')
  @ApiOperation({ summary: 'API kalitni tekshirish' })
  @ApiResponse({ status: 200, description: 'Autentifikatsiya muvaffaqiyatli' })
  @ApiResponse({
    status: 401,
    description: "Autentifikatsiya xatosi - noto'g'ri kalit",
  })
  verifyApiKey() {
    return { authenticated: true };
  }
}
