import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';

const PDF_PAGE_WIDTH_PT = 595.28;
const PDF_PAGE_HEIGHT_PT = 841.89;
const PDF_MARGIN_PT = 36;
const PDF_HEADER_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
  0x25, 0xff, 0xff, 0xff, 0xff, 0x0a,
]);

const encoder = new TextEncoder();

interface ExportPdfOptions {
  backgroundColor?: string;
}

interface ExportReactNodeOptions extends ExportPdfOptions {
  widthPx?: number;
  className?: string;
  padding?: string;
}

interface PdfPageImage {
  bytes: Uint8Array;
  imageWidthPx: number;
  imageHeightPx: number;
  imageWidthPt: number;
  imageHeightPt: number;
  xPt: number;
  yPt: number;
}

const encodeText = (text: string) => encoder.encode(text);

const decodeDataUrl = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const sanitizePdfFileName = (rawName: string | undefined, fallback = 'markdown-export.pdf') => {
  const trimmed = (rawName || '').trim().replace(/[/\\?%*:|"<>]/g, '-');
  if (!trimmed) return fallback;
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
};

const waitForFonts = async () => {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // Ignore font readiness failures and continue with best effort export.
    }
  }
};

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        img.removeEventListener('load', done);
        img.removeEventListener('error', done);
        resolve();
      };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }));
};

const waitForRenderStability = async (element: HTMLElement) => {
  await waitForFonts();
  await waitForImages(element);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};

const createPdfBlob = (pages: PdfPageImage[]) => {
  const chunks: Uint8Array[] = [PDF_HEADER_BYTES];
  const offsets = new Array(3 + pages.length * 3).fill(0);
  let position = PDF_HEADER_BYTES.length;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    position += bytes.length;
  };

  const pushText = (text: string) => {
    pushBytes(encodeText(text));
  };

  const startObject = (objectId: number) => {
    offsets[objectId] = position;
    pushText(`${objectId} 0 obj\n`);
  };

  const endObject = () => {
    pushText(`\nendobj\n`);
  };

  const pageObjectIds = pages.map((_, index) => 3 + index * 3);

  startObject(1);
  pushText('<< /Type /Catalog /Pages 2 0 R >>');
  endObject();

  startObject(2);
  pushText(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  endObject();

  pages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;

    startObject(pageId);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH_PT.toFixed(2)} ${PDF_PAGE_HEIGHT_PT.toFixed(2)}] ` +
      `/Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    endObject();

    const contentStream =
      `q\n${page.imageWidthPt.toFixed(2)} 0 0 ${page.imageHeightPt.toFixed(2)} ${page.xPt.toFixed(2)} ${page.yPt.toFixed(2)} cm\n` +
      `/Im${index + 1} Do\nQ\n`;
    const contentBytes = encodeText(contentStream);

    startObject(contentId);
    pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushText('endstream');
    endObject();

    startObject(imageId);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${page.imageWidthPx} /Height ${page.imageHeightPx} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    pushBytes(page.bytes);
    pushText('\nendstream');
    endObject();
  });

  const xrefStart = position;
  pushText(`xref\n0 ${offsets.length}\n`);
  pushText('0000000000 65535 f \n');
  for (let objectId = 1; objectId < offsets.length; objectId += 1) {
    pushText(`${String(offsets[objectId]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
};

const downloadPdfBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizePdfFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const exportElementToPdf = async (
  element: HTMLElement,
  fileName: string,
  options: ExportPdfOptions = {},
) => {
  await waitForRenderStability(element);

  const backgroundColor = options.backgroundColor || '#ffffff';
  const width = Math.max(element.scrollWidth, element.clientWidth);
  const height = Math.max(element.scrollHeight, element.clientHeight);

  if (!width || !height) {
    throw new Error('没有可导出的内容');
  }

  const canvas = await html2canvas(element, {
    backgroundColor,
    scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
    useCORS: true,
    allowTaint: true,
    logging: false,
    width,
    height,
    windowWidth: Math.max(document.documentElement.clientWidth, width),
    windowHeight: Math.max(document.documentElement.clientHeight, height),
  });

  if (!canvas.width || !canvas.height) {
    throw new Error('导出画布为空');
  }

  const usableWidthPt = PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT * 2;
  const usableHeightPt = PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT * 2;
  const ptPerPx = usableWidthPt / canvas.width;
  const pageSliceHeightPx = Math.max(1, Math.floor(usableHeightPt / ptPerPx));
  const pages: PdfPageImage[] = [];

  for (let offsetY = 0; offsetY < canvas.height; offsetY += pageSliceHeightPx) {
    const sliceHeightPx = Math.min(pageSliceHeightPx, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;

    const context = pageCanvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建 PDF 页面画布');
    }

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      pageCanvas.width,
      pageCanvas.height,
    );

    const imageHeightPt = sliceHeightPx * ptPerPx;
    pages.push({
      bytes: decodeDataUrl(pageCanvas.toDataURL('image/jpeg', 0.92)),
      imageWidthPx: pageCanvas.width,
      imageHeightPx: pageCanvas.height,
      imageWidthPt: usableWidthPt,
      imageHeightPt,
      xPt: PDF_MARGIN_PT,
      yPt: PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT - imageHeightPt,
    });
  }

  const pdfBlob = createPdfBlob(pages);
  downloadPdfBlob(pdfBlob, fileName);
};

export const exportReactNodeToPdf = async (
  node: React.ReactNode,
  fileName: string,
  options: ExportReactNodeOptions = {},
) => {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${options.widthPx || 960}px`;
  host.style.padding = options.padding || '48px 56px';
  host.style.background = options.backgroundColor || '#ffffff';
  host.style.overflow = 'visible';
  host.style.zIndex = '-1';

  document.body.appendChild(host);
  const root = createRoot(host);

  flushSync(() => {
    root.render(
      <div className={options.className || ''}>
        {node}
      </div>,
    );
  });

  try {
    await exportElementToPdf(host, fileName, options);
  } finally {
    root.unmount();
    host.remove();
  }
};
