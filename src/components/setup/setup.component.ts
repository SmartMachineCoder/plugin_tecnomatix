import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeliveryConfig } from '../../models/delivery-config.model';
import { ConfigService } from '../../services/config.service';
import { DeliveryService } from '../../services/delivery.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss']
})
export class SetupComponent {
  @Output() setupComplete = new EventEmitter<void>();

  config: DeliveryConfig;

  testStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  testMessage = '';
  isSaving = false;

  constructor(
    private configService: ConfigService,
    private deliveryService: DeliveryService
  ) {
    this.config = { ...this.configService.getConfig() };
  }

  get isCloudMqtt(): boolean {
    return this.config.deploymentMode === 'cloud' && this.config.cloudMethod === 'mqtt';
  }

  get isCloudHttp(): boolean {
    return this.config.deploymentMode === 'cloud' && this.config.cloudMethod === 'http';
  }

  get isOnPrem(): boolean {
    return this.config.deploymentMode === 'onprem';
  }

  async testConnection(): Promise<void> {
    this.testStatus = 'testing';
    this.testMessage = '';
    // Temporarily save config so deliveryService uses current form values
    this.configService.saveConfig(this.config);
    const result = await this.deliveryService.testConnection();
    this.testStatus = result.success ? 'success' : 'error';
    this.testMessage = result.message;
  }

  saveAndContinue(): void {
    this.isSaving = true;
    this.configService.saveConfig(this.config);
    this.setupComplete.emit();
  }
}
