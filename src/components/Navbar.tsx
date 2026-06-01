/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { LogOut, FileSignature, CircleUser, Shield } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { User } from '../types';

interface NavbarProps {
  currentUser: User | null;
}

export default function Navbar({ currentUser }: NavbarProps) {
  const handleLogOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erreur de déconnexion:", error);
    }
  };

  return (
    <header className="bg-[#0f172a] border-b border-slate-800 text-white sticky top-0 z-50 shadow-md" id="inventone-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand Name */}
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600 hover:bg-blue-500 transition-colors p-1.5 rounded flex items-center justify-center text-white shadow-sm">
            <FileSignature className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <span className="font-sans font-extrabold text-lg tracking-tight text-white leading-none">
              InventOne
            </span>
            <span className="hidden sm:block font-mono text-[9px] text-slate-400 tracking-wider">LUBRICANT STOCK CONTROL</span>
          </div>
        </div>

        {/* User Stats & Logout */}
        {currentUser && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="font-sans text-xs font-semibold text-white">Bonjour, {currentUser.name}</span>
              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                {currentUser.role === 'admin' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-medium bg-white/10 text-[#94a3b8] border border-white/5 uppercase tracking-wider">
                    <Shield className="h-2 w-2" /> jeremytopaka@gmail.com
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                    <CircleUser className="h-2 w-2" /> client : {currentUser.email}
                  </span>
                )}
              </div>
            </div>

            <div className="h-6 w-[1px] bg-slate-800 hidden sm:block" />

            <button
              onClick={handleLogOut}
              className="flex items-center justify-center gap-1.5 px-2.5 xs:px-3 h-8 text-xs font-semibold text-slate-300 bg-transparent hover:bg-white/10 border border-slate-750 rounded transition-all font-sans cursor-pointer"
              title="Se déconnecter"
              id="logout-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Déconnexion</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
