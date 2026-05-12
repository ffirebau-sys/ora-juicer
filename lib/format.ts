export function shortenAddress(address: string, headLength = 4, tailLength = 4) {
  if (address.length <= headLength + tailLength) {
    return address;
  }

  return `${address.slice(0, headLength)}...${address.slice(-tailLength)}`;
}

export function formatInteger(value: bigint | number | string | null | undefined, fallback = "--") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "bigint") {
    return formatDigitString(value.toString());
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return formatDigitString(value);
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numericValue);
}

export function formatUnits(
  amount: bigint | number | string | null | undefined,
  decimals: number,
  options: { maximumFractionDigits?: number; fallback?: string } = {}
) {
  const fallback = options.fallback ?? "--";

  if (amount === null || amount === undefined) {
    return fallback;
  }

  const rawAmount = toBigInt(amount);

  if (rawAmount === null) {
    return fallback;
  }

  if (decimals <= 0) {
    return formatInteger(rawAmount, fallback);
  }

  const divisor = powerOfTen(decimals);
  const whole = rawAmount / divisor;
  const fraction = rawAmount % divisor;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const trimmedFraction = fractionText.slice(0, maximumFractionDigits).replace(/0+$/, "");
  const wholeText = formatInteger(whole, fallback);

  return trimmedFraction ? `${wholeText}.${trimmedFraction}` : wholeText;
}

export function formatMicroAlgos(amount: bigint | number | string | null | undefined, fallback = "--") {
  return formatUnits(amount, 6, { maximumFractionDigits: 2, fallback });
}

export function formatRatio(
  numerator: bigint | number | string | null | undefined,
  denominator: bigint | number | string | null | undefined,
  options: { fallback?: string; maximumFractionDigits?: number; minimumFractionDigits?: number } = {}
) {
  const fallback = options.fallback ?? "--";
  const numeratorValue = numerator === null || numerator === undefined ? null : toBigInt(numerator);
  const denominatorValue = denominator === null || denominator === undefined ? null : toBigInt(denominator);
  const maximumFractionDigits = options.maximumFractionDigits ?? 3;
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;

  if (numeratorValue === null || denominatorValue === null || denominatorValue === BigInt(0)) {
    return fallback;
  }

  const scale = powerOfTen(maximumFractionDigits);
  const rounded = (numeratorValue * scale + denominatorValue / BigInt(2)) / denominatorValue;
  const whole = rounded / scale;
  const fraction = rounded % scale;
  const fractionText = fraction.toString().padStart(maximumFractionDigits, "0");
  const trimmedFraction = fractionText.replace(/0+$/, "");
  const paddedFraction = trimmedFraction.padEnd(minimumFractionDigits, "0");

  return `${formatInteger(whole)}.${paddedFraction}`;
}

function toBigInt(value: bigint | number | string) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  }

  if (/^\d+$/.test(value)) {
    return BigInt(value);
  }

  return null;
}

function powerOfTen(exponent: number) {
  let value = BigInt(1);

  for (let index = 0; index < exponent; index += 1) {
    value *= BigInt(10);
  }

  return value;
}

function formatDigitString(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
