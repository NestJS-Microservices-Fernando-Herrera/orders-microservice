import { OrderStatus } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';
import { UUID } from 'crypto';
import { OrderStatusList } from './enum/order.enum';

export class ChangeOrderStatusDto {
  @IsUUID(4)
  id: UUID;

  @IsEnum(OrderStatusList, {
    message: `Valid status are ${OrderStatusList}`,
  })
  status: OrderStatus;
}
