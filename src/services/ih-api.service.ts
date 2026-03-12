import { Injectable } from '@angular/core';

/**
 * Resolves the correct IH API base URL at runtime.
 *
 * When the app runs inside the IH Monitor iFrame, window.location.origin
 * is the IH-assigned proxy domain (e.g. globpsp2-tecnomatix-globpsp2.eu1.mindsphere.io).
 * All /api/... calls must go to that origin so the IH proxy can forward them
 * to the IH backend with the active session cookie.
 */
@Injectable({ providedIn: 'root' })
export class IhApiService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = window.location.origin;
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
