import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiError, fetchJson } from '../external/http-client.js';
import type { VehicleMake, VehicleModel } from './vehicles.types.js';

// NHTSA vPIC: public US government vehicle database, no API key required.
// https://vpic.nhtsa.dot.gov/api/
interface NhtsaResponse<T> {
  Count: number;
  Results: T[];
}

interface NhtsaMake {
  MakeId: number;
  MakeName: string;
}

interface NhtsaModel {
  Model_ID: number;
  Model_Name: string;
}

@Injectable()
export class NhtsaClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get('NHTSA_API_URL') ?? 'https://vpic.nhtsa.dot.gov/api/vehicles';
  }

  async getMakes(): Promise<VehicleMake[]> {
    const response = await fetchJson<NhtsaResponse<NhtsaMake>>(
      `${this.baseUrl}/GetMakesForVehicleType/car?format=json`,
    );
    return assertResults(response)
      .map((make) => ({ id: make.MakeId, name: formatMakeName(make.MakeName) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Looks the make up by id, not by name: the by-name endpoint matches partially
  // ("ford" also returns models from "STANFORD CUSTOMS").
  async getModels(makeId: number, year: number): Promise<VehicleModel[]> {
    const response = await fetchJson<NhtsaResponse<NhtsaModel>>(
      `${this.baseUrl}/GetModelsForMakeIdYear/makeId/${makeId}/modelyear/${year}/vehicletype/car?format=json`,
    );

    // The same model name can appear with several ids.
    const byName = new Map<string, VehicleModel>();
    for (const model of assertResults(response)) {
      const name = model.Model_Name.trim();
      if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { id: model.Model_ID, name });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

function assertResults<T>(response: NhtsaResponse<T>): T[] {
  if (!response || !Array.isArray(response.Results)) {
    throw new ExternalApiError('NHTSA returned an unexpected response', false);
  }
  return response.Results;
}

// "ASTON MARTIN" -> "Aston Martin", "MERCEDES-BENZ" -> "Mercedes-Benz".
// Words of up to 3 letters are usually acronyms and stay uppercase (BMW, GMC, KIA).
export function formatMakeName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length <= 3
        ? word
        : word
            .split('-')
            .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
            .join('-'),
    )
    .join(' ');
}
