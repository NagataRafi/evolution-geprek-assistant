export type ConversationState =
  | "IDLE"
  | "GREETING"
  | "BROWSE"
  | "ITEM"
  | "SPICE"
  | "QTY"
  | "SUMMARY"
  | "CONFIRM"
  | "DONE"
  | "HANDOVER";

export interface CartAddOn {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  spiceLevel?: number;
  addOns: CartAddOn[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface CustomerSession {
  remoteJid: string;
  pushName?: string;
  state: ConversationState;
  cart: CartItem[];
  history: ChatMessage[];
  processedMessageIds: string[];
  isHumanHandover: boolean;
  handoverReason?: string;
  createdAt: number;
  updatedAt: number;
}
