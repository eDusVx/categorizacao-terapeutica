import { ApiProperty } from '@nestjs/swagger'

export class FalaCategorizada {
    @ApiProperty({
        example: 'Terapeuta',
        description: 'Identificação do falante (Eixo I-1 ou I-3)',
        enum: ['Terapeuta', 'Cliente'],
    })
    falante: 'Terapeuta' | 'Cliente'

    @ApiProperty({
        example: 'Como você tem se sentido ultimamente?',
        description: 'Segmento exato do texto da fala',
    })
    texto: string

    @ApiProperty({
        example: 'SRE',
        description: 'Sigla da categoria SiMCCIT atribuída (ex: SRE, EMP, REL, OPO)',
    })
    categoria: string
}
