import { ApiProperty } from '@nestjs/swagger';
export class WorkspaceDto {
  @ApiProperty({format:'uuid'}) user_id!: string;
  @ApiProperty({format:'uuid'}) clinic_id!: string;
  @ApiProperty({type:[String],enum:['dentist','reception','assistant','manager'],isArray:true}) roles!: string[];
  @ApiProperty({enum:['connected']}) mode!: string;
}
