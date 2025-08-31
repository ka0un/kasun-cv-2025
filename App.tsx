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
declare const jspdf: any;
declare const QRCode: any;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-8 pdf-section-break">
    <h2 className="text-xl font-bold border-b border-black pb-1 mb-4">{title}</h2>
    {children}
  </section>
);

const App: React.FC = () => {
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadTooltipVisible, setIsDownloadTooltipVisible] = useState(false);
  const [isShareBoxVisible, setIsShareBoxVisible] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const qrCodeInstanceRef = useRef<any>(null);
  const shareUrl = "https://cv.hapangama.com";


  useEffect(() => {
    fetch('./cv-data.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setCvData(data as CVData))
      .catch(e => {
        console.error("Failed to fetch CV data:", e);
        setError("Failed to load CV data. Please check the console for more details.");
      });
  }, []);
  
  // Generate QR Code only when the share box is visible
  useEffect(() => {
    if (isShareBoxVisible && qrCodeRef.current && !qrCodeInstanceRef.current) {
      qrCodeInstanceRef.current = new QRCode(qrCodeRef.current, {
        text: shareUrl,
        width: 80,
        height: 80,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }, [isShareBoxVisible, shareUrl]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000); // Reset after 2 seconds
    }).catch(err => {
      console.error('Failed to copy link: ', err);
    });
  };

  const handleDownloadPdf = async () => {
    const cvElement = document.getElementById('cv-content');
    if (!cvElement) return;

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

    const style = document.createElement('style');
    style.id = 'temp-pdf-styles';
    style.innerHTML = `
      @media print { html, body { height: initial !important; overflow: initial !important; -webkit-print-color-adjust: exact; } }
      #cv-content { box-shadow: none !important; margin: 0 !important; padding: 10mm !important; font-size: 10pt !important; color: black !important; width: 100% !important; }
      #cv-content * { color: black !important; border-color: black !important; background-color: transparent !important; }
      .cv-icon, #pdf-download-button, .floating-actions { display: none !important; }
      .pdf-section-break { page-break-inside: avoid !important; }
      h1, h2, h3, h4, h5, h6 { page-break-after: avoid !important; }
      a { text-decoration: none !important; }
      .bg-gray-200 { background-color: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #print-footer { page-break-inside: avoid !important; margin-top: 16px; }
      #profile-photo { border: 2px solid #000 !important; }
    `;
    document.head.appendChild(style);

    // Add footer with QR code + link for PDF/print
    const footer = document.createElement('div');
    footer.id = 'print-footer';
    footer.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px; border-top:1px solid #000; padding-top:8px; font-size:10pt;">
        <div id="print-footer-qr" style="width:80px;height:80px;"></div>
        <div style="flex:1; line-height:1.4;">
          <strong>View Online:</strong> <span>${shareUrl}</span><br/>
          <span>Scan the QR code to view the always up-to-date web version.</span>
        </div>
      </div>`;
    cvElement.appendChild(footer);
    try {
      new QRCode(document.getElementById('print-footer-qr'), { text: shareUrl, width: 80, height: 80, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    } catch (e) {
      console.warn('QR generation failed for footer', e);
    }

    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      await doc.html(cvElement, {
        callback: function (doc: any) { doc.save('Kasun_Hapangama_CV.pdf'); },
        margin: [15, 15, 15, 15],
        autoPaging: 'text',
        width: 178,
        windowWidth: 800,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Sorry, there was an error creating the PDF. Please try again.');
    } finally {
      const tempStyle = document.getElementById('temp-pdf-styles');
      if (tempStyle) document.head.removeChild(tempStyle);
      const footerEl = document.getElementById('print-footer');
      if (footerEl && footerEl.parentNode) footerEl.parentNode.removeChild(footerEl);
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
        {/* Header */}
        <header className="mb-10 pdf-section-break">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <img
              id="profile-photo"
              src="profile.jpg"
              alt={`${profile.name} profile photo`}
              className="w-28 h-28 object-cover rounded-full border-2 border-black shadow-sm"
              loading="eager"
            />
            <div className="text-center sm:text-left flex-1">
              <h1 className="text-4xl font-bold tracking-wider">{profile.name}</h1>
              <p className="text-lg mt-1">{profile.title}</p>
              <div className="flex justify-center sm:justify-start items-center gap-x-4 gap-y-2 mt-4 text-sm flex-wrap">
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
              <span key={skill} className="bg-gray-200 text-gray-800 text-sm font-medium px-2.5 py-1 rounded">
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
                <div className="flex justify-between items-start flex-wrap gap-x-2">
                    <div>
                        <h3 className="font-bold text-base">{job.role}</h3>
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-sm italic hover:underline">
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
                        <div className="flex justify-between items-baseline flex-wrap gap-x-2">
                            <h3 className="font-bold text-base">{project.name}</h3>
                            {project.revenue && <p className="text-sm font-light bg-gray-200 px-2 py-0.5 rounded">{project.revenue}</p>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                            <p className="text-sm italic">{project.description}</p>
                             <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:underline flex items-center gap-1.5">
                                <LinkIcon className="w-3.5 h-3.5 cv-icon" />
                                <span>{formatUrl(project.url)}</span>
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
                 <div className="flex justify-between items-baseline flex-wrap">
                    <h3 className="font-bold text-base">{edu.degree}</h3>
                    {edu.gpa && <p className="text-sm font-light">{edu.gpa}</p>}
                </div>
                 <a href={edu.url} target="_blank" rel="noopener noreferrer" className="text-sm italic hover:underline">
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
                        <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-600 hover:underline flex items-center gap-1.5">
                            <LinkIcon className="w-3.5 h-3.5 cv-icon" />
                            <span>{formatUrl(cert.url)}</span>
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
                onClick={() => setIsShareBoxVisible(v => !v)}
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

    </div>
  );
};

export default App;
