import { IsString, IsOptional } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsOptional()
  checkInNotes?: string;

  @IsString()
  @IsOptional()
  checkInLocation?: string;
}
