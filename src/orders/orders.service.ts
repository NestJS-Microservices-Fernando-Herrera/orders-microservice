import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, PrismaClient } from '@prisma/client';
import { UUID } from 'crypto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { NATS_SERVICE } from 'src/config/services';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './dto/interfaces/order-with-products.interface';
import { PaidOrderDto } from './dto/paid-order.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database Connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      // 1. Confirmar los ids de los productos
      const productsIds = createOrderDto.items.map((order) => order.productId);

      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productsIds),
      );

      // 2. Cálculos de los valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;

        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // 3. Crear una transacción d ebase de datos
      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Check logs',
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const { status, page, limit } = orderPaginationDto;

    const totalPages = await this.order.count({ where: { status: status } });
    const lastPage = Math.ceil(totalPages / limit);

    return {
      data: await this.order.findMany({
        where: { status: status },
        skip: (page - 1) * limit,
        take: limit,
      }),
      meta: {
        total: totalPages,
        page: page,
        lastPage: lastPage,
      },
    };
  }

  async findOne(id: UUID) {
    try {
      const order = await this.order.findFirst({
        where: { id },
        include: {
          OrderItem: {
            select: {
              id: true,
              productId: true,
              price: true,
              quantity: true,
            },
          },
        },
      });

      if (!order)
        throw new RpcException({
          status: HttpStatus.NOT_FOUND,
          message: `Order with id #${id} not found`,
        });

      const productsId = order.OrderItem.map(
        (orderItem) => orderItem.productId,
      );

      const productsList: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productsId),
      );

      const products = {};

      productsList.forEach((product) => {
        products[product.id] = product;
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products[orderItem.productId].name,
        })),
      };
    } catch (error) {
      throw new RpcException(error);
    }
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) return order;

    return this.order.update({
      where: { id },
      data: {
        status,
      },
    });
  }

  async createPaymentSession(order: OrderWithProducts) {
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );

    return paymentSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    this.logger.log('Orderpaid');
    this.logger.log(paidOrderDto);

    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: OrderStatus.PAID,
        paid: true,
        paidAt: new Date(),
        paypalChargeId: paidOrderDto.paypalPaymentId,

        // La realacion
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
            receiptData: paidOrderDto.receiptData,
          },
        },
      },
    });

    return order;
  }
}
