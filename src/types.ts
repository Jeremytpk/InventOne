/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
  email: string;
  name: string;
  approved: boolean;
  role: 'admin' | 'client';
  createdAt: any; // Can be Timestamp or Timestamp-JSON or Date
  firstName?: string;
  lastName?: string;
  accountType?: 'personnel' | 'compagnie';
  phone?: string;
  companyName?: string;
  companyAddress?: string;
  productSold?: string;
  companyId?: string;
  requestedCompanyId?: string;
  requestedCompanyName?: string;
  address?: string;
  loginId?: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  productSold: string;
  phone: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  createdAt: any;
}

export interface CompanyRequest {
  id: string;
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyAddress: string;
  productSold: string;
  createdAt: any;
  status: 'pending' | 'approved' | 'rejected';
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  minStockAlert: number;
  updatedAt: any;
}

export interface ClientStock {
  id: string; // usually clientUid or itemUid_clientUid
  clientId: string;
  clientName: string;
  articleId: string;
  articleName: string;
  assignedQuantity: number;
  currentStock: number;
  lastUpdated: any;
}

export interface AuditLog {
  id: string;
  type: 'add_stock' | 'sub_stock' | 'distribute_client' | 'client_report';
  articleName: string;
  quantity: number;
  clientId?: string;
  clientName?: string;
  operatorEmail: string;
  timestamp: any;
}

export interface StockRequest {
  id: string;
  clientId: string;
  clientName: string;
  companyId: string;
  articleId: string;
  articleName: string;
  requestedQuantity: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}
