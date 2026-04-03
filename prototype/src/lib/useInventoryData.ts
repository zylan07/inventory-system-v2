import { useState, useEffect, useCallback } from 'react';
import { InventoryDb, Item, Transaction, Warehouse } from './db';
import { apiFetch } from './apiFetch';

export function useInventoryData() {
  const [data, setData] = useState<InventoryDb | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockRes, txRes] = await Promise.all([
        apiFetch('/stock'),
        apiFetch('/transactions')
      ]);

      if (!stockRes.ok || !txRes.ok) {
        throw new Error('Failed to fetch data from backend API');
      }

      const stockJson = await stockRes.json();
const txJson = await txRes.json();

const stockData = stockJson.data || [];
const txDataList = txJson.data || [];

      const items: Item[] = stockData.map((row: any) => ({
        id: String(row.id),
        group: row.group_name,
        product: row.product_name,
        model: row.model_no,
        description: row.description || '',
        minStock: row.min_stock,
        stock: row.stock || {},
      }));

      const transactions: Transaction[] = txDataList.map((row: any) => {
        // Basic inference for adjustmentType to satisfy UI rendering
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
          user: 'System', // Hardcoded for this prototype
          narration: row.narration || undefined,
          adjustmentType: adjType,
        };
      });

      const warehouses: Warehouse[] = [
        { id: 'W1', name: 'Warehouse 1' },
        { id: 'W2', name: 'Warehouse 2' },
        { id: 'W3', name: 'Warehouse 3' },
      ];

      setData({
        warehouses,
        items,
        transactions,
      });
    } catch (err: any) {
      console.error("Client fetch error:", err);
      setError(err.message || 'An error occurred while fetching data');
      setData({ warehouses: [], items: [], transactions: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
