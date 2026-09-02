import QRCode from "qrcode";
export type PixKeyType = "phone" | "email" | "cpf" | "cnpj" | "random";

export type PixPayload = {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  transactionId?: string;
  description?: string;
};

function computeCRC16(payload: string): string {
  const polynomial = 0x1021;
  let result = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    result ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((result & 0x8000) !== 0) {
        result = (result << 1) ^ polynomial;
      } else {
        result <<= 1;
      }
    }
  }
  return (result & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function formatEMV(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .substring(0, 25);
}

function formatPixKey(key: string, type: PixKeyType): string {
  if (type === "phone") {
    const clean = key.replace(/\D/g, "");
    return clean.startsWith("55") ? `+${clean}` : `+55${clean}`;
  }
  if (type === "cpf") {
    return key.replace(/\D/g, "");
  }
  if (type === "cnpj") {
    return key.replace(/\D/g, "");
  }
  return key;
}

export function generatePixPayload(data: PixPayload): string {
  const formattedKey = formatPixKey(data.pixKey, data.pixKeyType);
  const merchantName = normalizeText(data.merchantName);
  const merchantCity = normalizeText(data.merchantCity);

  let merchantAccountInfo = formatEMV("00", "br.gov.bcb.pix");
  merchantAccountInfo += formatEMV("01", formattedKey);

  if (data.description) {
    const desc = normalizeText(data.description).substring(0, 72);
    merchantAccountInfo += formatEMV("02", desc);
  }

  let payload = "";

  // Payload Format Indicator (ID 00)
  payload += formatEMV("00", "01");

  // Point of Initiation Method (ID 01)
  payload += formatEMV("01", data.amount ? "12" : "11");

  // Merchant Account Information (ID 26)
  payload += formatEMV("26", merchantAccountInfo);

  // Merchant Category Code (ID 52)
  payload += formatEMV("52", "0000");

  // Transaction Currency (ID 53) — 986 = BRL
  payload += formatEMV("53", "986");

  // Transaction Amount (ID 54) — optional
  if (data.amount && data.amount > 0) {
    payload += formatEMV("54", data.amount.toFixed(2));
  }

  // Country Code (ID 58)
  payload += formatEMV("58", "BR");

  // Merchant Name (ID 59)
  payload += formatEMV("59", merchantName);

  // Merchant City (ID 60)
  payload += formatEMV("60", merchantCity);

  // Additional Data Field Template (ID 62)
  if (data.transactionId) {
    const txId = data.transactionId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
    payload += formatEMV("62", formatEMV("05", txId));
  } else {
    payload += formatEMV("62", formatEMV("05", "*"));
  }

  // CRC16 placeholder + calculation
  payload += "6304";
  const crc = computeCRC16(payload);
  payload = payload.slice(0, -4) + formatEMV("63", crc);

  return payload;
}

export async function getQrCodeDataUrl(pixPayload: string, escuro = "#000000", claro = "#FFFFFF"): Promise<string> {
  if (!pixPayload) return "";

  try {
    return await QRCode.toDataURL(pixPayload, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: escuro, light: claro },
    });
  } catch {
    return "";
  }
}
