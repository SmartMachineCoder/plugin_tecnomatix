export interface DeliveryConfig {
  deploymentMode: 'cloud' | 'onprem';

  // Cloud mode — Plant Simulation X (SaaS)
  cloudMethod: 'mqtt' | 'http';
  mqttBrokerUrl: string;        // e.g. wss://broker.hivemq.com:8884/mqtt
  mqttTopic: string;            // e.g. ih/plantsim/data
  mqttUsername: string;
  mqttPassword: string;
  plantSimXEndpoint: string;    // REST endpoint if cloudMethod = 'http'
  apiKey: string;

  // On-prem mode — Plant Simulation Classic (Desktop)
  middlewareUrl: string;        // e.g. https://customer-pc.ngrok.io
  middlewareApiKey: string;
  plantSimPort: number;         // default 30001
}
