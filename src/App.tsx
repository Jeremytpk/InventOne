/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { User } from './types';
import Navbar from './components/Navbar';
import AuthScreen from './components/AuthScreen';
import AdminPanel from './components/AdminPanel';
import ClientPanel from './components/ClientPanel';
import { Hourglass, ShieldAlert, LogOut, FileSignature } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // 1. Listen for authentication state transformations
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      
      if (!user) {
        setUserData(null);
        setAuthLoading(false);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const userDocRef = doc(db, 'users', user.uid);

      // 2. Attach real-time subscription to user's profile metadata in Firestore
      const unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
        setAuthLoading(false);
        setProfileLoading(false);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserData({
            uid: docSnap.id,
            email: data.email || user.email || '',
            name: data.name || 'Utilisateur',
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
        } else {
          // Fallback safeguard: If signed-in email is the designated admin but no Firestore record exists, 
          // automatically construct the profile document instantly.
          const formattedEmail = (user.email || '').trim().toLowerCase();
          const isAdminEmail = formattedEmail === 'jeremytopaka@gmail.com';

          if (isAdminEmail) {
            console.log("Safeguard: Auto-creating missing administrator profile doc...");
            const defaultAdmin: User = {
              uid: user.uid,
              email: formattedEmail,
              name: 'Jeremy Topaka',
              approved: true,
              role: 'admin',
              createdAt: serverTimestamp()
            };

            try {
              await setDoc(userDocRef, {
                email: defaultAdmin.email,
                name: defaultAdmin.name,
                approved: defaultAdmin.approved,
                role: defaultAdmin.role,
                createdAt: serverTimestamp(),
              });
              setUserData(defaultAdmin);
            } catch (err) {
              console.error("Safeguard initialization error:", err);
            }
          } else {
            // Unregistered or external client logged in somehow without profile, force sign out
            console.warn("Utilisateur non enregistré détecté, réinitialisation de session.");
            await signOut(auth);
          }
        }
      }, (error) => {
        console.error("Erreur de synchronisation du profil utilisateur:", error);
        setAuthLoading(false);
        setProfileLoading(false);
      });

      return () => {
        unsubscribeProfile();
      };
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  const handleLogoutFromPending = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Erreur déconnexion:", err);
    }
  };

  // 1. Initial State Load View
  if (authLoading || (firebaseUser && profileLoading && !userData)) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex flex-col items-center justify-center gap-4 text-slate-900" id="initial-loading-view">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <FileSignature className="h-6 w-6 animate-pulse text-blue-600" />
          </div>
          <div className="absolute top-0 left-0 w-12 h-12 border-2 border-blue-600/30 border-t-blue-600 rounded-xl animate-spin pointer-events-none"></div>
        </div>
        <div className="text-center space-y-1">
          <p className="font-sans font-bold tracking-tight text-slate-900 text-sm">Synchronisation InventOne</p>
          <p className="font-mono text-[10px] text-slate-500 uppercase tracking-widest animate-pulse">Vérification de la session sécurisée...</p>
        </div>
      </div>
    );
  }

  // 2. Authentication Form display (Login / Signup)
  if (!firebaseUser || !userData) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] text-[#0f172a] font-sans flex flex-col justify-between">
        <Navbar currentUser={null} />
        <main className="flex-1 flex items-center justify-center">
          <AuthScreen />
        </main>
        <footer className="py-4 border-t border-slate-200 text-center font-mono text-[10px] text-slate-500 bg-white shadow-inner">
          INVENTONE PLATFORM © 2026 - TOUS DROITS RÉSERVÉS
        </footer>
      </div>
    );
  }

  // 3. Pending Approval check screen (if account exists but approved == false)
  if (userData && !userData.approved) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] text-[#0f172a] flex flex-col justify-between font-sans">
        <Navbar currentUser={userData} />
        
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg bg-white border border-slate-200 p-8 rounded-xl md:p-10 text-center space-y-6 shadow-md relative" id="pending-approval-card">
            {/* Warning visual accent */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500 rounded-t-xl" />

            <div className="mx-auto w-14 h-14 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center text-amber-600">
              <Hourglass className="h-7 w-7 animate-spin" style={{ animationDuration: '3s' }} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-sans font-extrabold text-[#0f172a] tracking-tight">Accès en cours d'approbation</h2>
              <p className="text-xs text-amber-650 font-mono uppercase tracking-wider font-semibold">Demande d'autorisation système transmise</p>
            </div>

            <div className="bg-[#f8fafc] p-5 rounded-lg border border-slate-250 text-sm text-slate-600 leading-relaxed text-left space-y-3">
              <p>Votre compte a été enregistré avec l'adresse e-mail : <strong className="text-slate-900">{userData.email}</strong>.</p>
              <p>Par mesure de sécurité sur la plateforme **InventOne**, les nouveaux profils doivent être autorisés par l'équipe administrative avant de pouvoir visualiser l'inventaire ou signaler du stock de bidons d'huile moteur.</p>
              <p className="text-xs text-slate-500 font-mono">🔍 L'approbateur ou administrateur a été notifié. Veuillez rafraîchir cette page ou revenir un peu plus tard.</p>
            </div>

            <button
              onClick={handleLogoutFromPending}
              className="px-6 h-11 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 mx-auto cursor-pointer border border-slate-200 shadow-sm transition-all"
              id="pending-logout-btn"
            >
              <LogOut className="h-4 w-4" /> Retour à la connexion
            </button>
          </div>
        </main>

        <footer className="py-4 border-t border-slate-200 text-center font-mono text-[10px] text-slate-500 bg-white">
          INVENTONE PLATFORM © 2026 - TOUS DROITS RÉSERVÉS
        </footer>
      </div>
    );
  }

  // 4. Authorized Dashboards (Admin Panel or Client Stockist Portal)
  return (
    <div className="min-h-screen bg-[#f1f5f9] text-[#0f172a] font-sans flex flex-col justify-between">
      <Navbar currentUser={userData} />
      
      <main className="flex-1 bg-[#f1f5f9]">
        {userData.role === 'admin' ? (
          <AdminPanel adminUser={userData} />
        ) : (
          <ClientPanel clientUser={userData} />
        )}
      </main>

      <footer className="py-5 border-t border-slate-200 text-center font-mono text-[10.5px] text-slate-500 bg-white">
        INVENTONE SYSTEM CONTROL © 2026 - DÉPLOYÉ EN MODE SÉCURISÉ
      </footer>
    </div>
  );
}
