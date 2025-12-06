import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts'
import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common'
import { z } from 'zod'
import { FalaCategorizada } from '../interfaces/FalaCategorizada.interface'
import { CsvService } from './csv.service'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

@Injectable()
export class SimccitService implements OnModuleInit {
    private readonly logger = new Logger(SimccitService.name)
    private readonly apiKey = process.env.API_KEY
    private readonly modelName = process.env.MODEL || "models/gemini-flash-latest"
    private parser: StructuredOutputParser<typeof this.outputSchema>
    private formattedPrompt: FewShotPromptTemplate
    private model: BaseChatModel
    private readonly outputSchema = z
        .array(
            z.object({
                falante: z.enum(['Terapeuta', 'Cliente']).describe('Quem está falando (Eixo I-1 ou I-3)'),
                texto: z.string().describe('O segmento exato do texto extraído da transcrição, sem alterações'),
                categoria: z.string().describe('A sigla da categoria SiMCCIT (ex: SRE, EMP, REL, etc)'),
            }),
        )
        .describe('Um array JSON contendo a segmentação e categorização das falas.')
    private readonly MANUAL_DEFINITIONS = `
    # EIXO I-1 (TERAPEUTA)
    - SRE (Solicitação de Relato): Pergunta sobre fatos, sentimentos ou pensamentos. Ex: "Como se sentiu?"
    - FAC (Facilitação): "Aham", "Certo". Atenção mínima enquanto o cliente fala.
    - EMP (Empatia): Validação, apoio, parafrase emocional. Ex: "Imagino que seja difícil."
    - INF (Informação): Dados técnicos, explicações sobre terapia, fatos.
    - SRF (Solicitação de Reflexão): Pede análise ou insight. Ex: "O que você acha que isso significa?"
    - REC (Recomendação): Conselhos, tarefas de casa, diretrizes. Ex: "Tente anotar isso."
    - INT (Interpretação): Relações causais, metáforas, sínteses novas pelo terapeuta.
    - APR (Aprovação): Elogios, concordância, reforço positivo.
    - REP (Reprovação): Crítica, ironia, confronto, "Não faça isso".
    - TOU (Outras): Social, fora do tema terapêutico.

    # EIXO I-3 (CLIENTE)
    - SOL (Solicitação): Cliente pede informação ou orientação.
    - REL (Relato): Descreve fatos, histórias, sentimentos (narrativa).
    - MEL (Melhora): Relato explícito de progressos ou insights positivos.
    - MET (Metas): Planos para o futuro, intenções.
    - CER (Relações): Cliente explica seus próprios padrões (insight próprio).
    - CON (Concordância): Concorda com o terapeuta ("É verdade", "Sim").
    - OPO (Oposição): Discorda, resiste, critica a terapia.
    - COU (Outras): Social, fora do tema, dúvidas aleatórias.
    `
    private readonly FEW_SHOT_EXAMPLES = [
        {
            input: 'Imagino que isso tenha sido difícil. Continue, estou ouvindo.',
            output: [
                { falante: 'Terapeuta', texto: 'Imagino que isso tenha sido difícil.', categoria: 'EMP' },
                { falante: 'Terapeuta', texto: 'Continue, estou ouvindo.', categoria: 'FAC' },
            ],
        },
        {
            input: 'Como você está se sentindo hoje?',
            output: [{ falante: 'Terapeuta', texto: 'Como você está se sentindo hoje?', categoria: 'SRE' }],
        },
        {
            input: 'Continue, estou ouvindo.',
            output: [{ falante: 'Terapeuta', texto: 'Continue, estou ouvindo.', categoria: 'FAC' }],
        },
        {
            input: 'Imagino que isso tenha sido difícil para você.',
            output: [
                { falante: 'Terapeuta', texto: 'Imagino que isso tenha sido difícil para você.', categoria: 'EMP' },
            ],
        },
        {
            input: 'Esse tipo de situação é comum em casos de ansiedade.',
            output: [
                {
                    falante: 'Terapeuta',
                    texto: 'Esse tipo de situação é comum em casos de ansiedade.',
                    categoria: 'INF',
                },
            ],
        },
        {
            input: 'O que você acha que poderia fazer diferente da próxima vez?',
            output: [
                {
                    falante: 'Terapeuta',
                    texto: 'O que você acha que poderia fazer diferente da próxima vez?',
                    categoria: 'SRF',
                },
            ],
        },
        {
            input: 'Sugiro que você tente anotar seus sentimentos ao longo do dia.',
            output: [
                {
                    falante: 'Terapeuta',
                    texto: 'Sugiro que você tente anotar seus sentimentos ao longo do dia.',
                    categoria: 'REC',
                },
            ],
        },
        {
            input: 'Talvez você esteja buscando aprovação dos outros por conta de experiências passadas.',
            output: [
                {
                    falante: 'Terapeuta',
                    texto: 'Talvez você esteja buscando aprovação dos outros por conta de experiências passadas.',
                    categoria: 'INT',
                },
            ],
        },
        {
            input: 'Parabéns por ter conseguido se expressar tão claramente.',
            output: [
                {
                    falante: 'Terapeuta',
                    texto: 'Parabéns por ter conseguido se expressar tão claramente.',
                    categoria: 'APR',
                },
            ],
        },
        {
            input: 'Não é adequado agir dessa forma.',
            output: [{ falante: 'Terapeuta', texto: 'Não é adequado agir dessa forma.', categoria: 'REP' }],
        },
        {
            input: 'Vamos retomar o que falamos na última sessão.',
            output: [
                { falante: 'Terapeuta', texto: 'Vamos retomar o que falamos na última sessão.', categoria: 'TOU' },
            ],
        },
        {
            input: 'Você pode me explicar por que isso acontece?',
            output: [{ falante: 'Cliente', texto: 'Você pode me explicar por que isso acontece?', categoria: 'SOL' }],
        },
        {
            input: 'Ontem eu fiquei muito ansioso no trabalho.',
            output: [{ falante: 'Cliente', texto: 'Ontem eu fiquei muito ansioso no trabalho.', categoria: 'REL' }],
        },
        {
            input: 'Tenho me sentido melhor desde a última sessão.',
            output: [{ falante: 'Cliente', texto: 'Tenho me sentido melhor desde a última sessão.', categoria: 'MEL' }],
        },
        {
            input: 'Quero conseguir controlar minha ansiedade.',
            output: [{ falante: 'Cliente', texto: 'Quero conseguir controlar minha ansiedade.', categoria: 'MET' }],
        },
        {
            input: 'Acho que minha relação com meus pais influencia nisso.',
            output: [
                {
                    falante: 'Cliente',
                    texto: 'Acho que minha relação com meus pais influencia nisso.',
                    categoria: 'CER',
                },
            ],
        },
        {
            input: 'Concordo com o que você disse.',
            output: [{ falante: 'Cliente', texto: 'Concordo com o que você disse.', categoria: 'CON' }],
        },
        {
            input: 'Não acho que isso funcione para mim.',
            output: [{ falante: 'Cliente', texto: 'Não acho que isso funcione para mim.', categoria: 'OPO' }],
        },
        {
            input: 'Às vezes, só fico em silêncio e não sei o que dizer.',
            output: [
                { falante: 'Cliente', texto: 'Às vezes, só fico em silêncio e não sei o que dizer.', categoria: 'COU' },
            ],
        },
    ]
    constructor(private readonly csvService: CsvService) {}

