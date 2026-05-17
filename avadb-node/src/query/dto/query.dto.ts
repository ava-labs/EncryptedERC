import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryFilterDto {
  @ApiPropertyOptional({ description: 'Filter by owner address (0x…)' })
  @IsOptional()
  @IsString()
  owner?: string;

  @ApiPropertyOptional({ description: '0 = Hot, 1 = Cool' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  state?: number;

  @ApiPropertyOptional({ description: 'Filter private/public chunks' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPrivate?: boolean;

  @ApiPropertyOptional({ description: 'Exact chunkId (bytes32 hex)' })
  @IsOptional()
  @IsString()
  chunkId?: string;

  @ApiPropertyOptional({ description: 'Exact CID string' })
  @IsOptional()
  @IsString()
  cid?: string;
}

export class QueryDto {
  @ApiPropertyOptional({ type: QueryFilterDto })
  @IsOptional()
  filter?: QueryFilterDto;

  @ApiPropertyOptional({
    enum: ['uploadedAt', 'confirmedReplicas'],
    default: 'uploadedAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['uploadedAt', 'confirmedReplicas', 'chunkId'])
  orderBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}
