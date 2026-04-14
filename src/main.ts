import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const server = express();
export default server; // ← Vercel uchun

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Moliya Boshqaruv API')
    .setDescription(
      'Shaxsiy moliyani boshqarish uchun API. Daromad va xarajatlarni hisobga olish, Google Sheets bilan integratsiya.',
    )
    .setVersion('1.0')
    .addTag('Finance', 'Moliyaviy operatsiyalar - daromad va xarajatlar')
    .addTag('Categories', 'Kategoriyalar - daromad va xarajat turlari')
    .addTag('Health', 'Salomatlikni tekshirish - API ishlayotganini tekshirish')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'x-api-key')
    .build();
    

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
    customSiteTitle: 'Moliya Boshqaruv API Docs',
    swaggerOptions: {
      dom_id: '#swagger-ui',
      displayRequestDuration: true,
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`Ilova ishga tushdi: http://localhost:${port}`);
    console.log(`Swagger hujjatlari: http://localhost:${port}/docs`);
  } else {
    await app.init();
  }
}

bootstrap();