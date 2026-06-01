/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Company } from '../types';
import { 
  FileSignature, 
  KeyRound, 
  Mail, 
  User, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert, 
  Phone, 
  Building2, 
  MapPin, 
  Package, 
  Users, 
  Briefcase 
} from 'lucide-react';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [signupType, setSignupType] = useState<'personnel' | 'compagnie'>('personnel');
  const [loginMethod, setLoginMethod] = useState<'standard' | 'collaborator'>('standard');
  const [collaboratorId, setCollaboratorId] = useState('');
  
  // General inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  
  // Company specialized inputs
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [productSold, setProductSold] = useState('');
  
  // Personal specialized inputs
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companiesList, setCompaniesList] = useState<Company[]>([]);

  // Feedback states
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Monitor validated companies in real-time for personal dropdown select
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'compagnies'), (snapshot) => {
      const list: Company[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
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
      setCompaniesList(list);
    }, (err) => {
      console.error("Erreur de récupération des compagnies :", err);
    });
    return () => unsub();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const formattedEmail = email.trim().toLowerCase();

    try {
      if (isLogin) {
        // --- LOGIN FLOW ---
        if (loginMethod === 'collaborator') {
          if (!collaboratorId.trim()) {
            throw new Error("Veuillez saisir votre identifiant à 7 caractères.");
          }
          if (collaboratorId.trim().length !== 7) {
            throw new Error("L'identifiant doit comporter exactement 7 caractères.");
          }
          const formattedCollabId = collaboratorId.trim().toLowerCase();
          const emailForAuth = `${formattedCollabId}@inventone.collab`;
          const pwdForAuth = `password_${formattedCollabId}`;
          
          try {
            await signInWithEmailAndPassword(auth, emailForAuth, pwdForAuth);
          } catch (loginErr: any) {
            if (loginErr.code === 'auth/wrong-password' || loginErr.code === 'auth/invalid-credential' || loginErr.code === 'auth/user-not-found') {
              throw new Error("Identifiant de connexion invalide. Veuillez vérifier votre code.");
            } else {
              throw new Error(loginErr.message || "Impossible de se connecter.");
            }
          }
        } else {
          try {
            await signInWithEmailAndPassword(auth, formattedEmail, password);
          } catch (loginErr: any) {
            // Auto-setup bootstrap Admin
            if (
              formattedEmail === 'jeremytopaka@gmail.com' &&
              password === '123123' &&
              (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential')
            ) {
              console.log("Bootstrap Admin account creation...");
              const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
              const user = userCredential.user;

              await setDoc(doc(db, 'users', user.uid), {
                email: formattedEmail,
                name: 'Jeremy Topaka',
                firstName: 'Jeremy',
                lastName: 'Topaka',
                approved: true,
                role: 'admin',
                createdAt: serverTimestamp(),
              });

              setSuccess("Compte administrateur initialisé et connecté avec succès !");
              return;
            }
            
            if (loginErr.code === 'auth/operation-not-allowed') {
              throw loginErr; 
            }

            if (loginErr.code === 'auth/wrong-password' || loginErr.code === 'auth/invalid-credential') {
              throw new Error("Identifiants incorrects. Veuillez réessayer.");
            } else if (loginErr.code === 'auth/user-not-found') {
              throw new Error("Aucun compte trouvé avec cet e-mail.");
            } else {
              throw new Error(loginErr.message || "Impossible de se connecter.");
            }
          }
        }
      } else {
        // --- SIGNUP FLOW ---
        if (!firstName.trim() || !lastName.trim()) {
          throw new Error("Veuillez saisir votre prénom et votre nom.");
        }
        if (password.length < 6) {
          throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
        }
        if (password !== confirmPassword) {
          throw new Error("Les mots de passe ne correspondent pas pour vérification.");
        }

        if (signupType === 'personnel') {
          // Personal Sign-up
          if (!selectedCompanyId) {
            throw new Error("Veuillez choisir la compagnie pour laquelle vous travaillez.");
          }
          const chosenComp = companiesList.find(c => c.id === selectedCompanyId);
          if (!chosenComp) {
            throw new Error("Compagnie partenaire non valide.");
          }

          const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
          const user = userCredential.user;
          const fullName = `${firstName.trim()} ${lastName.trim()}`;

          await setDoc(doc(db, 'users', user.uid), {
            email: formattedEmail,
            name: fullName,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            approved: false, // Wait for validation
            role: 'client',
            accountType: 'personnel',
            requestedCompanyId: chosenComp.id,
            requestedCompanyName: chosenComp.name,
            createdAt: serverTimestamp(),
          });

          setSuccess("Création réussie ! Votre compte personnel est en cours d'analyse. Un administrateur doit approuver votre demande pour vous rattacher à la compagnie.");
          // Clear registration inputs
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setFirstName('');
          setLastName('');
          setSelectedCompanyId('');
          setIsLogin(true);
        } else {
          // Company Partner Sign-up
          if (!phone.trim()) {
            throw new Error("Veuillez saisir votre numéro de téléphone professionnel.");
          }
          if (!companyName.trim()) {
            throw new Error("Veuillez saisir le nom complet de la compagnie.");
          }
          if (!companyAddress.trim()) {
            throw new Error("Veuillez saisir l'adresse physique de la compagnie.");
          }
          if (!productSold.trim()) {
            throw new Error("Veuillez renseigner le type de produit vendu.");
          }

          const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
          const user = userCredential.user;
          const fullName = `${firstName.trim()} ${lastName.trim()}`;

          // Create the pending user object
          await setDoc(doc(db, 'users', user.uid), {
            email: formattedEmail,
            name: fullName,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            approved: false,
            role: 'client',
            accountType: 'compagnie',
            phone: phone.trim(),
            companyName: companyName.trim(),
            companyAddress: companyAddress.trim(),
            productSold: productSold.trim(),
            createdAt: serverTimestamp(),
          });

          // Write a request document
          await setDoc(doc(db, 'companyRequests', user.uid), {
            id: user.uid,
            uid: user.uid,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: formattedEmail,
            phone: phone.trim(),
            companyName: companyName.trim(),
            companyAddress: companyAddress.trim(),
            productSold: productSold.trim(),
            createdAt: serverTimestamp(),
            status: 'pending',
          });

          setSuccess("Demande de compagnie transmise avec succès ! Lorsque l'administrateur validera la compagnie, vous recevrez l'autorisation complète de connexion.");
          // Clear registration inputs
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setFirstName('');
          setLastName('');
          setPhone('');
          setCompanyName('');
          setCompanyAddress('');
          setProductSold('');
          setIsLogin(true);
        }
      }
    } catch (err: any) {
      console.error("Authentification Error Details:", err);
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        setError(
          <div className="space-y-2 text-red-800 text-[11px] leading-relaxed">
            <p className="font-bold">⚠️ MÉTHODE DE CONNEXION ACTIVE REQUISE :</p>
            <p>L'authentification "E-mail/Mot de passe" est désactivée dans votre console Firebase.</p>
            <div className="bg-white/70 p-2.5 rounded border border-red-200 text-left space-y-1 font-sans text-[10.5px]">
              <p className="font-semibold text-slate-700">👉 Pour résoudre ce problème :</p>
              <ol className="list-decimal pl-4 space-y-1 text-slate-650">
                <li>Ouvrez la <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-semibold">Console Firebase</a></li>
                <li>Sélectionnez votre projet (ou créez-en un)</li>
                <li>Allez dans <strong>Build &gt; Authentication &gt; Sign-in method</strong></li>
                <li>Cliquez sur <strong>Ajouter un fournisseur</strong> &gt; sélectionnez <strong>Adresse e-mail/Mot de passe</strong> &gt; <strong>Activer</strong> &gt; cliquez sur <strong>Enregistrer</strong></li>
              </ol>
            </div>
          </div>
        );
      } else {
        setError(err.message || "Une erreur inattendue est survenue.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f1f5f9] px-4 py-8 sm:px-6 lg:px-8" id="inventone-auth-wrapper">
      <div className="w-full max-w-lg bg-white border border-slate-200 p-5 sm:p-8 rounded-xl shadow-md relative overflow-hidden space-y-6" id="auth-panel">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-blue-600" />

        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <FileSignature className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-sans font-extrabold text-[#0f172a] tracking-tight">
              {isLogin ? "Accéder à InventOne" : "Rejoindre la plateforme"}
            </h2>
            <p className="mt-1 text-xs text-slate-500 font-sans font-medium">
              {isLogin 
                ? "Connexion à votre espace d'inventaire sécurisé" 
                : "Choisissez votre type de compte pour vous enregistrer"
              }
            </p>
          </div>
        </div>

        {/* Global Feedback Alert Messages */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex gap-2.5 items-start" id="auth-error-alert">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-650 mt-0.5" />
            <div className="flex-1 text-left">{error}</div>
          </div>
        )}

        {success && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex gap-2.5 items-start" id="auth-success-alert">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-650" />
            <span className="text-left leading-relaxed">{success}</span>
          </div>
        )}

        {/* Auth Mode Toggle & Segment Control */}
        {isLogin ? (
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg border border-slate-200" id="login-type-selector">
            <button
              type="button"
              className={`py-1.5 text-xs font-sans font-bold uppercase transition-all rounded-md flex items-center justify-center gap-1.5 ${
                loginMethod === 'standard'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                setLoginMethod('standard');
                setError(null);
                setSuccess(null);
              }}
            >
              <Briefcase className="h-3.5 w-3.5" />
              Compte Standard
            </button>
            <button
              type="button"
              className={`py-1.5 text-xs font-sans font-bold uppercase transition-all rounded-md flex items-center justify-center gap-1.5 ${
                loginMethod === 'collaborator'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                setLoginMethod('collaborator');
                setError(null);
                setSuccess(null);
              }}
            >
              <Users className="h-3.5 w-3.5" />
              Collaborateur / Client
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg border border-slate-200" id="signup-type-selector">
            <button
              type="button"
              className={`py-1.5 text-xs font-sans font-bold uppercase transition-all rounded-md flex items-center justify-center gap-1.5 ${
                signupType === 'personnel'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                setSignupType('personnel');
                setError(null);
                setSuccess(null);
              }}
            >
              <Users className="h-3.5 w-3.5" />
              Compte Personnel
            </button>
            <button
              type="button"
              className={`py-1.5 text-xs font-sans font-bold uppercase transition-all rounded-md flex items-center justify-center gap-1.5 ${
                signupType === 'compagnie'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                setSignupType('compagnie');
                setError(null);
                setSuccess(null);
              }}
            >
              <Building2 className="h-3.5 w-3.5" />
              Compte Compagnie
            </button>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleAuth} id="auth-form">
          {isLogin && loginMethod === 'collaborator' ? (
            <div className="space-y-1">
              <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase block">Identifiant Collaborateur (7 caractères)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <KeyRound className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  maxLength={7}
                  placeholder="Ex: x7r9p12"
                  value={collaboratorId}
                  onChange={(e) => setCollaboratorId(e.target.value)}
                  className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-semibold uppercase tracking-wider rounded transition-all"
                  id="auth-collab-id"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Saisissez votre identifiant de connexion unique à 7 caractères fourni directement par votre compagnie partenaire.
              </p>
            </div>
          ) : (
            <>
              {/* Registration shared names */}
              {!isLogin && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Prénom</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Paul"
                        className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-medium rounded transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Nom de famille</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Durand"
                        className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-medium rounded transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Email input (always present) */}
              <div className="space-y-1">
                <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Adresse e-mail</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <Mail className="h-4 w-4" />
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ex: paul.durand@work.com"
                    className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-medium rounded transition-all"
                    id="auth-email"
                  />
                </div>
              </div>

              {/* COMPTE PERSONNEL : Company list select dropdown */}
              {!isLogin && signupType === 'personnel' && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Sélectionner votre Compagnie</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <select
                      required
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-semibold rounded transition-all"
                      id="select-registered-company"
                    >
                      <option value="">-- Choisir une compagnie dans l'inventaire --</option>
                      {companiesList.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.address})</option>
                      ))}
                    </select>
                  </div>
                  {companiesList.length === 0 && (
                    <p className="text-[9.5px] text-amber-600 font-sans font-medium mt-1 leading-normal">
                      ⚠️ Aucune compagnie n'est encore enregistrée. Veuillez d'abord créer un <strong>Compte Compagnie</strong> pour enregistrer votre entreprise !
                    </p>
                  )}
                </div>
              )}

              {/* COMPTE COMPAGNIE : Additional parameters */}
              {!isLogin && signupType === 'compagnie' && (
                <div className="space-y-3.5 border-t border-b border-slate-100 py-3.5 my-1 bg-slate-50/50 p-3 rounded-lg">
                  <span className="text-[10px] font-mono tracking-wider font-bold text-blue-700 uppercase block">Informations sur l'Entreprise :</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10.1px] font-sans font-bold text-slate-650 uppercase block">Téléphone de contact</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                          <Phone className="h-3.5 w-3.5" />
                        </span>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+33 6 12 34 56 78"
                          className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white pl-9 pr-3 py-1.5 text-xs font-semibold rounded"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.1px] font-sans font-bold text-slate-650 uppercase block">Nom de la Compagnie</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                          <Briefcase className="h-3.5 w-3.5" />
                        </span>
                        <input
                          type="text"
                          required
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Ex: SARL Auto-Oil"
                          className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white pl-9 pr-3 py-1.5 text-xs font-semibold rounded"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.1px] font-sans font-bold text-slate-650 uppercase block">Adresse physique</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        placeholder="Ex: 45 Rue de la Distribution, Paris"
                        className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white pl-9 pr-3 py-1.5 text-xs font-medium rounded"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.1px] font-sans font-bold text-slate-650 uppercase block">Produit vendu / Catégorie</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <Package className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="text"
                        required
                        value={productSold}
                        onChange={(e) => setProductSold(e.target.value)}
                        placeholder="Ex: Bidons d'huile moteur, lubrifiants"
                        className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white pl-9 pr-3 py-1.5 text-xs font-medium rounded"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Password field(s) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Mot de passe</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-medium rounded transition-all"
                      id="auth-password"
                    />
                  </div>
                </div>

                {!isLogin ? (
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-sans font-bold text-slate-700 uppercase tracking-wide block">Vérification</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full bg-[#f8fafc] text-[#0f172a] border border-slate-200 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600/20 pl-9 pr-3 py-2 text-xs font-medium rounded transition-all"
                        id="auth-confirm-password"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="hidden sm:block pb-1" />
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-5"
            id="auth-submit-btn"
          >
            {loading ? (
              <span className="border-2 border-white border-t-transparent w-4 h-4 rounded-full animate-spin"></span>
            ) : (
              <>
                <span>
                  {isLogin 
                    ? (loginMethod === 'collaborator' ? "Se connecter (Collaborateur)" : "Se connecter") 
                    : (signupType === 'personnel' ? "S'inscrire (Perso)" : "Soumettre la Compagnie")
                  }
                </span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500 font-sans font-medium">
          {isLogin ? (
            <p>
              Rejoindre en tant que partenaire client ?{" "}
              <button
                type="button"
                className="font-semibold text-blue-600 hover:text-blue-500 transition-colors cursor-pointer"
                onClick={() => {
                  setIsLogin(false);
                  setError(null);
                  setSuccess(null);
                }}
                id="go-to-signup"
              >
                Créer un compte
              </button>
            </p>
          ) : (
            <p>
              Déjà membre de la plateforme ?{" "}
              <button
                type="button"
                className="font-semibold text-blue-600 hover:text-blue-500 transition-colors cursor-pointer"
                onClick={() => {
                  setIsLogin(true);
                  setError(null);
                  setSuccess(null);
                }}
                id="go-to-login"
              >
                Se connecter
              </button>
            </p>
          )}
        </div>


      </div>
    </div>
  );
}
