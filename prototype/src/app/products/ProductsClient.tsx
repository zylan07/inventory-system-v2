"use client";

import { useState, useMemo, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { InventoryDb, Item } from "@/lib/db";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import EmptyState from "@/components/EmptyState";
import * as XLSX from "xlsx";

type SortKey = "group" | "product" | "model" | "minStock" | "unit";
type SortDir = "asc" | "desc";

const highlightText = (text: string, query: string) => {
  if (!text) return "";
  if (!query || !query.trim()) return text;

  const keywords = query.split(" ").filter(Boolean);
  if (keywords.length === 0) return text;

  const escaped = keywords.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark 
            key={i} 
            style={{ 
              background: '#fef08a', 
              color: '#854d0e', 
              padding: '0 2px', 
              borderRadius: '2px',
              fontWeight: 600
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

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
    unit: "",
  });

  // Client-side search, sort, pagination
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("model");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Advanced dropdown filter states
  const [filterGroup, setFilterGroup] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterStockStatus, setFilterStockStatus] = useState("");

  // Debouncing effect for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      // Ignore extra internal spaces, leading/trailing spaces
      const cleaned = search.trim().replace(/\s+/g, " ");
      setDebouncedSearch(cleaned);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Timeline modal states
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [activeTimelineProductId, setActiveTimelineProductId] = useState<string | number | null>(null);
  const [timelineData, setTimelineData] = useState<{
    product: any;
    currentStock: any[];
    transactions: any[];
  } | null>(null);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(false);
  const [timelineFilterType, setTimelineFilterType] = useState("All");
  const [timelineSortDir, setTimelineSortDir] = useState<"desc" | "asc">("desc");

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
    unit: ""
  });
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);

  // Prevent background scrolling when modals are open
  useEffect(() => {
    if (showImportModal || showEditModal || showTimelineModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showImportModal, showEditModal, showTimelineModal]);

  // Listen for Escape key to close Timeline modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showTimelineModal) {
        setShowTimelineModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTimelineModal]);

  // Extensible Timeline Architecture: Normalize movement & catalog creation events
  const normalizedEvents = useMemo(() => {
    if (!timelineData) return [];
    const list: any[] = [];

    // 1. Add Creation Event
    if (timelineData.product.created_at) {
      list.push({
        id: 'create',
        type: 'CREATED',
        title: 'Product Created',
        timestamp: new Date(timelineData.product.created_at),
        user: 'System/Import',
        warehouse: 'Initial Catalog',
        quantity: null,
        remarks: 'Product initialized in database.',
        refId: `PRD-${timelineData.product.id}`,
        color: '#64748b', // Gray
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )
      });
    }

    // 2. Add Transactions
    timelineData.transactions.forEach((tx: any) => {
      const isExcel = tx.narration && tx.narration.toLowerCase().includes('excel');
      let title = tx.type;
      let color = '#3b82f6'; // Blue default
      let icon = null;

      if (tx.type === 'INWARD') {
        title = isExcel ? 'Excel Import' : 'Inward Stock';
        color = '#10b981'; // Green
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        );
      } else if (tx.type === 'OUTWARD') {
        title = 'Outward Stock';
        color = '#ef4444'; // Red
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        );
      } else if (tx.type === 'TRANSFER') {
        title = 'Warehouse Transfer';
        color = '#3b82f6'; // Blue
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 3 4 4-4 4M8 21l-4-4 4-4M20 7H4M4 17h16" />
          </svg>
        );
      } else if (tx.type === 'ADJUSTMENT') {
        title = 'Physical Adjustment';
        color = '#f59e0b'; // Orange
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        );
      }

      list.push({
        id: String(tx.id),
        type: tx.type,
        title,
        timestamp: new Date(tx.created_at),
        user: tx.user_name || tx.user_email || 'System',
        warehouse: tx.type === 'TRANSFER' 
          ? `${tx.from_warehouse_name} → ${tx.to_warehouse_name}`
          : tx.warehouse_name || 'N/A',
        quantity: tx.quantity,
        remarks: tx.narration || '',
        refId: tx.id ? `TXN-${tx.id}` : '',
        color,
        icon
      });
    });

    // 3. Filter list
    let filtered = list;
    if (timelineFilterType !== "All") {
      filtered = list.filter(e => e.type === timelineFilterType);
    }

    // 4. Sort list
    filtered.sort((a, b) => {
      const tA = a.timestamp.getTime();
      const tB = b.timestamp.getTime();
      return timelineSortDir === "desc" ? tB - tA : tA - tB;
    });

    return filtered;
  }, [timelineData, timelineFilterType, timelineSortDir]);

  // Group events by date for rendering headings
  const groupedTimelineEvents = useMemo(() => {
    const groups: Record<string, any[]> = {};
    normalizedEvents.forEach(e => {
      const dateStr = e.timestamp.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(e);
    });
    return Object.entries(groups);
  }, [normalizedEvents]);

  // Manual Creation Submit Handler
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
        unit: formData.unit.trim() || 'pcs',
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
      });
      if (refresh) refresh();
    } catch (err: any) {
      showToast(err.message || "Failed to add product", "error");
    } finally {
      setIsSubmitting(false);
    }
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

  // Unique values for dropdown filters
  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>();
    initialData.items.forEach(i => { if (i.group) groups.add(i.group); });
    return Array.from(groups).sort();
  }, [initialData.items]);

  const uniqueProducts = useMemo(() => {
    const products = new Set<string>();
    initialData.items.forEach(i => { if (i.product) products.add(i.product); });
    return Array.from(products).sort();
  }, [initialData.items]);

  // Advanced filtering and sorting calculations (Memoized)
  const filteredSorted = useMemo(() => {
    let items = initialData.items.filter(item => {
      // 1. Group Dropdown Filter
      if (filterGroup && item.group !== filterGroup) return false;

      // 2. Product Name Dropdown Filter
      if (filterProduct && item.product !== filterProduct) return false;

      const totalStock = Object.values(item.stock).reduce((s, n) => s + n, 0);

      // 3. Warehouse Dropdown Filter
      if (filterWarehouse) {
        const qty = item.stock[filterWarehouse] || 0;
        if (qty === 0) return false;
      }

      // 4. Stock Status Dropdown Filter
      if (filterStockStatus) {
        const minVal = item.minStock ?? 10;
        if (filterStockStatus === "in_stock" && totalStock <= 0) return false;
        if (filterStockStatus === "low_stock" && (totalStock <= 0 || totalStock >= minVal)) return false;
        if (filterStockStatus === "out_of_stock" && totalStock > 0) return false;
        if (filterStockStatus === "overstock" && totalStock < minVal * 2) return false;
      }

      // 5. Multi-Keyword Debounced Search Filter
      if (debouncedSearch) {
        const keywords = debouncedSearch.toLowerCase().split(" ").filter(Boolean);
        return keywords.every(kw => {
          // Model number
          if (item.model.toLowerCase().includes(kw)) return true;
          // Product name
          if (item.product.toLowerCase().includes(kw)) return true;
          // Group name
          if (item.group.toLowerCase().includes(kw)) return true;
          // Description
          if ((item.description || "").toLowerCase().includes(kw)) return true;
          // Unit
          if ((item.unit || "pcs").toLowerCase().includes(kw)) return true;
          // Total stock
          if (String(totalStock).includes(kw)) return true;
          // Min stock
          if (String(item.minStock ?? 10).includes(kw)) return true;
          // Warehouse containing stock
          const inWarehouse = initialData.warehouses.some(w => 
            w.name.toLowerCase().includes(kw) && (item.stock[w.id] || 0) > 0
          );
          if (inWarehouse) return true;

          return false;
        });
      }

      return true;
    });

    // Sorting
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
  }, [initialData.items, debouncedSearch, filterGroup, filterProduct, filterWarehouse, filterStockStatus, sortKey, sortDir, initialData.warehouses]);

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
      unit: product.unit || 'pcs'
    });
    setShowEditModal(true);
  };

  const openTimelineModal = async (productId: string | number) => {
    setActiveTimelineProductId(productId);
    setShowTimelineModal(true);
    setIsTimelineLoading(true);
    setTimelineError(false);
    setTimelineData(null);
    try {
      const res = await apiFetch(`/products/${productId}/history`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load product history.");
      }
      setTimelineData(json.data);
    } catch (err) {
      console.error("Timeline load failed:", err);
      setTimelineError(true);
    } finally {
      setIsTimelineLoading(false);
    }
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
      unit: editingProduct.unit || 'pcs'
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
        unit: editFormData.unit.trim() || 'pcs'
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
              <label className="form-label mb-1">Unit</label>
              <input 
                type="text" 
                placeholder="pcs"
                value={formData.unit} 
                onChange={e => setFormData({ ...formData, unit: e.target.value })} 
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

            <div className="excel-btn-container" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button 
                type="button" 
                className="btn-excel-import" 
                style={{ flex: 1 }}
                onClick={() => setShowImportModal(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <polyline points="9 15 12 12 15 15" />
                </svg>
                <span>Add Through Excel</span>
              </button>
              <button 
                type="button" 
                className="btn-excel-export" 
                style={{ flex: 1 }}
                onClick={handleExportExcel}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="12" x2="12" y2="18" />
                  <polyline points="15 15 12 18 9 15" />
                </svg>
                <span>Export Excel</span>
              </button>
            </div>
          </form>
        </div>

        {/* Catalog Table Container */}
        <div className="card md:col-span-2" style={{ padding: 0 }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
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

            {/* Advanced Filters Dropdown Group */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
              <select 
                value={filterGroup} 
                onChange={e => { setFilterGroup(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.625rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', minWidth: '130px', outline: 'none' }}
              >
                <option value="">All Groups</option>
                {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select 
                value={filterProduct} 
                onChange={e => { setFilterProduct(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.625rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', minWidth: '130px', outline: 'none' }}
              >
                <option value="">All Products</option>
                {uniqueProducts.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select 
                value={filterWarehouse} 
                onChange={e => { setFilterWarehouse(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.625rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', minWidth: '130px', outline: 'none' }}
              >
                <option value="">All Warehouses</option>
                {initialData.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <select 
                value={filterStockStatus} 
                onChange={e => { setFilterStockStatus(e.target.value); setPage(1); }}
                style={{ padding: '0.45rem 0.625rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'white', minWidth: '130px', outline: 'none' }}
              >
                <option value="">All Stock Status</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out Of Stock</option>
                <option value="overstock">Overstock</option>
              </select>
            </div>

            {/* Active Filters Pills */}
            {(filterGroup || filterProduct || filterWarehouse || filterStockStatus) && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground-muted)' }}>Active Filters:</span>
                {filterGroup && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                    Group: {filterGroup}
                    <button type="button" onClick={() => setFilterGroup("")} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>×</button>
                  </span>
                )}
                {filterProduct && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                    Product: {filterProduct}
                    <button type="button" onClick={() => setFilterProduct("")} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>×</button>
                  </span>
                )}
                {filterWarehouse && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                    Warehouse: {initialData.warehouses.find(w => w.id === filterWarehouse)?.name}
                    <button type="button" onClick={() => setFilterWarehouse("")} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>×</button>
                  </span>
                )}
                {filterStockStatus && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                    Status: {filterStockStatus === 'in_stock' ? 'In Stock' : filterStockStatus === 'low_stock' ? 'Low Stock' : filterStockStatus === 'out_of_stock' ? 'Out of Stock' : 'Overstock'}
                    <button type="button" onClick={() => setFilterStockStatus("")} style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>×</button>
                  </span>
                )}
                <button 
                  type="button"
                  onClick={() => {
                    setFilterGroup("");
                    setFilterProduct("");
                    setFilterWarehouse("");
                    setFilterStockStatus("");
                    setPage(1);
                  }} 
                  className="btn-secondary" 
                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', borderRadius: '4px' }}
                >
                  Clear All
                </button>
              </div>
            )}
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
                    <td style={{ fontWeight: 600 }}>{highlightText(item.model, debouncedSearch)}</td>
                    <td>
                      <div>{highlightText(item.product, debouncedSearch)}</div>
                      {item.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--foreground-muted)', marginTop: '2px' }}>
                          {highlightText(item.description, debouncedSearch)}
                        </div>
                      )}
                    </td>
                    <td>{highlightText(item.group, debouncedSearch)}</td>
                    <td>{highlightText(item.unit || 'pcs', debouncedSearch)}</td>
                    <td>{highlightText(String(item.minStock ?? 10), debouncedSearch)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        type="button"
                        onClick={() => openTimelineModal(item.id)} 
                        className="btn-action-edit"
                        style={{ marginRight: '0.5rem' }}
                        title="View Product History"
                        aria-label="View Product History"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </button>
                      <button 
                        type="button"
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
      </div>

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
            <div style={{ 
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

      {/* Product Timeline Modal */}
      {showTimelineModal && (
        <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label="Product Lifecycle Timeline">
          <div 
            style={{ 
              background: 'white',
              borderRadius: '12px',
              width: '95%',
              maxWidth: '680px',
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
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Product Lifecycle History</h2>
              <button 
                type="button" 
                onClick={() => setShowTimelineModal(false)} 
                aria-label="Close Product History modal"
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
              gap: '1.25rem' 
            }}>
              {/* 1. Loading Skeleton loader */}
              {isTimelineLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem' }}>
                  <div style={{ height: '40px', background: '#f1f5f9', borderRadius: '6px', width: '60%', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '100px', background: '#f1f5f9', borderRadius: '6px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '50px', background: '#f1f5f9', borderRadius: '6px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '50px', background: '#f1f5f9', borderRadius: '6px', animation: 'pulse 1.5s infinite' }} />
                </div>
              )}

              {/* 2. Error Message Retry Block */}
              {timelineError && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                  <div style={{ transform: 'scale(0.85)', marginBottom: '-1rem' }}>
                    <EmptyState 
                      type="search" 
                      onPrimaryAction={() => activeTimelineProductId && openTimelineModal(activeTimelineProductId)}
                    />
                  </div>
                  <p style={{ color: 'var(--danger)', fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem' }}>
                    Unable to load product history.
                  </p>
                  <button 
                    type="button"
                    onClick={() => activeTimelineProductId && openTimelineModal(activeTimelineProductId)} 
                    className="btn-primary" 
                    aria-label="Retry loading product history"
                    style={{ marginTop: '0.75rem', padding: '0.45rem 1.25rem', borderRadius: '6px' }}
                  >
                    Retry Connection
                  </button>
                </div>
              )}

              {/* 3. Empty History Block */}
              {!isTimelineLoading && !timelineError && timelineData && normalizedEvents.length === 0 && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                  <div style={{ transform: 'scale(0.85)' }}>
                    <EmptyState 
                      type="search" 
                      onPrimaryAction={() => {
                        setTimelineFilterType("All");
                        setTimelineSortDir("desc");
                      }}
                    />
                  </div>
                  <p style={{ color: 'var(--foreground-muted)', fontSize: '0.875rem', marginTop: '1rem' }}>
                    No movement history available for this product.
                  </p>
                  {timelineFilterType !== "All" && (
                    <button 
                      type="button"
                      onClick={() => setTimelineFilterType("All")} 
                      className="btn-secondary" 
                      aria-label="Reset filter type to all"
                      style={{ marginTop: '0.75rem', padding: '0.45rem 1rem', borderRadius: '6px' }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              )}

              {/* 4. Loaded Timeline Content */}
              {!isTimelineLoading && !timelineError && timelineData && normalizedEvents.length > 0 && (
                <>
                  {/* Header Summary Card */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', background: '#fafafa' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem 1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>PRODUCT NAME</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{timelineData.product.product_name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>MODEL NUMBER</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{timelineData.product.model_no}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>GROUP</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{timelineData.product.group_name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>MINIMUM STOCK</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>{timelineData.product.min_stock ?? 10} {timelineData.product.unit || 'pcs'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>TOTAL STOCK</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {timelineData.currentStock.reduce((s, n) => s + n.quantity, 0)} {timelineData.product.unit || 'pcs'}
                        </div>
                      </div>
                      {timelineData.product.created_at && (
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>CREATED DATE</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)' }}>
                            {new Date(timelineData.product.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Warehouse wise badges */}
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground-muted)', marginBottom: '0.5rem' }}>
                        Warehouse Breakdown ({timelineData.currentStock.filter(st => st.quantity > 0).length} Active Warehouses)
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {timelineData.currentStock.map(st => (
                          <div 
                            key={st.warehouse_id} 
                            style={{ 
                              border: '1px solid var(--border)', 
                              borderRadius: '6px', 
                              padding: '0.4rem 0.75rem', 
                              background: 'white', 
                              minWidth: '100px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }}
                          >
                            <span style={{ fontSize: '0.68rem', color: 'var(--foreground-muted)', fontWeight: 600 }}>{st.warehouse_name}</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: st.quantity > 0 ? 'var(--primary)' : 'var(--foreground-muted)' }}>
                              {st.quantity} {timelineData.product.unit || 'pcs'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Filters & Sorting Toolbar */}
                  <div 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      flexWrap: 'wrap', 
                      gap: '0.75rem', 
                      borderTop: '1px solid var(--border)', 
                      borderBottom: '1px solid var(--border)', 
                      padding: '0.75rem 0',
                      background: '#f8fafc',
                      margin: '0.5rem 0',
                      borderRadius: '6px',
                      paddingLeft: '0.75rem',
                      paddingRight: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground-muted)' }}>Event:</span>
                      <select 
                        value={timelineFilterType} 
                        onChange={e => setTimelineFilterType(e.target.value)}
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'white', outline: 'none' }}
                      >
                        <option value="All">All Events</option>
                        <option value="CREATED">Created</option>
                        <option value="INWARD">Inward</option>
                        <option value="OUTWARD">Outward</option>
                        <option value="TRANSFER">Transfer</option>
                        <option value="ADJUSTMENT">Adjustment</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground-muted)' }}>Order:</span>
                      <select 
                        value={timelineSortDir} 
                        onChange={e => setTimelineSortDir(e.target.value as any)}
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'white', outline: 'none' }}
                      >
                        <option value="desc">Newest First</option>
                        <option value="asc">Oldest First</option>
                      </select>
                    </div>
                  </div>

                  {/* Visual Chronological List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingLeft: '0.5rem', position: 'relative' }}>
                    {groupedTimelineEvents.map(([dateStr, events]) => (
                      <div key={dateStr}>
                        {/* Date Group Heading */}
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span>📅</span>
                          <span>{dateStr}</span>
                        </div>

                        {/* Event Items in Group */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '2px solid #e2e8f0', marginLeft: '0.5rem', paddingLeft: '1.25rem' }}>
                          {events.map((evt, idx) => (
                            <div key={evt.id || idx} style={{ position: 'relative' }}>
                              {/* Colored Visual Node & Icon */}
                              <div 
                                style={{ 
                                  position: 'absolute', 
                                  left: '-28px', 
                                  top: '4px', 
                                  width: '20px', 
                                  height: '20px', 
                                  borderRadius: '50%', 
                                  background: evt.color, 
                                  color: 'white', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                  zIndex: 10
                                }}
                              >
                                {evt.icon}
                              </div>

                              {/* Normalized card parameters */}
                              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem 1rem', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--foreground)' }}>{evt.title}</span>
                                  {evt.quantity !== null && (
                                    <span 
                                      className="badge" 
                                      style={{ 
                                        background: `${evt.color}15`, 
                                        color: evt.color, 
                                        border: `1.5px solid ${evt.color}30`, 
                                        fontSize: '0.725rem',
                                        fontWeight: 700,
                                        borderRadius: '12px',
                                        padding: '0.1rem 0.5rem'
                                      }}
                                    >
                                      {evt.quantity > 0 ? `+${evt.quantity}` : evt.quantity} {timelineData.product.unit || 'pcs'}
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.75rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--foreground-muted)' }}>
                                  <div>👤 <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{evt.user}</span></div>
                                  <div>📦 <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{evt.warehouse}</span></div>
                                  <div>⏰ {evt.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                                  {evt.refId && <div>🆔 <span style={{ fontFamily: 'monospace' }}>{evt.refId}</span></div>}
                                </div>

                                {evt.remarks && (
                                  <div 
                                    style={{ 
                                      marginTop: '0.5rem', 
                                      fontSize: '0.725rem', 
                                      background: '#f8fafc', 
                                      padding: '0.4rem 0.6rem', 
                                      borderRadius: '4px', 
                                      color: 'var(--foreground)',
                                      border: '1px solid var(--border)',
                                      fontStyle: 'italic',
                                      wordBreak: 'break-word'
                                    }}
                                  >
                                    💬 "{evt.remarks}"
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid var(--border)', 
              background: 'var(--secondary)', 
              display: 'flex', 
              justifyContent: 'flex-end'
            }}>
              <button 
                type="button" 
                onClick={() => setShowTimelineModal(false)} 
                className="btn-secondary"
                aria-label="Close Product History modal"
                style={{ padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600 }}
              >
                Close
              </button>
            </div>
          </div>
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
