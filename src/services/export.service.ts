import { Injectable } from '@angular/core';
import { PlantSimPayload } from '../models/timeseries.model';

@Injectable({ providedIn: 'root' })
export class ExportService {

  async exportData(format: 'csv' | 'xml' | 'excel', payloads: PlantSimPayload[], rangeLabel: string): Promise<void> {
    console.log(`[Export] Starting export, format=${format}, payloads=${payloads.length}, rangeLabel=${rangeLabel}`);

    let content = '';
    let mimeType = '';
    let extension = '';

    if (format === 'csv') {
      content = this.generateCsv(payloads);
      mimeType = 'text/csv;charset=utf-8;';
      extension = 'csv';
    } else if (format === 'xml') {
      content = this.generateXml(payloads);
      mimeType = 'application/xml;charset=utf-8;';
      extension = 'xml';
    } else if (format === 'excel') {
      // Using a UTF-8 BOM ensures Excel opens the CSV directly with proper character encoding
      // without requiring a heavy third-party library like `xlsx`.
      content = '\ufeff' + this.generateCsv(payloads); 
      mimeType = 'application/vnd.ms-excel;charset=utf-8;';
      extension = 'csv'; 
    }

    const safeName = rangeLabel.replace(/[^a-zA-Z0-9_-]/g, '_') || 'data';
    console.log(`[Export] Generated content, size=${content.length} bytes`);
    await this.downloadFile(content, mimeType, `Export_${safeName}.${extension}`);
  }

  private generateCsv(payloads: PlantSimPayload[]): string {
    const lines: string[] = [];
    lines.push('AssetId,AssetName,Aspect,VariableName,Unit,DataType,Timestamp,Value');

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    for (const p of payloads) {
      for (const v of p.variables) {
        for (const val of v.values) {
          lines.push(
            `${escapeCsv(p.assetId)},${escapeCsv(p.assetName)},${escapeCsv(v.aspect)},${escapeCsv(v.name)},${escapeCsv(v.unit)},${escapeCsv(v.dataType)},${escapeCsv(val.time)},${escapeCsv(val.value)}`
          );
        }
      }
    }
    return lines.join('\n');
  }

  private generateXml(payloads: PlantSimPayload[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<ExportData>\n';
    for (const p of payloads) {
      xml += `  <Asset id="${p.assetId}" name="${p.assetName}">\n`;
      for (const v of p.variables) {
        xml += `    <Variable aspect="${v.aspect}" name="${v.name}" unit="${v.unit || ''}" dataType="${v.dataType}">\n`;
        for (const val of v.values) {
          xml += `      <DataPoint time="${val.time}" value="${val.value}" />\n`;
        }
        xml += `    </Variable>\n`;
      }
      xml += `  </Asset>\n`;
    }
    xml += '</ExportData>';
    return xml;
  }

  private async downloadFile(content: string, mimeType: string, filename: string): Promise<void> {
    // Attempt to use the File System Access API to prompt the user for a local folder
    if ('showSaveFilePicker' in window) {
      try {
        const extension = filename.split('.').pop() || '';
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: `${extension.toUpperCase()} File`,
            accept: { [mimeType]: [`.${extension}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        console.log(`[Export] File saved successfully: ${filename}`);
        return;
      } catch (err) {
        console.warn(`[Export] showSaveFilePicker failed, falling back to blob download:`, err);
        // AbortError means the user cancelled the dialog. Let it throw to cancel the success toast.
        if ((err as Error).name === 'AbortError') throw err;
      }
    }

    // Fallback for browsers that do not support showSaveFilePicker (e.g., Firefox, Safari)
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);

      // Use setTimeout to ensure the element is in the DOM before clicking
      await new Promise(resolve => setTimeout(() => { a.click(); resolve(null); }, 0));

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[Export] File downloaded successfully: ${filename}`);
    } catch (err) {
      console.error(`[Export] Download failed:`, err);
      throw new Error(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}