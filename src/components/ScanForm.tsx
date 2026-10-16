import React, { useState } from 'react';
import { UserProfile } from '../types';
import { SearchTypeCategory, SEARCH_TYPES } from '../utils/searchProfiles';
import { 
  ShieldCheck, 
  Search, 
  MapPin, 
  Phone, 
  Mail, 
  User, 
  Calendar, 
  Lock, 
  Layers,
  ChevronDown,
  Building,
  Car
} from 'lucide-react';

interface ScanFormProps {
  onScan: (profile: UserProfile, searchType: SearchTypeCategory) => void;
  isScanning?: boolean;
}

export const ScanForm: React.FC<ScanFormProps> = ({ onScan, isScanning }) => {
  const [searchType, setSearchType] = useState<SearchTypeCategory>('STANDARD_IDENTITY');
  const [firstName, setFirstName] = useState('Jane');
  const [lastName, setLastName] = useState('Doe');
  const [currentCity, setCurrentCity] = useState('Sacramento');
  const [currentState, setCurrentState] = useState('CA');
  const [birthYear, setBirthYear] = useState('1988');
  const [phone, setPhone] = useState('(916) 555-0144');
  const [email, setEmail] = useState('synovamedia@gmail.com');
  const [priorLocations, setPriorLocations] = useState('Austin, TX');
  const [vinNumber, setVinNumber] = useState('');
  const [companyName, setCompanyName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const previousLocations = priorLocations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const profile: UserProfile = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      currentCity: currentCity.trim(),
      currentState: currentState.trim().toUpperCase(),
      birthYear: birthYear.trim(),
      phoneNumbers: phone.trim() ? [phone.trim()] : [],
      emails: email.trim() ? [email.trim()] : [],
      previousLocations,
      relatives: [],
      vehicleInfo: vinNumber.trim() ? { vin: vinNumber.trim(), state: currentState } : undefined,
      associations: companyName.trim() ? [{ name: companyName.trim() }] : undefined,
    };

    onScan(profile, searchType);
  };

  const currentTypeConfig = SEARCH_TYPES.find((t) => t.type === searchType) || SEARCH_TYPES[0];

  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl space-y-6">
      {/* Header */}
      <div className="space-y-1.5 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Zero-PII Logged
          </span>
          <span className="text-xs text-slate-400 font-mono">Select From 10 Search Vectors</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Initiate Autonomous Exposure Audit</h2>
        <p className="text-xs text-slate-400">
          Audits clear-web data brokers, court indexes, property registries, and dark web threat feeds.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Search Type Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 block">
            Target Search Vector (1 of 10 Types):
          </label>
          <div className="relative">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as SearchTypeCategory)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-emerald-400 font-semibold appearance-none focus:outline-none focus:border-emerald-500 cursor-pointer pr-10"
            >
              {SEARCH_TYPES.map((t) => (
                <option key={t.type} value={t.type} className="bg-slate-900 text-white">
                  {t.label} - {t.description.slice(0, 50)}...
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-400 italic px-1">{currentTypeConfig.description}</p>
        </div>

        {/* Primary Identity Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" /> First Name
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" /> Last Name
            </label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Location Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" /> Primary City
            </label>
            <input
              type="text"
              required
              value={currentCity}
              onChange={(e) => setCurrentCity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Current State (2-Letter)</label>
            <input
              type="text"
              required
              maxLength={2}
              value={currentState}
              onChange={(e) => setCurrentState(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 uppercase font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Cross-State Jurisdiction Inputs (e.g. Jane Doe CA showing up in TX) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" /> Prior Locations / Cross-State Ties (e.g. "Austin, TX, Dallas, TX")
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">Cross-Jurisdiction Matcher</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Austin, TX, Miami, FL"
            value={priorLocations}
            onChange={(e) => setPriorLocations(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[10px] text-slate-500">
            If you lived or hold public records in other states, synOUT will audit those out-of-state registers with zero false positives.
          </p>
        </div>

        {/* Contact Telemetry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" /> Birth Year
            </label>
            <input
              type="text"
              maxLength={4}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-500" /> Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500" /> Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Dynamic Fields for Specialized Search Types */}
        {searchType === 'VEHICLE_REGISTRATION' && (
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Car className="w-4 h-4" /> Vehicle VIN / Plate Number (Required for DMV Registries)
            </label>
            <input
              type="text"
              placeholder="e.g. 1HGCR2F83HA... or License Plate"
              value={vinNumber}
              onChange={(e) => setVinNumber(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 uppercase font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {searchType === 'CORPORATE_EXECUTIVE' && (
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Building className="w-4 h-4" /> Registered Company or LLC Name
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Holdings LLC"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Submit Action */}
        <button
          type="submit"
          disabled={isScanning}
          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Search className="w-4 h-4" />
          {isScanning ? 'Auditing Repositories...' : `Execute ${currentTypeConfig.label}`}
        </button>
      </form>
    </div>
  );
};
