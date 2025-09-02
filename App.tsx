import React, { useState, useEffect, useRef } from 'react';
import type { CVData } from './types';
import { EnvelopeIcon } from './components/icons/EnvelopeIcon';
import { PhoneIcon } from './components/icons/PhoneIcon';
import { LinkIcon } from './components/icons/LinkIcon';
import { GithubIcon } from './components/icons/GithubIcon';
import { DownloadIcon } from './components/icons/DownloadIcon';
import { ShareIcon } from './components/icons/ShareIcon';
import { ClipboardIcon } from './components/icons/ClipboardIcon';


// These are loaded from CDN in index.html
// Deterministic PDF config constants
const PDF_CONFIG = {
  PAGE_WIDTH_MM: 210,
  PAGE_HEIGHT_MM: 297,
  PAGE_MARGIN_MM: 15,
  PRINTABLE_WIDTH_MM: 180,
  BASE_FONT_PT: 10,
  SHRINK_FACTOR: 0.8, // smaller PDF overall
  HTML2CANVAS_SCALE: 2, // internal bitmap sharpness (keep constant for consistency)
};

declare const jspdf: any;
declare const QRCode: any;
declare const html2canvas: any;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-8 pdf-section-break">
    <h2 className="text-xl font-bold border-b border-black pb-1 mb-4">{title}</h2>
    {children}
  </section>
);

