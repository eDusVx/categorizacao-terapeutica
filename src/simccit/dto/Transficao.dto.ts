import { IsNotEmpty, IsString } from 'class-validator'

export class TranscricaoDto {
    @IsString()
    @IsNotEmpty()
    transcricao: string
}
