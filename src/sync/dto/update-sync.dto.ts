import { PartialType } from '@nestjs/swagger';
import { SyncWebhookDto } from './create-sync.dto';

export class UpdateSyncDto extends PartialType(SyncWebhookDto) {}
