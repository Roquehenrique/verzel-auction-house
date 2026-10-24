export interface VehicleMake {
  id: number;
  name: string;
}

export interface VehicleModel {
  id: number;
  name: string;
}

export interface VehicleImage {
  url: string;
  title: string; // Wikipedia page title
  pageUrl: string; // source page, for attribution
}

// NHTSA vPIC data starts with the VIN era; earlier years return no models.
export const MIN_VEHICLE_YEAR = 1981;
export const maxVehicleYear = () => new Date().getFullYear() + 1; // next model year
