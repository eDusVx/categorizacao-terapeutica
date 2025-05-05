import { IsNotEmpty, IsString } from 'class-validator'

export class CategorizeCsvDto {
    @IsString()
    @IsNotEmpty()
    csvContent: string
}
