import { OrderStatus } from '@prisma/client';

export class Order {
  id: string;
  totalAmount: number;
  totalItems: number;

  status: OrderStatus;
  paid: Boolean;
  paidAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
