import React, { useState } from 'react';
import { UserProfile } from '../types';
import { SearchTypeCategory, SEARCH_TYPES } from '../utils/searchProfiles';
import {
  Search,
  ChevronDown,
  SlidersHorizontal,
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
  const needsVehicleOrCorp =
    searchType === 'VEHICLE_REGISTRATION' || searchType === 'CORPORATE_EXECUTIVE';

  return (
    <div className="max-w-3xl mx-auto glass-panel rounded-3xl p-6 sm:p-9 space-y-6">
      {/* Minimalist Unboxed Header */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="text-emerald-400 font-medium">Exposure Audit</span>
          <span aria-hidden="true">·</span>
          <span>10 Search Vectors</span>
          <span aria-hidden="true">·</span>
          <span>Session-Local PII</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Configure Identity Scan Parameters
        </h2>
        <p className="text-xs text-slate-400">
          Matches public-record aggregators, people-search clearinghouses, and breach indexes while
          disqualifying out-of-state homonyms.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Search Vector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 block">Search Vector</label>
          <div className="relative">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as SearchTypeCategory)}
              className="w-full glass-input rounded-2xl px-4 py-3 text-xs text-emerald-300 font-medium appearance-none cursor-pointer pr-10"
            >
              {SEARCH_TYPES.map((t) => (
                <option key={t.type} value={t.type} className="bg-slate-950 text-white">
                  {t.label} — {t.description.slice(0, 56)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-[11px] text-slate-400 px-0.5">{currentTypeConfig.description}</p>
        </div>

        {/* Name & Birth Year */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-400">First Name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-400">Last Name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Birth Year</label>
            <input
              type="text"
              maxLength={4}
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1988"
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white font-mono tabular-nums placeholder-slate-500"
            />
          </div>
        </div>

        {/* Primary Jurisdiction */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-slate-400">Current City</label>
            <input
              type="text"
              required
              value={currentCity}
              onChange={(e) => setCurrentCity(e.target.value)}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">State</label>
            <input
              type="text"
              required
              maxLength={2}
              value={currentState}
              onChange={(e) => setCurrentState(e.target.value.toUpperCase())}
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white uppercase font-mono placeholder-slate-500"
            />
          </div>
        </div>

        {/* Contact Anchors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(916) 555-0144"
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white font-mono tabular-nums placeholder-slate-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-400">Primary Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
            />
          </div>
        </div>

        {/* Progressive Disclosure for Secondary Anchors */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>
              {showAdvanced || needsVehicleOrCorp
                ? 'Hide Cross-State, VIN & Corporate Anchors'
                : 'Add Prior Cities, VIN or Corporate Anchors'}
            </span>
          </button>

          {(showAdvanced || needsVehicleOrCorp) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Prior Cities / States</label>
                <input
                  type="text"
                  value={priorLocations}
                  onChange={(e) => setPriorLocations(e.target.value)}
                  placeholder="Austin, TX"
                  className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Vehicle VIN (Optional)</label>
                <input
                  type="text"
                  value={vinNumber}
                  onChange={(e) => setVinNumber(e.target.value)}
                  placeholder="17-char VIN"
                  className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Entity / Employer</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="LLC or Employer"
                  className="w-full glass-input rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isScanning}
          className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-emerald-500/15 inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          <span>{isScanning ? 'Scanning Clearinghouses...' : 'Run Exposure Audit'}</span>
        </button>
      </form>
    </div>
  );
};
