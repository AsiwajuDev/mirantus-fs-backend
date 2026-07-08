import { NotFoundException } from '@nestjs/common';

export class OrderNotFoundException extends NotFoundException {
  constructor(id: string) {
    super(`Order ${id} not found`);
  }
}
