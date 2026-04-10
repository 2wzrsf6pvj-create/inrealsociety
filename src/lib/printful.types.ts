// lib/printful.types.ts

export interface PrintfulAddress {
  name:        string;
  address1:    string;
  address2?:   string;
  city:        string;
  state_code:  string;
  country_code: string;
  zip:         string;
}

export interface PrintfulFile {
  type:     'front' | 'back' | 'label'; // placement sur le vêtement
  url:      string;                      // URL publique du fichier d'impression (le QR code)
  position?: {
    area_width:  number;
    area_height: number;
    width:       number;
    height:      number;
    top:         number;
    left:        number;
  };
}

export interface PrintfulItem {
  variant_id:    number;    // ⚠️ À remplacer par l'ID réel du Comfort Colors 1717 sur Printful
  quantity:      number;
  files:         PrintfulFile[];
  name?:         string;
}

export interface PrintfulOrderPayload {
  recipient:     PrintfulAddress;
  items:         PrintfulItem[];
  retail_costs?: {
    shipping?: string;
  };
  gift?:         { subject?: string; message?: string };
}

export interface PrintfulOrderResponse {
  code:   number;
  result: {
    id:     number;
    status: string;
    [key: string]: unknown;
  };
}