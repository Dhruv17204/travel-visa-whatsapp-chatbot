import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { loadMetaConfig, MetaConfig } from './meta.config.js';

@Injectable()
export class MetaService implements OnModuleInit {
  private config: MetaConfig;
  private readonly baseUrl: string = 'https://graph.facebook.com';
  private readonly logger = new Logger(MetaService.name);

  onModuleInit() {
    this.config = loadMetaConfig();
  }

  public getConfig(): MetaConfig {
    return this.config;
  }

  /**
   * Reusable method structure for future Graph API calls.
   * Designed to use native fetch to eliminate axios dependency.
   * Avoids logging sensitive tokens or payload contents.
   */
  public async sendRequest(endpoint: string, method: string = 'POST', payload?: any): Promise<any> {
    if (!this.config) {
      throw new Error('MetaService is not initialized');
    }

    const url = `${this.baseUrl}/${this.config.graphApiVersion}/${this.config.phoneNumberId}/${endpoint}`;
    const safeRecipient = payload?.to ? payload.to.replace(/\d{4}$/, '****') : 'unknown';
    
    this.logger.log(`Sending ${method} request to /${this.config.graphApiVersion}/<phone-id>/${endpoint} for recipient ${safeRecipient}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorJson = await response.json();
        const code = errorJson?.error?.code || 'unknown';
        const msg = errorJson?.error?.message || 'unknown error';
        errorDetails = `Code: ${code}, Msg: ${msg}`;
      } catch (e) {
        errorDetails = 'Could not parse error JSON';
      }
      this.logger.error(`Meta API Request Failed: Status ${response.status}. ${errorDetails}`);
      throw new Error(`Meta API Request Failed: Status ${response.status}`);
    }

    const data = await response.json();
    const messageId = data?.messages?.[0]?.id || 'unknown';
    this.logger.log(`Meta API Request Success: Status ${response.status}. Message ID: ${messageId}`);
    
    return data;
  }
}
