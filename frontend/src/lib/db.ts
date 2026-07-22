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
  unit?: string;
  stock: Record<string, number>;
  leadTimeDays?: number;
  safetyStock?: number;
  preferredSupplierId?: number | null;
  preferredSupplierName?: string;
  reorderQuantity?: number;
  purchasePrice?: number;
  sellingPrice?: number;
}

export interface Transaction {
  id: string;
  date: string; // ISO string
  type: 'INWARD' | 'OUTWARD' | 'TRANSFER' | 'ADJUSTMENT' | string;
  itemId: string;
  modelNumber?: string;
  warehouseId: string;
  toWarehouseId?: string;
  warehouseName?: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  quantity: number;
  user: string;
  narration?: string;
  adjustmentType?: 'ADD' | 'SUBTRACT' | string;
  adjustmentReason?: string;
  notes?: string;
  clientId?: number | null;
  clientName?: string | null;
  unitPrice?: number;
  totalValue?: number;
}

export interface InventoryDb {
  warehouses: Warehouse[];
  items: Item[];
  transactions: Transaction[];
}

export type UserRole = 'Admin' | 'Manager' | 'Basic User';

