import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

import { PRIORITIES, type Priority } from '../priority.enum';

export class CreateOrderDto {
  @ApiProperty({
    example: 'b3f1c2e4-0000-0000-0000-000000000001',
    description: 'Submitting partner UUID',
  })
  @IsUUID()
  partnerId!: string;

  @ApiProperty({
    example: 'PT-2026-00417',
    description:
      'Pseudonymous patient reference only — never a real name or MRN',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  patientReference!: string;

  @ApiProperty({
    example: 'Lagos Diagnostics, Ikeja',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  requestedLocation!: string;

  @ApiProperty({ enum: PRIORITIES })
  @IsIn(PRIORITIES)
  priority!: Priority;
}
