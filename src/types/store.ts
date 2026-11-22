export interface OperatingHours {
  day: string;
  open: string;
  close: string;
}

export interface StoreConfig {
  name: string;
  address: string;
  phone: string;
  operatingHours: OperatingHours[];
  orderTypes: string[];
  deliveryFee: number;
  deliveryMinimumOrder: number;
  taxRate: number;
  paymentMethods: string[];
  paymentInfoTemplate: string;
  greeting: string;
  handoverMessage: string;
  adminNotifyNumber: string;
}
