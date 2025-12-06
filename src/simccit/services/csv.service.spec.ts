import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FalaCategorizada } from '../interfaces/FalaCategorizada.interface'
import { CsvService } from './csv.service'

const csvValido = `falante,texto,categoria
Terapeuta,Oi,
Cliente,Olá,`

const csvInvalido = `nome,frase
A,B`

const csvVazio = ``

describe('CsvService', () => {
    let service: CsvService

    beforeEach(() => {
        service = new CsvService()
        vi.clearAllMocks()
    })

    it('parseCsvToTranscription deve retornar a transcrição formatada corretamente', () => {
        const resultado = service.parseCsvToTranscription(csvValido)
        expect(resultado).toHaveProperty('transcricao')
        expect(resultado.transcricao).toContain('Terapeuta: Oi')
        expect(resultado.transcricao).toContain('Cliente: Olá')
        expect(resultado.transcricao).not.toContain('undefined')
    })

    it('parseCsvToTranscription deve lançar exceção para CSV vazio', () => {
        expect(() => service.parseCsvToTranscription(csvVazio)).toThrow(BadRequestException)
    })

    it('parseCsvToTranscription deve lançar exceção para CSV sem colunas obrigatórias', () => {
        expect(() => service.parseCsvToTranscription(csvInvalido)).toThrow(BadRequestException)
    })

    it('parseCsvToTranscription deve lançar exceção se não houver dados válidos', () => {
        const csvSemDados = `falante,texto,categoria\n,,\n,,`
        expect(() => service.parseCsvToTranscription(csvSemDados)).toThrow(BadRequestException)
    })

    it('reconstructCsvWithCategorization deve gerar o CSV final corretamente', () => {
        const categorizado: FalaCategorizada[] = [
            { falante: 'Terapeuta', texto: 'Oi', categoria: 'SRE' },
            { falante: 'Cliente', texto: 'Olá', categoria: 'OPO' },
        ]

        const csvFinal = service.reconstructCsvWithCategorization(categorizado)

        expect(csvFinal).toContain('"falante","texto","categoria"')
        expect(csvFinal).toContain('"Terapeuta","Oi","SRE"')
        expect(csvFinal).toContain('"Cliente","Olá","OPO"')
    })
})
