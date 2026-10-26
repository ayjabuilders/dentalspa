import { ApiProperty } from '@nestjs/swagger';
export class PatientDto {
  @ApiProperty({format:'uuid'}) id!: string;
  @ApiProperty({format:'uuid'}) clinic_id!: string;
  @ApiProperty() display_name!: string;
  @ApiProperty() reference!: string;
}
