import Anthropic from '@anthropic-ai/sdk'

export interface LlmClient {
  complete(system: string, user: string): Promise<string>
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic
  constructor(private readonly model = process.env.AGENTIFY_ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest') {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async complete(system: string, user: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }]
    })
    return message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()
  }
}
