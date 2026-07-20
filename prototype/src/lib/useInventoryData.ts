import { useState, useEffect, useCallback } from 'react';
import { Item, Transaction, Warehouse } from './db';
import { apiFetch } from './apiFetch';

export interface UseInventoryDataOptions {
  products?: boolean;
  stock?: boolean;
  transactions?: boolean;
  warehouses?: boolean;
}

export interface UseInventoryDataResult {
  data: {
    products?: Item[];
    warehouses?: Warehouse[];
    stock?: Item[];
    transactions?: Transaction[];
  };
  errors: {
    products?: string | null;
    warehouses?: string | null;
    stock?: string | null;
    transactions?: string | null;
  };
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useInventoryData(options: UseInventoryDataOptions): UseInventoryDataResult {
  const [data, setData] = useState<UseInventoryDataResult['data']>({});
  const [errors, setErrors] = useState<UseInventoryDataResult['errors']>({
    products: null,
    warehouses: null,
    stock: null,
    transactions: null,
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Destructure options for primitive dependencies
  const products = !!options.products;
  const stock = !!options.stock;
  const transactions = !!options.transactions;
  const warehouses = !!options.warehouses;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrors({
      products: null,
      warehouses: null,
      stock: null,
      transactions: null,
    });

    const activeErrors: UseInventoryDataResult['errors'] = {
      products: null,
      warehouses: null,
      stock: null,
      transactions: null,
    };
    const activeData: UseInventoryDataResult['data'] = {};

    try {
      const promises: Promise<void>[] = [];

      // Determine which endpoints to query
      // If stock is requested, it includes products, so no need to query products
      const shouldFetchStock = stock;
      const shouldFetchProducts = products && !shouldFetchStock;
      const shouldFetchTransactions = transactions;

      if (shouldFetchStock) {
        promises.push(
          apiFetch('/stock')
            .then(async (res) => {
              if (!res.ok) {
                activeErrors.stock = `Failed to load stock data (Status ${res.status})`;
                return;
              }
              const json = await res.json();
              const stockData = json.data || [];
              activeData.stock = stockData.map((row: any) => ({
                id: String(row.id),
                group: row.group_name || '',
                product: row.product_name,
                model: row.model_no,
                description: row.description || '',
                minStock: row.min_stock || 0,
                unit: row.unit || 'pcs',
                stock: row.stock || {},
                leadTimeDays: row.lead_time_days || 0,
                safetyStock: row.safety_stock || 0,
                preferredSupplierId: row.preferred_supplier_id || null,
                preferredSupplierName: row.preferred_supplier_name || 'Direct/Default Supplier',
                reorderQuantity: row.reorder_quantity || 0,
                purchasePrice: parseFloat(row.purchase_price) || 0,
                sellingPrice: parseFloat(row.selling_price) || 0,
              }));
            })
            .catch((err) => {
              activeErrors.stock = err.message || 'Error fetching stock';
            })
        );
      }

      if (shouldFetchProducts) {
        promises.push(
          apiFetch('/products')
            .then(async (res) => {
              if (!res.ok) {
                activeErrors.products = `Failed to load products (Status ${res.status})`;
                return;
              }
              const json = await res.json();
              const productsData = json.data || [];
              activeData.products = productsData.map((row: any) => ({
                id: String(row.id),
                group: row.group_name || '',
                product: row.product_name,
                model: row.model_no,
                description: row.description || '',
                minStock: row.min_stock || 0,
                unit: row.unit || 'pcs',
                stock: {},
                leadTimeDays: row.lead_time_days || 0,
                safetyStock: row.safety_stock || 0,
                preferredSupplierId: row.preferred_supplier_id || null,
                preferredSupplierName: row.preferred_supplier_name || 'Direct/Default Supplier',
                reorderQuantity: row.reorder_quantity || 0,
                purchasePrice: parseFloat(row.purchase_price) || 0,
                sellingPrice: parseFloat(row.selling_price) || 0,
              }));
            })
            .catch((err) => {
              activeErrors.products = err.message || 'Error fetching products';
            })
        );
      }

      if (shouldFetchTransactions) {
        promises.push(
          apiFetch('/transactions')
            .then(async (res) => {
              if (!res.ok) {
                activeErrors.transactions = `Failed to load transactions (Status ${res.status})`;
                return;
              }
              const json = await res.json();
              const txDataList = json.data || [];
              activeData.transactions = txDataList.map((row: any) => {
                let adjType = undefined;
                if (row.type === 'ADJUSTMENT' && row.narration && row.narration.includes('ADD')) adjType = 'ADD';
                else if (row.type === 'ADJUSTMENT' && row.narration && row.narration.includes('SUBTRACT')) adjType = 'SUBTRACT';

                return {
                  id: String(row.id),
                  date: new Date(row.created_at).toISOString(),
                  type: row.type,
                  itemId: String(row.product_id),
                  modelNumber: row.modelNumber || 'Unknown', 
                  warehouseId: row.warehouse_id,
                  toWarehouseId: row.to_warehouse_id || undefined,
                  quantity: row.quantity,
                  user: row.user_email || 'System',
                  narration: row.narration || undefined,
                  adjustmentType: adjType,
                };
              });
            })
            .catch((err) => {
              activeErrors.transactions = err.message || 'Error fetching transactions';
            })
        );
      }

      // Settle all parallel promises independently
      await Promise.all(promises);

      // Populate static warehouses list if requested
      if (warehouses) {
        activeData.warehouses = [
          { id: 'W1', name: 'Warehouse 1' },
          { id: 'W2', name: 'Warehouse 2' },
          { id: 'W3', name: 'Warehouse 3' },
        ];
      }

      setData(activeData);
      setErrors(activeErrors);
    } catch (err: any) {
      console.error('Unexpected error in fetchData:', err);
    } finally {
      setLoading(false);
    }
  }, [products, stock, transactions, warehouses]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, errors, refresh: fetchData };
}
