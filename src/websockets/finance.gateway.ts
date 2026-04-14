// import {
//   SubscribeMessage,
//   WebSocketGateway,
//   OnGatewayInit,
//   WebSocketServer,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Logger, Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { Server, Socket } from 'socket.io';

// interface BroadcastPayload {
//   type: 'record' | 'summary' | 'newRecord' | 'updatedRecord' | 'deletedRecord';
//   data: unknown;
// }

// interface FinancePayload { 
//   records: unknown[]; 
//   summary: unknown;
// }

// interface TransactionPayload { 
//   transactions: unknown[]; 
//   total: number;
// }

// interface FinanceDataPayload {
//   records: unknown;
//   summary: unknown;
//   timestamp: string;
// }

// @WebSocketGateway({
//   cors: {
//     origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
// })
// @Injectable()
// export class FinanceGateway
//   implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer() server: Server;
//   private logger: Logger = new Logger('FinanceGateway');

//   constructor(private configService: ConfigService) {}

//   afterInit(server: Server) {
//     this.logger.log('WebSocket Gateway initialized');
//   }

//   handleConnection(client: Socket) {
//     this.logger.log(`Client connected: ${client.id}`);
//   }

//   handleDisconnect(client: Socket) {
//     this.logger.log(`Client disconnected: ${client.id}`);
//   }

//   @SubscribeMessage('subscribeToFinance')
//   async handleSubscribe(client: Socket, payload: { month?: number; year?: number }) {
//     const now = new Date();
//     const month = payload.month ?? now.getMonth() + 1;
//     const year = payload.year ?? now.getFullYear();

//     // Dastlabki ma'lumotlarni yuborish (endpoint orqali olish)
//     try {
//       const baseUrl = this.configService.get('BASE_URL') || 'http://localhost:3000';
//       const apiKey = this.configService.get('API_KEY');
      
//       const controller = new AbortController();
//       const timeoutId = setTimeout(() => controller.abort(), 5000);
      
//       const [financeResponse, budgetResponse] = await Promise.all([
//         fetch(`${baseUrl}/api/finance/month?year=${year}&month=${month}`, {
//           headers: { 'x-api-key': apiKey || '' },
//           signal: controller.signal
//         }),
//         fetch(`${baseUrl}/api/budget/summary?year=${year}&month=${month}`, {
//           headers: { 'x-api-key': apiKey || '' },
//           signal: controller.signal
//         })
//       ]);

//       clearTimeout(timeoutId);

//       const records = await financeResponse.json();
//       const summary = await budgetResponse.json();

//       client.emit('financeData', {
//         type: 'initial',
//         data: {
//           records,
//           summary: summary.data,
//           timestamp: new Date().toISOString(),
//         },
//       });
//     } catch (error) {
//       this.logger.error('Error fetching initial data:', error);
//       client.emit('error', { message: 'Failed to load initial data' });
//     }

//     // Real-time yangilanishlar uchun client'ni qo'shish
//     client.join(`finance_${year}_${month}`);
//     this.logger.log(`Client ${client.id} subscribed to finance_${year}_${month}`);
//   }

//   @SubscribeMessage('unsubscribeFromFinance')
//   handleUnsubscribe(client: Socket) {
//     const rooms = Array.from(client.rooms);
//     rooms.forEach(room => {
//       if (room !== client.id) {
//         client.leave(room);
//       }
//     });
//     this.logger.log(`Client ${client.id} unsubscribed from all rooms`);
//   }

//   async broadcastFinanceUpdate(
//     month: number,
//     year: number,
//     type: BroadcastPayload['type'],
//     data: BroadcastPayload['data'],
//   ) {
//     this.server.to(`finance_${year}_${month}`).emit('financeData', {
//       type,
//       data,
//       timestamp: new Date().toISOString(),
//     });
//   }

//   async broadcastNewRecord(record: BroadcastPayload['data'], month: number, year: number) {
//     await this.broadcastFinanceUpdate(month, year, 'newRecord', record);
//   }

//   async broadcastUpdatedRecord(record: BroadcastPayload['data'], month: number, year: number) {
//     await this.broadcastFinanceUpdate(month, year, 'updatedRecord', record);
//   }

//   async broadcastDeletedRecord(recordId: string, month: number, year: number) {
//     await this.broadcastFinanceUpdate(month, year, 'deletedRecord', { id: recordId });
//   }

//   async broadcastBudgetUpdate(month: number, year: number, summary: BroadcastPayload['data']) {
//     await this.broadcastFinanceUpdate(month, year, 'summary', summary);
//   }
// }
