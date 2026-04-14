import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

@ApiTags('Health — Salomatlik tekshiruvi')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  
  constructor(private configService: ConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'API salomatligini tekshirish',
    description:
      "Ilova ishlayotganini tekshirish uchun oddiy endpoint. Agar bu ishlasa, API sog'liqida.",
  })
  @ApiResponse({
    status: 200,
    description: "API sog'liqida ishlamoqda",
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-04-02T12:00:00.000Z',
        uptime: 3600,
        message: 'Personal Finance Tracking API is running',
        dependencies: {
          googleSheets: 'healthy',
          config: 'configured'
        }
      },
    },
  })
  async getHealth() {
    const googleSheetsHealthy = await this.checkGoogleSheetsHealth();
    const configHealthy = this.checkConfigHealth();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Personal Finance Tracking API is running',
      dependencies: {
        googleSheets: googleSheetsHealthy,
        config: configHealthy
      }
    };
  }

  private async checkGoogleSheetsHealth(): Promise<string> {
    try {
      // Simple health check - try to access spreadsheet metadata
      const spreadsheetId = this.configService.get<string>('GOOGLE_SHEET_ID');
      if (!spreadsheetId) {
        return 'missing_config';
      }
      
      // In a real implementation, you might make a lightweight API call here
      // For now, just check if required config exists
      const privateKey = this.configService.get<string>('GOOGLE_PRIVATE_KEY');
      const serviceEmail = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL');
      
      if (privateKey && serviceEmail) {
        return 'healthy';
      }
      return 'missing_config';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Health check failed: ${message}`);
      return 'unhealthy';
    }
  }

  private checkConfigHealth(): string {
    const requiredConfigs = [
      'GOOGLE_SHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL', 
      'GOOGLE_PRIVATE_KEY',
      'API_KEY'
    ];
    
    const missingConfigs = requiredConfigs.filter(
      config => !this.configService.get(config)
    );
    
    return missingConfigs.length === 0 ? 'configured' : 'missing_config';
  }
}
