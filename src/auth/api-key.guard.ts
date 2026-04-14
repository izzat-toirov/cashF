import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class ApiKeyGuard implements CanActivate, OnApplicationShutdown {
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();
  private readonly MAX_REQUESTS_PER_MINUTE = 100;
  private readonly MINUTE_IN_MS = 60_000;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredEntries(),
      this.MINUTE_IN_MS,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // API key olish
    const raw = request.headers['x-api-key'];
    const apiKey = Array.isArray(raw) ? raw[0] : raw;

    // Key yo'q yoki bo'sh
    if (!apiKey) {
      throw new UnauthorizedException('API kalit topilmadi');
    }

    // Rate limit tekshiruvi — 429 Too Many Requests
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    if (!this.checkRateLimit(ip)) {
      throw new HttpException(
        'Juda ko\'p so\'rov. Bir daqiqadan so\'ng urinib ko\'ring.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Key to'g'riligini tekshirish
    const validApiKey = this.configService.get<string>('API_KEY');
    if (apiKey !== validApiKey) {
      throw new UnauthorizedException('API kalit noto\'g\'ri');
    }

    return true;
  }

  private checkRateLimit(clientIp: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitStore.get(clientIp);

    if (!entry || now > entry.resetTime) {
      this.rateLimitStore.set(clientIp, {
        count: 1,
        resetTime: now + this.MINUTE_IN_MS,
      });
      return true;
    }

    if (entry.count >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }

    entry.count++;
    return true;
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitStore) {
      if (now > entry.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  onApplicationShutdown(): void {
    clearInterval(this.cleanupInterval);
  }
}