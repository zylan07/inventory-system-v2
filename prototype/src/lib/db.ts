export interface Warehouse {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  group: string;
  product: string;
  model: string;
  description: string;
  minStock: number;
  stock: Record<string, number>;
}

export interface Transaction {
  id: string;
  date: string; // ISO string
  type: 'INWARD' | 'OUTWARD' | 'TRANSFER' | 'ADJUSTMENT' | string;
  itemId: string;
  modelNumber?: string;
  warehouseId: string;
  toWarehouseId?: string;
  quantity: number;
  user: string;
  narration?: string;
  adjustmentType?: 'ADD' | 'SUBTRACT' | string;
  adjustmentReason?: string;
  notes?: string;
}

export interface InventoryDb {
  warehouses: Warehouse[];
  items: Item[];
  transactions: Transaction[];
}
