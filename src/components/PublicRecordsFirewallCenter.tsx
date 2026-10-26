import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CanaryAliasRecord,
  PublicRecordChecklistState,
  UserProfile,
} from '../types';
import {
  UPSTREAM_PUBLIC_RECORD_GUIDES,
  attributeLeakFromRawEmail,
  buildPublicRecordSuppressionLetter,
  buildVendorLeakAuditDemand,
  generateCanaryAliasRecord,
} from '../utils/publicRecordsFirewall';
import {
  ImageMetadataStripReport,
  inspectAndStripImageMetadataBytes,
  sanitizeTrackingUrl,
} from '../utils/replyTriageEngine';
import { buildWebmailComposeUrls } from '../utils/emailProviderConfig';
import {
  sendEmailViaConnectedAccount,
  useEmailConnection,
} from '../services/emailConnectionStore';
import { copyTextToClipboard, downloadFile } from '../utils/exportEngines';
import {
  Landmark,
  ShieldCheck,
  Fingerprint,
  ImageOff,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Send,
  Download,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Link2,
  RotateCcw,
} from 'lucide-react';

interface PublicRecordsFirewallCenterProps {
  profile: UserProfile;
  canaryAliases: CanaryAliasRecord[];
  onUpdateCanaryAliases: (records: CanaryAliasRecord[]) => void;
  publicRecordProgress: Record<string, PublicRecordChecklistState>;
  onUpdatePublicRecordProgress: (
    guideId: string,
    patch: Partial<PublicRecordChecklistState>
  ) => void;
  onOpenConnectEmail: () => void;
  initialSubTab?: 'records' | 'canary' | 'hygiene';
}

