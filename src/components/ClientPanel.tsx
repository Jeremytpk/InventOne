/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, collection, query, where, deleteDoc } from 'firebase/firestore';
import { User, ClientStock, StockRequest } from '../types';
import CompanyDashboard from './CompanyDashboard';
import { 
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
  Send,
  Trash2,
  Clock
} from 'lucide-react';

interface ClientPanelProps {
  clientUser: User;
}

export default function ClientPanel({ clientUser }: ClientPanelProps) {
  const [clientStock, setClientStock] = useState<ClientStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportedQty, setReportedQty] = useState<number>(0);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [successStr, setSuccessStr] = useState<string | null>(null);

  // States related to Stock Requests
  const [requestsList, setRequestsList] = useState<StockRequest[]>([]);
  const [requestQty, setRequestQty] = useState<string>('10');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState<boolean>(false);

  const isCompany = clientUser.accountType === 'compagnie';

  useEffect(() => {
    if (isCompany) {
      setLoading(false);
      return;
    }

    // Unique document ID is of the pattern: bidon_huile_clientId
    const clientStockId = `bidon_huile_${clientUser.uid}`;
    const stockRef = doc(db, 'clientStocks', clientStockId);

    const unsub = onSnapshot(stockRef, (docSnap) => {
      setLoading(false);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const currentData: ClientStock = {
          id: docSnap.id,
          clientId: data.clientId || '',
          clientName: data.clientName || '',
          articleId: data.articleId || 'bidon_huile',
          articleName: data.articleName || "Bidon d'huile",
          assignedQuantity: Number(data.assignedQuantity ?? 0),
          currentStock: Number(data.currentStock ?? 0),
          lastUpdated: data.lastUpdated,
        };
        setClientStock(currentData);
        setReportedQty(currentData.currentStock);
      } else {
        setClientStock(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `clientStocks/${clientStockId}`);
    });

    return () => unsub();
  }, [clientUser.uid]);

  // Subscribe to own stock requests
  useEffect(() => {
    if (isCompany) return;

    const q = query(
      collection(db, 'stockRequests'),
      where('clientId', '==', clientUser.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: StockRequest[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          clientId: data.clientId || '',
          clientName: data.clientName || '',
          companyId: data.companyId || '',
          articleId: data.articleId || 'bidon_huile',
          articleName: data.articleName || "Bidon d'huile",
          requestedQuantity: Number(data.requestedQuantity ?? 0),
          status: data.status || 'pending',
          createdAt: data.createdAt,
        });
      });
      // Sort by descending date
      list.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });
      setRequestsList(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'stockRequests');
    });

    return () => unsub();
  }, [clientUser.uid, isCompany]);

  // Submit a new stock request to the company
  const handleAddNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    setRequestSuccess(null);

    const qty = Number(requestQty);
    if (!qty || qty <= 0) {
      setRequestError("Veuillez saisir une quantité supérieure à 0.");
      return;
    }

    setSubmittingRequest(true);
    try {
      const requestId = `req_${Date.now()}_${clientUser.uid}`;
      const requestRef = doc(db, 'stockRequests', requestId);

      await setDoc(requestRef, {
        clientId: clientUser.uid,
        clientName: clientUser.name,
        companyId: clientUser.companyId || clientUser.requestedCompanyId || 'company_global',
        articleId: 'bidon_huile',
        articleName: "Bidon d'huile",
        requestedQuantity: qty,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setRequestSuccess(`Demande de ${qty} bidon(s) d'huile de ravitaillement envoyée avec succès.`);
      setRequestQty('10');
    } catch (err: any) {
      console.error("Error creating stock request:", err);
      setRequestError(err.message || "Erreur de transmission de la demande.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Cancel/delete pending request
  const handleCancelRequest = async (requestId: string) => {
    setRequestError(null);
    setRequestSuccess(null);
    try {
      await deleteDoc(doc(db, 'stockRequests', requestId));
      setRequestSuccess("Demande de ravitaillement annulée avec succès.");
    } catch (err: any) {
      console.error("Cancel stock request exception :", err);
      setRequestError(err.message || "Impossible d'annuler la demande.");
    }
  };

  // Handle reporting remaining stock to backend
  const handleReportStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorStr(null);
    setSuccessStr(null);

    if (reportedQty < 0) {
      setErrorStr("La quantité ne peut pas être un nombre négatif.");
      return;
    }

    if (clientStock && reportedQty > clientStock.assignedQuantity) {
      setErrorStr(`La quantité signalée en stock (${reportedQty}) ne peut pas dépasser la quantité totale qui vous a été livrée (${clientStock.assignedQuantity}).`);
      return;
    }

    try {
      const clientStockId = `bidon_huile_${clientUser.uid}`;
      const stockRef = doc(db, 'clientStocks', clientStockId);

      // 1. Update only currentStock and lastUpdated fields on client stock registry (under security rules diff)
      await updateDoc(stockRef, {
        currentStock: Number(reportedQty),
        lastUpdated: serverTimestamp(),
      });

      // 2. Add recording path in auditLogs to write log
      const auditLogRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditLogRef, {
        type: 'client_report',
        articleName: clientStock ? clientStock.articleName : "Bidon d'huile",
        quantity: Number(reportedQty),
        clientId: clientUser.uid,
        clientName: clientUser.name,
        operatorEmail: clientUser.email,
        timestamp: serverTimestamp(),
      });

      setSuccessStr(`Rapport d'inventaire envoyé avec succès ! Vous avez signalé ${reportedQty} bidon(s) d'huile restant(s).`);
    } catch (err: any) {
      console.error(err);
      setErrorStr(err.message || "Impossible de soumettre le rapport de stock.");
    }
  };

  const incrementQty = () => {
    if (!clientStock) return;
    setReportedQty(prev => Math.min(clientStock.assignedQuantity, prev + 1));
  };

  const decrementQty = () => {
    setReportedQty(prev => Math.max(0, prev - 1));
  };

  if (isCompany) {
    return <CompanyDashboard companyUser={clientUser} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6" id="inventone-client-panel">
      {/* Welcome & Info */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 relative overflow-hidden shadow-sm" id="client-banner">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-[8.5px] sm:text-[9px] font-mono tracking-wider font-bold text-blue-700 bg-blue-50 border border-blue-250 rounded uppercase">Espace Client</span>
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">INVENTONE INTERACTIVE SYNC</span>
          </div>
          <h1 className="text-base sm:text-lg md:text-xl font-sans font-extrabold text-[#0f172a] tracking-tight">Bonjour, {clientUser.name} {clientUser.companyName ? `[${clientUser.companyName}]` : ''}</h1>
          <p className="text-[11px] sm:text-xs text-slate-500 font-medium leading-normal">Mettez à jour régulièrement votre stock de bidons d'huile pour signaler vos besoins de ravitaillement automatique avant d'arriver à rupture.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-xs text-blue-600 font-mono animate-pulse">Chargement de vos informations d'inventaire...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6" id="client-main-grid">
          
          {/* Main Visualizer Panel (Assigned vs Current Stock) */}
          <div className="md:col-span-8 space-y-4 sm:space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-sm" id="client-reporting-card">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4 sm:mb-5">
                <Fuel className="h-4 w-4 text-blue-600" />
                <h2 className="text-xs sm:text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">État d'Inventaire Actuel</h2>
              </div>

              {clientStock ? (
                <div className="space-y-4 sm:space-y-6">
                  {/* Visual gauge representation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    
                    {/* Gauge circle/status */}
                    <div className="bg-slate-50 p-3 sm:p-4 rounded border border-slate-200 flex flex-col justify-between" id="metric-summary">
                      <div className="space-y-1">
                        <span className="text-[8px] sm:text-[9px] text-slate-400 font-mono tracking-wider block uppercase font-bold">Dernières données reçues</span>
                        <h3 className="text-sm sm:text-base font-sans font-extrabold text-[#0f172a]">{clientStock.currentStock} bidons restants</h3>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium font-sans">Sur un total livré de {clientStock.assignedQuantity} bidons d'huile d'olive.</p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200 flex items-center justify-between gap-1 flex-wrap">
                        {clientStock.currentStock <= 5 ? (
                          <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-bold text-amber-850 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-250 animate-pulse">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> Seuil Rejoint
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9px] font-bold text-emerald-850 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 shrink-0" /> OK
                          </span>
                        )}
                        <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono font-bold">
                          {Math.round((clientStock.currentStock / clientStock.assignedQuantity) * 100)} % restants
                        </span>
                      </div>
                    </div>

                    {/* Progress details */}
                    <div className="flex flex-col justify-center space-y-3 px-1" id="gauge-visual">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] sm:text-[11px] text-slate-500 font-medium">
                          <span>Niveau critique (Ravitaillement)</span>
                          <span className="text-amber-700 font-extrabold">&lt;= 5 bidons</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden border border-slate-250">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              clientStock.currentStock <= 5 ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, (clientStock.currentStock / clientStock.assignedQuantity) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="bg-slate-50 p-2.5 sm:p-3 rounded border border-slate-200 text-[10px] sm:text-[11.5px] text-slate-500 leading-normal font-sans font-medium flex gap-2">
                        <Activity className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span>En maintenant ce rapport de stock à jour, l'administrateur est alerté d'office pour planifier votre réapprovisionnement rapidement.</span>
                      </div>
                    </div>

                  </div>

                  {/* Feedback messaging */}
                  {errorStr && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2 animate-pulse" id="client-error">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-650" />
                      <span>{errorStr}</span>
                    </div>
                  )}

                  {successStr && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex items-center gap-2" id="client-success">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-650" />
                      <span>{successStr}</span>
                    </div>
                  )}

                  {/* Reporting Input Form */}
                  <form onSubmit={handleReportStock} className="bg-slate-50 p-4 rounded border border-slate-205 space-y-3" id="report-input-form">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wide">Signaler mes quantités de stock restantes</h4>
                      <p className="text-[10px] text-slate-400 font-medium">Combien de bidons d'huile vous reste-t-il physiquement à cet instant ? Ajustez et soumettez.</p>
                    </div>

                    <div className="flex items-center gap-3 justify-center py-1">
                      <button
                        type="button"
                        onClick={decrementQty}
                        className="h-8 w-8 bg-white hover:bg-slate-50 active:bg-slate-100 rounded text-slate-700 flex items-center justify-center transition-all cursor-pointer border border-slate-200 shadow-sm"
                        title="Soustraire de l'affichage"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <div className="w-[100px] text-center">
                        <input 
                          type="number"
                          min="0"
                          max={clientStock.assignedQuantity}
                          value={reportedQty}
                          onChange={(e) => setReportedQty(Math.min(clientStock.assignedQuantity, Math.max(0, parseInt(e.target.value) || 0)))}
                          className="w-full h-9 bg-white text-slate-900 border border-slate-200 focus:border-blue-600 text-sm font-sans font-bold text-center rounded shadow-inner"
                          id="report-qty-input"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={incrementQty}
                        className="h-8 w-8 bg-white hover:bg-slate-50 active:bg-slate-100 rounded text-slate-700 flex items-center justify-center transition-all cursor-pointer border border-slate-200 shadow-sm"
                        title="Ajouter à l'affichage"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={reportedQty === clientStock.currentStock}
                      className="w-full h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm disabled:cursor-not-allowed"
                      id="submit-report-btn"
                    >
                      <ArrowRightCircle className="h-3.5 w-3.5" /> Mettre à jour le signalement
                    </button>
                  </form>
                </div>
              ) : (
                <div className="py-10 text-center text-xs text-slate-400 font-mono bg-[#f8fafc] border border-dashed border-slate-205 rounded flex flex-col items-center justify-center gap-2">
                  <HelpCircle className="h-7 w-7 text-slate-400" />
                  <div className="space-y-0.5 pl-4 pr-4">
                    <p className="font-sans text-xs font-bold text-slate-500 uppercase tracking-wide">Aucun produit attribué</p>
                    <p className="text-[10px] leading-relaxed text-slate-400 font-medium">L'administrateur d'InventOne ne vous a pas encore assigné ou livré de stocks de bidons d'huile pour le moment.</p>
                  </div>
                </div>
              )}
            </div>

            {/* New Stock Requests Card */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-sm" id="client-requests-card">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4 sm:mb-5">
                <Send className="h-4 w-4 text-indigo-600" />
                <h2 className="text-xs sm:text-sm font-sans font-extrabold text-[#0f172a] uppercase tracking-wider">Demander du Stock (Ravitaillement)</h2>
              </div>

              {requestError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded mb-4 flex items-center gap-2 animate-pulse" id="request-error">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-650" />
                  <span>{requestError}</span>
                </div>
              )}

              {requestSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded mb-4 flex items-center gap-2" id="request-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-650" />
                  <span>{requestSuccess}</span>
                </div>
              )}

              <form onSubmit={handleAddNewRequest} className="bg-slate-50 p-4 rounded border border-slate-205 space-y-4" id="request-stock-form">
                <div className="space-y-1">
                  <label htmlFor="requestQty" className="text-xs font-sans font-bold text-slate-800 uppercase tracking-wide block">Quantité de bidons demandée</label>
                  <p className="text-[10px] text-slate-400 font-medium">Saisissez le nombre de bidons d'huile dont vous avez besoin pour vos opérations de distribution locale.</p>
                </div>

                <div className="flex gap-2 max-w-sm">
                  <input
                    type="number"
                    min="1"
                    name="requestQty"
                    id="requestQty"
                    value={requestQty}
                    onChange={(e) => setRequestQty(e.target.value)}
                    className="w-full h-9 px-3 bg-white text-slate-900 border border-slate-200 font-sans text-sm rounded shadow-sm focus:border-indigo-600 focus:outline-none"
                    placeholder="Ex: 10"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submittingRequest}
                    className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5" /> {submittingRequest ? "Envoi..." : "Demander"}
                  </button>
                </div>
              </form>

              <div className="mt-6" id="client-requests-history">
                <h3 className="text-xs font-sans font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Historique de mes demandes
                </h3>

                {requestsList.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-mono italic">Aucune demande de stock effectuée pour le moment.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {requestsList.map((req) => (
                      <div key={req.id} className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800">
                            Demande de <span className="text-indigo-600 font-extrabold">{req.requestedQuantity} bidons</span> d'huile
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Créée le : {req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleString() : "À l'instant"}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {req.status === 'pending' ? (
                            <span className="px-2 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded uppercase">En Attente</span>
                          ) : req.status === 'approved' ? (
                            <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-250 rounded uppercase">Acceptée</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[9px] font-bold text-rose-750 bg-rose-50 border border-rose-250 rounded uppercase font-sans">Rejetée</span>
                          )}

                          {req.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(req.id)}
                              className="p-1 text-slate-400 hover:text-red-655 transition-colors cursor-pointer"
                              title="Annuler cette demande"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Info Section Help card */}
          <div className="md:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4" id="instructions-card">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <History className="h-4 w-4 text-blue-600" />
                <h3 className="font-sans font-bold text-xs text-[#0f172a] uppercase tracking-wide">Recommandations</h3>
              </div>

              <ul className="space-y-3 text-[11px] text-slate-500 leading-relaxed font-sans list-none pl-0 font-medium">
                <li className="flex gap-2 items-start">
                  <span className="text-blue-600 font-bold font-mono">1.</span>
                  <span><strong>Précision</strong> : Renseignez la quantité exacte qu'il vous reste en comptant directement les bidons dans votre établissement.</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-600 font-bold font-mono">2.</span>
                  <span><strong>Stock Critique</strong> : Dès que votre inventaire passe sous la barre des <strong>5 bidons</strong>, le système déclenche une alarme d'urgence chez l'administrateur.</span>
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-blue-600 font-bold font-mono">3.</span>
                  <span><strong>Ravitaillement</strong> : L'administrateur planifie des livraisons de ravitaillement pour recharger votre volume.</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