    onModuleInit() {
        if (!this.apiKey) {
            this.logger.error('API_KEY não encontrada nas variáveis de ambiente!')
        }

        this.model = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName,
            temperature: 0,
            maxRetries: 3,
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
            ],
        })

        this.parser = StructuredOutputParser.fromZodSchema(this.outputSchema)
        this.formattedPrompt = this.buildPromptTemplate()
    }

    private buildPromptTemplate(): FewShotPromptTemplate {
        const formattedExamples = this.FEW_SHOT_EXAMPLES.map((ex) => ({
            input: ex.input,
            output: JSON.stringify(ex.output).replace(/{/g, '{{').replace(/}/g, '}}'),
        }))

        const examplePrompt = PromptTemplate.fromTemplate('Entrada: {input}\nSaída JSON: {output}')

        return new FewShotPromptTemplate({
            examples: formattedExamples,
            examplePrompt: examplePrompt,
            prefix: `
            # Você é um especialista em categorização de interações terapêuticas pelo SiMCCIT.
            
            ## 1. DEFINIÇÕES DO MANUAL (Use estritamente estas regras)
            ${this.MANUAL_DEFINITIONS}

            ## 2. REGRAS DE SEGMENTAÇÃO (CRÍTICO)
            - Analise a verbalização completa.
            - **DIVIDA** a verbalização em segmentos menores se houver mudança de categoria (ex: EMP seguido de FAC).
            - Cada segmento deve ser o menor trecho de texto que se encaixa em UMA ÚNICA categoria.
            - **NUNCA** agrupe categorias diferentes no mesmo segmento.
            - Responda **APENAS** o JSON solicitado.
            `,
            suffix: `
            ---
            ## FORMATO DE SAÍDA
            {format_instructions}

            ---
            ## TRANSCRIÇÃO PARA ANALISAR:
            {transcricao}
            `,
            inputVariables: ['transcricao', 'format_instructions'],
        })
    }

    async categorizeTranscript(transcricao: string): Promise<FalaCategorizada[]> {
        try {
            if (!transcricao || transcricao.trim().length === 0) {
                this.logger.warn('Transcrição vazia recebida.')
                return []
            }

            this.logger.debug(`Iniciando categorização via LangChain.`)

            const chain = this.formattedPrompt.pipe(this.model).pipe(this.parser)

            const result = await chain.invoke({
                transcricao: transcricao,
                format_instructions: this.parser.getFormatInstructions(),
            })

            this.logger.log(`Categorização concluída. ${result.length} segmentos identificados.`)
            return result as FalaCategorizada[]
        } catch (error) {
            this.logger.error(`Erro na categorização: ${error.message}`)
            throw new InternalServerErrorException('Falha ao processar a categorização da transcrição.')
        }
    }

    async categorizeCsv(csvContent: string): Promise<string> {
        try {
            const parseResult = this.csvService.parseCsvToTranscription(csvContent)

            if (!parseResult.transcricao) {
                throw new InternalServerErrorException('CSV não gerou uma transcrição válida.')
            }

            const categorizedData = await this.categorizeTranscript(parseResult.transcricao)

            if (!categorizedData?.length) {
                throw new InternalServerErrorException('A categorização retornou dados vazios.')
            }

            this.logger.debug('Reconstruindo CSV com dados categorizados')
            return this.csvService.reconstructCsvWithCategorization(categorizedData)
        } catch (error) {
            this.logger.error(`Erro no fluxo CSV: ${error.message}`)
            throw error
        }
    }
}
