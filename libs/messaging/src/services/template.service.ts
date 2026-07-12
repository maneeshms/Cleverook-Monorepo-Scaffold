import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTemplate } from '../entities/message-template.entity';
import { Channel } from '../enums/channel.enum';
import { TEMPLATE_REGISTRY, TemplateVariant } from '../templates/registry';

export interface RenderedTemplate {
  subject?: string;
  html?: string;
  text?: string;
}

/**
 * Renders a template for a (key, channel, locale). A DB row in message_templates
 * overrides the in-code registry; otherwise the code default is used. Missing
 * `{{var}}` placeholders render as empty strings (never leak the raw token).
 */
@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(MessageTemplate)
    private readonly templates: Repository<MessageTemplate>,
  ) {}

  async render(
    key: string,
    channel: Channel,
    variables: Record<string, unknown>,
    locale = 'en',
  ): Promise<RenderedTemplate> {
    const variant = await this.resolveVariant(key, channel, locale);
    if (!variant) {
      throw new NotFoundException(`No template '${key}' for channel ${channel}`);
    }
    return {
      subject: variant.subject ? this.interpolate(variant.subject, variables) : undefined,
      html: variant.html ? this.interpolate(variant.html, variables) : undefined,
      text: variant.text ? this.interpolate(variant.text, variables) : undefined,
    };
  }

  private async resolveVariant(
    key: string,
    channel: Channel,
    locale: string,
  ): Promise<TemplateVariant | null> {
    // 1. DB override wins.
    const dbRow = await this.templates.findOne({
      where: { key, channel, locale, enabled: true },
    });
    if (dbRow) {
      return {
        subject: dbRow.subject ?? undefined,
        html: dbRow.bodyHtml ?? undefined,
        text: dbRow.bodyText ?? undefined,
      };
    }
    // 2. Code registry default.
    return TEMPLATE_REGISTRY[key]?.[channel] ?? null;
  }

  /** Replace {{var}} with variables[var]; unknown vars → ''. Supports {{displayNameComma}}. */
  private interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
      const value = variables[name];
      return value === undefined || value === null ? '' : String(value);
    });
  }
}