interface RedactionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PublicRecordsFirewallCenter: React.FC<PublicRecordsFirewallCenterProps> = ({
  profile,
  canaryAliases,
  onUpdateCanaryAliases,
  publicRecordProgress,
  onUpdatePublicRecordProgress,
  onOpenConnectEmail,
  initialSubTab = 'records',
}) => {
  const { isDirectSendConnected, activeConnectedEmail } = useEmailConnection();
  const [subTab, setSubTab] = useState<'records' | 'canary' | 'hygiene'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // --- SUBTAB 1: UPSTREAM PUBLIC RECORDS ---
  const [selectedGuideId, setSelectedGuideId] = useState<string>(
    UPSTREAM_PUBLIC_RECORD_GUIDES[0].id
  );
  const activeGuide = useMemo(
    () =>
      UPSTREAM_PUBLIC_RECORD_GUIDES.find((g) => g.id === selectedGuideId) ||
      UPSTREAM_PUBLIC_RECORD_GUIDES[0],
    [selectedGuideId]
  );

  const [agencyName, setAgencyName] = useState<string>('');
  const [countyName, setCountyName] = useState<string>('');
  const [parcelOrVoterId, setParcelOrVoterId] = useState<string>('');
  const [custodianEmail, setCustodianEmail] = useState<string>(
    UPSTREAM_PUBLIC_RECORD_GUIDES[0].defaultRecipientPlaceholder
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSendingRecordEmail, setIsSendingRecordEmail] = useState<boolean>(false);
  const [recordSendMsg, setRecordSendMsg] = useState<string | null>(null);
  const [recordSendErr, setRecordSendErr] = useState<string | null>(null);

  useEffect(() => {
    setCustodianEmail(activeGuide.defaultRecipientPlaceholder);
    setRecordSendMsg(null);
    setRecordSendErr(null);
  }, [activeGuide]);

  const generatedPublicLetter = useMemo(
    () =>
      buildPublicRecordSuppressionLetter(activeGuide.id, profile, {
        agencyName,
        countyName,
        parcelOrVoterId,
        recipientEmail: custodianEmail,
        senderEmail: activeConnectedEmail || profile.emails[0] || undefined,
      }),
    [activeGuide.id, profile, agencyName, countyName, parcelOrVoterId, custodianEmail, activeConnectedEmail]
  );

  const completedGuidesCount = useMemo(
    () =>
      UPSTREAM_PUBLIC_RECORD_GUIDES.filter(
        (g) => publicRecordProgress[g.id]?.completed
      ).length,
    [publicRecordProgress]
  );

  // --- SUBTAB 2: CANARY ALIAS & LEAK ATTRIBUTION ---
  const [vendorName, setVendorName] = useState<string>('');
  const [vendorDomain, setVendorDomain] = useState<string>('');
  const [vendorPrivacyEmail, setVendorPrivacyEmail] = useState<string>('');
  const [baseAliasEmail, setBaseAliasEmail] = useState<string>(
    activeConnectedEmail || profile.emails[0] || 'jane.doe@gmail.com'
  );
  const [customAliasDomain, setCustomAliasDomain] = useState<string>('');
  const [compartmentPhone, setCompartmentPhone] = useState<string>('');
  const [canaryCategory, setCanaryCategory] =
    useState<CanaryAliasRecord['category']>('Retail & Loyalty');
  const [canarySearch, setCanarySearch] = useState<string>('');

  const [rawLeakHeader, setRawLeakHeader] = useState<string>('');
  const [selectedLeakRecord, setSelectedLeakRecord] = useState<CanaryAliasRecord | null>(null);
  const [isSendingLeakDemand, setIsSendingLeakDemand] = useState<boolean>(false);
  const [leakSendMsg, setLeakSendMsg] = useState<string | null>(null);
  const [leakSendErr, setLeakSendErr] = useState<string | null>(null);

  const leakAnalysis = useMemo(() => {
    if (!rawLeakHeader.trim()) return null;
    return attributeLeakFromRawEmail(rawLeakHeader, canaryAliases);
  }, [rawLeakHeader, canaryAliases]);

  // --- SUBTAB 3: REDACTED ID WATERMARKER, EXIF STRIPPER & URL SANITIZER ---
  const [rawUrlInput, setRawUrlInput] = useState<string>(
    'https://www.spokeo.com/optout/confirm?token=abc99182&utm_source=email&utm_medium=ccpa&fbclid=IwAR12345&mc_eid=88192a'
  );
  const sanitizedUrlReport = useMemo(
    () => sanitizeTrackingUrl(rawUrlInput),
    [rawUrlInput]
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [metadataReport, setMetadataReport] = useState<ImageMetadataStripReport | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('credential-sample.jpg');
  const [watermarkRecipient, setWatermarkRecipient] = useState<string>('LexisNexis Consumer Center');
  const [enableWatermark, setEnableWatermark] = useState<boolean>(true);
  const [redactionBoxes, setRedactionBoxes] = useState<RedactionBox[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragBox, setCurrentDragBox] = useState<RedactionBox | null>(null);
  const [hasLoadedCanvasDoc, setHasLoadedCanvasDoc] = useState<boolean>(false);

  const handleCopy = async (key: string, text: string) => {
    await copyTextToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDispatchPublicRecordNotice = async () => {
    setIsSendingRecordEmail(true);
    setRecordSendErr(null);
    setRecordSendMsg(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: custodianEmail.trim(),
        subject: generatedPublicLetter.subject,
        body: generatedPublicLetter.body,
        senderName: `${profile.firstName} ${profile.lastName}`,
        brokerId: activeGuide.id,
        brokerName: agencyName.trim() || activeGuide.title,
        brokerDomain: custodianEmail.split('@')[1] || 'gov',
        bccSelf: true,
      });
      onUpdatePublicRecordProgress(activeGuide.id, {
        completed: true,
        submittedAtIso: new Date().toISOString(),
        emailReceipt: res.messageId,
      });
      setRecordSendMsg(`Sent from ${res.sentFrom} · Receipt: ${res.messageId}`);
    } catch (err) {
      setRecordSendErr(err instanceof Error ? err.message : 'Failed sending suppression petition.');
    } finally {
      setIsSendingRecordEmail(false);
    }
  };

  const handleCreateCanary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) return;
    const created = generateCanaryAliasRecord({
      baseEmail: baseAliasEmail,
      customDomain: customAliasDomain,
      vendorName,
      vendorDomain,
      vendorPrivacyEmail,
      compartmentPhone,
      category: canaryCategory,
    });
    onUpdateCanaryAliases([created, ...canaryAliases]);
    setVendorName('');
    setVendorDomain('');
    setVendorPrivacyEmail('');
  };

  const handleFlagCanaryLeaked = (rec: CanaryAliasRecord, evidenceHeader?: string) => {
    const updated = canaryAliases.map((item) =>
      item.id === rec.id
        ? {
            ...item,
            status: 'leak_detected' as const,
            leakDetectedAtIso: new Date().toISOString(),
            leakEvidenceHeader: evidenceHeader || rawLeakHeader.slice(0, 300),
          }
        : item
    );
    onUpdateCanaryAliases(updated);
    const target = updated.find((i) => i.id === rec.id) || rec;
    setSelectedLeakRecord(target);
    setLeakSendMsg(null);
    setLeakSendErr(null);
  };

  const handleSendVendorLeakDemand = async () => {
    if (!selectedLeakRecord) return;
    const recipient =
      selectedLeakRecord.vendorPrivacyEmail ||
      `privacy@${selectedLeakRecord.vendorDomain}`;
    const demand = buildVendorLeakAuditDemand(
      selectedLeakRecord,
      profile,
      activeConnectedEmail || profile.emails[0]
    );
    setIsSendingLeakDemand(true);
    setLeakSendErr(null);
    setLeakSendMsg(null);
    try {
      const res = await sendEmailViaConnectedAccount({
        recipientEmail: recipient,
        subject: demand.subject,
        body: demand.body,
        senderName: `${profile.firstName} ${profile.lastName}`,
        brokerId: selectedLeakRecord.id,
        brokerName: selectedLeakRecord.vendorName,
        brokerDomain: selectedLeakRecord.vendorDomain,
        bccSelf: true,
      });
      onUpdateCanaryAliases(
        canaryAliases.map((c) =>
          c.id === selectedLeakRecord.id ? { ...c, demandReceipt: res.messageId } : c
        )
      );
      setLeakSendMsg(
        `CCPA § 1798.115 Audit & Deletion Demand sent to ${recipient} · Receipt: ${res.messageId}`
      );
    } catch (err) {
      setLeakSendErr(err instanceof Error ? err.message : 'Failed sending audit demand.');
    } finally {
      setIsSendingLeakDemand(false);
    }
  };

  // Redraw ID Redaction & Watermark Canvas
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (loadedImageRef.current) {
      ctx.drawImage(loadedImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      // Render realistic synthetic test ID layout so user can test blackout + watermarking
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`STATE IDENTIFICATION CREDENTIAL (${profile.currentState})`, 28, 44);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(28, 64, 130, 160);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px monospace';
      ctx.fillText('PHOTO', 72, 148);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`NAME: ${profile.firstName.toUpperCase()} ${profile.lastName.toUpperCase()}`, 180, 88);
      ctx.fillText(`CITY/ST: ${profile.currentCity.toUpperCase()}, ${profile.currentState}`, 180, 118);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('DL NO: D9948-2201-7741  [DRAG TO REDACT]', 180, 152);
      ctx.fillText('DOB: 04/19/1988         [DRAG TO REDACT]', 180, 182);
      ctx.fillStyle = '#334155';
      ctx.fillRect(180, 200, 360, 26);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.fillText('PDF417 BARCODE REGION - REDACT BEFORE SENDING', 192, 217);
    }

    // Draw committed solid blackout boxes
    ctx.fillStyle = '#000000';
    for (const box of redactionBoxes) {
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }

    // Draw active drag preview
    if (currentDragBox) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(
        currentDragBox.x,
        currentDragBox.y,
        currentDragBox.w,
        currentDragBox.h
      );
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        currentDragBox.x,
        currentDragBox.y,
        currentDragBox.w,
        currentDragBox.h
      );
    }

    // Draw forensic diagonal watermark
    if (enableWatermark) {
      const dateStamp = new Date().toISOString().split('T')[0];
      const line1 = `PRIVACY VERIFICATION ONLY - ${watermarkRecipient.toUpperCase()}`;
      const line2 = `${dateStamp} - DO NOT SELL, SHARE, OR RETAIN`;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 8);
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px monospace';
      ctx.fillStyle = 'rgba(244, 63, 94, 0.36)';
      for (let offsetY = -120; offsetY <= 120; offsetY += 80) {
        ctx.fillText(line1, 0, offsetY);
        ctx.fillText(line2, 0, offsetY + 20);
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    if (subTab === 'hygiene') {
      renderCanvas();
    }
  }, [subTab, redactionBoxes, currentDragBox, enableWatermark, watermarkRecipient, hasLoadedCanvasDoc]);

  const handleLoadSyntheticSampleWithExif = () => {
    loadedImageRef.current = null;
    setRedactionBoxes([{ x: 176, y: 136, w: 370, h: 94 }]);
    setUploadedFileName('sample-id-with-exif-gps.jpg');
    // Build a synthetic JPEG byte array containing SOI + APP1 Exif + GPS tag (0x8825) + EOI to demonstrate binary stripping
    const exifHeader = new TextEncoder().encode('Exif\0\0MM\0*\0\0\0\x08GPS');
    const segLen = exifHeader.length + 2;
    const sampleJpeg = new Uint8Array(2 + 2 + segLen + 4);
    sampleJpeg[0] = 0xff;
    sampleJpeg[1] = 0xd8;
    sampleJpeg[2] = 0xff;
    sampleJpeg[3] = 0xe1;
    sampleJpeg[4] = (segLen >> 8) & 0xff;
    sampleJpeg[5] = segLen & 0xff;
    sampleJpeg.set(exifHeader, 6);
    const tailOffset = 6 + exifHeader.length;
    sampleJpeg[tailOffset] = 0xff;
    sampleJpeg[tailOffset + 1] = 0xd9;
    setMetadataReport(inspectAndStripImageMetadataBytes(sampleJpeg));
    setHasLoadedCanvasDoc((v) => !v);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setRedactionBoxes([]);

    const bufferReader = new FileReader();
    bufferReader.onload = () => {
      if (bufferReader.result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(bufferReader.result);
        setMetadataReport(inspectAndStripImageMetadataBytes(bytes));
      }
    };
    bufferReader.readAsArrayBuffer(file);

    const dataUrlReader = new FileReader();
    dataUrlReader.onload = () => {
      if (typeof dataUrlReader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          loadedImageRef.current = img;
          const canvas = canvasRef.current;
          if (canvas) {
            const maxW = 640;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = Math.max(320, Math.round(img.width * scale));
            canvas.height = Math.max(200, Math.round(img.height * scale));
          }
          setHasLoadedCanvasDoc((v) => !v);
        };
        img.src = dataUrlReader.result;
      }
    };
    dataUrlReader.readAsDataURL(file);
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    setDragStart(pt);
    setCurrentDragBox({ x: pt.x, y: pt.y, w: 0, h: 0 });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const pt = getCanvasCoords(e);
    setCurrentDragBox({
      x: Math.min(dragStart.x, pt.x),
      y: Math.min(dragStart.y, pt.y),
      w: Math.abs(pt.x - dragStart.x),
      h: Math.abs(pt.y - dragStart.y),
    });
  };

  const handleCanvasMouseUp = () => {
    if (currentDragBox && currentDragBox.w > 6 && currentDragBox.h > 6) {
      setRedactionBoxes((prev) => [...prev, currentDragBox]);
    }
    setDragStart(null);
    setCurrentDragBox(null);
  };

  const handleDownloadSanitizedPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    const baseName = uploadedFileName.replace(/\.[^.]+$/, '');
    a.download = `synout-redacted-clean-${baseName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadBinaryStrippedOriginal = () => {
    if (!metadataReport) return;
    const mime = metadataReport.format === 'PNG' ? 'image/png' : 'image/jpeg';
    const blob = new Blob([metadataReport.cleanedBytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synout-exif-stripped-${uploadedFileName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredCanaries = canaryAliases.filter(
    (c) =>
      c.vendorName.toLowerCase().includes(canarySearch.toLowerCase()) ||
      c.aliasEmail.toLowerCase().includes(canarySearch.toLowerCase()) ||
      c.vendorDomain.toLowerCase().includes(canarySearch.toLowerCase())
  );

  const publicWebmailUrls = buildWebmailComposeUrls(
    custodianEmail,
    generatedPublicLetter.subject,
    generatedPublicLetter.body
  );

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8 text-xs">
      {/* Top Header */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="font-mono text-emerald-400 font-medium">
              Upstream Source Suppression · Canary Leak Attribution · Local EXIF/ID Shield
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Public Records &amp; Identity Firewall Hub
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Cut off the county deed, voter roll, and DMV feeds that re-populate data brokers, deploy cryptographic canary aliases to catch companies selling your PII, and strip EXIF/GPS metadata locally.
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-white/[0.08] shrink-0 tabular-nums">
            <div className="pr-5">
              <span className="text-[11px] text-slate-400 block">Records Hardened</span>
              <span className="text-xl font-bold text-emerald-400 font-mono">
                {completedGuidesCount}/{UPSTREAM_PUBLIC_RECORD_GUIDES.length}
              </span>
            </div>
            <div className="px-5">
              <span className="text-[11px] text-slate-400 block">Active Canaries</span>
              <span className="text-xl font-bold text-sky-400 font-mono">
                {canaryAliases.length}
              </span>
            </div>
            <div className="pl-5">
              <span className="text-[11px] text-slate-400 block">Leaks Caught</span>
              <span className="text-xl font-bold text-rose-400 font-mono">
                {canaryAliases.filter((c) => c.status === 'leak_detected').length}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Navigation */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('records')}
            className={`px-4 py-2 rounded-xl font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'records'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>1. County Deeds, Voter Rolls &amp; DMV DPPA</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('canary')}
            className={`px-4 py-2 rounded-xl font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'canary'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            <span>2. Canary Aliases &amp; Leak Attribution ({canaryAliases.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('hygiene')}
            className={`px-4 py-2 rounded-xl font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              subTab === 'hygiene'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
          >
            <ImageOff className="w-4 h-4" />
            <span>3. Redacted ID Watermarker, EXIF Stripper &amp; URL Scrubber</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SUBTAB 1: UPSTREAM PUBLIC RECORDS SUPPRESSION                        */}
      {/* =================================================================== */}
      {subTab === 'records' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Rail: 6 Upstream Pipelines */}
          <div className="lg:col-span-5 space-y-2.5">
            {UPSTREAM_PUBLIC_RECORD_GUIDES.map((guide) => {
              const isSelected = guide.id === activeGuide.id;
              const isDone = Boolean(publicRecordProgress[guide.id]?.completed);
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => setSelectedGuideId(guide.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-slate-900 border-emerald-500/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <span className="text-emerald-400">{guide.category}</span>
                    <span className={isDone ? 'text-emerald-300 font-semibold' : 'text-slate-500'}>
                      {isDone ? 'Hardened' : 'Pending'}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">{guide.title}</div>
                  <p className="text-slate-400 text-[11px] line-clamp-2">{guide.riskSummary}</p>
                </button>
              );
            })}
          </div>

          {/* Right Workspace: Selected Upstream Petition & Checklist */}
          <div className="lg:col-span-7 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="space-y-1">
                <span className="font-mono text-emerald-400 text-[11px]">
                  {activeGuide.statutoryCitations}
                </span>
                <h2 className="text-lg font-bold text-white">{activeGuide.title}</h2>
                <p className="text-slate-400 leading-relaxed">{activeGuide.riskSummary}</p>
              </div>
              <a
                href={activeGuide.officialDirectoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-sky-300 font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <span>{activeGuide.officialDirectoryLabel}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Action Steps */}
            <div className="space-y-2">
              <div className="font-bold text-slate-200">Action Protocol</div>
              {activeGuide.checklistSteps.map((step, i) => (
                <div
                  key={i}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5 text-slate-300"
                >
                  <span className="font-mono text-emerald-400 font-bold shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {/* Customizer Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  County / Agency Name
                </label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder={`${profile.currentCity} County Assessor`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Custodian / Privacy Email
                </label>
                <input
                  type="email"
                  value={custodianEmail}
                  onChange={(e) => setCustodianEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  APN / Voter / Filing ID (Optional)
                </label>
                <input
                  type="text"
                  value={parcelOrVoterId}
                  onChange={(e) => setParcelOrVoterId(e.target.value)}
                  placeholder="e.g. APN 014-291-08"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Generated Statutory Petition */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">
                  Generated Public-Record Suppression Petition
                </span>
                <label className="inline-flex items-center gap-2 cursor-pointer text-emerald-300 font-semibold">
                  <input
                    type="checkbox"
                    checked={Boolean(publicRecordProgress[activeGuide.id]?.completed)}
                    onChange={(e) =>
                      onUpdatePublicRecordProgress(activeGuide.id, {
                        completed: e.target.checked,
                      })
                    }
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Mark Source Hardened</span>
                </label>
              </div>
              <textarea
                readOnly
                rows={9}
                value={`${generatedPublicLetter.subject}\n\n${generatedPublicLetter.body}`}
                className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-200 focus:outline-none resize-y"
              />
            </div>

            {recordSendMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{recordSendMsg}</span>
              </div>
            )}
            {recordSendErr && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{recordSendErr}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      'pub-letter',
                      `${generatedPublicLetter.subject}\n\n${generatedPublicLetter.body}`
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'pub-letter' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'pub-letter' ? 'Copied' : 'Copy Petition'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadFile(
                      `${generatedPublicLetter.subject}\n\n${generatedPublicLetter.body}`,
                      `synout-${activeGuide.id}-${profile.lastName.toLowerCase()}.txt`,
                      'text/plain;charset=utf-8'
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download .txt</span>
                </button>

                <a
                  href={publicWebmailUrls.gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span>Gmail Compose</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {isDirectSendConnected ? (
                <button
                  type="button"
                  disabled={isSendingRecordEmail}
                  onClick={handleDispatchPublicRecordNotice}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {isSendingRecordEmail ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Send via Connected Email</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenConnectEmail}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold cursor-pointer whitespace-nowrap"
                >
                  Connect Email to Dispatch
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBTAB 2: CANARY EMAIL ALIAS & LEAK ATTRIBUTION VAULT               */}
      {/* =================================================================== */}
      {subTab === 'canary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Mint New Canary Alias */}
            <form
              onSubmit={handleCreateCanary}
              className="lg:col-span-5 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-white">
                  Mint Single-Vendor Canary Alias
                </h2>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Issue a unique tagged address per loyalty program, merchant, or broker form. Any spam arriving at that alias proves who sold or leaked your data.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Company / Vendor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="e.g. CVS ExtraCare"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Vendor Domain
                  </label>
                  <input
                    type="text"
                    value={vendorDomain}
                    onChange={(e) => setVendorDomain(e.target.value)}
                    placeholder="e.g. cvs.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Base Mailbox (for +tag)
                  </label>
                  <input
                    type="email"
                    value={baseAliasEmail}
                    onChange={(e) => setBaseAliasEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Or Catch-All Custom Domain
                  </label>
                  <input
                    type="text"
                    value={customAliasDomain}
                    onChange={(e) => setCustomAliasDomain(e.target.value)}
                    placeholder="Optional: myvault.org"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={canaryCategory}
                    onChange={(e) =>
                      setCanaryCategory(e.target.value as CanaryAliasRecord['category'])
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Retail & Loyalty">Retail &amp; Loyalty</option>
                    <option value="Data Broker Opt-Out">Data Broker Opt-Out</option>
                    <option value="Financial / FinTech">Financial / FinTech</option>
                    <option value="Healthcare / Portal">Healthcare / Portal</option>
                    <option value="General Signup">General Signup</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Compartment VoIP Phone
                  </label>
                  <input
                    type="text"
                    value={compartmentPhone}
                    onChange={(e) => setCompartmentPhone(e.target.value)}
                    placeholder="Optional secondary #..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Mint &amp; Track Canary Identifier</span>
              </button>
            </form>

            {/* Right: Forensic Leak & Spam Source Attribution Analyzer */}
            <div className="lg:col-span-7 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Forensic Leak &amp; Unauthorized Sale Detector
                  </h2>
                  <p className="text-slate-400 text-[11px]">
                    Paste raw `To:` / `Delivered-To:` email headers from unsolicited spam to pinpoint which company leaked or sold your PII.
                  </p>
                </div>
                {canaryAliases.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const sample = canaryAliases[0];
                      setRawLeakHeader(
                        `Delivered-To: ${sample.aliasEmail}\nFrom: offers@partner-ad-broker-syndicate.example\nSubject: Exclusive Pre-Approved Offer`
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Test With Latest Canary
                  </button>
                )}
              </div>

              <textarea
                rows={4}
                value={rawLeakHeader}
                onChange={(e) => setRawLeakHeader(e.target.value)}
                placeholder="Delivered-To: jane.doe+cvs-8f3a@gmail.com&#10;From: promo@unknown-list-broker.com"
                className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y"
              />

              {leakAnalysis && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    leakAnalysis.matched
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-bold ${
                        leakAnalysis.matched ? 'text-rose-300' : 'text-slate-300'
                      }`}
                    >
                      {leakAnalysis.matched
                        ? 'Forensic Source Attribution Confirmed'
                        : 'No Tracked Canary Matched'}
                    </span>
                    {leakAnalysis.inferredVendorTag && (
                      <span className="text-rose-300 font-mono text-[11px]">
                        Tag: {leakAnalysis.inferredVendorTag}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 leading-relaxed">{leakAnalysis.explanation}</p>

                  {leakAnalysis.matchedRecord && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleFlagCanaryLeaked(leakAnalysis.matchedRecord!)
                        }
                        className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold cursor-pointer whitespace-nowrap"
                      >
                        Flag {leakAnalysis.matchedRecord.vendorName} &amp; Generate CCPA § 1798.115 Audit Demand
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* CCPA 1798.115 Demand Drawer */}
              {selectedLeakRecord && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      CCPA § 1798.115 Third-Party Buyer Audit &amp; Deletion Notice →{' '}
                      {selectedLeakRecord.vendorName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedLeakRecord(null)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={6}
                    value={
                      buildVendorLeakAuditDemand(
                        selectedLeakRecord,
                        profile,
                        activeConnectedEmail || profile.emails[0]
                      ).body
                    }
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-200"
                  />
                  {leakSendMsg && (
                    <div className="text-emerald-300 font-mono text-[11px]">{leakSendMsg}</div>
                  )}
                  {leakSendErr && (
                    <div className="text-rose-300 font-mono text-[11px]">{leakSendErr}</div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const d = buildVendorLeakAuditDemand(
                          selectedLeakRecord,
                          profile,
                          activeConnectedEmail || profile.emails[0]
                        );
                        handleCopy('leak-demand', `${d.subject}\n\n${d.body}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'leak-demand' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy Audit Demand</span>
                    </button>

                    {isDirectSendConnected ? (
                      <button
                        type="button"
                        disabled={isSendingLeakDemand}
                        onClick={handleSendVendorLeakDemand}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {isSendingLeakDemand
                            ? 'Sending...'
                            : `Send to ${selectedLeakRecord.vendorPrivacyEmail}`}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenConnectEmail}
                        className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold cursor-pointer"
                      >
                        Connect Email to Send
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Canary Ledger Table */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white">
                Issued Canary Compartments ({canaryAliases.length})
              </h3>
              <div className="flex items-center gap-2 max-w-xs w-full">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={canarySearch}
                  onChange={(e) => setCanarySearch(e.target.value)}
                  placeholder="Filter vendors or aliases..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>

            {filteredCanaries.length === 0 ? (
              <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-400">
                No canary aliases issued yet. Mint your first vendor-scoped canary above before filling out retail loyalty or broker forms.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400">
                      <th className="py-2.5 px-3">Vendor</th>
                      <th className="py-2.5 px-3">Canary Alias</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredCanaries.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-950/60">
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{rec.vendorName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {rec.vendorDomain}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-300">
                          {rec.aliasEmail}
                          {rec.compartmentPhone && (
                            <div className="text-[10px] text-slate-400">
                              VoIP: {rec.compartmentPhone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-300">{rec.category}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-mono text-[11px] font-medium ${
                              rec.status === 'leak_detected'
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {rec.status === 'leak_detected' ? 'Leak Detected' : 'Clean · Active'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(rec.id, rec.aliasEmail)}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              {copiedKey === rec.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedLeakRecord(rec)}
                              className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-300 font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Audit Notice
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateCanaryAliases(
                                  canaryAliases.filter((c) => c.id !== rec.id)
                                )
                              }
                              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                              title="Remove Canary"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUBTAB 3: REDACTED ID WATERMARKER, EXIF STRIPPER & URL SCRUBBER     */}
      {/* =================================================================== */}
      {subTab === 'hygiene' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Client-Side ID Redaction, Watermark & Binary EXIF Stripper */}
          <div className="lg:col-span-7 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white">
                  Zero-Upload ID Redactor, Forensic Watermarker &amp; EXIF/GPS Stripper
                </h2>
                <p className="text-slate-400 text-[11px]">
                  When an FCRA bureau (e.g. LexisNexis or ChexSystems) requires ID proof, drag across the canvas below to black out DL numbers/barcodes, stamp a single-recipient watermark, and strip hidden GPS/EXIF headers locally.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSyntheticSampleWithExif}
                className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                Load Test EXIF+GPS Sample
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Load Local JPEG / PNG Document (Never Uploaded)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleImageUpload}
                  className="block w-full text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Target Recipient for Forensic Watermark
                </label>
                <input
                  type="text"
                  value={watermarkRecipient}
                  onChange={(e) => setWatermarkRecipient(e.target.value)}
                  placeholder="e.g. LexisNexis Freeze Verification"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Binary EXIF/GPS Inspection Telemetry */}
            {metadataReport && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 tabular-nums">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="text-white font-bold">
                    Binary Format: {metadataReport.format} · Removed {metadataReport.bytesRemoved} Bytes of Metadata
                  </span>
                  <span
                    className={
                      metadataReport.hadGps || metadataReport.hadExif
                        ? 'text-amber-300 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {metadataReport.hadGps
                      ? 'EMBEDDED GPS + EXIF PURGED'
                      : metadataReport.hadExif || metadataReport.hadXmp
                      ? 'EXIF / XMP METADATA PURGED'
                      : 'NO EMBEDDED EXIF/GPS FOUND'}
                  </span>
                </div>
                {metadataReport.strippedSegments.length > 0 && (
                  <div className="text-[11px] font-mono text-slate-400">
                    Stripped Segments: {metadataReport.strippedSegments.join(' · ')}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Blackout & Watermark Canvas */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableWatermark}
                    onChange={(e) => setEnableWatermark(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                  />
                  <span>Overlay Diagonal Anti-Resale Watermark</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={redactionBoxes.length === 0}
                    onClick={() => setRedactionBoxes((prev) => prev.slice(0, -1))}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Undo Box</span>
                  </button>
                  <button
                    type="button"
                    disabled={redactionBoxes.length === 0}
                    onClick={() => setRedactionBoxes([])}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-slate-300 cursor-pointer"
                  >
                    Clear Boxes ({redactionBoxes.length})
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2 overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={580}
                  height={250}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="w-full h-auto rounded-lg cursor-crosshair select-none"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Click and drag anywhere on the preview above to draw irreversible solid black redaction bars.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleDownloadSanitizedPng}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Download Redacted &amp; Watermarked PNG (Zero EXIF)</span>
              </button>

              {metadataReport && metadataReport.format !== 'UNSUPPORTED' && (
                <button
                  type="button"
                  onClick={handleDownloadBinaryStrippedOriginal}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Download Lossless EXIF-Stripped {metadataReport.format}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Tracking Parameter URL Sanitizer */}
          <div className="lg:col-span-5 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px]">
                <Link2 className="w-3.5 h-3.5" />
                <span>URL Beacon &amp; Click-ID Scrubber</span>
              </div>
              <h2 className="text-base font-bold text-white">
                Opt-Out &amp; Confirmation Link Sanitizer
              </h2>
              <p className="text-slate-400 text-[11px]">
                Strips `utm_*`, `fbclid`, `gclid`, `mc_eid`, `mkt_tok`, `_hsenc`, and ad-exchange click identifiers while preserving required verification tokens.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-300">
                Paste Raw URL
              </label>
              <textarea
                rows={4}
                value={rawUrlInput}
                onChange={(e) => setRawUrlInput(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500 resize-y"
              />
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-slate-400">Sanitized Output</span>
                <span className="text-amber-300 tabular-nums">
                  {sanitizedUrlReport.strippedParams.length} tracker(s) removed
                </span>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg font-mono text-emerald-300 break-all text-[11px]">
                {sanitizedUrlReport.sanitizedUrl}
              </div>
              {sanitizedUrlReport.strippedParams.length > 0 && (
                <div className="text-[11px] font-mono text-slate-400">
                  Removed: {sanitizedUrlReport.strippedParams.join(', ')}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopy('clean-url', sanitizedUrlReport.sanitizedUrl)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'clean-url' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'clean-url' ? 'Copied Clean URL' : 'Copy Clean URL'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
