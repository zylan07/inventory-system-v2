"use client";

import { useState, useMemo, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { InventoryDb, Item, Warehouse } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import EmptyState from "@/components/EmptyState";
import * as XLSX from "xlsx";

type SortKey = "group" | "product" | "model" | "minStock" | "unit";
type SortDir = "asc" | "desc";

export default function ProductsClient({ initialData, refresh }: { initialData: InventoryDb; refresh: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    group: "",
    product: "",
    model: "",
    description: "",
    minStock: 10,
    unit: "",
    leadTimeDays: 0,
  });

  // Add Product & Warehouse Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehousesList, setWarehousesList] = useState<Warehouse[]>([]);
  const [newWhName, setNewWhName] = useState("");
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [editingWhName, setEditingWhName] = useState("");

  // Duplicate Model Validation States
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateProducts, setDuplicateProducts] = useState<any[]>([]);
  const [duplicateFormData, setDuplicateFormData] = useState<typeof formData | null>(null);

  // Client-side search, sort, pagination
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("model");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Import Excel modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<"guide" | "upload" | "summary">("guide");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [validationPreview, setValidationPreview] = useState<{
    totalRows: number;
    validRowsCount: number;
    dbDuplicatesCount: number;
    fileDuplicatesCount: number;
    missingDataCount: number;
    rows: any[];
    errors: string[];
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // Edit Product modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Item | null>(null);
  const [editFormData, setEditFormData] = useState({
    id: "",
    group: "",
    product: "",
    model: "",
    description: "",
    minStock: 10,
    unit: "",
    leadTimeDays: 0,
  });
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);

  const isAnyModalOpen = !!(showImportModal || showEditModal || showAddModal || showWarehouseModal || showDuplicateModal);
  // Prevent background scrolling when modals are open
  useEffect(() => {
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAnyModalOpen]);

  // Read edit parameter to trigger editing details modal
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const editProductId = params.get('edit');
      if (editProductId && initialData.items.length > 0) {
        const prod = initialData.items.find(item => item.id === editProductId);
        if (prod) {
          openEditModal(prod);
          // Clear query parameter after opening
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    }
  }, [initialData.items]);

  // Fetch warehouses list dynamically
  const fetchWarehousesList = async () => {
    try {
      const res = await apiFetch('/warehouses');
      if (res.ok) {
        const json = await res.json();
        setWarehousesList(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load warehouses list:", err);
    }
  };

  useEffect(() => {
    if (showWarehouseModal) {
      fetchWarehousesList();
    }
  }, [showWarehouseModal]);

  // Warehouse CRUD functions
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;
    try {
      const res = await apiFetch('/warehouses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWhName.trim() })
      });
      if (res.ok) {
        showToast("Warehouse added successfully", "success");
        setNewWhName("");
        fetchWarehousesList();
        if (refresh) refresh();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to add warehouse", "error");
      }
    } catch (err) {
      showToast("Error adding warehouse", "error");
    }
  };

  const handleRenameWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWhId || !editingWhName.trim()) return;
    try {
      const res = await apiFetch(`/warehouses/${editingWhId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingWhName.trim() })
      });
      if (res.ok) {
        showToast("Warehouse renamed successfully", "success");
        setEditingWhId(null);
        fetchWarehousesList();
        if (refresh) refresh();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to rename warehouse", "error");
      }
    } catch (err) {
      showToast("Error renaming warehouse", "error");
    }
  };

  const handleDeleteWarehouse = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove the warehouse "${name}"?\n\nThis will also delete any stock association, but will fail if the warehouse is referenced in transaction logs.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/warehouses/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast("Warehouse removed successfully", "success");
        fetchWarehousesList();
        if (refresh) refresh();
      } else {
        const data = await res.json();
        showToast(data.message || "Failed to remove warehouse", "error");
      }
    } catch (err) {
      showToast("Error removing warehouse", "error");
    }
  };

  // Perform final product creation API call
  const performProductSave = async (dataToSave: typeof formData) => {
    setIsSubmitting(true);
    try {
      if (!dataToSave.group || !dataToSave.product || !dataToSave.model) {
        throw new Error("Group, Product Name, and Model Number are required");
      }

      const payload = {
        group_name: dataToSave.group.trim(),
        product_name: dataToSave.product.trim(),
        model_no: dataToSave.model.trim().toUpperCase(),
        description: dataToSave.description.trim(),
        min_stock: dataToSave.minStock,
        unit: dataToSave.unit.trim() || 'pcs',
        lead_time_days: dataToSave.leadTimeDays,
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
        unit: "",
        leadTimeDays: 0,
      });
      setShowAddModal(false);
      if (refresh) refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to add product", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!duplicateFormData) return;
    setShowDuplicateModal(false);
    showToast("This model number already exists. Since other product information differs, you may continue.", "success");
    await performProductSave(duplicateFormData);
    setDuplicateFormData(null);
  };

  // Manual Creation Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredModel = formData.model.trim().toUpperCase();
    const enteredName = formData.product.trim().toLowerCase();

    // Search for matching products by model number in existing items
    const matches = initialData.items.filter(item => item.model.trim().toUpperCase() === enteredModel);

    if (matches.length > 0) {
      // Check if any matching product has the exact same name
      const exactMatch = matches.find(item => item.product.trim().toLowerCase() === enteredName);
      if (exactMatch) {
        showToast("Error: A product with this Model Number and Product Name already exists. Exact duplicates are not allowed.", "error");
        return;
      }

      // Show popup warning dialog listing matching products
      setDuplicateProducts(matches);
      setDuplicateFormData(formData);
      setShowDuplicateModal(true);
      return;
    }

    // Submit normally
    await performProductSave(formData);
  };

  // sorting logic
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // filtering and sorting calculations
  const filteredSorted = useMemo(() => {
    let items = initialData.items.filter(item => {
      const q = search.toLowerCase();
      return !search || (
        item.model.toLowerCase().includes(q) ||
        item.product.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
      );
    });

    items = [...items].sort((a, b) => {
      let va = a[sortKey === 'minStock' ? 'minStock' : sortKey === 'unit' ? 'unit' : sortKey];
      let vb = b[sortKey === 'minStock' ? 'minStock' : sortKey === 'unit' ? 'unit' : sortKey];

      if (sortKey === 'minStock') {
        const na = a.minStock ?? 10;
        const nb = b.minStock ?? 10;
        return sortDir === 'asc' ? na - nb : nb - na;
      }

      const sa = String(va || '').trim().toLowerCase();
      const sb = String(vb || '').trim().toLowerCase();

      if (sa < sb) return sortDir === 'asc' ? -1 : 1;
      if (sa > sb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [initialData.items, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const paginated = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Catalogue Excel Export (All Products)
  const handleExportExcel = () => {
    try {
      const exportData = initialData.items.map(item => ({
        'Group': item.group,
        'Product Name': item.product,
        'Model Number': item.model,
        'Minimum Stock': item.minStock ?? 10,
        'Unit': item.unit || 'pcs',
        'Description': item.description || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products Catalogue');
      XLSX.writeFile(workbook, 'products_catalogue.xlsx');
      showToast("Catalogue exported successfully", "success");
    } catch (err: any) {
      showToast("Failed to export catalogue: " + err.message, "error");
    }
  };

  // Sample Template Excel Download
  const handleDownloadSample = () => {
    try {
      const headers = ['Group', 'Product Name', 'Model Number', 'Minimum Stock', 'Unit', 'Description'];
      const sampleRow = {
        'Group': 'Machinery',
        'Product Name': 'Semi automatic strapping machine',
        'Model Number': 'PA-60',
        'Minimum Stock': 5,
        'Unit': 'pcs',
        'Description': 'Automatic strapping machine for boxes'
      };
      
      const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample Products');
      XLSX.writeFile(workbook, 'sample_products.xlsx');
      showToast("Sample Excel downloaded", "success");
    } catch (err: any) {
      showToast("Failed to download sample: " + err.message, "error");
    }
  };

  // Excel Upload File Selection & Parser (Stage 1 Validation)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    if (!file) {
      setValidationPreview(null);
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (json.length === 0) {
        throw new Error("Excel file is empty");
      }

      const headers = json[0].map(h => String(h || '').trim());
      const required = ['Group', 'Product Name', 'Model Number', 'Minimum Stock'];
      const missing = required.filter(r => !headers.includes(r));
      
      if (missing.length > 0) {
        setValidationPreview({
          totalRows: 0,
          validRowsCount: 0,
          dbDuplicatesCount: 0,
          fileDuplicatesCount: 0,
          missingDataCount: 0,
          rows: [],
          errors: [`Missing required columns: ${missing.join(', ')}`]
        });
        return;
      }

      const headerIndices = {
        group: headers.indexOf('Group'),
        product: headers.indexOf('Product Name'),
        model: headers.indexOf('Model Number'),
        minStock: headers.indexOf('Minimum Stock'),
        unit: headers.indexOf('Unit'),
        description: headers.indexOf('Description'),
      };

      const seenInFile = new Set<string>();
      const existingModelsInCatalog = new Set(initialData.items.map(item => item.model.toUpperCase()));

      let totalRows = 0;
      let validRowsCount = 0;
      let dbDuplicatesCount = 0;
      let fileDuplicatesCount = 0;
      let missingDataCount = 0;
      const errors: string[] = [];
      const parsedRows: any[] = [];

      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length === 0) continue;
        const isRowEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '');
        if (isRowEmpty) continue;

        totalRows++;
        const rowNum = i + 1;

        const groupVal = row[headerIndices.group];
        const productVal = row[headerIndices.product];
        const modelVal = row[headerIndices.model];
        const minStockVal = row[headerIndices.minStock];
        const unitVal = headerIndices.unit !== -1 ? row[headerIndices.unit] : null;
        const descVal = headerIndices.description !== -1 ? row[headerIndices.description] : null;

        let hasError = false;

        // Required field validations
        if (groupVal === undefined || groupVal === null || String(groupVal).trim() === '') {
          errors.push(`Row ${rowNum}: Group name is missing`);
          hasError = true;
        }
        if (productVal === undefined || productVal === null || String(productVal).trim() === '') {
          errors.push(`Row ${rowNum}: Product Name is missing`);
          hasError = true;
        }
        if (modelVal === undefined || modelVal === null || String(modelVal).trim() === '') {
          errors.push(`Row ${rowNum}: Model Number is missing`);
          hasError = true;
        }
        if (minStockVal === undefined || minStockVal === null || String(minStockVal).trim() === '') {
          errors.push(`Row ${rowNum}: Minimum Stock is missing`);
          hasError = true;
        }

        if (hasError) {
          missingDataCount++;
          continue;
        }

        // Data type validation
        const minStockNum = Number(minStockVal);
        if (isNaN(minStockNum) || minStockNum < 0) {
          errors.push(`Row ${rowNum}: Minimum Stock "${minStockVal}" must be a non-negative number`);
          missingDataCount++;
          continue;
        }

        const modelNo = String(modelVal).trim().toUpperCase();

        // Duplicate in file validation
        if (seenInFile.has(modelNo)) {
          errors.push(`Row ${rowNum}: Duplicate Model Number "${modelNo}" in the upload file`);
          fileDuplicatesCount++;
          continue;
        }
        seenInFile.add(modelNo);

        // Duplicate in database validation (warning/info only - will be skipped)
        if (existingModelsInCatalog.has(modelNo)) {
          errors.push(`Row ${rowNum}: Model Number "${modelNo}" already exists in catalogue. (Will be skipped)`);
          dbDuplicatesCount++;
          continue;
        }

        // Row is completely valid
        validRowsCount++;
        parsedRows.push({
          group_name: String(groupVal).trim(),
          product_name: String(productVal).trim(),
          model_no: modelNo,
          unit: unitVal ? String(unitVal).trim() : 'pcs',
          description: descVal ? String(descVal).trim() : '',
          min_stock: minStockNum
        });
      }

      setValidationPreview({
        totalRows,
        validRowsCount,
        dbDuplicatesCount,
        fileDuplicatesCount,
        missingDataCount,
        rows: parsedRows,
        errors
      });

    } catch (err: any) {
      setValidationPreview({
        totalRows: 0,
        validRowsCount: 0,
        dbDuplicatesCount: 0,
        fileDuplicatesCount: 0,
        missingDataCount: 0,
        rows: [],
        errors: [`Failed to parse Excel file: ${err.message}`]
      });
    }
  };

  // Upload Excel & execute import (Stage 2)
  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiFetch('/products/import', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to import products');
      }

      setImportResult(json.data);
      setImportStep('summary');
      showToast("Products imported successfully", "success");
      if (refresh) refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to import products", "error");
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportStep('guide');
    setSelectedFile(null);
    setValidationPreview(null);
    setImportResult(null);
  };

  // Edit Product preloading
  const openEditModal = (product: Item) => {
    setEditingProduct(product);
    setEditFormData({
      id: product.id,
      group: product.group,
      product: product.product,
      model: product.model,
      description: product.description || '',
      minStock: product.minStock ?? 10,
      unit: product.unit || 'pcs',
      leadTimeDays: product.leadTimeDays ?? 0
    });
    setShowEditModal(true);
  };

  // Reset Changes in Edit Modal
  const handleResetEdit = () => {
    if (!editingProduct) return;
    setEditFormData({
      id: editingProduct.id,
      group: editingProduct.group,
      product: editingProduct.product,
      model: editingProduct.model,
      description: editingProduct.description || '',
      minStock: editingProduct.minStock ?? 10,
      unit: editingProduct.unit || 'pcs',
      leadTimeDays: editingProduct.leadTimeDays ?? 0
    });
    showToast("Product changes reset to original values", "success");
  };

  // Edit Submit Handler
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsEditingSubmitting(true);

    try {
      if (!editFormData.group || !editFormData.product || !editFormData.model) {
        throw new Error("Group, Product Name, and Model Number are required");
      }

      const payload = {
        group_name: editFormData.group.trim(),
        product_name: editFormData.product.trim(),
        model_no: editFormData.model.trim().toUpperCase(),
        description: editFormData.description.trim(),
        min_stock: editFormData.minStock,
        unit: editFormData.unit.trim() || 'pcs',
        lead_time_days: editFormData.leadTimeDays
      };

      const res = await apiFetch(`/products/${editFormData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to update product');
      }

      showToast("Product updated successfully", "success");
      setShowEditModal(false);
      setEditingProduct(null);
      if (refresh) refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to update product", "error");
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Top Action Area */}
      <div className="card mb-6" style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Product Management</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowAddModal(true)} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', height: '38px', fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add One Product
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn-excel-import" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', height: '38px', fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 12 15 15" /></svg>
            Add Many Products
          </button>
          <button onClick={handleExportExcel} className="btn-excel-export" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', height: '38px', fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="18" /><polyline points="15 15 12 18 9 15" /></svg>
            Export Excel
          </button>
          {userRole === 'Admin' && (
            <button onClick={() => setShowWarehouseModal(true)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', height: '38px', fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" /><path d="M3 9h18" /><path d="M3 15h18" /></svg>
              Manage Warehouses
            </button>
          )}
        </div>
      </div>

      {/* Catalog Table Container */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="text-lg font-bold">Product Catalog</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)' }}>
              Total Products: {initialData.items.length}
            </p>
            </div>
            <div style={{ width: '250px' }}>
              <input
                type="text"
                placeholder="Search model, name, group..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border)', width: '100%' }}
              />
            </div>
          </div>
          
          <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('model')}>Model Number{sortArrow('model')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('product')}>Product Name{sortArrow('product')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('group')}>Group{sortArrow('group')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('unit')}>Unit{sortArrow('unit')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('minStock')}>Min Stock{sortArrow('minStock')}</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item) => (
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
                    <td>{item.unit || 'pcs'}</td>
                    <td>{item.minStock ?? 10}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => openEditModal(item)} 
                        className="btn-action-edit"
                        title="Edit Product"
                        aria-label="Edit Product"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "2rem" }}>
                      {initialData.items.length === 0 ? (
                        <EmptyState 
                          type="products" 
                          onPrimaryAction={() => {
                            const el = document.querySelector('input[placeholder*="Machinery"]') as HTMLInputElement;
                            if (el) el.focus();
                          }} 
                        />
                      ) : (
                        <EmptyState 
                          type="search" 
                          onPrimaryAction={() => {
                            setSearch("");
                            setPage(1);
                          }} 
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.875rem 1rem',
            borderTop: '1px solid var(--border)',
            background: 'var(--secondary)',
            borderRadius: '0 0 var(--radius) var(--radius)'
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--foreground-muted)' }}>
              Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredSorted.length)}–{Math.min(page * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length} items
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                style={pageBtnStyle} 
                onClick={() => setPage(1)} 
                disabled={page === 1}
              >
                «
              </button>
              <button 
                style={pageBtnStyle} 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
              >
                ‹
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                if (p > totalPages) return null;
                return (
                  <button 
                    key={p} 
                    style={{ ...pageBtnStyle, ...(p === page ? activePageBtnStyle : {}) }} 
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                );
              })}
              <button 
                style={pageBtnStyle} 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page === totalPages}
              >
                ›
              </button>
              <button 
                style={pageBtnStyle} 
                onClick={() => setPage(totalPages)} 
                disabled={page === totalPages}
              >
                »
              </button>
            </div>
          </div>
        </div>

        {/* Add One Product Modal */}
        {showAddModal && (
          <div style={modalOverlayStyle}>
            <div style={{ 
              ...modalContentStyle, 
              maxWidth: '500px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Add New Product</h2>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)} 
                  style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  &times;
                </button>
              </div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: 'hidden' }}>
                <div style={{ paddingRight: '0.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={labelStyle}>Group *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Machinery"
                      value={formData.group} 
                      onChange={e => setFormData({ ...formData, group: e.target.value })} 
                      style={inputStyle}
                    />
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Product Name *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Semi automatic strapping machine"
                      value={formData.product} 
                      onChange={e => setFormData({ ...formData, product: e.target.value })} 
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Model Number *</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. PA-60"
                      value={formData.model} 
                      onChange={e => setFormData({ ...formData, model: e.target.value })} 
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Unit</label>
                    <input 
                      type="text" 
                      placeholder="pcs"
                      value={formData.unit} 
                      onChange={e => setFormData({ ...formData, unit: e.target.value })} 
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Minimum Stock Level</label>
                    <input 
                      type="number" 
                      min="0"
                      value={formData.minStock} 
                      onChange={e => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })} 
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Lead Time (Days)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="1"
                      placeholder="0"
                      value={formData.leadTimeDays} 
                      onChange={e => {
                        const val = parseInt(e.target.value);
                        setFormData({ ...formData, leadTimeDays: isNaN(val) ? 0 : val });
                      }} 
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Description</label>
                    <textarea 
                      rows={3}
                      placeholder="Optional details..."
                      value={formData.description} 
                      onChange={e => setFormData({ ...formData, description: e.target.value })} 
                      style={{ ...inputStyle, minHeight: '60px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', flexShrink: 0 }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Product"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Warehouse Manager Modal */}
        {showWarehouseModal && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: '500px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Warehouse Management</h2>
                <button 
                  type="button" 
                  onClick={() => setShowWarehouseModal(false)} 
                  style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  &times;
                </button>
              </div>
              
              {/* Add New Warehouse Section */}
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--foreground)' }}>Add New Warehouse</h3>
                <form onSubmit={handleAddWarehouse} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Storage Room A"
                    value={newWhName} 
                    onChange={e => setNewWhName(e.target.value)} 
                    style={{ ...inputStyle, padding: '0.5rem' }}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Add</button>
                </form>
              </div>

              {/* Active Warehouses Section */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--foreground)' }}>Active Warehouses</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                  {warehousesList.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--foreground-muted)', textAlign: 'center' }}>No warehouses registered.</p>
                  ) : (
                    warehousesList.map(wh => (
                      <div key={wh.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        {editingWhId === wh.id ? (
                          <form onSubmit={handleRenameWarehouse} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <input 
                              type="text" 
                              required 
                              value={editingWhName} 
                              onChange={e => setEditingWhName(e.target.value)} 
                              style={{ ...inputStyle, padding: '0.25rem 0.5rem', fontSize: '0.875rem', flex: 1 }} 
                            />
                            <button type="submit" className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Save</button>
                            <button type="button" className="btn-secondary" onClick={() => setEditingWhId(null)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Cancel</button>
                          </form>
                        ) : (
                          <>
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{wh.name}</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                onClick={() => {
                                  setEditingWhId(wh.id);
                                  setEditingWhName(wh.name);
                                }}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 600 }}
                              >
                                Rename
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                onClick={() => handleDeleteWarehouse(wh.id, wh.name)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              >
                                Remove
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowWarehouseModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Model Warning Modal */}
        {showDuplicateModal && (
          <div style={modalOverlayStyle}>
            <div style={{ ...modalContentStyle, maxWidth: '650px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#d97706', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚠️ Existing Model Number Found
              </h2>
              <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--foreground)' }}>
                The model number you entered already exists in the system. Below are the matching products:
              </p>
              <div style={{ overflowX: 'auto', marginBottom: '1.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--secondary)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Model</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Product Name</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Category</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Brand</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Supplier</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Warehouse & Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateProducts.map((p, idx) => {
                      // Compile stock list
                      const stockList = initialData.warehouses.map(w => {
                        const qty = p.stock?.[w.id] || 0;
                        return qty > 0 ? `${w.name}: ${qty} pcs` : null;
                      }).filter(Boolean);
                      const stockStr = stockList.length > 0 ? stockList.join(', ') : 'No stock';

                      return (
                        <tr key={idx} style={{ borderBottom: idx < duplicateProducts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{p.model}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{p.product}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{p.group}</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>N/A</td>
                          <td style={{ padding: '0.5rem 0.75rem' }}>{p.preferredSupplierName || 'None'}</td>
                          <td style={{ padding: '0.5rem 0.75rem', color: 'var(--foreground-muted)' }}>{stockStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowDuplicateModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleConfirmDuplicate}>
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Excel Import Modal */}
      {showImportModal && (
        <div style={modalOverlayStyle}>
          <div style={{ 
            background: 'white',
            borderRadius: '12px',
            width: '95%',
            maxWidth: '600px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.25rem 1.5rem', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Add Products Through Excel</h2>
              <button 
                type="button" 
                onClick={closeImportModal} 
                style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {importStep === 'guide' && (
                <div>
                  <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Excel Formatting Guide</h3>
                    <p style={{ marginBottom: '0.5rem' }}>
                      Please configure your Excel file (<strong>.xlsx</strong> or <strong>.xls</strong>) with the exact structure below.
                    </p>
                    
                    <h4 style={{ fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.25rem' }}>Required Columns (in any order):</h4>
                    <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
                      <li><strong>Group</strong>: Product grouping category. Cannot be empty.</li>
                      <li><strong>Product Name</strong>: Name of the product. Cannot be empty.</li>
                      <li><strong>Model Number</strong>: Unique identifier. Cannot be empty.</li>
                      <li><strong>Minimum Stock</strong>: Must be a non-negative number. Cannot be empty.</li>
                    </ul>

                    <h4 style={{ fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.25rem' }}>Optional Columns:</h4>
                    <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem' }}>
                      <li><strong>Unit</strong>: Defaults to "pcs" if omitted or left blank.</li>
                      <li><strong>Description</strong>: Optional text details.</li>
                    </ul>

                    <h4 style={{ fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.25rem' }}>Example Layout:</h4>
                    <div style={{ overflowX: 'auto', background: 'white', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.5rem' }}>
                      <table style={{ fontSize: '0.8rem', width: '100%', minWidth: '400px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Group</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Product Name</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Model Number</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Minimum Stock</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Unit</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left' }}>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px' }}>Machinery</td>
                            <td style={{ padding: '6px 8px' }}>Strapping Machine</td>
                            <td style={{ padding: '6px 8px' }}>PA-60</td>
                            <td style={{ padding: '6px 8px' }}>5</td>
                            <td style={{ padding: '6px 8px' }}>pcs</td>
                            <td style={{ padding: '6px 8px' }}>Auto strapping</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: '1rem', color: 'var(--warning)', fontSize: '0.85rem', display: 'flex', gap: '0.25rem' }}>
                      <span>⚠️</span>
                      <span>Empty cells in required columns, duplicate rows in the file, or invalid stocks will cause validation to fail. Existing products in the database will be skipped.</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button 
                      type="button" 
                      className="btn-primary" 
                      onClick={handleDownloadSample}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      📥 Download Sample Excel
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-primary"
                      onClick={() => setImportStep('upload')}
                      style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)' }}
                    >
                      Proceed to Upload
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'upload' && (
                <div>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={labelStyle}>Choose Excel File (.xlsx, .xls)</label>
                    <input 
                      type="file" 
                      accept=".xlsx, .xls"
                      onChange={handleFileChange}
                      style={inputStyle}
                    />
                  </div>

                  {validationPreview && (
                    <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Validation Preview</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        <div>Total Rows Found: <strong>{validationPreview.totalRows}</strong></div>
                        <div>Valid & Ready: <strong style={{ color: 'var(--success)' }}>{validationPreview.validRowsCount}</strong></div>
                        <div>Existing in DB (Will Skip): <strong style={{ color: 'var(--warning)' }}>{validationPreview.dbDuplicatesCount}</strong></div>
                        <div>Duplicates in File: <strong style={{ color: 'var(--danger)' }}>{validationPreview.fileDuplicatesCount}</strong></div>
                        <div>Missing/Invalid Data: <strong style={{ color: 'var(--danger)' }}>{validationPreview.missingDataCount}</strong></div>
                      </div>

                      {validationPreview.errors.length > 0 && (
                        <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'white', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--foreground)' }}>Logs / Messages:</div>
                          {validationPreview.errors.map((err, idx) => {
                            const isWarning = err.includes('(Will be skipped)') || err.includes('(Skipped)');
                            return (
                              <div key={idx} style={{ color: isWarning ? 'var(--warning)' : 'var(--danger)', marginBottom: '0.25rem' }}>
                                {isWarning ? '⚠️' : '❌'} {err}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      type="button" 
                      onClick={() => setImportStep('guide')}
                      style={{ flex: 1, padding: '0.75rem', background: 'var(--secondary)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Back to Guide
                    </button>
                    
                    <button 
                      type="button"
                      onClick={handleImport}
                      disabled={
                        !validationPreview || 
                        validationPreview.validRowsCount === 0 || 
                        validationPreview.fileDuplicatesCount > 0 || 
                        validationPreview.missingDataCount > 0 || 
                        importing
                      }
                      style={{
                        flex: 1, 
                        padding: '0.75rem', 
                        background: 'var(--primary)', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        cursor: (!validationPreview || validationPreview.validRowsCount === 0 || validationPreview.fileDuplicatesCount > 0 || validationPreview.missingDataCount > 0 || importing) ? 'not-allowed' : 'pointer',
                        opacity: (!validationPreview || validationPreview.validRowsCount === 0 || validationPreview.fileDuplicatesCount > 0 || validationPreview.missingDataCount > 0 || importing) ? 0.6 : 1
                      }}
                    >
                      {importing ? "Importing..." : "Import Products"}
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'summary' && importResult && (
                <div>
                  <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
                    <div style={{ fontSize: '3rem' }}>🎉</div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--success)' }}>
                      Products Imported
                    </h3>
                  </div>

                  <div style={{ background: 'var(--secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Rows Processed:</span>
                        <strong>{importResult.total}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                        <span>Successfully Imported:</span>
                        <strong>{importResult.imported}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--warning)' }}>
                        <span>Skipped (Existing):</span>
                        <strong>{importResult.skipped}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                        <span>Failed:</span>
                        <strong>{importResult.failed}</strong>
                      </div>
                    </div>

                    {importResult.errors.length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Import Logs:</div>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'white', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                          {importResult.errors.map((err, idx) => (
                            <div key={idx} style={{ color: (err.includes('Skipped') || err.includes('exists')) ? 'var(--warning)' : 'var(--danger)', marginBottom: '0.25rem' }}>
                              {err}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    type="button" 
                    className="btn-primary" 
                    onClick={closeImportModal}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && editingProduct && (
        <div style={modalOverlayStyle}>
          <form 
            onSubmit={handleEditSubmit} 
            className="modal-form"
            style={{ 
              background: 'white',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '500px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.25rem 1.5rem', 
              borderBottom: '1px solid var(--border)' 
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Edit Product</h2>
              <button 
                type="button" 
                onClick={() => setShowEditModal(false)} 
                style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground-muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ 
              padding: '1.5rem', 
              overflowY: 'auto', 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem' 
            }}>
              <div>
                <label style={labelStyle}>Group *</label>
                <input 
                  type="text" 
                  required 
                  value={editFormData.group} 
                  onChange={e => setEditFormData({ ...editFormData, group: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Product Name *</label>
                <input 
                  type="text" 
                  required 
                  value={editFormData.product} 
                  onChange={e => setEditFormData({ ...editFormData, product: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Model Number (Read-only)</label>
                <input 
                  type="text" 
                  disabled 
                  value={editFormData.model} 
                  style={{ ...inputStyle, background: 'var(--secondary)', cursor: 'not-allowed' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginTop: '2px', display: 'block' }}>
                  Model number cannot be edited to maintain referential consistency.
                </span>
              </div>

              <div>
                <label style={labelStyle}>Unit</label>
                <input 
                  type="text" 
                  placeholder="pcs" 
                  value={editFormData.unit} 
                  onChange={e => setEditFormData({ ...editFormData, unit: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Minimum Stock Level *</label>
                <input 
                  type="number" 
                  required 
                  min="0"
                  value={editFormData.minStock} 
                  onChange={e => setEditFormData({ ...editFormData, minStock: parseInt(e.target.value) || 0 })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle} title="Number of days supplier takes to deliver after placing order.">
                  Lead Time (Days) <span style={{ cursor: 'help', color: 'var(--foreground-muted)' }}>ℹ️</span>
                </label>
                <input 
                  type="number" 
                  min="0"
                  step="1"
                  placeholder="0"
                  value={editFormData.leadTimeDays} 
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setEditFormData({ ...editFormData, leadTimeDays: isNaN(val) ? 0 : val });
                  }}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea 
                  rows={3}
                  placeholder="Optional details..."
                  value={editFormData.description} 
                  onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer-actions" style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              background: 'var(--secondary)', 
              display: 'flex', 
              gap: '0.5rem',
              justifyContent: 'flex-end'
            }}>
              <button 
                type="button" 
                onClick={handleResetEdit} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Reset
              </button>
              <button 
                type="button" 
                onClick={() => setShowEditModal(false)} 
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={isEditingSubmitting}
                style={{ padding: '0.5rem 1rem', borderRadius: '6px' }}
              >
                {isEditingSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Button Styling Styles */}
      <style>{`
        .btn-excel-import {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white !important;
          padding: 0.625rem 0.75rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.825rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          border: none;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
          transition: all 0.2s ease;
          cursor: pointer;
          height: 38px;
        }
        .btn-excel-import:hover:not(:disabled) {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);
        }
        .btn-excel-import:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
        }
        .btn-excel-import:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-excel-export {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white !important;
          padding: 0.625rem 0.75rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.825rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          border: none;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
          transition: all 0.2s ease;
          cursor: pointer;
          height: 38px;
        }
        .btn-excel-export:hover:not(:disabled) {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(37, 99, 235, 0.3);
        }
        .btn-excel-export:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
        }
        .btn-excel-export:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 480px) {
          .btn-excel-import, .btn-excel-export {
            flex: none !important;
            width: 100% !important;
          }
          .excel-btn-container {
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}

// Styling classes mapped to style properties
const actionBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--primary)',
  cursor: 'pointer',
  padding: '0.25rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  transition: 'var(--transition)',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  background: 'white',
  padding: '2rem',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '400px',
  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
};

const labelStyle = {
  display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)'
};

const inputStyle = {
  width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.95rem'
};

const pageBtnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'white',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'var(--transition)',
  color: 'var(--foreground)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const activePageBtnStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: 'white',
  borderColor: 'var(--primary)',
};
