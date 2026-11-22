export interface SpiceLevel {
  level: number;
  name: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
  requiresSpiceLevel: boolean;
  description?: string;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface MenuConfig {
  currency: string;
  spiceLevels: SpiceLevel[];
  items: MenuItem[];
  addOns: AddOn[];
}
