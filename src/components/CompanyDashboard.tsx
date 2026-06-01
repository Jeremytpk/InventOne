/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  getDoc, 
  writeBatch, 
  serverTimestamp, 
  collection,
  deleteDoc
} from 'firebase/firestore';
import { User, InventoryItem, ClientStock } from '../types';
import { 
  Building2, 
  Fuel, 
  TrendingDown, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  HelpCircle, 
  Plus, 
  Minus, 
  ArrowRightCircle, 
  History, 
  Users, 
  Briefcase, 
  ArrowUpRight, 
  ArrowDownRight, 
  UserCheck, 
  Sparkles,
  ShoppingBag,
  Bell,
  ShieldAlert,
  Send,
  Trash2,
  UserPlus,
  Edit,
  X,
  Save
} from 'lucide-react';

interface CompanyDashboardProps {
  companyUser: User;
}

export default function CompanyDashboard({ companyUser }: CompanyDashboardProps) {
  const [inventory, setInventory] = useState<InventoryItem | null>(null);
  const [myClients, setMyClients] = useState<User[]>([]);
  const [allClientStocks, setAllClientStocks] = useState<ClientStock[]>([]);
  const [loading, setLoading] = useState(true);

  // Form entries
  const [stockModifyQty, setStockModifyQty] = useState<string>('5');
  const [minAlertVal, setMinAlertVal] = useState<number>(10);
  const [selectedClientForAssign, setSelectedClientForAssign] = useState<string>('');
  const [assignQty, setAssignQty] = useState<string>('5');

  // Action status feedbacks
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Collaborator creation local state
  const [newCollabName, setNewCollabName] = useState('');
  const [newCollabEmail, setNewCollabEmail] = useState('');
  const [newCollabPhone, setNewCollabPhone] = useState('');
  const [newCollabAddress, setNewCollabAddress] = useState('');

  // Collaborator editing state
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [editCollabName, setEditCollabName] = useState('');
  const [editCollabEmail, setEditCollabEmail] = useState('');
  const [editCollabPhone, setEditCollabPhone] = useState('');
  const [editCollabAddress, setEditCollabAddress] = useState('');

  // Selected collaborator detail view modal
  const [selectedCollabDetail, setSelectedCollabDetail] = useState<User | null>(null);

  // Collaborator to delete confirmation modal
  const [collabToDelete, setCollabToDelete] = useState<User | null>(null);

  const myCompanyId = companyUser.companyId || `company_${companyUser.uid}`;
  const myInventoryDocId = `bidon_huile_${myCompanyId}`;

  // Helper: bootstrap company inventory if missing
  const bootstrapCompanyInventory = async (docId: string) => {
    try {
      const invRef = doc(db, 'inventory', docId);
      await setDoc(invRef, {
        name: `Bidons d'huile (Stock Central - ${companyUser.companyName || 'Ma Compagnie'})`,
        quantity: 50, // Default start quantity
        minStockAlert: 15,
        updatedAt: serverTimestamp(),
      });
      console.log(`Inventaire central bootstrappé avec succès pour ${companyUser.companyName}`);
    } catch (err) {
      console.error("Erreur d'initialisation de l'inventaire de compagnie :", err);
    }
  };

  // 1. Subscribe to Company Central Inventory
  useEffect(() => {
    const invRef = doc(db, 'inventory', myInventoryDocId);
    const unsub = onSnapshot(invRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setInventory({
          id: docSnap.id,
          name: data.name || "Stock Central d'Huile",
          quantity: Number(data.quantity ?? 0),
          minStockAlert: Number(data.minStockAlert ?? 15),
          updatedAt: data.updatedAt,
        });
        setMinAlertVal(Number(data.minStockAlert ?? 15));
      } else {
        bootstrapCompanyInventory(myInventoryDocId);
      }
    }, (err) => {
      console.error("Erreur chargement inventaire principal :", err);
    });

    return () => unsub();
  }, [companyUser.uid, companyUser.companyId]);

  // 2. Subscribe to Personnel list belonging to this Company
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.companyId === myCompanyId && 
          data.accountType === 'personnel' && 
          data.approved === true
        ) {
          list.push({
            uid: docSnap.id,
            email: data.email || '',
            name: data.name || '',
            approved: !!data.approved,
            role: data.role || 'client',
            createdAt: data.createdAt,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            accountType: data.accountType,
            companyId: data.companyId,
            companyName: data.companyName,
            address: data.address || '',
            loginId: data.loginId || '',
          });
        }
      });
      setMyClients(list);
      setLoading(false);
    }, (err) => {
      console.error("Erreur chargement personnel de la compagnie :", err);
    });

    return () => unsub();
  }, [myCompanyId]);

  // 3. Subscribe to all Client Stocks in real time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clientStocks'), (snapshot) => {
      const list: ClientStock[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
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
      setAllClientStocks(list);
    }, (err) => {
      console.error("Erreur chargement stocks clients en direct :", err);
    });

    return () => unsub();
  }, []);

  // Filter out client stocks belonging only to MY clients
  const companyClientStocks = allClientStocks.filter(cs => 
    myClients.some(mc => mc.uid === cs.clientId)
  );

  // Stock operations: Add / Sub central quantities
  const handleModifyCompanyMasterStock = async (isAddition: boolean) => {
    if (!inventory) return;
    setActionError(null);
    setActionSuccess(null);

    const delta = Number(stockModifyQty);
    if (!delta || delta <= 0) {
      setActionError("Veuillez entrer une quantité valide supérieure à 0.");
      return;
    }

    setLoadingAction(true);
    try {
      const currentQty = inventory.quantity;
      const nextQty = isAddition ? currentQty + delta : currentQty - delta;

      if (nextQty < 0) {
        throw new Error("L'opération est impossible : le stock central ne peut pas descendre en dessous de zéro.");
      }

      const invRef = doc(db, 'inventory', myInventoryDocId);
      await updateDoc(invRef, {
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });

      // Register audit transaction
      const logRef = doc(collection(db, 'auditLogs'));
      await setDoc(logRef, {
        type: isAddition ? 'add_stock' : 'sub_stock',
        articleName: inventory.name,
        quantity: delta,
        operatorEmail: companyUser.email,
        timestamp: serverTimestamp(),
      });

      setActionSuccess(`Stock central ajusté avec succès : ${isAddition ? '+' : '-'}${delta} bidons.`);
    } catch (err: any) {
      setActionError(err.message || "Erreur lors de l'ajustement du stock.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Update alert threshold limit
  const handleUpdateAlertThreshold = async () => {
    if (!inventory) return;
    setActionError(null);
    setActionSuccess(null);
    setLoadingAction(true);

    try {
      const invRef = doc(db, 'inventory', myInventoryDocId);
      await updateDoc(invRef, {
        minStockAlert: Number(minAlertVal),
        updatedAt: serverTimestamp(),
      });
      setActionSuccess(`Seuil d'alerte critique configuré avec succès à ${minAlertVal} bidons.`);
    } catch (err: any) {
      setActionError(err.message || "Échec d'ajustement du seuil.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Safely assign / distribute company stock to an individual client
  const handleAssignStockToClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const qty = Number(assignQty);
    if (!qty || qty <= 0) {
      setActionError("Veuillez saisir une quantité valide à distribuer.");
      return;
    }

    if (!inventory) {
      setActionError("Le stock central de la compagnie n'est pas disponible.");
      return;
    }

    if (inventory.quantity < qty) {
      setActionError(`Stock insuffisant ! Le stock central de votre compagnie (${inventory.quantity} bidons) est insuffisant pour distribuer ${qty} bidons.`);
      return;
    }

    const targetClient = myClients.find(c => c.uid === selectedClientForAssign);
    if (!targetClient) {
      setActionError("Veuillez sélectionner un client rattaché valide.");
      return;
    }

    setLoadingAction(true);
    const batch = writeBatch(db);

    try {
      // Step A: Subtract from company central inventory
      const compInvRef = doc(db, 'inventory', myInventoryDocId);
      batch.update(compInvRef, {
        quantity: inventory.quantity - qty,
        updatedAt: serverTimestamp(),
      });

      // Step B: Update or write Client Stock registry
      const clientStockId = `bidon_huile_${targetClient.uid}`;
      const clientStockRef = doc(db, 'clientStocks', clientStockId);

      const existingSnap = await getDoc(clientStockRef);
      if (existingSnap.exists()) {
        const snapData = existingSnap.data();
        const currentAssigned = Number(snapData.assignedQuantity ?? 0);
        const currentRemaining = Number(snapData.currentStock ?? 0);

        batch.update(clientStockRef, {
          assignedQuantity: currentAssigned + qty,
          currentStock: currentRemaining + qty,
          lastUpdated: serverTimestamp(),
        });
      } else {
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

      // Step C: Log in Audits
      const logRef = doc(collection(db, 'auditLogs'));
      batch.set(logRef, {
        type: 'distribute_client',
        articleName: inventory.name,
        quantity: qty,
        clientId: targetClient.uid,
        clientName: targetClient.name,
        operatorEmail: companyUser.email,
        timestamp: serverTimestamp(),
      });

      await batch.commit();
      setActionSuccess(`Livraison effectuée avec succès : ${qty} bidon(s) d'huile livré(s) à ${targetClient.name}.`);
      setAssignQty('5');
      setSelectedClientForAssign('');
    } catch (err: any) {
      console.error("Assign stock exception :", err);
      setActionError(err.message || "Erreur de distribution.");
    } finally {
      setLoadingAction(false);
    }
  };

  // Helper to generate a 7-character layout identifier mixing letters and digits
  const generateLoginId = () => {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const allChars = letters + numbers;
    
    let result = '';
    // Ensure mixture: at least 1 letter, 1 number
    result += letters.charAt(Math.floor(Math.random() * letters.length));
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
    for (let i = 0; i < 5; i++) {
      result += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    // Shuffle
    return result.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!newCollabName.trim()) {
      setActionError("Le nom du collaborateur est requis.");
      return;
    }

    setLoadingAction(true);
    try {
      const loginId = generateLoginId();
      
      // Initialize a secondary App to register credentials globally in Firebase Auth
      // without affecting the active company admin session
      const appName = `SecondaryApp_${Date.now()}`;
      const secondaryAppInstance = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryAppInstance);
      
      const emailForAuth = `${loginId}@inventone.collab`;
      const pwdForAuth = `password_${loginId}`;
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailForAuth, pwdForAuth);
      const docId = userCredential.user.uid;
      
      const userDocRef = doc(db, 'users', docId);

      const payload: any = {
        name: newCollabName.trim(),
        approved: true,
        role: 'client',
        createdAt: serverTimestamp(),
        accountType: 'personnel',
        companyId: myCompanyId,
        companyName: companyUser.companyName || '',
        loginId: loginId,
      };

      if (newCollabEmail.trim()) {
        payload.email = newCollabEmail.trim().toLowerCase();
      } else {
        payload.email = '';
      }

      if (newCollabPhone.trim()) {
        payload.phone = newCollabPhone.trim();
      } else {
        payload.phone = '';
      }

      if (newCollabAddress.trim()) {
        payload.address = newCollabAddress.trim();
      } else {
        payload.address = '';
      }

      await setDoc(userDocRef, payload);

      // Initialize empty/0 stock registry so they appear ready in the workspace
      const clientStockRef = doc(db, 'clientStocks', `bidon_huile_${docId}`);
      await setDoc(clientStockRef, {
        clientId: docId,
        clientName: payload.name,
        articleId: 'bidon_huile',
        articleName: "Bidon d'huile",
        assignedQuantity: 0,
        currentStock: 0,
        lastUpdated: serverTimestamp(),
      });

      // Sign out secondary auth
      await secondarySignOut(secondaryAuth);

      setActionSuccess(`Collaborateur "${newCollabName.trim()}" ajouté ! ID de connexion unique : ${loginId}`);
      setNewCollabName('');
      setNewCollabEmail('');
      setNewCollabPhone('');
      setNewCollabAddress('');
    } catch (err: any) {
      setActionError(err.message || "Erreur lors de l'ajout du collaborateur.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUpdateCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollabId) return;

    setActionError(null);
    setActionSuccess(null);

    if (!editCollabName.trim()) {
      setActionError("Le nom de collaborateur est obligatoire.");
      return;
    }

    setLoadingAction(true);
    try {
      const userDocRef = doc(db, 'users', editingCollabId);

      const payload: any = {
        name: editCollabName.trim(),
        role: 'client',
        accountType: 'personnel',
        companyId: myCompanyId,
        companyName: companyUser.companyName || '',
        approved: true,
        createdAt: serverTimestamp(),
      };

      if (editCollabEmail.trim()) {
        payload.email = editCollabEmail.trim().toLowerCase();
      } else {
        payload.email = '';
      }

      if (editCollabPhone.trim()) {
        payload.phone = editCollabPhone.trim();
      } else {
        payload.phone = '';
      }

      if (editCollabAddress.trim()) {
        payload.address = editCollabAddress.trim();
      } else {
        payload.address = '';
      }

      await setDoc(userDocRef, payload, { merge: true });

      // Update name inside clientStock
      const clientStockRef = doc(db, 'clientStocks', `bidon_huile_${editingCollabId}`);
      await setDoc(clientStockRef, {
        clientName: editCollabName.trim(),
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      setActionSuccess(`Données de "${editCollabName.trim()}" enregistrées.`);
      setEditingCollabId(null);
      setEditCollabName('');
      setEditCollabEmail('');
      setEditCollabPhone('');
      setEditCollabAddress('');
    } catch (err: any) {
      setActionError(err.message || "Impossible de sauvegarder les modifications.");
    } finally {
      setLoadingAction(false);
    }
  };

  const executeDeleteCollaborator = async (collab: User) => {
    setActionError(null);
    setActionSuccess(null);
    setLoadingAction(true);

    try {
      // 1. Delete associated stock registry if exists
      const clientStockRef = doc(db, 'clientStocks', `bidon_huile_${collab.uid}`);
      await deleteDoc(clientStockRef);

      // 2. Delete user doc
      const userRef = doc(db, 'users', collab.uid);
      await deleteDoc(userRef);

      setActionSuccess(`Le collaborateur "${collab.name}" a été définitivement supprimé.`);
      
      // Close detail modal if currently viewing this collaborator
      if (selectedCollabDetail && selectedCollabDetail.uid === collab.uid) {
        setSelectedCollabDetail(null);
      }
    } catch (err: any) {
      setActionError(err.message || "Erreur lors de la suppression.");
    } finally {
      setLoadingAction(false);
      setCollabToDelete(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6" id="company-partner-dashboard">
      {/* Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 relative overflow-hidden shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="company-banner">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[8.5px] sm:text-[9px] font-mono tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded uppercase">Accès Partenaire</span>
            <Building2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">WORKSPACE ENTREPRISE SYNC</span>
          </div>
          <h1 className="text-base sm:text-lg md:text-xl font-sans font-extrabold text-[#0f172a] tracking-tight">
            Espace Compagnie : {companyUser.companyName || 'Ma Compagnie'}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium max-w-2xl leading-normal">
            Pilotez en toute autonomie l'inventaire central de votre entreprise, distribuez des bidons à vos collaborateurs rattachés et surveillez en temps réel leur consommation.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg text-right hidden sm:block shrink-0 min-w-[200px]">
          <div className="text-[9px] text-slate-400 font-mono uppercase font-bold">Contact Officiel</div>
          <div className="text-xs font-sans font-bold text-[#0f172a]">{companyUser.name}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{companyUser.email}</div>
        </div>
      </div>

      {/* Loading feedback */}
      {loading ? (
        <div className="text-center py-20 text-xs text-blue-600 font-mono animate-pulse">
          Chargement en cours du système d'inventaire d'entreprise...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          
          {/* LEFT: Central stock management & Alert triggers */}
          <div className="lg:col-span-8 space-y-4 sm:space-y-6">
            
            {/* Feedback Notifications */}
            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2 shadow-sm animate-pulse" id="company-action-error">
                <ShieldAlert className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-sans font-medium">{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-start gap-2 shadow-sm" id="company-action-success">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-sans font-semibold">{actionSuccess}</span>
              </div>
            )}

            {/* Central stock visual component */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-sm space-y-4 sm:space-y-6" id="company-inventory-center">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Fuel className="h-4.5 w-4.5 text-blue-600" />
                  <h2 className="text-xs sm:text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">État du Stock Central de l'Entreprise</h2>
                </div>
                {inventory && inventory.updatedAt && (
                  <span className="text-[9px] sm:text-[9.5px] text-slate-400 font-mono">
                    Mise à jour : {new Date(inventory.updatedAt.seconds * 1000).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'})}
                  </span>
                )}
              </div>

              {inventory ? (
                <div className="space-y-4 sm:space-y-6">
                  {/* Visual grid cards in bento setup */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Item count card */}
                    <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-3 sm:p-4 flex flex-col justify-between" id="company-stock-metric">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-mono tracking-wider block uppercase font-bold">Producent Référencé</span>
                        <h3 className="text-xs sm:text-sm font-sans font-extrabold text-[#0f172a] line-clamp-1">{inventory.name}</h3>
                        <p className="text-[10px] text-slate-400 font-medium">Quantité totale disponible au dépôt central.</p>
                      </div>

                      <div className="mt-3 sm:mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xl sm:text-2xl font-sans font-extrabold text-blue-700">{inventory.quantity} <span className="text-[10px] sm:text-xs text-slate-500 font-semibold font-sans">bidon(s)</span></span>
                        
                        {inventory.quantity <= inventory.minStockAlert ? (
                          <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> Seuil Rejoint
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Disponible
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Critical threshold adjustments */}
                    <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-3 sm:p-4 flex flex-col justify-between" id="company-threshold-metric">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-400 font-mono block uppercase font-bold">Seuil d'Alerte</span>
                          <span className="text-xs font-bold text-slate-700">{minAlertVal} bidons</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">Déclenche une notice visuelle dès que le stock central descend sous cette valeur.</p>
                        
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={minAlertVal}
                          onChange={(e) => setMinAlertVal(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer mt-2 accent-blue-600"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={loadingAction || minAlertVal === inventory.minStockAlert}
                        onClick={handleUpdateAlertThreshold}
                        className="w-full mt-3 h-8 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-sans font-bold text-[9px] sm:text-[10px] uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        Enregistrer le seuil
                      </button>
                    </div>

                  </div>

                  {/* Operational Adjusters block (Add/Subtract master quantity) */}
                  <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
                    <div className="space-y-0.5">
                      <h4 className="text-[11px] sm:text-xs font-sans font-bold text-slate-800 uppercase tracking-wide">Approvisionner ou Retirer du Stock Central</h4>
                      <p className="text-[10px] sm:text-[10.5px] text-slate-400 font-medium">Ravitaillez le stock disponible au siège de votre compagnie ou procédez à des corrections manuelles.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="w-full sm:w-1/4">
                        <div className="relative">
                          <input 
                            type="number"
                            min="1"
                            value={stockModifyQty}
                            onChange={(e) => setStockModifyQty(e.target.value)}
                            placeholder="Ex: 10"
                            className="w-full h-9 bg-white text-slate-900 border border-slate-200 focus:border-blue-600 text-xs font-sans font-bold text-center rounded shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 w-full sm:w-3/4">
                        <button
                          type="button"
                          disabled={loadingAction}
                          onClick={() => handleModifyCompanyMasterStock(true)}
                          className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-sans font-bold text-[10.5px] sm:text-[11px] uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0" /> Approvisionner
                        </button>

                        <button
                          type="button"
                          disabled={loadingAction}
                          onClick={() => handleModifyCompanyMasterStock(false)}
                          className="h-9 bg-slate-100 hover:bg-slate-205 text-slate-700 border border-slate-200 font-sans font-bold text-[10.5px] sm:text-[11px] uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                        >
                          <Minus className="h-3.5 w-3.5 shrink-0" /> Retirer du stock
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="py-10 text-center font-mono text-xs text-slate-400 animate-pulse">
                  Un instant, initialisation de votre dépôt central...
                </div>
              )}
            </div>

            {/* REAL-TIME CLIENT MONITORING SUMMARY TABLE */}
            <div className="bg-white border border-slate-200 rounded-lg p-3.5 sm:p-5 shadow-sm space-y-4" id="company-clients-grid">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="h-4.5 w-4.5 text-blue-600" />
                  <h3 className="text-xs sm:text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Suivi Consommation Clients</h3>
                </div>
                <span className="px-2 py-0.5 text-[8.5px] sm:text-[9px] font-mono font-bold text-blue-700 bg-blue-50 rounded border border-blue-200 shrink-0 w-fit">
                  {myClients.length} membre(s) approuvé(s)
                </span>
              </div>

              {myClients.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-450 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2">
                  <Activity className="h-4 w-4 text-slate-400" />
                  <div className="space-y-1 max-w-sm">
                    <p className="font-sans font-bold text-slate-600 uppercase tracking-wide">Aucun collaborateur enregistré</p>
                    <p className="font-sans text-[10.5px] leading-relaxed text-slate-400 font-medium">
                      Invitez vos clients ou techniciens à s'inscrire en créant un <strong>Compte Personnel</strong> rattaché à votre entreprise "{companyUser.companyName}".
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto" id="company-clients-table-wrapper">
                  <table className="w-full border-collapse text-left text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase tracking-wider text-[8px] sm:text-[9px] font-bold">
                        <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-left">Collaborateur</th>
                        <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-left">Stocks</th>
                        <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-center">Niveau (%)</th>
                        <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-center">Statut</th>
                        <th className="py-2 px-0.5 sm:py-2.5 sm:px-3 text-right">Dernier rapport</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {myClients.map((client) => {
                        // Find matching real-time stock
                        const stock = companyClientStocks.find(s => s.clientId === client.uid);

                        return (
                          <tr key={client.uid} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2 px-1 sm:py-3 sm:px-3 text-left">
                              <div className="space-y-0.5">
                                <div className="text-[10.5px] sm:text-xs font-semibold text-[#0f172a] truncate max-w-[80px] xs:max-w-[100px] sm:max-w-none" title={client.name}>{client.name}</div>
                                <div className="text-[8.5px] sm:text-[10px] text-slate-450 font-mono truncate max-w-[80px] xs:max-w-[100px] sm:max-w-none" title={client.email}>{client.email}</div>
                              </div>
                            </td>
                            
                            <td className="py-2 px-1 sm:py-3 sm:px-3 text-left">
                              {stock ? (
                                <div className="space-y-0.5 text-[10.5px] sm:text-xs">
                                  <div className="font-mono font-bold text-[#0f172a]">
                                    {stock.currentStock} / {stock.assignedQuantity}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[9.5px] sm:text-[10px] text-slate-400 italic font-sans font-medium">Non livré</span>
                              )}
                            </td>

                            <td className="py-2 px-1 sm:py-3 sm:px-3 text-center">
                              {stock ? (
                                <div className="flex flex-col items-center sm:items-stretch justify-center min-w-[40px] sm:min-w-[100px] mx-auto space-y-0.5">
                                  <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden border border-slate-200 hidden sm:block">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        stock.currentStock <= 5 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(100, Math.round((stock.currentStock / stock.assignedQuantity) * 100))}%` }}
                                    />
                                  </div>
                                  <div className="text-center sm:text-right text-[9.5px] sm:text-[10px] font-mono text-slate-500 font-extrabold">
                                    {Math.round((stock.currentStock / stock.assignedQuantity) * 100)} %
                                  </div>
                                </div>
                              ) : (
                                <span className="text-center block text-slate-400 font-mono text-[9px] sm:text-[10px]">-</span>
                              )}
                            </td>

                            <td className="py-2 px-1 sm:py-3 sm:px-3 text-center">
                              {stock ? (
                                stock.currentStock <= 5 ? (
                                  <span className="inline-flex items-center gap-0.5 text-[8.5px] sm:text-[9.5px] font-bold text-amber-850 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 animate-pulse">
                                    Alerte
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[8.5px] sm:text-[9.5px] font-bold text-emerald-850 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                                    OK
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center text-[8.5px] sm:text-[9.5px] font-bold text-slate-400 bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
                                  Non livré
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-0.5 sm:py-3 sm:px-3 text-right font-mono text-slate-500 text-[8.5px] sm:text-[10px]">
                              {stock && stock.lastUpdated ? (
                                <span className="block truncate max-w-[65px] sm:max-w-none" title={new Date(stock.lastUpdated.seconds * 1000).toLocaleString('fr-FR')}>
                                  {new Date(stock.lastUpdated.seconds * 1000).toLocaleDateString('fr-FR', {month: 'numeric', day: 'numeric'})} à {new Date(stock.lastUpdated.seconds * 1000).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                                </span>
                              ) : (
                                <span className="text-slate-450 font-sans italic">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* COLLABORATOR DIRECTORY & ADDITION WORKSPACE */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-6" id="company-collaborators-hub">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-blue-600" />
                  <h2 className="text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Workspace Collaborateurs</h2>
                </div>
              </div>

              {/* Sub-grid of Creation and List */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Creation or Editing Form Column */}
                <div className="md:col-span-5 bg-slate-50/50 p-4 border border-slate-200 rounded-lg space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wide">
                      {editingCollabId ? "Modifier Collaborateur" : "Nouveau Collaborateur"}
                    </h3>
                    <p className="text-[10px] text-slate-550 font-medium leading-normal">
                      {editingCollabId 
                        ? "Ajustez les coordonnées administratives du collaborateur." 
                        : "Enregistrez instantanément un technicien ou client rattaché."
                      }
                    </p>
                  </div>

                  <form onSubmit={editingCollabId ? handleUpdateCollaborator : handleAddCollaborator} className="space-y-3.5">
                    {/* Name */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Nom du client / collaborateur <span className="text-red-500">*</span></label>
                      <input 
                        type="text"
                        required
                        placeholder="Ex: Jean Dupont"
                        value={editingCollabId ? editCollabName : newCollabName}
                        onChange={(e) => editingCollabId ? setEditCollabName(e.target.value) : setNewCollabName(e.target.value)}
                        className="w-full h-8.5 bg-white text-slate-900 border border-slate-200 focus:border-blue-600 focus:outline-none text-xs px-2.5 rounded transition-colors"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Adresse E-mail <span className="text-slate-400 font-normal italic">(Optionnel)</span></label>
                      <input 
                        type="email"
                        placeholder="Ex: jean.dupont@orange.fr"
                        value={editingCollabId ? editCollabEmail : newCollabEmail}
                        onChange={(e) => editingCollabId ? setEditCollabEmail(e.target.value) : setNewCollabEmail(e.target.value)}
                        className="w-full h-8.5 bg-white text-slate-900 border border-slate-200 focus:border-blue-600 focus:outline-none text-xs px-2.5 rounded transition-colors"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Téléphone <span className="text-slate-400 font-normal italic">(Optionnel)</span></label>
                      <input 
                        type="text"
                        placeholder="Ex: +33 6 12 34 56 78"
                        value={editingCollabId ? editCollabPhone : newCollabPhone}
                        onChange={(e) => editingCollabId ? setEditCollabPhone(e.target.value) : setNewCollabPhone(e.target.value)}
                        className="w-full h-8.5 bg-white text-slate-900 border border-slate-200 focus:border-blue-600 focus:outline-none text-xs px-2.5 rounded transition-colors"
                      />
                    </div>

                    {/* Address */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Adresse d'intervention <span className="text-slate-400 font-normal italic">(Optionnel)</span></label>
                      <textarea 
                        placeholder="Ex: 12 Rue de la Paix, 75002 Paris"
                        rows={2}
                        value={editingCollabId ? editCollabAddress : newCollabAddress}
                        onChange={(e) => editingCollabId ? setEditCollabAddress(e.target.value) : setNewCollabAddress(e.target.value)}
                        className="w-full bg-white text-slate-900 border border-slate-200 focus:border-blue-600 focus:outline-none text-xs py-1.5 px-2.5 rounded transition-colors resize-none"
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={loadingAction}
                        className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-sans font-bold text-[11px] uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        {editingCollabId ? (
                          <>
                            <Save className="h-3.5 w-3.5" /> Enregistrer
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" /> Ajouter
                          </>
                        )}
                      </button>

                      {editingCollabId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCollabId(null);
                            setEditCollabName('');
                            setEditCollabEmail('');
                            setEditCollabPhone('');
                            setEditCollabAddress('');
                          }}
                          className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-200 rounded flex items-center justify-center cursor-pointer transition-all"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Directory / Grid List Column */}
                <div className="md:col-span-7 space-y-3.5">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wide">Annuaire des rattachés</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Visualisez l'ensemble des fiches de contact rattachées à votre compagnie.</p>
                  </div>

                  {myClients.length === 0 ? (
                    <div className="py-12 px-4 text-center text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                      Aucun collaborateur enregistré pour l'instant. Utilisez le formulaire à gauche pour enregistrer votre premier client.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1" id="collaborators-list">
                      {myClients.map((client) => (
                        <div 
                          key={client.uid} 
                          onClick={() => setSelectedCollabDetail(client)}
                          title="Cliquer pour afficher les détails complets"
                          className="bg-white border border-slate-200 hover:border-blue-300 p-3 rounded-lg flex items-start justify-between gap-3 shadow-2xs cursor-pointer hover:bg-slate-50/70 transition-all group"
                        >
                          <div className="space-y-1.5 overflow-hidden flex-1">
                            <div className="font-sans font-extrabold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap group-hover:text-blue-700 transition-colors">
                              <span className="truncate max-w-[150px]">{client.name}</span>
                              <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold text-blue-700 bg-blue-50/55 rounded border border-blue-150">Membre</span>
                              {client.loginId && (
                                <span className="px-1.5 py-0.5 text-[8px] font-mono font-bold text-amber-700 bg-amber-50 rounded border border-amber-200 uppercase">
                                  ID: {client.loginId}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-1 text-[11px] font-medium text-slate-500">
                              {client.email && (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-400 text-[10px]">Email :</span>
                                  <span className="text-slate-700 select-all font-mono text-[10.5px] truncate">{client.email}</span>
                                </div>
                              )}
                              {client.phone && (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-400 text-[10px]">Tél :</span>
                                  <span className="text-slate-700 font-mono text-[10.5px]">{client.phone}</span>
                                </div>
                              )}
                              {client.address && (
                                <div className="flex items-start gap-1.5">
                                  <span className="font-mono text-slate-400 text-[10px] shrink-0">Adresse :</span>
                                  <span className="text-slate-650 font-sans leading-normal text-[10.5px] truncate">{client.address}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              title="Modifier"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCollabId(client.uid);
                                setEditCollabName(client.name);
                                setEditCollabEmail(client.email || '');
                                setEditCollabPhone(client.phone || '');
                                setEditCollabAddress(client.address || '');
                                setActionError(null);
                                setActionSuccess(null);
                              }}
                              className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-blue-50/50 rounded flex items-center justify-center border border-slate-200 cursor-pointer transition-all"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              title="Supprimer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCollabToDelete(client);
                              }}
                              className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50/50 rounded flex items-center justify-center border border-slate-200 cursor-pointer transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>

          {/* RIGHT PANELS: Stock distributor dispatcher & Help references */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Stock transfer assign panel dispatcher */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4" id="company-assign-card">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <Send className="h-4 w-4 text-blue-600" />
                <h3 className="font-sans font-bold text-xs text-[#0f172a] uppercase tracking-wide">Faire une Livraison de Stock</h3>
              </div>

              <form onSubmit={handleAssignStockToClient} className="space-y-4" id="company-assign-form">
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Sélectionner le Client (Collaborateur)</label>
                  <select
                    required
                    value={selectedClientForAssign}
                    onChange={(e) => setSelectedClientForAssign(e.target.value)}
                    className="w-full bg-[#f8fafc] text-slate-900 border border-slate-200 focus:border-blue-600 focus:bg-white text-xs font-semibold py-2 px-2.5 rounded transition-all"
                  >
                    <option value="">-- Choisir un client --</option>
                    {myClients.map(c => {
                      const clientStockObj = companyClientStocks.find(s => s.clientId === c.uid);
                      const current = clientStockObj ? `${clientStockObj.currentStock} bidons restants` : 'Aucun stock actuel';
                      return (
                        <option key={c.uid} value={c.uid}>
                          {c.name} ({current})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-slate-700 uppercase block">Quantité de Bidons à Livrer</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={assignQty}
                    onChange={(e) => setAssignQty(e.target.value)}
                    className="w-full bg-[#f8fafc] text-slate-900 border border-slate-200 focus:border-blue-600 focus:bg-white text-xs font-bold py-2 px-2.5 rounded transition-all"
                  />
                  {inventory && (
                    <p className="text-[9px] text-slate-400 font-sans">
                      Disponible dans votre Dépôt Central : <strong className="text-slate-650">{inventory.quantity} bidons</strong>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loadingAction || myClients.length === 0}
                  className="w-full h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                >
                  <ArrowRightCircle className="h-3.5 w-3.5" /> Confirmer la distribution
                </button>
              </form>
            </div>

            {/* Instruction helper reminders */}
            <div className="bg-[#1e293b] border border-slate-800 rounded-lg p-5 shadow-md space-y-4 text-slate-200" id="company-help-card">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-800">
                <Bell className="h-4 w-4 text-amber-500" />
                <h4 className="font-sans font-bold text-xs text-white uppercase tracking-wide">Guide de Gestion de Stock</h4>
              </div>

              <ul className="space-y-3.5 text-[11px] leading-relaxed text-slate-350 list-none pl-0">
                <li className="flex gap-2.5 items-start">
                  <span className="text-amber-500 font-bold font-mono">1.</span>
                  <span>
                    <strong className="text-slate-100">Approvisionnement</strong> : Renseignez les livraisons globales que vous recevez du fournisseur central dans l'ajustement du stock.
                  </span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="text-amber-500 font-bold font-mono">2.</span>
                  <span>
                    <strong className="text-slate-100">Temps-Réel</strong> : Lorsqu'un de vos techniciens ou clients met à jour ses bidons, sa jauge de stock change instantanément dans votre tableau de bord.
                  </span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="text-amber-500 font-bold font-mono">3.</span>
                  <span>
                    <strong className="text-slate-100">Seuil de d'Urgence</strong> : Si la jauge d'un client passe à l'orange (<strong className="text-slate-100">&lt;= 5 bidons</strong>), prévoyez promptement une distribution.
                  </span>
                </li>
              </ul>
            </div>

          </div>

        </div>
      )}

      {/* Collaborator Detail Modal */}
      {selectedCollabDetail && (() => {
        const clientStock = companyClientStocks.find(s => s.clientId === selectedCollabDetail.uid);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 xs:p-4 z-50 animate-fade-in" id="collab-detail-modal-overlay" onClick={() => setSelectedCollabDetail(null)}>
            <div 
              className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden animate-slide-up"
              id="collab-detail-modal-box"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-blue-500/15 flex items-center justify-center border border-blue-400/30">
                    <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-455" />
                  </div>
                  <div>
                    <h3 className="font-sans font-extrabold text-xs sm:text-sm text-white uppercase tracking-wider">Fiche d'Information</h3>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono">Détails administratifs & techniques</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCollabDetail(null)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 scrollbar-thin">
                {/* Visual Banner Identity */}
                <div className="bg-slate-50 border border-slate-150 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[8px] sm:text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 block w-fit uppercase">
                      Statut: Collaborateur Rattaché
                    </span>
                    <h2 className="text-base sm:text-lg font-sans font-black text-slate-900 leading-tight">
                      {selectedCollabDetail.name}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      Rattaché à : <strong className="text-slate-700">{selectedCollabDetail.companyName || companyUser.companyName || 'Votre Entreprise'}</strong>
                    </p>
                  </div>
                  
                  {/* Generated Login ID highlighted */}
                  <div className="flex sm:flex-col justify-between items-center sm:items-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                    <span className="text-[9px] sm:text-[10px] font-sans font-bold text-slate-500 block uppercase">Identifiant Unique</span>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg py-1 px-3 text-center w-fit">
                      <span className="font-mono text-sm sm:text-base font-black text-amber-700 uppercase tracking-widest select-all block">
                        {selectedCollabDetail.loginId || 'Non défini'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="space-y-3">
                  <h4 className="text-[10.5px] sm:text-xs font-sans font-bold text-slate-850 uppercase tracking-wider border-b border-slate-100 pb-1 font-extrabold">Coordonnées de contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3.5">
                    {/* Email */}
                    <div className="bg-slate-50/55 border border-slate-150 p-2 sm:p-2.5 rounded-lg space-y-1">
                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono uppercase block">Adresse E-mail</span>
                      <span className="text-[11px] sm:text-xs font-sans font-medium text-slate-800 break-all select-all block">
                        {selectedCollabDetail.email ? selectedCollabDetail.email : <span className="text-slate-400 italic font-normal">Non fournie</span>}
                      </span>
                    </div>

                    {/* Phone */}
                    <div className="bg-slate-50/55 border border-slate-150 p-2 sm:p-2.5 rounded-lg space-y-1">
                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono uppercase block">Numéro de Téléphone</span>
                      <span className="text-[11px] sm:text-xs font-mono font-medium text-slate-800 block">
                        {selectedCollabDetail.phone ? selectedCollabDetail.phone : <span className="text-slate-400 italic font-sans font-normal">Non fourni</span>}
                      </span>
                    </div>
                  </div>

                  {/* Address of Intervention */}
                  <div className="bg-slate-50/55 border border-slate-150 p-2.5 sm:p-3 rounded-lg space-y-1 shadow-2xs">
                    <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono uppercase block">Adresse physique d'intervention / de livraison</span>
                    <span className="text-[11px] sm:text-xs font-sans font-medium text-slate-700 leading-normal block whitespace-pre-wrap">
                      {selectedCollabDetail.address ? selectedCollabDetail.address : <span className="text-slate-400 italic font-normal">Aucune adresse enregistrée</span>}
                    </span>
                  </div>
                </div>

                {/* Real-time inventory levels for this client */}
                <div className="space-y-3">
                  <h4 className="text-[10.5px] sm:text-xs font-sans font-bold text-slate-850 uppercase tracking-wider border-b border-slate-100 pb-1 font-extrabold">Position des stocks sur l'article</h4>
                  {clientStock ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50/30 border border-blue-100 p-2.5 sm:p-3 rounded-lg flex flex-col justify-between shadow-2xs">
                        <span className="text-[8.5px] sm:text-[9.5px] text-blue-700 font-sans font-bold uppercase tracking-wider block">Stock Actuel</span>
                        <div>
                          <strong className="text-lg sm:text-xl font-mono text-blue-800">{clientStock.currentStock}</strong>
                          <span className="text-[9px] sm:text-[10px] text-blue-600 font-medium ml-1">bidons</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-2.5 sm:p-3 rounded-lg flex flex-col justify-between shadow-2xs">
                        <span className="text-[8.5px] sm:text-[9.5px] text-slate-500 font-sans font-bold uppercase tracking-wider block">Livré au Total</span>
                        <div>
                          <strong className="text-lg sm:text-xl font-mono text-slate-700">{clientStock.assignedQuantity}</strong>
                          <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium ml-1">bidons</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 px-3 text-center text-[11px] sm:text-xs text-slate-400 bg-slate-50 border border-slate-150 rounded-lg shadow-2xs">
                      Aucun registre de stock initialisé pour ce collaborateur.
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 px-4 sm:px-6 py-3 border-t border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono flex items-center justify-center sm:justify-start gap-1">
                  <span>Créé le :</span> 
                  <span>
                    {selectedCollabDetail.createdAt ? (
                      (selectedCollabDetail.createdAt as any).seconds 
                        ? new Date((selectedCollabDetail.createdAt as any).seconds * 1000).toLocaleDateString('fr-FR')
                        : new Date(selectedCollabDetail.createdAt as any).toLocaleDateString('fr-FR')
                    ) : 'Récemment'}
                  </span>
                </span>
                
                <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setCollabToDelete(selectedCollabDetail)}
                    className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-sans font-extrabold text-[10.5px] sm:text-xs uppercase tracking-wider rounded cursor-pointer transition-colors shadow-2xs flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCollabDetail(null)}
                    className="flex-1 sm:flex-initial px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-[10.5px] sm:text-xs uppercase tracking-wider rounded cursor-pointer transition-colors shadow-2xs text-center"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom Delete Confirmation Modal */}
      {collabToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 xs:p-4 z-[60] animate-fade-in" id="delete-confirm-modal-overlay" onClick={() => setCollabToDelete(null)}>
          <div 
            className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
            id="delete-confirm-modal-box"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning top accent bar */}
            <div className="h-1 bg-red-600 w-full" />
            
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-200">
                  <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-sans font-black text-xs sm:text-sm text-slate-900 uppercase tracking-wide">Confirmer la suppression</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 leading-normal">
                    Êtes-vous sûr de vouloir supprimer définitivement le collaborateur <strong className="text-slate-800">"{collabToDelete.name}"</strong> ?
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5 text-slate-600 leading-normal shadow-3xs">
                <p className="font-semibold text-slate-700 flex items-center gap-1">
                  <span>⚠️</span> Action irréversible. Ceci va détruire :
                </p>
                <ul className="list-disc pl-4 space-y-1 font-mono text-[9.5px] xs:text-[10px]">
                  <li>Toutes ses coordonnées de contact</li>
                  <li>Son identifiant unique de connexion ({collabToDelete.loginId || 'non assigné'})</li>
                  <li>L'ensemble de son niveau de stock en temps réel</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={() => setCollabToDelete(null)}
                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans font-bold text-[10.5px] sm:text-xs uppercase tracking-wider rounded cursor-pointer transition-colors border border-slate-200 text-center disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={() => executeDeleteCollaborator(collabToDelete)}
                  className="flex-1 sm:flex-initial px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white border border-red-700 font-sans font-extrabold text-[10.5px] sm:text-xs uppercase tracking-wider rounded cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3 w-3" />
                  {loadingAction ? "Suppression EN COURS..." : "Oui, Supprimer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
