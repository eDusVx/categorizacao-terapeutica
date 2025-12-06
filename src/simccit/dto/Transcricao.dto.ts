import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class TranscricaoDto {
    @ApiProperty({
        description: 'Texto completo do diálogo para ser processado.',
        example: 'Terapeuta: Bom dia, como você está? \nCliente: Tenho me sentido muito ansioso no trabalho.',
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'A transcrição não pode estar vazia.' })
    transcricao: string
}