const App: React.FC = () => {
  // Edition & version parsing from URL
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const editionMatch = path.match(/(?:^|\/)e\/([^\/]+)(?:\/(?:v\/([A-Za-z0-9]{4,10}))?)?/);
  const rootVersionMatch = !editionMatch ? path.match(/(?:^|\/)v\/([A-Za-z0-9]{4,10})/) : null;
  const initialEdition = editionMatch ? decodeURIComponent(editionMatch[1]) : null;
  const providedVersionFromUrl = editionMatch ? editionMatch[2] || null : (rootVersionMatch ? rootVersionMatch[1] : null);

  const [edition, setEdition] = useState<string | null>(initialEdition);
  const [versionHash, setVersionHash] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<'unknown'|'match'|'mismatch'>('unknown');
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadTooltipVisible, setIsDownloadTooltipVisible] = useState(false);
  const [isShareBoxVisible, setIsShareBoxVisible] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [showVersionToast, setShowVersionToast] = useState(false);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);
  const previousQrUrlRef = useRef<string | null>(null);

  // Compute share URL once we know versionHash
  const configuredBaseOrigin = 'https://cv.hapangama.com';
  const runtimeOrigin = (typeof window !== 'undefined') ? window.location.origin : configuredBaseOrigin;
  // Always use canonical domain for share/QR so printed / shared links resolve to production
  const baseOrigin = configuredBaseOrigin || runtimeOrigin;
  const shareUrl = versionHash ? (
    edition ? `${baseOrigin}/e/${encodeURIComponent(edition)}/v/${versionHash}` : `${baseOrigin}/v/${versionHash}`
  ) : (edition ? `${baseOrigin}/e/${encodeURIComponent(edition)}` : baseOrigin);

  // Hash generator (stable deterministic 6-char uppercase base36)
  const computeVersionHash = (data: any) => {
    const json = JSON.stringify(data);
    let hash = 5381;
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash) ^ json.charCodeAt(i);
    }
    hash = hash >>> 0; // unsigned
    const base36 = hash.toString(36).toUpperCase();
    return base36.padStart(6, '0').slice(-6);
  };

  // Load CV data with edition fallback
  useEffect(() => {
    const load = async () => {
      const fileForEdition = edition ? `/cv-data-${edition}.json` : '/cv-data.json';
      try {
        let response = await fetch(fileForEdition);
        if (!response.ok) {
          if (edition) {
            // fallback to base file
            response = await fetch('/cv-data.json');
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            setEdition(null);
            try { window.history.replaceState({}, '', `/${providedVersionFromUrl ? 'v/' + providedVersionFromUrl : ''}`); } catch(_) {}
          } else {
            throw new Error(`HTTP error ${response.status}`);
          }
        }
        const data = await response.json();
        setCvData(data as CVData);
        const vHash = computeVersionHash(data);
        setVersionHash(vHash);
      } catch (e:any) {
        console.error('Failed to fetch CV data:', e);
        setError('Failed to load CV data.');
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition]);

  // Generate / update QR code when share box visible or shareUrl changes
  useEffect(() => {
    if (!isShareBoxVisible) return;
    if (!qrCodeRef.current) return;
    if (previousQrUrlRef.current === shareUrl) return;
    // Reset container
    qrCodeRef.current.innerHTML = '';
    qrCodeInstanceRef.current = new QRCode(qrCodeRef.current, {
      text: shareUrl,
      width: 80,
      height: 80,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    previousQrUrlRef.current = shareUrl;
  }, [isShareBoxVisible, shareUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CV' + (edition ? ` (${edition})` : ''),
            text: 'Latest online CV version' + (versionHash ? ` (v${versionHash})` : ''),
          url: shareUrl
        });
        return true;
      } catch (e) {
        console.warn('Native share canceled or failed', e);
        return false;
      }
    }
    return false;
  };

  const handleShareButtonClick = async () => {
    const usedNative = await handleNativeShare();
    if (!usedNative) {
      // fallback to existing hover box toggle
      setIsShareBoxVisible(v => !v);
    }
  };

  const handleDownloadPdf = async () => {
    const cvElement = document.getElementById('cv-content');
    if (!cvElement) return;

    // Helper: embed custom font (Inter Regular) into jsPDF before rendering
    const ensurePdfFont = async (doc: any) => {
      try {
        const fontFamily = 'Inter';
        const fontFileName = 'Inter-Regular.ttf';
        // If already added skip
        if (doc.getFontList?.()[fontFamily]?.includes('normal')) {
          doc.setFont(fontFamily, 'normal');
          return;
        }
        // Fetch local TTF (place Inter-Regular.ttf at project root or adjust path)
        const fontUrl = '/Inter-Regular.ttf';
        const resp = await fetch(fontUrl, { cache: 'force-cache' });
        if (!resp.ok) throw new Error('Font fetch failed ' + resp.status);
        const buffer = await resp.arrayBuffer();
        // Convert ArrayBuffer -> Base64 efficiently in chunks to avoid stack issues
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        const base64 = btoa(binary);
        doc.addFileToVFS(fontFileName, base64);
        doc.addFont(fontFileName, fontFamily, 'normal');
        doc.setFont(fontFamily, 'normal');
      } catch (e) {
        console.warn('Custom font embedding failed, falling back to Times.', e);
        try { doc.setFont('Times', 'normal'); } catch(_) {}
      }
    };

    // Ensure profile image (if present) is loaded before rendering PDF to avoid it missing
    const waitForImage = () => new Promise<void>(resolve => {
      const img = document.getElementById('profile-photo') as HTMLImageElement | null;
      if (!img) return resolve();
      if (img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    await waitForImage();

    setIsDownloading(true);

    // NATURAL dimensions BEFORE any PDF temp styles
    const naturalWidthPx = Math.ceil(cvElement.getBoundingClientRect().width);

    // Create a hidden clone with fixed printable width (180mm) to avoid scaling distortions
    const PRINTABLE_WIDTH_MM = PDF_CONFIG.PRINTABLE_WIDTH_MM;
    const MM_TO_PX = 96 / 25.4; // ≈3.7795
    const cloneWidthPx = Math.round(PRINTABLE_WIDTH_MM * MM_TO_PX);
    const clone = cvElement.cloneNode(true) as HTMLElement;
    clone.id = 'cv-pdf-clone';
    clone.style.width = cloneWidthPx + 'px';
    clone.style.maxWidth = cloneWidthPx + 'px';
    clone.style.position = 'absolute';
    clone.style.left = '-10000px';
    clone.style.top = '0';
    clone.style.background = '#ffffff';
    const shrink = PDF_CONFIG.SHRINK_FACTOR;
    // Remove interactive / hidden elements inside clone
    clone.querySelectorAll('.floating-actions, #pdf-download-button, .version-toast').forEach(el => el.remove());

    // Append footer to clone instead of live element
    const footer = document.createElement('div');
    footer.id = 'print-footer';
    const generatedDate = new Date().toISOString().split('T')[0];
    footer.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px; border-top:1px solid #000; padding-top:8px; font-size:10pt;">
        <div id="print-footer-qr" style="width:80px;height:80px;"></div>
        <div style="flex:1; line-height:1.4;">
          <strong>View Online:</strong> <span>${shareUrl}</span><br/>
          <span>Scan the QR code to view the always up-to-date web version.</span><br/>
          <span>Edition: ${edition ? edition : 'base'} | Version: ${versionHash || '-'} | Generated: ${generatedDate}</span>
        </div>
      </div>`;
    clone.appendChild(footer);
    document.body.appendChild(clone);
    try { new QRCode(clone.querySelector('#print-footer-qr'), { text: shareUrl, width: 80, height: 80, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.H }); } catch(_){ }

    const style = document.createElement('style');
    style.id = 'temp-pdf-styles';
    style.innerHTML = `
      @font-face { font-family: 'Inter'; src: url('/Inter-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; }
      #cv-pdf-clone { font-size:${PDF_CONFIG.BASE_FONT_PT * shrink}pt !important; line-height:1.2 !important; color:#000 !important; font-family: 'Inter','Times New Roman',Times,serif !important; padding:${9 * shrink}mm !important; box-sizing:border-box; }
      #cv-pdf-clone * { color:#000 !important; background:transparent !important; font-family:inherit !important; box-shadow:none !important; }
      /* Reduced top padding & header bottom margin to tighten header vertical space */
      #cv-pdf-clone { padding-top:${3 * shrink}mm !important; }
      #cv-pdf-clone header { margin-top:0 !important; }
      #cv-pdf-clone header.mb-10 { margin-bottom:${16 * shrink}px !important; }
      #cv-pdf-clone h1 { font-size:${(PDF_CONFIG.BASE_FONT_PT * 2.4 * shrink).toFixed(2)}pt !important; margin-top:0 !important; }
      #cv-pdf-clone h2 { font-size:${(PDF_CONFIG.BASE_FONT_PT * 1.5 * shrink).toFixed(2)}pt !important; padding-bottom:${5 * shrink}px !important; margin-bottom:${8 * shrink}px !important; border-bottom:1px solid #000 !important; }
      #cv-pdf-clone h3 { font-size:${(PDF_CONFIG.BASE_FONT_PT * 1.18 * shrink).toFixed(2)}pt !important; }
      #cv-pdf-clone a { text-decoration:none !important; }
      #cv-pdf-clone .pdf-section-break { page-break-inside:auto !important; }
      #cv-pdf-clone h1, #cv-pdf-clone h2, #cv-pdf-clone h3, #cv-pdf-clone h4, #cv-pdf-clone h5, #cv-pdf-clone h6 { page-break-after:avoid !important; }
      #cv-pdf-clone #profile-photo { border:${2 * shrink}px solid #000 !important; width:${(100 * shrink).toFixed(0)}px !important; height:${(100 * shrink).toFixed(0)}px !important; }
      #cv-pdf-clone section.pdf-section-break { margin-bottom:${14 * shrink}px !important; }
      #cv-pdf-clone ul { padding-left:${14 * shrink}px !important; margin-top:${4 * shrink}px !important; }
      #cv-pdf-clone li { margin-bottom:${1 * shrink}px !important; }
      #cv-pdf-clone .space-y-6 > * + * { margin-top:${16 * shrink}px !important; }
      #cv-pdf-clone .space-y-4 > * + * { margin-top:${10 * shrink}px !important; }
      #cv-pdf-clone .text-base, #cv-pdf-clone .text-sm { font-size:${(PDF_CONFIG.BASE_FONT_PT * shrink).toFixed(2)}pt !important; }
      #cv-pdf-clone .skill-chip { padding:${1 * shrink}px ${6 * shrink}px !important; line-height:1.1 !important; }
      #cv-pdf-clone .contact-links { display:flex !important; flex-wrap:nowrap !important; gap:${5*shrink}px !important; align-items:center !important; font-size:${(PDF_CONFIG.BASE_FONT_PT * 0.85 * shrink).toFixed(2)}pt !important; }
      #cv-pdf-clone .contact-links a { white-space:nowrap !important; }
      #cv-pdf-clone .contact-links span.hidden { display:inline !important; }
      #cv-pdf-clone div.flex.items-center.gap-4.mt-1.flex-wrap { gap:${3*shrink}px !important; margin-top:${1*shrink}px !important; }
      #cv-pdf-clone div.flex.items-center.gap-4.mt-1.flex-wrap a { display:inline-flex !important; width:auto !important; margin-top:0 !important; word-break:break-all !important; }
      #cv-pdf-clone a[data-full-url] span { word-break:break-all !important; }
      #cv-pdf-clone div.flex.items-center.gap-4.mt-1.flex-wrap p { margin:0 !important; }
    `;
    document.head.appendChild(style);

    // PDF-only DOM transformations
    try {
      const contactContainer = clone.querySelector('.contact-links');
      if (contactContainer) {
        contactContainer.querySelectorAll('span.hidden').forEach(s => { (s as HTMLElement).style.display = 'inline'; });
      }
      // Expand certificate URLs to full form using data attribute
      clone.querySelectorAll('a[data-full-url]').forEach(a => {
        const full = a.getAttribute('data-full-url');
        if (full) {
          const span = a.querySelector('span');
            if (span) span.textContent = full;
        }
      });
      // Remove icons
      clone.querySelectorAll('.cv-icon').forEach(el => el.remove());
    } catch(_) {}

    try {
      const { jsPDF } = jspdf;
      const marginMm = PDF_CONFIG.PAGE_MARGIN_MM; // uniform margins
      const pageWidthMm = PDF_CONFIG.PAGE_WIDTH_MM;
      const pageHeightMm = PDF_CONFIG.PAGE_HEIGHT_MM;
      const printableWidthMm = PRINTABLE_WIDTH_MM; // already defined
      const printableHeightMm = pageHeightMm - marginMm * 2; // 297 - 30 = 267

      // Snapshot clone to canvas
      const canvas = await html2canvas(clone, {
        backgroundColor: '#ffffff',
        scale: PDF_CONFIG.HTML2CANVAS_SCALE,
        useCORS: true,
        logging: false,
        windowWidth: cloneWidthPx
      });

      const imgWidthPx = canvas.width; // equals cloneWidthPx * scale
      const imgHeightPx = canvas.height;

      // Conversion factors
      const pxPerMm = imgWidthPx / printableWidthMm; // derived so width fits exactly into printable area
      const pageHeightPx = printableHeightMm * pxPerMm;

      const totalPages = Math.ceil(imgHeightPx / pageHeightPx);
      console.log('[PDF] canvas', { imgWidthPx, imgHeightPx, printableWidthMm, printableHeightMm, pxPerMm, pageHeightPx, totalPages });

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();
        const sx = 0;
        const sy = Math.floor(page * pageHeightPx);
        const sHeight = Math.min(pageHeightPx, imgHeightPx - sy);

        // Create a temporary page slice canvas
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidthPx;
        pageCanvas.height = sHeight;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) ctx.drawImage(canvas, sx, sy, imgWidthPx, sHeight, 0, 0, imgWidthPx, sHeight);

        const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
        const renderHeightMm = (sHeight / pxPerMm);
        doc.addImage(imgData, 'JPEG', marginMm, marginMm, printableWidthMm, renderHeightMm);
      }

      doc.save('Kasun_Hapangama_CV.pdf');

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Sorry, there was an error creating the PDF. Please try again.');
    } finally {
      const tempStyle = document.getElementById('temp-pdf-styles');
      if (tempStyle) document.head.removeChild(tempStyle);
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
      setIsDownloading(false);
    }
  };


  const formatUrl = (url: string) => {
    try {
      const urlObject = new URL(url);
      return urlObject.hostname + (urlObject.pathname === '/' ? '' : urlObject.pathname);
    } catch (e) {
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }

  // Update versionStatus based on providedVersionFromUrl and versionHash
  useEffect(() => {
    if (versionStatus === 'unknown' && providedVersionFromUrl && versionHash) {
      setVersionStatus(providedVersionFromUrl === versionHash ? 'match' : 'mismatch');
    }
  }, [versionStatus, providedVersionFromUrl, versionHash]);

  // Trigger transient toast when a version param is present and status resolved
  useEffect(() => {
    if (providedVersionFromUrl && versionStatus !== 'unknown') {
      setShowVersionToast(true);
      const timer = setTimeout(() => setShowVersionToast(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [providedVersionFromUrl, versionStatus]);

  if (error) {
     return (
      <div className="bg-gray-100 min-h-screen font-serif text-black">
        <main className="max-w-4xl mx-auto bg-white shadow-2xl p-8 sm:p-12 md:p-16 my-8">
          <p className="text-center text-red-500">{error}</p>
        </main>
      </div>
    );
  }

  if (!cvData) {
    return (
      <div className="bg-gray-100 min-h-screen font-serif text-black">
        <main className="max-w-4xl mx-auto bg-white shadow-2xl p-8 sm:p-12 md:p-16 my-8">
          <p className="text-center">Loading...</p>
        </main>
      </div>
    );
  }

  const { profile, summary, skills, experience, projects, education, certificates, organizations } = cvData;

  return (
    <div className="bg-white min-h-screen font-serif text-black">
      <main id="cv-content" className="max-w-4xl mx-auto bg-white shadow-2xl p-8 sm:p-12 md:p-16 pb-32">
        {/* Version Banner removed per request */}

        {/* Header */}
        <header className="mb-10 pdf-section-break">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <img
              id="profile-photo"
              src="/profile.jpg"
              alt={`${profile.name} profile photo`}
              className="w-28 h-28 object-cover rounded-full border-2 border-black shadow-sm"
              loading="eager"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.fallbackTried) {
                  img.dataset.fallbackTried = '1';
                  img.src = 'profile.jpg'; // try relative as fallback
                } else {
                  img.style.display = 'none';
                }
              }}
            />
            <div className="text-center sm:text-left flex-1">
              <h1 className="text-4xl font-bold tracking-wider">{profile.name}</h1>
              <p className="text-lg mt-1">{profile.title}</p>
              <div className="flex justify-center sm:justify-start items-center gap-x-4 gap-y-2 mt-4 text-sm flex-wrap contact-links">
                <a href={`mailto:${profile.email}`} className="flex items-center gap-1.5 hover:underline">
                  <EnvelopeIcon className="w-4 h-4 cv-icon" /> {profile.email}
                </a>
                <span className="hidden sm:inline">|</span>
                <a href={`tel:${profile.phone}`} className="flex items-center gap-1.5 hover:underline">
                  <PhoneIcon className="w-4 h-4 cv-icon" /> {profile.phone}
                </a>
                <span className="hidden sm:inline">|</span>
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:underline">
                  <LinkIcon className="w-4 h-4 cv-icon" /> {profile.website.replace('https://', '')}
                </a>
                {profile.socials.map(social => (
                  <React.Fragment key={social.name}>
                    <span className="hidden sm:inline">|</span>
                    <a href={social.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:underline">
                      <GithubIcon className="w-4 h-4 cv-icon" /> {social.username}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Summary */}
        <Section title="Summary">
          <p className="text-base leading-relaxed">{summary}</p>
        </Section>

        {/* Skills */}
        <Section title="Skills">
          <div className="flex flex-wrap gap-2">
            {skills.map(skill => (
              <span key={skill} className="bg-gray-200 text-gray-800 text-sm font-medium px-2.5 py-1 rounded skill-chip">
                {skill}
              </span>
            ))}
          </div>
        </Section>

        {/* Experience */}
        <Section title="Experience">
          <div className="space-y-6">
            {experience.map((job, index) => (
              <div key={index} className="pdf-section-break">
                <div className="flex justify-between items-start flex-wrap gap-x-2 exp-header">
                    <div>
                        <h3 className="font-bold text-base">{job.role}</h3>
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm italic hover:underline company-link">
                            {job.company}
                        </a>
                    </div>
                    <div className="text-left sm:text-right mt-1 sm:mt-0">
                        <p className="text-sm font-light">{job.period}</p>
                        <p className="text-sm font-light">{job.location}</p>
                    </div>
                </div>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm leading-relaxed">
                  {job.tasks.map((task, i) => <li key={i}>{task}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Projects */}
        <Section title="Projects">
            <div className="space-y-6">
                {projects.map((project, index) => (
                    <div key={index} className="pdf-section-break">
                        <div className="flex justify-between items-baseline flex-wrap gap-x-2 project-header">
                            <h3 className="font-bold text-base">{project.name}</h3>
                            {project.revenue && <p className="text-sm font-light bg-gray-200 px-2 py-0.5 rounded">{project.revenue}</p>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                            <p className="text-sm italic">{project.description}</p>
                             <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:underline flex items-center gap-1.5 max-w-full break-all whitespace-normal w-full sm:w-auto">
                                <LinkIcon className="w-3.5 h-3.5 cv-icon" />
                                <span className="break-all max-w-full leading-snug sm:leading-normal">{formatUrl(project.url)}</span>
                            </a>
                        </div>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm leading-relaxed">
                            {project.details.map((detail, i) => <li key={i}>{detail}</li>)}
                        </ul>
                    </div>
                ))}
            </div>
        </Section>
        
        {/* Education */}
        <Section title="Education">
          <div className="space-y-4">
            {education.map((edu, index) => (
              <div key={index} className="pdf-section-break">
                 <div className="flex justify-between items-baseline flex-wrap edu-header">
                    <h3 className="font-bold text-base">{edu.degree}</h3>
                    {edu.gpa && <p className="text-sm font-light">{edu.gpa}</p>}
                </div>
                 <a href={edu.url} target="_blank" rel="noopener noreferrer" className="text-sm italic hover:underline institution-link">
                  {edu.institution}
                </a>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm leading-relaxed">
                    {edu.details.map((detail, i) => <li key={i}>{detail}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Certificates */}
        <Section title="Certificates">
          <div className="space-y-4">
            {certificates.map((cert, index) => (
               <div key={index} className="pdf-section-break">
                <h3 className="font-bold text-base">{cert.name}</h3>
                 <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <p className="text-sm italic">{cert.issuer}</p>
                     {cert.url && cert.url !== '#' && (
                        <a href={cert.url} data-full-url={cert.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:underline flex items-center gap-1.5 max-w-full break-all whitespace-normal w-full sm:w-auto">
                            <LinkIcon className="w-3.5 h-3.5 cv-icon" />
                            <span className="break-all max-w-full leading-snug sm:leading-normal">{formatUrl(cert.url)}</span>
                        </a>
                    )}
                </div>
                <ul className="list-disc list-inside mt-1 space-y-1 text-sm leading-relaxed">
                    {cert.details.map((detail, i) => <li key={i}>{detail}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Professional Affiliations */}
        <Section title="Professional Affiliations">
          <div className="space-y-4">
            {organizations.map((org, index) => (
              <div key={index} className="pdf-section-break">
                <div className="flex justify-between items-baseline flex-wrap gap-x-2">
                  <h3 className="font-bold text-base">{org.name}</h3>
                  <p className="text-sm font-light">{org.period}</p>
                </div>
                <p className="text-sm italic">{org.role}</p>
                {org.description && <p className="text-sm mt-1 leading-relaxed">{org.description}</p>}
              </div>
            ))}
          </div>
        </Section>

      </main>

      {/* Floating Action Buttons */}
      <div className="floating-actions fixed bottom-4 right-4 sm:bottom-8 sm:right-8 flex flex-col items-end gap-4 z-50">
        {/* Share Button with expanding Box */}
        <div 
            className="relative"
            onMouseEnter={() => setIsShareBoxVisible(true)}
            onMouseLeave={() => setIsShareBoxVisible(false)}
        >
            <div 
                className={`absolute bottom-0 right-full mr-4 w-80 p-4 bg-white border border-gray-200 rounded-lg shadow-xl transition-all duration-300 origin-right ${isShareBoxVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}
            >
                <p className="font-bold text-sm mb-2">Share Link</p>
                <div className="flex gap-4 items-start">
                  <div className="flex-grow">
                    <div className="flex items-center">
                      <input type="text" readOnly value={shareUrl} className="text-xs p-1.5 border rounded-l-md bg-gray-100 flex-grow" />
                      <button onClick={handleCopyLink} className="p-1.5 border border-l-0 rounded-r-md bg-gray-200 hover:bg-gray-300" aria-label="Copy link">
                        {isLinkCopied ? (
                          <span className="text-green-600 font-bold text-[10px] px-1">Copied!</span>
                        ) : (
                          <ClipboardIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2 leading-snug">Scan or copy to view the always up-to-date online CV.</p>
                  </div>
                  <div ref={qrCodeRef} id="qr-code-container" className="p-1 bg-white border rounded w-[88px] h-[88px] flex items-center justify-center overflow-hidden"></div>
                </div>
            </div>
            <button
                className="bg-black text-white p-4 rounded-full shadow-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-transform transform hover:scale-105 z-10"
                aria-label="Share CV"
                onClick={handleShareButtonClick}
            >
                <ShareIcon className="w-6 h-6" />
            </button>
        </div>

        {/* Download Button with Tooltip */}
        <div
            className="relative flex items-center"
            onMouseEnter={() => setIsDownloadTooltipVisible(true)}
            onMouseLeave={() => setIsDownloadTooltipVisible(false)}
        >
            <div className={`absolute right-full mr-4 p-2 bg-black text-white text-xs whitespace-nowrap rounded-md shadow-lg transition-all duration-300 ${isDownloadTooltipVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                You can download the CV from here
                <div className="absolute top-1/2 -right-2 transform -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8 border-l-black"></div>
            </div>
            <button
                id="pdf-download-button"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="bg-black text-white p-4 rounded-full shadow-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-transform transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed z-10"
                aria-label="Download CV as PDF"
            >
                {isDownloading ? (
                    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <DownloadIcon className="w-6 h-6" />
                )}
            </button>
        </div>

      </div>

      {/* Version Toast (hidden in PDF) */}
      {showVersionToast && (
        <div className={`version-toast-pointer fixed top-4 right-4 z-50 max-w-sm ${versionStatus === 'match' ? 'bg-green-600' : 'bg-yellow-600'} text-white shadow-lg rounded-md p-4 flex items-start gap-3`}>
          <div className="flex-1 text-sm leading-snug">
            {versionStatus === 'match' && (
              <>This CV (v{providedVersionFromUrl}) is up to date.</>
            )}
            {versionStatus === 'mismatch' && (
              <>Paper CV version v{providedVersionFromUrl} is outdated. Latest is v{versionHash}. Use the web version for the newest details.</>
            )}
          </div>
          <button aria-label="Close version notice" className="text-white/80 hover:text-white text-xs font-bold" onClick={() => setShowVersionToast(false)}>✕</button>
        </div>
      )}

    </div>
  );
};

export default App;
