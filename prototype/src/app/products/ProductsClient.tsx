"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { InventoryDb, Item } from "@/lib/db";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

export default function ProductsClient({ initialData, refresh }: { initialData: InventoryDb; refresh: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    group: "",
    product: "",
    model: "",
    description: "",
    minStock: 10,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!formData.group || !formData.product || !formData.model) {
        throw new Error("Group, Product Name, and Model Number are required");
      }

      const payload = {
        group_name: formData.group.trim(),
        product_name: formData.product.trim(),
        model_no: formData.model.trim().toUpperCase(),
        description: formData.description.trim(),
        min_stock: formData.minStock,
      };

      const res = await apiFetch('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to add product');
      }

      showToast("Product added successfully", "success");
      setFormData({
        group: "",
        product: "",
        model: "",
        description: "",
        minStock: 10,
      });
      if (refresh) refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to add product", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 className="mb-6">Product Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form Container */}
        <div className="card h-fit md:col-span-1">
          <h2 className="mb-4 text-lg font-bold">Add New Product</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label className="form-label mb-1">Group *</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Machinery"
                value={formData.group} 
                onChange={e => setFormData({ ...formData, group: e.target.value })} 
              />
            </div>
            
            <div>
              <label className="form-label mb-1">Product Name *</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Semi automatic strapping machine"
                value={formData.product} 
                onChange={e => setFormData({ ...formData, product: e.target.value })} 
              />
            </div>

            <div>
              <label className="form-label mb-1">Model Number * (Unique)</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. PA-60"
                value={formData.model} 
                onChange={e => setFormData({ ...formData, model: e.target.value })} 
              />
            </div>

            <div>
              <label className="form-label mb-1">Description</label>
              <textarea 
                rows={3}
                placeholder="Optional details..."
                value={formData.description} 
                onChange={e => setFormData({ ...formData, description: e.target.value })} 
              />
            </div>

            <div>
              <label className="form-label mb-1">Minimum Stock Level</label>
              <input 
                type="number" 
                min="0"
                value={formData.minStock} 
                onChange={e => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })} 
              />
            </div>

            <button 
              type="submit" 
              className="btn-primary mt-2" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Product"}
            </button>
          </form>
        </div>

        {/* Catalog Table Container */}
        <div className="card md:col-span-2" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold">Product Catalog</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
              Total Products: {initialData.items.length}
            </p>
          </div>
          
          <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Model Number</th>
                  <th>Product Name</th>
                  <th>Group</th>
                  <th>Min Stock</th>
                </tr>
              </thead>
              <tbody>
                {initialData.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600 }}>{item.model}</td>
                    <td>
                      <div>{item.product}</div>
                      {item.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginTop: '2px' }}>
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td>{item.group}</td>
                    <td>{item.minStock ?? 10}</td>
                  </tr>
                ))}
                {initialData.items.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--foreground-muted)" }}>
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
