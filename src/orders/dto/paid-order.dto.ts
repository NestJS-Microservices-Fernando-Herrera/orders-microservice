import { IsObject, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class PaidOrderDto {
  @IsString()
  paypalPaymentId: string;

  @IsString()
  @IsUUID()
  orderId: string;

  @IsString()
  @IsUrl()
  @IsOptional()
  receiptUrl?: string;

  @IsObject()
  receiptData: object;
}
