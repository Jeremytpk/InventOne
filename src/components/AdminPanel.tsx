/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { User, InventoryItem, ClientStock, AuditLog, Company, CompanyRequest } from '../types';
import { 
  Plus, 
  Minus, 
  Truck, 
  AlertTriangle, 
  History, 
  UserCheck, 
  TrendingDown, 
  Package, 
  Users, 
  Bell, 
  Sparkles, 
  RefreshCw,
  Check,
  Fuel
} from 'lucide-react';

interface AdminPanelProps {
  adminUser: User;
}

export default function AdminPanel({ adminUser }: AdminPanelProps) {
  // Global States
  const [users, setUsers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<InventoryItem | null>(null);
  const [clientStocks, setClientStocks] = useState<ClientStock[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyRequests, setCompanyRequests] = useState<CompanyRequest[]>([]);

  // Action input states
  const [stockModifyQty, setStockModifyQty] = useState<number>(10);
  const [selectedClientForAssign, setSelectedClientForAssign] = useState<string>('');
  const [assignQty, setAssignQty] = useState<number>(20);
  const [minAlertVal, setMinAlertVal] = useState<number>(30);
  
  // Modals / Status feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [approvalsTab, setApprovalsTab] = useState<'personnel' | 'compagnie'>('personnel');
  const [selectedUserCompanyMap, setSelectedUserCompanyMap] = useState<Record<string, string>>({});

  // Load All Collections in Real-Time
  useEffect(() => {
    // 1. Listen for all users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList: User[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        uList.push({
          uid: docSnap.id,
          email: data.email || '',
          name: data.name || '',
          approved: data.approved || false,
          role: data.role || 'client',
          createdAt: data.createdAt,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          accountType: data.accountType || 'personnel',
          phone: data.phone || '',
          companyName: data.companyName || '',
          companyAddress: data.companyAddress || '',
          productSold: data.productSold || '',
          companyId: data.companyId || '',
          requestedCompanyId: data.requestedCompanyId || '',
          requestedCompanyName: data.requestedCompanyName || '',
        });
      });
      setUsers(uList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    // 2. Listen to master Inventaire (Bidon d'Huile)
    const unsubInv = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      let mainItem: InventoryItem | null = null;
      snapshot.forEach((docSnap) => {
        if (docSnap.id === 'bidon_huile') {
          const data = docSnap.data();
          mainItem = {
            id: docSnap.id,
            name: data.name || "Bidon d'huile",
            quantity: Number(data.quantity ?? 0),
            minStockAlert: Number(data.minStockAlert ?? 30),
            updatedAt: data.updatedAt,
          };
        }
      });

      // If no "bidon_huile" document is in Firebase yet, bootstrap first entry
      if (!mainItem) {
        bootstrapDefaultItem();
      } else {
        setInventory(mainItem);
        setMinAlertVal((mainItem as InventoryItem).minStockAlert);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'inventory');
    });

    // 3. Listen to clients stocks (reported inventories)
    const unsubClientStocks = onSnapshot(collection(db, 'clientStocks'), (snapshot) => {
      const cStocks: ClientStock[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cStocks.push({
          id: docSnap.id,
          clientId: data.clientId || '',
          clientName: data.clientName || '',
          articleId: data.articleId || 'bidon_huile',
          articleName: data.articleName || "Bidon d'huile",
          assignedQuantity: Number(data.assignedQuantity ?? 0),
          currentStock: Number(data.currentStock ?? 0),
          lastUpdated: data.lastUpdated,
        });
      });
      setClientStocks(cStocks);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'clientStocks');
    });

    // 4. Listen to Audit Logs (last 50 rows)
    const unsubLogs = onSnapshot(collection(db, 'auditLogs'), (snapshot) => {
      const logs: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        logs.push({
          id: docSnap.id,
          type: data.type || 'add_stock',
          articleName: data.articleName || "Bidon d'huile",
          quantity: Number(data.quantity || 0),
          clientId: data.clientId,
          clientName: data.clientName,
          operatorEmail: data.operatorEmail || '',
          timestamp: data.timestamp,
        });
      });
      // Sort logs chronologically by timestamp descend
      logs.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setAuditLogs(logs.slice(0, 30));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'auditLogs');
    });

    // 5. Listen to Companies
    const unsubCompanies = onSnapshot(collection(db, 'compagnies'), (snapshot) => {
      const compList: Company[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        compList.push({
          id: docSnap.id,
          name: data.name || '',
          address: data.address || '',
          productSold: data.productSold || '',
          phone: data.phone || '',
          contactFirstName: data.contactFirstName || '',
          contactLastName: data.contactLastName || '',
          contactEmail: data.contactEmail || '',
          createdAt: data.createdAt,
        });
      });
      setCompanies(compList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'compagnies');
    });

    // 6. Listen to Company Requests
    const unsubCompanyRequests = onSnapshot(collection(db, 'companyRequests'), (snapshot) => {
      const reqList: CompanyRequest[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        reqList.push({
          id: docSnap.id,
          uid: data.uid || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          companyName: data.companyName || '',
          companyAddress: data.companyAddress || '',
          productSold: data.productSold || '',
          createdAt: data.createdAt,
          status: data.status || 'pending',
        });
      });
      setCompanyRequests(reqList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'companyRequests');
    });

    return () => {
      unsubUsers();
      unsubInv();
      unsubClientStocks();
      unsubLogs();
      unsubCompanies();
      unsubCompanyRequests();
    };
  }, []);

  // Database bootstrapper for initial empty states
  const bootstrapDefaultItem = async () => {
    try {
      const defaultDocRef = doc(db, 'inventory', 'bidon_huile');
      await setDoc(defaultDocRef, {
        name: "Bidon d'huile (Huile Moteur)",
        quantity: 120,
        minStockAlert: 35,
        updatedAt: serverTimestamp(),
      });
      console.log("Inventaire central initialisé avec 'Bidon de Huile'.");
    } catch (e) {
      console.error("Échec bootstrap default product: ", e);
    }
  };

  // 1. Central Stock Operations: Add Master Stock
  const handleModifyMasterStock = async (isAddition: boolean) => {
    if (!inventory) return;
    setActionError(null);
    setActionSuccess(null);

    const delta = Number(stockModifyQty);
    if (!delta || delta <= 0) {
      setActionError("Veuillez saisir une quantité supérieure à 0.");
      return;
    }

    setLoading(true);
    try {
      const currentQty = inventory.quantity;
      const nextQty = isAddition ? currentQty + delta : currentQty - delta;

      if (nextQty < 0) {
        throw new Error("L'opération est impossible : le stock restant ne peut pas être inférieur à zéro.");
      }

      // 1. Update the document in Firestore
      const itemRef = doc(db, 'inventory', 'bidon_huile');
      await updateDoc(itemRef, {
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });

      // 2. Log transaction in Audit
      const logRef = doc(collection(db, 'auditLogs'));
      await setDoc(logRef, {
        type: isAddition ? 'add_stock' : 'sub_stock',
        articleName: inventory.name,
        quantity: delta,
        operatorEmail: adminUser.email,
        timestamp: serverTimestamp(),
      });

      setActionSuccess(`Stock central ajusté avec succès : ${isAddition ? '+' : '-'}${delta} ${inventory.name}.`);
    } catch (err: any) {
      setActionError(err.message || "Erreur de mise à jour du stock.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Save threshold custom configuration
  const handleUpdateAlertThreshold = async () => {
    if (!inventory) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const itemRef = doc(db, 'inventory', 'bidon_huile');
      await updateDoc(itemRef, {
        minStockAlert: Number(minAlertVal),
        updatedAt: serverTimestamp(),
      });
      setActionSuccess("Seuil d'alerte critique sauvegardé !");
    } catch (err: any) {
      setActionError(err.message || "Échec de l'ajustement du seuil.");
    }
  };

  // 3. User Approvals list: Approve pending personal account with optional customized company linkage
  const handleApprovePersonalUser = async (userToApprove: User, customCompanyId?: string) => {
    setActionError(null);
    setActionSuccess(null);
    setLoading(true);

    try {
      const targetCompanyId = customCompanyId || selectedUserCompanyMap[userToApprove.uid] || userToApprove.requestedCompanyId;
      if (!targetCompanyId) {
        throw new Error("Veuillez sélectionner ou confirmer une compagnie partenaire pour rattacher cet utilisateur.");
      }

      const targetComp = companies.find(c => c.id === targetCompanyId);
      if (!targetComp) {
        throw new Error("La compagnie sélectionnée est introuvable.");
      }

      const userDocRef = doc(db, 'users', userToApprove.uid);
      await updateDoc(userDocRef, {
        approved: true,
        companyId: targetComp.id,
        companyName: targetComp.name,
      });

      setActionSuccess(`Utilisateur ${userToApprove.name} rattaché avec succès à "${targetComp.name}" et approuvé d'office !`);
    } catch (err: any) {
      setActionError(err.message || "Erreur lors de l'approbation du compte.");
    } finally {
      setLoading(false);
    }
  };

  // 3b. Company Request Approvals list: Validate company registration and its main user
  const handleApproveCompanyRequest = async (req: CompanyRequest) => {
    setActionError(null);
    setActionSuccess(null);
    setLoading(true);

    try {
      const batch = writeBatch(db);

      // A. Create company in 'compagnies' reference
      const companyId = `company_${req.uid}`;
      const companyDocRef = doc(db, 'compagnies', companyId);
      batch.set(companyDocRef, {
        name: req.companyName,
        address: req.companyAddress,
        productSold: req.productSold,
        phone: req.phone,
        contactFirstName: req.firstName,
        contactLastName: req.lastName,
        contactEmail: req.email,
        createdAt: serverTimestamp(),
      });

      // B. Update contact user profile to approved & rattachate companyId
      const userDocRef = doc(db, 'users', req.uid);
      batch.update(userDocRef, {
        approved: true,
        companyId: companyId,
        companyName: req.companyName,
        role: 'client',
      });

      // C. Set Company request element to approved
      const reqDocRef = doc(db, 'companyRequests', req.uid);
      batch.update(reqDocRef, {
        status: 'approved',
      });

      // D. Register audit transaction
      const logDocRef = doc(collection(db, 'auditLogs'));
      batch.set(logDocRef, {
        type: 'add_stock',
        articleName: `Enregistrement Compagnie: ${req.companyName}`,
        quantity: 0,
        operatorEmail: adminUser.email,
        timestamp: serverTimestamp(),
      });

      // Commit changes atomically
      await batch.commit();
      setActionSuccess(`La compagnie "${req.companyName}" est officiellement active ! Le compte de ${req.firstName} ${req.lastName} a été approuvé de plein droit.`);
    } catch (err: any) {
      setActionError(err.message || "Erreur lors de l'approbation de la compagnie.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Distribute stock to a Customer (which automatically subtracts quantity in total stock)
  const handleDistributeToClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!selectedClientForAssign) {
      setActionError("Veuillez sélectionner un client bénéficiaire.");
      return;
    }

    const qty = Number(assignQty);
    if (!qty || qty <= 0) {
      setActionError("Veuillez saisir une quantité valide à attribuer.");
      return;
    }

    if (!inventory) {
      setActionError("L'inventaire central n'est pas chargé.");
      return;
    }

    if (inventory.quantity < qty) {
      setActionError(`Rupture de Stock Imminente ! Impossible de distribuer ${qty} bidons. Stock central actuellement disponible : ${inventory.quantity}.`);
      return;
    }

    const targetClient = users.find(u => u.uid === selectedClientForAssign);
    if (!targetClient) {
      setActionError("Impossible de trouver les données de ce client.");
      return;
    }

    setLoading(true);
    const batch = writeBatch(db);

    try {
      // Step A: Subtract from master inventory
      const masterInvRef = doc(db, 'inventory', 'bidon_huile');
      batch.update(masterInvRef, {
        quantity: inventory.quantity - qty,
        updatedAt: serverTimestamp(),
      });

      // Step B: Write or update the Client Stock allocation
      // Unique document ID is of the pattern: clientUserId
      const clientStockId = `bidon_huile_${targetClient.uid}`;
      const clientStockRef = doc(db, 'clientStocks', clientStockId);

      // Verify if document already exists to accumulate delivered quantities
      const existingSnap = await getDoc(clientStockRef);
      if (existingSnap.exists()) {
        const snapData = existingSnap.data();
        const currentAssigned = Number(snapData.assignedQuantity ?? 0);
        const currentRemaining = Number(snapData.currentStock ?? 0);

        batch.update(clientStockRef, {
          assignedQuantity: currentAssigned + qty,
          currentStock: currentRemaining + qty, // When delivering, add the amount directly to their inventory count
          lastUpdated: serverTimestamp(),
        });
      } else {
        // Document does not exist, initialize it
        batch.set(clientStockRef, {
          clientId: targetClient.uid,
          clientName: targetClient.name,
          articleId: 'bidon_huile',
          articleName: "Bidon d'huile",
          assignedQuantity: qty,
          currentStock: qty,
          lastUpdated: serverTimestamp(),
        });
      }

      // Step C: Push record to auditLogs path
      const logId = `log_${Date.now()}`;
      const auditLogRef = doc(db, 'auditLogs', logId);
      batch.set(auditLogRef, {
        type: 'distribute_client',
        articleName: inventory.name,
        quantity: qty,
        clientId: targetClient.uid,
        clientName: targetClient.name,
        operatorEmail: adminUser.email,
        timestamp: serverTimestamp(),
      });

      // Commit changes atomically
      await batch.commit();

      setActionSuccess(`Distribution réussie : ${qty} bidons d'huile envoyés chez ${targetClient.name}. Le stock central a calculé automatiquement la déduction (-${qty}).`);
      setSelectedClientForAssign('');
      setAssignQty(20);
    } catch (err: any) {
      setActionError(err.message || "Erreur de distribution de l'inventaire.");
    } finally {
      setLoading(false);
    }
  };

  // Helper utility to check user credentials
  const pendingPersonalUsers = users.filter((u) => !u.approved && u.role === 'client' && u.accountType !== 'compagnie');
  const pendingCompanyRequests = companyRequests.filter((r) => r.status === 'pending');
  const approvedClients = users.filter((u) => u.approved && u.role === 'client');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" id="inventone-admin-panel">
      {/* Welcome Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm" id="banner">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[9px] font-mono tracking-wider font-bold text-blue-700 bg-blue-50 border border-blue-250 rounded uppercase">Administrateur</span>
            <span className="text-[10px] font-mono text-slate-400">PRO-ADMIN DASHBOARD</span>
          </div>
          <h1 className="text-2xl font-sans font-extrabold text-[#0f172a] tracking-tight">Espace d'Administration InventOne</h1>
          <p className="text-xs text-slate-500 font-medium">Supervisez l'état du stock central, suivez les rapports d'inventaire clients et validez les comptes utilisateurs.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={() => window.location.reload()}
            className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-350 transition-all cursor-pointer shadow-sm"
            title="Rafraîchir les données"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Global Status Banner Messages */}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded flex items-start gap-3.5 text-xs font-medium" id="admin-action-error">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-650" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-800 rounded flex items-start gap-3.5 text-xs font-medium animate-fade-in" id="admin-action-success">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-650" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Top statistics overview rows (Bento styled grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" id="admin-bento-stats">
        {/* Core Stock Indicator */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg flex items-center gap-3.5 shadow-sm" id="stat-main">
          <div className="bg-blue-50 text-blue-600 p-2.5 rounded border border-blue-105">
            <Package className="h-5.5 w-5.5" />
          </div>
          <div>
            <span className="text-slate-500 text-[10px] font-sans font-bold tracking-wider uppercase block">Stock Central</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-sans font-extrabold text-[#0f172a]">
                {inventory ? inventory.quantity : '...'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono font-medium">bidons</span>
            </div>
            {inventory && inventory.quantity <= inventory.minStockAlert ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-250 mt-1 animate-pulse">
                <AlertTriangle className="h-2.5 w-2.5" /> Seuil critique
              </span>
            ) : (
              <span className="text-[9px] text-emerald-600 font-sans font-bold block mt-1">Stock sécurisé ✓</span>
            )}
          </div>
        </div>

        {/* Client Alerts Flag */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg flex items-center gap-3.5 shadow-sm" id="stat-alerts">
          <div className="bg-amber-50 text-amber-600 p-2.5 rounded border border-amber-105">
            <Bell className="h-5.5 w-5.5" />
          </div>
          <div>
            <span className="text-slate-500 text-[10px] font-sans font-bold tracking-wider uppercase block">Alertes Ruptures</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-sans font-extrabold text-[#0f172a]">
                {clientStocks.filter(cs => cs.currentStock <= 5).length}
              </span>
              <span className="text-[11px] text-slate-400 font-mono font-medium">alertes</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono font-semibold block mt-1">Seuil client &lt;= 5 bidons</span>
          </div>
        </div>

        {/* Users Pending Approvals Count */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg flex items-center gap-3.5 shadow-sm" id="stat-approvals">
          <div className="bg-blue-50 text-blue-600 p-2.5 rounded border border-blue-105">
            <UserCheck className="h-5.5 w-5.5" />
          </div>
          <div>
            <span className="text-slate-500 text-[10px] font-sans font-bold tracking-wider uppercase block">Inscriptions</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-sans font-extrabold text-[#0f172a]">
                {pendingPersonalUsers.length + pendingCompanyRequests.length}
              </span>
              <span className="text-[11px] text-slate-400 font-mono font-medium">attentes</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono font-semibold block mt-1">Personnel ({pendingPersonalUsers.length}) | Compagnie ({pendingCompanyRequests.length})</span>
          </div>
        </div>

        {/* Total Active Clients */}
        <div className="bg-white border border-slate-200 p-4 rounded-lg flex items-center gap-3.5 shadow-sm" id="stat-clients">
          <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded border border-emerald-105">
            <Users className="h-5.5 w-5.5" />
          </div>
          <div>
            <span className="text-slate-500 text-[10px] font-sans font-bold tracking-wider uppercase block">Clients Actifs</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-sans font-extrabold text-[#0f172a]">
                {approvedClients.length}
              </span>
              <span className="text-[11px] text-slate-400 font-mono font-medium">comptes</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono font-semibold block mt-1">Approuvés pour livraison</span>
          </div>
        </div>
      </div>

      {/* Main Panels Layout (2 column grid) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" id="admin-main-grid">
        
        {/* LEFT COLUMN (Control stock, Approvals, Deliveries) -> 7cols */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section 1: Stock Central Management */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm" id="master-stock-section">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Fuel className="h-4.5 w-4.5 text-blue-600" />
                <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Gestion de Stock Central</h2>
              </div>
              {inventory && (
                <span className="text-[10px] font-mono text-slate-400">
                  MAJ : {inventory.updatedAt ? new Date(inventory.updatedAt.seconds * 1000).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}) : 'Non renseigné'}
                </span>
              )}
            </div>

            {inventory ? (
              <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] text-slate-400 font-mono tracking-wider block uppercase font-bold">ARTICLE ENREGISTRÉ</span>
                    <span className="text-sm font-sans font-bold text-slate-800">{inventory.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 font-mono tracking-wider block uppercase font-bold">STOCK DISPONIBLE</span>
                    <span className="text-xl font-sans font-extrabold text-blue-750">{inventory.quantity} bidons</span>
                  </div>
                </div>

                {/* Operations Form */}
                <div className="space-y-3">
                  <label className="text-[11px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Ajuster la quantité de l'article</label>
                  <div className="flex items-center gap-2">
                    <div className="w-1/4">
                      <input 
                        type="number" 
                        min="1"
                        value={stockModifyQty}
                        onChange={(e) => setStockModifyQty(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full h-9 bg-slate-50 border border-slate-250 font-sans text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/10 rounded text-center text-xs font-bold"
                        id="adjust-qty-input"
                      />
                    </div>
                    <div className="flex-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleModifyMasterStock(true)}
                        disabled={loading}
                        className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
                        id="btn-increment-stock"
                      >
                        <Plus className="h-3.5 w-3.5" /> Ajouter
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModifyMasterStock(false)}
                        disabled={loading}
                        className="flex-1 h-9 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all border border-slate-200 shadow-sm"
                        id="btn-decrement-stock"
                      >
                        <Minus className="h-3.5 w-3.5" /> Retirer
                      </button>
                    </div>
                  </div>
                </div>

                {/* Critical warning threshold adjustments */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex-1 space-y-0.5">
                      <label className="text-[11px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Seuil d'alerte critique</label>
                      <p className="text-[10px] text-slate-400 font-medium leading-normal">Déclenche une alerte si le stock central devient inférieur à ce nombre de bidons.</p>
                    </div>
                    <div className="w-[124px] flex gap-1.5 items-center">
                      <input 
                        type="number" 
                        min="0"
                        value={minAlertVal}
                        onChange={(e) => setMinAlertVal(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 h-8 bg-slate-50 border border-slate-250 text-slate-900 font-sans text-center rounded text-xs font-semibold"
                        id="alert-threshold-input"
                      />
                      <button
                        type="button"
                        onClick={handleUpdateAlertThreshold}
                        className="h-8 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 transition-all cursor-pointer shadow-inner"
                        id="btn-save-threshold"
                      >
                        Sauver
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 font-mono animate-pulse">Chargement de l'inventaire central de bidons...</div>
            )}
          </section>

          {/* Section 2: Account Approvals */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm" id="approvals-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4.5 w-4.5 text-blue-600" />
                <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Validation des Inscriptions ({pendingPersonalUsers.length + pendingCompanyRequests.length})</h2>
              </div>
              
              {/* Approval Tab Controls */}
              <div className="flex p-0.5 bg-slate-100 rounded border border-slate-200 text-[11px] font-sans font-bold">
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                    approvalsTab === 'personnel'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  onClick={() => setApprovalsTab('personnel')}
                >
                  Personnels ({pendingPersonalUsers.length})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                    approvalsTab === 'compagnie'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  onClick={() => setApprovalsTab('compagnie')}
                >
                  Compagnies ({pendingCompanyRequests.length})
                </button>
              </div>
            </div>

            {approvalsTab === 'personnel' ? (
              pendingPersonalUsers.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] rounded border border-slate-200 border-dashed">
                  Aucun compte personnel en attente d'approbation.
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingPersonalUsers.map((pending) => {
                    const currentSelectedCompany = selectedUserCompanyMap[pending.uid] || pending.requestedCompanyId || '';
                    return (
                      <div 
                        key={pending.uid} 
                        className="p-4.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-3.5"
                        id={`pending-user-${pending.uid}`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1 min-w-0">
                            <p className="font-sans font-extrabold text-xs text-slate-800 truncate">{pending.name}</p>
                            <p className="font-mono text-[10px] text-slate-500 truncate">{pending.email}</p>
                            <div className="flex gap-2 items-center flex-wrap mt-1">
                              <span className="inline-flex py-0.5 text-[8.5px] font-sans font-bold text-blue-700 bg-blue-50 px-1.5 rounded border border-blue-200 uppercase">Personnel</span>
                              <span className="text-[10px] text-slate-500">Compagnie raccordée : <strong className="text-slate-800">{pending.requestedCompanyName || 'Inconnue'}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Dropdown to link or change company rattachated */}
                        <div className="pt-2.5 border-t border-slate-150 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <div className="flex-1 space-y-1">
                            <span className="text-[9.5px] font-sans font-bold text-slate-550 uppercase">Rattacher à la Compagnie :</span>
                            <select
                              value={currentSelectedCompany}
                              onChange={(e) => setSelectedUserCompanyMap(prev => ({ ...prev, [pending.uid]: e.target.value }))}
                              className="w-full h-8 px-2 bg-white border border-slate-250 text-[#0f172a] text-[11px] rounded"
                            >
                              <option value="">-- Sélectionner la compagnie --</option>
                              {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.address})</option>
                              ))}
                            </select>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleApprovePersonalUser(pending)}
                            className="px-3.5 h-8 bg-blue-600 hover:bg-blue-700 text-white font-sans text-[10.5px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs self-end"
                            id={`approve-btn-${pending.uid}`}
                          >
                            <Check className="h-3.5 w-3.5" /> Rattacher & Approuver
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              pendingCompanyRequests.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] rounded border border-slate-200 border-dashed">
                  Aucune demande de création de compagnie en attente.
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingCompanyRequests.map((req) => (
                    <div 
                      key={req.uid} 
                      className="p-4.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-3"
                      id={`pending-company-${req.uid}`}
                    >
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div className="space-y-1">
                          <p className="font-sans font-extrabold text-xs text-blue-700 uppercase tracking-tight">{req.companyName}</p>
                          <p className="text-[10px] text-slate-500 font-medium">Adresse : {req.companyAddress}</p>
                          <p className="text-[10px] text-slate-500 font-semibold font-sans">Produit déclaré : {req.productSold}</p>
                        </div>
                        <span className="inline-flex py-0.5 text-[8.5px] font-sans font-bold text-amber-700 bg-amber-55 px-1.5 rounded border border-amber-200 uppercase">Nouvelle Compagnie</span>
                      </div>

                      <div className="bg-white/70 p-2.5 rounded border border-slate-150 space-y-1 text-[10.5px]">
                        <span className="font-sans font-medium uppercase text-slate-400 tracking-wider text-[9px] block">Contact Représentant :</span>
                        <p className="font-bold text-slate-800">{req.firstName} {req.lastName}</p>
                        <p className="text-slate-500 font-mono text-[10px]">E-mail : {req.email} | Tél : {req.phone}</p>
                      </div>

                      <div className="pt-2 border-t border-slate-150 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleApproveCompanyRequest(req)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[10.5px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Check className="h-4 w-4" /> Valider la Compagnie
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </section>

          {/* Section 3: Distribution Delivery */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm" id="distribution-section">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <Truck className="h-4.5 w-4.5 text-blue-600" />
              <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Livraison & Attributions Client</h2>
            </div>

            {approvedClients.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] rounded border border-slate-200 border-dashed">
                Aucun client approuvé disponible pour recevoir la distribution.
              </div>
            ) : (
              <form onSubmit={handleDistributeToClient} className="space-y-4" id="distribution-form">
                <p className="text-xs text-slate-500 font-medium">Distribuez directement le produit à un client approuvé. Le volume sera déduit du stock central du dépôt.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Choisir un Client</label>
                    <select
                      required
                      value={selectedClientForAssign}
                      onChange={(e) => setSelectedClientForAssign(e.target.value)}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 px-2.5 py-1 text-xs rounded font-sans focus:border-blue-600 focus:bg-white"
                      id="select-client"
                    >
                      <option value="">-- Sélectionner un Client --</option>
                      {approvedClients.map((client) => (
                        <option key={client.uid} value={client.uid}>
                          {client.name} {client.companyName ? `[${client.companyName}]` : ''} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Quantité à livrer (bidon d'huile)</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={assignQty}
                      onChange={(e) => setAssignQty(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 px-3 rounded text-xs font-sans font-bold focus:border-blue-600 focus:bg-white"
                      id="input-assign-qty"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm mt-1"
                  id="submit-dist-btn"
                >
                  <Truck className="h-3.5 w-3.5" /> Confirmer la distribution (- d'huile)
                </button>
              </form>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN (Ravitaillement/Client Stock checking, Audit logs) -> 5cols */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-6">
          
          {/* Section 4: Client Stocks Monitoring & Restock Alerts */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm" id="client-monitoring-section">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <TrendingDown className="h-4.5 w-4.5 text-blue-600" />
              <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Suivi d'Inventaire des Clients</h2>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 font-medium">Liste des volumes restants auto-signalés par vos clients dans leur interface. Ravitaillez-les avant la rupture de stock réelle.</p>

            {clientStocks.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] rounded border border-dashed border-slate-200">
                Aucun rapport de stock client enregistré pour le moment.
              </div>
            ) : (
              <div className="space-y-4">
                {clientStocks.map((cStock) => {
                  const criticalLevel = cStock.currentStock <= 5;
                  const percentLeft = cStock.assignedQuantity > 0 
                    ? Math.round((cStock.currentStock / cStock.assignedQuantity) * 100) 
                    : 0;

                  return (
                    <div 
                      key={cStock.id} 
                      className={`p-3.5 rounded border transition-all ${
                        criticalLevel 
                          ? 'bg-amber-50 border-amber-300 shadow-sm' 
                          : 'bg-[#fafafa] border-slate-200'
                      }`}
                      id={`client-monitor-${cStock.id}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-sans font-bold text-xs text-slate-800">{cStock.clientName}</p>
                          <p className="text-[10px] text-slate-400 font-mono font-semibold">Article: {cStock.articleName}</p>
                        </div>
                        {criticalLevel ? (
                          <span className="px-2 py-0.5 rounded text-[8.5px] font-bold font-sans uppercase bg-amber-100 text-amber-800 border border-amber-250 tracking-wider animate-pulse">
                            ⚠️ Ravitaillement Urgent
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-semibold font-sans uppercase bg-slate-200 text-slate-600 border border-slate-300 tracking-wider">
                            Sécurisé
                          </span>
                        )}
                      </div>

                      {/* Stock Level Bar */}
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between font-mono text-[10px] font-semibold text-slate-500">
                          <span>Stock restant : <strong className="text-slate-800 font-sans font-extrabold">{cStock.currentStock}</strong> / {cStock.assignedQuantity}</span>
                          <span className={criticalLevel ? 'text-amber-700 font-bold' : 'text-slate-500'}>{percentLeft}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden border border-slate-200">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${criticalLevel ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, percentLeft))}%` }}
                          />
                        </div>
                        {cStock.lastUpdated && (
                          <p className="text-[9px] font-mono text-slate-400 text-right font-medium">Dernier rapport : {new Date(cStock.lastUpdated.seconds * 1000).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'})}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 5: Real-time Audit Logs */}
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm" id="audit-logs-section">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <History className="h-4.5 w-4.5 text-blue-600" />
              <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Journal d'Audit ({auditLogs.length})</h2>
            </div>

            {auditLogs.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] rounded border border-dashed border-slate-200">
                Aucun événement enregistré dans l'historique d'inventaire.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1" id="audit-list">
                {auditLogs.map((log) => {
                  const isCentralAdd = log.type === 'add_stock';
                  const isCentralSub = log.type === 'sub_stock';
                  const isReport = log.type === 'client_report';
                  const isDistribute = log.type === 'distribute_client';

                  return (
                    <div 
                      key={log.id} 
                      className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 flex flex-col gap-1 font-sans"
                      id={`log-item-${log.id}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`font-sans text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          isCentralAdd ? 'bg-emerald-50 text-emerald-800 border border-emerald-250' :
                          isCentralSub ? 'bg-red-50 text-red-800 border border-red-250' :
                          isReport ? 'bg-amber-100 text-amber-800 border border-amber-205' :
                          'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}>
                          {isCentralAdd ? 'Stock +' :
                           isCentralSub ? 'Stock -' :
                           isReport ? 'Rapport' : 'Approvision.'}
                        </span>
                        
                        <span className="text-[9px] text-slate-400 font-mono font-medium">
                          {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : 'Maintenant'}
                        </span>
                      </div>

                      <p className="text-slate-800 text-[11px] font-medium leading-relaxed">
                        {isCentralAdd && <span>Ajout de <strong>{log.quantity}</strong> {log.articleName} au stock central.</span>}
                        {isCentralSub && <span>Retrait de <strong>{log.quantity}</strong> {log.articleName} du stock central.</span>}
                        {isDistribute && <span>Livré <strong>{log.quantity}</strong> {log.articleName} à <strong>{log.clientName}</strong>.</span>}
                        {isReport && <span><strong>{log.clientName}</strong> a signalé qu'il lui reste <strong>{log.quantity}</strong> {log.articleName}.</span>}
                      </p>

                      <div className="text-[9px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-100 pt-1 mt-0.5">
                        <span>Auteur : {log.operatorEmail}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>

      </div>
    </div>
  );
}
